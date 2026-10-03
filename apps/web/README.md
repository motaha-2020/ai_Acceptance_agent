# @acceptance/web

Reviewer / PM / admin portal: Next.js 15 (App Router), React 19, Tailwind CSS v4, Radix (shadcn-style
components), TanStack Query, react-hook-form + the zod contracts from `@acceptance/shared`,
next-intl with Arabic (default, RTL) and English (LTR), recharts for the accuracy dashboard.

## Screens

| Route | Task | Who |
|---|---|---|
| `/login` | T4.2 | everyone |
| `/review` | T4.3 review queue + workspace | `review Photo` (reviewer, admin) |
| `/sites`, `/sites/[id]` | T4.4 sites, progress per category, photo grid, snag tracker, visits | `read Site` |
| `/snags` | T4.4 snag tracker (open → fixed → verified) | `read Snag` |
| `/accuracy` | T4.5 AI agreement per category vs autonomy thresholds + 8 week trend | `read Metrics` |
| `/reports` | T4.6 site readiness (blocked while open snags), Generate disabled until P6 | `read Report` |
| `/admin/users`, `/admin/projects` | T4.2 users/roles, projects/sites/devices | `create User` / `create Project` (admin) |
| `/app` | APK download stub (T5.6) | everyone |

Navigation and actions are hidden with the shared `PERMISSION_MATRIX` (`src/lib/rbac.ts`); the API
still enforces everything.

### Review shortcuts

`A` agree · `R` reject/override · `S` add snag (searchable, Arabic or English; optionally drag a box on the photo) ·
`N`/`→` next · `P`/`←` previous · `1`–`9` select an AI snag, `X` remove it (with reason) · `B` toggle boxes ·
`+` `−` `0` zoom · `Enter` submit staged changes · `?` help. Shortcuts use the physical key (`KeyboardEvent.code`),
so they work on an Arabic keyboard layout.

Submitting is optimistic but safe: the UI advances immediately, each decision runs as
`POST /photos/:id/reviews` (immutable training label) then `approve`/`reject`; on any failure the photo
comes back with its staged edits and a clear error, and a half-finished submission (label stored,
finalize failed) only repeats the second step.

## Auth

`/api/auth/login` exchanges credentials with the API and stores the access/refresh tokens in **httpOnly,
SameSite=Lax cookies**. The browser only talks to `/api/proxy/*` (BFF), which attaches the bearer token,
refreshes it with a single-flight lock (the API revokes a token family on refresh-token reuse) and checks
`Origin` on state-changing requests. `src/middleware.ts` redirects unauthenticated users to `/login?next=`
and sends users with an expired access cookie through `/api/auth/refresh`.

## Run

```bash
pnpm install && pnpm build                # builds shared/checklist/api/db first (turbo)

# 1. backend without Docker: embedded PostgreSQL 16 + the real API + fake AI + demo photos
pnpm --filter @acceptance/web e2e:stack -- --persist --demo     # API http://localhost:3010 (docs at /docs)
#    PG_PORT 55433 is used so it does not clash with a Windows Postgres service on 5432.

# 2. the portal
API_URL=http://localhost:3010 COOKIE_SECURE=false pnpm --filter @acceptance/web dev   # http://localhost:3001
```

Demo logins (local test values, see `e2e/stack/config.mjs`): `admin@`, `reviewer@`, `pm@`, `tech@`, `viewer@acceptance.local`.

Environment: `API_URL` (server side, default `http://localhost:3000`), `COOKIE_SECURE` (default: true in
production), `NEXT_STANDALONE=true` for the Docker build (`output: 'standalone'` needs symlink rights, so it
is off by default on Windows).

## Tests

```bash
pnpm --filter @acceptance/web test           # vitest + Testing Library (components, shortcuts, RBAC, RTL, i18n catalogues)
pnpm --filter @acceptance/web e2e            # Playwright against the real API (starts everything itself)
E2E_CHANNEL=chrome pnpm --filter @acceptance/web e2e   # use an installed Chrome/Edge instead of downloading Chromium
```

The e2e run captures screenshots of the main screens (Arabic RTL, English LTR, dark, mobile) into
`test-results/screens/` (gitignored).

## Layout

```
src/app            routes: (auth)/login, (portal)/* behind the shell, api/auth/*, api/proxy/*
src/components     ui/ (primitives), data/ (table, states, badges, dialogs), shell/ (nav, top bar)
src/features       auth, review, sites, snags, accuracy, reports, admin, app-download, common
src/lib            api/ (typed client + endpoints), server/ (cookies, refresh, csrf), rbac, taxonomy, format
messages/          ar.json, en.json (a test keeps keys in sync and verifies every referenced key exists)
e2e/               Playwright specs + stack/ (embedded PostgreSQL + API launcher and demo data)
```

## Known gaps / API wishes

See the report in `progress.md` (T4.x notes): no sort parameter on list endpoints (tables sort the loaded page),
no per-site progress or trend endpoints (computed client-side), no app-release endpoint (`/app` shows
"coming soon"), no report endpoint (P6).
