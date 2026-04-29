#!/bin/sh
set -e

# Docker secrets -> env var bridge. Secret file names become env var names.
if [ -d /run/secrets ]; then
  for secret_file in /run/secrets/*; do
    [ -f "$secret_file" ] || continue
    key=$(basename "$secret_file")
    value=$(cat "$secret_file" | tr -d '\n')
    export "$key"="$value"
  done
fi

export LOCAL_API_PORT="${LOCAL_API_PORT:-46123}"
export SIGNALMAP_DATA_DIR="${SIGNALMAP_DATA_DIR:-/data/signalmap}"
export SIGNALMAP_LANCEDB_URI="${SIGNALMAP_LANCEDB_URI:-${SIGNALMAP_DATA_DIR}/lancedb}"
export TRANSFORMERS_CACHE="${TRANSFORMERS_CACHE:-${SIGNALMAP_DATA_DIR}/models}"
export HF_HOME="${HF_HOME:-${SIGNALMAP_DATA_DIR}/models}"
export SIGNALMAP_DISTILL_ROOT="${SIGNALMAP_DISTILL_ROOT:-/opt/distill}"
export SIGNALMAP_RSS_POLL_MINUTES="${SIGNALMAP_RSS_POLL_MINUTES:-15}"
case "$SIGNALMAP_RSS_POLL_MINUTES" in
  ''|*[!0-9]*) SIGNALMAP_RSS_POLL_MINUTES=15 ;;
esac
export SIGNALMAP_RSS_POLL_SECONDS="${SIGNALMAP_RSS_POLL_SECONDS:-$((SIGNALMAP_RSS_POLL_MINUTES * 60))}"

mkdir -p "$SIGNALMAP_DATA_DIR" "$TRANSFORMERS_CACHE" "$HF_HOME"
mkdir -p "$SIGNALMAP_LANCEDB_URI"

envsubst '$LOCAL_API_PORT' < /etc/nginx/nginx.conf.template > /tmp/nginx.conf

exec /usr/bin/supervisord -c /etc/supervisor/conf.d/signalmap.conf
