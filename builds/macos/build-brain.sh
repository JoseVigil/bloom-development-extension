#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# BloomNucleus — Brain Build Script para macOS / Linux
# Equivalente de: builds/windows/brain.ps1
#
# Uso (llamado por build-all.py):
#   bash builds/macos/build-brain.sh
#
# Requiere: python3, pip, pyinstaller
# Instala dependencias en un venv aislado en installer/brain/.venv
# ═══════════════════════════════════════════════════════════════

DETECTED_OS=$(uname -s)
DETECTED_ARCH=$(uname -m)

# ───────────────────────────────────────────────────────────────
# RESOLUCIÓN DE RUTAS
# ───────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# builds/macos/ → repo root es ../..
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Arquitectura → carpeta de output
case "${DETECTED_ARCH}" in
    arm64)   BIN_ARCH="darwin_arm64" ;;
    x86_64)  BIN_ARCH="darwin_x64"   ;;
    *)        BIN_ARCH="linux_x64"    ;;
esac

BRAIN_DIR="${PROJECT_ROOT}/installer/brain"
OUTPUT_DIR="${PROJECT_ROOT}/installer/native/bin/${BIN_ARCH}/brain"
VENV_DIR="${BRAIN_DIR}/.venv"

mkdir -p "${OUTPUT_DIR}"

# ───────────────────────────────────────────────────────────────
# LOGGING
# ───────────────────────────────────────────────────────────────

if [[ "${DETECTED_OS}" == "Darwin" ]]; then
    LOG_BASE_DIR="${HOME}/Library/Logs/BloomNucleus/build"
else
    LOG_BASE_DIR="${HOME}/.local/share/BloomNucleus/build/logs"
fi

LOG_FILE="${LOG_BASE_DIR}/brain_build_darwin.log"
mkdir -p "${LOG_BASE_DIR}"

{
    echo "============================================="
    echo "Brain Build Log - $(date '+%Y-%m-%d %H:%M:%S')"
    echo "============================================="
    echo "OS:   ${DETECTED_OS}"
    echo "Arch: ${DETECTED_ARCH} → ${BIN_ARCH}"
    echo ""
} > "${LOG_FILE}"

echo "============================================="
echo "🚧 Building Brain (PyInstaller) — ${BIN_ARCH}"
echo "============================================="
echo "🚧 Building Brain (PyInstaller) — ${BIN_ARCH}" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# VERIFICACIONES PREVIAS
# ───────────────────────────────────────────────────────────────

if [[ ! -d "${BRAIN_DIR}" ]]; then
    echo "❌ Error: directorio installer/brain/ no encontrado."
    echo "   Buscado en: ${BRAIN_DIR}"
    exit 1
fi

if ! command -v python3 &>/dev/null; then
    echo "❌ Error: python3 no encontrado."
    echo "   Instalar con: brew install python@3.11"
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "Python versión: ${PYTHON_VERSION}"
echo "Python versión: ${PYTHON_VERSION}" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# VIRTUALENV
# ───────────────────────────────────────────────────────────────

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
    echo "⚠️  requirements.txt no encontrado — solo instalando pyinstaller"
    echo "⚠️  requirements.txt no encontrado" >> "${LOG_FILE}"
fi

pip install --quiet pyinstaller >> "${LOG_FILE}" 2>&1
echo "✅ PyInstaller instalado"
echo "✅ PyInstaller instalado" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# COMPILACIÓN CON PYINSTALLER
# ───────────────────────────────────────────────────────────────

echo ""
echo "Ejecutando PyInstaller..."
echo "Ejecutando PyInstaller..." >> "${LOG_FILE}"

cd "${BRAIN_DIR}"

# Detectar el spec o el entry point
if [[ -f "brain.spec" ]]; then
    PYINSTALLER_TARGET="brain.spec"
    echo "Usando brain.spec"
    echo "Usando brain.spec" >> "${LOG_FILE}"
elif [[ -f "brain.py" ]]; then
    PYINSTALLER_TARGET="brain.py"
    echo "Usando brain.py (--onedir)"
    echo "Usando brain.py (--onedir)" >> "${LOG_FILE}"
elif [[ -f "main.py" ]]; then
    PYINSTALLER_TARGET="main.py"
    echo "Usando main.py (--onedir)"
    echo "Usando main.py (--onedir)" >> "${LOG_FILE}"
else
    echo "❌ Error: no se encontró brain.spec, brain.py ni main.py en ${BRAIN_DIR}"
    echo "❌ Entry point no encontrado" >> "${LOG_FILE}"
    deactivate
    exit 1
fi

BUILD_DIR="${BRAIN_DIR}/build_pyinstaller"

pyinstaller \
    --onedir \
    --name brain \
    --distpath "${OUTPUT_DIR}/.." \
    --workpath "${BUILD_DIR}" \
    --noconfirm \
    "${PYINSTALLER_TARGET}" >> "${LOG_FILE}" 2>&1

BUILD_RC=$?

if [[ ${BUILD_RC} -ne 0 ]]; then
    echo ""
    echo "❌ PyInstaller falló (code ${BUILD_RC})"
    echo "📋 Revisa el log: ${LOG_FILE}"
    echo "❌ PyInstaller falló (code ${BUILD_RC})" >> "${LOG_FILE}"
    deactivate
    exit ${BUILD_RC}
fi

echo "✅ Brain compilado exitosamente → ${OUTPUT_DIR}"
echo "✅ Brain compilado → ${OUTPUT_DIR}" >> "${LOG_FILE}"

deactivate

# ───────────────────────────────────────────────────────────────
# NOTA SOBRE ESTRUCTURA DE OUTPUT EN macOS
# PyInstaller --onedir en macOS produce:
#   brain/
#     brain          ← binario Mach-O (sin extensión)
#     _internal/     ← dependencias Python empaquetadas como .so
# NO hay .pyd ni DLLs — es el formato correcto para macOS.
# ───────────────────────────────────────────────────────────────

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
