#!/usr/bin/env bash
# Follow container logs. Works on the server or from the dev machine (via ssh).
#   infra/scripts/logs.sh                 all services, last 200 lines, follow
#   infra/scripts/logs.sh worker api      selected services
#   TAIL=50 FOLLOW=0 infra/scripts/logs.sh worker
set -euo pipefail
TAIL="${TAIL:-200}"
FOLLOW="${FOLLOW:-1}"
args=(logs --tail="$TAIL" --timestamps)
[ "$FOLLOW" = 1 ] && args+=(-f)

if [ -d /opt/acceptance/app ] && command -v docker >/dev/null 2>&1; then
  . "$(dirname "$0")/lib.sh"
  dc "${args[@]}" "$@"
else
  DEPLOY_HOST="${DEPLOY_HOST:-deploy@178.104.221.75}"
  SSH_KEY="${SSH_KEY:-$HOME/.ssh/acceptance_hetzner_ed25519}"
  ssh -t -i "$SSH_KEY" "$DEPLOY_HOST" "TAIL=$TAIL FOLLOW=$FOLLOW bash /opt/acceptance/app/infra/scripts/logs.sh $*"
fi
