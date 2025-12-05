#!/bin/bash

set -e  # Salir si hay error

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🔧 Building Native Bridge for All Platforms${NC}"
echo "========================================================="

# Detectar directorio del script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Directorios
SRC_FILE="native_bridge.cpp"
PROJECT_ROOT="$SCRIPT_DIR/../../.."
INSTALLER_NATIVE="$PROJECT_ROOT/installer/native/bin"
HEADER_DIR="nlohmann"

# Crear directorios de destino
mkdir -p "$INSTALLER_NATIVE/darwin"
mkdir -p "$INSTALLER_NATIVE/win32"
mkdir -p "$INSTALLER_NATIVE/linux"

# Descargar json.hpp si no existe
echo ""
echo -e "${YELLOW}📦 Verificando dependencias...${NC}"
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

# Función para compilar Windows
compile_windows() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}🪟  Compilando para Windows x86_64...${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if command -v x86_64-w64-mingw32-g++ &> /dev/null; then
        x86_64-w64-mingw32-g++ -std=c++20 -I. "$SRC_FILE" \
            -o "$INSTALLER_NATIVE/win32/native_bridge.exe" \
            -lws2_32 -static-libgcc -static-libstdc++ \
            -Wl,--subsystem,console
        
        if [ -f "$INSTALLER_NATIVE/win32/native_bridge.exe" ]; then
            SIZE=$(ls -lh "$INSTALLER_NATIVE/win32/native_bridge.exe" | awk '{print $5}')
            echo -e "${GREEN}✓ Windows: native_bridge.exe creado (${SIZE})${NC}"
            echo -e "  📂 $INSTALLER_NATIVE/win32/native_bridge.exe"
        else
            echo -e "${RED}❌ Error al crear native_bridge.exe${NC}"
            return 1
        fi
    else
        echo -e "${RED}❌ MinGW no encontrado${NC}"
        echo -e "${YELLOW}   Instala con: brew install mingw-w64${NC}"
        return 1
    fi
}

# Función para compilar macOS
compile_macos() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}🍎 Compilando para macOS (Universal Binary)...${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Archivos temporales
    TEMP_ARM="$INSTALLER_NATIVE/darwin/native_bridge_arm"
    TEMP_X86="$INSTALLER_NATIVE/darwin/native_bridge_x86"
    FINAL_BIN="$INSTALLER_NATIVE/darwin/native_bridge"
    
    # Compilar arm64
    echo "  → Compilando arm64..."
    clang++ -arch arm64 -std=c++20 -I. "$SRC_FILE" -o "$TEMP_ARM"
    
    # Compilar x86_64
    echo "  → Compilando x86_64..."
    clang++ -arch x86_64 -std=c++20 -I. "$SRC_FILE" -o "$TEMP_X86"
    
    # Crear binario universal
    echo "  → Creando binario universal..."
    lipo -create -output "$FINAL_BIN" "$TEMP_ARM" "$TEMP_X86"
    chmod +x "$FINAL_BIN"
    
    # Verificar
    if [ -f "$FINAL_BIN" ]; then
        SIZE=$(ls -lh "$FINAL_BIN" | awk '{print $5}')
        echo -e "${GREEN}✓ macOS: native_bridge creado (${SIZE})${NC}"
        echo -e "  📂 $INSTALLER_NATIVE/darwin/native_bridge"
        echo -e "  🏗️  $(lipo -info "$FINAL_BIN" | cut -d: -f3)"
        
        # Limpiar temporales
        rm -f "$TEMP_ARM" "$TEMP_X86"
    else
        echo -e "${RED}❌ Error al crear binario macOS${NC}"
        return 1
    fi
}

# Función para compilar Linux
compile_linux() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}🐧 Compilando para Linux x86_64...${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    if command -v g++ &> /dev/null; then
        g++ -std=c++20 -I. "$SRC_FILE" \
            -o "$INSTALLER_NATIVE/linux/native_bridge" \
            -lpthread -static-libgcc -static-libstdc++
        
        chmod +x "$INSTALLER_NATIVE/linux/native_bridge"
        
        if [ -f "$INSTALLER_NATIVE/linux/native_bridge" ]; then
            SIZE=$(ls -lh "$INSTALLER_NATIVE/linux/native_bridge" | awk '{print $5}')
            echo -e "${GREEN}✓ Linux: native_bridge creado (${SIZE})${NC}"
            echo -e "  📂 $INSTALLER_NATIVE/linux/native_bridge"
        else
            echo -e "${RED}❌ Error al crear binario Linux${NC}"
            return 1
        fi
    else
        echo -e "${YELLOW}⚠️  g++ no encontrado (solo disponible en Linux)${NC}"
        echo -e "   Esto es normal si estás en macOS/Windows"
        return 0
    fi
}

# Ejecutar compilaciones
FAILED=0

compile_windows || FAILED=$((FAILED + 1))
compile_macos || FAILED=$((FAILED + 1))
compile_linux || FAILED=$((FAILED + 1))

# Resumen final
echo ""
echo "========================================================="
if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ Todas las compilaciones exitosas!${NC}"
elif [ $FAILED -eq 1 ]; then
    echo -e "${YELLOW}⚠️  1 plataforma falló (esto puede ser normal)${NC}"
else
    echo -e "${YELLOW}⚠️  $FAILED plataformas fallaron${NC}"
fi

echo ""
echo -e "${BLUE}📦 Binarios generados en:${NC}"
echo "  $INSTALLER_NATIVE/"
echo ""

# Listar todos los binarios creados
if [ -f "$INSTALLER_NATIVE/win32/native_bridge.exe" ]; then
    echo -e "  ${GREEN}✓${NC} win32/native_bridge.exe"
fi
if [ -f "$INSTALLER_NATIVE/darwin/native_bridge" ]; then
    echo -e "  ${GREEN}✓${NC} darwin/native_bridge"
fi
if [ -f "$INSTALLER_NATIVE/linux/native_bridge" ]; then
    echo -e "  ${GREEN}✓${NC} linux/native_bridge"
fi

echo ""
echo -e "${BLUE}🚀 Listo para empaquetar con el instalador${NC}"
echo "========================================================="

exit 0