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

# Windows - FIXED: Static pthread linking
if command -v x86_64-w64-mingw32-g++ &> /dev/null; then
    echo -e "${YELLOW}� Compiling for Windows...${NC}"
    
    x86_64-w64-mingw32-g++ \
        -std=c++20 \
        -O2 \
        -I. \
        "$SRC_FILE" \
        -o "$OUT_DIR/win32/bloom-host.exe" \
        -m64 \
        -static \
        -static-libgcc \
        -static-libstdc++ \
        -Wl,-Bstatic -lpthread -Wl,-Bdynamic \
        -lws2_32 \
        -lshell32 \
        -Wl,--subsystem,console
    
    echo -e "${GREEN}✓ bloom-host.exe created${NC}"
    
    # Verificar que NO tenga libwinpthread-1.dll
    echo -e "${YELLOW}� Verifying static linking...${NC}"
    if x86_64-w64-mingw32-objdump -p "$OUT_DIR/win32/bloom-host.exe" | grep -q "libwinpthread"; then
        echo -e "${RED}⚠️  WARNING: libwinpthread-1.dll still required!${NC}"
        echo -e "${YELLOW}� Copying libwinpthread-1.dll as fallback...${NC}"
        
        # Intentar copiar la DLL como fallback
        if command -v brew &> /dev/null; then
            MINGW_PATH=$(brew --prefix mingw-w64 2>/dev/null || echo "")
            if [ -n "$MINGW_PATH" ]; then
                DLL_PATH="$MINGW_PATH/toolchain-x86_64/x86_64-w64-mingw32/bin/libwinpthread-1.dll"
                if [ -f "$DLL_PATH" ]; then
                    cp "$DLL_PATH" "$OUT_DIR/win32/"
                    echo -e "${GREEN}✓ libwinpthread-1.dll copied${NC}"
                else
                    echo -e "${RED}✗ Could not find libwinpthread-1.dll${NC}"
                fi
            fi
        fi
    else
        echo -e "${GREEN}✓ Fully static binary (no pthread dependency)${NC}"
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
echo -e "${YELLOW}� Dependency check:${NC}"
if command -v x86_64-w64-mingw32-objdump &> /dev/null; then
    echo "Windows DLLs required:"
    x86_64-w64-mingw32-objdump -p "$OUT_DIR/win32/bloom-host.exe" | grep "DLL Name" | grep -v "api-ms-win" | grep -v "KERNEL32" | grep -v "SHELL32" | grep -v "WS2_32"
fi
echo ""
echo -e "${YELLOW}� Ready for Electron installer${NC}"