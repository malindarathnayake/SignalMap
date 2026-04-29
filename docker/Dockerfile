# syntax=docker/dockerfile:1.7

# SignalMap runtime: Vite SignalMap build + local Node API + collector loop.

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --legacy-peer-deps

COPY . .

ARG VITE_VARIANT=signalmap
ARG VITE_WS_API_URL=/api/ws

ENV VITE_VARIANT=${VITE_VARIANT}
ENV VITE_WS_API_URL=${VITE_WS_API_URL}

RUN node docker/build-handlers.mjs
RUN npx tsc && npx vite build

FROM node:22-alpine AS prod-deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --legacy-peer-deps

FROM node:22-alpine AS runtime

RUN apk add --no-cache nginx supervisor gettext && \
    mkdir -p /tmp/nginx-client-body /tmp/nginx-proxy /tmp/nginx-fastcgi \
             /tmp/nginx-uwsgi /tmp/nginx-scgi /var/log/supervisor \
             /data/signalmap/lancedb /data/signalmap/models && \
    addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

ENV NODE_ENV=production
ENV VITE_VARIANT=signalmap
ENV SIGNALMAP_DATA_DIR=/data/signalmap
ENV SIGNALMAP_LANCEDB_URI=/data/signalmap/lancedb
ENV TRANSFORMERS_CACHE=/data/signalmap/models
ENV HF_HOME=/data/signalmap/models
ENV SIGNALMAP_DISTILL_ROOT=/opt/distill
ENV SIGNALMAP_RSS_POLL_MINUTES=15
ENV LOCAL_API_PORT=46123

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/src-tauri/sidecar/local-api-server.mjs ./local-api-server.mjs
COPY --from=builder /app/src-tauri/sidecar/package.json ./package.json
COPY --from=builder /app/api ./api
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/data ./data
COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/nginx.conf.template
COPY docker/supervisord.conf /etc/supervisor/conf.d/signalmap.conf
COPY docker/entrypoint.sh /app/entrypoint.sh

RUN chmod +x /app/entrypoint.sh && \
    chown -R appuser:appgroup /app /data/signalmap /tmp/nginx-client-body /tmp/nginx-proxy \
      /tmp/nginx-fastcgi /tmp/nginx-uwsgi /tmp/nginx-scgi /var/log/supervisor \
      /var/lib/nginx /var/log/nginx

USER appuser

VOLUME ["/data/signalmap/lancedb", "/data/signalmap/models"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

CMD ["/app/entrypoint.sh"]
