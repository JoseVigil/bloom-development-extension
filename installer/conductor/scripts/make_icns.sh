#!/usr/bin/env bash
# conductor/scripts/make_icns.sh
# Convierte bloom.ico → bloom.icns para el empaquetado macOS con Electron Forge.
#
# Destino: conductor/workspace/assets/bloom.icns
# (junto al bloom.ico que ya existe en ese directorio)
#
# USO (desde la raíz de conductor/):
#   bash scripts/make_icns.sh
#
# REQUISITOS: macOS — usa sips e iconutil (incluidos en macOS, no requieren Homebrew)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONDUCTOR_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

SOURCE="$CONDUCTOR_DIR/workspace/assets/bloom.ico"
OUT_ICNS="$CONDUCTOR_DIR/workspace/assets/bloom.icns"

if [[ ! -f "$SOURCE" ]]; then
  echo "❌  No se encontró bloom.ico en: $SOURCE"
  exit 1
fi

echo "→ Fuente  : $SOURCE"
echo "→ Destino : $OUT_ICNS"

ICONSET_DIR="$(mktemp -d)/bloom.iconset"
mkdir -p "$ICONSET_DIR"

BASE_PNG="$(mktemp).png"
sips -s format png "$SOURCE" --out "$BASE_PNG" \
  --resampleHeightWidthMax 1024 \
  > /dev/null 2>&1

echo "→ Generando tamaños del iconset..."

# Formato: "nombre_archivo px"
SIZES=(
  "icon_16x16.png 16"
  "icon_16x16@2x.png 32"
  "icon_32x32.png 32"
  "icon_32x32@2x.png 64"
  "icon_128x128.png 128"
  "icon_128x128@2x.png 256"
  "icon_256x256.png 256"
  "icon_256x256@2x.png 512"
  "icon_512x512.png 512"
  "icon_512x512@2x.png 1024"
)

for ENTRY in "${SIZES[@]}"; do
  FILENAME="${ENTRY% *}"
  PX="${ENTRY##* }"
  sips -z "$PX" "$PX" "$BASE_PNG" --out "$ICONSET_DIR/$FILENAME" > /dev/null 2>&1
done

echo "→ Compilando con iconutil..."
iconutil --convert icns "$ICONSET_DIR" --output "$OUT_ICNS"

rm -rf "$(dirname "$ICONSET_DIR")" "$BASE_PNG"

echo "✅  bloom.icns → $OUT_ICNS"
echo "    $(du -h "$OUT_ICNS" | cut -f1)"
