"""
Modelos de datos para proyectos vinculados a un Nucleus.
"""

from dataclasses import dataclass, field
from typing import Dict, Any
from datetime import datetime


@dataclass
class LinkedProject:
    """
    Representa un proyecto vinculado a un Nucleus.
    
    Attributes:
        id: Identificador único del proyecto (UUID)
        name: Nombre técnico del proyecto (usado para paths)
        display_name: Nombre legible del proyecto
        strategy: Tipo de proyecto detectado (android, typescript, python, etc.)
        repo_url: URL del repositorio git
        local_path: Path relativo al Nucleus
        status: Estado del proyecto (active, archived, etc.)
        description: Descripción opcional del proyecto
        linked_at: Timestamp ISO de cuándo se vinculó
    """
    
    id: str
    name: str
    display_name: str
    strategy: str
    repo_url: str
    local_path: str
    status: str = "active"
    description: str = ""
    linked_at: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> Dict[str, Any]:
        """
        Serializa el proyecto a diccionario para JSON.
        
        Usa naming conventions de JavaScript (camelCase) para
        compatibilidad con el formato original del Nucleus.
        
        Returns:
            Diccionario con campos en camelCase
        """
        return {
            "id": self.id,
            "name": self.name,
            "displayName": self.display_name,
            "strategy": self.strategy,
            "repoUrl": self.repo_url,
            "localPath": self.local_path,
            "status": self.status,
            "description": self.description,
            "linkedAt": self.linked_at
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'LinkedProject':
        """
        Crea un LinkedProject desde un diccionario.
        
        Acepta tanto snake_case como camelCase para compatibilidad.
        
        Args:
            data: Diccionario con datos del proyecto
            
        Returns:
            Instancia de LinkedProject
        """
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            display_name=data.get("displayName") or data.get("display_name", ""),
            strategy=data.get("strategy", ""),
            repo_url=data.get("repoUrl") or data.get("repo_url", ""),
            local_path=data.get("localPath") or data.get("local_path", ""),
            status=data.get("status", "active"),
            description=data.get("description", ""),
            linked_at=data.get("linkedAt") or data.get("linked_at", "")
        )
    
    def __repr__(self) -> str:
        return (
            f"LinkedProject(name={self.name!r}, strategy={self.strategy!r}, "
            f"path={self.local_path!r})"
        )


__all__ = ['LinkedProject']
