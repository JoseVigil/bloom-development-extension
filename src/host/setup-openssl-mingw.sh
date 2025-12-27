#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}� Setting up OpenSSL for MinGW-w64${NC}"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DEPS_DIR="$SCRIPT_DIR/mingw-deps"
OPENSSL_VERSION="3.0.15"
OPENSSL_DIR="$DEPS_DIR/openssl-$OPENSSL_VERSION"
INSTALL_DIR="$DEPS_DIR/openssl-mingw"

mkdir -p "$DEPS_DIR"
cd "$DEPS_DIR"

# Descargar OpenSSL si no existe
if [ ! -d "openssl-$OPENSSL_VERSION" ]; then
    echo -e "${YELLOW}⬇️  Downloading OpenSSL ${OPENSSL_VERSION}...${NC}"
    curl -L -o "openssl-${OPENSSL_VERSION}.tar.gz" \
        "https://www.openssl.org/source/openssl-${OPENSSL_VERSION}.tar.gz"
    
    echo -e "${YELLOW}� Extracting...${NC}"
    tar -xzf "openssl-${OPENSSL_VERSION}.tar.gz"
    rm "openssl-${OPENSSL_VERSION}.tar.gz"
fi

cd "openssl-$OPENSSL_VERSION"

# Verificar que MinGW esté instalado
if ! command -v x86_64-w64-mingw32-gcc &> /dev/null; then
    echo -e "${RED}✗ MinGW-w64 not found!${NC}"
    echo -e "${YELLOW}Install with: brew install mingw-w64${NC}"
    exit 1
fi

# Limpiar configuración anterior si existe
if [ -f "Makefile" ]; then
    echo -e "${YELLOW}� Cleaning previous build...${NC}"
    make clean || true
fi

# Configurar para MinGW
echo -e "${YELLOW}⚙️  Configuring OpenSSL for MinGW-w64...${NC}"

# NO exportar CC, CXX, etc. - dejar que Configure use --cross-compile-prefix
./Configure mingw64 \
    --prefix="$INSTALL_DIR" \
    --cross-compile-prefix=x86_64-w64-mingw32- \
    no-shared \
    no-asm \
    no-tests

# Compilar
echo -e "${YELLOW}� Building OpenSSL (this may take a few minutes)...${NC}"
make -j$(sysctl -n hw.ncpu)

# Instalar
echo -e "${YELLOW}� Installing to $INSTALL_DIR...${NC}"
make install_sw

echo ""
echo -e "${GREEN}✅ OpenSSL for MinGW-w64 installed successfully!${NC}"
echo -e "${GREEN}� Location: $INSTALL_DIR${NC}"
echo ""
echo -e "${YELLOW}Now you can run ./build.sh${NC}"