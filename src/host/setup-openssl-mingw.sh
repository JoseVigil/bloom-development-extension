#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}⚙ Setting up OpenSSL for MinGW-w64${NC}"

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DEPS_DIR="$SCRIPT_DIR/mingw-deps"
OPENSSL_VERSION="3.0.15"
OPENSSL_DIR="$DEPS_DIR/openssl-$OPENSSL_VERSION"
INSTALL_DIR="$DEPS_DIR/openssl-mingw"

mkdir -p "$DEPS_DIR"
cd "$DEPS_DIR"

# Descargar si no existe
if [ ! -d "openssl-$OPENSSL_VERSION" ]; then
    echo -e "${YELLOW}⬇️ Downloading OpenSSL ${OPENSSL_VERSION}...${NC}"
    curl -L -o "openssl-${OPENSSL_VERSION}.tar.gz" \
        "https://www.openssl.org/source/openssl-${OPENSSL_VERSION}.tar.gz"
    
    echo -e "${YELLOW}📦 Extracting...${NC}"
    tar -xzf "openssl-${OPENSSL_VERSION}.tar.gz"
    rm "openssl-${OPENSSL_VERSION}.tar.gz"
fi

cd "openssl-$OPENSSL_VERSION"

# Verificar MinGW
if ! command -v x86_64-w64-mingw32-gcc &> /dev/null; then
    echo -e "${RED}✗ MinGW-w64 no está instalado${NC}"
    echo "Ejecuta: sudo apt install -y mingw-w64 g++-mingw-w64-x86-64"
    exit 1
fi

# Limpieza previa
make clean >/dev/null 2>&1 || true
rm -f Makefile

echo -e "${YELLOW}⚙ Configuring OpenSSL para MinGW-w64 (solo con prefijo)${NC}"

# ← ESTA ES LA LÍNEA CLAVE - SIN VARIABLES DE ENTORNO, SOLO PREFIJO
./Configure mingw64 \
    --prefix="$INSTALL_DIR" \
    --cross-compile-prefix=x86_64-w64-mingw32- \
    no-shared \
    no-asm \
    no-tests \
    -Os

echo -e "${YELLOW}🔨 Compilando (paciencia, puede tardar)...${NC}"
make -j1   # ← -j1 para evitar que se coma toda la memoria

echo -e "${YELLOW}📥 Instalando en $INSTALL_DIR...${NC}"
make install_sw

echo ""
echo -e "${GREEN}✓ OpenSSL para MinGW listo!${NC}"
echo "Ubicación: $INSTALL_DIR"
echo ""
echo -e "${YELLOW}Ahora podés ejecutar ./build.sh${NC}"
