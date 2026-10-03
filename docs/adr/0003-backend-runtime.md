# ADR 0003: Backend runtime — ports/adapters, no-Docker development, labels are append-only

Status: accepted (2026-10-03, P2)

## Decisions

**Ports and adapters for infrastructure** (`packages/storage`, `packages/queue`, `packages/db`):
- `ObjectStorage`: S3/MinIO adapter (production) and local filesystem adapter with HMAC-signed
  URLs served by the API (development/tests).
- `JobQueue`: BullMQ/Redis adapter (production, separate `apps/worker` process) and an in-process
  queue with the same semantics (dedupe by job id, exponential backoff, concurrency). When
  `REDIS_URL` is unset the API runs the analysis worker in-process (`EMBEDDED_WORKER=auto`).
- The worker depends only on the `AnalysisProvider` contract from `@acceptance/shared`; providers
  are registered by name in a `ProviderRegistry` at startup (`fake` built in for dev/tests).

**Real PostgreSQL everywhere.** Local development and all integration tests use PostgreSQL 16
from the `embedded-postgres` npm package (no Docker on the dev machine). Windows `initdb`
defaults to WIN1252, so clusters are initialised with UTF-8 (Arabic text). Tests run the real
Prisma migrations.

**No `emitDecoratorMetadata`.** Every Nest constructor dependency uses an explicit
`@Inject(token)`. The build (tsc) and the tests (vitest/esbuild) therefore behave identically,
without a native SWC binding (which fails on this machine).

**Security defaults.** argon2id (OWASP params); 15-min HS256 access JWT; opaque refresh tokens
stored as SHA-256, rotated on every use, whole family revoked on replay; per-request user
lookup so deactivation is immediate; login rate limit per ip+email and per ip (in-memory,
single API instance — move to Redis when scaling out); RBAC matrix in `@acceptance/shared`
compiled to CASL + Prisma `where` clauses for row-level scoping (technicians: assigned visits).

**Labels and audit are append-only.** `reviews` and `audit_logs` have DB triggers rejecting
UPDATE/DELETE/TRUNCATE. Reviewer corrections are new rows; AI snags removed by a reviewer are
*dismissed* (kept as negative labels), never deleted. Approve/reject always leave a label
(an implicit review is written when none matches the latest AI result).

**Phase 1 autonomy.** The worker's gate is `HumanReviewGate` (always `pending_review`).
`PolicyAutonomyGate` (Phase 2) only auto-approves clean, confident results in categories whose
`AutonomyPolicy` is enabled and whose measured AI/human agreement meets the thresholds; it is
off unless `AUTONOMY_ENABLED=true`. AI failure or an exhausted daily budget never blocks a
photo: it goes to human review with `aiSkipReason`.
