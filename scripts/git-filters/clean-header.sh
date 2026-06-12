#!/usr/bin/env bash
# Normalize C build header — zero volatile #defines, keep VERSION_STRING.
while IFS= read -r line || [[ -n "$line" ]]; do
  # #define BUILD_NUMBER 175  →  #define BUILD_NUMBER 0
  if [[ "$line" =~ ^(#define[[:space:]]+BUILD_NUMBER[[:space:]]+)[0-9]+(.*)$ ]]; then
    echo "${BASH_REMATCH[1]}0${BASH_REMATCH[2]}"
  # #define BUILD_DATE "2026-06-12"  →  #define BUILD_DATE "1970-01-01"
  elif [[ "$line" =~ ^(#define[[:space:]]+BUILD_DATE[[:space:]]+\")[^\"]+(\".*)$ ]]; then
    echo "${BASH_REMATCH[1]}1970-01-01${BASH_REMATCH[2]}"
  # #define BUILD_TIME "12:53:34"  →  #define BUILD_TIME "00:00:00"
  elif [[ "$line" =~ ^(#define[[:space:]]+BUILD_TIME[[:space:]]+\")[^\"]+(\".*)$ ]]; then
    echo "${BASH_REMATCH[1]}00:00:00${BASH_REMATCH[2]}"
  else
    echo "$line"
  fi
done
