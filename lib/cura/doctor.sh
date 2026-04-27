#!/usr/bin/env bash
# cura doctor — verifies Cura dev-env + delegates to 'che doctor'.
# Usage: cura doctor [all|che|repo|compose]
set -uo pipefail

LIB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$LIB_DIR/repo.sh"
. "$LIB_DIR/che.sh"

if [ -t 1 ]; then
  C_GREEN=$'\033[32m'; C_RED=$'\033[31m'; C_DIM=$'\033[2m'; C_RESET=$'\033[0m'
else
  C_GREEN=""; C_RED=""; C_DIM=""; C_RESET=""
fi
ok()   { printf "  ${C_GREEN}✓${C_RESET} %s\n" "$1"; }
fail() { printf "  ${C_RED}✗${C_RESET} %s\n" "$1"; }
info() { printf "    ${C_DIM}%s${C_RESET}\n" "$1"; }

target="${1:-all}"

cura_che_section() {
  printf 'che-cli:\n'
  if command -v che >/dev/null 2>&1; then
    ok "che on \$PATH: $(command -v che)"
  else
    fail "che not on \$PATH (cura-cli builds on che-cli)"
    info "install: https://chevp.github.io/che-cli/"
  fi
}

cura_repo_section() {
  printf 'cura repo:\n'
  if [ -d "$CURA_REPO" ]; then
    ok "CURA_REPO: $CURA_REPO"
  else
    fail "CURA_REPO not found: $CURA_REPO"
    return
  fi
  for f in CLAUDE.md docker-compose.local.yml docker-compose.e2e.yml; do
    if [ -e "$CURA_REPO/$f" ]; then
      ok "$f"
    else
      fail "$f missing"
    fi
  done
}

cura_compose_section() {
  printf 'docker compose:\n'
  if docker compose version >/dev/null 2>&1; then
    ok "docker compose v2: $(docker compose version --short 2>/dev/null)"
  elif command -v docker-compose >/dev/null 2>&1; then
    fail "only docker-compose v1 found — cura-cli expects v2 (docker compose)"
  else
    fail "docker compose not available"
  fi
}

case "$target" in
  che)      cura_che_section ;;
  repo)     cura_repo_section ;;
  compose)  cura_compose_section ;;
  all|"")
    cura_che_section
    printf '\n'
    cura_repo_section
    printf '\n'
    cura_compose_section
    printf '\n'
    if command -v che >/dev/null 2>&1; then
      printf 'che doctor:\n'
      che doctor 2>&1 | sed 's/^/  /'
    fi
    ;;
  -h|--help)
    cat <<EOF
cura doctor — verify Cura dev-env + run 'che doctor'.

Usage: cura doctor [target]

Targets:
  all       run all checks + 'che doctor' (default)
  che       only check that che-cli is installed
  repo      only check \$CURA_REPO
  compose   only check 'docker compose'

Environment:
  CURA_REPO   path to the cura repo (default: \$HOME/workspace/misc/cura)
EOF
    ;;
  *)
    echo "cura doctor: unknown target '$target'" >&2
    echo "valid: all, che, repo, compose" >&2
    exit 1
    ;;
esac
