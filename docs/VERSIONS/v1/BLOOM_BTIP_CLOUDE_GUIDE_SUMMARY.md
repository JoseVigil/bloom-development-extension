# BLOOM SYSTEM - QUICK REFERENCE

---

## 🎯 SISTEMA DE 3 CAPAS

### LAYER 1: CORE (Inmutable)
**Propósito**: Reglas globales que NUNCA cambian
**Frecuencia de actualización**: Casi nunca
**Se sube a IA**: Siempre

    core/
    ├── .rules.bl          → Cómo debe responder la IA
    ├── .standards.bl      → Formatos de código obligatorios
    ├── .roles.bl          → Perspectivas que puede adoptar
    └── .tech-stack.bl     → Tecnologías del ecosistema

### LAYER 2: PROJECT (Semi-estático)
**Propósito**: Contexto del proyecto específico
**Frecuencia de actualización**: Semanal/mensual
**Se sube a IA**: Siempre

    project/
    ├── .requirements.bl   → Objetivos y scope del proyecto
    ├── .architecture.bl   → Diseño de sistema
    ├── .state.bl          → Estado actual, completado, bloqueado
    └── .dependencies.bl   → Qué usa este proyecto

### LAYER 3: INTENTS (Dinámico)
**Propósito**: Problema específico a resolver AHORA
**Frecuencia de actualización**: Por sesión (diario/múltiples por día)
**Se sube a IA**: Solo el intent activo

    intents/fix-bug-xyz.btip/
    ├── .intent.bl         → Problema concreto
    ├── .codebase.bl       → Solo archivos relevantes
    ├── .plan.bl           → Plan de acción (genera IA)
    └── .report.bl         → Qué se hizo y aprendido

---

## 📄 CONTENIDO DE CADA ARCHIVO

### CORE LAYER

#### `.rules.bl` (4KB)
- Meta-instrucciones obligatorias
- Protocols ante incertidumbre
- Formato de respuesta estructurada
- Prohibiciones absolutas (NUNCA placeholders)
- Task reframing rules
- Ejemplos de respuestas correctas vs incorrectas

#### `.standards.bl` (8KB)
- Code output format por lenguaje (TS, Python, Java, Swift)
- File modification protocol (cómo marcar cambios)
- Error handling standards
- Testing standards
- Documentation standards
- Prohibiciones repetidas (refuerzo crítico)

#### `.roles.bl` (5KB)
- SENIOR_ARCHITECT → Diseño de sistemas
- SENIOR_DEVELOPER → Implementación (default)
- CODE_REVIEWER → Review exhaustivo
- DEBUGGER → Investigación de bugs
- TEST_ENGINEER → Suite de tests
- TECHNICAL_WRITER → Documentación
- DEVOPS_ENGINEER → CI/CD e infra
- Ejemplos de respuesta por rol

#### `.tech-stack.bl` (6KB)
- Frontend: React, versions, libraries
- Backend: NestJS, Python, conventions
- Mobile: Android (Java), iOS (Swift)
- Databases: PostgreSQL, Redis, MongoDB
- DevOps: GitHub Actions, Docker, K8s
- Shared principles (security, performance, code style)

---

### PROJECT LAYER

#### `.requirements.bl` (5KB)
- Objective (2-3 párrafos)
- Scope (in/out)
- User stories con acceptance criteria
- User personas
- Business rules críticas
- Critical requirements (performance, security, scalability)
- Constraints (budget, timeline, technical)
- Success metrics

#### `.architecture.bl` (8KB)
- High-level design (diagrama Mermaid)
- Folder structure
- Critical components (responsibility, tech, dependencies)
- Data flow (diagramas de secuencia)
- Integration points (APIs externas)
- Database schema
- Security model (auth, encryption)
- Deployment architecture
- Monitoring & observability
- Testing strategy

#### `.state.bl` (4KB)
- Current phase (Discovery/Dev/Testing/Production)
- Completed features (con versiones)
- In progress (con % y ETA)
- Blocked issues (con workarounds)
- Technical debt (priorizado: High/Medium/Low)
- Known bugs
- Current metrics (coverage, performance)
- Next milestones
- Recent decisions

#### `.dependencies.bl` (5KB)
- Internal dependencies (otros proyectos internos)
- External dependencies (NPM, pip, maven, pods)
- Breaking changes to watch
- Dependency risks y mitigation
- Security updates history
- Update policy

---

### INTENTS LAYER

#### `.intent.bl` (3KB)
- Problem statement (2-3 líneas)
- Context (affected module, trigger, related issues)
- Current behavior
- Desired behavior
- Constraints
- Acceptance criteria (checklist)
- Role recommendation
- Related docs
- Reproduction steps (si es bug)
- Impact (severity, users affected, business)
- Initial hypotheses
- Estimated effort

#### `.codebase.bl` (Variable, max 20KB)
- Files included (5-10 archivos máximo)
- Por cada file:
  - Why included
  - Lines, last modified, size
  - **Contenido completo del archivo**
- Referenced but not included (con razones)
- Codebase stats
- Key observations

#### `.plan.bl` (2KB) - Generado por IA
- Analysis summary
- Approach selected
- Step-by-step plan
- Files to modify/create
- Tests to write
- Risks identified
- Estimated time breakdown

#### `.report.bl` (3KB) - Completado al cerrar intent
- What was done
- Files changed (con links a commits)
- Tests added
- Performance impact
- Known limitations
- Lessons learned
- Follow-up tasks

---

## `.manifest.json` (1KB)

    {
      "bloom_version": "1.0.0",
      "project_name": "elearning-platform",
      "project_type": "fullstack",
      "created_at": "2024-11-14T10:00:00Z",
      "tech_stack": ["nestjs", "react", "android", "ios"],
      "core_files": {
        "rules": "core/.rules.bl",
        "standards": "core/.standards.bl",
        "roles": "core/.roles.bl",
        "tech_stack": "core/.tech-stack.bl"
      },
      "project_files": {
        "requirements": "project/.requirements.bl",
        "architecture": "project/.architecture.bl",
        "state": "project/.state.bl",
        "dependencies": "project/.dependencies.bl"
      },
      "active_intents": [
        "intents/fix-race-condition.btip",
        "intents/payment-integration.btip"
      ],
      "archived_intents_count": 15,
      "last_updated": "2024-11-14T15:30:00Z"
    }

---

## 🚀 WORKFLOW EN 3 PASOS

### 1. SETUP (Una vez)

    bloom init my-project --stack nestjs-react-mobile
    # Genera .bloom/ con templates
    # Editas project/*.bl con tu info

### 2. INTENT (Por problema)

    bloom intent create
    # Describes problema
    # Seleccionas 5-10 archivos relevantes
    # Genera intents/problema-xyz.btip/

### 3. PUSH & ITERATE

    bloom push claude
    # Sube core/ + project/ + intent activo
    # IA responde siguiendo reglas
    # Si necesitas otra opinión: bloom push gpt

---

## 🎯 COMANDOS ESENCIALES

    # Inicializar proyecto
    bloom init <name> --stack <preset>
    
    # Crear intent
    bloom intent create [--interactive]
    
    # Gestionar archivos del intent
    bloom intent add src/file.ts
    bloom intent remove src/other.ts
    
    # Subir a IA
    bloom push claude|gpt|grok [--open]
    
    # Cerrar intent
    bloom intent close --success|--failed
    
    # Estado del proyecto
    bloom status
    bloom validate

---

## 📊 TAMAÑO DE ARCHIVOS (Típico)

    CORE LAYER:       ~25KB total (4 archivos)
    PROJECT LAYER:    ~25KB total (4 archivos)
    INTENT LAYER:     ~30KB total (1 intent activo)
    ────────────────────────────────────────────
    TOTAL POR SESIÓN: ~80KB (sin importar tamaño del proyecto)

---

## ✅ BENEFICIOS CLAVE

1. **Determinismo**: Mismo input = mismo output
2. **Portabilidad**: Funciona en Claude, GPT, Grok
3. **Sin alucinaciones**: Reglas explícitas y estrictas
4. **Contexto mínimo**: Solo lo necesario (~80KB)
5. **Git-friendly**: Todo versionado y diffeable
6. **Escalable**: Proyectos pequeños a enormes
7. **Velocidad**: Setup en minutos, no horas
8. **Reutilizable**: Templates entre proyectos

---

## 🔑 CONCEPTOS CLAVE

- **Intent (.btip)**: Unidad atómica de trabajo = 1 problema específico
- **Core**: Reglas inmutables del sistema BLOOM
- **Project**: Contexto semi-estático del proyecto actual
- **Codebase**: Snapshot de 5-10 archivos relevantes al intent
- **Push**: Subir contexto completo a IA vía API
- **Role**: Perspectiva que adopta la IA (Developer, Architect, etc.)

---

## 📋 CHECKLIST RÁPIDO

Antes de crear un intent:
- [ ] ¿Actualizaste project/.state.bl recientemente?
- [ ] ¿El problema es específico y acotado?
- [ ] ¿Identificaste los 5-10 archivos relevantes?
- [ ] ¿Sabes qué rol de IA necesitas?

Al recibir respuesta de IA:
- [ ] ¿Entregó archivos COMPLETOS sin placeholders?
- [ ] ¿Marcó claramente sus cambios?
- [ ] ¿Incluyó consideraciones y tests?
- [ ] ¿Respetó tus constraints?

Al cerrar intent:
- [ ] ¿Actualizaste .report.bl con lo aprendido?
- [ ] ¿Commiteaste cambios al proyecto?
- [ ] ¿Archivaste el intent si está resuelto?

---

## 🎓 CONVENCIONES DE NAMING

### Archivos CORE/PROJECT
Prefijo con punto: `.rules.bl`, `.standards.bl`
Razón: Ocultos en file explorers, menos clutter

### Carpetas de Intent
Formato: `<action>-<feature>-<identifier>.btip`
Ejemplos:
- `fix-race-condition-enrollments.btip`
- `add-payment-stripe-integration.btip`
- `refactor-video-processing-pipeline.btip`

### Extensiones
- `.bl`: BLOOM Language (Markdown files)
- `.btip`: BLOOM Task In Progress (carpeta de intent)
- `.json`: Metadata estructurada

---

## 🚨 REGLAS DE ORO

1. **Nunca subas todo el proyecto** → Solo core + project + intent activo
2. **Un intent = un problema** → Si son 3 cosas, crea 3 intents
3. **Máximo 10 archivos por intent** → Si necesitas más, divide el problema
4. **Core nunca cambia** → Si cambias reglas, versiona: .rules-v2.bl
5. **Actualiza .state.bl regular** → Cada sprint/milestone
6. **Archiva intents viejos** → No los borres, muévelos a archive/
7. **Valida antes de push** → `bloom validate` detecta errores

---

## 💡 TIPS PRO

- **Compara IAs**: Mismo intent, push a Claude y GPT, compara respuestas
- **Iteración inteligente**: Primero agota la IA actual, luego cambia
- **Roles híbridos**: "Actúa como ARCHITECT primero, luego como DEVELOPER"
- **Codebase incremental**: Empieza con 3 archivos, agrega más si necesitas
- **Aprende de reports**: Lee .report.bl de intents pasados antes de nuevos
- **Reutiliza intents**: Intent similar resuelto? Copia y adapta

---

## 📖 EJEMPLO RÁPIDO

    # Terminal
    cd mi-proyecto
    bloom init elearning --stack nestjs-react
    
    # VSCode: Editar project/*.bl con tu info
    
    # Encuentras bug
    bloom intent create
    > "API /enroll falla con 500 en concurrencia"
    > Seleccionas: enrollments.service.ts, enrollments.controller.ts
    > Rol: DEBUGGER
    
    # Sube a Claude
    bloom push claude --open
    
    # En Claude
    > "Analiza el race condition y usa row-level locking"
    
    # Claude responde con código completo
    # Copias, aplicas, testeas
    
    # Funciona!
    bloom intent close --success
    git commit -m "fix: race condition in enrollment"
    
    # Siguiente problema
    bloom intent create

---

**VERSION**: 1.0.0  
**MANTAINER**: BLOOM Community  
**LICENSE**: Open methodology

**NEXT STEPS**: 
1. Copia esta estructura a tu proyecto
2. Completa templates en project/
3. Crea tu primer intent
4. Push a tu IA favorita
5. ¡Desarrolla rampante! 🚀