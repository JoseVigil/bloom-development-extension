#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# BloomNucleus — Go Component Build Script para macOS / Linux
# Equivalente de: builds/windows/build-component.bat
#
# Uso (llamado por build-all.py):
#   bash builds/darwin/build-component.sh <component>
#
#   <component> es uno de: nucleus | sentinel | metamorph | sensor
#
# Variables de entorno inyectadas por build-all.py:
#   BLOOM_BUILD_NUMBER   → build number efectivo (base + offset plataforma)
#   BLOOM_PROJECT_ROOT   → raíz del repo
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
# builds/darwin/ → repo root es ../..
# BLOOM_PROJECT_ROOT tiene precedencia si build-all.py lo inyecta
PROJECT_ROOT="${BLOOM_PROJECT_ROOT:-"$(cd "${SCRIPT_DIR}/../.." && pwd)"}"

COMPONENT_DIR="${PROJECT_ROOT}/installer/${COMPONENT}"
OUTPUT_DIR="${PROJECT_ROOT}/installer/native/bin/${BIN_ARCH}/${COMPONENT}"

mkdir -p "${OUTPUT_DIR}"

# ───────────────────────────────────────────────────────────────
# LOGGING
# ───────────────────────────────────────────────────────────────

if [[ "${DETECTED_OS}" == "Darwin" ]]; then
    LOG_BASE_DIR="${HOME}/Library/Application Support/BloomNucleus/logs/build"
else
    LOG_BASE_DIR="${HOME}/.local/share/BloomNucleus/logs/build"
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
# BUILD NUMBER
# ───────────────────────────────────────────────────────────────
# build-all.py inyecta BLOOM_BUILD_NUMBER con el valor efectivo
# (base + offset de plataforma). Si el script se corre manualmente
# sin build-all.py, leer build_number.effective.txt como fallback.

if [[ -z "${BLOOM_BUILD_NUMBER:-}" ]]; then
    EFFECTIVE_FILE="${PROJECT_ROOT}/installer/${COMPONENT}/scripts/build_number.effective.txt"
    if [[ -f "${EFFECTIVE_FILE}" ]]; then
        BLOOM_BUILD_NUMBER="$(cat "${EFFECTIVE_FILE}")"
    else
        BLOOM_BUILD_NUMBER="0"
    fi
fi

echo "Build number: ${BLOOM_BUILD_NUMBER}"
echo "Build number: ${BLOOM_BUILD_NUMBER}" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# COMPILACIÓN CON go build
# ───────────────────────────────────────────────────────────────

echo ""
echo "Compilando ${COMPONENT}..."
echo "Compilando ${COMPONENT}..." >> "${LOG_FILE}"

cd "${COMPONENT_DIR}"

if [[ ! -f "go.mod" ]]; then
    echo "❌ Error: go.mod no encontrado en ${COMPONENT_DIR}"
    echo "❌ go.mod no encontrado en ${COMPONENT_DIR}" >> "${LOG_FILE}"
    exit 1
fi

BINARY_NAME="${COMPONENT}"
OUTPUT_BINARY="${OUTPUT_DIR}/${BINARY_NAME}"

# sensor tiene su main.go en cmd/, el resto lo tiene en la raíz
case "${COMPONENT}" in
    sensor) BUILD_TARGET="./cmd" ;;
    *)      BUILD_TARGET="."     ;;
esac

echo "Build target: ${BUILD_TARGET}" >> "${LOG_FILE}"

go build \
    -ldflags="-s -w -X main.BuildNumber=${BLOOM_BUILD_NUMBER}" \
    -o "${OUTPUT_BINARY}" \
    "${BUILD_TARGET}" >> "${LOG_FILE}" 2>&1

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
# COPIA DE ARCHIVOS DE HELP
# Los archivos de help viven en installer/<component>/help/ y deben
# copiarse a installer/native/bin/<arch>/<component>/help/ — usando
# el mismo BIN_ARCH que resolvió la compilación arriba (darwin_arm64,
# darwin_x64, linux_x64). Nunca se hardcodea "win64" u otro arch.
# ───────────────────────────────────────────────────────────────

HELP_SRC_DIR="${PROJECT_ROOT}/installer/${COMPONENT}/help"
HELP_OUT_DIR="${OUTPUT_DIR}/help"

echo ""
echo "Copiando archivos de help..."
echo "Copiando archivos de help..." >> "${LOG_FILE}"
echo "  Origen : ${HELP_SRC_DIR}"  >> "${LOG_FILE}"
echo "  Destino: ${HELP_OUT_DIR}"  >> "${LOG_FILE}"

if [[ -d "${HELP_SRC_DIR}" ]]; then
    mkdir -p "${HELP_OUT_DIR}"
    cp -r "${HELP_SRC_DIR}/." "${HELP_OUT_DIR}/"
    echo "✅ Help files → ${HELP_OUT_DIR}"
    echo "✅ Help files copiados → ${HELP_OUT_DIR}" >> "${LOG_FILE}"
else
    echo "⚠  Directorio de help no encontrado, saltando: ${HELP_SRC_DIR}"
    echo "⚠  Help dir no encontrado: ${HELP_SRC_DIR}" >> "${LOG_FILE}"
fi

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
echo "  • Help files : help/"
echo ""
echo "📋 Build log: ${LOG_FILE}"
echo ""

{
    echo ""
    echo "============================================="
    echo "🎉 ${COMPONENT} Build [${BIN_ARCH}] completed"
    echo "============================================="
    echo "Output: ${OUTPUT_BINARY}"
    echo "Help:   ${HELP_OUT_DIR}"
} >> "${LOG_FILE}"

exit 0
