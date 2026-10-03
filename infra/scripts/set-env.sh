#!/usr/bin/env bash
# Server-side: read KEY=VALUE lines from stdin and upsert them into /opt/acceptance/.env.
# Values are never printed (only key names). Used by push-ai-keys.sh; also handy for manual changes:
#   printf 'AI_DAILY_BUDGET_USD=30\n' | bash /opt/acceptance/app/infra/scripts/set-env.sh
. "$(dirname "$0")/lib.sh"
[ -f "$ACC_ENV" ] || die "$ACC_ENV missing; run init-secrets.sh first"
umask 077
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"
  case "$line" in ''|'#'*) continue ;; esac
  key="${line%%=*}"; value="${line#*=}"
  [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]] || { log "skipped invalid key"; continue; }
  # strip one level of surrounding quotes
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
  env_set "$key" "$value"
  log "set $key (${#value} chars)"
done
