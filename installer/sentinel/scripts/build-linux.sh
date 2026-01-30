#!/usr/bin/env bash
set -euo pipefail

# ───────────────────────────────────────────────────────────────
# Configuración básica
# ───────────────────────────────────────────────────────────────

GOOS=linux
GOARCH=amd64          # o arm64 si lo necesitas para ARM
CGO_ENABLED=0

PLATFORM=linux
APP_FOLDER=sentinel

# Rutas relativas desde installer/scripts/
OUTPUT_BASE=../../native/bin/${PLATFORM}/${APP_FOLDER}
OUTPUT_DIR="${OUTPUT_BASE}"
OUTPUT_FILE="${OUTPUT_DIR}/sentinel"          # sin .exe
HELP_DIR="${OUTPUT_DIR}/help"

mkdir -p "${OUTPUT_BASE}"
mkdir -p "${HELP_DIR}"

LOG_BASE_DIR="${HOME}/.local/share/BloomNucleus/logs/build"   # o donde prefieras
LOG_FILE="${LOG_BASE_DIR}/sentinel.build.linux.log"
mkdir -p "${LOG_BASE_DIR}"

echo "=============================================" > "${LOG_FILE}"
echo "Build Log - $(date '+%Y-%m-%d %H:%M:%S')" >> "${LOG_FILE}"
echo "=============================================" >> "${LOG_FILE}"
echo "" >> "${LOG_FILE}"

echo "🚧 Building Sentinel (${GOOS}/${GOARCH} - Safe Mode)" | tee -a "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# Incrementar build number (compartido con Windows)
# ───────────────────────────────────────────────────────────────

echo "Incrementando build number..." | tee -a "${LOG_FILE}"

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

echo "✅ Build number actualizado: ${NEXT_BUILD}" | tee -a "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# Compilación
# ───────────────────────────────────────────────────────────────

echo "" | tee -a "${LOG_FILE}"
echo "Compiling sentinel → ${OUTPUT_FILE} ..." | tee -a "${LOG_FILE}"

pushd .. >/dev/null
go build -p 1 -ldflags="-s -w" -o "${OUTPUT_FILE}" . >> "${LOG_FILE}" 2>&1
BUILD_RC=$?
popd >/dev/null

if [ ${BUILD_RC} -ne 0 ]; then
    echo "❌ Compilation failed (code ${BUILD_RC})" | tee -a "${LOG_FILE}"
    echo "Revisa ${LOG_FILE}"
    exit ${BUILD_RC}
fi

echo "✅ Compilation successful: ${OUTPUT_FILE}" | tee -a "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# Copiar blueprint.json
# ───────────────────────────────────────────────────────────────

if [[ -f "../blueprint.json" ]]; then
    cp -f "../blueprint.json" "${OUTPUT_DIR}/blueprint.json"
    echo "📦 blueprint.json copiado" | tee -a "${LOG_FILE}"
else
    echo "⚠️ blueprint.json no encontrado" | tee -a "${LOG_FILE}"
fi

# ───────────────────────────────────────────────────────────────
# Generar help
# ───────────────────────────────────────────────────────────────

echo "" | tee -a "${LOG_FILE}"
echo "Generating help files..." | tee -a "${LOG_FILE}"

"${OUTPUT_FILE}" --json-help > "${HELP_DIR}/sentinel_help.json" 2>> "${LOG_FILE}" || echo "⚠️ --json-help falló" | tee -a "${LOG_FILE}"
"${OUTPUT_FILE}" --help      > "${HELP_DIR}/sentinel_help.txt"  2>> "${LOG_FILE}" || echo "⚠️ --help falló" | tee -a "${LOG_FILE}"

echo "✅ Help files generados" | tee -a "${LOG_FILE}"

# ───────────────────────────────────────────────────────────────
# Resumen
# ───────────────────────────────────────────────────────────────

echo "" | tee -a "${LOG_FILE}"
echo "=============================================" | tee -a "${LOG_FILE}"
echo "🎉 Sentinel Linux build completed" | tee -a "${LOG_FILE}"
echo "=============================================" | tee -a "${LOG_FILE}"
echo "" | tee -a "${LOG_FILE}"
echo "Archivos en: ${OUTPUT_DIR}" | tee -a "${LOG_FILE}"
ls -l "${OUTPUT_DIR}" | tee -a "${LOG_FILE}"
echo "" | tee -a "${LOG_FILE}"
echo "Log: ${LOG_FILE}" | tee -a "${LOG_FILE}"