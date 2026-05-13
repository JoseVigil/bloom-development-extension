#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# BloomNucleus — Brain Build Script para macOS / Linux
# Equivalente de: builds/windows/brain.ps1
#
# Uso (llamado por build-all.py):
#   bash builds/darwin/build-brain.sh
#
# Variables de entorno inyectadas por build-all.py:
#   BLOOM_PROJECT_ROOT   → raíz del repo
#
# Delega en: brain/build_multiplatform/build.py
# Requiere:  python3, pip, pyinstaller
# ═══════════════════════════════════════════════════════════════

DETECTED_OS=$(uname -s)
DETECTED_ARCH=$(uname -m)

# ───────────────────────────────────────────────────────────────
# RESOLUCIÓN DE RUTAS
# ───────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# builds/darwin/ → repo root es ../..
# BLOOM_PROJECT_ROOT tiene precedencia si build-all.py lo inyecta
PROJECT_ROOT="${BLOOM_PROJECT_ROOT:-"$(cd "${SCRIPT_DIR}/../.." && pwd)"}"

BRAIN_DIR="${PROJECT_ROOT}/brain"
BUILD_SCRIPT="${BRAIN_DIR}/build_multiplatform/build.py"

# Arquitectura → carpeta de output (para el log)
# Nombres alineados con build-all.py y build_main.py
case "${DETECTED_ARCH}" in
    arm64)   BIN_ARCH="darwin_arm64" ;;
    x86_64)  BIN_ARCH="darwin_x64"   ;;
    *)        BIN_ARCH="linux_x64"    ;;
esac

# ───────────────────────────────────────────────────────────────
# LOGGING
# ───────────────────────────────────────────────────────────────

if [[ "${DETECTED_OS}" == "Darwin" ]]; then
    LOG_BASE_DIR="${HOME}/Library/Logs/BloomNucleus/build"
else
    LOG_BASE_DIR="${HOME}/.local/share/BloomNucleus/build/logs"
fi

LOG_FILE="${LOG_BASE_DIR}/brain_build_${BIN_ARCH}.log"
mkdir -p "${LOG_BASE_DIR}"

{
    echo "============================================="
    echo "Brain Build Log - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "============================================="
    echo "OS:          ${DETECTED_OS}"
    echo "Arch:        ${DETECTED_ARCH} → ${BIN_ARCH}"
    echo "ProjectRoot: ${PROJECT_ROOT}"
    echo "BuildScript: ${BUILD_SCRIPT}"
    echo ""
} > "${LOG_FILE}"

echo "============================================="
echo "🚧 Building Brain (PyInstaller) — ${BIN_ARCH}"
echo "============================================="

# ───────────────────────────────────────────────────────────────
# VERIFICACIONES PREVIAS
# ───────────────────────────────────────────────────────────────

if [[ ! -d "${BRAIN_DIR}" ]]; then
    echo "❌ Error: directorio brain/ no encontrado."
    echo "   Buscado en: ${BRAIN_DIR}"
    echo "❌ brain/ no encontrado: ${BRAIN_DIR}" >> "${LOG_FILE}"
    exit 1
fi

if [[ ! -f "${BUILD_SCRIPT}" ]]; then
    echo "❌ Error: script de build no encontrado."
    echo "   Buscado en: ${BUILD_SCRIPT}"
    echo "❌ build.py no encontrado: ${BUILD_SCRIPT}" >> "${LOG_FILE}"
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    echo "❌ Error: python3 no encontrado en PATH."
    echo "   Instalar con: brew install python@3.11"
    echo "❌ python3 no encontrado" >> "${LOG_FILE}"
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "Python: ${PYTHON_VERSION}"
echo "Python: ${PYTHON_VERSION}" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# VIRTUALENV — aislado en brain/.venv
# ───────────────────────────────────────────────────────────────

VENV_DIR="${BRAIN_DIR}/.venv"

echo ""
echo "Configurando entorno virtual..."
echo "Configurando entorno virtual..." >> "${LOG_FILE}"

python3 -m venv "${VENV_DIR}" >> "${LOG_FILE}" 2>&1
source "${VENV_DIR}/bin/activate"

echo "✅ venv: ${VENV_DIR}"
echo "✅ venv: ${VENV_DIR}" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# DEPENDENCIAS
# ───────────────────────────────────────────────────────────────

echo ""
echo "Instalando dependencias..."
echo "Instalando dependencias..." >> "${LOG_FILE}"

REQUIREMENTS="${BRAIN_DIR}/requirements.txt"
if [[ -f "${REQUIREMENTS}" ]]; then
    pip install --quiet -r "${REQUIREMENTS}" >> "${LOG_FILE}" 2>&1
    echo "✅ requirements.txt instalado"
    echo "✅ requirements.txt instalado" >> "${LOG_FILE}"
else
    echo "⚠️  requirements.txt no encontrado — instalando solo pyinstaller"
    echo "⚠️  requirements.txt no encontrado" >> "${LOG_FILE}"
fi

pip install --quiet pyinstaller >> "${LOG_FILE}" 2>&1
echo "✅ PyInstaller instalado"
echo "✅ PyInstaller instalado" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# EJECUCIÓN DEL BUILD PRINCIPAL
# Delegamos en brain/build_multiplatform/build.py, que a su vez
# llama a brain/build_deploy/build_main.py con PyInstaller.
# Se ejecuta desde PROJECT_ROOT para que los paths relativos
# dentro de build.py y brain.spec resuelvan correctamente.
# ───────────────────────────────────────────────────────────────

echo ""
echo "Ejecutando brain/build_multiplatform/build.py..."
echo "Ejecutando build.py..." >> "${LOG_FILE}"

python3 "${BUILD_SCRIPT}" >> "${LOG_FILE}" 2>&1

BUILD_RC=$?

deactivate

if [[ ${BUILD_RC} -ne 0 ]]; then
    echo ""
    echo "❌ Build falló (code ${BUILD_RC})"
    echo "📋 Revisa el log: ${LOG_FILE}"
    echo "❌ Build falló (code ${BUILD_RC})" >> "${LOG_FILE}"
    exit ${BUILD_RC}
fi

# ───────────────────────────────────────────────────────────────
# RESUMEN
# ───────────────────────────────────────────────────────────────

OUTPUT_DIR="${PROJECT_ROOT}/installer/native/bin/${BIN_ARCH}/brain"

echo ""
echo "============================================="
echo "🎉 Brain Build [${BIN_ARCH}] completed"
echo "============================================="
echo ""
echo "📦 Output: ${OUTPUT_DIR}/"
echo "  • Executable : brain"
echo "  • Deps       : _internal/"
echo ""
echo "📋 Build log: ${LOG_FILE}"
echo ""

{
    echo ""
    echo "============================================="
    echo "🎉 Brain Build [${BIN_ARCH}] completed"
    echo "============================================="
    echo "Output: ${OUTPUT_DIR}"
} >> "${LOG_FILE}"

exit 0
