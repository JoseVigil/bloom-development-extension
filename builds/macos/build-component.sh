#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# BloomNucleus — Generic Go Component Build Script for macOS
# Equivalente de builds/windows/build-component.bat
#
# Uso (llamado por build-all.py):
#   bash builds/macos/build-component.sh <component>
#
# Componentes soportados: nucleus | sentinel | metamorph | sensor
# ═══════════════════════════════════════════════════════════════

# ───────────────────────────────────────────────────────────────
# 1. ARGUMENTO
# ───────────────────────────────────────────────────────────────

COMPONENT="${1:-}"
if [[ -z "${COMPONENT}" ]]; then
    echo "❌ Error: se requiere el nombre del componente como primer argumento."
    echo "   Uso: bash build-component.sh <component>"
    echo "   Componentes: nucleus | sentinel | metamorph | sensor"
    exit 1
fi

case "${COMPONENT}" in
    nucleus|sentinel|metamorph|sensor) ;;
    *)
        echo "❌ Componente no reconocido: '${COMPONENT}'"
        echo "   Componentes válidos: nucleus | sentinel | metamorph | sensor"
        exit 1
        ;;
esac

# ───────────────────────────────────────────────────────────────
# 2. DETECCIÓN DE PLATAFORMA Y ARQUITECTURA
# ───────────────────────────────────────────────────────────────

DETECTED_OS=$(uname -s)
DETECTED_ARCH=$(uname -m)

if [[ "${DETECTED_OS}" != "Darwin" ]]; then
    echo "❌ Error: Este script es solo para macOS. OS detectado: ${DETECTED_OS}"
    exit 1
fi

case "${DETECTED_ARCH}" in
    x86_64)
        GOARCH=amd64
        PLATFORM=darwin_x64
        ;;
    arm64)
        GOARCH=arm64
        PLATFORM=darwin_arm64
        ;;
    *)
        echo "❌ Arquitectura no soportada: ${DETECTED_ARCH}"
        exit 1
        ;;
esac

GOOS=darwin
CGO_ENABLED=0

# ───────────────────────────────────────────────────────────────
# 3. RESOLUCIÓN DE RUTAS
# ───────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# builds/macos/ → repo root es ../..
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

COMPONENT_DIR="${PROJECT_ROOT}/installer/${COMPONENT}"
SCRIPTS_DIR="${COMPONENT_DIR}/scripts"      # build_number.txt y build_info.go viven acá
OUTPUT_DIR="${PROJECT_ROOT}/installer/native/bin/${PLATFORM}/${COMPONENT}"
HELP_DIR="${OUTPUT_DIR}/help"

mkdir -p "${OUTPUT_DIR}"
mkdir -p "${HELP_DIR}"

# ───────────────────────────────────────────────────────────────
# 4. LOGGING (BloomNucleus Spec)
# ───────────────────────────────────────────────────────────────

LOG_BASE_DIR="${HOME}/Library/Logs/BloomNucleus/build"
LOG_FILE="${LOG_BASE_DIR}/${COMPONENT}_build_darwin.log"
mkdir -p "${LOG_BASE_DIR}"

{
    echo "============================================="
    echo "${COMPONENT} Build Log - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "============================================="
    echo ""
    echo "Platform Detection:"
    echo "  OS:           ${DETECTED_OS}"
    echo "  Architecture: ${DETECTED_ARCH}"
    echo "  GOARCH:       ${GOARCH}"
    echo "  Platform:     ${PLATFORM}"
    echo ""
    echo "Environment:"
    echo "  GOOS=${GOOS}"
    echo "  GOARCH=${GOARCH}"
    echo "  CGO_ENABLED=${CGO_ENABLED}"
    echo ""
} > "${LOG_FILE}"

echo "============================================="
echo "🚧 Building ${COMPONENT} - ${PLATFORM}"
echo "============================================="
echo "🚧 Building ${COMPONENT} - ${PLATFORM}" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# 5. INCREMENTAR BUILD NUMBER
#    Compartido con Windows — el archivo vive en installer/<component>/scripts/
# ───────────────────────────────────────────────────────────────

echo ""
echo "Incrementando build number..."
echo "Incrementando build number..." >> "${LOG_FILE}"

BUILD_FILE="${SCRIPTS_DIR}/build_number.txt"
BUILD_INFO="${COMPONENT_DIR}/internal/core/build_info.go"

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

# ───────────────────────────────────────────────────────────────
# 6. COMPILACIÓN Go
# ───────────────────────────────────────────────────────────────

OUTPUT_FILE="${OUTPUT_DIR}/${COMPONENT}"

echo ""
echo "Compiling ${COMPONENT} → ${OUTPUT_FILE} ..."
echo "Compiling ${COMPONENT} → ${OUTPUT_FILE} ..." >> "${LOG_FILE}"

pushd "${COMPONENT_DIR}" >/dev/null

GOOS=${GOOS} GOARCH=${GOARCH} CGO_ENABLED=${CGO_ENABLED} \
    go build -p 1 -ldflags="-s -w" -o "${OUTPUT_FILE}" . >> "${LOG_FILE}" 2>&1
BUILD_RC=$?

popd >/dev/null

if [[ ${BUILD_RC} -ne 0 ]]; then
    echo "" >> "${LOG_FILE}"
    echo "❌ Compilation failed with error code: ${BUILD_RC}" >> "${LOG_FILE}"
    echo ""
    echo "❌ Compilation failed (code ${BUILD_RC})"
    echo "📋 Revisa el log: ${LOG_FILE}"
    exit ${BUILD_RC}
fi

chmod +x "${OUTPUT_FILE}"
echo "✅ Compilation successful: ${OUTPUT_FILE}"
echo "✅ Compilation successful: ${OUTPUT_FILE}" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# 7. ARCHIVOS DE CONFIGURACIÓN (governance.json — solo nucleus)
# ───────────────────────────────────────────────────────────────

if [[ "${COMPONENT}" == "nucleus" ]]; then
    CONFIG_SOURCE="${COMPONENT_DIR}/nucleus-governance.json"
    if [[ -f "${CONFIG_SOURCE}" ]]; then
        cp -f "${CONFIG_SOURCE}" "${OUTPUT_DIR}/nucleus-governance.json"
        echo "📦 nucleus-governance.json copiado"
        echo "📦 nucleus-governance.json copiado" >> "${LOG_FILE}"
    else
        echo "⚠️  nucleus-governance.json no encontrado en ${CONFIG_SOURCE}"
        echo "⚠️  nucleus-governance.json no encontrado" >> "${LOG_FILE}"
    fi
fi

# ───────────────────────────────────────────────────────────────
# 8. GENERAR DOCUMENTACIÓN DE AYUDA
# ───────────────────────────────────────────────────────────────

echo ""
echo "Generating help documentation..."
echo "Generating help documentation..." >> "${LOG_FILE}"

"${OUTPUT_FILE}" --json-help > "${HELP_DIR}/${COMPONENT}_help.json" 2>> "${LOG_FILE}" \
    && echo "✅ JSON help: ${HELP_DIR}/${COMPONENT}_help.json" \
    || echo "⚠️  Warning: --json-help falló (no crítico)"

"${OUTPUT_FILE}" --help > "${HELP_DIR}/${COMPONENT}_help.txt" 2>> "${LOG_FILE}" \
    && echo "✅ Text help: ${HELP_DIR}/${COMPONENT}_help.txt" \
    || echo "⚠️  Warning: --help falló (no crítico)"

# ───────────────────────────────────────────────────────────────
# 9. TELEMETRÍA VÍA NUCLEUS CLI
#    Solo nucleus puede auto-registrar; los demás usan el nucleus
#    ya compilado si existe en el mismo platform output.
# ───────────────────────────────────────────────────────────────

NUCLEUS_BIN="${PROJECT_ROOT}/installer/native/bin/${PLATFORM}/nucleus/nucleus"

if [[ "${COMPONENT}" == "nucleus" ]]; then
    TELEMETRY_BIN="${OUTPUT_FILE}"
elif [[ -f "${NUCLEUS_BIN}" ]]; then
    TELEMETRY_BIN="${NUCLEUS_BIN}"
else
    TELEMETRY_BIN=""
fi

if [[ -n "${TELEMETRY_BIN}" ]]; then
    echo ""
    echo "Registering telemetry..."
    "${TELEMETRY_BIN}" telemetry register \
        --stream "${COMPONENT}_build" \
        --label "📦 ${COMPONENT^^} BUILD" \
        --path "${LOG_FILE}" \
        --priority 3 >> "${LOG_FILE}" 2>&1 \
        && echo "✅ Telemetry registered" \
        || echo "⚠️  Warning: Telemetry registration failed (no crítico)"
fi

# ───────────────────────────────────────────────────────────────
# 10. RESUMEN FINAL
# ───────────────────────────────────────────────────────────────

echo ""
echo "============================================="
echo "🎉 ${COMPONENT} Build [${PLATFORM}] completed"
echo "============================================="
echo ""
echo "📦 Output: ${OUTPUT_DIR}"
echo "  • Executable : ${COMPONENT}"
[[ "${COMPONENT}" == "nucleus" ]] && echo "  • Blueprint  : nucleus-governance.json"
echo "  • Help JSON  : help/${COMPONENT}_help.json"
echo "  • Help TXT   : help/${COMPONENT}_help.txt"
echo ""
echo "📋 Build log: ${LOG_FILE}"
echo ""

{
    echo ""
    echo "============================================="
    echo "🎉 ${COMPONENT} Build [${PLATFORM}] completed"
    echo "============================================="
    echo ""
    echo "Output files:"
    echo "  Executable:  ${OUTPUT_FILE}"
    [[ "${COMPONENT}" == "nucleus" ]] && echo "  Config:      ${OUTPUT_DIR}/nucleus-governance.json"
    echo "  Help (JSON): ${HELP_DIR}/${COMPONENT}_help.json"
    echo "  Help (TXT):  ${HELP_DIR}/${COMPONENT}_help.txt"
    echo ""
} >> "${LOG_FILE}"

exit 0
