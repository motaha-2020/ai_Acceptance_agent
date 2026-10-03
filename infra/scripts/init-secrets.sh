#!/usr/bin/env bash
# Server-side, idempotent: create /opt/acceptance/.env with strong random secrets (missing keys only;
# existing values are never changed) and /opt/acceptance/ADMIN_PASSWORD. Prints no secret.
#   bash /opt/acceptance/app/infra/scripts/init-secrets.sh
. "$(dirname "$0")/lib.sh"

umask 077
mkdir -p "$ACC_ROOT"
[ -f "$ACC_ENV" ] || { printf '# Acceptance system production settings. chmod 600. Never commit.\n' > "$ACC_ENV"; }
chmod 600 "$ACC_ENV"

hex() { openssl rand -hex "$1"; }
b64() { openssl rand -base64 "$1" | tr -d '\n=' | tr '+/' '-_'; }
ensure() { grep -qE "^$1=" "$ACC_ENV" || { env_set "$1" "$2"; log "generated $1"; }; }

ip="$(hostname -I | awk '{print $1}')"   # Hetzner: the public IPv4 is on eth0

# Public address. Add a domain later: set DOMAIN=example.com and PUBLIC_URL=https://example.com, redeploy.
ensure DOMAIN ""
ensure PUBLIC_URL "http://${ip}"
ensure CORS_ORIGINS ""
ensure SWAGGER_ENABLED "false"
ensure LOG_LEVEL "info"

# Datastores (hex: safe inside URLs)
ensure POSTGRES_PASSWORD "$(hex 24)"
ensure REDIS_PASSWORD "$(hex 24)"
ensure MINIO_ROOT_USER "root-$(hex 6)"
ensure MINIO_ROOT_PASSWORD "$(hex 24)"
ensure S3_ACCESS_KEY "app-$(hex 8)"
ensure S3_SECRET_KEY "$(hex 24)"
ensure S3_BUCKET "photos"

# API
ensure JWT_ACCESS_SECRET "$(b64 48)"
ensure STORAGE_SIGNING_SECRET "$(b64 48)"

# AI (keys are pushed separately with push-ai-keys.sh)
ensure AI_PROVIDER "claude"
ensure AI_MODEL "claude-sonnet-5-5"
ensure AI_CONCURRENCY "2"
ensure AI_DAILY_BUDGET_USD "20"
ensure ANTHROPIC_API_KEY ""
ensure GEMINI_API_KEY ""
ensure OPENAI_API_KEY ""

ensure SEED_ADMIN_EMAIL "admin@acceptance.local"

if [ ! -s "$ACC_ROOT/ADMIN_PASSWORD" ]; then
  b64 24 > "$ACC_ROOT/ADMIN_PASSWORD"
  log "generated $ACC_ROOT/ADMIN_PASSWORD"
fi
chmod 600 "$ACC_ROOT/ADMIN_PASSWORD"
log "secrets ok: $ACC_ENV"
