#!/usr/bin/env bash
set -euo pipefail

# ───────────────────────────────────────────────────────────────
# Configuración básica
# ───────────────────────────────────────────────────────────────

GOOS=darwin
GOARCH=arm64          # o amd64 si necesitas soporte Intel
CGO_ENABLED=0

PLATFORM=darwin
APP_FOLDER=nucleus

# Rutas relativas desde installer/nucleus/scripts/
OUTPUT_BASE=../../../native/bin/${PLATFORM}/${APP_FOLDER}
OUTPUT_DIR="${OUTPUT_BASE}"
OUTPUT_FILE="${OUTPUT_DIR}/nucleus"
HELP_DIR="${OUTPUT_DIR}/help"

mkdir -p "${OUTPUT_BASE}"
mkdir -p "${HELP_DIR}"

# Log en ubicación estándar de macOS
LOG_BASE_DIR="${HOME}/Library/Logs/BloomNucleus/build"
LOG_FILE="${LOG_BASE_DIR}/nucleus.build.darwin.log"
mkdir -p "${LOG_BASE_DIR}"

# Inicio del log
echo "=============================================" > "${LOG_FILE}"
echo "Build Log - $(date '+%Y-%m-%d %H:%M:%S')" >> "${LOG_FILE}"
echo "=============================================" >> "${LOG_FILE}"
echo "" >> "${LOG_FILE}"

echo "============================================="
echo "🚧 Building Nucleus Base (Safe Mode) - ${GOOS}/${GOARCH}"
echo "============================================="
echo "🚧 Building Nucleus Base (Safe Mode) - ${GOOS}/${GOARCH}" >> "${LOG_FILE}"

echo "Environment:" >> "${LOG_FILE}"
echo "  GOOS=${GOOS}" >> "${LOG_FILE}"
echo "  GOARCH=${GOARCH}" >> "${LOG_FILE}"
echo "  CGO_ENABLED=${CGO_ENABLED}" >> "${LOG_FILE}"
echo "" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# Incrementar build number
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

echo "Compiling nucleus → ${OUTPUT_FILE} ..."
echo "Compiling nucleus → ${OUTPUT_FILE} ..." >> "${LOG_FILE}"

pushd .. >/dev/null

go build -p 1 -ldflags="-s -w" -o "${OUTPUT_FILE}" ./cmd/nucleus >> "${LOG_FILE}" 2>&1
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
    echo "📦 blueprint.json copiado"
    echo "📦 blueprint.json copiado" >> "${LOG_FILE}"
else
    echo "⚠️ blueprint.json no encontrado"
    echo "⚠️ blueprint.json no encontrado" >> "${LOG_FILE}"
fi

# ───────────────────────────────────────────────────────────────
# Generar ayuda
# ───────────────────────────────────────────────────────────────

echo ""
echo "============================================="
echo "   Generating Help Documentation"
echo "============================================="
echo "=============================================" >> "${LOG_FILE}"
echo "   Generating Help Documentation" >> "${LOG_FILE}"
echo "=============================================" >> "${LOG_FILE}"

echo ""
echo "Generating nucleus_help.json..."
echo "Generating nucleus_help.json..." >> "${LOG_FILE}"

"${OUTPUT_FILE}" --json-help > "${HELP_DIR}/nucleus_help.json" 2>> "${LOG_FILE}"
if [ $? -eq 0 ]; then
    echo "✅ JSON help generated: ${HELP_DIR}/nucleus_help.json"
    echo "✅ JSON help generated: ${HELP_DIR}/nucleus_help.json" >> "${LOG_FILE}"
else
    echo "⚠️ Warning: Failed to generate JSON help (code $?)"
    echo "⚠️ Warning: Failed to generate JSON help (code $?)" >> "${LOG_FILE}"
fi

echo ""
echo "Generating nucleus_help.txt..."
echo "Generating nucleus_help.txt..." >> "${LOG_FILE}"

"${OUTPUT_FILE}" --help > "${HELP_DIR}/nucleus_help.txt" 2>> "${LOG_FILE}"
if [ $? -eq 0 ]; then
    echo "✅ Text help generated: ${HELP_DIR}/nucleus_help.txt"
    echo "✅ Text help generated: ${HELP_DIR}/nucleus_help.txt" >> "${LOG_FILE}"
else
    echo "⚠️ Warning: Failed to generate text help (code $?)"
    echo "⚠️ Warning: Failed to generate text help (code $?)" >> "${LOG_FILE}"
fi

# ───────────────────────────────────────────────────────────────
# Resumen final
# ───────────────────────────────────────────────────────────────

echo ""
echo "============================================="
echo "🎉 Nucleus Build completed."
echo "============================================="
echo "🎉 Nucleus Build completed successfully" >> "${LOG_FILE}"
echo ""
echo "📦 Archivos generados en:"
echo "  ${OUTPUT_DIR}"
echo ""
echo "  • Executable     : nucleus"
echo "  • Blueprint      : blueprint.json"
echo "  • Help JSON      : help/nucleus_help.json"
echo "  • Help TXT       : help/nucleus_help.txt"
echo ""
echo "📋 Log guardado en: ${LOG_FILE}"
echo ""

exit 0