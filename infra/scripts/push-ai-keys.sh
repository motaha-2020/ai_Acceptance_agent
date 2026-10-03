#!/usr/bin/env bash
# Local (dev machine, repo root): copy ANTHROPIC/GEMINI/OPENAI API keys from ./.env to the server's
# /opt/acceptance/.env over ssh stdin. Values are never echoed or passed on a command line.
# Then restart the worker:  infra/scripts/deploy.sh --restart worker
set -euo pipefail
DEPLOY_HOST="${DEPLOY_HOST:-deploy@178.104.221.75}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/acceptance_hetzner_ed25519}"
ENV_FILE="${1:-.env}"
[ -f "$ENV_FILE" ] || { echo "no $ENV_FILE" >&2; exit 1; }
n="$(grep -cE '^(ANTHROPIC_API_KEY|GEMINI_API_KEY|OPENAI_API_KEY)=.+' "$ENV_FILE" || true)"
echo "pushing $n AI key(s) from $ENV_FILE to $DEPLOY_HOST" >&2
grep -E '^(ANTHROPIC_API_KEY|GEMINI_API_KEY|OPENAI_API_KEY)=.+' "$ENV_FILE" \
  | tr -d '\r' \
  | ssh -i "$SSH_KEY" -o BatchMode=yes "$DEPLOY_HOST" 'bash /opt/acceptance/app/infra/scripts/set-env.sh'
