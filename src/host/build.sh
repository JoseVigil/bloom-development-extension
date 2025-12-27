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
    
    # Detectar OpenSSL para MinGW
    OPENSSL_INCLUDE=""
    OPENSSL_LIB=""
    
    # 1. Buscar OpenSSL compilado localmente (setup-openssl-mingw.sh)
    LOCAL_OPENSSL="$SCRIPT_DIR/mingw-deps/openssl-mingw"
    if [ -d "$LOCAL_OPENSSL/include" ]; then
        OPENSSL_INCLUDE="$LOCAL_OPENSSL/include"
        # Intentar lib64 primero, luego lib
        if [ -d "$LOCAL_OPENSSL/lib64" ] && [ -f "$LOCAL_OPENSSL/lib64/libssl.a" ]; then
            OPENSSL_LIB="$LOCAL_OPENSSL/lib64"
        elif [ -d "$LOCAL_OPENSSL/lib" ] && [ -f "$LOCAL_OPENSSL/lib/libssl.a" ]; then
            OPENSSL_LIB="$LOCAL_OPENSSL/lib"
        fi
        if [ -n "$OPENSSL_LIB" ]; then
            echo -e "${GREEN}✓ Found local OpenSSL: $LOCAL_OPENSSL${NC}"
            echo -e "${GREEN}✓ Libraries in: $OPENSSL_LIB${NC}"
        fi
    fi
    
    # 2. Buscar en Homebrew (mingw-w64-openssl)
    if [ -z "$OPENSSL_INCLUDE" ]; then
        POSSIBLE_OPENSSL_PATHS=(
            "/opt/homebrew/opt/mingw-w64-openssl"
            "/usr/local/opt/mingw-w64-openssl"
            "/opt/homebrew/Cellar/mingw-w64-openssl"
            "/usr/local/Cellar/mingw-w64-openssl"
        )
        
        for path in "${POSSIBLE_OPENSSL_PATHS[@]}"; do
            if [ -d "$path" ]; then
                if [ -d "$path/generic/include" ]; then
                    OPENSSL_INCLUDE="$path/generic/include"
                    OPENSSL_LIB="$path/generic/lib"
                    break
                elif [ -d "$path/include" ]; then
                    OPENSSL_INCLUDE="$path/include"
                    OPENSSL_LIB="$path/lib"
                    break
                fi
            fi
        done
    fi
    
    # 3. Buscar con find
    if [ -z "$OPENSSL_INCLUDE" ]; then
        echo -e "${YELLOW}  Searching for OpenSSL headers...${NC}"
        FOUND_HEADER=$(find "$SCRIPT_DIR" /opt/homebrew /usr/local -path "*/mingw*/include/openssl/sha.h" 2>/dev/null | head -1)
        if [ -n "$FOUND_HEADER" ]; then
            OPENSSL_INCLUDE=$(dirname $(dirname "$FOUND_HEADER"))
            OPENSSL_LIB=$(dirname "$OPENSSL_INCLUDE")/lib
        fi
    fi
    
    if [ -z "$OPENSSL_INCLUDE" ]; then
        echo -e "${RED}✗ OpenSSL for MinGW not found!${NC}"
        echo ""
        echo -e "${YELLOW}Please run setup script first:${NC}"
        echo -e "${YELLOW}  ./setup-openssl-mingw.sh${NC}"
        echo ""
        echo -e "${YELLOW}Or install via Homebrew (if available):${NC}"
        echo -e "${YELLOW}  brew install mingw-w64-openssl${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✓ Found OpenSSL: $OPENSSL_INCLUDE${NC}"
    
    # Compilar con OpenSSL estático
    x86_64-w64-mingw32-g++ -std=c++20 -O2 -I. -I"$OPENSSL_INCLUDE" "$SRC_FILE" \
        -o "$OUT_DIR/win32/bloom-host.exe" \
        -L"$OPENSSL_LIB" \
        "$OPENSSL_LIB/libssl.a" "$OPENSSL_LIB/libcrypto.a" \
        -lws2_32 -lshell32 -lcrypt32 -luser32 -lgdi32 \
        -static-libgcc -static-libstdc++ \
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
            grep -v "KERNEL32\|api-ms-win\|SHELL32\|WS2_32\|CRYPT32\|ADVAPI32\|USER32\|GDI32" | \
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
        echo -e "${YELLOW}⚠  Could not find MinGW bin directory${NC}"
        echo -e "${YELLOW}  The executable should still work if OpenSSL was statically linked${NC}"
    fi
fi

# macOS (SEPARADO POR ARQUITECTURA)
if [[ "$OSTYPE" == "darwin"* ]]; then
    # Detectar OpenSSL para macOS
    MACOS_OPENSSL_INCLUDE=""
    MACOS_OPENSSL_LIB=""
    
    # Buscar OpenSSL de Homebrew (intentar ARM64 primero, luego Intel)
    if [ -d "/opt/homebrew/opt/openssl@3" ]; then
        # ARM64 Homebrew
        MACOS_OPENSSL_INCLUDE="/opt/homebrew/opt/openssl@3/include"
        MACOS_OPENSSL_LIB="/opt/homebrew/opt/openssl@3/lib"
        echo -e "${GREEN}✓ Found ARM64 OpenSSL${NC}"
    elif [ -d "/usr/local/opt/openssl@3" ]; then
        # Intel Homebrew
        MACOS_OPENSSL_INCLUDE="/usr/local/opt/openssl@3/include"
        MACOS_OPENSSL_LIB="/usr/local/opt/openssl@3/lib"
        echo -e "${YELLOW}⚠ Found x86_64 OpenSSL (may not support ARM64 cross-compilation)${NC}"
    elif [ -d "/opt/homebrew/opt/openssl@1.1" ]; then
        MACOS_OPENSSL_INCLUDE="/opt/homebrew/opt/openssl@1.1/include"
        MACOS_OPENSSL_LIB="/opt/homebrew/opt/openssl@1.1/lib"
    elif [ -d "/usr/local/opt/openssl@1.1" ]; then
        MACOS_OPENSSL_INCLUDE="/usr/local/opt/openssl@1.1/include"
        MACOS_OPENSSL_LIB="/usr/local/opt/openssl@1.1/lib"
    fi
    
    if [ -z "$MACOS_OPENSSL_INCLUDE" ]; then
        echo -e "${RED}✗ OpenSSL not found for macOS${NC}"
        echo -e "${YELLOW}Install with: brew install openssl@3${NC}"
        exit 1
    fi
    
    # Detectar arquitectura nativa
    NATIVE_ARCH=$(uname -m)
    echo -e "${YELLOW}� Native architecture: $NATIVE_ARCH${NC}"
    
    # Verificar si OpenSSL soporta múltiples arquitecturas
    if lipo -info "$MACOS_OPENSSL_LIB/libssl.dylib" 2>/dev/null | grep -q "arm64.*x86_64\|x86_64.*arm64"; then
        echo -e "${GREEN}✓ OpenSSL supports universal binary${NC}"
        BUILD_ARM64=true
        BUILD_X86_64=true
    elif lipo -info "$MACOS_OPENSSL_LIB/libssl.dylib" 2>/dev/null | grep -q "arm64"; then
        echo -e "${YELLOW}⚠ OpenSSL only supports ARM64${NC}"
        BUILD_ARM64=true
        BUILD_X86_64=false
    elif lipo -info "$MACOS_OPENSSL_LIB/libssl.dylib" 2>/dev/null | grep -q "x86_64"; then
        echo -e "${YELLOW}⚠ OpenSSL only supports x86_64${NC}"
        BUILD_ARM64=false
        BUILD_X86_64=true
    else
        echo -e "${YELLOW}⚠ Could not determine OpenSSL architectures, building for native only${NC}"
        BUILD_ARM64=$([ "$NATIVE_ARCH" = "arm64" ] && echo true || echo false)
        BUILD_X86_64=$([ "$NATIVE_ARCH" = "x86_64" ] && echo true || echo false)
    fi
    
    # Compilar para ARM64
    if [ "$BUILD_ARM64" = true ]; then
        echo -e "${YELLOW}� Compiling for macOS (ARM64)...${NC}"
        clang++ -arch arm64 -std=c++20 -O2 -I. -I"$MACOS_OPENSSL_INCLUDE" "$SRC_FILE" \
            -o "$OUT_DIR/darwin/arm64/bloom-host" \
            -L"$MACOS_OPENSSL_LIB" -lssl -lcrypto
        chmod +x "$OUT_DIR/darwin/arm64/bloom-host"
        echo -e "${GREEN}✓ ARM64 binary created${NC}"
    else
        echo -e "${YELLOW}⊘ Skipping ARM64 build (OpenSSL not available for this arch)${NC}"
    fi

    # Compilar para x86_64
    if [ "$BUILD_X86_64" = true ]; then
        echo -e "${YELLOW}� Compiling for macOS (x64)...${NC}"
        clang++ -arch x86_64 -std=c++20 -O2 -I. -I"$MACOS_OPENSSL_INCLUDE" "$SRC_FILE" \
            -o "$OUT_DIR/darwin/x64/bloom-host" \
            -L"$MACOS_OPENSSL_LIB" -lssl -lcrypto
        chmod +x "$OUT_DIR/darwin/x64/bloom-host"
        echo -e "${GREEN}✓ x86_64 binary created${NC}"
    else
        echo -e "${YELLOW}⊘ Skipping x86_64 build (OpenSSL not available for this arch)${NC}"
    fi

    if [ "$BUILD_ARM64" = true ] && [ "$BUILD_X86_64" = true ]; then
        echo -e "${GREEN}✓ bloom-host created for both macOS architectures${NC}"
    elif [ "$BUILD_ARM64" = true ]; then
        echo -e "${GREEN}✓ bloom-host created for macOS ARM64${NC}"
    elif [ "$BUILD_X86_64" = true ]; then
        echo -e "${GREEN}✓ bloom-host created for macOS x86_64${NC}"
    fi
fi

# Linux
if command -v g++ &> /dev/null && [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo -e "${YELLOW}� Compiling for Linux...${NC}"
    g++ -std=c++20 -O2 -I. "$SRC_FILE" \
        -o "$OUT_DIR/linux/bloom-host" \
        -lpthread -lssl -lcrypto -static-libgcc -static-libstdc++
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