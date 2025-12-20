"""
ProjectLinker - Vincula proyectos locales existentes a un Nucleus.

Core Layer: Lógica pura sin dependencias de CLI/Typer.

INTEGRACIÓN CON SISTEMA EXISTENTE:
- Usa brain/core/context/detector.py (MultiStackDetector) para detectar tipo
- Lee/escribe nucleus-config.json del Nucleus
- Crea nucleus.json en proyecto hijo
- Genera overview.bl con información del proyecto
- Regenera _index.bl del Brain
"""

import json
import subprocess
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, Any, List

from brain.core.project.models import LinkedProject


class ProjectLinker:
    """
    Vincula proyectos existentes a un Nucleus.
    
    Flujo completo:
    1. Valida paths y permisos
    2. Detecta estrategia con MultiStackDetector
    3. Crea LinkedProject con metadata
    4. Actualiza nucleus-config.json
    5. Crea nucleus.json en proyecto
    6. Genera overview.bl
    7. Regenera _index.bl
    
    Example:
        linker = ProjectLinker(
            project_path=Path("./my-app"),
            nucleus_path=Path("../nucleus-org")
        )
        
        project = linker.link(
            name="my-app",
            description="Mi aplicación principal"
        )
    """
    
    def __init__(self, project_path: Path, nucleus_path: Path):
        """
        Inicializa el linker.
        
        Args:
            project_path: Ruta al proyecto a vincular
            nucleus_path: Ruta al Nucleus destino
        """
        self.project_path = project_path.resolve()
        self.nucleus_path = nucleus_path.resolve()
        self.bloom_dir = self.nucleus_path / ".bloom"
        self.core_dir = self.bloom_dir / "core"
        self.brain_dir = self.bloom_dir / "brain"
    
    def link(
        self,
        name: Optional[str] = None,
        strategy: Optional[str] = None,
        description: Optional[str] = None,
        repo_url: Optional[str] = None,
        verbose: bool = False
    ) -> LinkedProject:
        """
        Vincula el proyecto al Nucleus.
        
        Args:
            name: Nombre custom del proyecto (default: nombre de carpeta)
            strategy: Forzar estrategia específica (default: auto-detect)
            description: Descripción del proyecto
            repo_url: URL del repositorio git
            verbose: Mostrar información detallada del proceso
            
        Returns:
            LinkedProject con toda la información del vínculo
            
        Raises:
            ValueError: Si validaciones fallan
            FileNotFoundError: Si paths no existen
        """
        
        # 1. Validar
        self._validate_paths()
        self._validate_not_already_linked()
        
        # 2. Detectar estrategia
        detected_strategy = strategy or self._detect_strategy()
        
        # 3. Crear LinkedProject
        project_name = name or self.project_path.name
        
        linked_project = LinkedProject(
            id=str(uuid.uuid4()),
            name=project_name,
            display_name=self._to_display_name(project_name),
            strategy=detected_strategy,
            repo_url=repo_url or self._detect_git_remote() or "",
            local_path=self._calculate_relative_path(),
            description=description or "",
            linked_at=datetime.now().isoformat()
        )
        
        # 4-7. Realizar vinculación
        self._update_nucleus_config(linked_project)
        self._create_nucleus_link(linked_project)
        self._create_overview_file(linked_project)
        self._regenerate_index()
        
        return linked_project
    
    def _detect_strategy(self) -> str:
        """
        INTEGRACIÓN CON SISTEMA EXISTENTE.
        Usa MultiStackDetector para detectar tipo de proyecto.
        
        Returns:
            Nombre de estrategia detectada (android, typescript, python, etc.)
            o "generic" si no se detecta nada específico
        """
        # Lazy import para evitar carga innecesaria
        from brain.core.context.detector import MultiStackDetector
        
        detector = MultiStackDetector(self.project_path)
        detected = detector.detect()
        
        if not detected:
            return "generic"
        
        # Tomar primera estrategia detectada (raíz del proyecto)
        # El detector retorna módulos ordenados con raíz primero
        return detected[0]["type"]
    
    def _validate_paths(self):
        """
        Valida que paths existan y sean válidos.
        
        Raises:
            FileNotFoundError: Si algún path no existe
            ValueError: Si Nucleus no es válido
        """
        if not self.project_path.exists():
            raise FileNotFoundError(
                f"Project path not found: {self.project_path}"
            )
        
        if not self.project_path.is_dir():
            raise ValueError(
                f"Project path is not a directory: {self.project_path}"
            )
        
        if not self.nucleus_path.exists():
            raise FileNotFoundError(
                f"Nucleus path not found: {self.nucleus_path}"
            )
        
        # Validar que es un Nucleus válido
        nucleus_config = self.core_dir / "nucleus-config.json"
        if not nucleus_config.exists():
            raise ValueError(
                f"Not a valid Nucleus project (missing nucleus-config.json): "
                f"{self.nucleus_path}"
            )
    
    def _validate_not_already_linked(self):
        """
        Verifica que proyecto no esté ya vinculado a un Nucleus.
        
        Raises:
            ValueError: Si proyecto ya está vinculado
        """
        nucleus_link = self.project_path / ".bloom" / "nucleus.json"
        if nucleus_link.exists():
            # Leer el vínculo existente para dar info útil
            try:
                with open(nucleus_link, 'r', encoding='utf-8') as f:
                    existing = json.load(f)
                    existing_nucleus = existing.get('nucleusPath', 'unknown')
                raise ValueError(
                    f"Project already linked to a Nucleus at: {existing_nucleus}"
                )
            except json.JSONDecodeError:
                raise ValueError(
                    f"Project has a malformed nucleus.json file"
                )
    
    def _calculate_relative_path(self) -> str:
        """
        Calcula path relativo del proyecto respecto al Nucleus.
        
        Si no están en el mismo árbol de directorios, usa path absoluto.
        
        Returns:
            Path relativo (string con forward slashes) o absoluto
        """
        try:
            rel_path = self.project_path.relative_to(self.nucleus_path)
            # Normalizar a forward slashes para consistencia
            return str(rel_path).replace('\\', '/')
        except ValueError:
            # No están en mismo árbol - usar path absoluto
            return str(self.project_path).replace('\\', '/')
    
    def _detect_git_remote(self) -> Optional[str]:
        """
        Detecta URL del remote git origin si existe.
        
        Returns:
            URL del remote origin o None si no existe/hay error
        """
        try:
            result = subprocess.run(
                ["git", "remote", "get-url", "origin"],
                cwd=str(self.project_path),
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                return result.stdout.strip()
        except (subprocess.TimeoutExpired, FileNotFoundError, Exception):
            pass
        return None
    
    def _to_display_name(self, name: str) -> str:
        """
        Convierte nombre técnico a display name legible.
        
        Ejemplos:
            my-app -> My App
            android_project -> Android Project
            MyApp -> MyApp (ya es Title Case)
        
        Args:
            name: Nombre técnico del proyecto
            
        Returns:
            Display name formateado
        """
        # Reemplazar guiones y underscores con espacios
        display = name.replace('-', ' ').replace('_', ' ')
        # Title case
        display = display.title()
        return display
    
    def _update_nucleus_config(self, linked_project: LinkedProject):
        """
        Actualiza nucleus-config.json agregando el proyecto.
        
        Args:
            linked_project: Proyecto a agregar
            
        Raises:
            IOError: Si no se puede leer/escribir el archivo
        """
        config_path = self.core_dir / "nucleus-config.json"
        
        # Leer config existente
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        # Agregar proyecto a la lista
        if "linkedProjects" not in config:
            config["linkedProjects"] = []
        
        config["linkedProjects"].append(linked_project.to_dict())
        
        # Escribir config actualizado
        with open(config_path, 'w', encoding='utf-8') as f:
            json.dump(config, f, indent=2, ensure_ascii=False)
            f.write('\n')  # Final newline
    
    def _create_nucleus_link(self, linked_project: LinkedProject):
        """
        Crea nucleus.json en el proyecto hijo.
        
        Este archivo marca que el proyecto está vinculado a un Nucleus
        y contiene referencia de vuelta.
        
        Args:
            linked_project: Proyecto vinculado
        """
        bloom_dir = self.project_path / ".bloom"
        bloom_dir.mkdir(exist_ok=True)
        
        nucleus_link = bloom_dir / "nucleus.json"
        
        # Calcular path relativo del Nucleus desde el proyecto
        try:
            rel_nucleus_path = self.nucleus_path.relative_to(self.project_path)
            nucleus_path_str = str(rel_nucleus_path).replace('\\', '/')
        except ValueError:
            # Path absoluto si no están relacionados
            nucleus_path_str = str(self.nucleus_path).replace('\\', '/')
        
        link_data = {
            "nucleusPath": nucleus_path_str,
            "projectId": linked_project.id,
            "projectName": linked_project.name,
            "linkedAt": linked_project.linked_at
        }
        
        with open(nucleus_link, 'w', encoding='utf-8') as f:
            json.dump(link_data, f, indent=2, ensure_ascii=False)
            f.write('\n')
    
    def _create_overview_file(self, linked_project: LinkedProject):
        """
        Genera overview.bl con información del proyecto.
        
        Args:
            linked_project: Proyecto vinculado
        """
        projects_dir = self.brain_dir / "projects" / linked_project.name
        projects_dir.mkdir(parents=True, exist_ok=True)
        
        overview_path = projects_dir / "overview.bl"
        
        # Template del overview
        overview_content = f"""# {linked_project.display_name}

**Tipo:** {linked_project.strategy}  
**Path:** `{linked_project.local_path}`  
**Estado:** {linked_project.status}

"""
        
        if linked_project.description:
            overview_content += f"{linked_project.description}\n\n"
        
        if linked_project.repo_url:
            overview_content += f"**Repositorio:** {linked_project.repo_url}\n\n"
        
        overview_content += f"""---

*Proyecto vinculado el {datetime.fromisoformat(linked_project.linked_at).strftime('%Y-%m-%d %H:%M:%S')}*
"""
        
        with open(overview_path, 'w', encoding='utf-8') as f:
            f.write(overview_content)
    
    def _regenerate_index(self):
        """
        Regenera _index.bl con el árbol actualizado de proyectos.
        
        Lee todos los proyectos del nucleus-config.json y genera
        un índice con la estructura de proyectos.
        """
        index_path = self.brain_dir / "_index.bl"
        
        # Leer config para obtener lista de proyectos
        config_path = self.core_dir / "nucleus-config.json"
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        projects = config.get("linkedProjects", [])
        
        # Generar contenido del índice
        index_content = """# Brain - Índice de Proyectos

Este Nucleus gestiona los siguientes proyectos:

"""
        
        if not projects:
            index_content += "*No hay proyectos vinculados aún.*\n"
        else:
            index_content += "## Proyectos Vinculados\n\n"
            
            # Agrupar por estrategia
            by_strategy: Dict[str, List[Dict]] = {}
            for proj in projects:
                strategy = proj.get("strategy", "generic")
                if strategy not in by_strategy:
                    by_strategy[strategy] = []
                by_strategy[strategy].append(proj)
            
            # Renderizar por estrategia
            for strategy in sorted(by_strategy.keys()):
                strategy_projects = by_strategy[strategy]
                strategy_title = strategy.title()
                
                index_content += f"### {strategy_title}\n\n"
                
                for proj in sorted(strategy_projects, key=lambda x: x.get("name", "")):
                    name = proj.get("displayName", proj.get("name", "Unknown"))
                    path = proj.get("localPath", "")
                    status = proj.get("status", "active")
                    
                    status_emoji = "✅" if status == "active" else "📦"
                    
                    index_content += f"- {status_emoji} **{name}** (`{path}`)\n"
                
                index_content += "\n"
        
        index_content += f"""---

*Última actualización: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}*
"""
        
        # Escribir índice
        with open(index_path, 'w', encoding='utf-8') as f:
            f.write(index_content)


__all__ = ['ProjectLinker']
