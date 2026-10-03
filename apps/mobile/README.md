# @acceptance/mobile — technician field app (Android)

Expo SDK 57 / React Native 0.86 / expo-router, TypeScript strict. Arabic (RTL) by default, English in
Settings. Android only (iOS deferred). No EAS: the APK is built on our VPS and OTA updates come from our
own API (expo-updates protocol v1, code-signed).

## What it does

| Area | Where |
|---|---|
| Login (technician / engineer only), tokens in `expo-secure-store`, single-flight rotating refresh | `src/features/auth/session.ts`, `src/app/login.tsx` |
| Assigned visits → visit (progress, start/submit, snags to fix) → guided shot list per category (Arabic shot descriptions, acceptance criteria, good-example notes from `@acceptance/checklist`) | `src/app/index.tsx`, `src/app/visit/[id]/*`, `src/features/visits/shot-plan.ts` |
| Camera-only capture (no gallery, no storage permissions), stamped with capture time, GPS (permission flow; fixes older than 2 min are dropped) and device/build info | `src/app/capture.tsx` |
| Offline queue in SQLite: photo file in private app storage, metadata row keyed by `clientUuid`; capture-order upload with exponential backoff + jitter, resumes after restart, network-aware, foreground + background (WorkManager ≥ 15 min) sync; the local file is deleted **only after the server acknowledged** the upload | `src/features/queue/*` |
| AI feedback per photo (pending → AI verdict → reviewer decision, polled), snags in Arabic with `fixInstructionAr`, retake flow: the re-shot is uploaded with `fixesPhotoId` and each snag is linked with `POST /snags/:id/fix` | `src/app/photo/[id].tsx`, `src/features/queue/sync-engine.ts` |
| Visible queue (state, attempts, last error, retry / explicit discard of failed items) | `src/app/queue.tsx` |
| Forced-update gate + OTA | `src/features/updates/*` |

Queue states: `queued → uploading → (linking →) done`, `failed` (permanent error: file kept, user can retry
or discard). A crash mid-upload puts the row back to `queued`; the server deduplicates by `clientUuid`, so
re-sending is safe. Logout is refused while photos are still on the phone.

## Configuration (build time, `app.config.ts`)

| Env | Default | Meaning |
|---|---|---|
| `API_BASE_URL` | `http://178.104.221.75` | API origin; also the OTA URL `<origin>/api/v1/updates/manifest` |
| `APP_VERSION` | `1.0.0` (= `package.json` version) | shown version **and** `runtimeVersion` |
| `APP_VERSION_CODE` | `1` | Android versionCode (must increase) |
| `UPDATES_CHANNEL` | `production` | `production` or `staging` (header `expo-channel-name`) |

`certs/ota-certificate.pem` is the public code-signing certificate (private key only on the server,
`/opt/acceptance/secrets/ota/private-key.pem`). With it, the app rejects any manifest not signed by our key.

**Security note (no domain yet):** the API is plain HTTP, so `usesCleartextTraffic` is enabled only
when `API_BASE_URL` starts with `http://`. Logins, tokens and photos travel unencrypted on the network
until a domain + TLS exist; OTA bundles stay safe (signed manifest + per-asset sha256), but the APK
download itself does not (compare the sha256 shown on the `/app` page). After a domain is set:
rebuild the APK with `API_BASE_URL=https://...` (cleartext then off automatically) and raise
`minSupportedVersionCode` so old HTTP builds are forced to update.

## Develop / test

```bash
pnpm --filter @acceptance/mobile typecheck
pnpm --filter @acceptance/mobile test          # vitest: queue (real SQL on node:sqlite), sync engine/scheduler,
                                               # auth session, shot plan, update policy, OTA request builder
pnpm --filter @acceptance/mobile export:android  # Metro bundle check (no SDK needed)
```

Running on a device needs a development build (`expo run:android`) — Expo Go cannot load the native
modules of this app.

## Releases

### Native build (APK) — needed for native changes (SDK, new native module, permission, app.config plugins)

```bash
# bump apps/mobile/package.json "version" for native changes (it is the runtimeVersion), commit, then:
infra/scripts/build-apk.sh --notes "What changed" [--force-update] [--channel staging] [--version-code N]
```

Builds on the VPS in Docker (`reactnativecommunity/react-native-android`: JDK 17 + SDK), signs with the
release keystore in `/opt/acceptance/secrets/android/` (generated once; **back it up** — without it
installed apps can never be updated), uploads to MinIO (`app-releases/android/<channel>/...`) and
registers it: it immediately becomes `GET /api/v1/app/releases/latest`. `--force-update` sets
`minSupportedVersionCode` to the new build, so every older install shows the blocking "download new
version" screen on its next launch/resume.

### JS-only change — OTA

```bash
infra/scripts/publish-ota.sh --channel staging --message "Fix label hints"     # test phones first
infra/scripts/publish-ota.sh --channel production --message "Fix label hints"  # then everyone
#   --critical  -> applied immediately (after the camera screen closes) instead of on next start
```

Every device with the same runtime version downloads it in the background on launch/resume (resume
checks are throttled to 15 min) and runs it on the next start.

Rollback (admin token; one request, all devices follow on their next check):

```bash
# list:      GET  /api/v1/updates?channel=production&runtimeVersion=1.0.0
# previous:  POST /api/v1/updates/rollback {"channel":"production","runtimeVersion":"1.0.0","updateId":"<older id>"}
# embedded:  POST /api/v1/updates/rollback {"channel":"production","runtimeVersion":"1.0.0","toEmbedded":true}
# APK:       POST /api/v1/app/releases/<id>/unpublish   ("latest" falls back to the previous build)
```

## Install on a phone

1. On the phone open `http://178.104.221.75/app` (web portal) or directly
   `http://178.104.221.75/api/v1/app/releases/latest/download` and download the APK.
2. Android asks to allow installs from the browser ("Install unknown apps") once — allow it, then install.
   Play Protect may warn about an unknown developer (sideloaded app): choose "Install anyway".
3. Open **Acceptance Field**, allow camera and location, sign in with a technician/engineer account.
4. Updates: JS updates arrive automatically; when a new APK is required the app shows a blocking screen
   with a download button. Installing a newer APK over the old one keeps data (same signing key).
