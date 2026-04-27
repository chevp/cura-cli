#!/usr/bin/env bash
set -euo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$LIB_DIR/repo.sh"
. "$LIB_DIR/che.sh"

cura_repo_check
cura_require_che

cd "$CURA_REPO"
echo "→ (in $CURA_REPO) che ship $*"
exec che ship "$@"