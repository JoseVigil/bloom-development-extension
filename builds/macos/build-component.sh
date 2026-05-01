#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# BloomNucleus — Go Component Build Script para macOS / Linux
# Equivalente de: builds/windows/build-component.bat
#
# Uso (llamado por build-all.py):
#   bash builds/macos/build-component.sh <component>
#
#   <component> es uno de: nucleus | sentinel | metamorph | sensor
#
# Requiere: go (en PATH)
# Output:   installer/native/bin/<arch>/
# ═══════════════════════════════════════════════════════════════

COMPONENT="${1:-}"

if [[ -z "${COMPONENT}" ]]; then
    echo "❌ Error: se requiere el nombre del componente como argumento."
    echo "   Uso: bash build-component.sh <component>"
    echo "   Componentes válidos: nucleus sentinel metamorph sensor"
    exit 1
fi

# ───────────────────────────────────────────────────────────────
# RESOLUCIÓN DE PLATAFORMA
# ───────────────────────────────────────────────────────────────

DETECTED_OS=$(uname -s)
DETECTED_ARCH=$(uname -m)

case "${DETECTED_OS}" in
    Darwin)
        case "${DETECTED_ARCH}" in
            arm64)   BIN_ARCH="darwin_arm64" ;;
            x86_64)  BIN_ARCH="darwin_x64"   ;;
            *)        BIN_ARCH="darwin_x64"   ;;
        esac
        ;;
    Linux)
        BIN_ARCH="linux_x64"
        ;;
    *)
        echo "❌ Error: sistema operativo no soportado: ${DETECTED_OS}"
        exit 1
        ;;
esac

# ───────────────────────────────────────────────────────────────
# RESOLUCIÓN DE RUTAS
# ───────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# builds/macos/ → repo root es ../..
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

COMPONENT_DIR="${PROJECT_ROOT}/installer/${COMPONENT}"
OUTPUT_DIR="${PROJECT_ROOT}/installer/native/bin/${BIN_ARCH}/${COMPONENT}"

mkdir -p "${OUTPUT_DIR}"

# ───────────────────────────────────────────────────────────────
# LOGGING
# ───────────────────────────────────────────────────────────────

if [[ "${DETECTED_OS}" == "Darwin" ]]; then
    LOG_BASE_DIR="${HOME}/Library/Logs/BloomNucleus/build"
else
    LOG_BASE_DIR="${HOME}/.local/share/BloomNucleus/build/logs"
fi

LOG_FILE="${LOG_BASE_DIR}/${COMPONENT}_build_${BIN_ARCH}.log"
mkdir -p "${LOG_BASE_DIR}"

{
    echo "============================================="
    echo "${COMPONENT} Build Log - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "============================================="
    echo "OS:        ${DETECTED_OS}"
    echo "Arch:      ${DETECTED_ARCH} → ${BIN_ARCH}"
    echo "Component: ${COMPONENT}"
    echo "Source:    ${COMPONENT_DIR}"
    echo "Output:    ${OUTPUT_DIR}"
    echo ""
} > "${LOG_FILE}"

echo "============================================="
echo "🚧 Building ${COMPONENT} (Go) — ${BIN_ARCH}"
echo "============================================="

# ───────────────────────────────────────────────────────────────
# VERIFICACIONES PREVIAS
# ───────────────────────────────────────────────────────────────

# Validar que el componente sea conocido
case "${COMPONENT}" in
    nucleus|sentinel|metamorph|sensor)
        ;;
    *)
        echo "❌ Error: componente desconocido: '${COMPONENT}'"
        echo "   Válidos: nucleus sentinel metamorph sensor"
        echo "❌ Componente desconocido: ${COMPONENT}" >> "${LOG_FILE}"
        exit 1
        ;;
esac

if [[ ! -d "${COMPONENT_DIR}" ]]; then
    echo "❌ Error: directorio installer/${COMPONENT}/ no encontrado."
    echo "   Buscado en: ${COMPONENT_DIR}"
    echo "❌ Directorio no encontrado: ${COMPONENT_DIR}" >> "${LOG_FILE}"
    exit 1
fi

if ! command -v go &>/dev/null; then
    echo "❌ Error: go no encontrado en PATH."
    echo "   Instalar desde: https://go.dev/dl/"
    echo "   O con brew: brew install go"
    echo "❌ go no encontrado en PATH" >> "${LOG_FILE}"
    exit 1
fi

GO_VERSION=$(go version)
echo "Go: ${GO_VERSION}"
echo "Go: ${GO_VERSION}" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# COMPILACIÓN CON go build
# ───────────────────────────────────────────────────────────────

echo ""
echo "Compilando ${COMPONENT}..."
echo "Compilando ${COMPONENT}..." >> "${LOG_FILE}"

cd "${COMPONENT_DIR}"

# Verificar que hay go.mod
if [[ ! -f "go.mod" ]]; then
    echo "❌ Error: go.mod no encontrado en ${COMPONENT_DIR}"
    echo "❌ go.mod no encontrado en ${COMPONENT_DIR}" >> "${LOG_FILE}"
    exit 1
fi

BINARY_NAME="${COMPONENT}"
OUTPUT_BINARY="${OUTPUT_DIR}/${BINARY_NAME}"

# go build con ldflags para reducir tamaño del binario
go build \
    -ldflags="-s -w" \
    -o "${OUTPUT_BINARY}" \
    . >> "${LOG_FILE}" 2>&1

BUILD_RC=$?

if [[ ${BUILD_RC} -ne 0 ]]; then
    echo ""
    echo "❌ go build falló (code ${BUILD_RC})"
    echo "📋 Revisa el log: ${LOG_FILE}"
    echo "❌ go build falló (code ${BUILD_RC})" >> "${LOG_FILE}"
    exit ${BUILD_RC}
fi

echo "✅ ${COMPONENT} compilado → ${OUTPUT_BINARY}"
echo "✅ ${COMPONENT} compilado → ${OUTPUT_BINARY}" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# RESUMEN
# ───────────────────────────────────────────────────────────────

echo ""
echo "============================================="
echo "🎉 ${COMPONENT} Build [${BIN_ARCH}] completed"
echo "============================================="
echo ""
echo "📦 Output: ${OUTPUT_DIR}/"
echo "  • Executable : ${BINARY_NAME}"
echo ""
echo "📋 Build log: ${LOG_FILE}"
echo ""

{
    echo ""
    echo "============================================="
    echo "🎉 ${COMPONENT} Build [${BIN_ARCH}] completed"
    echo "============================================="
    echo "Output: ${OUTPUT_BINARY}"
} >> "${LOG_FILE}"

exit 0
