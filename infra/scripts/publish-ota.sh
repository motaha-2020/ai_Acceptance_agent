#!/usr/bin/env bash
# Publish an over-the-air JS update to a channel of the self-hosted expo-updates server (T5.7/T5.9).
# Every device on that channel whose APK has the same runtime version picks it up on its next launch/resume.
#
# From the dev machine, repo root (Git Bash; no Android SDK needed):
#   infra/scripts/publish-ota.sh --channel staging --message "Fix label hints"
#   infra/scripts/publish-ota.sh --channel production --message "..." [--critical]
# Options:
#   --channel C     staging | production (required)
#   --runtime R     runtime version to target (default: apps/mobile/package.json version = the APK's APP_VERSION)
#   --message M     shown in the admin list
#   --critical      devices apply it immediately (after the camera closes) instead of on next start
# Env: DEPLOY_HOST, SSH_KEY (as deploy.sh), API_BASE_URL (default http://178.104.221.75; must match the APK's)
#
# Steps: build shared/checklist -> expo export (android) -> asset list with sha256/md5 -> upload files to
# MinIO under ota/android/<runtime>/<id>/ -> POST /api/v1/updates (admin) which moves the channel head.
# Rollback: see apps/mobile/README.md (POST /api/v1/updates/rollback).
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-deploy@178.104.221.75}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/acceptance_hetzner_ed25519}"
SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o ServerAliveInterval=30 "$DEPLOY_HOST")
MC_IMAGE="${MC_IMAGE:-pgsty/mc:RELEASE.2026-09-16T00-00-00Z}"

local_main() {
  local channel="" runtime="" message="" critical=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --channel) channel="$2"; shift 2 ;;
      --runtime) runtime="$2"; shift 2 ;;
      --message) message="$2"; shift 2 ;;
      --critical) critical=1; shift ;;
      *) echo "unknown option $1" >&2; exit 2 ;;
    esac
  done
  [[ "$channel" =~ ^(production|staging)$ ]] || { echo "--channel staging|production is required" >&2; exit 2; }
  cd "$(git rev-parse --show-toplevel)"
  [ -z "$runtime" ] && runtime="$(node -p "require('./apps/mobile/package.json').version")"
  local api="${API_BASE_URL:-http://178.104.221.75}" commit id
  commit="$(git rev-parse --short HEAD)"
  id="$(date -u +%Y%m%d-%H%M%S)-$commit"
  git diff --quiet HEAD -- apps/mobile packages/shared packages/checklist || echo ">> WARNING: publishing uncommitted mobile changes" >&2

  echo ">> exporting runtime $runtime for $channel ($api)" >&2
  pnpm --filter @acceptance/shared build >/dev/null
  pnpm --filter @acceptance/checklist build >/dev/null
  (
    cd apps/mobile
    rm -rf dist-ota
    export API_BASE_URL="$api" APP_VERSION="$runtime" UPDATES_CHANNEL="$channel" CI=1 EXPO_NO_TELEMETRY=1
    npx expo export --platform android --output-dir dist-ota --clear >/dev/null
    npx expo config --type public --json > dist-ota/expo-config.json
    args=(dist-ota --channel "$channel" --runtime "$runtime" --prefix "ota/android/$runtime/$id" --commit "$commit" --expo-config dist-ota/expo-config.json)
    [ -n "$message" ] && args+=(--message "$message")
    [ "$critical" = 1 ] && args+=(--critical)
    node scripts/ota-update.mjs "${args[@]}"
  )

  echo ">> uploading to $DEPLOY_HOST" >&2
  "${SSH[@]}" "set -e; rm -rf /opt/acceptance/ota-upload/$id; mkdir -p /opt/acceptance/ota-upload/$id"
  tar -czf - -C apps/mobile/dist-ota . | "${SSH[@]}" "tar -xzf - -C /opt/acceptance/ota-upload/$id"
  "${SSH[@]}" "bash -s -- --on-server '$id'" < "$0"
}

server_main() {
  local id="$1"
  . /opt/acceptance/app/infra/scripts/lib.sh
  local dir="$ACC_ROOT/ota-upload/$id" bucket
  bucket="$(env_get S3_BUCKET)"
  [ -s "$dir/update.json" ] || die "missing $dir/update.json"

  MINIO_ROOT_USER="$(env_get MINIO_ROOT_USER)" MINIO_ROOT_PASSWORD="$(env_get MINIO_ROOT_PASSWORD)" \
  docker run --rm --network acceptance_data -v "$dir:/dist:ro" -e MINIO_ROOT_USER -e MINIO_ROOT_PASSWORD -e BUCKET="$bucket" \
    --entrypoint /bin/sh "$MC_IMAGE" -c '
      set -e
      mc alias set local http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
      n=0
      while IFS="$(printf "\t")" read -r rel key ct; do
        [ -n "$rel" ] || continue
        mc cp --quiet --attr "Content-Type=$ct" "/dist/$rel" "local/$BUCKET/$key" >/dev/null
        n=$((n+1))
      done < /dist/uploads.txt
      echo "uploaded $n files"'

  ADMIN_EMAIL="$(env_get SEED_ADMIN_EMAIL)" ADMIN_PASSWORD="$(cat "$ACC_ROOT/ADMIN_PASSWORD")" \
  docker exec -i -e ADMIN_EMAIL -e ADMIN_PASSWORD acceptance-api-1 node --input-type=module -e '
    let raw = ""; for await (const c of process.stdin) raw += c;
    const base = "http://127.0.0.1:3000/api/v1";
    const login = await fetch(base + "/auth/login", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
    if (!login.ok) { console.error("admin login failed", login.status); process.exit(1); }
    const { accessToken } = await login.json();
    const res = await fetch(base + "/updates", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer " + accessToken }, body: raw });
    const out = await res.json();
    if (!res.ok) { console.error("publish failed", res.status, JSON.stringify(out)); process.exit(1); }
    console.log(JSON.stringify(out));
  ' < "$dir/update.json"
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$id" >> "$ACC_ROOT/ota-releases.log"
  rm -rf "$dir"
}

if [ "${1:-}" = "--on-server" ]; then
  server_main "${2:?id}"
else
  local_main "$@"
fi
