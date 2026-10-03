# Progress

Source of truth for all agents. Status: `todo | doing | review | done | blocked`.
Rule: set your row to `doing` (owner + branch) before starting; orchestrator marks `done` after tests pass.

## P0 Foundation
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T0.1 | Monorepo scaffold (pnpm/turbo/tsconfig) | orchestrator | done | 2026-10-03 |
| T0.2 | progress.md + ADR docs | orchestrator | done | ADR 0001 |
| T0.3 | Shared zod schemas/enums | orchestrator | done | enums + AnalysisResult contract; builds clean |
| T0.4 | docker-compose dev stack | orchestrator | done | infra/docker-compose.dev.yml (Docker not installed locally) |
| T0.5 | git init + CI workflow | orchestrator | doing | git init done; CI pending GitHub remote |

## P1 Data & Ingestion
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T1.1 | Parse sangs docx -> snags_seed.jsonl | Data Engineer | done | tools/ingest: 108 images, 168 (image,remark) records, 99 groups; data/snags_seed.jsonl |
| T1.2 | Snag taxonomy (ar/en) + per-category checklists | AI Engineer | review | packages/checklist: 46 codes, 20 checklists, cacheable prompt builder, matchReviewerRemark() maps 165/167 seed remarks; docs/snag-taxonomy.md (generated) 8 open questions deferred by user to the training phase (resolve during P3 eval/tuning); 34 tests pass |
| T1.3 | Parse LLD/inventory/mapping/fiber-test -> site seed | Data Engineer | done | data/sites/nasr3-r21c.json (zod-validated) + 4 cross-source warnings |
| T1.4 | Import 4 sites' photos as demo/eval data | Data Engineer | done | data/photo_catalog.jsonl: 791 photos, 0 unmapped, 95 sha256 dup groups |
| T1.5 | OCR SID checklist images | AI Engineer | done | 5 PNGs legible; all 58 items transcribed + reconciled with checklists in docs/sid-checklist-ocr-plan.md (32 photo-verifiable, 26 mapped to codes); no OCR pipeline needed |

## P2 Backend
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T2.1 | Prisma schema + migrations | Backend Architect (opus) | done | 2026-10-03 packages/db: Prisma schema (domain + Review/AuditLog append-only triggers, AutonomyPolicy, Report/BOM/AppRelease stubs), 2 migrations, idempotent seed (admin, roles+permissions, NASR3 from data/sites + 3 demo sites, 20 checklists, policies disabled), embedded PG16 for dev/tests; 5 tests |
| T2.2 | Auth + RBAC + user mgmt | Backend Architect (opus) | done | 2026-10-03 argon2id, 15-min JWT + rotating hashed refresh tokens w/ family revocation on reuse, login rate limit, admin user CRUD/deactivate, CASL from shared PERMISSION_MATRIX + row scope (technician=assigned visits); RBAC matrix + auth tests |
| T2.3 | Projects/sites/devices/visits APIs | Backend Architect (opus) | done | 2026-10-03 projects/sites/devices/visits CRUD + filter/paginate, soft delete, visit status machine, technician assignment; zod contracts in packages/shared/src/api.ts |
| T2.4 | Photo upload (resumable, sharp, MinIO) | Backend Architect (opus) | done | 2026-10-03 multipart upload idempotent per clientUuid (incl. concurrent retries), sha256 content-addressed storage + dup flag, decode-validated jpeg/png/webp, EXIF, thumb/web via sharp, signed URLs (S3 presign / HMAC local), ADR 0002 (single request, no tus) |
| T2.5 | Queue + worker skeleton | Backend Architect (opus) | done | 2026-10-03 packages/queue (BullMQ + in-process), apps/worker analyze-photo: provider registry (fake built in; register @acceptance/ai adapters in composition root), zod-validated result, retries/backoff, daily budget guard, Phase-1 HumanReviewGate + PolicyAutonomyGate hook; embedded in API when no REDIS_URL; 6 tests |
| T2.6 | Snag/review APIs | Backend Architect (opus) | done | 2026-10-03 FIFO review queue, agree/override/add_snag reviews (immutable labels, dismissed AI snags kept), approve/reject (always leave a label), snag open->fixed->verified rolled up to photo, GET /metrics/agreement per category vs AutonomyPolicy |
| T2.7 | Audit log | Backend Architect (opus) | done | 2026-10-03 global audit interceptor: every mutation (incl. failures) with actor, entity, before/after (redacted), status, requestId; GET /audit-logs; DB-level append-only |

## P3 AI
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T3.1 | AnalysisProvider + adapters (Claude/Gemini/OpenAI) | AI Engineer (opus) | done | packages/ai: Claude/Gemini/OpenAI adapters over a shared core (strict JSON schema from zod, zod re-validation + 1 repair, retry/backoff, prompt caching, 1568px downscale, cost via src/pricing.ts = unverified config), createProvider + CascadeProvider (default gemini-3.8-flash -> claude-sonnet-5-5 at conf<0.7/uncertain/wrong-category); few-shot via provider option; shared contract unchanged; 53 tests pass offline (recorded HTTP) |
| T3.2 | Category verification + quality gates | AI Engineer (opus) | done | local blur (Laplacian var) + dark (mean luma) gate, modes hint/short_circuit/off, thresholds calibrated on 899 real photos (flags none of the accepted set); PERSON_IN_FRAME/WRONG_CATEGORY photo-gate block in cached prefix; short_circuit off until validated on reviewer rejections |
| T3.3 | Per-category prompts + few-shot | AI Engineer | todo | |
| T3.4 | Eval harness + metrics | AI Engineer (opus) | done | packages/ai/eval: dataset (snag seed via matchReviewerRemark + inferred category; assumed-good stratified, sha256-dedup, few-shot/eval splits disjoint by sha256), per-code P/R, accuracy, confusion, catch/false-accept/uncertain rates, latency, cost; jsonl+md outputs; compare command; --dry-run fake provider |
| T3.5 | Prompt tuning loop | AI Engineer (opus) | doing | |
| T3.6 | Provider bake-off (cost/accuracy) | AI Engineer (opus) | done | 2026-10-03 bake-off 150 photos (data/eval/compare-*.md): Sonnet 5.5 = 0% false accept, best calibrated (says uncertain), fastest 4s, $11.3/1000; Gemini Flash 1.3% false accept, best code precision; Haiku 5.3% false accept (not standalone); OpenAI 93% false reject, slowest. Few-shot K=2 cut false reject 80%->51% (Sonnet), 73%->49% (Gemini). Production default: Sonnet 5.5. Next T3.5: relax cosmetic codes, clean mislabeled categories, resolve taxonomy questions. |

## P4 Web
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T4.1 | Design system + i18n/RTL | Frontend Developer (sonnet) | doing | 2026-10-03 |
| T4.2 | Auth + admin (users/roles) | Frontend Developer (sonnet) | doing | 2026-10-03 |
| T4.3 | Review queue UI | Frontend Developer (sonnet) | doing | 2026-10-03 |
| T4.4 | Sites/projects/snag tracker | Frontend Developer (sonnet) | doing | 2026-10-03 |
| T4.5 | AI accuracy dashboard | Frontend Developer (sonnet) | doing | 2026-10-03 |
| T4.6 | Report UI | Frontend Developer (sonnet) | doing | 2026-10-03 |

## P5 Mobile
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T5.1 | Expo scaffold + auth | Mobile App Builder (opus) | doing | 2026-10-03  |
| T5.2 | Visits + guided shot list | Mobile App Builder (opus) | doing | 2026-10-03  |
| T5.3 | Camera + offline queue + background upload | Mobile App Builder (opus) | doing | 2026-10-03  |
| T5.4 | AI feedback / retake / fix flow | Mobile App Builder (opus) | doing | 2026-10-03  |
| T5.5 | EAS builds | Mobile App Builder (opus) | doing | 2026-10-03  |
| T5.6 | Download page on web: latest signed APK + QR code + version/changelog (Android only; iOS deferred - all technicians on Android) | Mobile App Builder (opus) | doing | 2026-10-03 model: Sonnet |
| T5.7 | OTA updates: expo-updates + self-hosted update server on Hetzner (expo-updates protocol, code signing), channels production/staging, rollback | Mobile App Builder (opus) | doing | 2026-10-03 model: Opus |
| T5.8 | Forced update gate: app checks API `min_supported_version`; OTA for JS changes, prompt to download new APK from web for native changes | Mobile App Builder (opus) | doing | 2026-10-03 model: Sonnet |
| T5.9 | Release pipeline: CI publishes OTA bundle + APK to MinIO, admin page to publish/rollback a release to all devices | Mobile App Builder (opus) | doing | 2026-10-03 model: Sonnet |

## P6 Reports
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T6.1 | docx generator (SID layout) | Document Generator | todo | |
| T6.2 | Parsers -> BOM/ODF/fiber tables | Document Generator | todo | |
| T6.3 | PDF export | Document Generator | todo | |
| T6.4 | Golden-file test vs real SID | Document Generator | todo | |

## P7 Deploy & Hardening
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T7.1 | Hetzner provisioning (Caddy, ufw, backups) | DevOps Automator (opus) | done | 2026-10-03 live at http://178.104.221.75 (no domain yet). infra/docker-compose.prod.yml: caddy (only published ports 80/443), api, worker, postgres 16, redis 7 (AOF, noeviction), minio (pgsty/minio: upstream images discontinued) + minio-init (private bucket, least-privilege app key); data network internal, limits, log rotation, read-only app containers. apps/{api,worker}/Dockerfile multi-stage, non-root, tini, healthchecks (worker heartbeat). infra/scripts: deploy.sh (git-tracked sync over ssh, build on server, migrate, seed, up --wait, health check, auto-rollback), rollback.sh, backup.sh (daily systemd timer 02:30 UTC, pg_dump 7 days + MinIO mirror), logs.sh, init-secrets/set-env/push-ai-keys. Secrets only in /opt/acceptance/.env + ADMIN_PASSWORD (600). Worker registers claude/gemini/openai/cascade from @acceptance/ai (AI_PROVIDER, AI_MODEL); prod = claude-sonnet-5-5. Fixed BullMQ job id (":" rejected by BullMQ, uploads were never queued with Redis). Smoke: real photo -> Claude analysis -> pending_review in 6 s. Runbook infra/README.md. Open: off-site backups, image size ~1 GB (Prisma + eager embedded-postgres import), no periodic requeue of stuck uploads |
| T7.2 | CI/CD | DevOps Automator | todo | 2026-10-03 minimum added with T7.1: .github/workflows/ci.yml (install, build, typecheck, test, docker build api+worker) - never run (nothing pushed). CD = manual infra/scripts/deploy.sh |
| T7.3 | Monitoring | DevOps Automator | todo | |
| T7.4 | E2E tests | API Tester | todo | |
| T7.5 | Security review | Security Engineer | todo | |
| T7.6 | UAT with reviewers | - | todo | |

## Phase 2 backlog
Material BOQ agent, guidance agent, follow-up agent, autonomy policy, fine-tuned local vision model.

## Model assignment (chosen by orchestrator; Fable not available -> Opus is the top tier)
| Work | Model | Why |
|---|---|---|
| Orchestration, architecture, AI prompt/checklist design, code + security review, phase sign-off | Opus 5.5 | hardest reasoning, mistakes cost most |
| Backend core (schema, auth/RBAC, upload, queue), AI package, report generator, mobile offline sync | Opus 5.5 | complex logic and correctness |
| Web/mobile UI screens, CRUD endpoints, tests, infra scripts, docx/xlsx parsers | Sonnet 5.5 | well-specified work, faster and cheaper |
| Bulk extraction, file inventory, docs, simple renames | Haiku 4.5 | cheap high-volume |
| Runtime photo analysis | decided by bake-off T3.6 | Gemini Flash first pass + Claude for uncertain photos is the starting hypothesis |
