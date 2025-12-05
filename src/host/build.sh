#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}� Building Bloom Host${NC}"

# Detectar directorio del script (src/host/)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Archivos fuente
SRC_FILE="bloom-host.cpp"
HEADER_DIR="nlohmann"

# Destino: installer/native/bin/
PROJECT_ROOT="$SCRIPT_DIR/../.."
OUT_DIR="$PROJECT_ROOT/installer/native/bin"

mkdir -p "$OUT_DIR/win32" "$OUT_DIR/darwin" "$OUT_DIR/linux"

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
        -lws2_32 -lshlwapi -static-libgcc -static-libstdc++ \
        -Wl,--subsystem,console
    echo -e "${GREEN}✓ bloom-host.exe created${NC}"
fi

# macOS Universal
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo -e "${YELLOW}� Compiling for macOS...${NC}"
    clang++ -arch arm64 -std=c++20 -O2 -I. "$SRC_FILE" -o "$OUT_DIR/darwin/bloom-host_arm"
    clang++ -arch x86_64 -std=c++20 -O2 -I. "$SRC_FILE" -o "$OUT_DIR/darwin/bloom-host_x86"
    lipo -create -output "$OUT_DIR/darwin/bloom-host" \
        "$OUT_DIR/darwin/bloom-host_arm" "$OUT_DIR/darwin/bloom-host_x86"
    chmod +x "$OUT_DIR/darwin/bloom-host"
    rm -f "$OUT_DIR/darwin/bloom-host_arm" "$OUT_DIR/darwin/bloom-host_x86"
    echo -e "${GREEN}✓ bloom-host created (Universal)${NC}"
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
echo -e "${YELLOW}� Ready for Electron installer${NC}"
ls -lh "$OUT_DIR/win32/" "$OUT_DIR/darwin/" 2>/dev/null | grep bloom-host