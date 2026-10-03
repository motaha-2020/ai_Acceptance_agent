#!/usr/bin/env bash
# Build the signed Android APK ON THE VPS (no Android SDK/Java needed locally), upload it to MinIO and
# register it as an app release (T5.5/T5.6/T5.9).
#
# From the dev machine, repo root (Git Bash). Ships the committed HEAD (git archive), like deploy.sh:
#   infra/scripts/build-apk.sh                              next versionCode, version from apps/mobile/package.json
#   infra/scripts/build-apk.sh --version 1.1.0 --notes "..." --force-update
#   infra/scripts/build-apk.sh --channel staging --no-publish
# Options:
#   --version x.y.z        app version = expo-updates runtimeVersion. Bump it for every NATIVE change.
#   --version-code N       Android versionCode (default: latest published + 1, or 1)
#   --channel C            production (default) | staging   (OTA channel baked into the APK + release channel)
#   --notes TEXT           changelog shown on the web /app page
#   --force-update         set minSupportedVersionCode = this build (older installs are blocked by the app)
#   --no-publish           upload + register but do not publish (publish later: POST /app/releases/:id/publish)
#   --reuse-apk            skip the Gradle build and upload/register the APK already built for this version/code
# Env: DEPLOY_HOST (default deploy@178.104.221.75), SSH_KEY (default ~/.ssh/acceptance_hetzner_ed25519),
#      API_BASE_URL (default: PUBLIC_URL from the server .env)
#
# Server layout (owner deploy):
#   /opt/acceptance/secrets/android/release.keystore   upload/signing key (chmod 600)   BACK IT UP (see infra/README.md)
#   /opt/acceptance/secrets/android/keystore.env       its passwords + alias (chmod 600)
#   /opt/acceptance/mobile-build/src                   source of the last build;  .../out = built APKs
# Docker volumes acceptance-gradle-cache / acceptance-mobile-pnpm keep rebuilds fast.
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-deploy@178.104.221.75}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/acceptance_hetzner_ed25519}"
SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o ServerAliveInterval=30 "$DEPLOY_HOST")
ANDROID_IMAGE="${ANDROID_IMAGE:-reactnativecommunity/react-native-android:v21.1}"
MC_IMAGE="${MC_IMAGE:-pgsty/mc:RELEASE.2026-09-16T00-00-00Z}"
PNPM_VERSION=12.8.1

local_main() {
  local version="" code="" channel=production notes="" force=0 publish=1 reuse=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --version) version="$2"; shift 2 ;;
      --version-code) code="$2"; shift 2 ;;
      --channel) channel="$2"; shift 2 ;;
      --notes) notes="$2"; shift 2 ;;
      --force-update) force=1; shift ;;
      --no-publish) publish=0; shift ;;
      --reuse-apk) reuse=1; shift ;;
      *) echo "unknown option $1" >&2; exit 2 ;;
    esac
  done
  cd "$(git rev-parse --show-toplevel)"
  [ -z "$version" ] && version="$(node -p "require('./apps/mobile/package.json').version")"
  [[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "bad --version $version" >&2; exit 2; }
  [[ "$channel" =~ ^(production|staging)$ ]] || { echo "bad --channel $channel" >&2; exit 2; }
  [ -s apps/mobile/certs/ota-certificate.pem ] || { echo "apps/mobile/certs/ota-certificate.pem missing (run init-ota-key.sh on the server and commit the certificate)" >&2; exit 1; }
  git diff --quiet HEAD -- apps/mobile packages/shared packages/checklist || echo ">> WARNING: uncommitted mobile changes are NOT included (building HEAD)" >&2

  echo ">> shipping HEAD $(git rev-parse --short HEAD) to $DEPLOY_HOST" >&2
  if [ "$reuse" = 0 ]; then
    "${SSH[@]}" 'set -e; rm -rf /opt/acceptance/mobile-build/src; mkdir -p /opt/acceptance/mobile-build/src /opt/acceptance/mobile-build/out'
    git archive --format=tar.gz HEAD | "${SSH[@]}" 'tar -xzf - -C /opt/acceptance/mobile-build/src'
  fi

  local notes_b64
  notes_b64="$(printf '%s' "$notes" | base64 | tr -d '\n')"
  "${SSH[@]}" "bash /opt/acceptance/mobile-build/src/infra/scripts/build-apk.sh --on-server '$version' '$code' '$channel' '$force' '$publish' '$notes_b64' '$(git rev-parse --short HEAD)' '$reuse'"
}

ensure_keystore() {
  local dir="$ACC_ROOT/secrets/android"
  install -d -m 700 "$ACC_ROOT/secrets" "$dir"
  if [ -s "$dir/release.keystore" ]; then return; fi
  log "generating the release keystore (one time). BACK UP $dir — losing it means installed apps can never be updated."
  local store_pw key_pw
  store_pw="$(openssl rand -hex 24)"
  key_pw="$store_pw" # PKCS12 keystores use one password for store and key
  ( umask 077
    printf 'ORG_GRADLE_PROJECT_ACCEPTANCE_STORE_FILE=/secrets/release.keystore\nORG_GRADLE_PROJECT_ACCEPTANCE_STORE_PASSWORD=%s\nORG_GRADLE_PROJECT_ACCEPTANCE_KEY_ALIAS=acceptance-field\nORG_GRADLE_PROJECT_ACCEPTANCE_KEY_PASSWORD=%s\n' "$store_pw" "$key_pw" > "$dir/keystore.env" )
  docker run --rm --user "$(id -u):$(id -g)" -v "$dir:/secrets" --env-file "$dir/keystore.env" "$ANDROID_IMAGE" bash -c \
    'keytool -genkeypair -v -storetype PKCS12 -keystore /secrets/release.keystore -alias "$ORG_GRADLE_PROJECT_ACCEPTANCE_KEY_ALIAS" \
       -keyalg RSA -keysize 4096 -validity 10000 -storepass "$ORG_GRADLE_PROJECT_ACCEPTANCE_STORE_PASSWORD" -keypass "$ORG_GRADLE_PROJECT_ACCEPTANCE_KEY_PASSWORD" \
       -dname "CN=Acceptance Field, O=Acceptance, C=EG" >/dev/null 2>&1'
  chmod 600 "$dir/release.keystore" "$dir/keystore.env"
}

server_main() {
  local version="$1" code="$2" channel="$3" force="$4" publish="$5" notes_b64="$6" commit="$7" reuse="${8:-0}"
  . "$(dirname "$0")/lib.sh"
  local build="$ACC_ROOT/mobile-build" api_base
  api_base="${API_BASE_URL:-$(env_get PUBLIC_URL)}"

  if [ -z "$code" ]; then
    local latest
    latest="$(curl -fsS "http://127.0.0.1/api/v1/app/releases/latest?channel=$channel" 2>/dev/null | sed -n 's/.*"versionCode":\([0-9]*\).*/\1/p' || true)"
    code=$(( ${latest:-0} + 1 ))
  fi
  log "building $version ($code) channel=$channel api=$api_base commit=$commit"
  ensure_keystore

  if [ "$reuse" = 1 ] && [ -s "$build/out/acceptance-field-$version-$code.apk" ]; then
    log "reusing $build/out/acceptance-field-$version-$code.apk"
  else
  rm -f "$build/out/"*.apk
  # Memory budget (8 GB host, prod stack ~2 GB): container capped at 5 GB RAM (+2 GB swap), Gradle heap 2.5 GB,
  # 2 workers, Kotlin compiler in-process, 2 ABIs only (arm64-v8a for current phones, armeabi-v7a for old ones).
  docker run --rm --name acceptance-apk-build \
    --memory 5g --memory-swap 7g --cpus 3 \
    -v "$build/src:/work" -v "$build/out:/out" \
    -v "$ACC_ROOT/secrets/android:/secrets:ro" \
    -v acceptance-gradle-cache:/root/.gradle -v acceptance-mobile-pnpm:/pnpm-store \
    --env-file "$ACC_ROOT/secrets/android/keystore.env" \
    -e API_BASE_URL="$api_base" -e APP_VERSION="$version" -e APP_VERSION_CODE="$code" -e UPDATES_CHANNEL="$channel" \
    -e OUT_NAME="acceptance-field-$version-$code.apk" -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" -e PNPM_VERSION="$PNPM_VERSION" \
    -e CI=1 -e EXPO_NO_TELEMETRY=1 -e NODE_OPTIONS=--max-old-space-size=2048 \
    "$ANDROID_IMAGE" bash /work/infra/scripts/apk-container-build.sh
  fi

  local apk="$build/out/acceptance-field-$version-$code.apk" sha size key
  [ -s "$apk" ] || die "APK not produced"
  sha="$(sha256sum "$apk" | cut -d' ' -f1)"
  size="$(stat -c %s "$apk")"
  key="app-releases/android/$channel/acceptance-field-$version-$code-${sha:0:12}.apk"
  log "APK $size bytes sha256=$sha"

  # Upload to the private bucket over the internal network (root creds come from .env, never printed).
  local bucket; bucket="$(env_get S3_BUCKET)"
  MINIO_ROOT_USER="$(env_get MINIO_ROOT_USER)" MINIO_ROOT_PASSWORD="$(env_get MINIO_ROOT_PASSWORD)" \
  docker run --rm --network acceptance_data -v "$build/out:/out:ro" -e MINIO_ROOT_USER -e MINIO_ROOT_PASSWORD --entrypoint /bin/sh "$MC_IMAGE" -c \
    "mc alias set local http://minio:9000 \"\$MINIO_ROOT_USER\" \"\$MINIO_ROOT_PASSWORD\" >/dev/null && \
     mc cp --quiet --attr 'Content-Type=application/vnd.android.package-archive' /out/$(basename "$apk") local/$bucket/$key >/dev/null"
  log "uploaded s3://$bucket/$key"

  register_release "$version" "$code" "$channel" "$key" "$sha" "$size" "$force" "$publish" "$notes_b64"
  printf '%s %s %s %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$channel" "$version" "$code" "$sha" >> "$ACC_ROOT/apk-releases.log"
}

# Register through the API as admin (runs node inside the api container: no JSON quoting in bash,
# credentials passed as env, nothing echoed).
register_release() {
  local version="$1" code="$2" channel="$3" key="$4" sha="$5" size="$6" force="$7" publish="$8" notes_b64="$9"
  ADMIN_EMAIL="$(env_get SEED_ADMIN_EMAIL)" ADMIN_PASSWORD="$(cat "$ACC_ROOT/ADMIN_PASSWORD")" \
  docker exec -i -e ADMIN_EMAIL -e ADMIN_PASSWORD acceptance-api-1 node --input-type=module -e "
    const body = {
      channel: '$channel', version: '$version', versionCode: $code, runtimeVersion: '$version',
      apkKey: '$key', apkSha256: '$sha', apkSizeBytes: $size, publish: $([ "$publish" = 1 ] && echo true || echo false),
      notes: Buffer.from('$notes_b64', 'base64').toString('utf8') || undefined,
      ...($force === 1 ? { minSupportedVersionCode: $code, isCritical: true } : {}),
    };
    const base = 'http://127.0.0.1:3000/api/v1';
    const login = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }) });
    if (!login.ok) { console.error('admin login failed', login.status); process.exit(1); }
    const { accessToken } = await login.json();
    const res = await fetch(base + '/app/releases', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + accessToken }, body: JSON.stringify(body) });
    const out = await res.json();
    if (!res.ok) { console.error('register failed', res.status, JSON.stringify(out)); process.exit(1); }
    console.log(JSON.stringify({ id: out.id, version: out.version, versionCode: out.versionCode, channel: out.channel, sha256: out.sha256, downloadUrl: out.downloadUrl, minSupportedVersionCode: out.minSupportedVersionCode, publishedAt: out.publishedAt }));
  "
}

if [ "${1:-}" = "--on-server" ]; then
  shift
  server_main "$@"
else
  local_main "$@"
fi
