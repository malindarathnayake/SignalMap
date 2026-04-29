# syntax=docker/dockerfile:1.7
# SignalMap production image: Vite static build → nginx.
#
# Backend is intentionally not included in this image — the SPA boots
# against the new fixture middleware on /api/* in dev. In production we
# expect a separate API service (Phase 9c left this slot open). Until
# that lands, the image serves the static bundle and the UI runs against
# its in-memory seed data; brief / SSE features degrade gracefully.

FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps --ignore-scripts

COPY . .

# Skip tsc; runtime.ts has dynamic imports of @/services/tauri-bridge
# which were archived in 9a, but nothing imports runtime.ts in the
# SignalMap surface so vite tree-shakes it out cleanly.
RUN npx vite build

# Bake dev fixture responses into dist/api/ so the static image can
# serve a working demo (events, source health, briefs) without a
# Node backend.
RUN npx tsx scripts/bake-fixtures.mjs

FROM nginx:1.27-alpine AS runtime

RUN apk add --no-cache curl && \
    mkdir -p /tmp/nginx-client-body /tmp/nginx-proxy /tmp/nginx-fastcgi \
             /tmp/nginx-uwsgi /tmp/nginx-scgi && \
    addgroup -S appgroup 2>/dev/null || true && \
    adduser -S appuser -G appgroup 2>/dev/null || true

COPY --from=builder /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Make nginx + temp dirs writable by the non-root user we'll switch to.
# Some paths (var/lib/nginx, var/cache/nginx) only exist on certain nginx
# image variants — chown is best-effort.
RUN for p in /usr/share/nginx/html /tmp/nginx-client-body /tmp/nginx-proxy \
             /tmp/nginx-fastcgi /tmp/nginx-uwsgi /tmp/nginx-scgi \
             /var/log/nginx /var/lib/nginx /var/cache/nginx; do \
      [ -e "$p" ] && chown -R appuser:appgroup "$p" || true; \
    done

USER appuser

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
