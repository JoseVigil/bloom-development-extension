# 📚 BTIPS Module Documentation Roadmap

**Objetivo:** Documentar cada componente de BTIPS de forma exhaustiva para que tanto humanos como IA puedan entender, desarrollar y mantener el sistema con total transparencia.

---

## 🎯 Estrategia de Documentación Modular

Cada módulo tendrá su propio documento técnico que cubre:

1. **Propósito & Responsabilidades** - ¿Qué hace este componente?
2. **Arquitectura Interna** - Estructura de carpetas, módulos clave
3. **CLI Reference** - Todos los comandos con ejemplos (extraídos de help.json/txt)
4. **Protocolos de Comunicación** - Cómo se comunica con otros componentes
5. **Flujos de Ejecución** - Diagramas de secuencia para operaciones clave
6. **Filesystem & Estado** - Qué archivos lee/escribe, dónde persiste datos
7. **Debugging & Troubleshooting** - Comandos de diagnóstico, errores comunes
8. **Development Guide** - Cómo compilar, testear, contribuir

---

## 📋 Módulos Priorizados (Orden de Desarrollo)

### **Fase 1: Governance & Security (COMPLETADO ✅)**
Estos documentos ya están creados y definen la base conceptual:

- [x] **BTIPS-SECURITY-COMPLIANCE.md** - Modelo de seguridad, Vault, audit trail
- [x] **BTIPS-TECHNICAL-OVERVIEW.md** - Mapa maestro, arquitectura general

---

### **Fase 2: Core Orchestration (PRIORITARIO)**

Estos son los componentes críticos que gobiernan la ejecución del sistema:

#### **1. BTIPS-MODULE-NUCLEUS.md** 🔴 ALTA PRIORIDAD
**Razón:** Nucleus es la autoridad máxima del sistema. Entenderlo es fundamental.

**Contenido:**
- Roles & Permissions (Master/Architect/Specialist)
- Alfred Governance System (health checks, audit, vault management)
- Temporal Orchestration (workflows, activities, worker control)
- Team Management (add/remove members, ACLs)
- Vault Authority (unlock, lock, key request flow)
- System Supervision (dev-start, health checks)
- CLI Reference Completo (todos los comandos de `nucleus_help.json`)

**Comandos clave a documentar:**
```bash
nucleus init --github-id master --master
nucleus alfred status --json
nucleus temporal start / stop / diagnostics
nucleus dev-start --simulation
nucleus vault-unlock / vault-lock
nucleus synapse launch profile_001
nucleus health --json --validate
```

**Archivos fuente:**
- `installer/nucleus/internal/governance/` - Alfred, ownership, audit
- `installer/nucleus/internal/orchestration/temporal/` - Temporal workflows
- `installer/nucleus/internal/vault/` - Vault management
- `nucleus_help.json` - Referencia completa de comandos

---

#### **2. BTIPS-MODULE-METAMORPH.md** 🟠 ALTA PRIORIDAD
**Razón:** Sistema de actualizaciones. Crítico para mantenimiento y deployment.

**Contenido:**
- Declarative State Reconciliation (filosofía)
- Manifest Structure & Validation
- Binary Interrogation Protocol (--info standard)
- Snapshot & Rollback System
- Atomic Update Flow
- Security Model (offline-only, trust boundary with Nucleus)
- CLI Reference Completo (todos los comandos de `metamorph_help.txt`)

**Comandos clave a documentar:**
```bash
metamorph inspect --json
metamorph status
metamorph generate-manifest
metamorph reconcile --manifest manifest.json
metamorph rollback
metamorph cleanup
```

**Flujos de ejecución críticos:**
1. Update Flow: Batcave → Nucleus → Metamorph → Binary Replacement
2. Rollback Flow: Failed update detection → Snapshot restoration
3. Inspection Flow: Metamorph interrogates all binaries → builds system state map

**Archivos fuente:**
- `installer/metamorph/internal/inspection/` - Binary interrogation
- `installer/metamorph/internal/reconciler/` - State convergence
- `installer/metamorph/internal/snapshot/` - Rollback management
- `metamorph_help.txt` - Referencia de comandos

---

#### **3. BTIPS-MODULE-SENTINEL.md** 🟡 MEDIA PRIORIDAD
**Razón:** Daemon persistente, Event Bus, orchestration de Chromium/Ollama/Temporal.

**Contenido:**
- Daemon Architecture (persistent background service)
- Event Bus Implementation (TCP server, message routing)
- Profile Lifecycle Management (launch, monitor, shutdown)
- Ollama FSM (Finite State Machine for Ollama supervision)
- Temporal Client Wrapper
- Bridge Mode (JSON-RPC with Conductor)
- CLI Reference Completo (todos los comandos de `sentinel_help.json`)

**Comandos clave a documentar:**
```bash
sentinel daemon --brain-addr 127.0.0.1:5678
sentinel launch profile_001 --mode landing
sentinel ollama start / stop / status / healthcheck
sentinel temporal start / stop / health
sentinel listen --filter profile_001 --json
sentinel poll --since 1707418080
sentinel send --type LAUNCH_PROFILE --profile-id profile_001
sentinel cockpit --health
```

**Flujos de ejecución críticos:**
1. Profile Launch: Sentinel → Chromium spawn → Extension injection → Synapse handshake
2. Event Bus Reconnection: TCP disconnect → exponential backoff → POLL_EVENTS
3. Ollama Supervision: Health checks → restart on failure → log tailing

**Archivos fuente:**
- `installer/sentinel/internal/orchestration/` - Profile/Chrome lifecycle
- `installer/sentinel/internal/bridge/` - JSON-RPC server
- `installer/sentinel/internal/ollama/` - Ollama FSM
- `installer/sentinel/internal/temporal/` - Temporal client
- `sentinel_help.json` - Referencia completa

---

### **Fase 3: Execution & Context (MEDIA PRIORIDAD)**

#### **4. BTIPS-MODULE-BRAIN.md** 🟡 MEDIA PRIORIDAD
**Razón:** Motor de ejecución de intents, context generation, Synapse server.

**Contenido:**
- Intent Execution Engine (dev, doc, exp, inf) — `cor` also listed here originally, deprecated 2026-09-02 by control, see AGENDA_MAESTRA.md §11
- Context Generation Strategies (Android, iOS, React, Nucleus, etc.)
- Profile Management (accounts, linked profiles)
- Synapse Protocol Server (Host ↔ Brain communication)
- Event Bus Client (Brain → Sentinel)
- Web Template Generation (Discovery & Landing pages)
- CLI Reference Completo (todos los comandos de Brain)

**Comandos clave a documentar:**
```bash
brain server  # TCP server on port 5678
brain intent create --type dev --project project-alpha
brain intent execute intent_001
brain profile launch profile_001
brain context generate --project-path /path/to/project
brain synapse handshake
```

**Flujos de ejecución críticos:**
1. Intent Execution: Parse → Plan → Execute → Validate → Finalize
2. Context Generation: Detect project type → Apply strategy → Build payload
3. Synapse Handshake: Extension connects → Host validates → Brain confirms

**Archivos fuente:**
- `installer/brain/core/intent/` - Intent execution
- `installer/brain/core/context/` - Context strategies
- `installer/brain/core/profile/` - Profile management
- `installer/brain/core/synapse/` - Synapse protocol
- `installer/brain/cli/` - All CLI commands

---

#### **5. BTIPS-MODULE-HOST.md** 🟢 BAJA PRIORIDAD
**Razón:** Bridge nativo, importante pero más simple que otros componentes.

**Contenido:**
- Native Messaging Protocol (Chrome ↔ Host)
- Synapse Protocol Handler (C++ implementation)
- Binary I/O (chunked buffer, message framing)
- Registry Integration (Windows Native Messaging Hosts)
- Logging System (synapse_logger)
- Build & Compilation (MinGW, cross-platform)

**Archivos fuente:**
- `installer/host/bloom-host.cpp` - Main entry point
- `installer/host/synapse_logger.cpp/h` - Logging
- `installer/host/chunked_buffer.cpp/h` - Binary protocol
- `installer/host/build.sh` - Build script

---

### **Fase 4: User Interfaces (BAJA PRIORIDAD)**

#### **6. BTIPS-MODULE-CONDUCTOR.md** 🟢 BAJA PRIORIDAD
**Razón:** UI para visualización, importante para UX pero no para core execution.

**Contenido:**
- Stateless UI Architecture (rehydration from filesystem)
- Event Bus Visualization
- Intent Editor (create, edit, coordinate)
- Vault Shield Display
- JSON-RPC Client (Conductor → Nucleus)
- Onboarding Flow

**Archivos fuente:**
- `installer/conductor/launcher/` - Main Electron app
- `installer/conductor/setup/` - Onboarding UI

---

#### **7. BTIPS-MODULE-CORTEX.md** 🟢 BAJA PRIORIDAD
**Razón:** Chrome extension, relevante para end-users pero arquitectura simple.

**Contenido:**
- Extension Manifest & Permissions
- Synapse Client (Extension → Host)
- Discovery Page (profile discovery UI)
- Landing Page (onboarding UI)
- Build Process (.blx packaging)

**Archivos fuente:**
- `installer/cortex/extension/` - Extension source
- `installer/cortex/build-cortex/` - Packaging script
- `installer/brain/core/profile/web/templates/` - Discovery/Landing

---

#### **8. BTIPS-MODULE-VSCODE-PLUGIN.md** 🟢 BAJA PRIORIDAD
**Razón:** IDE integration, importante para developers pero no core.

**Contenido:**
- Command Palette Integration
- Intent Form Webview
- Profile Manager Webview
- Context Collection
- Git Orchestration
- API Server (HTTP/WebSocket)

**Archivos fuente:**
- `src/commands/` - All VS Code commands
- `src/ui/` - Webview panels
- `src/server/` - API server
- `src/strategies/` - Project detection

---

### **Fase 5: Supporting Systems (OPCIONAL)**

#### **9. BTIPS-MODULE-BATCAVE.md** ⚪ OPCIONAL
**Razón:** Dynamic deployment, interno para Bloom team.

**Contenido:**
- Nucleus/Project Creation Logic
- Manifest Generation
- Deployment Orchestration

**Archivos fuente:**
- `installer/batcave/src/`

---

## 📝 Template de Documentación de Módulo

Para mantener consistencia, cada módulo seguirá este template:

```markdown
# 🔧 BTIPS Module: [COMPONENT_NAME]

## 📋 Overview
- **Purpose:** [One-line description]
- **Language:** [Go/Python/TypeScript/C++]
- **Location:** `installer/[component]/`
- **Dependencies:** [List of other modules it depends on]
- **Communication:** [Who it talks to in the hierarchy]

## 🏗️ Architecture
[Folder structure, key modules]

## 🎯 Core Responsibilities
[What this component does]

## 📡 Communication Protocols
[How it talks to other components]

## 💻 CLI Reference
[All commands with examples, extracted from help.json]

## 🔄 Execution Flows
[Sequence diagrams for key operations]

## 🗄️ Filesystem & State
[What files it reads/writes, persistence strategy]

## 🛠️ Development Guide
[How to build, test, debug]

## 🆘 Troubleshooting
[Common issues, debug commands]

## 📚 Related Documentation
[Links to other relevant docs]
```

---

## 🎯 Recomendación de Orden de Desarrollo

**Para máxima claridad del sistema:**

1. **BTIPS-MODULE-NUCLEUS.md** (ahora) - La autoridad máxima
2. **BTIPS-MODULE-METAMORPH.md** (ahora) - Sistema de actualizaciones
3. **BTIPS-MODULE-SENTINEL.md** (siguiente semana) - Orchestration daemon
4. **BTIPS-MODULE-BRAIN.md** (siguiente semana) - Execution engine
5. Resto según necesidad

**Para desarrollo con AI:**
- Los módulos 1-4 son **suficientes** para que una AI entienda el sistema completo
- Los módulos 5-8 son útiles pero no críticos
- El módulo 9 (Batcave) es interno y puede omitirse

---

## ✅ Checklist de Completitud por Módulo

Cada módulo se considera "completo" cuando tiene:

- [ ] Diagrama de arquitectura interna
- [ ] Todos los comandos CLI documentados con ejemplos
- [ ] Al menos 3 diagramas de secuencia de flujos clave
- [ ] Tabla de archivos de configuración/estado
- [ ] Sección de troubleshooting con 5+ problemas comunes
- [ ] Ejemplos de uso end-to-end (no solo comandos aislados)
- [ ] Cross-references a otros módulos relacionados

---

## 🚀 Próximos Pasos

**Acción Inmediata:**
1. Crear **BTIPS-MODULE-NUCLEUS.md** extrayendo info de `nucleus_help.json`
2. Crear **BTIPS-MODULE-METAMORPH.md** extrayendo info de `metamorph_help.txt`

**Luego:**
3. Validar que las AI puedan razonar sobre estos módulos
4. Iterar en Sentinel y Brain
5. Completar el resto según necesidad

---

*Plan creado: February 8, 2024*  
*Prioridad: Nucleus > Metamorph > Sentinel > Brain > Resto*  
*Template Version: 1.0*
