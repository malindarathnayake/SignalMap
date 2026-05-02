#!/usr/bin/env bash
# sanitize-env.sh — diagnose and clean a Docker Compose .env file.
#
# Why this exists: SFTP from Windows / paste through Word / browser copy can
# leave UTF-8 BOMs, CRLF line endings, smart quotes, non-breaking spaces, and
# trailing whitespace inside .env values. API keys with even one invisible
# byte appended fail with cryptic errors like OpenRouter's
# "User not found" 401.
#
# What it does:
#   1. Reports the current state of the file (encoding, BOM, CRLF, weird
#      Unicode in values, trailing whitespace, var count).
#   2. Backs up the existing file to .env.bak.YYYYMMDD-HHMMSS (mode 600).
#   3. Strips UTF-8 BOM from the first line if present.
#   4. Converts CRLF -> LF.
#   5. Strips trailing whitespace from each line.
#   6. Warns (but does NOT auto-edit) any line where the value contains
#      non-ASCII bytes — those are likely smart quotes / NBSP / zero-width
#      chars that snuck in via a copy-paste, and the operator should retype
#      the value rather than have a script silently rewrite it.
#   7. Re-reports the state and prints a side-by-side summary of changes.
#
# Usage:
#   ./sanitize-env.sh             # operate on ./.env
#   ./sanitize-env.sh path/to/.env
#
# Safe to re-run; produces a fresh backup each invocation.
# Requires: bash 4+, coreutils (cat, head, wc, stat), sed, grep, file.

set -euo pipefail

# ─── Style helpers ──────────────────────────────────────────────────────────

if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
  C_RED=$(tput setaf 1)
  C_GREEN=$(tput setaf 2)
  C_YELLOW=$(tput setaf 3)
  C_CYAN=$(tput setaf 6)
  C_BOLD=$(tput bold)
  C_RESET=$(tput sgr0)
else
  C_RED=""; C_GREEN=""; C_YELLOW=""; C_CYAN=""; C_BOLD=""; C_RESET=""
fi

heading()  { printf '\n%s%s===  %s  ===%s\n' "$C_BOLD" "$C_CYAN" "$1" "$C_RESET"; }
ok()       { printf '  %s✓%s %s\n' "$C_GREEN" "$C_RESET" "$1"; }
warn()     { printf '  %s!%s %s\n' "$C_YELLOW" "$C_RESET" "$1"; }
bad()      { printf '  %s✗%s %s\n' "$C_RED" "$C_RESET" "$1"; }
note()     { printf '    %s\n' "$1"; }

# ─── Args ───────────────────────────────────────────────────────────────────

ENV_FILE="${1:-.env}"

if [ ! -f "$ENV_FILE" ]; then
  bad "File not found: $ENV_FILE"
  exit 2
fi
if [ ! -w "$ENV_FILE" ]; then
  bad "File not writable: $ENV_FILE"
  exit 2
fi

# ─── Inspector — pure read, no mutation ─────────────────────────────────────
# Sets globals: STATUS_BOM, STATUS_CRLF, STATUS_TRAILING, STATUS_NONASCII,
#               STATUS_VARS, STATUS_SIZE, STATUS_LINES.

inspect() {
  local f="$1"
  STATUS_SIZE=$(stat -c '%s' "$f" 2>/dev/null || stat -f '%z' "$f")
  STATUS_LINES=$(wc -l < "$f" | tr -d ' ')
  STATUS_VARS=$(grep -cE '^[A-Z][A-Z0-9_]*=' "$f" || true)

  # BOM = first three bytes are EF BB BF
  if head -c 3 "$f" | od -An -tx1 | tr -d ' \n' | grep -q '^efbbbf'; then
    STATUS_BOM=1
  else
    STATUS_BOM=0
  fi

  # CRLF lines = grep for CR before EOL
  STATUS_CRLF=$(grep -cP '\r$' "$f" 2>/dev/null || true)
  STATUS_CRLF=${STATUS_CRLF:-0}

  # Trailing whitespace (space or tab) before EOL on a key=value line
  STATUS_TRAILING=$(grep -cE '^[A-Z][A-Z0-9_]*=.*[[:space:]]$' "$f" 2>/dev/null || true)
  STATUS_TRAILING=${STATUS_TRAILING:-0}

  # Lines that are key=value AND contain bytes outside printable ASCII (0x20-0x7E)
  # in the VALUE part. We exclude pure-comment and blank lines. perl is more
  # forgiving than awk for byte-level inspection.
  if command -v perl >/dev/null 2>&1; then
    STATUS_NONASCII=$(perl -ne '
      next if /^\s*#/ || /^\s*$/;
      next unless /^[A-Z][A-Z0-9_]*=(.*)$/;
      my $v = $1;
      $v =~ s/\r$//;
      print "$_" if $v =~ /[^\x20-\x7e]/;
    ' "$f" | wc -l | tr -d ' ')
  else
    STATUS_NONASCII=0
  fi
}

report_status() {
  local label="$1"
  heading "$label state"
  note "size:     $STATUS_SIZE bytes"
  note "lines:    $STATUS_LINES"
  note "vars:     $STATUS_VARS"
  note "encoding: $(file -b "$ENV_FILE")"
  if [ "$STATUS_BOM" -eq 1 ]; then bad "UTF-8 BOM at start of file"; else ok "no BOM"; fi
  if [ "$STATUS_CRLF" -gt 0 ]; then bad "$STATUS_CRLF line(s) end with CRLF"; else ok "no CRLF lines"; fi
  if [ "$STATUS_TRAILING" -gt 0 ]; then bad "$STATUS_TRAILING line(s) have trailing whitespace"; else ok "no trailing whitespace"; fi
  if [ "$STATUS_NONASCII" -gt 0 ]; then
    warn "$STATUS_NONASCII line(s) contain non-ASCII bytes in their VALUE — likely smart quotes, NBSP, or zero-width spaces. Listing keys (values redacted):"
    if command -v perl >/dev/null 2>&1; then
      perl -ne '
        next if /^\s*#/ || /^\s*$/;
        next unless /^([A-Z][A-Z0-9_]*)=(.*)$/;
        my ($k, $v) = ($1, $2);
        $v =~ s/\r$//;
        if ($v =~ /[^\x20-\x7e]/) {
          print "      - $k\n";
        }
      ' "$ENV_FILE"
    fi
  else
    ok "all values are pure ASCII"
  fi
}

# ─── Pre-flight ─────────────────────────────────────────────────────────────

heading "Inspecting $ENV_FILE"
inspect "$ENV_FILE"

PRE_BOM=$STATUS_BOM
PRE_CRLF=$STATUS_CRLF
PRE_TRAILING=$STATUS_TRAILING
PRE_NONASCII=$STATUS_NONASCII
PRE_SIZE=$STATUS_SIZE
PRE_LINES=$STATUS_LINES

report_status "Before"

# Bail-out fast path: nothing to clean, no backup churn.
if [ "$PRE_BOM" -eq 0 ] && [ "$PRE_CRLF" -eq 0 ] && [ "$PRE_TRAILING" -eq 0 ] && [ "$PRE_NONASCII" -eq 0 ]; then
  printf '\n%s%sNothing to do — file is already clean.%s\n' "$C_BOLD" "$C_GREEN" "$C_RESET"
  exit 0
fi

# ─── Backup ─────────────────────────────────────────────────────────────────

heading "Backing up"
TS=$(date +'%Y%m%d-%H%M%S')
BACKUP="${ENV_FILE}.bak.${TS}"
cp -p "$ENV_FILE" "$BACKUP"
chmod 600 "$BACKUP" || true
ok "saved $BACKUP ($(stat -c '%s' "$BACKUP" 2>/dev/null || stat -f '%z' "$BACKUP") bytes, mode 600)"

# ─── Sanitize ───────────────────────────────────────────────────────────────

heading "Sanitizing"

# Work on a tempfile in the same directory so a final atomic rename never
# crosses filesystems and never leaves a partial file behind.
TMP="${ENV_FILE}.sanitize.$$"
trap 'rm -f "$TMP"' EXIT

# Pipeline:
#   1. sed strips the leading UTF-8 BOM (only if present on line 1).
#   2. tr -d '\r' removes CR bytes anywhere — covers CRLF and stray CR.
#   3. sed strips trailing tabs/spaces before EOL, leaving \n intact.
#
# Order matters: BOM strip must happen before any line transform so it is
# scoped to byte 0-2 of the file, not byte 0 of every line.

sed '1s/^\xEF\xBB\xBF//' "$ENV_FILE" \
  | tr -d '\r' \
  | sed -E 's/[[:space:]]+$//' \
  > "$TMP"

# Atomic replace.
mv "$TMP" "$ENV_FILE"
trap - EXIT

# Restore mode if backup tells us what it was.
chmod --reference="$BACKUP" "$ENV_FILE" 2>/dev/null || chmod 600 "$ENV_FILE"

ok "BOM strip, CRLF -> LF, trailing-whitespace strip applied"

# ─── Re-inspect ─────────────────────────────────────────────────────────────

inspect "$ENV_FILE"
report_status "After"

# ─── Summary ────────────────────────────────────────────────────────────────

heading "Summary"
printf '  %-22s %s -> %s\n' "size (bytes)"        "$PRE_SIZE"     "$STATUS_SIZE"
printf '  %-22s %s -> %s\n' "lines"               "$PRE_LINES"    "$STATUS_LINES"
printf '  %-22s %s -> %s\n' "BOM present"         "$PRE_BOM"      "$STATUS_BOM"
printf '  %-22s %s -> %s\n' "CRLF lines"          "$PRE_CRLF"     "$STATUS_CRLF"
printf '  %-22s %s -> %s\n' "trailing-ws lines"   "$PRE_TRAILING" "$STATUS_TRAILING"
printf '  %-22s %s -> %s\n' "non-ASCII values"    "$PRE_NONASCII" "$STATUS_NONASCII"

if [ "$STATUS_NONASCII" -gt 0 ]; then
  printf '\n%s%sManual action required:%s the keys listed above still contain\n' "$C_BOLD" "$C_YELLOW" "$C_RESET"
  printf 'non-ASCII bytes inside their values. This script will not silently\n'
  printf 'overwrite secret material. Edit the file and retype each value\n'
  printf "(don't paste from a browser/Word/clipboard manager that may have\n"
  printf 'inserted smart quotes or non-breaking spaces).\n\n'
  printf 'After editing, re-run this script to confirm the file is clean,\n'
  printf 'then recreate the affected containers:\n'
  printf '  docker compose up -d --force-recreate signalmap-api signalmap-collector signalmap-cron\n'
  exit 3
fi

printf '\n%s%sFile sanitized.%s Backup: %s\n' "$C_BOLD" "$C_GREEN" "$C_RESET" "$BACKUP"
printf 'Recreate containers so they read the cleaned env:\n'
printf '  docker compose up -d --force-recreate signalmap-api signalmap-collector signalmap-cron\n'
