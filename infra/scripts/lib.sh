# Shared helpers for the server-side ops scripts. Source it: . "$(dirname "$0")/lib.sh"
# Layout on the server:
#   /opt/acceptance/.env            secrets + settings (chmod 600, owner deploy)  -- never committed
#   /opt/acceptance/release.env     APP_VERSION of the running images (written by deploy/rollback)
#   /opt/acceptance/releases.log    one line per successful deploy: <utc time> <version>
#   /opt/acceptance/ADMIN_PASSWORD  seed admin password (chmod 600)
#   /opt/acceptance/app             current source tree (compose file, Caddyfile, scripts)
#   /opt/acceptance/backups         pg dumps + MinIO mirror
set -euo pipefail

ACC_ROOT="${ACC_ROOT:-/opt/acceptance}"
ACC_APP="$ACC_ROOT/app"
ACC_ENV="$ACC_ROOT/.env"
ACC_RELEASE_ENV="$ACC_ROOT/release.env"
ACC_RELEASES_LOG="$ACC_ROOT/releases.log"
COMPOSE_FILE_PATH="$ACC_APP/infra/docker-compose.prod.yml"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

# docker compose with the production project, env files and compose file.
dc() {
  local files=(--env-file "$ACC_ENV")
  [ -f "$ACC_RELEASE_ENV" ] && files+=(--env-file "$ACC_RELEASE_ENV")
  docker compose -p acceptance "${files[@]}" -f "$COMPOSE_FILE_PATH" "$@"
}

# Read one key from the env file without printing anything else.
env_get() { grep -E "^$1=" "$ACC_ENV" | tail -n1 | cut -d= -f2-; }

# Upsert KEY=VALUE into the env file (value never echoed).
env_set() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp "$ACC_ROOT/.env.XXXXXX")"
  chmod 600 "$tmp"
  grep -vE "^${key}=" "$ACC_ENV" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  mv "$tmp" "$ACC_ENV"
}

# Wait until a URL answers 2xx (through Caddy on the host's port 80).
wait_http() {
  local url="$1" tries="${2:-30}"
  for _ in $(seq 1 "$tries"); do
    if curl -fsS -o /dev/null --max-time 5 "$url"; then return 0; fi
    sleep 2
  done
  return 1
}

# Services to switch on a rollback to <version>: api + worker always, web when that version has a web image.
rollback_services() {
  local v="$1"
  if docker image inspect "acceptance/web:$v" >/dev/null 2>&1; then echo "api worker web"; else echo "api worker"; fi
}
