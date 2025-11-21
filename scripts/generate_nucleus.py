#!/usr/bin/env python3
"""
Bloom Nucleus Generator
Genera la estructura .bloom completa para un proyecto Nucleus (organizacional).
Uso: python generate_nucleus.py --org="Organization Name" --url="https://github.com/org" [--root=.] [--output=.bloom]
"""

import argparse
import json
import re
import sys
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional
from uuid import uuid4


# =============================================================================
# TEMPLATES
# =============================================================================

def get_nucleus_rules_bl() -> str:
    """Reglas específicas para Nucleus."""
    return """# BLOOM NUCLEUS RULES

## META-INSTRUCCIONES
1. Lee TODOS los archivos .bl del nucleus antes de responder
2. Prioridad: organization/ > projects/ > intents/
3. Contexto: Documentación organizacional, NO código técnico

## PROPÓSITO DEL NUCLEUS
Este proyecto es el CENTRO DE CONOCIMIENTO de la organización.
Contiene:
- Storytelling de cada proyecto
- Modelo de negocio
- Políticas y protocolos
- Índice de proyectos técnicos

## FORMATO DE RESPUESTA PARA ANÁLISIS

### 🎯 CONSULTA
[Reformula la pregunta del usuario]

### 📊 PROYECTOS INVOLUCRADOS
[Lista de proyectos relevantes]

### 🔍 ANÁLISIS
[Análisis basado en documentación]

### 💡 RECOMENDACIONES
[Sugerencias basadas en políticas]

### 🔗 REFERENCIAS
[Links a documentos específicos]

## PROHIBICIONES
❌ NO generes código técnico desde el nucleus
❌ NO modifiques archivos de proyectos hijo
❌ NO asumas información no documentada

✅ SÍ referencia documentos existentes
✅ SÍ sugiere consultar proyectos específicos
✅ SÍ mantén coherencia con políticas
"""


def get_nucleus_prompt_bl() -> str:
    """Prompt de lectura para Nucleus."""
    return """# BLOOM NUCLEUS PROMPT

## Orden de Lectura

### 1. Organization (.bloom/organization/)
- .organization.bl - Visión general
- about.bl - Qué es la organización
- business-model.bl - Cómo genera valor
- policies.bl - Reglas de desarrollo
- protocols.bl - Procedimientos operativos

### 2. Projects Index (.bloom/projects/_index.bl)
- Árbol completo de proyectos
- Relaciones entre proyectos
- Estado de cada uno

### 3. Project Overviews (.bloom/projects/{name}/overview.bl)
Para consultas específicas de un proyecto.

## Tipos de Consultas Soportadas

### Consulta de Contexto Global
"¿Qué proyectos tiene la organización?"
→ Lee _index.bl

### Consulta de Proyecto Específico
"¿Para qué sirve [proyecto]?"
→ Lee projects/[proyecto]/overview.bl

### Consulta de Políticas
"¿Cuál es el protocolo de deployment?"
→ Lee organization/protocols.bl

---
bloom/v1
prompt_type: "nucleus_reading"
version: "1.0"
"""


def get_organization_bl(org_name: str, org_url: str, timestamp: str) -> str:
    """Archivo cabecera de organización."""
    return f"""# {org_name} - Centro de Conocimiento

## 🎯 Visión

[Descripción de la visión de la organización en 2-3 párrafos.
¿Qué problema resuelve? ¿Para quién? ¿Cuál es el impacto esperado?]


## 🏢 Sobre Nosotros

**Nombre:** {org_name}
**GitHub:** {org_url}
**Fundación:** [Fecha]
**Ubicación:** [Ciudad, País]


## 🌳 Ecosistema de Proyectos

| Proyecto | Tipo | Estado | Descripción |
|----------|------|--------|-------------|
| [nombre] | [mobile/backend/web] | [active/development] | [descripción] |


## 📖 Cómo Usar Este Nucleus

### Para Nuevos Miembros
1. Lee `organization/about.bl` para entender la empresa
2. Revisa `organization/policies.bl` para conocer las reglas
3. Explora `projects/_index.bl` para ver el ecosistema

### Para AI/Modelos
1. Procesa este archivo como contexto base
2. Usa `projects/_index.bl` para entender relaciones
3. Consulta overviews específicos según la consulta


---
bloom/v1
document_type: "organization_header"
version: "1.0"
generated_at: "{timestamp}"
"""


def get_about_bl(org_name: str) -> str:
    """Template de about.bl."""
    return f"""# About {org_name}

## ¿Quiénes Somos?

[Descripción detallada de la organización. Historia, origen, motivación.]


## Misión

[Declaración de misión en 1-2 oraciones]


## Valores

- **[Valor 1]:** [Descripción]
- **[Valor 2]:** [Descripción]
- **[Valor 3]:** [Descripción]


## Equipo

### Roles Principales
- **[Rol]:** [Responsabilidades]


## Stack Tecnológico General

| Área | Tecnologías |
|------|-------------|
| Mobile | [Android/iOS/Flutter] |
| Backend | [Node/Python/Go] |
| Frontend | [React/Vue/Angular] |
| Infraestructura | [AWS/GCP/Azure] |


---
bloom/v1
document_type: "about"
"""


def get_business_model_bl(org_name: str) -> str:
    """Template de business-model.bl."""
    return f"""# Modelo de Negocio - {org_name}

## Propuesta de Valor

[¿Qué valor único ofrece la organización?]


## Segmentos de Cliente

### Segmento 1: [Nombre]
- **Perfil:** [Descripción del cliente]
- **Necesidades:** [Qué buscan]
- **Cómo los servimos:** [Solución]


## Flujo de Valor

```
[Usuario] → [Proyecto A] → [Proyecto B] → [Resultado]
```


## Modelo de Ingresos

[Cómo genera dinero la organización]


## Métricas Clave

- **[Métrica 1]:** [Descripción y objetivo]


---
bloom/v1
document_type: "business_model"
"""


def get_policies_bl(org_name: str) -> str:
    """Template de policies.bl."""
    return f"""# Políticas de Desarrollo - {org_name}

## Política de Código

### Estándares Generales
- Todo código debe pasar linting antes de commit
- Coverage mínimo de tests: [X]%
- Documentación obligatoria para APIs públicas

### Git Flow
- **main:** Producción estable
- **develop:** Integración continua
- **feature/xxx:** Nuevas funcionalidades
- **hotfix/xxx:** Correcciones urgentes


## Política de Seguridad

- No commitear secrets/API keys
- Usar variables de entorno
- Revisar dependencias vulnerables mensualmente


## Política de Documentación

- Todo proyecto debe tener README.md actualizado
- APIs deben tener documentación OpenAPI/Swagger


---
bloom/v1
document_type: "policies"
"""


def get_protocols_bl(org_name: str) -> str:
    """Template de protocols.bl."""
    return f"""# Protocolos Operativos - {org_name}

## Protocolo de Deployment

### Pre-requisitos
1. [ ] Tests pasando en CI
2. [ ] Code review aprobado
3. [ ] Documentación actualizada

### Pasos
1. Merge a develop
2. QA en ambiente staging
3. Aprobación de QA
4. Merge a main
5. Deploy automático


## Protocolo de Incidentes

### Severidad Alta (P1)
- Tiempo de respuesta: < 15 minutos
- Notificar a: [Lista de contactos]


## Protocolo de Onboarding

### Día 1
1. Acceso a repositorios
2. Lectura de este nucleus
3. Setup de ambiente local


---
bloom/v1
document_type: "protocols"
"""


def get_projects_index_bl(org_name: str, projects: List[Dict[str, Any]]) -> str:
    """Genera el índice de proyectos."""
    
    # Generar árbol
    tree_lines = [f"{org_name}/", f"├── 🏢 nucleus-{org_name.lower().replace(' ', '-')}  [Nucleus]"]
    
    icons = {
        'android': '📱', 'ios': '🍎', 'react-web': '🌐',
        'node': '⚙️', 'python-flask': '🐍', 'php-laravel': '🐘',
        'generic': '📦', 'unknown': '❓'
    }
    
    for i, proj in enumerate(projects):
        is_last = (i == len(projects) - 1)
        prefix = "└──" if is_last else "├──"
        icon = icons.get(proj.get('strategy', 'generic'), '📦')
        tree_lines.append(f"{prefix} {icon} {proj['name']}  [{proj.get('strategy', 'unknown')}]")
    
    tree_str = "\n".join(tree_lines)
    
    # Generar tabla
    if projects:
        table_lines = ["| Proyecto | Estrategia | Estado | Path |",
                       "|----------|------------|--------|------|"]
        for proj in projects:
            table_lines.append(f"| {proj['name']} | {proj.get('strategy', 'unknown')} | active | ../{proj['name']} |")
        table_str = "\n".join(table_lines)
    else:
        table_str = "| Proyecto | Estrategia | Estado | Path |\n|----------|------------|--------|------|\n| [Ninguno] | - | - | - |"
    
    return f"""# Índice de Proyectos - {org_name}

## Árbol de Proyectos

```
{tree_str}
```


## Proyectos Vinculados

{table_str}


## Relaciones Entre Proyectos

[Completar manualmente las relaciones]

```
[Proyecto A] ──────► [Proyecto B] ──────► [Proyecto C]
```


## Proyectos Planificados

- [ ] [Proyecto futuro 1]
- [ ] [Proyecto futuro 2]


---
bloom/v1
document_type: "projects_index"
auto_generated: true
"""


def get_project_overview_bl(project: Dict[str, Any]) -> str:
    """Template de overview para un proyecto."""
    name = project.get('name', '[PROJECT_NAME]')
    display_name = project.get('displayName', name.replace('-', ' ').title())
    strategy = project.get('strategy', 'unknown')
    local_path = project.get('localPath', f'../{name}')
    project_id = project.get('id', str(uuid4()))
    linked_at = project.get('linkedAt', datetime.now().isoformat())
    
    return f"""# {display_name} - Overview

## Información General

**Nombre:** {name}
**Estrategia:** {strategy}
**Path Local:** {local_path}
**Estado:** active


## 🎯 Propósito

[¿Por qué existe este proyecto? ¿Qué problema resuelve?]


## 👥 Usuarios

[¿Quién usa este proyecto?]


## 💼 Lógica de Negocio

[¿Cómo contribuye al modelo de negocio?]


## 🔗 Dependencias

### Depende de:
- [Completar]

### Es usado por:
- [Completar]


## 🔑 Conceptos Clave

- **[Término 1]:** [Definición]


---
bloom/v1
document_type: "project_overview"
project_id: "{project_id}"
linked_at: "{linked_at}"
"""


# =============================================================================
# NUCLEUS CONFIG GENERATOR
# =============================================================================

def create_nucleus_config(
    org_name: str,
    org_url: str,
    nucleus_name: str,
    projects: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """Crea el objeto nucleus-config.json."""
    now = datetime.now().isoformat() + 'Z'
    
    config = {
        "type": "nucleus",
        "version": "1.0.0",
        "id": str(uuid4()),
        "organization": {
            "name": org_name,
            "displayName": org_name,
            "url": org_url,
            "description": ""
        },
        "nucleus": {
            "name": nucleus_name,
            "repoUrl": "",
            "createdAt": now,
            "updatedAt": now
        },
        "projects": [],
        "settings": {
            "autoIndexProjects": True,
            "generateWebDocs": False
        }
    }
    
    # Agregar proyectos detectados
    for proj in projects:
        config["projects"].append({
            "id": str(uuid4()),
            "name": proj['name'],
            "displayName": proj['name'].replace('-', ' ').title(),
            "description": "",
            "strategy": proj.get('strategy', 'generic'),
            "repoUrl": "",
            "localPath": f"../{proj['name']}",
            "status": "active",
            "linkedAt": now
        })
    
    return config


# =============================================================================
# PROJECT DETECTOR
# =============================================================================

def detect_sibling_projects(project_root: Path) -> List[Dict[str, Any]]:
    """Detecta proyectos hermanos que podrían vincularse."""
    projects = []
    parent_dir = project_root.parent
    
    if not parent_dir.exists():
        return projects
    
    try:
        for item in parent_dir.iterdir():
            if not item.is_dir():
                continue
            if item.name.startswith('.'):
                continue
            if item == project_root:
                continue
            if item.name.startswith('nucleus-'):
                continue
            
            strategy = detect_project_strategy(item)
            if strategy != 'skip':
                projects.append({
                    'name': item.name,
                    'path': str(item),
                    'strategy': strategy
                })
    except Exception as e:
        print(f"⚠️  Error detectando proyectos: {e}")
    
    return projects


def detect_project_strategy(project_path: Path) -> str:
    """Detecta la estrategia de un proyecto."""
    
    # Android
    if (project_path / 'app' / 'build.gradle').exists():
        return 'android'
    if (project_path / 'app' / 'build.gradle.kts').exists():
        return 'android'
    
    # iOS
    if any(project_path.glob('*.xcodeproj')):
        return 'ios'
    if any(project_path.glob('*.xcworkspace')):
        return 'ios'
    
    # Node.js / React
    package_json = project_path / 'package.json'
    if package_json.exists():
        try:
            import json
            content = json.loads(package_json.read_text())
            deps = content.get('dependencies', {})
            
            if 'react' in deps or 'react-dom' in deps:
                return 'react-web'
            if 'express' in deps or 'fastify' in deps or 'koa' in deps:
                return 'node'
            
            return 'node'
        except:
            return 'node'
    
    # Python
    if (project_path / 'requirements.txt').exists():
        try:
            content = (project_path / 'requirements.txt').read_text()
            if 'flask' in content.lower():
                return 'python-flask'
            return 'python'
        except:
            return 'python'
    
    # PHP Laravel
    if (project_path / 'artisan').exists():
        return 'php-laravel'
    
    # Carpetas a ignorar
    ignore_names = ['node_modules', 'vendor', 'build', 'dist', '.git', '__pycache__']
    if project_path.name in ignore_names:
        return 'skip'
    
    return 'generic'


# =============================================================================
# MAIN GENERATOR
# =============================================================================

def create_nucleus_structure(
    project_root: Path,
    output_path: Path,
    org_name: str,
    org_url: str
) -> None:
    """Crea la estructura completa del Nucleus."""
    
    print(f"🚀 Generando estructura Nucleus")
    print(f"📍 Root: {project_root}")
    print(f"📂 Output: {output_path}")
    print(f"🏢 Organization: {org_name}")
    print(f"🔗 URL: {org_url}")
    print()
    
    # Crear estructura de carpetas
    bloom_dir = output_path
    bloom_dir.mkdir(parents=True, exist_ok=True)
    
    core_dir = bloom_dir / 'core'
    organization_dir = bloom_dir / 'organization'
    projects_dir = bloom_dir / 'projects'
    intents_dir = bloom_dir / 'intents'
    
    core_dir.mkdir(exist_ok=True)
    organization_dir.mkdir(exist_ok=True)
    projects_dir.mkdir(exist_ok=True)
    intents_dir.mkdir(exist_ok=True)
    
    print("✅ Estructura de carpetas creada")
    
    # Detectar proyectos hermanos
    print("🔍 Detectando proyectos hermanos...")
    projects = detect_sibling_projects(project_root)
    print(f"   Encontrados: {len(projects)} proyectos")
    
    # Generar nucleus name
    nucleus_name = f"nucleus-{org_name.lower().replace(' ', '-')}"
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Generar nucleus-config.json
    print("📝 Generando core/nucleus-config.json...")
    nucleus_config = create_nucleus_config(org_name, org_url, nucleus_name, projects)
    (core_dir / 'nucleus-config.json').write_text(
        json.dumps(nucleus_config, indent=2, ensure_ascii=False),
        encoding='utf-8'
    )
    
    # Generar .rules.bl
    print("📝 Generando core/.rules.bl...")
    (core_dir / '.rules.bl').write_text(get_nucleus_rules_bl(), encoding='utf-8')
    
    # Generar .prompt.bl
    print("📝 Generando core/.prompt.bl...")
    (core_dir / '.prompt.bl').write_text(get_nucleus_prompt_bl(), encoding='utf-8')
    
    # Generar organization files
    print("📝 Generando organization/.organization.bl...")
    (organization_dir / '.organization.bl').write_text(
        get_organization_bl(org_name, org_url, timestamp), encoding='utf-8'
    )
    
    print("📝 Generando organization/about.bl...")
    (organization_dir / 'about.bl').write_text(get_about_bl(org_name), encoding='utf-8')
    
    print("📝 Generando organization/business-model.bl...")
    (organization_dir / 'business-model.bl').write_text(
        get_business_model_bl(org_name), encoding='utf-8'
    )
    
    print("📝 Generando organization/policies.bl...")
    (organization_dir / 'policies.bl').write_text(get_policies_bl(org_name), encoding='utf-8')
    
    print("📝 Generando organization/protocols.bl...")
    (organization_dir / 'protocols.bl').write_text(get_protocols_bl(org_name), encoding='utf-8')
    
    # Generar projects/_index.bl
    print("📝 Generando projects/_index.bl...")
    (projects_dir / '_index.bl').write_text(
        get_projects_index_bl(org_name, nucleus_config['projects']),
        encoding='utf-8'
    )
    
    # Crear overview para cada proyecto detectado
    for proj in nucleus_config['projects']:
        proj_dir = projects_dir / proj['name']
        proj_dir.mkdir(exist_ok=True)
        
        print(f"📝 Generando projects/{proj['name']}/overview.bl...")
        (proj_dir / 'overview.bl').write_text(
            get_project_overview_bl(proj), encoding='utf-8'
        )
    
    # Resumen final
    print()
    print("=" * 60)
    print("✅ Nucleus generado exitosamente!")
    print("=" * 60)
    print()
    print(f"📂 Ubicación: {bloom_dir.absolute()}")
    print()
    print("Archivos generados:")
    print("  ✓ core/nucleus-config.json")
    print("  ✓ core/.rules.bl")
    print("  ✓ core/.prompt.bl")
    print("  ✓ organization/.organization.bl")
    print("  ✓ organization/about.bl")
    print("  ✓ organization/business-model.bl")
    print("  ✓ organization/policies.bl")
    print("  ✓ organization/protocols.bl")
    print("  ✓ projects/_index.bl")
    for proj in nucleus_config['projects']:
        print(f"  ✓ projects/{proj['name']}/overview.bl")
    print()
    print(f"🔍 Proyectos vinculados: {len(nucleus_config['projects'])}")
    print()
    print("💡 Próximos pasos:")
    print("  1. Revisa y completa organization/.organization.bl")
    print("  2. Completa los overviews de cada proyecto")
    print("  3. Usa 'Append Project' para vincular más proyectos")
    print()


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(
        description='Genera estructura Bloom Nucleus',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  python generate_nucleus.py --org="Mi Empresa" --url="https://github.com/miempresa"
  python generate_nucleus.py --org="Bloom" --url="https://github.com/JoseVigil" --root=./nucleus-bloom
        """
    )
    
    parser.add_argument(
        '--org',
        required=True,
        help='Nombre de la organización (requerido)'
    )
    
    parser.add_argument(
        '--url',
        default='',
        help='URL de GitHub de la organización'
    )
    
    parser.add_argument(
        '--root',
        default='.',
        help='Root del proyecto Nucleus (default: directorio actual)'
    )
    
    parser.add_argument(
        '--output',
        default='.bloom',
        help='Carpeta de output (default: .bloom)'
    )
    
    args = parser.parse_args()
    
    # Resolver paths
    project_root = Path(args.root).resolve()
    
    if not Path(args.output).is_absolute():
        output_path = project_root / args.output
    else:
        output_path = Path(args.output)
    
    # Crear directorio root si no existe
    if not project_root.exists():
        project_root.mkdir(parents=True, exist_ok=True)
        print(f"📁 Directorio creado: {project_root}")
    
    # Ejecutar generación
    try:
        create_nucleus_structure(
            project_root,
            output_path,
            args.org,
            args.url
        )
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()