#!/usr/bin/env bash
set -euo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$LIB_DIR/repo.sh"

cura_repo_check

compose_file="${CURA_COMPOSE_FILE:-$CURA_REPO/docker-compose.local.yml}"

if [ ! -f "$compose_file" ]; then
  echo "cura down: compose file not found: $compose_file" >&2
  exit 1
fi

echo "→ docker compose -f $compose_file down $*"
exec docker compose -f "$compose_file" down "$@"