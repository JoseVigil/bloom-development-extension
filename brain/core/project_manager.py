import json
from pathlib import Path
from typing import Dict, Any, Optional

class ProjectManager:
    """
    Gestor de Entidad Proyecto.
    Identifica, valida y carga la metadata de un proyecto en una ruta dada.
    """
    
    def __init__(self, path: Path):
        self.root = path.resolve()
        
    def load(self) -> Dict[str, Any]:
        """
        Carga la información del proyecto situado en la ruta.
        
        Returns:
            Dict con identidad del proyecto, tipo, estado de git (mock) y config.
        
        Raises:
            FileNotFoundError: Si la ruta no existe.
            ValueError: Si no parece ser un proyecto válido.
        """
        if not self.root.exists():
            raise FileNotFoundError(f"Path does not exist: {self.root}")
            
        if not self.root.is_dir():
            raise ValueError(f"Path is not a directory: {self.root}")

        # 1. Identificación del Proyecto
        identity = self._identify_project_type()
        
        # 2. Detección de Configuración Bloom (Nucleus)
        bloom_config = self._load_bloom_config()
        
        # 3. Estado de Git (Placeholder para futura integración)
        # En el futuro: git_info = GitManager(self.root).get_status()
        git_info = self._mock_git_status() 

        return {
            "path": str(self.root),
            "name": self.root.name,
            "type": identity.get("type", "generic"),
            "is_bloom_nucleus": bloom_config is not None,
            "config": bloom_config or {},
            "technologies": identity.get("markers", []),
            "git": git_info,
            "timestamp": identity.get("timestamp")
        }

    def _identify_project_type(self) -> Dict[str, Any]:
        """Heurística simple para identificar qué es el proyecto."""
        markers = []
        project_type = "generic"
        
        if (self.root / "package.json").exists():
            markers.append("node")
            project_type = "node"
        if (self.root / "pyproject.toml").exists() or (self.root / "requirements.txt").exists():
            markers.append("python")
            project_type = "python"
        if (self.root / "composer.json").exists():
            markers.append("php")
        if (self.root / "AndroidManifest.xml").exists() or (self.root / "app/build.gradle").exists():
            markers.append("android")
            project_type = "android"

        # Si tiene carpeta .bloom, es un proyecto gestionado
        if (self.root / ".bloom").exists():
            markers.append("bloom-managed")

        return {
            "type": project_type,
            "markers": markers
        }

    def _load_bloom_config(self) -> Optional[Dict]:
        """Intenta cargar .bloom/core/nucleus-config.json"""
        config_path = self.root / ".bloom" / "core" / "nucleus-config.json"
        if config_path.exists():
            try:
                return json.loads(config_path.read_text(encoding="utf-8"))
            except Exception:
                return {"error": "Invalid nucleus-config.json"}
        return None

    def _mock_git_status(self) -> Dict[str, Any]:
        """
        TODO: Reemplazar con integración real de GitManager.
        Verifica si existe .git para dar una respuesta preliminar.
        """
        is_repo = (self.root / ".git").exists()
        return {
            "is_repo": is_repo,
            "branch": "main" if is_repo else None, # Mock
            "dirty": False, # Mock
            "remote": None  # Mock
        }