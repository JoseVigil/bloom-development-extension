#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# Sentinel Build Script for macOS
# BloomNucleus Project
# ═══════════════════════════════════════════════════════════════

# ───────────────────────────────────────────────────────────────
# 1. DETECCIÓN DINÁMICA DE ARQUITECTURA
# ───────────────────────────────────────────────────────────────

DETECTED_ARCH=$(uname -m)
DETECTED_OS=$(uname -s)

# Validar que estamos en macOS
if [[ "${DETECTED_OS}" != "Darwin" ]]; then
    echo "❌ Error: Este script es solo para macOS. OS detectado: ${DETECTED_OS}"
    exit 1
fi

# Mapear arquitectura a formato Go GOARCH y carpeta de salida
case "${DETECTED_ARCH}" in
    x86_64)
        GOARCH=amd64
        PLATFORM=macos64
        ;;
    arm64)
        GOARCH=arm64
        PLATFORM=macos_arm64
        ;;
    *)
        echo "❌ Arquitectura no soportada: ${DETECTED_ARCH}"
        exit 1
        ;;
esac

GOOS=darwin
CGO_ENABLED=0
APP_FOLDER=sentinel

# ───────────────────────────────────────────────────────────────
# 2. RESOLUCIÓN ROBUSTA DE RUTAS
# ───────────────────────────────────────────────────────────────

# Obtener directorio del script de forma robusta
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${SCRIPT_DIR}"

# Estructura de proyecto: installer/sentinel/scripts/build-darwin.sh
PROJECT_ROOT="$(cd ../../.. && pwd)"
OUTPUT_BASE="${PROJECT_ROOT}/installer/native/bin/${PLATFORM}/${APP_FOLDER}"
OUTPUT_DIR="${OUTPUT_BASE}"
OUTPUT_FILE="${OUTPUT_DIR}/sentinel"
HELP_DIR="${OUTPUT_DIR}/help"

mkdir -p "${OUTPUT_BASE}"
mkdir -p "${HELP_DIR}"

# ───────────────────────────────────────────────────────────────
# 3. LOGGING SYSTEM (BloomNucleus Spec)
# ───────────────────────────────────────────────────────────────

# macOS estándar: ~/Library/Logs
LOG_BASE_DIR="${HOME}/Library/Logs/BloomNucleus/build"

# Nombre de archivo: aplicación_módulo_contexto.log (todo minúsculas, guiones bajos)
LOG_FILE="${LOG_BASE_DIR}/sentinel_build_darwin.log"
mkdir -p "${LOG_BASE_DIR}"

# ───────────────────────────────────────────────────────────────
# Inicializar Log
# ───────────────────────────────────────────────────────────────

{
    echo "============================================="
    echo "Sentinel Build Log - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "============================================="
    echo ""
    echo "Platform Detection:"
    echo "  OS: ${DETECTED_OS}"
    echo "  Architecture: ${DETECTED_ARCH}"
    echo "  GOARCH: ${GOARCH}"
    echo "  Target Platform: ${PLATFORM}"
    echo ""
    echo "Environment:"
    echo "  GOOS=${GOOS}"
    echo "  GOARCH=${GOARCH}"
    echo "  CGO_ENABLED=${CGO_ENABLED}"
    echo ""
} > "${LOG_FILE}"

echo "============================================="
echo "🚧 Building Sentinel (${PLATFORM}) - Safe Mode"
echo "============================================="
echo "🚧 Building Sentinel (${PLATFORM}) - Safe Mode" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# Incrementar Build Number (Compartido entre plataformas)
# ───────────────────────────────────────────────────────────────

echo ""
echo "Incrementando build number..."
echo "Incrementando build number..." >> "${LOG_FILE}"

BUILD_FILE="${SCRIPT_DIR}/build_number.txt"
BUILD_INFO="${SCRIPT_DIR}/../internal/core/build_info.go"

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
# Compilación con Go
# ───────────────────────────────────────────────────────────────

echo "Compiling sentinel → ${OUTPUT_FILE} ..."
echo "Compiling sentinel → ${OUTPUT_FILE} ..." >> "${LOG_FILE}"

pushd "${SCRIPT_DIR}/.." >/dev/null

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

echo "✅ Compilation successful: ${OUTPUT_FILE}"
echo "✅ Compilation successful: ${OUTPUT_FILE}" >> "${LOG_FILE}"
echo "" >> "${LOG_FILE}"

# Hacer ejecutable
chmod +x "${OUTPUT_FILE}"

# ───────────────────────────────────────────────────────────────
# Copiar Archivo de Configuración
# ───────────────────────────────────────────────────────────────

CONFIG_SOURCE="${SCRIPT_DIR}/../sentinel-config.json"
if [[ -f "${CONFIG_SOURCE}" ]]; then
    cp -f "${CONFIG_SOURCE}" "${OUTPUT_DIR}/sentinel-config.json"
    echo "📦 sentinel-config.json copiado"
    echo "📦 sentinel-config.json copiado" >> "${LOG_FILE}"
else
    echo "⚠️  sentinel-config.json no encontrado"
    echo "⚠️  sentinel-config.json no encontrado" >> "${LOG_FILE}"
fi

# ───────────────────────────────────────────────────────────────
# Generar Documentación de Ayuda
# ───────────────────────────────────────────────────────────────

echo ""
echo "============================================="
echo "   Generating Help Documentation"
echo "============================================="
{
    echo ""
    echo "============================================="
    echo "   Generating Help Documentation"
    echo "============================================="
} >> "${LOG_FILE}"

# JSON Help
echo ""
echo "Generating sentinel_help.json..."
echo "Generating sentinel_help.json..." >> "${LOG_FILE}"

"${OUTPUT_FILE}" --json-help > "${HELP_DIR}/sentinel_help.json" 2>> "${LOG_FILE}"
if [[ $? -eq 0 ]]; then
    echo "✅ JSON help generated: ${HELP_DIR}/sentinel_help.json"
    echo "✅ JSON help generated: ${HELP_DIR}/sentinel_help.json" >> "${LOG_FILE}"
else
    echo "⚠️  Warning: Failed to generate JSON help (code $?)"
    echo "⚠️  Warning: Failed to generate JSON help (code $?)" >> "${LOG_FILE}"
fi

# Text Help
echo ""
echo "Generating sentinel_help.txt..."
echo "Generating sentinel_help.txt..." >> "${LOG_FILE}"

"${OUTPUT_FILE}" --help > "${HELP_DIR}/sentinel_help.txt" 2>> "${LOG_FILE}"
if [[ $? -eq 0 ]]; then
    echo "✅ Text help generated: ${HELP_DIR}/sentinel_help.txt"
    echo "✅ Text help generated: ${HELP_DIR}/sentinel_help.txt" >> "${LOG_FILE}"
else
    echo "⚠️  Warning: Failed to generate text help (code $?)"
    echo "⚠️  Warning: Failed to generate text help (code $?)" >> "${LOG_FILE}"
fi

# ───────────────────────────────────────────────────────────────
# TELEMETRÍA VÍA NUCLEUS CLI (NO Python)
# ───────────────────────────────────────────────────────────────

echo ""
echo "============================================="
echo "   Registering Telemetry via Nucleus CLI"
echo "============================================="
{
    echo ""
    echo "============================================="
    echo "   Registering Telemetry via Nucleus CLI"
    echo "============================================="
} >> "${LOG_FILE}"

# Localizar binario de Nucleus para la plataforma actual
NUCLEUS_EXE="${PROJECT_ROOT}/installer/native/bin/${PLATFORM}/nucleus/nucleus"

if [[ -f "${NUCLEUS_EXE}" ]]; then
    # Asegurar que nucleus es ejecutable
    chmod +x "${NUCLEUS_EXE}"
    
    # Registrar en telemetry.json usando Nucleus CLI
    "${NUCLEUS_EXE}" telemetry register \
        --stream sentinel_build \
        --label "📦 SENTINEL BUILD" \
        --path "${LOG_FILE}" \
        --priority 3 >> "${LOG_FILE}" 2>&1
    
    if [[ $? -eq 0 ]]; then
        echo "✅ Telemetry registered successfully"
        echo "✅ Telemetry registered successfully" >> "${LOG_FILE}"
    else
        echo "⚠️  Warning: Telemetry registration failed (Nucleus RC: $?)"
        echo "⚠️  Warning: Telemetry registration failed (Nucleus RC: $?)" >> "${LOG_FILE}"
    fi
else
    echo "⚠️  Nucleus not found at: ${NUCLEUS_EXE}"
    echo "   Skipping telemetry registration"
    echo "⚠️  Nucleus not found at: ${NUCLEUS_EXE}" >> "${LOG_FILE}"
    echo "   Telemetry registration skipped" >> "${LOG_FILE}"
fi

# ───────────────────────────────────────────────────────────────
# Resumen Final
# ───────────────────────────────────────────────────────────────

echo ""
echo "============================================="
echo "🎉 Sentinel Build [${PLATFORM}] completed"
echo "============================================="
{
    echo ""
    echo "============================================="
    echo "🎉 Sentinel Build [${PLATFORM}] completed"
    echo "============================================="
} >> "${LOG_FILE}"

echo ""
echo "📦 Output files:"
echo "  Executable:  ${OUTPUT_FILE}"
echo "  Config:      ${OUTPUT_DIR}/sentinel-config.json"
echo "  Help (JSON): ${HELP_DIR}/sentinel_help.json"
echo "  Help (TXT):  ${HELP_DIR}/sentinel_help.txt"
echo ""
echo "📋 Build log: ${LOG_FILE}"
echo ""

{
    echo ""
    echo "Output files:"
    echo "  Executable:  ${OUTPUT_FILE}"
    echo "  Config:      ${OUTPUT_DIR}/sentinel-config.json"
    echo "  Help (JSON): ${HELP_DIR}/sentinel_help.json"
    echo "  Help (TXT):  ${HELP_DIR}/sentinel_help.txt"
    echo ""
} >> "${LOG_FILE}"

exit 0