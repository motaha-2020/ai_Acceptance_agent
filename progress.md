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
| T1.2 | Snag taxonomy (ar/en) + per-category checklists | AI Engineer | review | packages/checklist: 46 codes, 20 checklists, cacheable prompt builder, matchReviewerRemark() maps 165/167 seed remarks; docs/snag-taxonomy.md (generated) awaits USER decisions on 8 open questions (see docs/snag-taxonomy.md); 34 tests pass |
| T1.3 | Parse LLD/inventory/mapping/fiber-test -> site seed | Data Engineer | done | data/sites/nasr3-r21c.json (zod-validated) + 4 cross-source warnings |
| T1.4 | Import 4 sites' photos as demo/eval data | Data Engineer | done | data/photo_catalog.jsonl: 791 photos, 0 unmapped, 95 sha256 dup groups |
| T1.5 | OCR SID checklist images | AI Engineer | done | 5 PNGs legible; all 58 items transcribed + reconciled with checklists in docs/sid-checklist-ocr-plan.md (32 photo-verifiable, 26 mapped to codes); no OCR pipeline needed |

## P2 Backend
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T2.1 | Prisma schema + migrations | Backend Architect | todo | |
| T2.2 | Auth + RBAC + user mgmt | Backend Architect | todo | |
| T2.3 | Projects/sites/devices/visits APIs | Backend Architect | todo | |
| T2.4 | Photo upload (resumable, sharp, MinIO) | Backend Architect | todo | |
| T2.5 | Queue + worker skeleton | Backend Architect | todo | |
| T2.6 | Snag/review APIs | Backend Architect | todo | |
| T2.7 | Audit log | Backend Architect | todo | |

## P3 AI
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T3.1 | AnalysisProvider + adapters (Claude/Gemini/OpenAI) | AI Engineer (opus) | review | packages/ai: Claude/Gemini/OpenAI adapters over a shared core (strict JSON schema from zod, zod re-validation + 1 repair, retry/backoff, prompt caching, 1568px downscale, cost via src/pricing.ts = unverified config), createProvider + CascadeProvider (default gemini-3.8-flash -> claude-sonnet-5-5 at conf<0.7/uncertain/wrong-category); few-shot via provider option; shared contract unchanged; 53 tests pass offline (recorded HTTP) |
| T3.2 | Category verification + quality gates | AI Engineer (opus) | review | local blur (Laplacian var) + dark (mean luma) gate, modes hint/short_circuit/off, thresholds calibrated on 899 real photos (flags none of the accepted set); PERSON_IN_FRAME/WRONG_CATEGORY photo-gate block in cached prefix; short_circuit off until validated on reviewer rejections |
| T3.3 | Per-category prompts + few-shot | AI Engineer | todo | |
| T3.4 | Eval harness + metrics | AI Engineer (opus) | review | packages/ai/eval: dataset (snag seed via matchReviewerRemark + inferred category; assumed-good stratified, sha256-dedup, few-shot/eval splits disjoint by sha256), per-code P/R, accuracy, confusion, catch/false-accept/uncertain rates, latency, cost; jsonl+md outputs; compare command; --dry-run fake provider |
| T3.5 | Prompt tuning loop | AI Engineer | todo | |
| T3.6 | Provider bake-off (cost/accuracy) | AI Engineer (opus) | blocked | waiting for API keys; run: put keys in .env, then `pnpm --filter @acceptance/ai eval --provider gemini --model gemini-3.8-flash --limit 150 --concurrency 4` (repeat for gemini-3.1-flash-lite, claude-haiku-4-5, claude-sonnet-5-5, claude-opus-5-5 --concurrency 2, openai gpt-6.1-sol), `pnpm --filter @acceptance/ai eval --provider cascade --cascade gemini:gemini-3.8-flash,claude:claude-sonnet-5-5 --min-confidence 0.7 --limit 150 --concurrency 4`, then `pnpm --filter @acceptance/ai eval:compare --last 7` (see packages/ai/README.md) |

## P4 Web
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T4.1 | Design system + i18n/RTL | Frontend Developer | todo | |
| T4.2 | Auth + admin (users/roles) | Frontend Developer | todo | |
| T4.3 | Review queue UI | Frontend Developer | todo | |
| T4.4 | Sites/projects/snag tracker | Frontend Developer | todo | |
| T4.5 | AI accuracy dashboard | Frontend Developer | todo | |
| T4.6 | Report UI | Frontend Developer | todo | |

## P5 Mobile
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T5.1 | Expo scaffold + auth | Mobile App Builder | todo | |
| T5.2 | Visits + guided shot list | Mobile App Builder | todo | |
| T5.3 | Camera + offline queue + background upload | Mobile App Builder | todo | |
| T5.4 | AI feedback / retake / fix flow | Mobile App Builder | todo | |
| T5.5 | EAS builds | Mobile App Builder | todo | |
| T5.6 | Download page on web: latest signed APK + QR code + version/changelog (Android only; iOS deferred - all technicians on Android) | Mobile App Builder | todo | model: Sonnet |
| T5.7 | OTA updates: expo-updates + self-hosted update server on Hetzner (expo-updates protocol, code signing), channels production/staging, rollback | Mobile App Builder | todo | model: Opus |
| T5.8 | Forced update gate: app checks API `min_supported_version`; OTA for JS changes, prompt to download new APK from web for native changes | Mobile App Builder | todo | model: Sonnet |
| T5.9 | Release pipeline: CI publishes OTA bundle + APK to MinIO, admin page to publish/rollback a release to all devices | DevOps Automator | todo | model: Sonnet |

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
| T7.1 | Hetzner provisioning (Caddy, ufw, backups) | DevOps Automator | todo | |
| T7.2 | CI/CD | DevOps Automator | todo | |
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
