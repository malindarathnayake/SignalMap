#!/usr/bin/env bash
# test-env-keys.sh — smoke-test every API key in a Compose .env file by
# making the cheapest possible verification call to its provider.
#
# Why this exists: a key can be byte-clean in the file (no BOM, no CRLF,
# pure ASCII — see sanitize-env.sh) and still be rejected upstream because
# it's been deleted, rolled, or never existed. This script catches the
# upstream-side failure separately from the file-encoding side.
#
# Per-provider checks:
#   OPENROUTER_API_KEY    GET  /api/v1/auth/key            (free, no spend)
#   PERPLEXITY_API_KEY    POST /chat/completions max_tokens=8 (~$0.0001)
#   NEWSAPI_API_KEY       GET  /v2/sources?language=en      (free, ~1 of 100/day)
#   CLOUDFLARE_API_TOKEN  GET  /client/v4/user/tokens/verify (free)
#   SIGNALMAP_ADMIN_TOKEN local-only — verified for non-empty/length only
#   REDIS_PASSWORD        local-only — same; not an API key
#
# Per-key states:
#   ok       upstream confirmed the key works
#   fail     upstream rejected (HTTP 4xx) — message printed
#   network  request didn't complete (DNS / TLS / timeout)
#   unset    not present in .env (treated as skipped, not an error)
#
# Output never echoes the key value. Provider error bodies are printed
# verbatim because they're often the most useful diagnostic ("User not
# found", "Daily limit exceeded", "Invalid token").
#
# Usage:
#   ./test-env-keys.sh               # operate on ./.env
#   ./test-env-keys.sh path/to/.env
#
# Exit code: 0 when every present key passes, non-zero count of failures
# otherwise. unset keys do not contribute to the failure count.

set -uo pipefail

# ─── Style ──────────────────────────────────────────────────────────────────

if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
  C_RED=$(tput setaf 1); C_GREEN=$(tput setaf 2); C_YELLOW=$(tput setaf 3)
  C_GREY=$(tput setaf 8 2>/dev/null || tput setaf 7)
  C_CYAN=$(tput setaf 6); C_BOLD=$(tput bold); C_RESET=$(tput sgr0)
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_GREY=""; C_CYAN=""; C_BOLD=""; C_RESET=""
fi

heading() { printf '\n%s%s===  %s  ===%s\n' "$C_BOLD" "$C_CYAN" "$1" "$C_RESET"; }
result_ok()      { printf '  %s✓ ok%s       %-22s %s\n' "$C_GREEN"  "$C_RESET" "$1" "$2"; }
result_fail()    { printf '  %s✗ fail%s     %-22s %s\n' "$C_RED"    "$C_RESET" "$1" "$2"; }
result_network() { printf '  %s? network%s  %-22s %s\n' "$C_YELLOW" "$C_RESET" "$1" "$2"; }
result_unset()   { printf '  %s- unset%s    %-22s %s\n' "$C_GREY"   "$C_RESET" "$1" "$2"; }

# ─── Args + env load ────────────────────────────────────────────────────────

ENV_FILE="${1:-.env}"
if [ ! -f "$ENV_FILE" ]; then
  printf '%s✗ env file not found: %s%s\n' "$C_RED" "$ENV_FILE" "$C_RESET"
  exit 2
fi
if [ ! -r "$ENV_FILE" ]; then
  printf '%s✗ env file not readable: %s (need sudo?)%s\n' "$C_RED" "$ENV_FILE" "$C_RESET"
  exit 2
fi

# Read a value from the .env without sourcing the file (sourcing executes
# code, which is a footgun for any line that happens to look like a shell
# call). Strip surrounding quotes if present.
get_env() {
  local key="$1"
  local line
  line=$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1) || true
  [ -n "$line" ] || { echo ""; return; }
  local value="${line#${key}=}"
  # Strip matching surrounding quotes (single or double)
  if [[ "$value" =~ ^\"(.*)\"$ ]]; then value="${BASH_REMATCH[1]}"; fi
  if [[ "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
  printf '%s' "$value"
}

OPENROUTER_API_KEY=$(get_env OPENROUTER_API_KEY)
OPENROUTER_BASE_URL=$(get_env OPENROUTER_BASE_URL)
OPENROUTER_BASE_URL=${OPENROUTER_BASE_URL:-https://openrouter.ai/api/v1}
PERPLEXITY_API_KEY=$(get_env PERPLEXITY_API_KEY)
NEWSAPI_API_KEY=$(get_env NEWSAPI_API_KEY)
CLOUDFLARE_API_TOKEN=$(get_env CLOUDFLARE_API_TOKEN)
SIGNALMAP_ADMIN_TOKEN=$(get_env SIGNALMAP_ADMIN_TOKEN)
REDIS_PASSWORD=$(get_env REDIS_PASSWORD)

# Resolve a usable Python interpreter once; some hosts ship python3,
# Git Bash / older RHEL ship python. Empty when neither exists, in which
# case we degrade to raw-body printing instead of structured field extraction.
PY=""
if command -v python3 >/dev/null 2>&1; then PY=python3
elif command -v python >/dev/null 2>&1; then PY=python
fi

# Extract a top-level JSON field as a string. Returns empty on parse error
# or when PY is unavailable. Caller is responsible for fallback.
json_field() {
  local file="$1" expr="$2"
  [ -n "$PY" ] || return 0
  "$PY" -c "
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    print(${expr})
except Exception:
    pass
" "$file" 2>/dev/null
}

# Print the first ~120 chars of the response body, single-lined. Used as a
# fallback when structured parsing is unavailable or the response isn't JSON.
raw_excerpt() {
  tr -d '\n' < "$1" | cut -c1-120
}

# Counters
PASS=0
FAIL=0
SKIP=0

# Tempfiles for response capture; cleaned on exit so error bodies that
# happen to contain the leaked key aren't left on disk.
RESP_BODY=$(mktemp)
trap 'rm -f "$RESP_BODY"' EXIT

# ─── Provider tests ─────────────────────────────────────────────────────────

heading "Testing API keys in $ENV_FILE"

# OpenRouter — /auth/key returns key metadata without spending credits.
test_openrouter() {
  local label="OPENROUTER_API_KEY"
  if [ -z "$OPENROUTER_API_KEY" ]; then
    result_unset "$label" "(not set in .env)"
    SKIP=$((SKIP+1))
    return
  fi
  local code
  code=$(curl -sS -o "$RESP_BODY" -w '%{http_code}' -m 10 \
    -H "Authorization: Bearer ${OPENROUTER_API_KEY}" \
    "${OPENROUTER_BASE_URL%/}/auth/key" 2>/dev/null) || code=000
  case "$code" in
    200)
      local label_value
      label_value=$(json_field "$RESP_BODY" 'f"limit_remaining={d.get(\"data\",{}).get(\"limit_remaining\",\"?\")} usage={d.get(\"data\",{}).get(\"usage\",\"?\")} is_free={d.get(\"data\",{}).get(\"is_free_tier\",\"?\")}"')
      [ -n "$label_value" ] || label_value="200 OK"
      result_ok "$label" "$label_value"
      PASS=$((PASS+1))
      ;;
    000)
      result_network "$label" "could not reach ${OPENROUTER_BASE_URL%/}/auth/key"
      FAIL=$((FAIL+1))
      ;;
    *)
      local msg
      msg=$(json_field "$RESP_BODY" 'd.get("error",{}).get("message","")')
      [ -n "$msg" ] || msg=$(raw_excerpt "$RESP_BODY")
      result_fail "$label" "HTTP $code — ${msg:0:120}"
      FAIL=$((FAIL+1))
      ;;
  esac
}

# Perplexity — minimal completion call. No free verify endpoint exists.
# Use max_tokens=8 + a one-character prompt to keep cost ~$0.00005.
test_perplexity() {
  local label="PERPLEXITY_API_KEY"
  if [ -z "$PERPLEXITY_API_KEY" ]; then
    result_unset "$label" "(not set in .env)"
    SKIP=$((SKIP+1))
    return
  fi
  local code
  code=$(curl -sS -o "$RESP_BODY" -w '%{http_code}' -m 15 \
    -H "Authorization: Bearer ${PERPLEXITY_API_KEY}" \
    -H "Content-Type: application/json" \
    -d '{"model":"sonar-pro","max_tokens":8,"messages":[{"role":"user","content":"."}]}' \
    "https://api.perplexity.ai/chat/completions" 2>/dev/null) || code=000
  case "$code" in
    200)
      result_ok "$label" "completion 200"
      PASS=$((PASS+1))
      ;;
    000)
      result_network "$label" "could not reach api.perplexity.ai"
      FAIL=$((FAIL+1))
      ;;
    *)
      local msg
      msg=$(json_field "$RESP_BODY" 'd.get("error",{}).get("message","") if isinstance(d.get("error",{}),dict) else (d.get("error","") or d.get("detail",""))')
      [ -n "$msg" ] || msg=$(raw_excerpt "$RESP_BODY")
      result_fail "$label" "HTTP $code — ${msg:0:120}"
      FAIL=$((FAIL+1))
      ;;
  esac
}

# NewsAPI — /v2/sources is a free GET that doesn't draw from the request
# quota for paid plans and is one of 100/day on the free dev plan.
test_newsapi() {
  local label="NEWSAPI_API_KEY"
  if [ -z "$NEWSAPI_API_KEY" ]; then
    result_unset "$label" "(not set in .env)"
    SKIP=$((SKIP+1))
    return
  fi
  local code
  code=$(curl -sS -o "$RESP_BODY" -w '%{http_code}' -m 10 \
    -H "X-Api-Key: ${NEWSAPI_API_KEY}" \
    "https://newsapi.org/v2/sources?language=en" 2>/dev/null) || code=000
  case "$code" in
    200)
      local count
      count=$(json_field "$RESP_BODY" 'len(d.get("sources",[]))')
      [ -n "$count" ] || count="?"
      result_ok "$label" "${count} sources visible"
      PASS=$((PASS+1))
      ;;
    000)
      result_network "$label" "could not reach newsapi.org"
      FAIL=$((FAIL+1))
      ;;
    *)
      local msg
      msg=$(json_field "$RESP_BODY" 'd.get("message","")')
      [ -n "$msg" ] || msg=$(raw_excerpt "$RESP_BODY")
      result_fail "$label" "HTTP $code — ${msg:0:120}"
      FAIL=$((FAIL+1))
      ;;
  esac
}

# Cloudflare — official token verify endpoint; returns active/disabled state.
test_cloudflare() {
  local label="CLOUDFLARE_API_TOKEN"
  if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    result_unset "$label" "(not set in .env)"
    SKIP=$((SKIP+1))
    return
  fi
  local code
  code=$(curl -sS -o "$RESP_BODY" -w '%{http_code}' -m 10 \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    "https://api.cloudflare.com/client/v4/user/tokens/verify" 2>/dev/null) || code=000
  case "$code" in
    200)
      local status
      status=$(json_field "$RESP_BODY" 'd.get("result",{}).get("status","unknown")')
      [ -n "$status" ] || status="unknown"
      if [ "$status" = "active" ]; then
        result_ok "$label" "token status=$status"
        PASS=$((PASS+1))
      else
        result_fail "$label" "token status=$status (not active)"
        FAIL=$((FAIL+1))
      fi
      ;;
    000)
      result_network "$label" "could not reach api.cloudflare.com"
      FAIL=$((FAIL+1))
      ;;
    *)
      local msg
      msg=$(json_field "$RESP_BODY" 'd.get("errors",[{}])[0].get("message","") if d.get("errors") else ""')
      [ -n "$msg" ] || msg=$(raw_excerpt "$RESP_BODY")
      result_fail "$label" "HTTP $code — ${msg:0:120}"
      FAIL=$((FAIL+1))
      ;;
  esac
}

# Local-only secrets — can't talk to a third party. Just confirm presence
# and length so a forgotten / blank value gets surfaced.
test_local() {
  local label="$1"
  local value="$2"
  local min_len="${3:-16}"
  if [ -z "$value" ]; then
    result_unset "$label" "(not set in .env)"
    SKIP=$((SKIP+1))
    return
  fi
  local len=${#value}
  if [ "$len" -lt "$min_len" ]; then
    result_fail "$label" "value too short — ${len} chars, expected ≥ ${min_len}"
    FAIL=$((FAIL+1))
  else
    result_ok "$label" "set, ${len} chars (local-only, no upstream check)"
    PASS=$((PASS+1))
  fi
}

# ─── Run tests ──────────────────────────────────────────────────────────────

test_openrouter
test_perplexity
test_newsapi
test_cloudflare
test_local "SIGNALMAP_ADMIN_TOKEN" "$SIGNALMAP_ADMIN_TOKEN" 16
test_local "REDIS_PASSWORD"        "$REDIS_PASSWORD"        12

# ─── Summary ────────────────────────────────────────────────────────────────

heading "Summary"
printf '  %s%d passed%s · %s%d failed%s · %s%d unset%s\n' \
  "$C_GREEN" "$PASS" "$C_RESET" \
  "$C_RED"   "$FAIL" "$C_RESET" \
  "$C_GREY"  "$SKIP" "$C_RESET"

if [ "$FAIL" -gt 0 ]; then
  printf '\n%s%sNext steps:%s\n' "$C_BOLD" "$C_YELLOW" "$C_RESET"
  printf '  - rotate any failed key at the provider, paste fresh into .env on this host\n'
  printf '  - re-run scripts/ops/sanitize-env.sh to confirm no encoding regressions\n'
  printf '  - docker compose up -d --force-recreate signalmap-api signalmap-collector signalmap-cron\n'
fi

exit "$FAIL"
