#!/bin/bash
# bloom-conductor-version.sh
# macOS equivalent of bloom-conductor-version.ps1
# Resolves build_info.json from the .app bundle and prints version info.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_INFO="$SCRIPT_DIR/Contents/Resources/app.asar.unpacked/build_info.json"

if [ ! -f "$BUILD_INFO" ]; then
  echo "Error: build_info.json not found at: $BUILD_INFO" >&2
  exit 1
fi

if [ "$1" = "--json" ]; then
  cat "$BUILD_INFO"
else
  python3 -c "
import json, sys

with open(sys.argv[1], 'r') as f:
    info = json.load(f)

fields = ['product_name', 'version', 'build', 'full_version', 'channel', 'built_at', 'git_commit', 'platform', 'arch']
for key in fields:
    val = info.get(key, '')
    print(f'{key}: {val}')
" "$BUILD_INFO"
fi
