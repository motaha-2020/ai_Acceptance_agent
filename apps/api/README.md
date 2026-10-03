# @acceptance/api

NestJS 11 (Fastify) HTTP API for the acceptance system: auth/RBAC, projects, sites, devices,
visits, photo upload, AI analysis jobs, review queue, snags, agreement metrics, audit log.

Related packages: `@acceptance/db` (Prisma schema, migrations, seed, embedded Postgres),
`@acceptance/storage`, `@acceptance/queue`, `@acceptance/worker` (analysis processor),
`@acceptance/shared` (zod request contracts + RBAC matrix). Decisions: `docs/adr/0002`, `0003`.

## Run locally without Docker

Requirements: Node 24, pnpm. Nothing else (PostgreSQL comes from the `embedded-postgres` npm
package; no Redis needed; files go to the local disk).

```bash
pnpm install
pnpm build                                   # builds all packages incl. Prisma client

cp .env.example .env                         # then edit:
#   JWT_ACCESS_SECRET / STORAGE_SIGNING_SECRET  -> random strings >= 32 chars
#   SEED_ADMIN_PASSWORD                         -> >= 10 chars
#   leave REDIS_URL commented out (in-process queue + embedded worker)

# terminal 1: PostgreSQL 16 on :5432, data in <repo>/.data/postgres, applies migrations
pnpm --filter @acceptance/db db:dev
#   port 5432 taken (e.g. a Windows Postgres service)? use  PG_PORT=55432  and update DATABASE_URL

# terminal 2: seed (idempotent): roles, admin, TE-BIG-EDGE project, NASR3 site
# (from data/sites/nasr3-r21c.json when present) + 3 demo sites, checklists, autonomy policies
pnpm --filter @acceptance/db db:seed

pnpm --filter @acceptance/api dev            # http://localhost:3000
```

- OpenAPI UI: http://localhost:3000/docs (JSON: `/docs-json`; offline export:
  `pnpm --filter @acceptance/api openapi` writes `apps/api/openapi.json`).
- Health: `GET /health/live`, `GET /health/ready` (db, storage, queue).
- All other routes are under `/api/v1`. Log in with `POST /api/v1/auth/login`, then send
  `Authorization: Bearer <accessToken>`.
- `AI_PROVIDER=fake` accepts every photo, so the whole flow works without an API key.

Quick check:

```bash
curl -s -X POST localhost:3000/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"admin@acceptance.local","password":"<SEED_ADMIN_PASSWORD>"}'
```

### Production shape (Hetzner, docker compose)

`STORAGE_DRIVER=s3` (MinIO), `REDIS_URL` set → the API only enqueues and `apps/worker`
(`node apps/worker/dist/main.js`) consumes `analyze-photo` jobs. Run
`pnpm --filter @acceptance/db db:migrate` then `db:seed` on deploy. `NODE_ENV=production`
refuses the fake AI provider.

## API overview

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/login` (rate limited), `/auth/refresh` (rotating), `/auth/logout`, `GET /auth/me` |
| Users | `GET/POST /users`, `GET/PATCH /users/:id`, `POST /users/:id/deactivate`, `GET /roles` |
| Catalog | `/projects`, `/sites`, `/devices` (CRUD, `?q=`, filters, `page`/`pageSize`; projects/sites soft-delete) |
| Visits | `/visits` CRUD, `POST /visits/:id/assignments`, `DELETE /visits/:id/assignments/:userId` |
| Photos | `POST /photos` (multipart `metadata` + `file`, idempotent by `clientUuid`), `GET /photos`, `GET /photos/:id`, `POST /photos/:id/reanalyze`, `POST /photos/requeue-stuck` |
| Review | `GET /reviews/queue`, `POST /photos/:id/reviews`, `POST /photos/:id/approve`, `POST /photos/:id/reject` |
| Snags | `GET /snags`, `GET /snags/:id`, `POST /snags/:id/fix|verify|reopen` |
| Metrics | `GET /metrics/agreement?projectId&from&to` (AI vs human per category + autonomy policy) |
| Audit | `GET /audit-logs?entity&entityId&actorId` |
| App releases | public `GET /app/releases/latest?channel` (alias `/app-releases/latest`), `GET /app/releases/latest/download`, `GET /app/releases/:id/download` (302 to a signed URL); admin `GET/POST /app/releases`, `PATCH /app/releases/:id`, `POST /app/releases/:id/publish|unpublish` |
| OTA (expo-updates v1) | public `GET /updates/manifest` (headers `expo-platform`, `expo-runtime-version`, `expo-channel-name`; signed multipart, 204 = no update); admin `GET /updates`, `GET /updates/heads`, `POST /updates`, `POST /updates/rollback` |

Error body (all failures):
`{ "statusCode": 409, "error": { "code": "OPEN_SNAGS", "message": "...", "details": {...} }, "requestId": "..." }`

Workflows:
- Photo: `uploaded → ai_analyzed → pending_review → approved | rejected → fixed → approved`.
- Snag: `open → fixed (re-shot photo linked) → verified`, `fixed → open` (reopen). Reviewer-removed
  AI snags are dismissed, not deleted (negative labels).
- Reviews (`agree | override | add_snag`) are immutable training labels (DB trigger).

## Layout

```
src/
  app.ts               composition root (createApp) + AppModule
  config/              zod-validated env
  core/                DI tokens, infra module, errors + global filter, zod pipes, logger
  auth/                tokens, login, AccessGuard (authn + @CheckPolicy), CASL abilities
  users/ projects/ sites/ devices/ visits/
  photos/              upload, image processing, signed files, photo state machine
  reviews/ snags/      review queue/labels, snag state machine
  metrics/ audit/ health/ worker/ (embedded analysis worker)
test/                  unit (RBAC matrix, state machines, image, config) + HTTP integration
```

## Tests

`pnpm --filter @acceptance/api test` starts a throw-away embedded PostgreSQL, applies the
migrations and runs unit + HTTP integration tests (login → site/visit → upload → AI (fake) →
review → approve; reject → fix → verify; upload idempotency incl. concurrent retries; auth,
refresh-token reuse, rate limit, RBAC scoping).
