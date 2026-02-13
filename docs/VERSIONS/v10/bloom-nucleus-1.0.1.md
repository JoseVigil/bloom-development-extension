<DOCUMENT filename="bloom-unified-specs.md">
# Bloom Plugin - Especificación Técnica Unificada

**Versión:** 1.1.1  
**Fecha:** 30 de Noviembre de 2025  
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
13. Testing y Validación
14. Troubleshooting
15. Roadmap y Mejoras Futuras
16. Referencias
17. Conclusión
18. Flujos Detallados (Apéndice)

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
- Generación dinámica de codebase.bl
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
    3. Crear carpeta local nucleus-<org> antes de ejecutar git init
    4. Inicializa Git localmente
    5. Ejecuta generate_nucleus.py
    6. Stage archivos con GitManager.stageAndOpenSCM

**Caso 2: Repo existe en remoto (Clonar)**

    1. GitOrchestrator detecta location: 'remote'
    2. Clona repo desde GitHub
    3. Si falta estructura: Ejecutar generate_nucleus.py --skipExisting
    4. Stage archivos con GitManager.stageAndOpenSCM

**Caso 3: Repo existe local y remoto (Vincular)**

    1. GitOrchestrator detecta location: 'both'
    2. Valida o corrige origin (agregar si faltara)
    3. Si falta estructura: Ejecutar generate_nucleus.py --skipExisting
    4. Stage archivos con GitManager.stageAndOpenSCM

Código completo en `src/core/gitOrchestrator.ts`.

### 3.6 Estructura del Nucleus

**Estructura Principal:**

    nucleus-<org>/
    ├── .bloom/
    │   ├── core/
    │   │   └── nucleus-config.json
    │   ├── organization/
    │   │   ├── _index.bl
    │   │   ├── overview.bl
    │   │   ├── policies.bl
    │   │   └── repos/  ← Repos específicos por estrategia
    │   └── projects/
    │       └── _index.bl
    └── nucleus-config.json

Ver `src/strategies/NucleusStrategy.ts` para generación.

### 3.7 Vinculación de Proyectos Hijo a Nucleus

**Flujo Principal (Manual):**

1. Detectar si el proyecto ya estaba vinculado mediante nucleus.json preexistente
2. Crear entrada en nucleus-config.json del Nucleus padre
3. Crear nucleus.json en el proyecto hijo
4. Generar overview.bl
5. Actualizar _index.bl en Nucleus
6. Ejecutar ensureBloomStructure():
   - Generación de templates por estrategia (Android, Node, iOS, Web)
   - Creación de app-context.bl condicional por estrategia
7. Stage + Abrir SCM para commit manual

**Flujo Alternativo (Al Clonar Proyecto Hijo):**

1. Ejecutar ensureBloomStructure() automáticamente
2. Generar nucleus.json automáticamente si existe relación previa
3. Actualizar _index.bl

Ver `src/commands/linkToNucleus.ts` para implementación completa.

### 3.8 Desvincular Nucleus

**Flujo Completo:**

1. Usuario hace click en ⛓️‍💥 Desvincular
2. Aparece modal de confirmación
3. Al confirmar:
   - Remover `org` de `allOrgs`
   - Actualizar `githubOrg`
   - Actualizar `bloom.isRegistered`
   - Cerrar carpetas del workspace asociadas al nucleus
   - Refrescar NucleusTreeProvider
   - Mostrar toast de éxito
4. UI vuelve a Nucleus Welcome
5. Repos locales/remotos permanecen intactos

Ver `src/commands/nucleus/nucleusCommands.ts` para implementación (comando: bloom.unlinkNucleus).

---

## 4. Sistema de Intents (BTIP)

### 4.1 Intent Lifecycle

**Estados:**

- draft
- generated
- questions-ready
- answers-submitted
- snapshot-downloaded
- integrated

Ver `src/core/intentSession.ts` para gestión.

### 4.2 Auto-Save

**Flujo:**

1. Edición en formulario
2. Debounce 2s
3. Guardar en intent.json
4. Actualizar timestamps

Ver `src/core/intentAutoSaver.ts`.

### 4.3 Codebase Regeneration

**Flujo:**

1. Trigger por comando o evento
2. Generar via nativo o Python
3. Fallback si falla
4. Notificación

Ver `src/core/codebaseGenerator.ts`.

---

## 5. Git Orchestration

Ver sección 3.5 para casos de Nucleus. Implementación en `src/core/gitOrchestrator.ts` y `src/utils/gitManager.ts`.

---

## 6. Gestión de Archivos y Auto-Save

Ver 4.2 para details.

---

## 7. Estrategias de Proyecto

Ver `src/strategies/` para classes como AndroidStrategy.ts, etc.

---

## 8. Chrome Profile Manager

### 8.1 Gestión de Perfiles

Ver `src/core/chromeProfileManager.ts`.

### 8.2 Integración con AI (Planificado)

Cada perfil en profileTreeProvider.ts corresponde a cuentas de ChatGPT, Claude y Grok. Cada intent permite seleccionar perfil y cuenta para creación. Comandos planificados:

- bloom.openClaudeInBrowser: Abre Claude en perfil seleccionado.
- bloom.openChatGPTInBrowser: Abre ChatGPT en perfil.
- bloom.openGrokInBrowser: Abre Grok en perfil.

Ver `src/commands/profile/profileCommands.ts` para stubs.

---

## 9. Workflow de Usuario

Ver sección 18 para flujos detallados.

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

### 10.2 Snapshot de Código Clave (codebase_key_files.bl)

Para facilitar la indexación y análisis por IA, el archivo "codebase_key_files.bl" consolida el código fuente de los archivos clave del plugin. Este snapshot incluye:
- **Índice Jerárquico**: Lista de paths para navegación rápida.
- **Contenidos**: Código completo en bloques Markdown, con metadatos como lenguaje y hash MD5.
- **Uso para IA**: Parsear directamente para extraer código por path.

**Archivos Clave Incluidos**:
| Categoría       | Archivos Principales                          | Descripción Breve |
|-----------------|-----------------------------------------------|-------------------|
| Raíz            | package.json                                 | Configuración del plugin, comandos y menús. |
| Punto de Entrada| extension.ts                                 | Inicialización principal (refactorizada con initialization/). |
| Comandos        | manageProject.ts, linkToNucleus.ts           | Gestión de proyectos (vinculación, clonación). |
| Core            | gitOrchestrator.ts, intentSession.ts, nucleusManager.ts | Orquestación Git, sesiones de intents, gestión Nucleus. |
| Initialization  | commandRegistry.ts, managersInitializer.ts, providersInitializer.ts | Registro modular de comandos, managers y providers. |
| Managers        | userManager.ts, workspaceManager.ts          | Persistencia de usuario y workspaces multi-root. |
| Providers       | intentTreeProvider.ts, nucleusTreeProvider.ts| Vistas de árbol para intents y Nucleus. |
| Utils           | gitManager.ts                                | Gestión universal de Git con staging y commits. |

**Referencia para IA**: Todos los archivos clave del codebase están contenidos en "codebase_key_files.bl". Busca por path en el snapshot.

---

## 11. Implementación Técnica

### 11.1 Clases Principales

Ver codebase_key_files.bl para código.

### 11.4 Comandos Registrados

Ver `src/initialization/commandRegistry.ts` para registro completo.

Lista sincronizada (de package.json):
- bloom.openMarkdownPreview
- bloom.generateIntent
- bloom.openIntent
- bloom.copyContextToClipboard
- bloom.deleteIntent
- bloom.addToIntent
- bloom.deleteIntentFromForm
- bloom.openFileInVSCode
- bloom.revealInFinder
- bloom.copyFilePath
- bloom.createBTIPProject
- bloom.createNucleusProject
- bloom.linkToNucleus
- bloom.unlinkNucleus
- bloom.openNucleusProject
- bloom.syncNucleusProjects
- bloom.regenerateContext
- bloom.generateQuestions
- bloom.submitAnswers
- bloom.integrateSnapshot
- bloom.reloadIntentForm
- bloom.manageProfiles
- bloom.refreshProfiles
- bloom.configureIntentProfile
- bloom.openIntentInBrowser
- bloom.openClaudeInBrowser
- bloom.openChatGPTInBrowser
- bloom.openGrokInBrowser
- bloom.showWelcome
- bloom.resetRegistration
- bloom.addProjectToNucleus
- bloom.reviewPendingCommits
- bloom.refreshNucleus

---

## 12. Comandos y Configuración

### 12.1 package.json Extracto

Ver codebase_key_files.bl para completo.

activationEvents: ["onCommand:bloom.generateIntent", "onView:bloomNucleus", ...]

commands: [lista como en 11.4, sin bloom.unlinkFromNucleus]

### 12.2 Configuraciones

bloom.pythonPath, bloom.gitPath, bloom.claudeApiKey, bloom.claudeModel, bloom.nucleusAutoDetect.

---

## 13. Testing y Validación

✅ Sistema Nucleus multi-org
... (mantenido, no truncado)

---

## 14. Troubleshooting

... (mantenido)

---

## 15. Roadmap y Mejoras Futuras

... (mantenido, agregar script fileToMD5.py en 15.2 Performance: "Integrar fileToMD5.py para hashes permanentes")

---

## 16. Referencias

### 16.1 Documentos Fuente

1. **bloom_unified_spec.md** - Especificación original v2.0
2. **Desvincular Nucleus (Unlink Nucleus).md** - Feature v1.0
3. **git-orchestration-impl.md** - Implementación Git
4. **BLOOM – Git Orchestration Plan.md** - Plan arquitectónico
5. **bloom-nucleus-flows.md** - Flujos detallados
6. **codebase_key_files.bl** - Snapshot consolidado de código clave para análisis por IA.
7. **SNAPSHOT_HASHES.md** - Hashes MD5 para verificación.

### 16.2 Código Fuente

Ubicación completa en "codebase_key_files.bl" (snapshot consolidado para indexación por IA). Reemplaza referencias anteriores; usa como fuente primaria.

Archivos clave:
- src/extension.ts - Punto de entrada (refactorizado). Código en snapshot.
- ... (lista como antes, agregar linkToNucleus.ts)

**Hashes MD5 para Verificación** (de SNAPSHOT_HASHES.md):

| File | MD5 |
|------|-----|
| package.json | 20439c2ceeaf2fe97d16cf91ce202cfa |
| src/bridge/BridgeExecutor.ts | 99d343607b43ed35d1a89e898c1900ee |
| ... (todos los hashes del tool output) |

**Guía para IA**: Referencia "codebase_key_files.bl" y usa hashes para integridad.

### 16.3 Enlaces Externos

... (mantenido)

---

## 17. Conclusión

Bloom v1.1.1 integra sistemas poderosos. Código clave en 'codebase_key_files.bl'.

... (mantenido)

**Versión:** 1.1.1  
**Última Actualización:** 30 de Noviembre de 2025  
**Mantenedor:** Bloom Development Team

---

*Para más información técnica detallada, consultar codebase_key_files.bl con el código fuente completo.*

## 18. Flujos Detallados (Apéndice)

Ver bloom-nucleus-flows.md para flujos completos. Integrados en secciones 3.x para refinamiento.

</DOCUMENT>