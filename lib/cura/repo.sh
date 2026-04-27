#!/usr/bin/env bash
# Locate and validate $CURA_REPO.

CURA_REPO="${CURA_REPO:-$HOME/workspace/misc/cura}"

cura_repo_check() {
  if [ ! -d "$CURA_REPO" ]; then
    echo "cura: \$CURA_REPO does not exist: $CURA_REPO" >&2
    echo "       set CURA_REPO=/path/to/cura" >&2
    return 1
  fi
  if [ ! -f "$CURA_REPO/CLAUDE.md" ] || [ ! -f "$CURA_REPO/docker-compose.local.yml" ]; then
    echo "cura: \$CURA_REPO does not look like the cura repo: $CURA_REPO" >&2
    echo "       expected CLAUDE.md and docker-compose.local.yml inside" >&2
    return 1
  fi
  return 0
}