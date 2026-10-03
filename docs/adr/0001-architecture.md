# ADR 0001: Architecture

- Monorepo (pnpm + Turborepo), TypeScript end to end; contracts in `packages/shared`.
- API: NestJS + Prisma + PostgreSQL; queue: BullMQ/Redis; storage: MinIO (S3 API).
- Web: Next.js + Tailwind + shadcn/ui, ar/en RTL. Mobile: Expo with offline queue.
- AI: provider-agnostic `AnalysisProvider`; vendor chosen by bake-off on real data (task T3.6).
- Hosting: Hetzner VPS, docker compose, Caddy.
- Phase 1: every photo reviewed by a human; reviews become labels for Phase 2 autonomy.
See the approved plan for details.
