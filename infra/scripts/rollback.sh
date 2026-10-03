#!/usr/bin/env bash
# Server-side: switch api + worker back to an earlier image version (default: the previous successful
# deploy in /opt/acceptance/releases.log). Images of the last 3 deploys are kept.
#   bash /opt/acceptance/app/infra/scripts/rollback.sh            # previous version
#   bash /opt/acceptance/app/infra/scripts/rollback.sh <version>  # explicit (see releases.log / docker images)
# web is only switched when an image of that version exists (releases before the portal had none).
# Database migrations are forward-only and are NOT reverted: only roll back across releases whose
# migrations are backwards compatible, otherwise restore a backup (infra/README.md).
. "$(dirname "$0")/lib.sh"

current="$(grep -E '^APP_VERSION=' "$ACC_RELEASE_ENV" 2>/dev/null | cut -d= -f2- || true)"
target="${1:-}"
if [ -z "$target" ]; then
  target="$(awk '{print $2}' "$ACC_RELEASES_LOG" 2>/dev/null | grep -vxF "$current" | tail -n1 || true)"
fi
[ -n "$target" ] || die "no previous version found in $ACC_RELEASES_LOG"
docker image inspect "acceptance/api:$target" "acceptance/worker:$target" >/dev/null 2>&1 \
  || die "images for $target are gone (kept: $(docker images acceptance/api --format '{{.Tag}}' | tr '\n' ' '))"

log "rollback $current -> $target"
printf 'APP_VERSION=%s\n' "$target" > "$ACC_RELEASE_ENV"
dc up -d --wait --wait-timeout 180 $(rollback_services "$target")
wait_http "http://127.0.0.1/health" 30 || die "health check failed after rollback"
printf '%s %s rollback\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$target" >> "$ACC_RELEASES_LOG"
dc ps
