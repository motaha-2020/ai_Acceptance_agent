# syntax=docker/dockerfile:1
# Production image for @acceptance/web (Next.js standalone server, BFF to the API over the internal network).
# Build context = repository root:
#   docker build -f apps/web/Dockerfile -t acceptance/web .
# Stages: build (filtered install, shared/checklist + next build with output: 'standalone') -> runtime.
# Memory-safe for an 8 GB host: next build heap capped at 2 GB, one workspace at a time.

ARG NODE_IMAGE=node:24-bookworm-slim
ARG PNPM_VERSION=12.8.1

FROM ${NODE_IMAGE} AS build
ARG PNPM_VERSION
ENV CI=true NEXT_TELEMETRY_DISABLED=1
RUN npm install -g pnpm@${PNPM_VERSION} --no-fund --no-audit && npm cache clean --force
WORKDIR /repo
COPY . .
# Only the portal and the two packages it imports (its dev-only workspace links to api/db stay unbuilt).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store \
      --filter @acceptance/web --filter "@acceptance/shared..." --filter "@acceptance/checklist..."
RUN pnpm --filter "@acceptance/checklist..." --workspace-concurrency=1 run build
ENV NODE_OPTIONS=--max-old-space-size=2048 NEXT_STANDALONE=true NODE_ENV=production
RUN pnpm --filter @acceptance/web run build \
 && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static \
 && if [ -d apps/web/public ]; then cp -r apps/web/public apps/web/.next/standalone/apps/web/public; fi

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3001
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone /app
USER node
EXPOSE 3001
# /login is public (the middleware lets it through), so it proves the server renders pages.
HEALTHCHECK --interval=20s --timeout=5s --start-period=30s --retries=4 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/web/server.js"]
