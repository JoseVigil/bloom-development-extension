#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
# BloomNucleus — Brain Build Script para macOS / Linux
# Equivalente de: builds/windows/brain.ps1
#
# Uso (llamado por build-all.py):
#   bash builds/unix/build-brain.sh
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
# RESOLUCIÓN DE PLATAFORMA Y ARQUITECTURA
# ───────────────────────────────────────────────────────────────

case "${DETECTED_OS}" in
    Darwin)
        case "${DETECTED_ARCH}" in
            arm64)   BIN_ARCH="darwin_arm64" ;;
            x86_64)  BIN_ARCH="darwin_x64"   ;;
            *)        BIN_ARCH="darwin_x64"   ;;
        esac
        ;;
    Linux)
        case "${DETECTED_ARCH}" in
            x86_64|amd64)  BIN_ARCH="linux_x64"   ;;
            aarch64|arm64) BIN_ARCH="linux_arm64"  ;;
            *)              BIN_ARCH="linux_x64"    ;;
        esac
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
# builds/unix/ → repo root es ../..
# BLOOM_PROJECT_ROOT tiene precedencia si build-all.py lo inyecta
PROJECT_ROOT="${BLOOM_PROJECT_ROOT:-"$(cd "${SCRIPT_DIR}/../.." && pwd)"}"

BRAIN_DIR="${PROJECT_ROOT}/brain"
BUILD_SCRIPT="${BRAIN_DIR}/build_multiplatform/build.py"

# ───────────────────────────────────────────────────────────────
# LOGGING
# Nombre sin arch para paridad con Windows (brain.build.log).
# El stream_id brain_build es el mismo en todas las plataformas,
# lo que permite análisis de telemetría cross-platform.
# ───────────────────────────────────────────────────────────────

if [[ "${DETECTED_OS}" == "Darwin" ]]; then
    LOG_BASE_DIR="${HOME}/Library/BloomNucleus/logs/build"
else
    LOG_BASE_DIR="${HOME}/.local/share/BloomNucleus/logs/build"
fi

# Sin sufijo de arch — alineado con Windows: brain.build.log
LOG_FILE="${LOG_BASE_DIR}/brain.build.log"
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

# ───────────────────────────────────────────────────────────────
# DETECCIÓN DE PYTHON COMPATIBLE (>=3.11, <3.14)
# onnxruntime (dep de chromadb) no tiene wheel para Python 3.14+
# Se busca el primer candidato disponible en orden de preferencia.
# ───────────────────────────────────────────────────────────────
PYTHON_BIN=""
for candidate in python3.13 python3.12 python3.11 python3; do
    if command -v "${candidate}" &>/dev/null; then
        _ver=$(${candidate} -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null)
        _major=$(echo "${_ver}" | cut -d. -f1)
        _minor=$(echo "${_ver}" | cut -d. -f2)
        if [[ "${_major}" -eq 3 && "${_minor}" -ge 11 && "${_minor}" -le 13 ]]; then
            PYTHON_BIN="${candidate}"
            break
        fi
    fi
done

if [[ -z "${PYTHON_BIN}" ]]; then
    echo "❌ Error: no se encontró Python 3.11–3.13 en PATH."
    if [[ "${DETECTED_OS}" == "Darwin" ]]; then
        echo "   Instalar con: brew install python@3.12"
    else
        echo "   Instalar con: sudo apt install python3.12 python3-venv python3-pip"
    fi
    echo "❌ Python 3.11-3.13 no encontrado" >> "${LOG_FILE}"
    exit 1
fi

PYTHON_VERSION=$(${PYTHON_BIN} -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "Python: ${PYTHON_VERSION} (${PYTHON_BIN})"
echo "Python: ${PYTHON_VERSION} (${PYTHON_BIN})" >> "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# VIRTUALENV — aislado en brain/.venv
# ───────────────────────────────────────────────────────────────

# ───────────────────────────────────────────────────────────────
# DEPENDENCIAS — sin venv, directo con python3 del sistema
# ───────────────────────────────────────────────────────────────

echo ""
echo "Instalando dependencias..."
echo "Instalando dependencias..." >> "${LOG_FILE}"

PIP_FLAGS="--quiet --break-system-packages"

REQUIREMENTS="${BRAIN_DIR}/requirements.txt"
if [[ -f "${REQUIREMENTS}" ]]; then
    ${PYTHON_BIN} -m pip install ${PIP_FLAGS} -r "${REQUIREMENTS}" >> "${LOG_FILE}" 2>&1
    echo "✅ requirements.txt instalado"
    echo "✅ requirements.txt instalado" >> "${LOG_FILE}"
else
    echo "⚠️  requirements.txt no encontrado — instalando solo pyinstaller"
    echo "⚠️  requirements.txt no encontrado" >> "${LOG_FILE}"
fi

${PYTHON_BIN} -m pip install ${PIP_FLAGS} pyinstaller >> "${LOG_FILE}" 2>&1
echo "✅ PyInstaller instalado"
echo "✅ PyInstaller instalado" >> "${LOG_FILE}"

OUTPUT_DIR="${PROJECT_ROOT}/installer/native/bin/${BIN_ARCH}/brain"

# ───────────────────────────────────────────────────────────────
# LIMPIEZA DE OUTPUTS ANTERIORES
# Se eliminan antes de invocar PyInstaller para evitar que
# artefactos obsoletos de _internal/ (módulos eliminados,
# .pyc cacheados, etc.) queden mezclados con el build nuevo.
#
# Se limpian dos paths:
#   1. Output primario  → installer/native/bin/<arch>/brain/
#   2. Path legacy      → brain/dist/brain/  (fallback de verificación)
#
# build-all.py ya limpia el path primario desde Python antes de
# invocar este script; la limpieza aquí actúa como red de seguridad
# para builds directos (bash build-brain.sh sin build-all.py)
# y para el dist/ legacy que build-all.py no toca.
# ───────────────────────────────────────────────────────────────

echo ""
echo "Limpiando outputs anteriores..."
echo "Limpiando outputs anteriores..." >> "${LOG_FILE}"

# Path primario
if [[ -d "${OUTPUT_DIR}" ]]; then
    rm -rf "${OUTPUT_DIR}"
    echo "  🧹 Eliminado: ${OUTPUT_DIR}"
    echo "  🧹 Eliminado: ${OUTPUT_DIR}" >> "${LOG_FILE}"
fi

# Path legacy (dist/)
LEGACY_DIST="${PROJECT_ROOT}/brain/dist/brain"
if [[ -d "${LEGACY_DIST}" ]]; then
    rm -rf "${LEGACY_DIST}"
    echo "  🧹 Eliminado (legacy): ${LEGACY_DIST}"
    echo "  🧹 Eliminado (legacy): ${LEGACY_DIST}" >> "${LOG_FILE}"
fi

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

${PYTHON_BIN} "${BUILD_SCRIPT}" >> "${LOG_FILE}" 2>&1

BUILD_RC=$?

if [[ ${BUILD_RC} -ne 0 ]]; then
    echo ""
    echo "❌ Build falló (code ${BUILD_RC})"
    echo "📋 Revisa el log: ${LOG_FILE}"
    echo "❌ Build falló (code ${BUILD_RC})" >> "${LOG_FILE}"
    exit ${BUILD_RC}
fi

# ───────────────────────────────────────────────────────────────
# VERIFICAR EJECUTABLE
# Espeja la lógica de brain.ps1 — busca en el output path primario
# y en el path legacy de dist/ como fallback.
# ───────────────────────────────────────────────────────────────

EXE_PATH=""

for candidate in \
    "${OUTPUT_DIR}/brain" \
    "${PROJECT_ROOT}/brain/dist/brain/brain"; do
    if [[ -f "${candidate}" ]]; then
        EXE_PATH="${candidate}"
        break
    fi
done

if [[ -z "${EXE_PATH}" ]]; then
    echo "⚠️  Ejecutable brain no encontrado en paths esperados"
    echo "⚠️  Ejecutable no encontrado" >> "${LOG_FILE}"
else
    echo "✅ Ejecutable: ${EXE_PATH}"
    echo "✅ Ejecutable: ${EXE_PATH}" >> "${LOG_FILE}"

    # Verificación funcional — no fatal si falla
    if "${EXE_PATH}" --help >> "${LOG_FILE}" 2>&1; then
        echo "✅ Ejecutable funcional"
        echo "✅ Ejecutable funcional" >> "${LOG_FILE}"
    else
        echo "⚠️  No se pudo verificar ejecutable (continuando)"
        echo "⚠️  --help falló" >> "${LOG_FILE}"
    fi
fi

# ───────────────────────────────────────────────────────────────
# RESUMEN
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
