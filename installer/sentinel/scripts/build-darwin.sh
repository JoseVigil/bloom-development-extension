#!/usr/bin/env bash
set -euo pipefail

# ───────────────────────────────────────────────────────────────
# Configuración básica
# ───────────────────────────────────────────────────────────────

GOOS=darwin
GOARCH=arm64          # Cambia a amd64 si necesitas soporte Intel
CGO_ENABLED=0

PLATFORM=darwin
APP_FOLDER=sentinel

# Rutas relativas desde installer/scripts/
OUTPUT_BASE=../../native/bin/${PLATFORM}/${APP_FOLDER}
OUTPUT_DIR="${OUTPUT_BASE}"
OUTPUT_FILE="${OUTPUT_DIR}/sentinel"          # sin .exe en macOS
HELP_DIR="${OUTPUT_DIR}/help"

mkdir -p "${OUTPUT_BASE}"
mkdir -p "${HELP_DIR}"

# Log en ubicación típica de macOS
LOG_BASE_DIR="${HOME}/Library/Logs/BloomNucleus/build"
LOG_FILE="${LOG_BASE_DIR}/sentinel.build.darwin.log"
mkdir -p "${LOG_BASE_DIR}"

# ───────────────────────────────────────────────────────────────
# Inicio del log
# ───────────────────────────────────────────────────────────────

echo "=============================================" > "${LOG_FILE}"
echo "Build Log - $(date '+%Y-%m-%d %H:%M:%S')" >> "${LOG_FILE}"
echo "=============================================" >> "${LOG_FILE}"
echo "" >> "${LOG_FILE}"

echo "============================================="
echo "🚧 Building Sentinel Base (Safe Mode) - ${GOOS}/${GOARCH}"
echo "============================================="
echo "🚧 Building Sentinel Base (Safe Mode) - ${GOOS}/${GOARCH}" >> "${LOG_FILE}"

echo "Environment:" >> "${LOG_FILE}"
echo "  GOOS=${GOOS}" >> "${LOG_FILE}"
echo "  GOARCH=${GOARCH}" >> "${LOG_FILE}"
echo "  CGO_ENABLED=${CGO_ENABLED}" >> "${LOG_FILE}"
echo "" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# Incrementar build number (compartido con Windows)
# ───────────────────────────────────────────────────────────────

echo ""
echo "Incrementando build number..."
echo "Incrementando build number..." >> "${LOG_FILE}"

BUILD_FILE=build_number.txt
BUILD_INFO=../internal/core/build_info.go

if [[ ! -f "${BUILD_FILE}" ]]; then
    echo 0 > "${BUILD_FILE}"
fi

CURRENT_BUILD=$(cat "${BUILD_FILE}")
NEXT_BUILD=$((CURRENT_BUILD + 1))

BUILD_DATE=$(date +%Y-%m-%d)
BUILD_TIME=$(date +%H:%M:00)

cat > "${BUILD_INFO}" << EOF
package core

// Auto-generated during build - DO NOT EDIT
// Generated: ${BUILD_DATE} ${BUILD_TIME}

const BuildNumber = ${NEXT_BUILD}
const BuildDate = "${BUILD_DATE}"
const BuildTime = "${BUILD_TIME}"
EOF

echo "${NEXT_BUILD}" > "${BUILD_FILE}"

echo "✅ Build number actualizado: ${NEXT_BUILD}"
echo "✅ Build number actualizado: ${NEXT_BUILD}" >> "${LOG_FILE}"
echo ""

# ───────────────────────────────────────────────────────────────
# Compilación
# ───────────────────────────────────────────────────────────────

echo "Compiling sentinel → ${OUTPUT_FILE} ..."
echo "Compiling sentinel → ${OUTPUT_FILE} ..." >> "${LOG_FILE}"

pushd .. >/dev/null
go build -p 1 -ldflags="-s -w" -o "${OUTPUT_FILE}" . >> "${LOG_FILE}" 2>&1
BUILD_RC=$?
popd >/dev/null

if [ ${BUILD_RC} -ne 0 ]; then
    echo "" >> "${LOG_FILE}"
    echo "❌ Compilation failed with error code: ${BUILD_RC}" >> "${LOG_FILE}"
    echo ""
    echo "❌ Compilation failed. Revisa el log: ${LOG_FILE}"
    exit ${BUILD_RC}
fi

echo "✅ Compilation successful: ${OUTPUT_FILE}"
echo "✅ Compilation successful: ${OUTPUT_FILE}" >> "${LOG_FILE}"
echo "" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# Copiar blueprint.json
# ───────────────────────────────────────────────────────────────

if [[ -f "../blueprint.json" ]]; then
    cp -f "../blueprint.json" "${OUTPUT_DIR}/blueprint.json"
    echo "📦 blueprint.json updated"
    echo "📦 blueprint.json updated" >> "${LOG_FILE}"
else
    echo "⚠️ No se encontró blueprint.json para copiar"
    echo "⚠️ No se encontró blueprint.json para copiar" >> "${LOG_FILE}"
fi

# ───────────────────────────────────────────────────────────────
# Generar documentación de ayuda
# ───────────────────────────────────────────────────────────────

echo ""
echo "============================================="
echo "   Generating Help Documentation"
echo "============================================="
echo "=============================================" >> "${LOG_FILE}"
echo "   Generating Help Documentation" >> "${LOG_FILE}"
echo "=============================================" >> "${LOG_FILE}"

echo ""
echo "Generating sentinel_help.json..."
echo "Generating sentinel_help.json..." >> "${LOG_FILE}"

"${OUTPUT_FILE}" --json-help > "${HELP_DIR}/sentinel_help.json" 2>> "${LOG_FILE}"
if [ $? -eq 0 ]; then
    echo "✅ JSON help generated: ${HELP_DIR}/sentinel_help.json"
    echo "✅ JSON help generated: ${HELP_DIR}/sentinel_help.json" >> "${LOG_FILE}"
else
    echo "⚠️ Warning: Failed to generate JSON help"
    echo "⚠️ Warning: Failed to generate JSON help (Error: $?)" >> "${LOG_FILE}"
fi

echo ""
echo "Generating sentinel_help.txt..."
echo "Generating sentinel_help.txt..." >> "${LOG_FILE}"

"${OUTPUT_FILE}" --help > "${HELP_DIR}/sentinel_help.txt" 2>> "${LOG_FILE}"
if [ $? -eq 0 ]; then
    echo "✅ Text help generated: ${HELP_DIR}/sentinel_help.txt"
    echo "✅ Text help generated: ${HELP_DIR}/sentinel_help.txt" >> "${LOG_FILE}"
else
    echo "⚠️ Warning: Failed to generate text help"
    echo "⚠️ Warning: Failed to generate text help (Error: $?)" >> "${LOG_FILE}"
fi

# ───────────────────────────────────────────────────────────────
# Resumen final
# ───────────────────────────────────────────────────────────────

echo ""
echo "============================================="
echo "🎉 Sentinel Build completed."
echo "============================================="
echo "🎉 Sentinel Build completed successfully" >> "${LOG_FILE}"
echo ""
echo "📦 Output files:"
echo "  Executable: ${OUTPUT_FILE}"
echo "" >> "${LOG_FILE}"
echo "Output files:" >> "${LOG_FILE}"
echo "  Executable: ${OUTPUT_FILE}" >> "${LOG_FILE}"

if [[ -f "${HELP_DIR}/sentinel_help.json" ]]; then
    echo "  Help JSON: ${HELP_DIR}/sentinel_help.json"
    echo "  Help JSON: ${HELP_DIR}/sentinel_help.json" >> "${LOG_FILE}"
fi

if [[ -f "${HELP_DIR}/sentinel_help.txt" ]]; then
    echo "  Help TXT:  ${HELP_DIR}/sentinel_help.txt"
    echo "  Help TXT:  ${HELP_DIR}/sentinel_help.txt" >> "${LOG_FILE}"
fi

echo ""
echo "📋 Log guardado en: ${LOG_FILE}"
echo ""

exit 0