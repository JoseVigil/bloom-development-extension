import json
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any
from uuid import uuid4

class NucleusGenerator:
    """
    Generador de la estructura .bloom para proyectos Nucleus (Organizacionales).
    Port directo de 'generate_nucleus.py'.
    """

    def __init__(self, root_path: Path):
        self.root = root_path.resolve()

    def generate(self, org_name: str, org_url: str, output_path: Path):
        """
        Orquesta la creación de la estructura Nucleus.
        """
        print(f"🚀 Generando estructura Nucleus para: {org_name}")
        
        # 1. Crear estructura de carpetas
        bloom_dir = output_path
        bloom_dir.mkdir(parents=True, exist_ok=True)
        
        core_dir = bloom_dir / 'core'
        organization_dir = bloom_dir / 'organization'
        projects_dir = bloom_dir / 'projects'
        intents_dir = bloom_dir / 'intents'
        
        for d in [core_dir, organization_dir, projects_dir, intents_dir]:
            d.mkdir(exist_ok=True)
            
        print("✅ Carpetas creadas.")

        # 2. Detectar proyectos hermanos (sibling projects)
        # Asume que el proyecto nucleus está al mismo nivel que los proyectos técnicos
        projects = self._detect_sibling_projects(self.root)
        print(f"🔍 Proyectos detectados: {len(projects)}")

        # 3. Generar Configuración y Archivos Core
        nucleus_name = f"nucleus-{org_name.lower().replace(' ', '-')}"
        nucleus_config = self._create_nucleus_config(org_name, org_url, nucleus_name, projects)
        
        (core_dir / 'nucleus-config.json').write_text(
            json.dumps(nucleus_config, indent=2, ensure_ascii=False), encoding='utf-8'
        )
        (core_dir / '.rules.bl').write_text(self._get_nucleus_rules_bl(), encoding='utf-8')
        (core_dir / '.prompt.bl').write_text(self._get_nucleus_prompt_bl(), encoding='utf-8')

        # 4. Generar Archivos de Organización
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        org_files = {
            '.organization.bl': self._get_organization_bl(org_name, org_url, timestamp),
            'about.bl': self._get_about_bl(org_name),
            'business-model.bl': self._get_business_model_bl(org_name),
            'policies.bl': self._get_policies_bl(org_name),
            'protocols.bl': self._get_protocols_bl(org_name)
        }
        
        for fname, content in org_files.items():
            (organization_dir / fname).write_text(content, encoding='utf-8')

        # 5. Generar Índice de Proyectos
        (projects_dir / '_index.bl').write_text(
            self._get_projects_index_bl(org_name, nucleus_config['projects']),
            encoding='utf-8'
        )

        # 6. Generar Overviews de Proyectos
        for proj in nucleus_config['projects']:
            proj_dir = projects_dir / proj['name']
            proj_dir.mkdir(exist_ok=True)
            (proj_dir / 'overview.bl').write_text(
                self._get_project_overview_bl(proj), encoding='utf-8'
            )

        return len(nucleus_config['projects'])

    # --- LÓGICA DE DETECCIÓN ---

    def _detect_sibling_projects(self, project_root: Path) -> List[Dict[str, Any]]:
        """Detecta carpetas hermanas que parecen proyectos."""
        projects = []
        parent_dir = project_root.parent
        
        if not parent_dir.exists():
            return projects
        
        try:
            for item in parent_dir.iterdir():
                if not item.is_dir(): continue
                if item.name.startswith('.'): continue
                if item == project_root: continue # No incluirse a sí mismo
                if item.name.startswith('nucleus-'): continue # No incluir otros nucleus
                
                strategy = self._detect_project_strategy(item)
                if strategy != 'skip':
                    projects.append({
                        'name': item.name,
                        'path': str(item),
                        'strategy': strategy
                    })
        except Exception:
            pass # Ignorar errores de permiso, etc.
        
        return projects

    def _detect_project_strategy(self, project_path: Path) -> str:
        # Lógica simplificada de detección
        if (project_path / 'app' / 'build.gradle').exists(): return 'android'
        if list(project_path.glob('*.xcodeproj')): return 'ios'
        if (project_path / 'package.json').exists(): return 'node' # Podría refinarse a 'react-web'
        if (project_path / 'requirements.txt').exists(): return 'python'
        
        ignore_names = ['node_modules', 'vendor', 'build', 'dist', '.git', '__pycache__']
        if project_path.name in ignore_names: return 'skip'
        
        return 'generic'

    def _create_nucleus_config(self, org_name, org_url, nucleus_name, projects):
        now = datetime.now().isoformat() + 'Z'
        config = {
            "type": "nucleus",
            "version": "1.0.0",
            "id": str(uuid4()),
            "organization": {
                "name": org_name, "url": org_url
            },
            "nucleus": {
                "name": nucleus_name, "createdAt": now
            },
            "projects": [],
            "settings": {"autoIndexProjects": True}
        }
        for proj in projects:
            config["projects"].append({
                "id": str(uuid4()),
                "name": proj['name'],
                "strategy": proj['strategy'],
                "localPath": f"../{proj['name']}",
                "status": "active",
                "linkedAt": now
            })
        return config

    # --- TEMPLATES (Copiados del script original) ---

    def _get_nucleus_rules_bl(self) -> str:
        return """# BLOOM NUCLEUS RULES
## META-INSTRUCCIONES
1. Lee TODOS los archivos .bl del nucleus antes de responder.
2. Prioridad: organization/ > projects/ > intents/
... (Resto del template original) ...
"""

    def _get_nucleus_prompt_bl(self) -> str:
        return """# BLOOM NUCLEUS PROMPT
## Orden de Lectura
1. Organization (.bloom/organization/)
2. Projects Index (.bloom/projects/_index.bl)
... (Resto del template original) ...
"""

    def _get_organization_bl(self, org_name, org_url, timestamp) -> str:
        return f"""# {org_name} - Centro de Conocimiento
## 🎯 Visión
[Descripción de la visión...]
**Nombre:** {org_name}
**GitHub:** {org_url}
---
bloom/v1
generated_at: "{timestamp}"
"""

    def _get_about_bl(self, org_name) -> str:
        return f"# About {org_name}\n## ¿Quiénes Somos?\n[Descripción...]"

    def _get_business_model_bl(self, org_name) -> str:
        return f"# Modelo de Negocio - {org_name}\n## Propuesta de Valor\n..."

    def _get_policies_bl(self, org_name) -> str:
        return f"# Políticas de Desarrollo - {org_name}\n## Política de Código\n..."

    def _get_protocols_bl(self, org_name) -> str:
        return f"# Protocolos Operativos - {org_name}\n## Protocolo de Deployment\n..."

    def _get_projects_index_bl(self, org_name, projects) -> str:
        tree_lines = [f"{org_name}/"]
        for i, proj in enumerate(projects):
            prefix = "└──" if i == len(projects) - 1 else "├──"
            tree_lines.append(f"{prefix} 📦 {proj['name']} [{proj['strategy']}]")
        
        return f"""# Índice de Proyectos - {org_name}

## Árbol de Proyectos

## Tabla de Proyectos
{chr(10).join(table_lines)}

---
bloom/v1
document_type: "projects_index"
"""

    def _get_project_overview_bl(self, project) -> str:
        return f"""# {project['name']} - Overview

**Estrategia:** {project['strategy']}
**Path Local:** {project['localPath']}

## 🎯 Propósito
[¿Por qué existe este proyecto?]

## 🔗 Dependencias
[Completar dependencias]
"""
