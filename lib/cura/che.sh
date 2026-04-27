#!/usr/bin/env bash
# Ensure che-cli is available — cura-cli builds on che-cli, never duplicates it.

cura_require_che() {
  if ! command -v che >/dev/null 2>&1; then
    echo "cura: 'che' not found on \$PATH" >&2
    echo "       cura-cli builds on che-cli — install it first:" >&2
    echo "       https://chevp.github.io/che-cli/" >&2
    return 1
  fi
  return 0
}