#!/usr/bin/env bash
# Normalize Python build module — zero BUILD_NUMBER assignment.
while IFS= read -r line || [[ -n "$line" ]]; do
  # BUILD_NUMBER = 134  →  BUILD_NUMBER = 0
  if [[ "$line" =~ ^(BUILD_NUMBER[[:space:]]*=[[:space:]]*)[0-9]+(.*)$ ]]; then
    echo "${BASH_REMATCH[1]}0${BASH_REMATCH[2]}"
  # BUILD_DATE = "..."  →  BUILD_DATE = "1970-01-01"
  elif [[ "$line" =~ ^(BUILD_DATE[[:space:]]*=[[:space:]]*\")[^\"]+(\".*)$ ]]; then
    echo "${BASH_REMATCH[1]}1970-01-01${BASH_REMATCH[2]}"
  else
    echo "$line"
  fi
done
