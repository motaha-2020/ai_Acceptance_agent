# Infra: production on one Hetzner VPS

Server: Hetzner CPX32-class (4 vCPU / 8 GB / 150 GB), Ubuntu 26.04, Falkenstein, `178.104.221.75`.
Access: `ssh -i ~/.ssh/acceptance_hetzner_ed25519 deploy@178.104.221.75` (keys only, no root login;
`deploy` has passwordless sudo and is in the `docker` group). ufw allows 22/80/443 only.

```
Internet ──80/443──> caddy ──> api:3000            (REST, /health, /api/v1/*)
                        └────> minio:9000           (GET/HEAD /<bucket>/* = presigned photo URLs only)
           api ──> postgres:5432, redis:6379, minio:9000     ("data" network: internal, no egress)
           worker ──> postgres, redis, minio + HTTPS to AI vendors ("egress" network)
```

| File | Purpose |
|---|---|
| `docker-compose.prod.yml` | caddy, api, worker, postgres 16, redis 7, minio, minio-init (bucket + least-privilege app user) |
| `Caddyfile` | reverse proxy; `:80` without a domain, automatic HTTPS when `DOMAIN` is set |
| `../apps/api/Dockerfile`, `../apps/worker/Dockerfile` | multi-stage, prod deps only, non-root `node`, tini, healthchecks |
| `scripts/deploy.sh` | idempotent deploy (sync, build, migrate, seed, up, health check, auto-rollback) |
| `scripts/rollback.sh` | switch api/worker to an earlier image version |
| `scripts/backup.sh` + `systemd/acceptance-backup.{service,timer}` | daily pg_dump + MinIO mirror, 7 days of dumps |
| `scripts/logs.sh` | follow logs (on the server or via ssh from the dev machine) |
| `scripts/init-secrets.sh`, `set-env.sh`, `push-ai-keys.sh` | secrets bootstrap / updates without printing values |
| `docker-compose.dev.yml` | local dev datastores (not used on the server) |

Only **caddy publishes ports**. Docker inserts its own iptables rules ahead of ufw, so a `ports:` entry on any
other service would be reachable from the Internet even though ufw "denies" it. PostgreSQL/Redis/MinIO
have no published ports; do not add any (use `docker compose exec` or an ssh tunnel to a temporary
container if you need a client).

## Server layout

```
/opt/acceptance/.env            all settings + secrets (chmod 600, owner deploy). Never commit, never cat in shared logs.
/opt/acceptance/ADMIN_PASSWORD  seed admin password (admin@acceptance.local), chmod 600
/opt/acceptance/release.env     APP_VERSION of the running api/worker images
/opt/acceptance/releases.log    deploy history (<utc> <version>)
/opt/acceptance/app             current source (app.prev = previous sync)
/opt/acceptance/backups         postgres/*.dump (7 days) + minio/<bucket> mirror
```

Secrets are generated on the server by `init-secrets.sh` (missing keys only, existing values never
change): PostgreSQL, Redis, MinIO root + a separate least-privilege MinIO app key, JWT and signing
secrets, admin password. AI keys are copied from the local `.env` with `push-ai-keys.sh` (stdin over ssh).

Read a value without echoing others: `grep '^AI_PROVIDER=' /opt/acceptance/.env`.
Change a value: `printf 'AI_DAILY_BUDGET_USD=30\n' | bash /opt/acceptance/app/infra/scripts/set-env.sh`, then
`infra/scripts/deploy.sh --restart worker api` from the dev machine.

## Deploy

From the dev machine, repo root (Git Bash):

```bash
infra/scripts/deploy.sh                    # full deploy of the working tree
infra/scripts/deploy.sh --restart worker   # recreate services only (after an .env change)
```

What it does (all steps idempotent):
1. `git ls-files` (tracked + untracked-not-ignored) -> tar over ssh -> `/opt/acceptance/app`
   (node_modules, dist, `data/`, `.env`, credential files are never sent).
2. `init-secrets.sh` (no-op once secrets exist).
3. Builds `acceptance/api:<version>` then `acceptance/worker:<version>` on the server, one at a time
   (turbo concurrency 2, tsc heap 1.5 GB; BuildKit pnpm-store cache keeps rebuilds fast).
   `<version>` = `<utc>-<git sha>[-dirty]`.
4. Starts postgres/redis/minio, runs `minio-init`, `prisma migrate deploy`, the idempotent seed.
5. `up -d --wait` api/worker/caddy, checks `http://127.0.0.1/health` and `/health/ready` through Caddy.
   On failure it prints logs and switches back to the previous version automatically.
6. Records the version, installs/refreshes the backup timer, keeps the last 3 image versions.

First install on a fresh server: `deploy.sh --sync-only` (creates `/opt/acceptance/.env`), then
`push-ai-keys.sh`, then `deploy.sh`. The server needs Docker + compose v2 + `docker-buildx`.

AI selection (worker): `AI_PROVIDER=claude|gemini|openai|cascade` (+ optional `AI_MODEL` for single
providers; `cascade` = `DEFAULT_CASCADE` from `@acceptance/ai`, Gemini Flash -> Claude Sonnet 5.5).
Currently `claude` / `claude-sonnet-5-5` (Gemini billing not enabled). `fake` is refused in production.
Daily spend cap: `AI_DAILY_BUDGET_USD` (photos go to human review without AI once reached).

## Operate

```bash
infra/scripts/logs.sh worker                     # from the dev machine (ssh) or on the server
ssh ... 'cd /opt/acceptance/app && . infra/scripts/lib.sh && dc ps'      # status (dc = compose wrapper)
ssh ... '. /opt/acceptance/app/infra/scripts/lib.sh && dc exec postgres psql -U acceptance acceptance'
curl http://178.104.221.75/health                # liveness via Caddy
curl http://178.104.221.75/health/ready          # db + storage + queue
```

## Rollback

```bash
ssh ... 'bash /opt/acceptance/app/infra/scripts/rollback.sh'            # previous deploy
ssh ... 'bash /opt/acceptance/app/infra/scripts/rollback.sh <version>'  # any of the last 3 (docker images acceptance/api)
```

Only the api/worker images change. Migrations are forward-only: if the release you leave added a
migration that the old code cannot live with, restore the pre-deploy backup instead (run
`backup.sh` before risky deploys).

## Backups

`acceptance-backup.timer` runs `backup.sh` daily at 02:30 UTC (+ up to 15 min jitter, catches up after
downtime). Check: `systemctl list-timers acceptance-backup.timer`, `journalctl -u acceptance-backup`.
Manual run: `bash /opt/acceptance/app/infra/scripts/backup.sh`.

- `backups/postgres/acceptance-<utc>.dump`: `pg_dump -Fc`, older than 7 days deleted.
- `backups/minio/<bucket>/`: incremental `mc mirror` of the photo bucket; objects deleted in MinIO are kept.

Backups currently live on the same disk. Next step: enable Hetzner server backups and/or copy
`/opt/acceptance/backups` to a Storage Box (`rsync -e 'ssh -p23'`), plus keep a copy of `/opt/acceptance/.env`
somewhere safe (without it the MinIO/DB credentials must be reset).

## Restore from backup

```bash
. /opt/acceptance/app/infra/scripts/lib.sh
dc stop api worker                                           # no writes during restore
# 1. database (drops and recreates objects from the dump)
dump=$(ls -1t /opt/acceptance/backups/postgres/*.dump | head -1)
dc exec -T postgres pg_restore -U acceptance -d acceptance --clean --if-exists --no-owner < "$dump"
# 2. photos (copies the mirror back into the bucket)
MC_HOST_dst="http://$(env_get MINIO_ROOT_USER):$(env_get MINIO_ROOT_PASSWORD)@minio:9000" \
  docker run --rm --network acceptance_data -e MC_HOST_dst -e HOME=/tmp \
  -v /opt/acceptance/backups/minio:/backup pgsty/mc:RELEASE.2026-09-16T00-00-00Z \
  mirror --overwrite /backup/photos dst/photos
dc up -d --wait api worker
curl -fsS http://127.0.0.1/health/ready
```

Restoring onto a new server: install Docker + buildx, copy `.env`, `ADMIN_PASSWORD` and the backups to
`/opt/acceptance`, run `deploy.sh` (creates empty volumes + schema), then the restore steps above.
Practise this drill before UAT.

## Add a domain (automatic HTTPS)

1. DNS: `A` record `<domain>` -> `178.104.221.75` (and `AAAA` if IPv6 is used).
2. On the server:
   ```bash
   printf 'DOMAIN=acceptance.example.com\nPUBLIC_URL=https://acceptance.example.com\n' \
     | bash /opt/acceptance/app/infra/scripts/set-env.sh
   ```
   Set `CORS_ORIGINS` too once the web portal exists.
3. `infra/scripts/deploy.sh --restart caddy api worker` (or a full deploy). Caddy obtains a Let's Encrypt
   certificate on first request (ports 80 and 443 are already open) and redirects HTTP to HTTPS.
   `PUBLIC_URL` is also the presigned photo URL host, so photo links switch to HTTPS too.

## Resource budget (8 GB host)

| service | memory limit | notes |
|---|---|---|
| postgres | 1.5 GB | shared_buffers 512 MB |
| api / worker | 1 GB each | Node heap 768 MB |
| minio | 1 GB | |
| redis | 512 MB | maxmemory 384 MB, noeviction (BullMQ), AOF on |
| caddy | 256 MB | |

Logs: json-file, 10 MB x 5 per container. Builds run on the server; 2 GB swap absorbs peaks.

## CI (T7.2)

`.github/workflows/ci.yml` (added with T7.1, not yet run: nothing is pushed) runs
`pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm test` on push/PR, then builds both
production images. Deploys stay manual (`deploy.sh`) until a deploy key and
environment protection are set up.
