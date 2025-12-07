#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}⚙ Building Bloom Host${NC}"

# Detectar directorio del script (src/host/)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Archivos fuente
SRC_FILE="bloom-host.cpp"
HEADER_DIR="nlohmann"

# Destino: installer/native/bin/
PROJECT_ROOT="$SCRIPT_DIR/../.."
OUT_DIR="$PROJECT_ROOT/installer/native/bin"

# Crear carpetas separadas por arquitectura
mkdir -p "$OUT_DIR/win32" \
         "$OUT_DIR/linux" \
         "$OUT_DIR/darwin/arm64" \
         "$OUT_DIR/darwin/x64"

# Descargar json.hpp
if [ ! -f "$HEADER_DIR/json.hpp" ]; then
    mkdir -p "$HEADER_DIR"
    echo "⬇️ Downloading nlohmann/json.hpp..."
    curl -L -o "$HEADER_DIR/json.hpp" \
        https://raw.githubusercontent.com/nlohmann/json/develop/single_include/nlohmann/json.hpp
    echo -e "${GREEN}✓ json.hpp downloaded${NC}"
fi

# Windows
if command -v x86_64-w64-mingw32-g++ &> /dev/null; then
    echo -e "${YELLOW}� Compiling for Windows...${NC}"
    
    x86_64-w64-mingw32-g++ -std=c++20 -O2 -I. "$SRC_FILE" \
        -o "$OUT_DIR/win32/bloom-host.exe" \
        -lws2_32 -lshell32 -static-libgcc -static-libstdc++ \
        -Wl,--subsystem,console
    
    echo -e "${GREEN}✓ bloom-host.exe created${NC}"
    
    # Detectar y copiar DLLs requeridas desde MinGW
    echo -e "${YELLOW}� Detecting required DLLs...${NC}"
    
    # Buscar DLLs en el sistema MinGW
    MINGW_BIN=""
    
    # Lista de ubicaciones posibles (en orden de prioridad)
    POSSIBLE_PATHS=(
        "/usr/local/opt/mingw-w64/toolchain-x86_64/x86_64-w64-mingw32/bin"
        "/opt/homebrew/opt/mingw-w64/toolchain-x86_64/x86_64-w64-mingw32/bin"
        "/usr/local/Cellar/mingw-w64/*/toolchain-x86_64/x86_64-w64-mingw32/bin"
    )
    
    # Intentar cada ubicación
    for path in "${POSSIBLE_PATHS[@]}"; do
        # Expandir wildcards si existen
        expanded_paths=($path)
        for expanded in "${expanded_paths[@]}"; do
            if [ -d "$expanded" ] && [ -f "$expanded/libwinpthread-1.dll" ]; then
                MINGW_BIN="$expanded"
                break 2
            fi
        done
    done
    
    # Si no se encontró, buscar con find
    if [ -z "$MINGW_BIN" ]; then
        echo -e "${YELLOW}  Searching for libwinpthread-1.dll...${NC}"
        FOUND_DLL=$(find /usr/local /opt/homebrew -name "libwinpthread-1.dll" 2>/dev/null | head -1)
        if [ -n "$FOUND_DLL" ]; then
            MINGW_BIN=$(dirname "$FOUND_DLL")
        fi
    fi
    
    if [ -n "$MINGW_BIN" ] && [ -d "$MINGW_BIN" ]; then
        echo -e "${GREEN}✓ Found MinGW bin: $MINGW_BIN${NC}"
        
        # Detectar qué DLLs necesita el ejecutable
        REQUIRED_DLLS=$(x86_64-w64-mingw32-objdump -p "$OUT_DIR/win32/bloom-host.exe" | \
            grep "DLL Name:" | \
            grep -v "KERNEL32\|api-ms-win\|SHELL32\|WS2_32" | \
            awk '{print $3}')
        
        if [ -n "$REQUIRED_DLLS" ]; then
            echo -e "${YELLOW}Required DLLs:${NC}"
            echo "$REQUIRED_DLLS"
            
            # Copiar cada DLL requerida
            for DLL in $REQUIRED_DLLS; do
                DLL_PATH="$MINGW_BIN/$DLL"
                if [ -f "$DLL_PATH" ]; then
                    cp "$DLL_PATH" "$OUT_DIR/win32/"
                    echo -e "${GREEN}  ✓ Copied: $DLL${NC}"
                else
                    echo -e "${RED}  ✗ Not found: $DLL${NC}"
                fi
            done
        else
            echo -e "${GREEN}✓ No external DLLs required (fully static)${NC}"
        fi
    else
        echo -e "${YELLOW}⚠ Could not find MinGW bin directory${NC}"
        echo -e "${YELLOW}  If the executable fails, manually copy DLLs to:${NC}"
        echo -e "${YELLOW}  $OUT_DIR/win32/${NC}"
    fi
fi

# macOS (SEPARADO POR ARQUITECTURA)
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}� Compiling for macOS (ARM64)...${NC}"
    clang++ -arch arm64 -std=c++20 -O2 -I. "$SRC_FILE" \
        -o "$OUT_DIR/darwin/arm64/bloom-host"
    chmod +x "$OUT_DIR/darwin/arm64/bloom-host"

    echo -e "${YELLOW}� Compiling for macOS (x64)...${NC}"
    clang++ -arch x86_64 -std=c++20 -O2 -I. "$SRC_FILE" \
        -o "$OUT_DIR/darwin/x64/bloom-host"
    chmod +x "$OUT_DIR/darwin/x64/bloom-host"

    echo -e "${GREEN}✓ bloom-host created for both macOS architectures${NC}"
fi

# Linux
if command -v g++ &> /dev/null && [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo -e "${YELLOW}� Compiling for Linux...${NC}"
    g++ -std=c++20 -O2 -I. "$SRC_FILE" \
        -o "$OUT_DIR/linux/bloom-host" \
        -lpthread -static-libgcc -static-libstdc++
    chmod +x "$OUT_DIR/linux/bloom-host"
    echo -e "${GREEN}✓ bloom-host created${NC}"
fi

echo ""
echo -e "${GREEN}✅ Build complete!${NC}"
echo "Binaries in: $OUT_DIR/"
echo ""
echo -e "${YELLOW}� Windows build contents:${NC}"
ls -lh "$OUT_DIR/win32/" 2>/dev/null || echo "No Windows build"
echo ""
echo -e "${YELLOW}� Ready for Electron installer${NC}"