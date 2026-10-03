#!/usr/bin/env bash
# Server-side backup (daily via acceptance-backup.timer; safe to run by hand):
#   /opt/acceptance/backups/postgres/acceptance-<utc>.dump   pg_dump custom format, kept KEEP_DAYS (7)
#   /opt/acceptance/backups/minio/<bucket>/...               incremental mirror of the photo bucket
#                                                            (no --remove: objects deleted in MinIO stay here)
# Restore: see infra/README.md ("Restore from backup").
. "$(dirname "$0")/lib.sh"

KEEP_DAYS="${KEEP_DAYS:-7}"
DEST="$ACC_ROOT/backups"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$DEST/postgres" "$DEST/minio"
umask 077

log "pg_dump -> postgres/acceptance-$ts.dump"
dc exec -T postgres pg_dump -U acceptance -d acceptance -Fc --no-owner > "$DEST/postgres/acceptance-$ts.dump.partial"
mv "$DEST/postgres/acceptance-$ts.dump.partial" "$DEST/postgres/acceptance-$ts.dump"

bucket="$(env_get S3_BUCKET || true)"; bucket="${bucket:-photos}"
mc_image="$(env_get MC_IMAGE || true)"; mc_image="${mc_image:-pgsty/mc:RELEASE.2026-09-16T00-00-00Z}"
log "minio mirror -> minio/$bucket"
# MC_HOST_src carries the root credentials inside the container env only (not on the host command line).
MC_HOST_src="http://$(env_get MINIO_ROOT_USER):$(env_get MINIO_ROOT_PASSWORD)@minio:9000" \
docker run --rm --network acceptance_data \
  -e MC_HOST_src -e HOME=/tmp \
  --user "$(id -u):$(id -g)" \
  -v "$DEST/minio:/backup" \
  "$mc_image" \
  mirror --overwrite --preserve --quiet "src/$bucket" "/backup/$bucket" >/dev/null

find "$DEST/postgres" -name 'acceptance-*.dump' -mtime +"$KEEP_DAYS" -delete
find "$DEST/postgres" -name '*.partial' -mmin +120 -delete

log "backup ok: $(du -sh "$DEST/postgres" | cut -f1) dumps, $(du -sh "$DEST/minio" | cut -f1) objects"
