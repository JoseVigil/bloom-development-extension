#!/bin/bash
# Script de Limpieza Brain - Ejecutar desde raíz del proyecto

set -e  # Exit on error

echo "🧹 Brain Cleanup - Eliminando duplicados y creando interface"
echo "================================================================"

# 1. ELIMINAR DUPLICADOS
echo ""
echo "📁 Paso 1: Eliminando archivos duplicados..."

# Verificar existencia antes de eliminar
if [ -f "brain/core/context/strategies/multistack_detector.py" ]; then
    echo "  ❌ Eliminando: brain/core/context/strategies/multistack_detector.py"
    rm brain/core/context/strategies/multistack_detector.py
    echo "     ✅ Eliminado (duplicado de detector.py)"
else
    echo "  ℹ️  multistack_detector.py ya no existe"
fi

# Verificar estructura shared/shared/ (posible error)
if [ -d "brain/shared/shared" ]; then
    echo "  ❌ Eliminando: brain/shared/shared/context.py"
    rm -rf brain/shared/shared
    echo "     ✅ Eliminada carpeta shared/shared/ (estructura errónea)"
else
    echo "  ℹ️  brain/shared/shared/ no existe"
fi

# 2. CREAR INTERFACE FORMAL
echo ""
echo "📝 Paso 2: Creando interface formal ProjectStrategy..."

cat > brain/core/context/strategy_base.py << 'EOF'
"""
Project Strategy Base - Interface formal para estrategias de detección.

Define el contrato que todas las estrategias deben cumplir.
"""

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Dict, Any, List, Optional


class ProjectStrategy(ABC):
    """
    Contrato base para todas las estrategias de análisis de proyecto.
    
    Cada estrategia analiza un tipo específico de proyecto (Android, TypeScript, etc.)
    y extrae metadata normalizada.
    
    Example:
        class AndroidStrategy(ProjectStrategy):
            @classmethod
            def get_markers(cls) -> List[str]:
                return ["AndroidManifest.xml", "build.gradle"]
            
            def analyze(self) -> Dict[str, Any]:
                return {
                    "platform": "Android",
                    "language": "Kotlin",
                    "dependencies": [...]
                }
    """
    
    def __init__(self, project_root: Path):
        """
        Inicializa la estrategia.
        
        Args:
            project_root: Ruta absoluta al proyecto a analizar
        """
        self.project_root = project_root.resolve()
    
    @abstractmethod
    def analyze(self) -> Dict[str, Any]:
        """
        Analiza el proyecto y retorna metadata normalizada.
        
        ESTRUCTURA RECOMENDADA (adaptable según tecnología):
        {
            "language": str,           # Ej: "Kotlin/Java", "TypeScript"
            "framework": str,          # Ej: "Android SDK", "React"
            "project_name": str,       # Nombre del proyecto
            "dependencies": List[str], # Dependencias principales
            "config_files": List[str], # Archivos de configuración detectados
            "raw_data": Dict,          # Metadata adicional específica
        }
        
        Returns:
            Diccionario con metadata del proyecto
            
        Raises:
            ValueError: Si el proyecto no es válido para esta estrategia
            FileNotFoundError: Si faltan archivos críticos
        """
        pass
    
    def is_applicable(self) -> bool:
        """
        Validación adicional si la estrategia aplica al proyecto.
        
        Por defecto retorna True (el detector ya validó marcadores).
        Override solo si necesitas validaciones más profundas.
        
        Returns:
            True si la estrategia puede analizar este proyecto
        """
        return True
    
    @classmethod
    def get_markers(cls) -> List[str]:
        """
        Retorna lista de archivos marcadores que identifican esta estrategia.
        
        Usado por el detector para determinar qué estrategia cargar.
        
        Returns:
            Lista de nombres de archivos (ej: ["package.json", "tsconfig.json"])
        """
        return []
    
    @classmethod
    def get_strategy_name(cls) -> str:
        """
        Nombre único de la estrategia (usado en detector y carga).
        
        Por defecto usa el nombre de la clase sin "Strategy".
        Override si necesitas un nombre custom.
        
        Returns:
            Nombre de la estrategia (ej: "android", "typescript")
        """
        name = cls.__name__.replace("Strategy", "")
        return name.lower()


__all__ = ['ProjectStrategy']
EOF

echo "  ✅ Creado: brain/core/context/strategy_base.py"

# 3. ACTUALIZAR __init__.py
echo ""
echo "📦 Paso 3: Actualizando __init__.py..."

cat > brain/core/context/__init__.py << 'EOF'
"""
Context Module - Sistema de detección de tecnologías y generación de documentación.

NOTA: "Context" se refiere a "contexto tecnológico" del proyecto,
no a "contexto de sesión" (ese está en brain/shared/context.py).

Componentes principales:
- detector.py: Detecta tecnologías en el proyecto
- manager.py: Orquesta generación de documentación
- strategy_base.py: Interface para estrategias
- strategy_loader.py: Carga dinámica de estrategias
- strategies/: Implementaciones específicas por tecnología
"""

from .strategy_base import ProjectStrategy

__all__ = ['ProjectStrategy']
EOF

echo "  ✅ Actualizado: brain/core/context/__init__.py"

# 4. COMPLETAR MARKERS EN DETECTOR
echo ""
echo "🔍 Paso 4: Agregando marcadores faltantes a detector.py..."

# Backup del detector original
cp brain/core/context/detector.py brain/core/context/detector.py.backup

# Agregar marcadores (Python script inline)
python3 << 'PYTHON_SCRIPT'
import re

# Leer detector.py
with open("brain/core/context/detector.py", "r") as f:
    content = f.read()

# Encontrar el diccionario MARKERS
markers_pattern = r'(MARKERS\s*=\s*\{[^}]+)\}'
match = re.search(markers_pattern, content, re.DOTALL)

if match:
    markers_section = match.group(1)
    
    # Marcadores faltantes a agregar
    new_markers = '''
        # Flutter
        "pubspec.yaml": "flutter",
        
        # Go
        "go.mod": "go",
        "go.sum": "go",
        
        # Rust
        "Cargo.toml": "rust",
        "Cargo.lock": "rust",
        
        # Ruby
        "Gemfile": "ruby",
        "Gemfile.lock": "ruby",
        
        # .NET
        "*.csproj": "dotnet",
        "*.sln": "dotnet",
        
        # CI/CD
        ".gitlab-ci.yml": "cicd",
        ".github/workflows": "cicd",
        "azure-pipelines.yml": "cicd",
        
        # Infrastructure as Code
        "terraform.tf": "iac",
        "main.tf": "iac",
        "Pulumi.yaml": "iac"'''
    
    # Reemplazar cerrando llave con nuevos marcadores + llave
    updated_content = content.replace(
        match.group(0),
        markers_section + "," + new_markers + "\n    }"
    )
    
    # Escribir archivo actualizado
    with open("brain/core/context/detector.py", "w") as f:
        f.write(updated_content)
    
    print("  ✅ Marcadores agregados a detector.py")
else:
    print("  ⚠️  No se encontró MARKERS en detector.py")
PYTHON_SCRIPT

echo ""
echo "================================================================"
echo "✅ Limpieza completada exitosamente"
echo ""
echo "📝 Cambios realizados:"
echo "  1. Eliminados archivos duplicados"
echo "  2. Creada interface ProjectStrategy"
echo "  3. Actualizado __init__.py con documentación"
echo "  4. Agregados marcadores faltantes a detector"
echo ""
echo "🔄 Backup creado: brain/core/context/detector.py.backup"
echo ""
echo "🎯 Siguiente paso: Crear prompts corregidos para brain project add"