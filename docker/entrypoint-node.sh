#!/bin/sh
set -e

# Docker secrets -> env-var bridge for admin token and LLM keys.
# This lets compose `secrets:` blocks avoid plain env values in docker inspect.
if [ -d /run/secrets ]; then
  for secret_file in /run/secrets/*; do
    [ -f "$secret_file" ] || continue
    key=$(basename "$secret_file")
    value=$(cat "$secret_file" | tr -d '\n')
    export "$key"="$value"
  done
fi

ROLE="${1:-}"
case "$ROLE" in
  api|collector|cron) ;;
  *)
    echo "entrypoint-node: missing or invalid role (expected api|collector|cron, got '$ROLE')" >&2
    exit 1
    ;;
esac

exec npm run "start:$ROLE"
