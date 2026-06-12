#!/usr/bin/env bash
# =============================================================================
# Bloom — git filter setup
# Run ONCE after cloning: bash scripts/git-filters/setup.sh
# Safe to re-run (idempotent).
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

reg() {
  local name="$1" clean="$2"
  git config "filter.${name}.clean"    "$clean"
  git config "filter.${name}.smudge"   "cat"
  git config "filter.${name}.required" "true"
}

reg bloom-stamp    "\"$ROOT/clean-stamp.sh\""
reg bloom-meta     "python3 \"$ROOT/clean-meta.py\""
reg bloom-header   "\"$ROOT/clean-header.sh\""
reg bloom-pymod    "\"$ROOT/clean-pymod.sh\""
reg bloom-spec     "\"$ROOT/clean-spec.sh\""
reg bloom-lockfile "\"$ROOT/clean-lockfile.sh\""
reg bloom-tree     "\"$ROOT/clean-tree.sh\""

echo ""
echo "✅  Bloom git filters registered."
echo ""
echo "Registered filters:"
git config --list | grep "^filter\." | sed 's/^/   /'
echo ""
echo "Next: force git to re-evaluate already-dirty files:"
echo "   git ls-files -m | xargs git checkout --"
