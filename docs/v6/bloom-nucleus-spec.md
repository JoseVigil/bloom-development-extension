# Bloom Nucleus - Especificación Técnica Completa

## 📋 Resumen Ejecutivo

**Bloom Nucleus** es una extensión del sistema Bloom BTIP que introduce el concepto de "proyecto organizacional" - un repositorio central que documenta, indexa y vincula todos los proyectos técnicos de una organización.

### Diferencia Fundamental

| Aspecto | Proyecto BTIP (Hijo) | Proyecto Nucleus (Padre) |
|---------|---------------------|--------------------------|
| **Propósito** | Código técnico + intents de desarrollo | Documentación organizacional + índice de proyectos |
| **Audiencia** | AI para coding assistance | Humanos + AI para análisis global |
| **Contenido** | Código, codebase.md, intents técnicos | Storytelling, modelo de negocio, políticas |
| **Estrategia** | `android`, `ios`, `node`, etc. | `nucleus` |
| **Identificador** | `.bloom/project/` | `.bloom/core/nucleus-config.json` |

---

## 🏗️ Arquitectura de Directorios

### Posición Física (Nivel de Sistema de Archivos)

```
/projects/                              ← Directorio contenedor
├── nucleus-{organization}/             ← Proyecto Nucleus
│   ├── .bloom/
│   │   ├── core/
│   │   │   ├── nucleus-config.json     ← 🔑 Identificador de Nucleus
│   │   │   ├── .rules.bl
│   │   │   └── .prompt.bl
│   │   ├── organization/
│   │   │   ├── .organization.bl        ← Archivo cabecera
│   │   │   ├── about.bl
│   │   │   ├── business-model.bl
│   │   │   ├── policies.bl
│   │   │   └── protocols.bl
│   │   ├── projects/
│   │   │   ├── _index.bl               ← Árbol de proyectos
│   │   │   ├── bloom-video-server/
│   │   │   │   └── overview.bl
│   │   │   └── bloom-mobile/
│   │   │       └── overview.bl
│   │   └── intents/                    ← Cross-proyecto (futuro)
│   │       └── [vacío]
│   └── README.md
│
├── bloom-video-server/                 ← Proyecto Hijo (BTIP)
│   ├── .bloom/
│   │   ├── core/
│   │   │   ├── .rules.bl
│   │   │   ├── .standards.bl
│   │   │   └── .prompt.bl
│   │   ├── project/
│   │   │   ├── .context.bl
│   │   │   └── .app-context.bl
│   │   ├── intents/
│   │   │   └── intent.bl
│   │   └── nucleus.json                ← 🔗 Link al padre
│   └── [código fuente...]
│
└── bloom-mobile/                       ← Proyecto Hijo (BTIP)
    ├── .bloom/
    │   └── nucleus.json                ← 🔗 Link al padre
    └── [código fuente...]
```

### Convención de Naming

**Proyecto Nucleus:** `nucleus-{organization}`

Ejemplos:
- `nucleus-josevigil`
- `nucleus-bloom`
- `nucleus-acme-corp`

**Beneficios:**
- Prefijo `nucleus-` permite búsqueda/filtrado rápido
- Incluye identificador de organización
- Distintivo en cualquier listado de repositorios

---

## 📁 Estructura Detallada del Proyecto Nucleus

### `.bloom/core/nucleus-config.json`

```json
{
  "type": "nucleus",
  "version": "1.0.0",
  "id": "550e8400-e29b-41d4-a716-446655440000",
  
  "organization": {
    "name": "JoseVigil",
    "displayName": "Jose Vigil Development",
    "url": "https://github.com/JoseVigil",
    "description": "Ecosistema de desarrollo Bloom"
  },
  
  "nucleus": {
    "name": "nucleus-josevigil",
    "repoUrl": "https://github.com/JoseVigil/nucleus-josevigil.git",
    "createdAt": "2025-11-20T10:30:00Z",
    "updatedAt": "2025-11-20T14:45:00Z"
  },
  
  "projects": [
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "name": "bloom-video-server",
      "displayName": "Bloom Video Server",
      "description": "Servidor de procesamiento de video con FFmpeg",
      "strategy": "node",
      "repoUrl": "https://github.com/JoseVigil/bloom-video-server.git",
      "localPath": "../bloom-video-server",
      "status": "active",
      "linkedAt": "2025-11-20T10:35:00Z"
    },
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "name": "bloom-mobile",
      "displayName": "Bloom Mobile App",
      "description": "Aplicación móvil Android para captura de video",
      "strategy": "android",
      "repoUrl": "https://github.com/JoseVigil/bloom-mobile.git",
      "localPath": "../bloom-mobile",
      "status": "active",
      "linkedAt": "2025-11-20T10:40:00Z"
    }
  ],
  
  "settings": {
    "autoIndexProjects": true,
    "generateWebDocs": false
  }
}
```

### `.bloom/core/.rules.bl` (Nucleus)

```markdown
# BLOOM NUCLEUS RULES

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
[Lista de proyectos relevantes para la consulta]

### 🔍 ANÁLISIS
[Análisis basado en la documentación del nucleus]

### 💡 RECOMENDACIONES
[Sugerencias basadas en políticas y protocolos]

### 🔗 REFERENCIAS
[Links a documentos específicos dentro del nucleus]

## PROHIBICIONES
❌ NO generes código técnico desde el nucleus
❌ NO modifiques archivos de proyectos hijo
❌ NO asumas información no documentada

✅ SÍ referencia documentos existentes
✅ SÍ sugiere consultar proyectos específicos para detalles técnicos
✅ SÍ mantén coherencia con políticas organizacionales
```

### `.bloom/core/.prompt.bl` (Nucleus)

```markdown
# BLOOM NUCLEUS PROMPT

## Orden de Lectura

### 1. Organization (.bloom/organization/)
Lee primero el contexto organizacional:
- .organization.bl - Visión general
- about.bl - Qué es la organización
- business-model.bl - Cómo genera valor
- policies.bl - Reglas de desarrollo
- protocols.bl - Procedimientos operativos

### 2. Projects Index (.bloom/projects/_index.bl)
Entiende el ecosistema de proyectos:
- Árbol completo de proyectos
- Relaciones entre proyectos
- Estado de cada uno

### 3. Project Overviews (.bloom/projects/{name}/overview.bl)
Para consultas específicas, lee el overview del proyecto relevante.

## Tipos de Consultas Soportadas

### Consulta de Contexto Global
"¿Qué proyectos tiene la organización?"
→ Lee _index.bl y responde con el árbol

### Consulta de Proyecto Específico
"¿Para qué sirve bloom-video-server?"
→ Lee projects/bloom-video-server/overview.bl

### Consulta de Políticas
"¿Cuál es el protocolo de deployment?"
→ Lee organization/protocols.bl

### Consulta Cross-Proyecto
"¿Cómo se relaciona la app móvil con el servidor?"
→ Lee overviews de ambos proyectos y analiza

---
bloom/v1
prompt_type: "nucleus_reading"
version: "1.0"
```

### `.bloom/organization/.organization.bl`

```markdown
# {ORGANIZATION_NAME} - Centro de Conocimiento

## 🎯 Visión

[Descripción de la visión de la organización en 2-3 párrafos.
¿Qué problema resuelve? ¿Para quién? ¿Cuál es el impacto esperado?]


## 🏢 Sobre Nosotros

**Nombre:** {organization_name}
**Fundación:** [Fecha]
**Ubicación:** [Ciudad, País]
**Equipo:** [Tamaño del equipo]


## 🌳 Ecosistema de Proyectos

Este nucleus documenta y coordina los siguientes proyectos:

| Proyecto | Tipo | Estado | Descripción |
|----------|------|--------|-------------|
| [nombre] | [mobile/backend/web] | [active/development/archived] | [descripción corta] |


## 📖 Cómo Usar Este Nucleus

### Para Nuevos Miembros del Equipo
1. Lee `organization/about.bl` para entender la empresa
2. Revisa `organization/policies.bl` para conocer las reglas
3. Explora `projects/_index.bl` para ver el ecosistema
4. Consulta el overview del proyecto asignado

### Para AI/Modelos de Lenguaje
1. Procesa primero este archivo como contexto base
2. Usa `projects/_index.bl` para entender relaciones
3. Consulta overviews específicos según la consulta
4. Respeta las políticas en `organization/policies.bl`


## 🔗 Links Importantes

- **GitHub:** {organization_url}
- **Documentación:** [URL si existe]
- **Contacto:** [Email/Slack]


---
bloom/v1
document_type: "organization_header"
version: "1.0"
generated_at: "{timestamp}"
```

### `.bloom/organization/about.bl`

```markdown
# About {ORGANIZATION_NAME}

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
| Mobile | [Android/iOS/Flutter/etc] |
| Backend | [Node/Python/Go/etc] |
| Frontend | [React/Vue/Angular/etc] |
| Infraestructura | [AWS/GCP/Azure/etc] |


---
bloom/v1
document_type: "about"
```

### `.bloom/organization/business-model.bl`

```markdown
# Modelo de Negocio - {ORGANIZATION_NAME}

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
- **[Métrica 2]:** [Descripción y objetivo]


---
bloom/v1
document_type: "business_model"
```

### `.bloom/organization/policies.bl`

```markdown
# Políticas de Desarrollo - {ORGANIZATION_NAME}

## Política de Código

### Estándares Generales
- Todo código debe pasar linting antes de commit
- Coverage mínimo de tests: [X]%
- Documentación obligatoria para APIs públicas

### Convenciones de Naming
- **Variables:** camelCase
- **Clases:** PascalCase
- **Constantes:** UPPER_SNAKE_CASE
- **Archivos:** kebab-case

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
- Cambios significativos requieren entrada en CHANGELOG
- APIs deben tener documentación OpenAPI/Swagger


---
bloom/v1
document_type: "policies"
```

### `.bloom/organization/protocols.bl`

```markdown
# Protocolos Operativos - {ORGANIZATION_NAME}

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
- Canal: [Slack/Discord/etc]

### Severidad Media (P2)
- Tiempo de respuesta: < 2 horas
- Notificar a: [Lista]


## Protocolo de Onboarding

### Día 1
1. Acceso a repositorios
2. Lectura de este nucleus
3. Setup de ambiente local

### Semana 1
1. Familiarización con proyecto asignado
2. Primera tarea pequeña
3. Code review de senior


---
bloom/v1
document_type: "protocols"
```

### `.bloom/projects/_index.bl`

```markdown
# Índice de Proyectos - {ORGANIZATION_NAME}

## Árbol de Proyectos

```
{organization_name}/
├── 🏢 nucleus-{org}           [Este proyecto - Centro de conocimiento]
│
├── 📱 MOBILE
│   └── bloom-mobile           [Android - Captura de video]
│
├── ⚙️ BACKEND
│   ├── bloom-video-server     [Node.js - Procesamiento FFmpeg]
│   └── bloom-api              [Python - API REST]
│
├── 🌐 WEB
│   └── bloom-dashboard        [React - Panel de control]
│
└── 🔧 TOOLS
    ├── bloom-cli-macos        [CLI - Herramientas macOS]
    └── bloom-cli-linux        [CLI - Herramientas Linux]
```


## Proyectos Activos

| Proyecto | Estrategia | Estado | Última Actualización |
|----------|------------|--------|---------------------|
| bloom-mobile | android | ✅ Active | 2025-11-20 |
| bloom-video-server | node | ✅ Active | 2025-11-19 |


## Relaciones Entre Proyectos

```
bloom-mobile ──────► bloom-video-server ──────► bloom-api
   (captura)            (procesa)              (almacena)
        │                    │                      │
        └────────────────────┴──────────────────────┘
                    bloom-dashboard (monitorea)
```


## Proyectos Planificados

- [ ] bloom-ios - Versión iOS de la app móvil
- [ ] bloom-analytics - Sistema de analytics


---
bloom/v1
document_type: "projects_index"
auto_generated: true
```

### `.bloom/projects/{project-name}/overview.bl`

```markdown
# {PROJECT_NAME} - Overview

## Información General

**Nombre:** {project_name}
**Estrategia:** {strategy}
**Repositorio:** {repo_url}
**Estado:** {status}


## 🎯 Propósito

[¿Por qué existe este proyecto? ¿Qué problema resuelve?]


## 👥 Usuarios

[¿Quién usa este proyecto? ¿Qué roles interactúan con él?]


## 💼 Lógica de Negocio

[¿Cómo contribuye al modelo de negocio de la organización?]


## 🔗 Dependencias

### Depende de:
- [Proyecto X] - Para [funcionalidad]

### Es usado por:
- [Proyecto Y] - Para [funcionalidad]


## 📊 Estado Actual

- **Versión:** [X.X.X]
- **Última release:** [Fecha]
- **Issues abiertos:** [N]


## 🔑 Conceptos Clave

- **[Término 1]:** [Definición en contexto de este proyecto]


## 📁 Ubicación del Código

**Local:** {local_path}
**Remote:** {repo_url}


---
bloom/v1
document_type: "project_overview"
project_id: "{project_id}"
linked_at: "{linked_at}"
```

---

## 📁 Estructura del Proyecto Hijo (BTIP) con Link a Nucleus

### `.bloom/nucleus.json`

```json
{
  "linkedToNucleus": true,
  "nucleusId": "550e8400-e29b-41d4-a716-446655440000",
  "nucleusName": "nucleus-josevigil",
  "nucleusPath": "../nucleus-josevigil",
  "nucleusUrl": "https://github.com/JoseVigil/nucleus-josevigil.git",
  "organizationName": "JoseVigil",
  "projectId": "660e8400-e29b-41d4-a716-446655440001",
  "linkedAt": "2025-11-20T10:35:00Z"
}
```

---

## 🔧 Interfaces TypeScript

### Modelos de Datos

```typescript
// src/models/nucleus.ts

import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// TIPOS BASE
// ============================================================================

export type ProjectStrategy = 
  | 'android' 
  | 'ios' 
  | 'react-web' 
  | 'node' 
  | 'python-flask' 
  | 'php-laravel' 
  | 'nucleus'      // ← NUEVO
  | 'generic';

export type ProjectStatus = 'active' | 'development' | 'archived' | 'planned';

export type ProjectType = 'nucleus' | 'btip';

// ============================================================================
// NUCLEUS CONFIG
// ============================================================================

export interface NucleusOrganization {
  name: string;                    // "JoseVigil"
  displayName: string;             // "Jose Vigil Development"
  url: string;                     // "https://github.com/JoseVigil"
  description?: string;
}

export interface NucleusInfo {
  name: string;                    // "nucleus-josevigil"
  repoUrl: string;
  createdAt: string;               // ISO timestamp
  updatedAt: string;
}

export interface LinkedProject {
  id: string;                      // UUID
  name: string;                    // "bloom-video-server"
  displayName: string;             // "Bloom Video Server"
  description?: string;
  strategy: ProjectStrategy;
  repoUrl: string;
  localPath: string;               // "../bloom-video-server"
  status: ProjectStatus;
  linkedAt: string;                // ISO timestamp
}

export interface NucleusSettings {
  autoIndexProjects: boolean;
  generateWebDocs: boolean;
}

export interface NucleusConfig {
  type: 'nucleus';
  version: string;
  id: string;                      // UUID del nucleus
  organization: NucleusOrganization;
  nucleus: NucleusInfo;
  projects: LinkedProject[];
  settings: NucleusSettings;
}

// ============================================================================
// NUCLEUS LINK (en proyectos hijo)
// ============================================================================

export interface NucleusLink {
  linkedToNucleus: boolean;
  nucleusId: string;
  nucleusName: string;
  nucleusPath: string;             // Path relativo al nucleus
  nucleusUrl: string;
  organizationName: string;
  projectId: string;               // UUID de este proyecto en el registry
  linkedAt: string;
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

export function createNucleusConfig(
  organizationName: string,
  organizationUrl: string,
  nucleusRepoUrl: string
): NucleusConfig {
  const now = new Date().toISOString();
  const nucleusName = `nucleus-${organizationName.toLowerCase().replace(/\s+/g, '-')}`;
  
  return {
    type: 'nucleus',
    version: '1.0.0',
    id: uuidv4(),
    organization: {
      name: organizationName,
      displayName: organizationName,
      url: organizationUrl,
      description: ''
    },
    nucleus: {
      name: nucleusName,
      repoUrl: nucleusRepoUrl,
      createdAt: now,
      updatedAt: now
    },
    projects: [],
    settings: {
      autoIndexProjects: true,
      generateWebDocs: false
    }
  };
}

export function createLinkedProject(
  name: string,
  displayName: string,
  strategy: ProjectStrategy,
  repoUrl: string,
  localPath: string
): LinkedProject {
  return {
    id: uuidv4(),
    name,
    displayName,
    description: '',
    strategy,
    repoUrl,
    localPath,
    status: 'active',
    linkedAt: new Date().toISOString()
  };
}

export function createNucleusLink(
  nucleusConfig: NucleusConfig,
  projectId: string,
  nucleusPath: string
): NucleusLink {
  return {
    linkedToNucleus: true,
    nucleusId: nucleusConfig.id,
    nucleusName: nucleusConfig.nucleus.name,
    nucleusPath,
    nucleusUrl: nucleusConfig.nucleus.repoUrl,
    organizationName: nucleusConfig.organization.name,
    projectId,
    linkedAt: new Date().toISOString()
  };
}

// ============================================================================
// DETECTION HELPERS
// ============================================================================

export function detectProjectType(bloomPath: string): ProjectType | null {
  const fs = require('fs');
  const path = require('path');
  
  // Check for nucleus-config.json
  const nucleusConfigPath = path.join(bloomPath, 'core', 'nucleus-config.json');
  if (fs.existsSync(nucleusConfigPath)) {
    return 'nucleus';
  }
  
  // Check for project/ directory (BTIP indicator)
  const projectDir = path.join(bloomPath, 'project');
  if (fs.existsSync(projectDir)) {
    return 'btip';
  }
  
  // Check for nucleus.json (linked BTIP)
  const nucleusLinkPath = path.join(bloomPath, 'nucleus.json');
  if (fs.existsSync(nucleusLinkPath)) {
    return 'btip';
  }
  
  return null;
}

export function isNucleusProject(bloomPath: string): boolean {
  return detectProjectType(bloomPath) === 'nucleus';
}

export function isBTIPProject(bloomPath: string): boolean {
  return detectProjectType(bloomPath) === 'btip';
}

export function hasNucleusLink(bloomPath: string): boolean {
  const fs = require('fs');
  const path = require('path');
  const nucleusLinkPath = path.join(bloomPath, 'nucleus.json');
  return fs.existsSync(nucleusLinkPath);
}
```

---

## 🐍 Script Python: `generate_project_context.py` Modificado

### Nuevos Imports y Clase NucleusAnalyzer

```python
# Agregar al inicio de generate_project_context.py

# =============================================================================
# NUCLEUS ANALYZER
# =============================================================================

class NucleusAnalyzer(BaseAnalyzer):
    """Analizador para proyectos Nucleus (organizacionales)."""
    
    def analyze(self) -> Dict[str, Any]:
        print("🔍 Analizando proyecto Nucleus...")
        
        data = {
            'name': '[Nombre de la Organización]',
            'type': 'nucleus',
            'organization_url': '[URL de GitHub]',
            'description': 'Centro de conocimiento organizacional',
            'projects': [],
            'structure': ''
        }
        
        # Intentar detectar organización desde .git
        git_config = self.project_root / '.git' / 'config'
        if git_config.exists():
            data.update(self._parse_git_config(git_config))
        
        # Buscar proyectos hermanos
        parent_dir = self.project_root.parent
        if parent_dir.exists():
            data['projects'] = self._detect_sibling_projects(parent_dir)
        
        # Estructura
        data['structure'] = self._get_directory_tree(max_depth=2)
        
        return data
    
    def _parse_git_config(self, path: Path) -> Dict[str, Any]:
        """Parsea .git/config para extraer información del repo."""
        result = {}
        try:
            content = path.read_text(encoding='utf-8')
            
            # Buscar URL del remote origin
            url_match = re.search(r'url\s*=\s*(.+)', content)
            if url_match:
                url = url_match.group(1).strip()
                result['repo_url'] = url
                
                # Extraer organización de la URL
                # https://github.com/JoseVigil/nucleus-josevigil.git
                # git@github.com:JoseVigil/nucleus-josevigil.git
                org_match = re.search(r'github\.com[:/]([^/]+)/', url)
                if org_match:
                    org_name = org_match.group(1)
                    result['name'] = org_name
                    result['organization_url'] = f'https://github.com/{org_name}'
                    
        except Exception as e:
            print(f"⚠️  Error parseando .git/config: {e}")
        
        return result
    
    def _detect_sibling_projects(self, parent_dir: Path) -> List[Dict[str, Any]]:
        """Detecta proyectos hermanos que podrían vincularse."""
        projects = []
        
        try:
            for item in parent_dir.iterdir():
                if not item.is_dir():
                    continue
                if item.name.startswith('.'):
                    continue
                if item == self.project_root:
                    continue
                
                # Verificar si tiene .bloom/ (es un proyecto Bloom)
                bloom_dir = item / '.bloom'
                if bloom_dir.exists():
                    strategy = self._detect_project_strategy(item)
                    projects.append({
                        'name': item.name,
                        'path': str(item.relative_to(parent_dir)),
                        'strategy': strategy,
                        'has_bloom': True
                    })
                else:
                    # Detectar tipo de proyecto aunque no tenga .bloom
                    strategy = self._detect_project_strategy(item)
                    if strategy != 'unknown':
                        projects.append({
                            'name': item.name,
                            'path': str(item.relative_to(parent_dir)),
                            'strategy': strategy,
                            'has_bloom': False
                        })
        
        except Exception as e:
            print(f"⚠️  Error detectando proyectos hermanos: {e}")
        
        return projects
    
    def _detect_project_strategy(self, project_path: Path) -> str:
        """Detecta la estrategia de un proyecto basándose en archivos."""
        
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
        
        # Node.js
        package_json = project_path / 'package.json'
        if package_json.exists():
            try:
                content = json.loads(package_json.read_text())
                deps = content.get('dependencies', {})
                
                if 'react' in deps or 'react-dom' in deps:
                    return 'react-web'
                if 'express' in deps or 'fastify' in deps:
                    return 'node'
                
                return 'node'  # Default para package.json
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
        
        return 'unknown'


# =============================================================================
# NUCLEUS CONTEXT GENERATOR
# =============================================================================

class Nuc