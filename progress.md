# Progress

Source of truth for all agents. Status: `todo | doing | review | done | blocked`.
Rule: set your row to `doing` (owner + branch) before starting; orchestrator marks `done` after tests pass.

## P0 Foundation
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T0.1 | Monorepo scaffold (pnpm/turbo/tsconfig) | orchestrator | done | 2026-10-03 |
| T0.2 | progress.md + ADR docs | orchestrator | done | ADR 0001 |
| T0.3 | Shared zod schemas/enums | orchestrator | doing | enums + AnalysisResult contract written; needs install+build check |
| T0.4 | docker-compose dev stack | orchestrator | done | infra/docker-compose.dev.yml (Docker not installed locally) |
| T0.5 | git init + CI workflow | - | todo | |

## P1 Data & Ingestion
| ID | Task | Owner | Status | Notes |
|---|---|---|---|---|
| T1.1 | Parse sangs docx -> snags_seed.jsonl | Data Engineer | todo | 3 files, ~108 photos, Arabic remarks |
| T1.2 | Snag taxonomy (ar/en) + per-category checklists | AI Engineer | todo | |
| T1.3 | Parse LLD/inventory/mapping/fiber-test -> site seed | Data Engineer | todo | |
| T1.4 | Import 4 sites' photos as demo/eval data | Data Engineer | todo | |
| T1.5 | OCR SID checklist images | AI Engineer | todo | |

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
| T3.1 | AnalysisProvider + adapters (Claude/Gemini/OpenAI) | AI Engineer | todo | |
| T3.2 | Category verification + quality gates | AI Engineer | todo | |
| T3.3 | Per-category prompts + few-shot | AI Engineer | todo | |
| T3.4 | Eval harness + metrics | AI Engineer | todo | |
| T3.5 | Prompt tuning loop | AI Engineer | todo | |
| T3.6 | Provider bake-off (cost/accuracy) | AI Engineer | todo | needs API keys |

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
