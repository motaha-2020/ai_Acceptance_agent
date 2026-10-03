# syntax=docker/dockerfile:1
# Production image for @acceptance/api. Build context = repository root:
#   docker build -f apps/api/Dockerfile -t acceptance/api .
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

# ---------- build: all deps, compile the API and its workspace dependencies ----------
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN pnpm exec turbo run build --filter=@acceptance/api... --concurrency=2 --no-daemon

# ---------- prod: production dependencies only + compiled output ----------
FROM base AS prod
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@acceptance/api..." --store-dir /pnpm/store
# Prisma client + engines for this image's platform (query engine for the app, schema engine for migrate deploy).
RUN cd packages/db && node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma
COPY --from=build /repo/packages/shared/dist    packages/shared/dist
COPY --from=build /repo/packages/checklist/dist packages/checklist/dist
COPY --from=build /repo/packages/db/dist        packages/db/dist
COPY --from=build /repo/packages/storage/dist   packages/storage/dist
COPY --from=build /repo/packages/queue/dist     packages/queue/dist
COPY --from=build /repo/packages/ai/dist        packages/ai/dist
COPY --from=build /repo/apps/worker/dist        apps/worker/dist
COPY --from=build /repo/apps/api/dist           apps/api/dist
# Drop sources, tests and workspaces this image does not run (embedded-postgres stays: @acceptance/db imports it eagerly).
RUN rm -rf tools apps/web apps/mobile packages/report infra docs \
 && find apps packages -mindepth 2 -maxdepth 2 \( -name src -o -name test -o -name eval -o -name scripts -o -name '*.tsbuildinfo' \) -exec rm -rf {} + \
 && find . -name '*.map' -path '*/dist/*' -delete

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 PRISMA_HIDE_UPDATE_MESSAGE=1
WORKDIR /app
COPY --from=prod /repo /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/api/dist/main.js"]
