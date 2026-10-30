#!/usr/bin/env bash
# The ONE compose command for every ops script (BACKUP_AND_RECOVERY §2). Source it:
#   source /opt/rkds/app/scripts/lib/compose.sh && $COMPOSE ps
# Always project `rkds`, always the explicit files, so other stacks (n8n, Evolution API) are never touched.

RKDS_HOME="${RKDS_HOME:-/opt/rkds}"
RKDS_APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RKDS_ENV_FILE="${RKDS_ENV_FILE:-$RKDS_HOME/.env}"

if [ ! -f "$RKDS_ENV_FILE" ]; then
  echo "compose.sh: env file not found: $RKDS_ENV_FILE" >&2
  return 1 2>/dev/null || exit 1
fi

RKDS_PROXY_OVERLAY="$(grep -E '^RKDS_PROXY_OVERLAY=' "$RKDS_ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"'"'"' \r')"
case "$RKDS_PROXY_OVERLAY" in
  traefik | host) ;;
  *)
    echo "compose.sh: RKDS_PROXY_OVERLAY must be 'traefik' or 'host' (got '$RKDS_PROXY_OVERLAY')" >&2
    return 1 2>/dev/null || exit 1
    ;;
esac

RKDS_PROJECT="$(grep -E '^COMPOSE_PROJECT_NAME=' "$RKDS_ENV_FILE" | tail -n1 | cut -d= -f2- | tr -d '"'"'"' \r')"
RKDS_PROJECT="${RKDS_PROJECT:-rkds}"

COMPOSE="docker compose -p $RKDS_PROJECT --env-file $RKDS_ENV_FILE -f $RKDS_APP_DIR/docker-compose.yml -f $RKDS_APP_DIR/docker-compose.proxy-$RKDS_PROXY_OVERLAY.yml"
export COMPOSE RKDS_HOME RKDS_APP_DIR RKDS_ENV_FILE
