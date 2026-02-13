# Bloom Plugin - Especificación Técnica Unificada

**Versión:** 2.1.0  
**Fecha:** 29 de Noviembre de 2025  
**Tipo de Proyecto:** VSCode Extension + Multi-Organization System

---

## Índice General

1. Resumen Ejecutivo
2. Arquitectura General
3. Sistema Nucleus (Multi-Organización)
4. Sistema de Intents (BTIP)
5. Git Orchestration
6. Gestión de Archivos y Auto-Save
7. Estrategias de Proyecto
8. Chrome Profile Manager
9. Workflow de Usuario
10. Estructura de Archivos
11. Implementación Técnica
12. Comandos y Configuración

---

## 1. Resumen Ejecutivo

Bloom es un plugin de VSCode que integra tres sistemas complementarios:

**Sistema A: Nucleus (Organizacional)**

- Gestión multi-organización con autenticación GitHub OAuth
- Repositorios centralizados por organización con convención nucleus-<org>
- Documentación organizacional en archivos .bl
- Índice de proyectos técnicos vinculados
- Workspace unificado multi-root para navegación sin ventanas múltiples

**Sistema B: BTIP (Technical Intent Packages)**

- Gestión de intents de desarrollo con ciclo de vida completo
- Auto-save inteligente con debounce de 2 segundos
- Generación dinámica de codebase.md
- Integración con Claude AI via Chrome profiles

**Sistema C: Git Orchestration**

- Detección automática de estado local/remoto
- Gestión unificada de commits con confirmación explícita
- Push confirmable vía SCM panel nativo
- Coordinación entre TypeScript y Python para generación de estructura

**Características Clave:**

- Zero-config: experiencia tipo GitHub Copilot
- Multi-workspace: un usuario puede tener múltiples Nucleus
- Auto-detección: estrategias de proyecto detectadas automáticamente
- Persistencia: auto-save de drafts + gestión de estado
- Git inteligente: commits staged con confirmación manual

Para código fuente detallado, consulta el snapshot consolidado en 'codebase_key_files.bl', optimizado para indexación por IA.

---

## 2. Arquitectura General

### 2.1 Componentes Principales

    Bloom Plugin
    ├── Nucleus System
    │   ├── OAuth GitHub
    │   ├── Multi-org Registry
    │   ├── Repository Management
    │   ├── Organization Documentation
    │   └── Workspace Unificado
    │
    ├── BTIP System
    │   ├── Intent Lifecycle
    │   ├── Auto-Save Engine
    │   ├── Codebase Generator
    │   └── Workflow Manager
    │
    ├── Git Orchestration
    │   ├── GitOrchestrator (Core)
    │   ├── State Detection
    │   ├── SCM Integration
    │   └── Python Script Runner
    │
    ├── Chrome Integration
    │   ├── Profile Manager
    │   ├── Claude AI Bridge
    │   └── Conversation Tracking
    │
    └── Strategy Detection
        ├── Android Strategy
        ├── iOS Strategy
        ├── React/Web Strategy
        ├── Node Strategy
        ├── Nucleus Strategy
        └── Generic Strategy

### 2.2 Flujo de Datos

    Usuario → GitHub OAuth → UserManager (allOrgs[])
                                    ↓
                            NucleusTreeProvider
                                    ↓
                    [Org 1]  [Org 2]  [Org 3]
                       ↓        ↓        ↓
                   nucleus-1 nucleus-2 nucleus-3
                       ↓
                   Projects (Linked)
                       ↓
                   Git Orchestration
                       ↓
                   Intent System (BTIP)
                       ↓
                   Claude Bridge

---

## 3. Sistema Nucleus (Multi-Organización)

### 3.1 Concepto Fundamental

Un **Nucleus** es un repositorio organizacional que:

- Documenta la estructura de proyectos
- Define políticas y protocolos
- Indexa proyectos técnicos (hijos)
- Sirve como centro de conocimiento

**Diferencia con BTIP:**

    | Aspecto         | BTIP (Hijo)           | Nucleus (Padre)      |
    |-----------------|----------------------|---------------------|
    | Propósito       | Código técnico       | Documentación org   |
    | Estrategia      | android, node, etc.  | nucleus             |
    | Contenido       | Código + intents     | Docs + overviews    |
    | Identificador   | .bloom/project/      | nucleus-config.json |
    | Audiencia       | AI (coding)          | Humanos + AI        |

### 3.2 Registro y Autenticación

**Flujo de Registro (Primera Vez):**

    1. Usuario abre plugin → Vista "Welcome"
    2. Click "Conectar con GitHub" → OAuth
    3. Plugin obtiene:
       - user.login (username)
       - user.orgs[] (todas las organizaciones)
    4. UserManager guarda en globalState:
       {
         githubUsername: "josevigil",
         githubOrg: "josevigil",
         allOrgs: ["josevigil", "bloom", "acme-corp"]
       }
    5. Vista cambia de Welcome → Nucleus Tree

**Implementación:**

Ver `src/managers/userManager.ts` para lógica de persistencia.
Ver `src/ui/welcome/welcomeView.ts` para flujo de autenticación.

### 3.3 Gestión Multi-Nucleus y Workspace Unificado

**Activity Bar → Vista "Nucleus":**

    [Organization 1]
      ├─ project-mobile
      ├─ project-backend
      └─ project-web
    
    [Organization 2]
      ├─ another-project
      └─ another-backend
    
    [+ Agregar otro Nucleus]

**Arquitectura Multi-Root Workspace:**

Bloom utiliza VSCode Multi-Root Workspace para unificar todos los proyectos:

    Parent Folder/
    ├── nucleus-josevigil/              ← Nucleus (Centro)
    ├── bloom-mobile/                   ← Proyecto hijo
    ├── bloom-backend/                  ← Proyecto hijo
    └── josevigil-workspace.code-workspace  ← Config multi-root

**Beneficios:**

- Un solo VSCode para todos los proyectos
- Navegación sin abrir ventanas nuevas
- Compilación por proyecto individual
- Persistencia del workspace entre sesiones

**Detección Automática:**

El plugin detecta Nucleus en:

1. Workspace actual (si contiene nucleus-config.json)
2. Proyectos hermanos (via nucleus.json link)
3. Parent directory (búsqueda recursiva limitada)

Ver `src/providers/nucleusTreeProvider.ts` para implementación.
Ver `src/managers/workspaceManager.ts` para gestión de workspace.

### 3.4 Convención de Nombres

**Repositorio Nucleus:**

    nucleus-<organization>

Ejemplos:

- nucleus-josevigil
- nucleus-bloom
- nucleus-acme-corp

**Beneficios:**

- Prefijo distintivo para filtrado
- Clara identificación de propósito
- Compatibilidad con GitHub naming

### 3.5 Creación de Nucleus con Git Orchestration

**3 Casos de Uso Detectados Automáticamente:**

**Caso 1: Repo no existe (Crear Nuevo)**

    1. GitOrchestrator detecta location: 'none'
    2. Crea repo en GitHub via API
    3. Inicializa Git localmente
    4. Ejecuta generate_nucleus.py
    5. Stage archivos con GitManager.stageAndOpenSCM()
    6. Abre SCM panel para commit confirmable
    7. Crea workspace multi-root
    8. Ofrece abrir workspace

**Caso 2: Repo existe en GitHub (Clonar)**

    1. GitOrchestrator detecta location: 'remote'
    2. Clona repositorio
    3. Valida estructura .bloom/
    4. Si falta algo → completa con Python
    5. Stage cambios si los hay
    6. Crea workspace file si no existe

**Caso 3: Repo existe local + GitHub (Vincular)**

    1. GitOrchestrator detecta location: 'both'
    2. Valida consistencia de remote origin
    3. Completa estructura .bloom/ si falta
    4. Stage cambios si los hay
    5. Registra en UserManager
    6. Crea workspace file si falta

**Archivo .code-workspace Generado:**

    {
      "folders": [
        {
          "name": "🏢 nucleus-josevigil",
          "path": "./nucleus-josevigil"
        }
      ],
      "settings": {
        "bloom.activeNucleus": "nucleus-josevigil",
        "window.title": "JoseVigil Workspace",
        "files.exclude": {
          "**/.git": true,
          "**/node_modules": true
        }
      },
      "extensions": {
        "recommendations": ["bloom.bloom-btip-plugin"]
      }
    }

Ver `src/core/gitOrchestrator.ts` para lógica de detección.
Ver `src/managers/workspaceManager.ts` para gestión de workspace.

### 3.6 Estructura del Nucleus

**Directorio Completo:**

    nucleus-<org>/
    ├── .bloom/
    │   ├── core/
    │   │   ├── nucleus-config.json    ← Identificador
    │   │   ├── .rules.bl
    │   │   └── .prompt.bl
    │   ├── organization/
    │   │   ├── .organization.bl       ← Header
    │   │   ├── about.bl
    │   │   ├── business-model.bl
    │   │   ├── policies.bl
    │   │   └── protocols.bl
    │   └── projects/
    │       ├── _index.bl              ← Árbol de proyectos
    │       ├── project-mobile/
    │       │   └── overview.bl
    │       └── project-backend/
    │           └── overview.bl
    └── README.md

**nucleus-config.json:**

    {
      "type": "nucleus",
      "version": "1.0.0",
      "id": "uuid",
      "organization": {
        "name": "JoseVigil",
        "displayName": "Jose Vigil Development",
        "url": "https://github.com/JoseVigil"
      },
      "nucleus": {
        "name": "nucleus-josevigil",
        "repoUrl": "https://github.com/JoseVigil/nucleus-josevigil.git",
        "createdAt": "ISO-timestamp",
        "updatedAt": "ISO-timestamp"
      },
      "projects": [
        {
          "id": "uuid",
          "name": "bloom-video-server",
          "displayName": "Bloom Video Server",
          "strategy": "node",
          "repoUrl": "https://github.com/...",
          "localPath": "../bloom-video-server",
          "status": "active",
          "linkedAt": "ISO-timestamp"
        }
      ]
    }

### 3.7 Vinculación de Proyectos Hijo con Workspace

**Comando:** bloom.linkToNucleus

**Flujo Mejorado:**

    1. Usuario abre proyecto BTIP (o ejecuta comando)
    2. Click derecho → "Link to Nucleus"
    3. Plugin busca Nucleus en parent directory
    4. Usuario confirma vinculación
    5. Plugin ejecuta:
       a. Crea LinkedProject en nucleus-config.json
       b. Crea nucleus.json en proyecto hijo
       c. Genera overview.bl en Nucleus
       d. Actualiza _index.bl
       e. Asegura estructura .bloom/ completa en hijo
       f. Stage cambios con GitManager
       g. Agrega proyecto al workspace actual
    6. Proyecto aparece en explorador VSCode
    7. Enfoca automáticamente en el proyecto agregado

**Gestión de Estructura .bloom/ en Hijos:**

El plugin garantiza estructura completa via `ensureBloomStructure()`:

    proyecto-hijo/
    ├── .bloom/
    │   ├── core/
    │   │   ├── .rules.bl          ← Adaptado a estrategia
    │   │   ├── .standards.bl
    │   │   └── .prompt.bl
    │   ├── project/
    │   │   ├── .context.bl
    │   │   └── .app-context.bl
    │   ├── intents/                ← Vacío inicialmente
    │   └── nucleus.json            ← Link al padre
    └── [código fuente...]

**Función: ensureBloomStructure()**

Ubicación: `src/commands/manageProject.ts`

Comportamiento:

- Detecta si `.bloom/core` y `.bloom/project` existen
- Si existen → No hace nada (respeta estructura existente)
- Si no existen → Crea estructura completa con templates
- Templates adaptados por estrategia (Android, Node, etc.)

**nucleus.json (en proyecto hijo):**

    {
      "linkedToNucleus": true,
      "nucleusId": "uuid-del-nucleus",
      "nucleusName": "nucleus-josevigil",
      "nucleusPath": "../nucleus-josevigil",
      "organizationName": "JoseVigil",
      "projectId": "uuid-de-este-proyecto",
      "linkedAt": "ISO-timestamp"
    }

Ver `src/commands/linkToNucleus.ts` para implementación completa.
Ver `src/commands/manageProject.ts` para ensureBloomStructure().

### 3.8 Desvincular Nucleus (Feature v1.0)

**Estado:** 100% implementado y funcional

**Descripción:**

Permite desvincular un Nucleus de forma limpia sin borrar repositorios.

**Comportamiento:**

Al hacer click en el botón ⛓️‍💥 **Desvincular**:

    1. Muestra modal de confirmación
    2. Al confirmar:
       - Remueve la organización de allOrgs
       - Cambia githubOrg al siguiente de la lista (o null)
       - Actualiza bloom.isRegistered context
       - Cierra carpetas del workspace relacionadas
       - Refresca NucleusTreeProvider
       - Muestra toast: "✅ Nucleus desvinculado"
    3. Resultado visual inmediato:
       - Vista "Nucleus" desaparece
       - Vuelve vista "Nucleus Welcome"
       - Workspace queda limpio

**Beneficios:**

- UX profesional y segura
- Permite cambiar rápidamente de organización
- Prepara para "Levantar Nucleus existente"
- Desarrollador puede probar flujos infinitas veces

**Implementación:**

- Comando: `bloom.unlinkNucleus`
- Icono: `$(chain-broken)` → aparece como ⛓️‍💥
- Posición: `navigation@0` (extremo izquierdo)
- When clause: `view == bloomNucleus`
- Cierre inteligente de carpetas usando `updateWorkspaceFolders`

Ver documentación completa en `Desvincular Nucleus (Unlink Nucleus).md`.

---

## 4. Sistema de Intents (BTIP)

### 4.1 Ciclo de Vida de Intents

**5 Estados:**

    📝 Draft (amarillo)
      ↓ [Submit Form]
    ✅ Generated (verde)
      ↓ [Open in Browser]
    🟡 In Progress
      ↓ [Mark Complete]
    ✅ Completed
      ↓ [Archive]
    📦 Archived

**Transiciones Adicionales:**

    ✅ Generated ──[Edit + Regenerate]──> ✅ Generated

### 4.2 Workflow Avanzado

**Stages del Workflow:**

    draft → intent-generated → questions-ready → 
    answers-submitted → snapshot-downloaded → integrated

**Integración con Claude AI:**

    1. Usuario genera intent.bl
    2. Abre en Claude.ai (con profile específico)
    3. Claude genera preguntas → artifact
    4. Usuario responde preguntas
    5. Claude genera snapshot de código
    6. Plugin integra snapshot al proyecto

Ver `src/models/intent.ts` interface IntentWorkflow.

### 4.3 Gestión Dinámica de Archivos

**5 Acciones por File Pill:**

    [📄 LoginActivity.kt] [🔗] [📋] [📂] [❌]
         ↓                  ↓    ↓    ↓    ↓
      Insertar nombre   Abrir Copiar Finder Remover

**Agregar desde Explorer:**

    Click derecho en archivo/carpeta →
    ├── Bloom: Generate New Intent
    └── Bloom: Add to Intent →
        ├── 📝 fix_login_bug
        ├── 📝 add_payment_method
        └── ✅ improve_performance

**Comportamiento al Agregar:**

1. Archivo se agrega a intent.json
2. Codebase.md se regenera automáticamente
3. Token counter se actualiza
4. Si formulario abierto → auto-reload

Ver `src/commands/addToIntent.ts` para implementación.

### 4.4 Auto-Save Inteligente

**Decisión Crítica: Opción B**

Auto-save **SÍ** guarda la lista de archivos en intent.json.

**Alcance del Auto-Save:**

Campos guardados:

- name
- problem
- expectedOutput
- currentBehavior[]
- desiredBehavior[]
- notes
- **files[]** ← INCLUIDO

**Comportamiento:**

    1. Usuario edita formulario
       ↓ (cada cambio)
    2. Debounce de 2 segundos
       ↓
    3. IntentAutoSaver.queue()
       ↓
    4. Merge con intent.json existente
       ↓
    5. Persistencia en disco
       ↓
    6. Indicador: "💾 Guardado 14:45:32"

**Lo que NO hace:**

- ❌ No genera intent.bl automáticamente
- ❌ No cambia status a "generated"
- ❌ No regenera codebase.md

**Lo que SÍ hace:**

- ✅ Guarda draft cada 2 segundos
- ✅ Actualiza timestamps
- ✅ Preserva archivos seleccionados
- ✅ Muestra indicador visual

Ver `src/core/intentAutoSaver.ts` para implementación completa.

### 4.5 Regeneración de Codebase

**Triggers para Regeneración:**

1. ✅ Agregar archivo (Add to Intent)
2. ✅ Remover archivo (botón ❌)
3. ✅ Regenerar intent (botón submit con status='generated')
4. ❌ Auto-save NO regenera

**Estrategia Dual:**

    Nativo (TypeScript) ← DEFAULT
         ↓
    Python Script (opcional)

**Configuración:**

    "bloom.useCustomCodebaseGenerator": true

**Flujo con Python:**

    1. Plugin verifica .bloom/scripts/generate_codebase.py
    2. Si existe → ejecuta script
    3. Si falla → fallback a nativo
    4. Notificación: "Codebase regenerado (Python/Nativo)"

Ver `src/core/codebaseGenerator.ts` para lógica dual.

### 4.6 Límite de Tokens

**Visualización:**

    Verde (0-80%):
    📊 Token estimate: 45,234 / 100,000 (45%)
    
    Amarillo (80-100%):
    ⚠️ Warning: 95,678 / 100,000 (95%) - Consider removing files
    
    Rojo (>100%):
    ❌ Error: 120,456 / 100,000 (120%) - Cannot generate, remove files

**Cálculo:**

    estimatedTokens = Math.ceil(totalChars / 4)
    percentage = (estimated / 100000) * 100

**Bloqueo:**

Si percentage > 100 → botón "Generar Intent" disabled.

### 4.7 Estructura de Intent

**Carpeta de Intent:**

    .bloom/intents/fix_login_bug/
    ├── intent.json          ← Metadata + estado
    ├── intent.bl            ← Generado al submit
    └── codebase.md          ← Regenerado dinámicamente

**intent.json (Completo):**

    {
      "id": "uuid",
      "name": "fix_login_bug",
      "displayName": "Fix Login Bug",
      "status": "in-progress",
      "created": "ISO-timestamp",
      "updated": "ISO-timestamp",
      "content": {
        "problem": "El login falla con error 401...",
        "expectedOutput": "Login exitoso con token...",
        "currentBehavior": ["Usuario ingresa credenciales", "..."],
        "desiredBehavior": ["Validación local", "Request al server"],
        "considerations": "Usar Retrofit...",
        "lastSaved": "ISO-timestamp"
      },
      "files": [
        "app/src/main/java/LoginActivity.java",
        "app/src/main/java/AuthService.java"
      ],
      "tokens": {
        "estimated": 8500,
        "limit": 100000,
        "percentage": 8.5
      },
      "workflow": {
        "stage": "intent-generated",
        "questions": [],
        "integrationStatus": "pending"
      },
      "profileConfig": {
        "profileName": "Profile 1",
        "provider": "claude"
      }
    }

---

## 5. Git Orchestration

### 5.1 Concepto y Objetivos

**Objetivo Central:**

Gestionar repos remotos y locales de forma determinística, permitiendo:

- Crear o clonar repositorios
- Aplicar configuraciones obligatorias
- UN SOLO flujo mental unificado
- Commit + push explícito y confirmable

**Decisiones Arquitectónicas:**

1. Git y GitHub se manejan **exclusivamente desde TypeScript**
2. Python queda para generación de contenido
3. Mantener **un único Nucleus por organización**
4. UI de push confirmable → panel SCM nativo
5. Push explícito SIEMPRE (nunca silencioso)

### 5.2 GitOrchestrator (Diseño de Módulo)

**Ubicación:** `src/core/gitOrchestrator.ts`

**Interfaces TypeScript:**

    interface NucleusStatus {
      exists: boolean;
      location: 'local' | 'remote' | 'both' | 'none';
      localPath?: string;
      remoteUrl?: string;
      hasValidStructure?: boolean;
      conflictDetected?: boolean;
    }

    interface NucleusResult {
      success: boolean;
      nucleusPath: string;
      action: 'created' | 'cloned' | 'linked';
      message: string;
      error?: string;
    }

**Métodos Principales:**

    detectNucleusStatus(org: string): Promise<NucleusStatus>
    createNucleus(org: string, path: string): Promise<NucleusResult>
    cloneNucleus(org: string, path: string): Promise<NucleusResult>
    linkNucleus(localPath: string, org: string): Promise<NucleusResult>

### 5.3 Flujos Unificados

**Flujo Nucleus: Crear**

    1. Verificar si existe nucleus-acme en GitHub
    2. Si NO existe → crear repo remoto
    3. Crear carpeta local
    4. git init
    5. Agregar origin
    6. Ejecutar generate_nucleus.py
    7. Aplicar estructura .bloom/
    8. GitManager.stageAndOpenSCM()
    9. Usuario hace commit + push desde SCM

**Flujo Nucleus: Clonar**

    1. Detectar nucleus-acme remoto
    2. git clone en local
    3. Ejecutar verificación de .bloom/
    4. Completar si falta
    5. Stage cambios si los hay
    6. Abrir SCM para commit/push si necesario

**Flujo Nucleus: Vincular (local + remoto existen)**

    1. Validar estructura .bloom/
    2. Generar lo que falte
    3. Stage + SCM
    4. Nunca clonar
    5. Registrar Nucleus en bloom registry

### 5.4 GitManager Universal

**Método Principal:** `GitManager.stageAndOpenSCM()`

**Firma:**

    static async stageAndOpenSCM(
        repoPath: string,
        files?: string[],
        commitMessage?: string
    ): Promise<void>

**Casos de Uso:**

- Proyectos nuevos: `stageAndOpenSCM(projectPath, undefined, "Initial commit")`
- Intents: `stageAndOpenSCM(workspacePath, ['.bloom/intents/...'], "Generated intent")`
- Nucleus: `stageAndOpenSCM(nucleusPath, undefined, "Initial Nucleus")`

**Comportamiento:**

    1. Verifica que es un repo git válido
    2. Stage archivos (específicos o todos)
    3. Verifica que hay cambios staged
    4. Intenta pre-llenar mensaje de commit
    5. Enfoca en SCM panel
    6. Muestra notificación NO BLOQUEANTE
    7. Usuario hace commit + push manualmente

**Características:**

- ✅ Nunca hace commit automático
- ✅ Nunca hace push silencioso
- ✅ Pre-llena mensaje sugerido
- ✅ Modal NO bloqueante
- ✅ Funciona con multi-root workspace

Ver `src/utils/gitManager.ts` para implementación completa.

### 5.5 Interacción con Python

Python se usa únicamente para:

- Generar estructura Nucleus
- Generar estructura Proyecto
- Generar documentación y contextos
- Generar templates

**Ejemplo:**

    python generate_nucleus.py --path ~/dev/nucleus-acme

**Nunca para:**

- Git
- GitHub
- Clonar
- Crear repo
- Push

Ver `git-orchestration-impl.md` para detalles técnicos.

---

## 6. Gestión de Archivos y Auto-Save

### 6.1 IntentSession

**Clase Central de Coordinación:**

    IntentSession
    ├── addFiles(files[])
    ├── removeFile(path)
    ├── regenerateCodebase()
    ├── calculateTokens()
    ├── queueAutoSave(updates)
    ├── changeStatus(status)
    └── deleteIntent()

**Responsabilidades:**

- Coordinar modificaciones desde múltiples fuentes
- Sincronizar formulario con intent.json
- Regenerar codebase automáticamente
- Prevenir race conditions

Ver `src/core/intentSession.ts` para implementación.

### 6.2 Sincronización Multi-Fuente

**Caso: Usuario agrega archivo desde Explorer mientras formulario está abierto**

    1. Explorer: Click "Add to Intent" → fix_login_bug
    2. IntentSession.addFiles() ejecuta:
       a. Agrega files a intent.json
       b. Regenera codebase.md
       c. Recalcula tokens
       d. Emite evento 'filesChanged'
    3. IntentFormPanel escucha evento:
       a. Re-renderiza file pills
       b. Actualiza token counter
       c. Muestra notificación: "2 archivos agregados"

### 6.3 Auto-Save Detallado

**Flujo Completo:**

    1. Usuario escribe en formulario
       ↓
    2. intentForm.js detecta cambio
       ↓ (debounce 2s)
    3. postMessage a intentFormPanel.ts
       ↓
    4. intentFormPanel llama IntentAutoSaver.queue()
       ↓
    5. IntentAutoSaver espera 2s
       ↓
    6. flush() ejecuta:
       a. Lee intent.json actual
       b. Merge con updates (incluyendo files[])
       c. Escribe intent.json
       d. Muestra indicador "💾 Guardado HH:MM:SS"

**Persistencia Mínima:**

    {
      "content": {
        "problem": "...",
        "expectedOutput": "...",
        "currentBehavior": ["..."],
        "desiredBehavior": ["..."],
        "considerations": "...",
        "lastSaved": "ISO-timestamp"
      },
      "files": ["path1", "path2"],
      "metadata": {
        "updatedAt": "ISO-timestamp"
      }
    }

### 6.4 Botón Delete Intent

**Ubicación en Formulario:**

    [✨ Generar Intent]  [Cancelar]  |  [🗑️ Delete Intent]

**Confirmación:**

    "¿Eliminar intent 'fix_login_bug'?"
    "Esto borrará la carpeta .bloom/intents/fix_login_bug/ permanentemente."
    [Cancelar] [Eliminar]

**Acción:**

    1. Usuario confirma
    2. IntentSession.deleteIntent()
       a. Elimina carpeta recursivamente
       b. Cierra formulario
       c. Refresca TreeView
    3. Notificación: "Intent eliminado"

---

## 7. Estrategias de Proyecto

### 7.1 Sistema de Detección

**Prioridad de Detección:**

    1. Nucleus (nucleus-config.json)
    2. Android (build.gradle, AndroidManifest.xml)
    3. iOS (*.xcodeproj, Podfile)
    4. React (package.json + react deps)
    5. Web (package.json o index.html)
    6. Node (package.json)
    7. Python (requirements.txt)
    8. Generic (fallback)

Ver `src/strategies/ProjectDetector.ts` para lógica completa.

### 7.2 Estrategia Nucleus

**Características Especiales:**

- Genera documentación en lugar de código
- Lee archivos .bl de organization/ y projects/
- Prioriza docs sobre code
- Formato de codebase diferente

**Codebase Nucleus:**

    # BLOOM NUCLEUS - ORGANIZATIONAL DOCUMENTATION
    
    ## ORGANIZATION INFO
    **Name:** JoseVigil
    ...
    
    ## LINKED PROJECTS
    ### Bloom Video Server
    - Strategy: node
    ...
    
    ## ORGANIZATION DOCUMENTATION
    ### 📄 .organization.bl
    ...

Ver `src/strategies/NucleusStrategy.ts` para implementación.

### 7.3 Tabla de Estrategias

    | Estrategia    | Identificadores                 | Archivos Priorizados    |
    |---------------|---------------------------------|------------------------|
    | nucleus       | nucleus-config.json             | *.bl, *.json           |
    | android       | build.gradle, AndroidManifest   | *.kt, *.java, *.xml    |
    | ios           | *.xcodeproj, Podfile            | *.swift, *.m           |
    | react-web     | package.json + react            | *.tsx, *.jsx           |
    | web           | index.html, package.json        | *.html, *.css, *.js    |
    | node          | package.json + express          | *.ts, *.js             |
    | python-flask  | requirements.txt + flask        | *.py                   |
    | generic       | fallback                        | todos                  |

---

## 8. Chrome Profile Manager

### 8.1 Concepto

Permite asociar un Chrome profile específico a cada intent para:

- Mantener sesiones de Claude.ai separadas
- Evitar mezclar conversaciones
- Automatizar apertura en navegador

### 8.2 Configuración de Profile

**En intent.json:**

    {
      "profileConfig": {
        "profileName": "Profile 1",
        "provider": "claude",
        "account": "user@email.com"
      },
      "activeConversations": {
        "claude": {
          "conversationId": "xxx",
          "url": "https://claude.ai/...",
          "lastAccessed": "ISO-timestamp"
        }
      }
    }

### 8.3 Comandos

    bloom.manageProfiles        → Abrir panel de gestión
    bloom.configureIntentProfile → Asignar profile a intent
    bloom.openIntentInBrowser   → Abrir Claude con profile

Ver `src/core/chromeProfileManager.ts` y `src/providers/profileTreeProvider.ts`.

---

## 9. Workflow de Usuario

### 9.1 Flujo Completo (Primera Vez)

    1. Instalar plugin
       ↓
    2. Abrir VSCode → Vista "Welcome"
       ↓
    3. "Conectar con GitHub" → OAuth
       ↓
    4. Datos llenados automáticamente
       ↓
    5. Elegir organización
       ↓
    6. "Crear Nucleus" →
       a. GitOrchestrator detecta estado
       b. Crea/Clona/Vincula según caso
       c. Guarda allOrgs[]
       ↓
    7. Activity Bar → Vista "Nucleus"
       [Organization X]
         └─ [+ Agregar proyecto]
       [+ Agregar otro Nucleus]

### 9.2 Crear Intent Nuevo

    1. Seleccionar archivos en Explorer
       ↓
    2. Click derecho → "Generate New Intent"
       ↓
    3. Formulario se abre con archivos pre-cargados
       ↓
    4. Usuario escribe nombre (≥3 chars)
       → IntentSession crea carpeta + intent.json (status: draft)
       → Auto-save cada 2s
       ↓
    5. Usuario llena problema, comportamientos, notas
       ↓
    6. Click "Generar Intent"
       → Genera intent.bl + codebase.md
       → Cambia status a 'generated'
       ↓
    7. TreeView muestra: ✅ fix_login_bug

### 9.3 Agregar Archivos a Intent Existente

    1. Seleccionar archivos nuevos en Explorer
       ↓
    2. Click derecho → "Add to Intent" → fix_login_bug
       ↓
    3. IntentSession.addFiles() ejecuta:
       a. Agrega a intent.json
       b. Regenera codebase.md
       c. Recalcula tokens
       ↓
    4. Si formulario abierto → auto-reload
       ↓
    5. Notificación: "3 archivos agregados"

### 9.4 Remover Archivo desde Formulario

    1. Usuario abre intent existente
       ↓
    2. Click botón ❌ de "AuthService.java"
       ↓
    3. Confirmación: "¿Remover AuthService.java?"
       ↓
    4. IntentSession.removeFile()
       a. Remueve de intent.json
       b. Regenera codebase.md
       c. Recalcula tokens
       ↓
    5. File pill desaparece
       ↓
    6. Token counter actualizado

### 9.5 Regenerar Intent

    1. Abrir intent con status 'generated'
       ↓
    2. Botón muestra: "🔄 Regenerar Intent"
       ↓
    3. Usuario modifica problema/archivos/notas
       ↓
    4. Click "Regenerar Intent"
       → Sobrescribe intent.bl + codebase.md
       → Actualiza updatedAt
       ↓
    5. Notificación: "Intent regenerado"

### 9.6 Desvincular Nucleus

    1. Activity Bar → Vista "Nucleus"
       ↓
    2. Click botón ⛓️‍💥 "Desvincular"
       ↓
    3. Modal de confirmación
       ↓
    4. Al confirmar:
       - Remueve org de allOrgs
       - Cierra carpetas relacionadas
       - Refresca tree
       ↓
    5. Vista "Welcome" aparece de nuevo

---

## 10. Estructura de Archivos

### 10.1 Plugin Tree

    bloom-development-extension/
    ├── src/
    │   ├── bridge/
    │   │   └── BridgeExecutor.ts
    │   ├── commands/
    │   │   ├── addToIntent.ts
    │   │   ├── changeIntentStatus.ts
    │   │   ├── configureIntentProfile.ts
    │   │   ├── copyContextToClipboard.ts
    │   │   ├── createBTIPProject.ts
    │   │   ├── createNucleusProject.ts
    │   │   ├── debug/
    │   │   │   └── debugCommands.ts
    │   │   ├── deleteIntent.ts
    │   │   ├── deleteIntentFromForm.ts
    │   │   ├── duplicateIntent.ts
    │   │   ├── editIntent.ts
    │   │   ├── generateIntent.ts
    │   │   ├── generateQuestions.ts
    │   │   ├── git/
    │   │   │   └── gitCommands.ts
    │   │   ├── integrateSnapshot.ts
    │   │   ├── linkToNucleus.ts
    │   │   ├── manageProject.ts
    │   │   ├── nucleus/
    │   │   │   └── nucleusCommands.ts
    │   │   ├── openFileInVSCode.ts
    │   │   ├── openIntent.ts
    │   │   ├── openIntentInBrowser.ts
    │   │   ├── openMarkdownPreview.ts
    │   │   ├── profile/
    │   │   │   └── profileCommands.ts
    │   │   ├── regenerateContext.ts
    │   │   ├── reloadIntentForm.ts
    │   │   ├── revealInFinder.ts
    │   │   ├── searchIntents.ts
    │   │   └── submitAnswers.ts
    │   ├── context/
    │   │   └── ContextCollector.ts
    │   ├── core/
    │   │   ├── chromeProfileManager.ts
    │   │   ├── claudeApiClient.ts
    │   │   ├── codebaseGenerator.ts
    │   │   ├── contextGatherer.ts
    │   │   ├── filePackager.ts
    │   │   ├── gitOrchestrator.ts
    │   │   ├── intentAutoSaver.ts
    │   │   ├── intentGenerator.ts
    │   │   ├── intentSession.ts
    │   │   ├── metadataManager.ts
    │   │   ├── nucleusManager.ts
    │   │   ├── pythonScriptRunner.ts
    │   │   └── validator.ts
    │   ├── extension.ts
    │   ├── initialization/
    │   │   ├── commandRegistry.ts
    │   │   ├── contextInitializer.ts
    │   │   ├── criticalCommandsInitializer.ts
    │   │   ├── managersInitializer.ts
    │   │   └── providersInitializer.ts
    │   ├── managers/
    │   │   ├── userManager.ts
    │   │   └── workspaceManager.ts
    │   ├── models/
    │   │   ├── bloomConfig.ts
    │   │   ├── codebaseStrategy.ts
    │   │   ├── contextLayer.ts
    │   │   └── intent.ts
    │   ├── processor/
    │   │   └── ArtifactProcessor.ts
    │   ├── providers/
    │   │   ├── intentTreeProvider.ts
    │   │   ├── nucleusTreeProvider.ts
    │   │   ├── nucleusWelcomeProvider.ts
    │   │   └── profileTreeProvider.ts
    │   ├── strategies/
    │   │   ├── AndroidStrategy.ts
    │   │   ├── GenericStrategy.ts
    │   │   ├── IOSStrategy.ts
    │   │   ├── NucleusStrategy.ts
    │   │   ├── ProjectDetector.ts
    │   │   ├── ReactStrategy.ts
    │   │   ├── WebStrategy.ts
    │   │   └── helpers.ts
    │   ├── ui/
    │   │   ├── ClaudeBridgePanel.ts
    │   │   ├── intent/
    │   │   │   ├── intentForm.css
    │   │   │   ├── intentForm.html
    │   │   │   ├── intentForm.js
    │   │   │   └── intentFormPanel.ts
    │   │   ├── markdownPreviewPanel.ts
    │   │   ├── nucleus/
    │   │   │   └── NucleusSetupPanel.ts
    │   │   ├── profile/
    │   │   │   ├── profileManager.css
    │   │   │   ├── profileManager.html
    │   │   │   ├── profileManager.js
    │   │   │   └── profileManagerPanel.ts
    │   │   └── welcome/
    │   │       ├── welcomeView.html
    │   │       └── welcomeView.ts
    │   └── utils/
    │       ├── gitExecutor.ts
    │       ├── gitManager.ts
    │       ├── gitPathResolver.ts
    │       ├── github.ts
    │       ├── githubApi.ts
    │       ├── githubOAuth.ts
    │       ├── logger.ts
    │       ├── pythonExecutor.ts
    │       ├── tokenEstimator.ts
    │       └── uriHelper.ts
    ├── package.json
    └── tsconfig.json

## 10.2 Snapshot de Código Clave (codebase_key_files.bl)

Para facilitar la indexación y análisis por IA, el archivo "codebase_key_files.bl" consolida el código fuente de los 14 archivos clave del plugin. Este snapshot incluye:
- **Índice Jerárquico**: Lista de paths absolutos para navegación rápida.
- **Contenidos**: Código completo (o truncado donde aplica) en bloques Markdown, con metadatos como lenguaje y hash MD5.
- **Uso para IA**: Una IA puede parsear este archivo directamente para extraer código por path (e.g., buscar "## Contenidos de Archivos" seguido del path deseado). Si hay truncamientos, usar tools como code_execution para procesar snippets o verificar integridad via hashes.

**Archivos Clave Incluidos** (ver índice completo en el archivo):
| Categoría       | Archivos Principales                          | Descripción Breve |
|-----------------|-----------------------------------------------|-------------------|
| Raíz            | package.json                                 | Configuración del plugin, comandos y menús. |
| Punto de Entrada| extension.ts                                 | Inicialización principal (refactorizada con initialization/). |
| Comandos        | manageProject.ts                             | Gestión de proyectos (vinculación, clonación). |
| Core            | gitOrchestrator.ts, intentSession.ts, nucleusManager.ts | Orquestación Git, sesiones de intents, gestión Nucleus. |
| Initialization  | commandRegistry.ts, managersInitializer.ts, providersInitializer.ts | Registro modular de comandos, managers y providers (post-refactorización). |
| Managers        | userManager.ts, workspaceManager.ts          | Persistencia de usuario y workspaces multi-root. |
| Providers       | intentTreeProvider.ts, nucleusTreeProvider.ts| Vistas de árbol para intents y Nucleus. |
| Utils           | gitManager.ts                                | Gestión universal de Git con staging y commits. |

**Referencia para IA**: Todos los archivos clave del codebase están contenidos en "codebase_key_files.bl". Para analizar código específico, busca por path en el snapshot (e.g., "### C:/repos/.../extension.ts" para el código de extension.ts).    

### 10.3 Proyecto BTIP Completo con Workspace

**Organización en Disco:**

    /Users/jose/code/
    ├── nucleus-josevigil/
    │   └── .bloom/
    │       ├── core/
    │       │   ├── nucleus-config.json
    │       │   ├── .rules.bl
    │       │   └── .prompt.bl
    │       ├── organization/
    │       │   ├── .organization.bl
    │       │   ├── about.bl
    │       │   └── [otros...]
    │       └── projects/
    │           ├── _index.bl
    │           └── bloom-video-server/
    │               └── overview.bl
    │
    ├── bloom-video-server/
    │   ├── .bloom/
    │   │   ├── core/
    │   │   │   ├── .rules.bl
    │   │   │   ├── .standards.bl
    │   │   │   └── .prompt.bl
    │   │   ├── project/
    │   │   │   ├── .context.bl
    │   │   │   └── .app-context.bl
    │   │   ├── intents/
    │   │   │   └── fix_login_bug/
    │   │   │       ├── intent.json
    │   │   │       ├── intent.bl
    │   │   │       └── codebase.md
    │   │   └── nucleus.json
    │   └── [código fuente...]
    │
    └── josevigil-workspace.code-workspace

**Contenido del .code-workspace:**

    {
      "folders": [
        {
          "name": "🏢 nucleus-josevigil",
          "path": "./nucleus-josevigil"
        },
        {
          "name": "⚙️ bloom-video-server",
          "path": "./bloom-video-server"
        }
      ],
      "settings": {
        "bloom.activeNucleus": "nucleus-josevigil",
        "window.title": "JoseVigil Workspace"
      }
    }

---

## 11. Implementación Técnica

### 11.1 Interfaces TypeScript Clave

**BloomUser (userManager.ts):**

    interface BloomUser {
      githubUsername: string;
      githubOrg: string;
      allOrgs: string[];
      registeredAt: number;
    }

**NucleusConfig (bloomConfig.ts):**

    interface NucleusConfig {
      type: 'nucleus';
      version: string;
      id: string;
      organization: {
        name: string;
        displayName: string;
        url: string;
      };
      nucleus: {
        name: string;
        repoUrl: string;
        createdAt: string;
        updatedAt: string;
      };
      projects: LinkedProject[];
    }

**IntentMetadata (intent.ts):**

    interface IntentMetadata {
      id: string;
      name: string;
      status: 'draft' | 'in-progress' | 'completed' | 'archived';
      content: IntentContent;
      files: string[];
      tokens: TokenStats;
      workflow: IntentWorkflow;
    }

**NucleusStatus (gitOrchestrator.ts):**

    interface NucleusStatus {
      exists: boolean;
      location: 'local' | 'remote' | 'both' | 'none';
      localPath?: string;
      remoteUrl?: string;
      hasValidStructure?: boolean;
      conflictDetected?: boolean;
    }

### 11.2 Clases Principales

**IntentSession**

Ubicación: `src/core/intentSession.ts`

Métodos principales:

    - create(folder, workspace, files, ...)
    - forIntent(name, workspace, ...)
    - addFiles(files[])
    - removeFile(path)
    - generateIntent(formData)
    - regenerateIntent(formData)
    - queueAutoSave(updates)
    - changeStatus(status)
    - deleteIntent()
    - getState()

Ver src/core/intentSession.ts para registro completo (código en 'codebase_key_files.bl').    

**GitOrchestrator**

Ubicación: `src/core/gitOrchestrator.ts`

Métodos principales:

    - detectNucleusStatus(org)
    - createNucleus(org, parentPath)
    - cloneNucleus(org, parentPath)
    - linkNucleus(localPath, org)

Funcionalidad:

- Detecta estado local/remoto de Nucleus
- Coordina con GitHub API (Octokit)
- Ejecuta PythonScriptRunner para generación
- Integra con GitManager para staging
- Coordina con WorkspaceManager

Ver src/core/gitOrchestrator.ts para registro completo (código en 'codebase_key_files.bl').

**UserManager**

Ubicación: `src/managers/userManager.ts`

Métodos principales:

    - static init(context)
    - getUser()
    - saveUser(data)
    - isRegistered()
    - clear()

Ver src/managers/userManager.ts para registro completo (código en 'codebase_key_files.bl').

**WorkspaceManager**

Ubicación: `src/managers/workspaceManager.ts`

Responsabilidades:

- Crear y mantener archivo .code-workspace
- Agregar/remover proyectos del workspace actual
- Sincronizar estado del workspace con archivo
- Proporcionar iconos por estrategia de proyecto

Métodos principales:

    - initializeWorkspace(nucleusPath, orgName)
    - addProjectToWorkspace(projectPath, projectName, strategy)
    - removeProjectFromWorkspace(projectPath)
    - syncWorkspaceFile()
    - isMultiRootWorkspace()
    - getCurrentNucleusPath()
    - getProjectIcon(strategy)

Ver src/managers/workspaceManager.ts para registro completo (código en 'codebase_key_files.bl').

**GitManager**

Ubicación: `src/utils/gitManager.ts`

Métodos principales:

    - static stageAndOpenSCM(repoPath, files?, commitMessage?)
    - queueCommit(repoPath, message, files?)
    - reviewAndCommit()
    - getPendingCount()

Funcionalidad:

- Stage archivos específicos o todos
- Pre-llena mensaje de commit
- Abre SCM panel para confirmación
- Gestiona cola de commits pendientes
- Status bar con contador de cambios

Ver src/utils/gitManager.ts para registro completo (código en 'codebase_key_files.bl').

### 11.3 Providers

**NucleusTreeProvider**

Ubicación: `src/providers/nucleusTreeProvider.ts`

Funcionalidad:

- Detecta todos los Nucleus de allOrgs[]
- Muestra árbol colapsable por organización
- Maneja botón "+ Agregar otro Nucleus"
- Integra con workspace al hacer click

Ver src/providers/nucleusTreeProvider.ts para registro completo (código en 'codebase_key_files.bl').

**Método: openNucleusProject()**

Comportamiento:

    1. Verifica si proyecto ya está en workspace
    2. Si no está → Llama WorkspaceManager.addProjectToWorkspace()
    3. Si está → Enfoca en explorador
    4. NO abre nueva ventana

**IntentTreeProvider**

Ubicación: `src/providers/intentTreeProvider.ts`

Funcionalidad:

- Agrupa intents por status
- Muestra 3 grupos: In Progress, Completed, Archived
- Permite click para abrir intent
- Expone getIntents() para nesting en Nucleus
- Manejo de directorios faltantes: Verifica existencia antes de leer

Ver src/providers/intentTreeProvider.ts para registro completo (código en 'codebase_key_files.bl').

### 11.4 Comandos Registrados

**Comandos Nucleus:**

    bloom.createNucleusProject
    bloom.linkToNucleus
    bloom.openNucleusProject
    bloom.syncNucleusProjects
    bloom.createNewNucleus
    bloom.unlinkNucleus

**Comandos Intent:**

    bloom.generateIntent
    bloom.openIntent
    bloom.addToIntent
    bloom.deleteIntentFromForm
    bloom.openFileInVSCode
    bloom.revealInFinder
    bloom.copyFilePath

**Comandos Profile:**

    bloom.manageProfiles
    bloom.configureIntentProfile
    bloom.openIntentInBrowser

**Comandos Git:**

    bloom.reviewPendingCommits

Ver `src/initialization/commandRegistry.ts` para registro completo de comandos, y `src/extension.ts` para el punto de entrada que inicializa el registry.

Ver src/initialization/commandRegistry.ts y src/extension.ts para registro completo (código en 'codebase_key_files.bl').

### 11.5 Persistencia y Estado

**GlobalState (UserManager):**

Clave: `bloom.user.v3`

    {
      githubUsername: "josevigil",
      githubOrg: "josevigil",
      allOrgs: ["josevigil", "bloom", "acme"],
      registeredAt: 1700000000000
    }

**FileSystem:**

    .bloom/intents/{name}/intent.json       ← Metadata principal
    .bloom/intents/{name}/intent.bl         ← Generado
    .bloom/intents/{name}/codebase.md       ← Generado
    .bloom/core/nucleus-config.json         ← Nucleus config
    .bloom/nucleus.json                     ← Link hijo → padre

---

## 12. Comandos y Configuración

### 12.1 package.json Completo

**Activation Events:**

    "activationEvents": [
      "onCommand:bloom.generateIntent",
      "onCommand:bloom.createNucleusProject",
      "onView:bloomNucleus",
      "onView:bloomNucleusWelcome",
      "onView:bloomIntents"
    ]

**Views Container:**

    "viewsContainers": {
      "activitybar": [
        {
          "id": "bloomAiBridge",
          "title": "Bloom Nucleus BTIPS",
          "icon": "$(flame)"
        }
      ]
    }

**Context Menus:**

    "menus": {
      "explorer/context": [
        {
          "command": "bloom.generateIntent",
          "when": "explorerResourceIsFolder || resourceScheme == file",
          "group": "bloom@1"
        },
        {
          "command": "bloom.addToIntent",
          "when": "explorerResourceIsFolder || resourceScheme == file",
          "group": "bloom@2"
        },
        {
          "command": "bloom.linkToNucleus",
          "when": "explorerResourceIsFolder",
          "group": "bloom@5"
        }
      ]
    }

**Keybindings:**

    "keybindings": [
      {
        "command": "bloom.createNucleusProject",
        "key": "ctrl+alt+n",
        "mac": "cmd+alt+n"
      },
      {
        "command": "bloom.openIntentInBrowser",
        "key": "ctrl+shift+b",
        "mac": "cmd+shift+b"
      }
    ]

### 12.2 Configuraciones de Usuario

**bloom.pythonPath**

    Tipo: string
    Default: "python3"
    Descripción: Path al ejecutable de Python para scripts

**bloom.useCustomCodebaseGenerator**

    Tipo: boolean
    Default: false
    Descripción: Usar script Python para generar codebase.md

**bloom.nucleusAutoDetect**

    Tipo: boolean
    Default: true
    Descripción: Detectar y mostrar Nucleus automáticamente

**bloom.autoUpdateTree**

    Tipo: boolean
    Default: true
    Descripción: Actualizar tree automáticamente

---

## 13. Testing y Validación

### 13.1 Escenarios de Test Críticos

**Test 1: Registro Inicial**

    1. Borrar globalState (bloom.user.v3)
    2. Reiniciar VSCode
    3. Verificar vista "Welcome" aparece
    4. Autenticar con GitHub
    5. Verificar allOrgs[] guardado correctamente
    6. Verificar cambio a Nucleus Tree

**Test 2: Crear Nucleus con Git Orchestration**

    1. Click "+ Agregar Nucleus"
    2. GitOrchestrator detecta estado
    3. Verificar script Python ejecutado
    4. Verificar estructura .bloom/ creada
    5. Verificar GitManager.stageAndOpenSCM() llamado
    6. Verificar SCM panel abierto
    7. Hacer commit + push manual
    8. Verificar workspace creado

**Test 3: Agregar Proyecto al Workspace**

    1. Con workspace abierto
    2. Click en proyecto en Nucleus Tree
    3. Verificar proyecto NO abre nueva ventana
    4. Verificar proyecto aparece en explorador
    5. Verificar .code-workspace actualizado
    6. Click nuevamente → Verificar solo enfoca

**Test 4: Estructura .bloom/ Automática**

    1. Clonar proyecto sin .bloom/
    2. Verificar ensureBloomStructure() ejecutado
    3. Verificar core/, project/, intents/ creados
    4. Verificar templates correctos por estrategia
    5. Clonar proyecto CON .bloom/
    6. Verificar estructura existente NO sobrescrita

**Test 5: Git Orchestration - 3 Casos**

    1. Caso 'none': Verificar creación + staging
    2. Caso 'remote': Verificar clonación + validación
    3. Caso 'both': Verificar vinculación + NO clonado

**Test 6: Desvincular Nucleus**

    1. Con Nucleus activo
    2. Click botón "Desvincular"
    3. Confirmar modal
    4. Verificar org removida de allOrgs
    5. Verificar carpetas cerradas
    6. Verificar vista "Welcome" aparece

### 13.2 Criterios de Éxito

Sistema Nucleus:

    ✅ Usuario puede crear múltiples Nucleus
    ✅ Cada Nucleus tiene su propia configuración
    ✅ Proyectos hijo se vinculan correctamente
    ✅ Tree View muestra jerarquía completa
    ✅ Desvincular funciona sin borrar repos

Sistema Workspace:

    ✅ .code-workspace se crea automáticamente
    ✅ Proyectos se agregan sin abrir nueva ventana
    ✅ Click en proyecto enfoca en explorador
    ✅ Workspace persiste entre sesiones
    ✅ Iconos por estrategia funcionan

Sistema Git Orchestration:

    ✅ Detecta estado local/remoto correctamente
    ✅ Crea/Clona/Vincula según caso
    ✅ Stage archivos correctamente
    ✅ SCM panel se abre automáticamente
    ✅ Commits son confirmables manualmente
    ✅ NUNCA hace push silencioso

Sistema BTIP:

    ✅ Usuario puede crear intent y reabrirlo
    ✅ Auto-save funciona cada 2s (incluye archivos)
    ✅ Usuario puede agregar/remover archivos dinámicamente
    ✅ Codebase.md se regenera con comandos explícitos
    ✅ Contador de tokens funciona correctamente
    ✅ TreeView no crashea si falta .bloom/intents/

---

## 14. Troubleshooting

### 14.1 Problemas Comunes

**Problema: Vista "Welcome" no aparece**

Solución:

- Verificar `bloom.isRegistered` context
- Ejecutar manualmente: `bloom.showWelcome`
- Borrar globalState y reiniciar

**Problema: Proyecto abre en nueva ventana**

Solución:

- Verificar que workspace sea multi-root
- Check que .code-workspace existe
- Verificar WorkspaceManager.addProjectToWorkspace() ejecutado
- Fallback manual: File → Add Folder to Workspace

**Problema: Git staging falla**

Solución:

- Verificar que es repo git válido (.git existe)
- Check permisos de escritura
- Verificar GitManager logs en Output panel
- Intentar stage manual desde terminal

**Problema: Python script no ejecuta**

Solución:

- Verificar `bloom.pythonPath` configuración
- Check que script existe en ubicación esperada
- Verificar fallback a generador nativo
- Revisar logs en Output panel

**Problema: Nucleus no detectado**

Solución:

- Verificar nucleus-config.json existe
- Check que type === 'nucleus'
- Verificar allOrgs[] en UserManager
- Ejecutar bloom.syncNucleusProjects

---

## 15. Roadmap y Mejoras Futuras

### 15.1 Features Planificados

**Fase 1 (Completado):**

    ✅ Sistema Nucleus multi-org
    ✅ Registro con GitHub OAuth
    ✅ BTIP con auto-save
    ✅ Gestión dinámica de archivos
    ✅ Chrome Profile Manager
    ✅ Multi-root workspace unificado
    ✅ Estructura .bloom/ automática
    ✅ Git Orchestration
    ✅ Desvincular Nucleus

**Fase 2 (Q1 2026):**

    🔲 Workflow completo con Claude AI
    🔲 Generación automática de preguntas
    🔲 Integración de snapshots
    🔲 Cross-project intents
    🔲 Dependency graph visualization
    🔲 "Levantar Nucleus existente" feature

**Fase 3 (Q2 2026):**

    🔲 Templates de Nucleus (startup, enterprise, OSS)
    🔲 Web dashboard generado desde Nucleus
    🔲 Health checks de proyectos vinculados
    🔲 Analytics de uso de intents
    🔲 Sincronización automática con GitHub
    🔲 Workspace profiles (dev, staging, prod)

### 15.2 Mejoras Técnicas

**Performance:**

- Cache de detección de estrategias
- Lazy loading de archivos grandes
- Optimización de regeneración de codebase
- Parallel processing de múltiples intents

**UX:**

- Drag & drop para agregar archivos
- Preview de intent.bl antes de generar
- Diff viewer para regeneraciones
- Atajos de teclado personalizables
- Quick actions en Nucleus Tree

**Integración:**

- Support para GitLab / Bitbucket
- Integración con Jira / Linear
- Export a PDF / Markdown
- API pública para extensiones

---

## 16. Referencias

### 16.1 Documentos Fuente

1. **bloom_unified_spec.md** - Especificación original v2.0
2. **Desvincular Nucleus (Unlink Nucleus).md** - Feature v1.0
3. **git-orchestration-impl.md** - Implementación Git
4. **BLOOM – Git Orchestration Plan.md** - Plan arquitectónico
5. **codebase.md** - Código fuente completo
6. **codebase_key_files.bl** - Snapshot consolidado de código clave para análisis por IA.

### 16.2 Código Fuente

Ubicación completa en "codebase_key_files.bl" (snapshot consolidado de código clave para indexación por IA). Este archivo contiene el código fuente real de los 14 archivos clave, con índice jerárquico y bloques Markdown para fácil parsing. Nota: Reemplaza cualquier referencia anterior a `codebase.md`; usa "codebase_key_files.bl" como fuente primaria.

Archivos clave (extraídos del snapshot en "codebase_key_files.bl"):
- `src/extension.ts` - Punto de entrada (refactorizado para delegar inicializaciones). Código completo en el snapshot bajo "### C:/repos/.../extension.ts".
- `src/initialization/commandRegistry.ts` - Registro de comandos. Código en snapshot.
- `src/initialization/providersInitializer.ts` - Inicialización de providers. Código en snapshot.
- `src/initialization/managersInitializer.ts` - Inicialización de managers. Código en snapshot.
- `src/core/gitOrchestrator.ts` - Git Orchestration. Código en snapshot.
- `src/core/nucleusManager.ts` - Gestión de Nucleus. Código en snapshot.
- `src/core/intentSession.ts` - Gestión de intents. Código en snapshot.
- `src/managers/userManager.ts` - Persistencia de usuario. Código en snapshot.
- `src/managers/workspaceManager.ts` - Multi-root workspace. Código en snapshot.
- `src/utils/gitManager.ts` - Git staging universal. Código en snapshot.
- `src/providers/nucleusTreeProvider.ts` - UI de Nucleus. Código en snapshot.
- `src/providers/intentTreeProvider.ts` - UI de intents. Código en snapshot.
- `src/commands/manageProject.ts` - CRUD de proyectos. Código en snapshot.

**Guía para IA**: Para acceder al código de cualquier archivo listado, referencia "codebase_key_files.bl" y busca la sección con el path correspondiente. Usa tools como code_execution para ejecutar o analizar snippets directamente del snapshot.

### 16.3 Enlaces Externos

**VSCode:**

- Multi-Root Workspaces: https://code.visualstudio.com/docs/editor/multi-root-workspaces
- Extension API: https://code.visualstudio.com/api

**GitHub:**

- OAuth Apps: https://docs.github.com/en/developers/apps/building-oauth-apps

**Anthropic:**

- Claude API: https://docs.anthropic.com

---

## 17. Conclusión

Bloom v2.1 integra cuatro sistemas poderosos:

1. **Nucleus** - Gestión organizacional con GitHub OAuth
2. **BTIP** - Gestión de intents técnicos con auto-save
3. **Git Orchestration** - Commits staged con confirmación explícita
4. **Workspace Unificado** - Navegación fluida sin ventanas múltiples

El código fuente clave está consolidado en 'codebase_key_files.bl' para facilitar el razonamiento y depuración por IA.

### Características Destacadas

**Git Orchestration:**

El sistema de Git Orchestration representa un avance crítico:

- Detecta automáticamente estado local/remoto
- Maneja 3 casos: crear, clonar, vincular
- TypeScript para Git, Python para generación
- Commits staged con confirmación manual
- NUNCA hace push silencioso

**Workspace Unificado:**

- Usa APIs nativas de VSCode
- Persistencia automática entre sesiones
- No interfiere con compilación por proyecto
- Sincronización bidireccional con archivo

**Desvincular Nucleus:**

- UX profesional y segura
- Permite cambiar rápidamente de organización
- Prepara para "Levantar Nucleus existente"
- Desarrollador puede probar flujos infinitas veces

**Versión:** 2.1.0  
**Última Actualización:** 29 de Noviembre de 2025  
**Mantenedor:** Bloom Development Team

---

*Para más información técnica detallada, consultar codebase.md con el código fuente completo.*