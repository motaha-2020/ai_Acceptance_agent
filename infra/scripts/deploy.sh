#!/usr/bin/env bash
# Idempotent deploy of the acceptance system to the Hetzner VPS.
#
# From the dev machine (repo root, Git Bash is fine):
#   infra/scripts/deploy.sh                 ship HEAD -> build api/worker/web -> migrate -> seed -> up -d -> health check
#   infra/scripts/deploy.sh --restart worker   restart services only (e.g. after push-ai-keys.sh)
#   infra/scripts/deploy.sh --sync-only        first-time bootstrap: sync + create /opt/acceptance/.env, no build
# Env: DEPLOY_HOST (default deploy@178.104.221.75), SSH_KEY (default ~/.ssh/acceptance_hetzner_ed25519),
#      DEPLOY_SOURCE=head (default: the committed HEAD, via git archive, so other people's uncommitted
#      work never reaches production) | worktree (tracked + untracked-not-ignored files, for hotfix trials)
#
# On the server (what the local run executes after syncing):
#   bash /opt/acceptance/app/infra/scripts/deploy.sh --on-server <version>
#
# Either way node_modules, dist, data/, .env and local credential files never leave the machine.
set -euo pipefail

DEPLOY_HOST="${DEPLOY_HOST:-deploy@178.104.221.75}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/acceptance_hetzner_ed25519}"
DEPLOY_SOURCE="${DEPLOY_SOURCE:-head}"
SSH=(ssh -i "$SSH_KEY" -o BatchMode=yes -o ServerAliveInterval=30 "$DEPLOY_HOST")

# gzip'd tar of the source to ship, on stdout.
source_tar() {
  if [ "$DEPLOY_SOURCE" = head ]; then
    git archive --format=tar.gz HEAD
    return
  fi
  git ls-files -z --cached --others --exclude-standard \
    | while IFS= read -r -d '' f; do
        [ -e "$f" ] || continue                       # deleted but still tracked
        case "$f" in .env|.env.*|*SSH*.txt|*.pem|*.key) [ "$f" = .env.example ] || continue ;; esac
        printf '%s\0' "$f"
      done \
    | tar --null -T - -czf -
}

local_main() {
  if [ "${1:-}" = "--restart" ]; then
    shift
    "${SSH[@]}" "bash -lc '. /opt/acceptance/app/infra/scripts/lib.sh && dc up -d --force-recreate --no-deps $* && dc ps'"
    return
  fi
  local sync_only=0
  [ "${1:-}" = "--sync-only" ] && sync_only=1
  cd "$(git rev-parse --show-toplevel)"
  local version
  version="$(date -u +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
  [ "$DEPLOY_SOURCE" != head ] && [ -n "$(git status --porcelain)" ] && version="${version}-dirty"
  echo ">> deploying $version ($DEPLOY_SOURCE) to $DEPLOY_HOST" >&2

  # One-time bootstrap of /opt/acceptance (owner deploy).
  "${SSH[@]}" 'sudo install -d -o deploy -g deploy -m 750 /opt/acceptance /opt/acceptance/backups'

  echo ">> syncing source" >&2
  source_tar \
    | "${SSH[@]}" 'set -e; rm -rf /opt/acceptance/app.new; mkdir -p /opt/acceptance/app.new; tar -xzf - -C /opt/acceptance/app.new;
                   rm -rf /opt/acceptance/app.prev; [ -d /opt/acceptance/app ] && mv /opt/acceptance/app /opt/acceptance/app.prev; mv /opt/acceptance/app.new /opt/acceptance/app'

  if [ "$sync_only" = 1 ]; then
    "${SSH[@]}" 'bash /opt/acceptance/app/infra/scripts/init-secrets.sh'
    return
  fi
  "${SSH[@]}" "bash /opt/acceptance/app/infra/scripts/deploy.sh --on-server '$version'"
}

server_main() {
  local version="$1"
  . "$(dirname "$0")/lib.sh"
  cd "$ACC_APP"

  bash infra/scripts/init-secrets.sh
  local previous=""
  [ -f "$ACC_RELEASE_ENV" ] && previous="$(grep -E '^APP_VERSION=' "$ACC_RELEASE_ENV" | cut -d= -f2-)"

  log "building images $version (sequential, memory-safe)"
  export APP_VERSION="$version"
  dc build api
  dc build worker
  dc build web

  log "datastores"
  dc up -d --wait postgres redis minio
  dc run --rm minio-init

  log "migrations"
  dc run --rm --no-deps -T api node packages/db/node_modules/prisma/build/index.js migrate deploy --schema packages/db/prisma/schema.prisma

  log "seed (idempotent)"
  SEED_ADMIN_PASSWORD="$(cat "$ACC_ROOT/ADMIN_PASSWORD")" \
  SEED_ADMIN_EMAIL="$(env_get SEED_ADMIN_EMAIL)" \
    dc run --rm --no-deps -T -e SEED_ADMIN_PASSWORD -e SEED_ADMIN_EMAIL api node packages/db/dist/cli/seed.js

  log "starting $version"
  printf 'APP_VERSION=%s\n' "$version" > "$ACC_RELEASE_ENV"
  if ! dc up -d --wait --wait-timeout 180 api worker web caddy \
     || ! wait_http "http://127.0.0.1/health" 30 \
     || ! curl -fsS --max-time 10 -o /dev/null "http://127.0.0.1/health/ready"; then
    log "health check FAILED for $version"
    dc ps
    dc logs --tail=80 api worker web caddy || true
    if [ -n "$previous" ]; then
      log "auto-rollback to $previous"
      printf 'APP_VERSION=%s\n' "$previous" > "$ACC_RELEASE_ENV"
      APP_VERSION="$previous" dc up -d --wait --wait-timeout 180 $(rollback_services "$previous") || true
    fi
    exit 1
  fi
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$version" >> "$ACC_RELEASES_LOG"

  install_backup_timer
  prune_images
  dc ps
  log "deployed $version: $(curl -fsS --max-time 5 http://127.0.0.1/health/ready)"
}

install_backup_timer() {
  local changed=0 f
  for f in acceptance-backup.service acceptance-backup.timer; do
    if ! cmp -s "$ACC_APP/infra/systemd/$f" "/etc/systemd/system/$f"; then
      sudo install -m 644 "$ACC_APP/infra/systemd/$f" "/etc/systemd/system/$f"; changed=1
    fi
  done
  if [ "$changed" = 1 ]; then sudo systemctl daemon-reload; fi
  sudo systemctl enable --now acceptance-backup.timer >/dev/null 2>&1
}

# Keep the 3 most recent versions of each app image (rollback targets).
prune_images() {
  local repo
  for repo in acceptance/api acceptance/worker acceptance/web; do
    docker images "$repo" --format '{{.Tag}}' | grep -v '^latest$' | sort -r | tail -n +4 \
      | xargs -r -I{} docker rmi "$repo:{}" >/dev/null 2>&1 || true
  done
  docker builder prune -f --filter until=168h >/dev/null 2>&1 || true
}

if [ "${1:-}" = "--on-server" ]; then
  server_main "${2:?version}"
else
  local_main "$@"
fi
