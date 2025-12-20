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
