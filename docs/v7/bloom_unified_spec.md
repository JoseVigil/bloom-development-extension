# Bloom Plugin - Especificación Técnica Unificada

**Versión:** 2.0.0
**Fecha:** 22 de Noviembre de 2025
**Tipo de Proyecto:** VSCode Extension + Multi-Organization System

---

## Tabla de Contenidos

1. Resumen Ejecutivo
2. Arquitectura General
3. Sistema Nucleus (Multi-Organización)
4. Sistema de Intents (BTIP)
5. Gestión de Archivos y Auto-Save
6. Estrategias de Proyecto
7. Chrome Profile Manager
8. Workflow de Usuario
9. Estructura de Archivos
10. Implementación Técnica
11. Scripts Python
12. Comandos y Configuración

---

## 1. Resumen Ejecutivo

Bloom es un plugin de VSCode que integra dos sistemas complementarios:

**Sistema A: Nucleus (Organizacional)**
- Gestión multi-organización con autenticación GitHub OAuth
- Repositorios centralizados por organización con convención nucleus-<org>
- Documentación organizacional en archivos .bl
- Índice de proyectos técnicos vinculados

**Sistema B: BTIP (Technical Intent Packages)**
- Gestión de intents de desarrollo con ciclo de vida completo
- Auto-save inteligente con debounce de 2 segundos
- Generación dinámica de codebase.md
- Integración con Claude AI via Chrome profiles

**Características Clave:**
- Zero-config: experiencia tipo GitHub Copilot
- Multi-workspace: un usuario puede tener múltiples Nucleus
- Auto-detección: estrategias de proyecto detectadas automáticamente
- Persistencia: auto-save de drafts + gestión de estado

---

## 2. Arquitectura General

### 2.1 Componentes Principales

    Bloom Plugin
    ├── Nucleus System
    │   ├── OAuth GitHub
    │   ├── Multi-org Registry
    │   ├── Repository Management
    │   └── Organization Documentation
    │
    ├── BTIP System
    │   ├── Intent Lifecycle
    │   ├── Auto-Save Engine
    │   ├── Codebase Generator
    │   └── Workflow Manager
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
                    [Org 1]  [Org 2]  [Org 3]  [+ Agregar]
                       ↓        ↓        ↓
                   nucleus-1 nucleus-2 nucleus-3
                       ↓
                   Projects (Linked)
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

### 3.3 Gestión Multi-Nucleus

**Activity Bar → Vista "Nucleus":**

    [Organization 1]
      ├─ project-mobile
      ├─ project-backend
      └─ project-web
    
    [Organization 2]
      ├─ another-project
      └─ another-backend
    
    [+ Agregar otro Nucleus]

**Detección Automática:**

El plugin detecta Nucleus en:
1. Workspace actual (si contiene nucleus-config.json)
2. Proyectos hermanos (via nucleus.json link)
3. Parent directory (búsqueda recursiva limitada)

Ver `src/providers/nucleusTreeProvider.ts` para implementación.

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

### 3.5 Creación de Nucleus

**3 Casos de Uso:**

**Caso 1: Repo no existe (Crear Nuevo)**

    1. Plugin crea repo en GitHub via API
    2. Clona localmente en carpeta sugerida
    3. Genera estructura .bloom/
    4. Abre en nueva ventana (opcional)

**Caso 2: Repo existe en GitHub (Clonar)**

    1. Plugin detecta existencia via API
    2. Clona en carpeta local elegida
    3. Linkea en UserManager

**Caso 3: Repo existe local + GitHub (Linkear)**

    1. Plugin verifica .git/config
    2. Valida remote origin
    3. Solo guarda en registry

Ver `src/core/nucleusManager.ts` para lógica de gestión.

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

### 3.7 Vinculación de Proyectos Hijo

**Comando:** bloom.linkToNucleus

**Flujo:**

    1. Usuario abre proyecto BTIP
    2. Click derecho → "Link to Nucleus"
    3. Plugin busca Nucleus en parent directory
    4. Usuario confirma vinculación
    5. Plugin crea:
       a. LinkedProject en nucleus-config.json
       b. nucleus.json en proyecto hijo
       c. overview.bl en Nucleus
       d. Actualiza _index.bl

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

## 5. Gestión de Archivos y Auto-Save

### 5.1 IntentSession

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

### 5.2 Sincronización Multi-Fuente

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

### 5.3 Auto-Save Detallado

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

### 5.4 Botón Delete Intent

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

## 6. Estrategias de Proyecto

### 6.1 Sistema de Detección

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

### 6.2 Estrategia Nucleus

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

### 6.3 Tabla de Estrategias

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

## 7. Chrome Profile Manager

### 7.1 Concepto

Permite asociar un Chrome profile específico a cada intent para:
- Mantener sesiones de Claude.ai separadas
- Evitar mezclar conversaciones
- Automatizar apertura en navegador

### 7.2 Configuración de Profile

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

### 7.3 Comandos

    bloom.manageProfiles        → Abrir panel de gestión
    bloom.configureIntentProfile → Asignar profile a intent
    bloom.openIntentInBrowser   → Abrir Claude con profile

Ver `src/core/chromeProfileManager.ts` y `src/providers/profileTreeProvider.ts`.

---

## 8. Workflow de Usuario

### 8.1 Flujo Completo (Primera Vez)

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
       a. Crea repo nucleus-<org>
       b. Clona localmente
       c. Guarda allOrgs[]
       ↓
    7. Activity Bar → Vista "Nucleus"
       [Organization X]
         └─ [+ Agregar proyecto]
       [+ Agregar otro Nucleus]

### 8.2 Crear Intent Nuevo

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

### 8.3 Agregar Archivos a Intent Existente

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

### 8.4 Remover Archivo desde Formulario

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

### 8.5 Regenerar Intent

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

---

## 9. Estructura de Archivos

### 9.1 Plugin Tree

    bloom-development-extension/
    ├── src/
    │   ├── commands/
    │   │   ├── generateIntent.ts
    │   │   ├── addToIntent.ts
    │   │   ├── deleteIntentFromForm.ts
    │   │   ├── createNucleusProject.ts
    │   │   ├── linkToNucleus.ts
    │   │   └── [otros...]
    │   ├── core/
    │   │   ├── nucleusManager.ts
    │   │   ├── intentSession.ts
    │   │   ├── intentAutoSaver.ts
    │   │   ├── metadataManager.ts
    │   │   ├── codebaseGenerator.ts
    │   │   └── chromeProfileManager.ts
    │   ├── managers/
    │   │   └── userManager.ts
    │   ├── models/
    │   │   ├── bloomConfig.ts
    │   │   └── intent.ts
    │   ├── providers/
    │   │   ├── nucleusTreeProvider.ts
    │   │   ├── intentTreeProvider.ts
    │   │   └── profileTreeProvider.ts
    │   ├── strategies/
    │   │   ├── ProjectDetector.ts
    │   │   ├── NucleusStrategy.ts
    │   │   ├── AndroidStrategy.ts
    │   │   └── [otros...]
    │   ├── ui/
    │   │   ├── intent/
    │   │   │   ├── intentFormPanel.ts
    │   │   │   ├── intentForm.html
    │   │   │   ├── intentForm.css
    │   │   │   └── intentForm.js
    │   │   ├── nucleus/
    │   │   │   └── NucleusSetupPanel.ts
    │   │   └── welcome/
    │   │       └── welcomeView.ts
    │   ├── utils/
    │   │   ├── githubOAuth.ts
    │   │   └── tokenEstimator.ts
    │   └── extension.ts
    └── package.json

### 9.2 Proyecto BTIP Completo

    bloom-video-server/
    ├── .bloom/
    │   ├── core/
    │   │   ├── .rules.bl
    │   │   ├── .standards.bl
    │   │   └── .prompt.bl
    │   ├── project/
    │   │   ├── .context.bl
    │   │   └── .app-context.bl
    │   ├── intents/
    │   │   ├── fix_login_bug/
    │   │   │   ├── intent.json
    │   │   │   ├── intent.bl
    │   │   │   └── codebase.md
    │   │   └── add_payment/
    │   │       └── [...]
    │   └── nucleus.json         ← Link a Nucleus padre
    └── [código fuente...]

### 9.3 Proyecto Nucleus Completo

    nucleus-josevigil/
    ├── .bloom/
    │   ├── core/
    │   │   ├── nucleus-config.json
    │   │   ├── .rules.bl
    │   │   └── .prompt.bl
    │   ├── organization/
    │   │   ├── .organization.bl
    │   │   ├── about.bl
    │   │   ├── business-model.bl
    │   │   ├── policies.bl
    │   │   └── protocols.bl
    │   └── projects/
    │       ├── _index.bl
    │       ├── bloom-video-server/
    │       │   └── overview.bl
    │       └── bloom-mobile/
    │           └── overview.bl
    └── README.md

---

## 10. Implementación Técnica

### 10.1 Interfaces TypeScript Clave

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

**IntentWorkflow (intent.ts):**

    interface IntentWorkflow {
      stage: 'draft' | 'intent-generated' | 'questions-ready' | 
             'answers-submitted' | 'snapshot-downloaded' | 'integrated';
      questions: Question[];
      questionsArtifactUrl?: string;
      snapshotPath?: string;
      integrationStatus: 'pending' | 'in-progress' | 'success' | 'failed';
    }

Ver `codebase.md` sección de modelos para todas las interfaces.

### 10.2 Clases Principales

**IntentSession**

Ubicación: `src/core/intentSession.ts`

Métodos principales:

    - create(folder, workspace, files, ...) → Promise<IntentSession>
    - forIntent(name, workspace, ...) → Promise<IntentSession>
    - addFiles(files[]) → Promise<void>
    - removeFile(path) → Promise<void>
    - generateIntent(formData) → Promise<void>
    - regenerateIntent(formData) → Promise<void>
    - queueAutoSave(updates) → void
    - changeStatus(status) → Promise<void>
    - deleteIntent() → Promise<void>
    - getState() → IntentState

**NucleusManager**

Ubicación: `src/core/nucleusManager.ts`

Métodos principales:

    - createOrLinkNucleus(org, localPath, isNew) → Promise<string>
    - detectExistingNucleus() → Promise<string | null>

**UserManager**

Ubicación: `src/managers/userManager.ts`

Métodos principales:

    - static init(context) → UserManager
    - getUser() → BloomUser | null
    - saveUser(data) → Promise<void>
    - isRegistered() → boolean
    - clear() → Promise<void>

### 10.3 Providers

**NucleusTreeProvider**

Ubicación: `src/providers/nucleusTreeProvider.ts`

Funcionalidad:
- Detecta todos los Nucleus de allOrgs[]
- Muestra árbol colapsable por organización
- Maneja botón "+ Agregar otro Nucleus"
- Exporta openNucleusProject()

**IntentTreeProvider**

Ubicación: `src/providers/intentTreeProvider.ts`

Funcionalidad:
- Agrupa intents por status
- Muestra 3 grupos: In Progress, Completed, Archived
- Permite click para abrir intent
- Expone getIntents() para nesting en Nucleus

### 10.4 Comandos Registrados

**Comandos Nucleus:**

    bloom.createNucleusProject    → Crear nuevo Nucleus
    bloom.linkToNucleus           → Vincular proyecto hijo
    bloom.openNucleusProject      → Abrir proyecto vinculado
    bloom.syncNucleusProjects     → Refrescar tree
    bloom.createNewNucleus        → Abrir panel de setup

**Comandos Intent:**

    bloom.generateIntent          → Crear nuevo intent
    bloom.openIntent              → Abrir intent existente
    bloom.addToIntent             → Agregar archivos
    bloom.deleteIntentFromForm    → Eliminar intent desde form
    bloom.openFileInVSCode        → Abrir archivo en editor
    bloom.revealInFinder          → Mostrar en explorador
    bloom.copyFilePath            → Copiar path completo

**Comandos Profile:**

    bloom.manageProfiles          → Panel de gestión
    bloom.configureIntentProfile  → Asignar profile a intent
    bloom.openIntentInBrowser     → Abrir Claude con profile

Ver `src/extension.ts` para registro completo.

### 10.5 Persistencia y Estado

**GlobalState (UserManager):**

Clave: `bloom.user.v3`

    {
      githubUsername: "josevigil",
      githubOrg: "josevigil",
      allOrgs: ["josevigil", "bloom", "acme"],
      registeredAt: 1700000000000
    }

**WorkspaceState:**

No utilizado actualmente. Todo en archivos locales.

**FileSystem:**

    .bloom/intents/{name}/intent.json       ← Metadata principal
    .bloom/intents/{name}/intent.bl         ← Generado
    .bloom/intents/{name}/codebase.md       ← Generado
    .bloom/core/nucleus-config.json         ← Nucleus config
    .bloom/nucleus.json                     ← Link hijo → padre

---

## 11. Scripts Python

### 11.1 generate_project_context.py

**Propósito:** Generar contexto de proyecto para diferentes estrategias.

**Uso:**

    python generate_project_context.py --strategy=android --output=.bloom/project/

**Estrategias Soportadas:**

    - android
    - ios
    - react-web
    - node
    - python-flask
    - php-laravel
    - nucleus
    - generic

**Para Nucleus:**

El script debe incluir una clase `NucleusAnalyzer` que:
- Detecta organización desde .git/config
- Escanea proyectos hermanos
- Genera documentación organizacional
- Crea templates de archivos .bl

Ver `bloom-nucleus-spec.md` para código Python completo.

### 11.2 generate_nucleus.py

**Propósito:** Crear estructura completa de Nucleus.

**Uso:**

    python generate_nucleus.py --org="JoseVigil" 
                               --root="/path/to/nucleus-josevigil" 
                               --output=".bloom"
                               --url="https://github.com/JoseVigil"

**Funcionalidad:**

1. Crea directorios .bloom/core/, organization/, projects/
2. Genera nucleus-config.json
3. Crea templates de .rules.bl, .prompt.bl
4. Genera archivos de organización
5. Crea _index.bl inicial

**Output:**

    nucleus-josevigil/.bloom/
    ├── core/
    │   ├── nucleus-config.json   ← Generado
    │   ├── .rules.bl             ← Template
    │   └── .prompt.bl            ← Template
    ├── organization/
    │   ├── .organization.bl      ← Template
    │   ├── about.bl              ← Template
    │   ├── business-model.bl     ← Template
    │   ├── policies.bl           ← Template
    │   └── protocols.bl          ← Template
    └── projects/
        └── _index.bl             ← Generado

Ver `src/commands/createNucleusProject.ts` para integración.

### 11.3 generate_codebase.py (Opcional)

**Propósito:** Generar codebase.md con estrategias avanzadas.

**Ubicación:** `.bloom/scripts/generate_codebase.py`

**Configuración VSCode:**

    "bloom.useCustomCodebaseGenerator": true

**Ventajas:**

- Iteración rápida de estrategias
- Experimentación con formatos
- Procesamiento avanzado de archivos

**Fallback:**

Si el script falla o no existe, el plugin usa generador nativo TypeScript.

Ver `src/core/codebaseGenerator.ts` método `tryPythonGeneration()`.

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

**Views:**

    "views": {
      "bloomAiBridge": [
        {
          "id": "bloomProfiles",
          "name": "Chrome Profiles"
        },
        {
          "id": "bloomNucleusWelcome",
          "name": "Nucleus",
          "when": "!bloom.isRegistered"
        },
        {
          "id": "bloomNucleus",
          "name": "Nucleus",
          "when": "bloom.isRegistered"
        },
        {
          "id": "bloomIntents",
          "name": "Intents"
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

## 13. Flujos de Integración

### 13.1 Flujo Completo: Desde Zero hasta Intent en Claude

**Paso 1: Instalación y Registro**

    1. Instalar plugin desde Marketplace
    2. Abrir VSCode
    3. Vista "Welcome" aparece automáticamente
    4. Click "Conectar con GitHub"
    5. Autorizar OAuth (scopes: repo, read:org, user:email)
    6. Plugin obtiene user.login y user.orgs[]
    7. UserManager guarda en globalState
    8. Vista cambia a "Nucleus Tree"

**Paso 2: Crear Primer Nucleus**

    1. Activity Bar → Bloom icon
    2. Vista muestra: [+ Agregar Nucleus]
    3. Click "+" → Panel de setup
    4. Seleccionar organización (dropdown)
    5. Elegir carpeta local
    6. Plugin ejecuta generate_nucleus.py
    7. Crea estructura completa
    8. Abre carpeta en nueva ventana (opcional)

**Paso 3: Vincular Proyecto Existente**

    1. Abrir proyecto técnico (ej: bloom-video-server)
    2. Click derecho en root
    3. "Bloom: Link to Nucleus"
    4. Plugin busca Nucleus en parent dir
    5. Confirmar vinculación
    6. Plugin crea:
       - LinkedProject en nucleus-config.json
       - nucleus.json en proyecto
       - overview.bl en Nucleus
    7. Proyecto aparece en Nucleus Tree

**Paso 4: Crear Intent**

    1. Seleccionar archivos relevantes en Explorer
    2. Click derecho → "Generate New Intent"
    3. Formulario se abre pre-llenado
    4. Escribir nombre: "fix_login_bug"
    5. Auto-save cada 2s (draft mode)
    6. Llenar problema y comportamientos
    7. Token counter muestra: 45% (verde)
    8. Click "Generar Intent"
    9. Plugin genera intent.bl + codebase.md
    10. Status cambia a 'generated'

**Paso 5: Configurar Chrome Profile**

    1. Click derecho en intent → "Configure Profile"
    2. Panel muestra profiles detectados
    3. Seleccionar "Profile 1"
    4. Asignar provider: Claude
    5. Guardar configuración

**Paso 6: Abrir en Claude**

    1. Click derecho en intent → "Open in Browser"
    2. Plugin abre Chrome con profile específico
    3. Navega a claude.ai
    4. Usuario copia intent.bl + codebase.md
    5. Pega en Claude y comienza conversación

**Paso 7: Workflow Avanzado (Futuro)**

    1. Claude genera preguntas → artifact
    2. Plugin detecta artifact y descarga
    3. Usuario responde preguntas en VSCode
    4. Plugin envía respuestas a Claude
    5. Claude genera snapshot de código
    6. Plugin descarga e integra snapshot
    7. Status cambia a 'integrated'

### 13.2 Flujo: Multi-Org Switching

**Escenario:** Usuario trabaja en 3 organizaciones

    1. Activity Bar → Nucleus Tree muestra:
       [JoseVigil Personal]
         ├─ bloom-video-server
         └─ bloom-mobile
       
       [Bloom Organization]
         ├─ bloom-core
         └─ bloom-api
       
       [Acme Corp]
         ├─ acme-backend
         └─ acme-frontend
       
       [+ Agregar otro Nucleus]
    
    2. Usuario expande "Bloom Organization"
    3. Click en "bloom-core"
    4. Proyecto se abre en nueva ventana
    5. Plugin detecta Nucleus padre
    6. Tree View actualiza contexto

### 13.3 Flujo: Regeneración con Archivos Nuevos

**Escenario:** Intent existente necesita más archivos

    1. Usuario abre Explorer
    2. Selecciona 3 archivos nuevos
    3. Click derecho → "Add to Intent" → fix_login_bug
    4. Plugin ejecuta IntentSession.addFiles():
       a. Agrega paths a intent.json
       b. Regenera codebase.md (incluye nuevos archivos)
       c. Recalcula tokens (ahora 68%)
       d. Emite evento 'filesChanged'
    5. Si formulario abierto:
       - File pills se re-renderizan
       - Token counter actualiza
       - Indicador: "💾 3 archivos agregados"
    6. Usuario abre intent.bl (status sigue 'generated')
    7. Click "Regenerar Intent"
    8. Plugin regenera intent.bl + codebase.md
    9. Notificación: "Intent regenerado"

---

## 14. Testing y Validación

### 14.1 Escenarios de Test

**Test 1: Registro Inicial**

    1. Borrar globalState (bloom.user.v3)
    2. Reiniciar VSCode
    3. Verificar vista "Welcome" aparece
    4. Autenticar con GitHub
    5. Verificar allOrgs[] guardado correctamente
    6. Verificar cambio a Nucleus Tree

**Test 2: Crear Nucleus**

    1. Click "+ Agregar Nucleus"
    2. Verificar script Python ejecutado
    3. Verificar estructura .bloom/ creada
    4. Verificar nucleus-config.json válido
    5. Verificar templates .bl generados

**Test 3: Auto-Save**

    1. Crear nuevo intent
    2. Escribir en campo "problem"
    3. Esperar 2 segundos
    4. Verificar intent.json actualizado
    5. Verificar content.lastSaved actualizado
    6. Repetir con archivos agregados

**Test 4: Token Limit**

    1. Crear intent con 200 archivos
    2. Verificar token counter > 100%
    3. Verificar botón "Generar" disabled
    4. Remover archivos hasta 70%
    5. Verificar botón habilitado

**Test 5: Link to Nucleus**

    1. Crear Nucleus vacío
    2. Abrir proyecto hijo
    3. Ejecutar "Link to Nucleus"
    4. Verificar nucleus.json creado
    5. Verificar LinkedProject en config
    6. Verificar overview.bl generado
    7. Verificar _index.bl actualizado

### 14.2 Criterios de Éxito

Sistema Nucleus:

    ✅ Usuario puede crear múltiples Nucleus
    ✅ Cada Nucleus tiene su propia configuración
    ✅ Proyectos hijo se vinculan correctamente
    ✅ Tree View muestra jerarquía completa
    ✅ Botón "+" siempre visible

Sistema BTIP:

    ✅ Usuario puede crear intent y reabrirlo
    ✅ Auto-save funciona cada 2s (incluye archivos)
    ✅ Usuario puede agregar/remover archivos dinámicamente
    ✅ Codebase.md se regenera con comandos explícitos
    ✅ Contador de tokens funciona correctamente
    ✅ TreeView muestra 3 grupos (In Progress/Completed/Archived)
    ✅ Archivos se abren en VSCode al click
    ✅ Path completo se copia al clipboard
    ✅ Botón "Delete" elimina intent con confirmación

Integración:

    ✅ Scripts Python funcionan (con fallback)
    ✅ Chrome Profile Manager asigna profiles
    ✅ Estrategias detectan correctamente tipo de proyecto
    ✅ GitHub OAuth funciona sin errores

---

## 15. Troubleshooting

### 15.1 Problemas Comunes

**Problema: Vista "Welcome" no aparece**

Solución:
- Verificar `bloom.isRegistered` context
- Ejecutar manualmente: `bloom.showWelcome`
- Borrar globalState y reiniciar

**Problema: Auto-save no funciona**

Solución:
- Verificar debounce timer (2s)
- Check console para errores de escritura
- Verificar permisos en .bloom/intents/

**Problema: Token counter incorrecto**

Solución:
- Verificar cálculo: totalChars / 4
- Check que todos los archivos se leen
- Revisar errores en TokenEstimator

**Problema: Script Python falla**

Solución:
- Verificar `bloom.pythonPath` configuración
- Check que script existe en .bloom/scripts/
- Verificar fallback a generador nativo
- Revisar logs en Output panel

**Problema: Nucleus no detectado**

Solución:
- Verificar nucleus-config.json existe
- Check que type === 'nucleus'
- Verificar ProjectDetector prioridad
- Revisar allOrgs[] en UserManager

### 15.2 Logs y Debug

**Logger:**

    const logger = new Logger();
    logger.info('Mensaje informativo');
    logger.warn('Advertencia');
    logger.error('Error', error);

**Output Panel:**

    Bloom BTIP → Output
    
    [INFO] Ejecutando comando: Generate Intent
    [INFO] Archivos seleccionados: 5
    [INFO] Intent generado exitosamente

**Console:**

    Developer Tools → Console
    
    Extension "bloom-btip-plugin" activated
    IntentSession created for: fix_login_bug
    Auto-save queued (2000ms)

---

## 16. Roadmap y Futuras Mejoras

### 16.1 Features Planificados

**Fase 1 (Completado):**

    ✅ Sistema Nucleus multi-org
    ✅ Registro con GitHub OAuth
    ✅ BTIP con auto-save
    ✅ Gestión dinámica de archivos
    ✅ Chrome Profile Manager

**Fase 2 (Q1 2026):**

    🔲 Workflow completo con Claude AI
    🔲 Generación automática de preguntas
    🔲 Integración de snapshots
    🔲 Cross-project intents
    🔲 Dependency graph visualization

**Fase 3 (Q2 2026):**

    🔲 Templates de Nucleus (startup, enterprise, OSS)
    🔲 Web dashboard generado desde Nucleus
    🔲 Bulk import de proyectos existentes
    🔲 Health checks de proyectos vinculados
    🔲 Analytics de uso de intents

### 16.2 Mejoras Técnicas

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

**Integración:**

    - Support para GitLab / Bitbucket
    - Integración con Jira / Linear
    - Export a PDF / Markdown
    - API pública para extensiones

---

## 17. Referencias

### 17.1 Documentos Originales

1. **bloom_nucleus_manage.md** - Flujo de registro y multi-org
2. **bloom-nucleus-spec.md** - Estructura de documentación organizacional
3. **nucleus_implementation_guide.md** - Guía práctica de implementación
4. **bloom-lifecycle-updated.md** - Ciclo de vida de intents y auto-save

### 17.2 Código Fuente

Ubicación completa en `codebase.md` con 29 archivos procesados.

Archivos clave:
- `src/extension.ts` - Punto de entrada
- `src/core/nucleusManager.ts` - Gestión de Nucleus
- `src/core/intentSession.ts` - Gestión de intents
- `src/managers/userManager.ts` - Persistencia de usuario
- `src/providers/nucleusTreeProvider.ts` - UI de Nucleus
- `src/providers/intentTreeProvider.ts` - UI de intents

### 17.3 Enlaces Externos

**GitHub:**
- Repositorio principal: (definir URL)
- Issues & Discussions: (definir URL)

**Documentación API:**
- GitHub OAuth: https://docs.github.com/en/developers/apps/building-oauth-apps
- VSCode Extension API: https://code.visualstudio.com/api

**Anthropic:**
- Claude API: https://docs.anthropic.com

---

## 18. Apéndices

### 18.1 Glosario

**Nucleus:** Proyecto organizacional que documenta y vincula proyectos técnicos.

**BTIP:** Bloom Technical Intent Package - Sistema de gestión de intents de desarrollo.

**Intent:** Documento estructurado que describe un problema técnico y su solución esperada.

**Estrategia:** Tipo de proyecto detectado (android, ios, node, etc.) que determina cómo se procesa el código.

**Auto-Save:** Sistema de persistencia automática con debounce de 2 segundos.

**Codebase:** Archivo markdown que consolida código relevante para un intent.

**Profile:** Perfil de Chrome asociado a un intent para mantener sesiones separadas.

**allOrgs:** Array que contiene todas las organizaciones GitHub del usuario.

### 18.2 Convenciones de Código

**Naming:**
- Clases: PascalCase
- Funciones: camelCase
- Constantes: UPPER_SNAKE_CASE
- Archivos: camelCase.ts
- Interfaces: PascalCase (sin prefijo I)

**Estructura:**
- Imports organizados por grupos
- Exports explícitos al final
- Comentarios JSDoc para funciones públicas
- Error handling con try/catch

**TypeScript:**
- Strict mode habilitado
- No any (usar unknown)
- Interfaces sobre types
- Async/await sobre Promises

### 18.3 Contribución

**Para contribuir al plugin:**

1. Fork del repositorio
2. Crear branch feature/nombre-feature
3. Escribir tests para nuevas funcionalidades
4. Mantener cobertura de tests > 80%
5. Actualizar documentación
6. Crear Pull Request con descripción detallada

**Guidelines:**
- Seguir convenciones de código
- No romper tests existentes
- Actualizar CHANGELOG.md
- Agregar ejemplos en docs/

---

## 19. Conclusión

Bloom es un plugin de VSCode que unifica dos sistemas poderosos:

1. **Nucleus** - Para gestión organizacional con GitHub OAuth y multi-org
2. **BTIP** - Para gestión de intents técnicos con auto-save y workflow completo

La arquitectura modular permite:
- Detección automática de estrategias
- Persistencia inteligente con auto-save
- Integración con Claude AI via Chrome profiles
- Zero-config user experience

El sistema está diseñado para escalar desde desarrolladores individuales hasta organizaciones con múltiples proyectos y equipos.

**Versión:** 2.0.0
**Última Actualización:** 22 de Noviembre de 2025
**Mantenedor:** Bloom Development Team

---

*Para más información, consultar codebase.md con el código fuente completo.*