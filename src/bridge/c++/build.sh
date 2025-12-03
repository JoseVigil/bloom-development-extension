#!/bin/bash

set -e  # Salir si hay error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}� Building Native Bridge${NC}"
echo "======================================"

# Detectar directorio del script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Directorios
SRC_FILE="native_bridge.cpp"
BIN_DIR="../bin"
HEADER_DIR="nlohmann"

# Crear directorio bin si no existe
mkdir -p "$BIN_DIR"

# Descargar json.hpp si no existe
echo ""
echo -e "${YELLOW}� Verificando dependencias...${NC}"
if [ ! -d "$HEADER_DIR" ]; then
    mkdir -p "$HEADER_DIR"
fi

if [ ! -f "$HEADER_DIR/json.hpp" ]; then
    echo "⬇️  Descargando nlohmann/json.hpp..."
    curl -L -o "$HEADER_DIR/json.hpp" \
        https://raw.githubusercontent.com/nlohmann/json/develop/single_include/nlohmann/json.hpp
    echo -e "${GREEN}✓ json.hpp descargado${NC}"
else
    echo -e "${GREEN}✓ json.hpp ya existe${NC}"
fi

# Compilar para Windows
echo ""
echo -e "${YELLOW}� Compilando para Windows x86_64...${NC}"
if command -v x86_64-w64-mingw32-g++ &> /dev/null; then
    x86_64-w64-mingw32-g++ -std=c++20 -I. "$SRC_FILE" \
        -o "$BIN_DIR/native_bridge.exe" \
        -lws2_32 -static-libgcc -static-libstdc++ \
        -Wl,--subsystem,console
    
    if [ -f "$BIN_DIR/native_bridge.exe" ]; then
        SIZE=$(ls -lh "$BIN_DIR/native_bridge.exe" | awk '{print $5}')
        echo -e "${GREEN}✓ native_bridge.exe creado (${SIZE})${NC}"
    else
        echo -e "${RED}❌ Error al crear native_bridge.exe${NC}"
        exit 1
    fi
else
    echo -e "${RED}❌ MinGW no encontrado. Instala con: brew install mingw-w64${NC}"
    exit 1
fi

# Compilar para macOS
echo ""
echo -e "${YELLOW}� Compilando para macOS...${NC}"

# arm64
echo "  → Compilando arm64..."
clang++ -arch arm64 -std=c++20 -I. "$SRC_FILE" -o "$BIN_DIR/native_bridge_arm"

# x86_64
echo "  → Compilando x86_64..."
clang++ -arch x86_64 -std=c++20 -I. "$SRC_FILE" -o "$BIN_DIR/native_bridge_x86"

# Crear binario universal
echo "  → Creando binario universal..."
lipo -create -output "$BIN_DIR/native_bridge" \
    "$BIN_DIR/native_bridge_arm" \
    "$BIN_DIR/native_bridge_x86"

chmod +x "$BIN_DIR/native_bridge"

# Verificar y limpiar
if [ -f "$BIN_DIR/native_bridge" ]; then
    SIZE=$(ls -lh "$BIN_DIR/native_bridge" | awk '{print $5}')
    echo -e "${GREEN}✓ native_bridge creado (${SIZE})${NC}"
    echo "  Arquitecturas: $(lipo -info "$BIN_DIR/native_bridge" | cut -d: -f3)"
    
    # Limpiar temporales
    rm -f "$BIN_DIR/native_bridge_arm" "$BIN_DIR/native_bridge_x86"
else
    echo -e "${RED}❌ Error al crear native_bridge${NC}"
    exit 1
fi

# Resumen final
echo ""
echo "======================================"
echo -e "${GREEN}✅ Compilación exitosa!${NC}"
echo ""
echo "Binarios creados en: $BIN_DIR/"
echo "  � native_bridge.exe  (Windows x86_64)"
echo "  � native_bridge      (macOS universal)"
echo ""
echo "Para empaquetar en VSCode extension:"
echo "  1. Añade 'src/bridge/bin/**' en package.json"
echo "  2. Usa BridgeExecutor.ts para ejecutar los binarios"
echo "======================================"