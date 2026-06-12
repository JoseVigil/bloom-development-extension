#!/usr/bin/env bash
# Normalize generated tree files — strip timestamps and absolute paths.
while IFS= read -r line || [[ -n "$line" ]]; do
  # Strip trailing timestamps: "  [2026-06-12 15:54]"
  line=$(echo "$line" | sed 's/[[:space:]]*\[[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}[^]]*\]$//')
  # Strip absolute paths leaking into tree output
  line="${line//$HOME/__HOME__}"
  echo "$line"
done
