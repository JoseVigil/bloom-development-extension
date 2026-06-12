#!/usr/bin/env bash
# Normalize plain build stamps (integers, version strings).
# Keeps structure, zeros the volatile counter so git sees no diff
# when two machines differ only in build number.
while IFS= read -r line || [[ -n "$line" ]]; do
  # Pure integer (e.g. 134133118) → 0
  if [[ "$line" =~ ^[[:space:]]*[0-9]+[[:space:]]*$ ]]; then
    echo "0"
  # Compound build version e.g. 1.0.0.134 → 1.0.0.0
  elif [[ "$line" =~ ^([0-9]+\.[0-9]+\.[0-9]+)\.([0-9]+)$ ]]; then
    echo "${BASH_REMATCH[1]}.0"
  else
    echo "$line"
  fi
done
