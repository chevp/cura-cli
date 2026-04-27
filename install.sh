#!/usr/bin/env bash
set -euo pipefail

PREFIX="${PREFIX:-$HOME/.local}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

mkdir -p "$PREFIX/bin" "$PREFIX/lib/cura"

install -m 0755 "$SRC/bin/cura" "$PREFIX/bin/cura"

# Mirror the lib tree (preserves subfolders: stack/, git/).
cp -R "$SRC/lib/cura/." "$PREFIX/lib/cura/"
find "$PREFIX/lib/cura" -name "*.sh" -exec chmod 0755 {} +

echo "installed:"
echo "  $PREFIX/bin/cura"
echo "  $PREFIX/lib/cura/  (full tree)"
echo

shell_rc=""
case "$(basename "${SHELL:-}")" in
  zsh)  shell_rc="$HOME/.zshrc" ;;
  bash)
    if [ "$(uname -s)" = "Darwin" ] && [ -f "$HOME/.bash_profile" ]; then
      shell_rc="$HOME/.bash_profile"
    else
      shell_rc="$HOME/.bashrc"
    fi
    ;;
esac

export_line="export PATH=\"$PREFIX/bin:\$PATH\""

case ":$PATH:" in
  *":$PREFIX/bin:"*)
    echo "PATH is set up — try: cura doctor"
    ;;
  *)
    if [ -n "$shell_rc" ] && [ "${CURA_NO_PATH_EDIT:-0}" != "1" ]; then
      touch "$shell_rc"
      if ! grep -Fqs "$export_line" "$shell_rc"; then
        {
          echo ""
          echo "# added by cura-cli install.sh"
          echo "$export_line"
        } >> "$shell_rc"
        echo "added $PREFIX/bin to PATH in $shell_rc"
      else
        echo "$shell_rc already contains the PATH export"
      fi
      echo "open a new terminal (or: source $shell_rc), then run: cura doctor"
    else
      echo "add to your shell rc:"
      echo "  $export_line"
    fi
    ;;
esac

if ! command -v che >/dev/null 2>&1; then
  echo
  echo "note: cura-cli builds on che-cli, but 'che' is not on \$PATH yet."
  echo "      install che-cli: https://chevp.github.io/che-cli/"
fi
