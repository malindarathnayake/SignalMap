#!/bin/sh
set -e

# Docker secrets -> env-var bridge. Mirror of docker/entrypoint.sh:4-12 so
# admin token + LLM keys can flow via `secrets:` blocks in compose without
# leaking into `docker inspect` output as plain env.
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
