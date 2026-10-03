#!/usr/bin/env bash
# Runs INSIDE the Android build container started by build-apk.sh (source at /work, output in /out).
# Env: APP_VERSION, APP_VERSION_CODE, UPDATES_CHANNEL, API_BASE_URL, OUT_NAME, HOST_UID/HOST_GID, PNPM_VERSION,
#      ORG_GRADLE_PROJECT_ACCEPTANCE_* (signing, from the keystore env file; never printed).
set -euo pipefail

# Root inside the container (the SDK dir must stay writable so Gradle can add platform/build-tools);
# hand every file back to the deploy user on exit, success or not.
trap 'chown -R "$HOST_UID:$HOST_GID" /work /out' EXIT

npm install -g "pnpm@${PNPM_VERSION}" --no-fund --no-audit >/dev/null
cd /work
pnpm install --frozen-lockfile --store-dir /pnpm-store --filter "@acceptance/mobile..." --config.confirmModulesPurge=false

cd apps/mobile
# Workspace packages the app imports (compiled with the app's TypeScript).
npx tsc -p ../../packages/shared/tsconfig.json
npx tsc -p ../../packages/checklist/tsconfig.json

# Without the keystore the signing plugin silently falls back to the debug key; an APK signed that way can
# never be updated by a real release (devices must uninstall and lose unsent photos), so refuse to build.
: "${ORG_GRADLE_PROJECT_ACCEPTANCE_STORE_FILE:?release keystore env missing (keystore.env not passed)}"
[ -s "$ORG_GRADLE_PROJECT_ACCEPTANCE_STORE_FILE" ] || { echo "release keystore not found: $ORG_GRADLE_PROJECT_ACCEPTANCE_STORE_FILE" >&2; exit 1; }
expected_sha="$(keytool -list -v -keystore "$ORG_GRADLE_PROJECT_ACCEPTANCE_STORE_FILE" -storepass "$ORG_GRADLE_PROJECT_ACCEPTANCE_STORE_PASSWORD" \
  -alias "$ORG_GRADLE_PROJECT_ACCEPTANCE_KEY_ALIAS" 2>/dev/null | sed -n '/^[[:space:]]*SHA256:/{s/^[[:space:]]*SHA256:[[:space:]]*//;p;q;}' | tr -d ':' | tr 'A-F' 'a-f' || true)"
[ -n "$expected_sha" ] || { echo "could not read the release certificate from the keystore" >&2; exit 1; }

npx expo prebuild --platform android --clean --no-install
grep -q "acceptance-release-signing" android/app/build.gradle || { echo "release signing plugin did not run" >&2; exit 1; }

cd android
# 2 Gradle workers, 2.5 GB heap, 2 ABIs (arm64-v8a: current phones, armeabi-v7a: old ones).
./gradlew assembleRelease --no-daemon --max-workers=2 \
  -PreactNativeArchitectures=arm64-v8a,armeabi-v7a \
  -Dorg.gradle.jvmargs="-Xmx2560m -XX:MaxMetaspaceSize=768m" \
  -Pkotlin.daemon.jvmargs=-Xmx768m

apk=app/build/outputs/apk/release/app-release.apk
apksigner="$(ls -d "$ANDROID_HOME"/build-tools/*/ | sort -V | tail -1)apksigner"
certs="$("$apksigner" verify --print-certs "$apk")"
printf '%s\n' "$certs" | grep -E "Signer #1 certificate (DN|SHA-256)"
actual_sha="$(printf '%s\n' "$certs" | sed -n 's/^Signer #1 certificate SHA-256 digest: //p' | tr 'A-F' 'a-f')"
if [ "$actual_sha" != "$expected_sha" ]; then
  echo "APK is not signed with the release key (expected $expected_sha, got ${actual_sha:-none}); refusing to publish" >&2
  exit 1
fi
cp "$apk" "/out/$OUT_NAME"
