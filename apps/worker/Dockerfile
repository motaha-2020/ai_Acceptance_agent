# syntax=docker/dockerfile:1
# Production image for @acceptance/worker (BullMQ consumer, real AI providers). Build context = repository root:
#   docker build -f apps/worker/Dockerfile -t acceptance/worker .
# Shares its build/prod stage layout with apps/api/Dockerfile, so BuildKit reuses the install layers.
# Stages: build (full install + turbo build) -> prod (prod-only deps + dist + prisma client) -> runtime.
# Memory-safe for an 8 GB host: turbo concurrency 2, tsc heap capped.

ARG NODE_IMAGE=node:24-bookworm-slim
ARG PNPM_VERSION=12.8.1

FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV CI=true PNPM_STORE=/pnpm/store
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@${PNPM_VERSION} --no-fund --no-audit \
 && npm cache clean --force
WORKDIR /repo

# ---------- build: all deps, compile the worker and its workspace dependencies ----------
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN pnpm exec turbo run build --filter=@acceptance/worker... --concurrency=2 --no-daemon

# ---------- prod: production dependencies only + compiled output ----------
FROM base AS prod
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@acceptance/worker..." --store-dir /pnpm/store
# Prisma client + engines for this image's platform (query engine for the app, schema engine for migrate deploy).
RUN cd packages/db && node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma
COPY --from=build /repo/packages/shared/dist    packages/shared/dist
COPY --from=build /repo/packages/checklist/dist packages/checklist/dist
COPY --from=build /repo/packages/db/dist        packages/db/dist
COPY --from=build /repo/packages/storage/dist   packages/storage/dist
COPY --from=build /repo/packages/queue/dist     packages/queue/dist
COPY --from=build /repo/packages/ai/dist        packages/ai/dist
COPY --from=build /repo/apps/worker/dist        apps/worker/dist
# Drop sources, tests and workspaces this image does not run (embedded-postgres stays: @acceptance/db imports it eagerly).
RUN rm -rf tools apps/api apps/web apps/mobile packages/report infra docs \
 && find apps packages -mindepth 2 -maxdepth 2 \( -name src -o -name test -o -name eval -o -name scripts -o -name '*.tsbuildinfo' \) -exec rm -rf {} + \
 && find . -name '*.map' -path '*/dist/*' -delete

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production PRISMA_HIDE_UPDATE_MESSAGE=1 WORKER_HEARTBEAT_FILE=/tmp/worker-heartbeat
WORKDIR /app
COPY --from=prod /repo /app
USER node
# Healthy while the heartbeat (Redis + PostgreSQL reachable) is younger than 60 s.
HEALTHCHECK --interval=20s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "const f=process.env.WORKER_HEARTBEAT_FILE;const s=require('fs').statSync(f);process.exit(Date.now()-s.mtimeMs<60000?0:1)"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/worker/dist/main.js"]
