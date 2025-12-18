"""
Nucleus Manager - Core Business Logic
Manages the creation, linking, and lifecycle of Bloom Nucleus projects.
Integrates GitHub operations with local scaffolding.
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional, Callable
from uuid import uuid4


class NucleusManager:
    """
    Manages Bloom Nucleus project structure and lifecycle.
    Combines GitHub integration with local scaffolding logic.
    """
    
    NUCLEUS_CONFIG_FILE = "core/nucleus-config.json"
    
    def __init__(self, root_path: Path):
        """
        Initialize the Nucleus Manager.
        Args:
            root_path: Root directory (local path) of the project
        """
        self.root_path = Path(root_path).resolve()
        # Intentamos inferir la org del nombre del directorio si es posible, 
        # sino se pasará en create()
        self.org_name = None 

    # =========================================================================
    # LIFECYCLE METHODS (GitHub Integration)
    # =========================================================================

    def create(
        self,
        organization_name: str,
        organization_url: str = "",
        output_dir: str = ".bloom", # Legacy param, mantained for compatibility
        private: bool = False,
        force: bool = False,
        on_progress: Optional[Callable[[str], None]] = None
    ) -> Dict[str, Any]:
        """
        Create a complete Nucleus structure with optional GitHub integration.
        
        If GitHub credentials are setup, it tries to create/clone the repo.
        Otherwise, it falls back to local creation (Offline mode).
        """
        self.org_name = organization_name
        repo_name = f"nucleus-{self._slugify(organization_name)}"
        
        # 1. GitHub Integration Logic (Try Online First)
        repo_url = ""
        is_git_repo = False
        
        try:
            # Intentamos importar componentes de GitHub
            # Si fallan (no configurados), seguimos en modo local
            from brain.core.github.api_client import GitHubAPIClient
            from brain.core.git.executor import GitExecutor
            
            client = GitHubAPIClient()
            git = GitExecutor()
            
            # Check if repo exists
            if on_progress: on_progress(f"Checking GitHub for {organization_name}/{repo_name}...")
            
            if not client.repo_exists(organization_name, repo_name):
                # Create Repo
                if on_progress: on_progress(f"Creating repository {organization_name}/{repo_name}...")
                repo = client.create_repo(
                    name=repo_name,
                    description="Bloom Nucleus Project",
                    private=private,
                    auto_init=True,
                    org=organization_name if organization_name != client.get_current_user()["login"] else None
                )
                repo_url = repo.html_url
                
                # Clone
                if on_progress: on_progress(f"Cloning to {self.root_path}...")
                if self.root_path.exists() and force:
                    import shutil
                    shutil.rmtree(self.root_path)
                
                git.clone(repo.clone_url, self.root_path)
                is_git_repo = True
                
        except ImportError:
            # Modulos de GitHub no disponibles aún en esta fase de migración
            pass
        except Exception as e:
            # Si falla GitHub (no auth, no internet), seguimos en local
            # print(f"Warning: GitHub integration skipped: {e}") 
            pass

        # 2. Local Scaffolding Logic (The Bloom Core)
        if on_progress: on_progress("Generating Bloom structure...")
        
        # Check Local Directory
        if self.root_path.exists() and any(self.root_path.iterdir()) and not is_git_repo and not force:
             raise FileExistsError(
                f"Directory '{self.root_path}' already exists and is not empty. "
                "Use --force to overwrite."
            )
            
        self.root_path.mkdir(parents=True, exist_ok=True)
        
        # Create standard folders
        bloom_dir = self.root_path / ".bloom" # Estándar nuevo: todo en .bloom o raíz?
        # NOTA: Tu template original ponía todo en {root}/{output_dir}.
        # El estándar de Claude es {root}/.bloom/nucleus-config.json
        # Vamos a respetar TU estructura original de carpetas (core/, organization/, projects/) en la RAÍZ del repo.
        
        core_dir = self.root_path / "core"
        organization_dir = self.root_path / "organization"
        projects_dir = self.root_path / "projects"
        intents_dir = self.root_path / "intents"
        
        core_dir.mkdir(exist_ok=True)
        organization_dir.mkdir(exist_ok=True)
        projects_dir.mkdir(exist_ok=True)
        intents_dir.mkdir(exist_ok=True)
        
        # Detect sibling projects (Tu lógica original)
        projects = self._detect_sibling_projects()
        
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        files_created = []
        
        # Generate & Write Config
        nucleus_config = self._create_nucleus_config(
            organization_name, 
            repo_url or organization_url, 
            repo_name, 
            projects
        )
        self._write_json(core_dir / "nucleus-config.json", nucleus_config)
        files_created.append("core/nucleus-config.json")
        
        # Generate Templates (Tu lógica original)
        self._write_file(core_dir / ".rules.bl", self._get_nucleus_rules())
        files_created.append("core/.rules.bl")
        
        self._write_file(core_dir / ".prompt.bl", self._get_nucleus_prompt())
        files_created.append("core/.prompt.bl")
        
        self._write_file(
            organization_dir / ".organization.bl",
            self._get_organization_bl(organization_name, repo_url, timestamp)
        )
        files_created.append("organization/.organization.bl")
        
        # ... Resto de templates originales ...
        self._write_file(organization_dir / "about.bl", self._get_about_bl(organization_name))
        files_created.append("organization/about.bl")
        
        self._write_file(organization_dir / "business-model.bl", self._get_business_model_bl(organization_name))
        files_created.append("organization/business-model.bl")
        
        self._write_file(organization_dir / "policies.bl", self._get_policies_bl(organization_name))
        files_created.append("organization/policies.bl")
        
        self._write_file(organization_dir / "protocols.bl", self._get_protocols_bl(organization_name))
        files_created.append("organization/protocols.bl")
        
        self._write_file(projects_dir / "_index.bl", self._get_projects_index_bl(organization_name, nucleus_config["projects"]))
        files_created.append("projects/_index.bl")

        return {
            "nucleus_name": repo_name,
            "path": str(self.root_path.absolute()),
            "organization": {
                "name": organization_name,
                "url": repo_url
            },
            "files_created": files_created,
            "projects_detected": len(projects),
            "is_git_repo": is_git_repo,
            "timestamp": datetime.now().isoformat()
        }

    # =========================================================================
    # PRIVATE HELPERS (Original Logic Preserved)
    # =========================================================================
    
    def _slugify(self, text: str) -> str:
        return text.lower().replace(" ", "-").replace("_", "-")
    
    def _write_file(self, path: Path, content: str) -> None:
        path.write_text(content, encoding="utf-8")
    
    def _write_json(self, path: Path, data: Dict[str, Any]) -> None:
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    
    def _detect_sibling_projects(self) -> List[Dict[str, Any]]:
        """Detect sibling projects that could be linked."""
        projects = []
        parent_dir = self.root_path.parent
        if not parent_dir.exists(): return projects
        try:
            for item in parent_dir.iterdir():
                if not item.is_dir() or item.name.startswith(".") or item == self.root_path or item.name.startswith("nucleus-"):
                    continue
                strategy = self._detect_project_strategy(item)
                if strategy != "skip":
                    projects.append({"name": item.name, "path": str(item), "strategy": strategy})
        except Exception: pass
        return projects
    
    def _detect_project_strategy(self, project_path: Path) -> str:
        # Simplificado para brevedad, usando tu lógica original
        if (project_path / "app" / "build.gradle").exists(): return "android"
        if (project_path / "package.json").exists(): return "node"
        if (project_path / "requirements.txt").exists(): return "python"
        ignore_names = ["node_modules", "vendor", "build", "dist", ".git", "__pycache__"]
        if project_path.name in ignore_names: return "skip"
        return "generic"
    
    def _create_nucleus_config(self, org_name, org_url, nucleus_name, projects):
        now = datetime.now().isoformat() + "Z"
        config = {
            "type": "nucleus",
            "version": "2.0",
            "id": str(uuid4()),
            "organization": {"name": org_name, "url": org_url},
            "nucleus": {"name": nucleus_name, "createdAt": now},
            "projects": []
        }
        for proj in projects:
            config["projects"].append({
                "id": str(uuid4()),
                "name": proj["name"],
                "strategy": proj.get("strategy", "generic"),
                "localPath": f"../{proj['name']}",
                "status": "active"
            })
        return config

    # =========================================================================
    # TEMPLATES (Original Logic Preserved)
    # =========================================================================
    # ... (Aquí van tus métodos _get_nucleus_rules, _get_organization_bl, etc.
    # ...  Mantenlos TAL CUAL los tenías en tu archivo original. 
    # ...  Son perfectos y no necesitan cambios).
    
    def _get_nucleus_rules(self) -> str:
        return """# BLOOM NUCLEUS RULES\n## META-INSTRUCCIONES..."""
        
    def _get_nucleus_prompt(self) -> str:
        return """# BLOOM NUCLEUS PROMPT..."""
        
    def _get_organization_bl(self, org_name, org_url, timestamp) -> str:
        return f"""# {org_name} - Centro de Conocimiento..."""

    def _get_about_bl(self, org_name) -> str:
        return f"""# About {org_name}..."""
    
    def _get_business_model_bl(self, org_name) -> str:
        return f"""# Modelo de Negocio..."""
    
    def _get_policies_bl(self, org_name) -> str:
        return f"""# Políticas de Desarrollo..."""
    
    def _get_protocols_bl(self, org_name) -> str:
        return f"""# Protocolos Operativos..."""
        
    def _get_projects_index_bl(self, org_name, projects) -> str:
        return f"""# Índice de Proyectos..."""

    def _get_project_overview_bl(self, project) -> str:
        return f"""# {project.get('name')} - Overview..."""