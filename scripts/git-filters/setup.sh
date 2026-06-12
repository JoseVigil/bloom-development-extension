#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v python3 &>/dev/null; then
  PY="python3"
elif command -v python &>/dev/null; then
  PY="python"
else
  echo "❌  Python no encontrado. Instalar Python y volver a correr este script."
  exit 1
fi
echo "   Python detectado: $PY ($(${PY} --version 2>&1))"

reg() {
  git config "filter.${1}.clean"    "$2"
  git config "filter.${1}.smudge"   "cat"
  git config "filter.${1}.required" "true"
}

reg bloom-stamp    "\"$ROOT/clean-stamp.sh\""
reg bloom-meta     "$PY \"$ROOT/clean-meta.py\""
reg bloom-header   "\"$ROOT/clean-header.sh\""
reg bloom-pymod    "\"$ROOT/clean-pymod.sh\""
reg bloom-spec     "\"$ROOT/clean-spec.sh\""
reg bloom-lockfile "$PY \"$ROOT/clean-lockfile.py\""
reg bloom-tree     "\"$ROOT/clean-tree.sh\""

echo ""
echo "✅  Bloom git filters registered."
git config --list | grep "^filter\.bloom" | sed 's/^/   /'
echo ""
echo "Next:  git ls-files -m | xargs git rm --cached && git add . && git restore --staged ."
