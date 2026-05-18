#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# BloomNucleus — Host Build Wrapper for macOS / Linux
# Equivalente de: (sin equivalente en Windows — host no compila en Win)
#
# Uso (llamado por build-all.py en macOS/Linux):
#   bash builds/macos/build-host.sh
#
# Este script localiza el build.sh del host (src/host/build.sh)
# y lo ejecuta desde su propio directorio, tal como lo haría
# un desarrollador manualmente.
#
# NOTA: Host (bloom-host C++) NO compila en Windows.
#       build-all.py hace skip automático de este paso en win32.
# ═══════════════════════════════════════════════════════════════

DETECTED_OS=$(uname -s)

# Guardia de plataforma — nunca debería llegarse acá en Windows,
# pero como defensa adicional:
if [[ "${DETECTED_OS}" != "Darwin" && "${DETECTED_OS}" != "Linux" ]]; then
    echo "❌ Error: build-host.sh solo se ejecuta en macOS o Linux."
    echo "   OS detectado: ${DETECTED_OS}"
    exit 1
fi

# ───────────────────────────────────────────────────────────────
# RESOLUCIÓN DE RUTAS
# ───────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# builds/macos/ → repo root es ../..
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

HOST_BUILD_SCRIPT="${PROJECT_ROOT}/src/host/build.sh"

if [[ ! -f "${HOST_BUILD_SCRIPT}" ]]; then
    echo "❌ Error: No se encontró el script de build del host."
    echo "   Buscado en: ${HOST_BUILD_SCRIPT}"
    echo "   Verifica que src/host/build.sh existe en el repositorio."
    exit 1
fi

# ───────────────────────────────────────────────────────────────
# LOGGING
# ───────────────────────────────────────────────────────────────

if [[ "${DETECTED_OS}" == "Darwin" ]]; then
    LOG_BASE_DIR="${HOME}/Library/BloomNucleus/logs/build"
else
    LOG_BASE_DIR="${HOME}/.local/share/BloomNucleus/build/logs"
fi

LOG_FILE="${LOG_BASE_DIR}/host_build_wrapper.log"
mkdir -p "${LOG_BASE_DIR}"

{
    echo "============================================="
    echo "Host Build Wrapper Log - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "============================================="
    echo "OS: ${DETECTED_OS}"
    echo "Script: ${HOST_BUILD_SCRIPT}"
    echo ""
} > "${LOG_FILE}"

echo "============================================="
echo "🚧 Building bloom-host (C++) — ${DETECTED_OS}"
echo "============================================="

# ───────────────────────────────────────────────────────────────
# EJECUTAR BUILD DEL HOST
# El build.sh detecta el OS internamente y compila las arquitecturas
# que correspondan (Darwin → arm64 + x86_64, Linux → x86_64).
# ───────────────────────────────────────────────────────────────

echo ""
echo "Ejecutando: ${HOST_BUILD_SCRIPT}"
echo "Ejecutando: ${HOST_BUILD_SCRIPT}" >> "${LOG_FILE}"
echo ""

bash "${HOST_BUILD_SCRIPT}" 2>&1 | tee -a "${LOG_FILE}"
BUILD_RC=${PIPESTATUS[0]}

echo "" >> "${LOG_FILE}"

if [[ ${BUILD_RC} -ne 0 ]]; then
    echo "❌ Host build falló (code ${BUILD_RC})" | tee -a "${LOG_FILE}"
    echo "📋 Log: ${LOG_FILE}"
    exit ${BUILD_RC}
fi

echo ""
echo "✅ Host build completado exitosamente" | tee -a "${LOG_FILE}"
echo "📋 Log: ${LOG_FILE}"
echo ""

exit 0
