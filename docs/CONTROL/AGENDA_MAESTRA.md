# BTIPS / Cognituum — Agenda Maestra

**Propósito:** fuente única de control y coordinación de los frentes activos. Esta agenda no sustituye las fuentes técnicas de cada tema: registra su estado consolidado, dependencias, próximos pasos y decisiones vigentes.

**Fecha de creación:** 2026-08-15  
**Canal de actualización:** únicamente esta sesión de control.

---

## Reglas de control

- El usuario y esta sesión son los únicos canales de escritura de este archivo. Las sesiones externas (Claude Web, Cowork, Claude Code u otras instancias de Codex) no lo editan directamente.
- Cada avance externo se incorpora aquí solo después de que el usuario lo reporte en esta sesión. Así se evita el conflicto entre contextos y versiones no compartidos.
- Esta agenda coordina y deriva trabajo; no implementa soluciones técnicas ni reemplaza los documentos fuente.
- Cuando una fuente antigua contradice una decisión posterior confirmada, se conserva como deuda documental a corregir. No se la trata como una decisión abierta.
- El BTIPS v6.0 es contexto general; los documentos específicos y posteriores prevalecen para el estado de cada frente.

## Decisiones transversales vigentes

| Decisión | Estado | Consecuencia de coordinación |
|---|---|---|
| AITAP es Gateway + Vault por referencia + Accounting | Cerrada | AITAP no ejecuta código, no toca filesystem y no parsea el BSIP-Response. |
| OpenCode es la capa de implementación | Cerrada | OpenCode opera en una Implementation Layer separada de AITAP; Nucleus gobierna la aplicación de cambios. |
| Alfred es multi-instancia | Cerrada | Existe un Alfred por dispositivo y cada instancia consume AITAP directamente; el renderer de Electron no recibe credenciales. |
| GitHub App + Device Flow | Cerrada | Es el patrón para Cortex y para la segunda app de Batcave. Las referencias a OAuth clásico son deuda documental/técnica a corregir, no alternativas vigentes. |
| PALADIN es el producto Cognituum para ingenieros | Cerrada | El Work de distribución para el sujeto individual adopta el nombre PALADIN. No implica un fork de Cognituum ni define todavía el nombre del producto o composición organizacional. |
| Agenda maestra | Cerrada | Solo se actualiza en esta sesión mediante reportes del usuario. |

## Material para Resolución Arquitectónica Transversal

La investigación transversal debe usar el split vigente de CORTEX por dominio, sin volver a tomar `REMEDIACION-TECNICA-v1.md` como fuente activa:

| Eje de análisis | Material vigente o candidato | Límite de coordinación |
|---|---|---|
| Supply | `docs/CORTEX/PROVIDER-EXECUTION-SPEC.md` | SDKs/endpoints oficiales, modelos locales y fallbacks; nunca DOM de providers externos. |
| Identity | `docs/CORTEX/VAULT-STORAGE-SPEC.md` | Cifrado, user scope y tokens; no promover hasta corregir §2.2 para GitHub App + Device Flow. |
| Synapse / DOM | `docs/CORTEX/PROVIDER-EXECUTION-SPEC.md` + `docs/CORTEX/AUTHORITY_BOUNDARY.md` | Se preserva automatización first-party del Cognituum Runner; se excluye permanentemente DOM de proveedores externos. |
| Governance | `docs/BATCAVE/BATCAVE_ARCHITECTURE.md` + handoff de GitHub App | Batcave autoriza y enruta; Nucleus firma/ejecuta; la segunda GitHub App permanece separada de Repo Ops. |

## Fotografía operativa productiva — 2026-08-19

**Fuentes inspeccionadas:** despliegue local `C:\Users\josev\AppData\Local\BloomNucleus`, su configuración/telemetría/logs y el workspace `C:\repos\eias-repos`.

- El árbol productivo contiene los binarios de Brain, Nucleus, Sentinel, Host, Cortex, Metamorph, Sensor, Temporal, Workspace y `bin\opencode\opencode.exe`, entre otros. `nucleus.json` marca `opencode_service_install` como `passed`.
- El log de OpenCode confirma que el servidor escucha en `http://127.0.0.1:4096`; esto es evidencia positiva de arranque Windows, no certificación limpia/reinstalación ni cobertura multiplataforma. El mismo log advierte que `OPENCODE_SERVER_PASSWORD` no está configurado: el server local está sin protección.
- La telemetría registra streams activos para OpenCode, Nucleus Worker, Brain, Sentinel y Temporal. Sin embargo, el worker repite `system_health` en `FAILED`, reporta el Vault en estado `LOCKED`, y el log de Temporal contiene timeouts. No inferir causalidad ni cerrar diagnóstico desde esta fotografía: requiere triage en una sesión operativa separada.
- La configuración de Conductor marca onboarding completado, organización activa `eias-repos` y `sample_project` como proyecto activo. En contraste, `.bloom\.nucleus-eias-repos\.core\.nucleus-config.json` aún marca onboarding incompleto, no lista `sample_project`, no tiene intents ni entradas en el índice semántico y conserva otros dos proyectos. Es una divergencia de estado entre capas que debe explicarse antes de usar ambas como una misma fuente de verdad.
- Metamorph registra 9 binarios gestionados, con 7 saludables y 2 faltantes (Conductor y Setup); OpenCode no figura aún en esa lista de binarios gestionados. Esto es evidencia de despliegue/servicio local, pero no de gestión de ciclo de vida completa por Metamorph.

**Uso de esta fotografía:** alimenta la Resolución Arquitectónica Transversal (Supply, Identity, Synapse/DOM y Governance) y la certificación del tema 5. No modifica por sí sola el alcance ni el orden crítico de Mandate Genesis.

## Tabla compacta de control

| # | Tema | Estado consolidado | Próximo paso concreto | Dependencia inmediata |
|---|---|---|---|---|
| 1 | Mandate Genesis | Composición funcional cerrada; primer vertical reencuadrado a CLI + AITAP + Executor | Consolidar action graph y contratos durables para iniciar el vertical | Brain; Temporal; AITAP; Executor; Nucleus/Core |
| 2 | Core UI Redesign | Sidebar y Profiles cerrados | Definir/armar panel derecho, Home y Wisdom tras diagnóstico | Switch de organización; Alfred; contrato de Mandate |
| 3 | BSIP Response | Validador aislado listo; formato de patch con evidencia inicial | Ejecutar batería de adherencia antes de cerrar schema | Modelos de frontera; OpenCode; canal API/web |
| 4 | AITAP | Frontera arquitectónica cerrada; scaffold incompleto | Resolver integración real de Contrato D y alta de dispositivos | BSIP Response; Nucleus; Alfred |
| 5 | OpenCode | Instalación multiplataforma y rollout básico implementados; adapter pendiente | Certificación operativa multiplataforma | Sistemas destino; comando `serve`; Metamorph |
| 6 | Alfred | Backend/pipe avanzados; UI y recepción pendientes | Diseñar alta de dispositivo y construir UI de chat | AITAP; Contrato D; Core UI |
| 7 | CORTEX / IonPump | Ownership documental dividido; Vault spec pendiente de corrección | Corregir §2.2 de Vault y migrar referencias antes de retirar la spec previa | GitHub App + Device Flow; Batcave; specs nuevas |
| 8 | Batcave | Arquitectura multi-org definida; decisión GitHub App vigente | Corregir regresión de Batcave Auth en Vault spec y actualizar referencias | CORTEX; Nucleus; Alfred remoto |
| 9 | AUTHORIZATION | Fail-closed de roles, gate CLI y Alfred Master-only cerrados; handler API Node/TypeScript y boundary Go→Node pendientes | Preflight de instalaciones existentes y asignar/completar el tramo API de AUTH-FIX-02 | Nucleus identity/ownership; boundary Go→Node |
| 10 | PALADIN / Distribución por composición | PALADIN confirmado como producto Cognituum para ingenieros; principio de una plataforma con composición individual u organizacional bajo análisis | Resolver gobernanza, contrato de composición, bootstrap y transiciones antes de diseñar la implementación | Nucleus; Metamorph; Installer/Setup; AUTHORIZATION; Batcave; Core; propiedad de Mandates y Wisdom |
| 11 | Gravity / Orbital Agentic State / Posture | Persistencia, resolución, masa y gramática formal dual implementadas y probadas; integración productiva pendiente | Integrar resolución/parser en Nucleus, Temporal y Conductor Workspace Core | AUTHORIZATION (Tema 9, para Architect); PALADIN (Tema 10, para Postura/UX); Nucleus; Temporal; Core |
| 12 | ROLES / Autoridad Organizacional Remota | Dirección arquitectónica consolidada; no existe todavía modelo remoto productivo, Authority Snapshot ni sincronización Backend → Batcave → Nucleus | Aprobar modelo conceptual y abrir el diseño coordinado del Authority Snapshot, sin anticipar wire schema | Backend; Batcave; Nucleus; Metamorph; AUTHORIZATION; PALADIN; Mandate Genesis |

---

## 1. Mandate Genesis en Workspace Core

**Estado actual**

El bloqueador de resolución de workspace del watcher, activo hasta el 25 de agosto, está corregido y verificado en el binario desplegado — no solo en diseño. La causa real no era un campo faltante en `nucleus.json`: fue una regresión de esquema — el watcher buscaba los campos planos obsoletos (`onboarding.workspace_org`/`workspace_path`), mientras el onboarding ya escribía el esquema multi-organización vigente (`active_org_slug` + `organizations[].workspace_path`). El fallback por filesystem tampoco podía resolverlo porque el servicio arranca desde el directorio del binario (`AppData\...\bin\nucleus`), sin ancestro común con el workspace real.

Corrección ya desplegada: `LoadMachineNucleusConfig()` lee correctamente el esquema anidado (`mandate_config.go`), deriva `MandatesRoot` sin depender del CWD, y usa el scan por filesystem únicamente como fallback de desarrollo (`service.go`). Confirmado con logs reales de producción de cuatro días distintos (25, 26, 27 y 29 de agosto), incluyendo el despacho efectivo de `MandateGenesisBuildWorkflow` — no solo la resolución del path.

Se detectó y corrigió, en el mismo trabajo, una regresión equivalente en `dev-start` (mismo campo plano obsoleto). El alcance actual de esta resolución de workspace es más amplio de lo que se creía — comparten el mismo mecanismo centralizado (`ResolveActiveOrgContext()`/`ResolveNucleusRoot()`) los comandos de Mandates, Vault, Ownership, Blueprint, Alfred y metadata de Nucleus. Sin evidencia de fallo en ninguno de ellos hoy.

Riesgo residual, no bloqueante: instalaciones legacy que conserven únicamente el esquema plano podrían fallar si el servicio arranca antes de que Conductor las migre. No amerita acción ahora — queda como endurecimiento futuro opcional si se confirma que existen instalaciones en ese estado.

La composición funcional canónica de un Genesis completo queda fijada así:

```text
ing → dis → doc → exp/evaluación → [dev condicional] → exp/reevaluación → completed
```

`ing/`, `dis/`, `doc/` y la evaluación técnica mediante `exp/` son obligaciones semánticas. `dis/` admite el fast-path `no_changes_required`. `dev/` se dispara únicamente cuando `exp/` devuelve `remediation_required` con findings estructurados y, después de cualquier `dev/`, una nueva evaluación `exp/` es obligatoria. Genesis solo puede quedar `completed` cuando `ing == completed`, `dis in [completed, no_changes_required]`, `doc == completed` y `latest_exp.result == ready`.

El Work existente debe continuar, sin duplicarse, bajo el nombre **MANDATE GENESIS — CLI + AITAP + EXECUTOR END-TO-END**. Su Etapa A previa sigue siendo insumo válido, pero el canal prioritario del primer vertical cambia: ya no depende de Synapse ni de Synapse Simulator. La ruta primaria es CLI → Nucleus/Temporal → Brain → AITAP para suministro cognitivo → Executor cuando exista actuación local autorizada → persistencia Brain/Nucleus → continuidad Temporal → observación durable en Core. La CLI es superficie de control, observación y recovery; no es dueña del workflow.

El Work independiente **SYNAPSE SIMULATOR — CONTRACT, FIXTURES AND FAILURE MODES** continúa con su investigación y diseño, pero deja de ser precondición de Genesis. Synapse queda como canal alternativo posterior sobre los mismos contratos.

El ownership general queda fijado: Nucleus gobierna y autoriza; Temporal orquesta Actions durablemente; Brain conserva el ciclo de vida, identidad, persistencia e interpretación de Intents; AITAP conserva Gateway, referencias de Vault y Contabilidad sin ejecutar código ni tocar filesystem; Executor implementa la Execution Layer sobre trabajo definido y autorizado, sin decidir si Genesis necesita `dev`; Core proyecta el estado durable.

La verificación de contrato con AUTHORIZATION quedó completada para el canal CLI: Specialist y Unknown son rechazados sin estado parcial ni dispatch a Temporal; Master pasa por un único punto de entrada (`requireMandateMaster → governance.RequireMaster`) y crea `mandate_state.json`. AUTHORIZATION, roles y gates no fueron modificados por la corrección del watcher; el despacho de `MandateGenesisBuildWorkflow` desde el `MandatesRoot` correcto quedó confirmado en producción.

**Fuentes de verdad**

- `docs/MANDATE/BLOOM_Estado_Consolidado_Takeaway_v1.md`
- `docs/MANDATE/BLOOM_Mandate_Genesis_Roadmap_Maestro_v3_3.md`
- `docs/MANDATE/Mandate_Genesis_Completion_Plan_v1.md`
- `docs/CONDUCTOR/WORKSPACE/Bloom_Conductor_Workspace_Core_UI_01.md`

**Próximo paso concreto**

1. Consolidar la representación exacta del action graph y la transición durable Mandate ↔ Action ↔ Intent.
2. Definir schemas de output de `doc/` y `exp/`, incluidos `remediation_required`, findings estructurados y `ready`.
3. Cerrar autorización Nucleus → Executor y observabilidad en Core.
4. Elegir motor Temporal específico o genérico sin reabrir la composición funcional, y recién entonces aprobar la implementación del vertical.

**Entorno recomendado**

Coordinación entre los Works de Genesis, AITAP y Executor hasta cerrar sus contratos; después, Codex o Claude Code para cambios verificables sobre Brain, Go/Temporal, Nucleus, Executor y Core. Synapse Simulator continúa como investigación paralela no bloqueante.

**Dependencias cruzadas**

- Tema 4 / AITAP: suministro cognitivo, routing efectivo y contabilidad, sin absorber orquestación.
- Executor: actuación local autorizada y contrato con Nucleus; no decide la necesidad de `dev`.
- Tema 2: D-25 define la forma final de la tab y dónde integra Genesis en Core.
- Tema 3: el motor genérico de intents y la respuesta estructurada condicionan la evolución posterior.
- Tema 6: el flujo de Core comparte superficie con Alfred, pero no debe mezclar scopes.
- Tema 9: el gate CLI de creación ya está verificado; el handler API Node/TypeScript y el boundary Go→Node siguen pendientes y no deben asumirse cubiertos.
- Synapse y Synapse Simulator son canales posteriores y no bloquean el primer vertical.

**Decisiones/riesgos abiertos**

- Permanecen abiertos el action graph, motor Temporal, schemas `doc`/`exp`, transición durable, autorización Nucleus → Executor, findings que habilitan `dev` y representación en Core.
- El bloqueador de resolución de workspace del watcher está resuelto y verificado en producción (ver Estado actual). El E2E CLI Master ya no está bloqueado por esta causa — sigue pendiente de QA manual end-to-end formal, no de infraestructura. El E2E API de creación de Mandates sigue sin aceptarse como válido hasta que el handler Node/TypeScript y el boundary Go→Node de AUTH-FIX-02 estén cerrados (sin cambios respecto a lo ya registrado en Tema 9).
- Estas decisiones precisan la implementación, pero no pueden alterar la composición funcional sin volver a AGENDA FOLLOWUP.
- Elevar a esta agenda solamente blockers transversales reales encontrados por cualquiera de los dos Works.
- D-25: confirmar si hace falta separar `GenesisTab` de `StandardMandateTab` o unificar en un `MandateTab` orientado por estado.
- D-27: el step `mandate_genesis` está triplicado y es vulnerable a drift.

---

## 2. Core UI Redesign

**Estado actual**

Sidebar y Profiles están cerrados y funcionales; Wisdom, Settings y Account tienen las superficies previstas, con contenido todavía parcial. La vista Profiles muestra datos reales y evitó simular accounts o cuotas que el backend aún no provee.

Quedan pendientes el panel lateral derecho, Alfred, el switch de organización, y confirmar el alcance final de Home y Wisdom. El scope de esta línea es UI de Core: los cambios de backend de Mandate Genesis se derivan al tema 1.

**Fuentes de verdad**

- `docs/CONDUCTOR/WORKSPACE/Bloom_Conductor_Core_UI_Contexto_para_Codex.md`
- `docs/CONDUCTOR/WORKSPACE/Bloom_Conductor_Workspace_Core_UI_01.md`
- `docs/CONDUCTOR/WORKSPACE/OPS_FINAL_Workspace_Core_UI.md`

**Próximo paso concreto**

Producir un diagnóstico basado en código real para el panel derecho: reutilización de `org-resolver.ts`, datos reales disponibles para system-info, contrato de Home y el modelo de Pillar para Wisdom. Con esa evidencia, preparar el prompt de implementación de una sola pieza de UI acotada.

**Entorno recomendado**

Claude Code para inspección y cambios Svelte/Electron verificables. Claude Web o Cowork sirven para decisiones de experiencia, siempre que el resultado llegue aquí para consolidarse antes de implementar.

**Dependencias cruzadas**

- Tema 1: el contrato y estados de Mandate determinan la UI de Mandate.
- Tema 6: Alfred ocupa el bloque inferior del panel derecho.
- Tema 8 / D-21: el switch de organización debe respetar la gobernanza de organización activa.

**Decisiones/riesgos abiertos**

- No construir el switch de organización antes de confirmar la reutilización del resolver existente.
- El launch de `synapse-simulator` permanece pendiente cruzado de Genesis/Sentinel; no resolverlo desde esta línea UI.

---

## 3. BSIP Response

**Estado actual**

La investigación contra código real está cerrada y el primer entregable ejecutable existe: `brain/core/intent/fs_contracts.py`, su schema `brain/core/intent/schema/bsip_response_contrato_d_v0_1.json` y el comando `brain intent validate-contract` en `brain/commands/intent/validate_contract.py`. Está registrado en `command_loader.py`, Brain compila, el comando aparece en el help real y hay pruebas de integración para payloads válidos, violaciones de scope y violaciones de shape con reporte por `json_pointer`.

El alcance cerrado es preciso: este componente es un **validador aislado y probado**, no una integración end-to-end. El pipeline legacy de `dev/` y `doc/` —`ResponseParser → StagingManager → MergeManager`— valida y mueve archivos completos, sin operaciones granulares, diffs ni checksums por operación; no es consumidor del Contrato D y `fs_contracts.py` no se conecta a esa cadena. No hay todavía productor real de `BSIP-Response` ni consumidor real que aplique operaciones.

**Fuentes de verdad**

- `docs/BSIP/SPECIFICATION_BSIP_Response_Recovery_Protocol_Baseline_v0_1.md`
- `docs/AITAP/BSIP_Response_Spec_PoC_Disparo1_v1_0.md`
- `docs/BSIP/TYPES/`
- `tree/bloom/bloom_project_tree.txt`

**Próximo paso concreto**

Ejecutar antes que cualquier adapter de OpenCode el protocolo de pruebas de adherencia pendiente del PoC original (Entregables 2 y 3): medir el cumplimiento del schema por modelos de frontera mediante structured output/tool-calling en el canal API y prompt rígido con reintento en el canal web. Usar `brain intent validate-contract` como validador, registrar tasa de cumplimiento y fallos de formato, diff y checksum. Los resultados decidirán si el Contrato D se conserva o se ajusta antes de construir sobre él.

**Entorno recomendado**

Claude Code, Claude Web o una sesión de Codex que pueda acceder a los modelos y ejecutar el comando local de validación. El trabajo debe preservar métricas y ejemplos de salida para que esta sesión pueda consolidar conclusiones de contrato.

**Dependencias cruzadas**

- Tema 4: AITAP transporta la respuesta cruda, pero no la valida.
- Tema 5: OpenCode demostró formato nativo `apply_patch` y unified diff posterior; todavía no define el formato del Contrato D ni integra un adapter.
- Tema 6: Alfred no debe diseñar su parser de recepción antes del cierre posterior del Contrato D completo.

**Decisiones/riesgos abiertos**

- Formato de transporte para recuperación parcial: NDJSON vs. blob JSON único.
- Productor real de `BSIP-Response`: no existe todavía; debe validarse por API y web.
- Consumidor real que aplique operaciones: no existe todavía; el adapter de OpenCode permanece sin diseñar.
- Formato de `op=patch`: una prueba de OpenCode muestra `apply_patch`/V4A como formato nativo de edición del modelo y unified diff generado por OpenCode después de aplicar. Hace falta una batería adicional antes de decidir si Contrato D recibe una instrucción nativa o el diff posterior verificado.
- Checksum por operación: OpenCode no lo generó durante la corrida; continúa siendo responsabilidad de una capa propia (`fs_contracts.py`/adapter futuro).
- La integración futura con consumidores reales se define fuera del pipeline legacy de `dev/`/`doc/`.

---

## 4. AITAP

**Estado actual**

La frontera es definitiva: AITAP es Grifo + Vault por referencia + Contabilidad. No ejecuta código, no toca filesystem y no interpreta ni valida `BSIP-Response`; Brain y Alfred son los orquestadores que consumen y parsean la respuesta cruda.

El scaffold de `installer/aitap` existe, pero el routing interproveedor y la conexión real al Vault todavía no. Para Alfred, la emisión está preparada y la recepción sigue bloqueada hasta el cierre del Contrato D.

**Fuentes de verdad**

- `docs/AITAP/AITAP_Decision_Arquitectonica_Gateway_vs_Ejecucion.md`
- `docs/AITAP/AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md`
- `installer/aitap/AGENTS.md`
- `installer/aitap/README.md`

**Próximo paso concreto**

Separar dos trabajos: confirmar la integración real de Contrato D en Brain (tema 3) y diseñar el mecanismo de alta/identidad de dispositivo necesario para consumidores directos de AITAP, incluido el caso mobile sin Nucleus local.

**Entorno recomendado**

Cowork o Claude Web para el diseño de identidad y responsabilidades entre dispositivos/Nucleus; Claude Code para la implementación del scaffold una vez que el contrato esté cerrado.

**Dependencias cruzadas**

- Tema 3: Contrato D y validación en el consumidor.
- Tema 5: la Implementation Layer de OpenCode consume AITAP, pero no vive dentro de él.
- Tema 6: Alfred es consumidor directo multi-instancia.

**Decisiones/riesgos abiertos**

- Alta, emisión, almacenamiento y revocación de identidad por dispositivo.
- Alcance de Nucleus cuando el consumidor no posee un Nucleus local.

---

## 5. OpenCode — Implementation Layer

**Estado actual**

El nombre vigente es **OpenCode**. Su función definida es implementar localmente una decisión ya tomada por el modelo de frontera, mediante sesiones headless; no es una capacidad que pueda absorber AITAP.

La primera prueba real confirmó que `opencode-windows-x64` v1.18.18 funciona de modo headless mediante `opencode run --format json "<prompt>"`: sin TUI, invocable por script y con stdout como stream parseable de eventos JSON (`step_start`, `text`, `tool_use`, `step_finish`). Una corrida con OpenAI/GPT-5.6 usó herramientas reales para leer, aplicar una modificación y ejecutar una verificación. Esto prueba la capacidad de ejecución programática, no un adapter de Brain ya construido.

La corrida aporta evidencia al Contrato D: el modelo editó con el formato nativo `apply_patch`/V4A, no con unified diff. OpenCode aplicó ese patch y solo después produjo un unified diff estándar como reporte del resultado. No generó checksums. También emitió tokens y costo en cada `step_finish`, pero esa telemetría no pasó por AITAP porque la prueba usó autenticación propia de OpenCode mediante cuenta ChatGPT. `opencode serve` existe como servidor HTTP headless persistente, pero todavía no fue probado.

La instalación y distribución inicial están implementadas en el instalador Electron para Windows, macOS y Linux. El binario se despliega desde `installer/opencode/{platformDir}/` hacia `{baseDir}/bin/opencode/opencode` (con `.exe` en Windows), con cleanup de procesos/servicios previo, servicio persistente por plataforma (NSSM, LaunchAgent o `systemd --user`), inicio y readiness TCP en `127.0.0.1:4096`. OpenCode también fue agregado a certificación general, `global_paths.js` y `criticalPaths`.

Metamorph incorpora `rollout_opencode.go`, que hace el deploy básico por `copyFile` desde `installer/opencode/{platformDir}/opencode`; se corrigió el segmento de ruta erróneo `native/bin` y el rollout recompiló para Linux, Darwin arm64 y Windows. Este cierre cubre código de instalación/distribución, no certificación real sobre los tres sistemas ni gestión del servicio desde Metamorph. En este checkout aún no son visibles algunos de los artefactos reportados (`service-installer-opencode*`, `rollout_opencode.go` y el documento REQ), por lo que corresponde verificar su sincronización antes de una auditoría local.

La inspección productiva del 2026-08-19 añade evidencia Windows: `opencode.exe` está desplegado y su servicio escucha en `127.0.0.1:4096`. Pero el log advierte que `OPENCODE_SERVER_PASSWORD` no está definido, y la configuración de Metamorph aún no lista OpenCode entre sus binarios gestionados. Ambas condiciones quedan dentro de la certificación y hardening pendientes.

**Fuentes de verdad**

- `docs/AITAP/AITAP_Decision_Arquitectonica_Gateway_vs_Ejecucion.md`
- `docs/BSIP/SPECIFICATION_BSIP_Response_Recovery_Protocol_Baseline_v0_1.md`
- `REQ-metamorph-opencode-rollout.md`
- Código de instalación: `installer.js`, `pre-install-cleanup.js`, `service-installer-opencode.js`, `service-installer-opencode-darwin.js`, `service-installer-opencode-linux.js` y `global_paths.js`.
- `rollout_opencode.go`

**Próximo paso concreto**

Ejecutar la fase de certificación operativa: confirmar `opencode serve --help` y fijar el comando real de arranque; probar instalación limpia, inicio y readiness en Windows/macOS/Linux; y probar reinstalación con proceso o servicio activo. Después confirmar si Electron y Metamorph comparten `nucleus.json` y requieren el mismo milestone, implementar gestión de servicio por plataforma en Metamorph y definir versionado, pinning y actualización incremental.

La batería de adherencia de patch/checksum/scope del tema 3 sigue siendo prerequisito separado antes de diseñar el adapter de Execution Layer.

**Entorno recomendado**

Claude Code o Codex con acceso a cada sistema destino para pruebas de instalación y servicios reales; el trabajo requiere observar procesos, puertos y reinstalación, no solo compilación cruzada. Cowork o Claude Web siguen siendo útiles para la política de versión, pinning y actualización una vez recogida la evidencia operativa.

**Dependencias cruzadas**

- Tema 3: la evidencia sobre `apply_patch`/unified diff informa la decisión de schema; el comando `validate-contract` aún no integra OpenCode.
- Tema 4: AITAP debe recibir la telemetría y resolver Vault/Contabilidad para evitar que el adapter dependa de auth propia de OpenCode.
- Tema 8: no debe confundirse con el control plane remoto de Batcave.

**Decisiones/riesgos abiertos**

- Ubicación física y propietario del componente.
- Bridge Implementation Layer ↔ Nucleus, distinto de `nucleus vault`.
- Instalación limpia, reinstalación, arranque headless y readiness no están certificados end-to-end en los tres sistemas.
- Flag exacto de `opencode serve --port`: no validado todavía.
- Metamorph aún no gestiona el servicio; solo despliega el binario.
- Seguridad local: el despliegue observado inicia OpenCode sin `OPENCODE_SERVER_PASSWORD`; definir y verificar su provisioning antes de tratar el servicio como certificado.
- Metamorph no lista aún OpenCode entre sus binarios gestionados en el estado productivo observado.
- Versionado, pinning, detección de versión instalada y política de actualización incremental: sin definir.
- Contabilidad/Vault: los datos de tokens y costo de OpenCode fueron observados, pero no pasaron por AITAP en la prueba standalone.
- No elegir aún entre patch nativo y unified diff posterior como representación de Contrato D.

---

## 6. Alfred

**Estado actual**

Alfred conversacional está implementado como componente independiente en `installer/alfred`, con Ollama local como default, Gemini opt-in y un pipe de streaming hacia Core ya reparado. Alfred-Go, separado, es el custodio angosto de gobernanza dentro de Nucleus.

Falta la UI Svelte de chat real en Core y el diseño de alta por dispositivo. La recepción de respuestas estructuradas no debe implementarse antes de cerrar el Contrato D.

**Fuentes de verdad**

- `docs/ALFRED/ALFRED_STATUS_2026-08-14.md`
- `docs/AITAP/Alfred_Integracion_AITAP_Disparo2_v1_0.md`
- `installer/alfred/AGENTS.md`
- `docs/AITAP/AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md`

**Próximo paso concreto**

Diseñar el alta de dispositivo junto con AITAP/Nucleus y, en paralelo no bloqueante, preparar la implementación del componente Svelte de chat que consume `bloom.ai.execution.*` sin exponer credenciales al renderer.

**Entorno recomendado**

Cowork o Claude Web para la arquitectura de identidad de dispositivos; Claude Code para la UI Svelte y la integración Electron/WebSocket delimitada.

**Dependencias cruzadas**

- Tema 2: Alfred ocupa el panel lateral derecho de Core.
- Tema 3: Contrato D bloquea la recepción estructurada.
- Tema 4: AITAP es el canal directo para todo uso de tokens cloud.
- Tema 8: Batcave sirve a la autorización de acciones remotas, no al razonamiento cotidiano de Alfred.

**Decisiones/riesgos abiertos**

- Emisión de credencial inicial y revocación por dispositivo, especialmente para mobile.
- Deuda Alfred-Go: ruta de configuración relativa y modelo Ollama hardcodeado.

---

## 7. CORTEX — IonPump Policies

**Estado actual**

La remediación anterior fue dividida por responsabilidad y ciclo de vida. `VAULT-STORAGE-SPEC.md` cubre credenciales, cifrado, aislamiento user-scoped, namespacing, identidad y separación de tokens; `PROVIDER-EXECUTION-SPEC.md` cubre inferencia, SDKs/endpoints oficiales, modelos locales, fallbacks y límites de automatización. `REMEDIACION-TECNICA-v1.md` dejó de ser fuente de verdad activa y debe eliminarse una vez migradas sus referencias.

La frontera de automatización queda corregida: se preserva la automatización first-party dentro de las superficies propias del Cognituum Runner, incluido parseo de BTIP y orquestación interna. Está permanentemente fuera de alcance automatizar el DOM de proveedores externos (`claude.ai`, `chatgpt.com`, `grok.com`, `aistudio.google.com` y equivalentes), sin importar el sandbox.

`VAULT-STORAGE-SPEC.md` no puede promoverse todavía como fuente vigente: su §2.2 reintroduce erróneamente una OAuth App clásica para Batcave Auth. La decisión cerrada sigue siendo una segunda GitHub App con Device Flow, separada de Repo Ops.

La fotografía productiva muestra otra distinción que la spec debe modelar con precisión: `nucleus.json` informa `vault_initialized: true`, mientras el worker operativo reporta `vault_state LOCKED` con el profile master activo. “Inicializado” no equivale a “disponible/desbloqueado”; el comportamiento y las transiciones entre ambos estados requieren evidencia antes de alterar la arquitectura.

**Fuentes de verdad**

- `docs/CORTEX/AUTHORITY_BOUNDARY.md`
- `docs/CORTEX/PROVIDER-EXECUTION-SPEC.md` — vigente para ejecución, providers, modelos locales, fallbacks y límite DOM.
- `docs/CORTEX/VAULT-STORAGE-SPEC.md` — candidata para Vault/identidad; pendiente de corregir §2.2 antes de promoverla.
- `docs/CORTEX/HANDOFF-github-app-batcave-synapse.md`

**Próximo paso concreto**

Corregir §2.2 de `VAULT-STORAGE-SPEC.md` para que defina una segunda GitHub App con Device Flow para Batcave Auth. Luego migrar las referencias que aún dependan de `REMEDIACION-TECNICA-v1.md` y eliminar ese documento. Las sesiones de ejecución deben usar las dos specs separadas según responsabilidad, no la remediación previa.

**Entorno recomendado**

Claude Code para relevar los archivos reales, implementar seguridad y ejecutar verificaciones. Cowork o Claude Web para revisar el orden de migración y la experiencia de onboarding antes de cambios irreversibles.

**Dependencias cruzadas**

- Tema 8: segunda GitHub App de Batcave usa el mismo patrón GitHub App + Device Flow.
- Tema 4: comparte límites de credenciales y consumo de proveedores, sin mezclar responsabilidades.
- Tema 6: los modelos locales mantienen API directa, sin vault de cloud ni automatización DOM.
- Tema 1: este cambio documental y de alcance no bloquea Mandate Genesis.

**Deuda documental/técnica a corregir**

- Corregir la regresión OAuth de §2.2 en `VAULT-STORAGE-SPEC.md` antes de promoverla como fuente vigente.
- Migrar referencias y eliminar `REMEDIACION-TECNICA-v1.md`.
- Retirar automatización DOM y permisos únicamente sobre dominios de proveedores externos; conservar la automatización first-party del Cognituum Runner.

---

## 8. Batcave

**Estado actual**

Batcave es el control plane remoto: autentica, verifica autorización mediante BlindJudge y enruta por túnel al Nucleus local, que conserva la firma y ejecución reales. La arquitectura multi-org y la separación entre Batcave, Alfred local y AITAP están diseñadas.

La autenticación remota debe usar una segunda **GitHub App + Device Flow**. Las referencias restantes a `middleware/github-oauth.ts`, GitHub OAuth clásica y configuración asociada en la arquitectura son deuda técnica/documental explícita. La misma regresión aparece ahora en §2.2 de `VAULT-STORAGE-SPEC.md`; esa spec no se promueve para el dominio de identidad hasta que se corrija.

**Fuentes de verdad**

- `docs/BATCAVE/BATCAVE_ARCHITECTURE.md`
- `docs/CORTEX/HANDOFF-github-app-batcave-synapse.md`
- `docs/CORTEX/VAULT-STORAGE-SPEC.md` — pendiente de corregir §2.2 antes de promoverla para Batcave Auth.
- `docs/GOVERNANCE/GOVERNANCE_OWNERSHIP_SPEC_v1_0.md`

**Próximo paso concreto**

Corregir primero §2.2 de `VAULT-STORAGE-SPEC.md`; después preparar el prompt de corrección de arquitectura e implementación para sustituir OAuth clásico por una segunda GitHub App con Device Flow, conservando scopes mínimos y separación rigurosa frente a Repo Ops. Verificar en el código real que no persistan `github-oauth.ts` ni una clase `Alfred` dentro de Batcave.

**Entorno recomendado**

Cowork o Claude Web para revisar contrato de autenticación remota, scopes y límites de BlindJudge; Claude Code para inspeccionar/actualizar el árbol TypeScript y validar los invariantes de multi-org.

**Dependencias cruzadas**

- Tema 7: comparte Device Flow, pero conserva una app y finalidad separadas de Repo Ops.
- Tema 6: Alfred remoto puede requerir autorización de Batcave para actuar sobre Nucleus, pero consume AITAP directamente para razonamiento.
- Tema 4: AITAP no forma parte del relay ni del control plane remoto.

**Deuda técnica a corregir**

- Sustituir las menciones OAuth clásico y `middleware/github-oauth.ts` por la segunda GitHub App con Device Flow.
- Corregir la regresión OAuth de §2.2 en `VAULT-STORAGE-SPEC.md` antes de usarla como fuente de identidad de Batcave.
- Mantener y verificar la ausencia de `alfred.ts`/clase Alfred en Batcave.

---

## 9. AUTHORIZATION

**Estado actual**

El enforcement de roles quedó cerrado para el canal CLI: `AUTH-FIX-01` implementó fail-closed; el tramo CLI de `AUTH-FIX-02` agrega el gate de creación; Alfred quedó Master-only; y se homologaron mensajes y exit codes, incluido el fix de `dev-start` de exit `0 → 1`. El cambio está en `main` y `go test ./...` está en verde.

Este cierre no alcanza todavía al handler API Node/TypeScript ni al boundary Go→Node de `AUTH-FIX-02`; ambos siguen pendientes y sin Work asignado. `AUTH-MODULE-01` permanece bloqueante para promoción, materialización y finalización productiva. `AUTH-OWNERSHIP-01` queda como P2 paralelo: no bloquea iniciar Genesis, pero es necesario para cerrar el modelo definitivo si incorpora el rol Architect.

**Fuentes de control y verificación**

- Estado reportado por el usuario el 2026-08-24; implementación pusheada a `main` y `go test ./...` en verde.
- `.nucleus-governance.json` — declara `min_role_for_cor_merge: Architect`.
- `GOVERNANCE_OWNERSHIP_SPEC_v1_0.md`, `MRG_Intent_Spec` y código actual — deben contrastarse antes de normalizar el rol Architect. `GOVERNANCE_OWNERSHIP_SPEC_v1_0.md` todavía no fue contrastado contra `.nucleus-governance.json`.

**Próximo paso concreto**

1. Correr en la próxima instalación completa el preflight sobre instalaciones existentes sin marcador `.master`/`.specialist`, junto con la verificación del fix de `dev-start`, para confirmar que el cambio fail-closed no bloquee perfiles legítimos.
2. Asignar y ejecutar el tramo pendiente de `AUTH-FIX-02`: gate del handler API Node/TypeScript y boundary Go→Node.
3. Después, abordar `AUTH-MODULE-01` para promoción/materialización/finalización productiva.

**Entorno recomendado**

Claude Code o Codex con acceso al código Go y Node/TypeScript, más una instalación real para el preflight. La investigación sobre Architect y ownership debe preceder cualquier normalización de roles.

**Dependencias cruzadas**

- Tema 1: la creación CLI está autorizada; el watcher de Genesis sigue bloqueado por resolución de workspace, no por Authorization. No aceptar un E2E API de creación real hasta cerrar el tramo API de `AUTH-FIX-02`.
- Nucleus identity/ownership: fuente de roles y condiciones de preflight.
- Tema 5 / Executor: `AUTH-MODULE-01` es prerequisito antes de promoción, materialización o finalización productiva.

**Decisiones/riesgos abiertos**

- `.nucleus-governance.json` declara `min_role_for_cor_merge: Architect`, en contradicción con `GOVERNANCE_OWNERSHIP_SPEC_v1_0.md`, `MRG_Intent_Spec` y el código actual; se registra para resolverlo, sin incorporarlo al fix urgente. `GOVERNANCE_OWNERSHIP_SPEC_v1_0.md` todavía no fue contrastado contra `.nucleus-governance.json`.
- La implementación previa de `Alfred.VerifyIntent` que confiaba en `RequesterRole` aportado por el request no constituye un punto de autorización confiable; cualquier revisión posterior debe derivar la identidad desde una fuente autoritativa.
- Quedan pendientes de limpieza, sin autorización de borrado: Mandate de prueba `b15bcdf4...` y su carpeta temporal asociada.

---

## 10. PALADIN / Distribución por composición

**Estado actual**

El Work dedicado a la forma de distribución de Cognituum para desarrolladores e ingenieros externos adopta el nombre **PALADIN**. PALADIN es el nombre del producto para ingenieros y no un nombre alternativo para Metamorph.

El principio de producto presentado establece una sola plataforma Cognituum con distintas formas de habitarla. El sujeto individual conserva capacidades reales de Mandates y Wisdom dentro de su identidad personal; la organización agrega gobierno institucional, miembros, roles, coordinación, auditoría y administración del conocimiento organizacional.

La dirección arquitectónica candidata mantiene las fronteras existentes: Nucleus determina identidad, políticas y capacidades autorizadas; Metamorph materializa la composición local mediante instalación, actualización, retiro, verificación de salud y rollback. Metamorph no decide si el sujeto pertenece a una organización ni concede capacidades.

PALADIN no debe implementarse como un fork ni como una lista rígida de binarios seleccionada unilateralmente por Metamorph. La separación entre composición instalada y autorización efectiva permanece obligatoria: Metamorph controla qué componentes están presentes; Nucleus controla qué acciones están permitidas.

**Fuentes de verdad**

- Manifiesto de la Sabiduría Técnica de Cognituum, compartido por el usuario en AGENDA FOLLOWUP.
- Principio de Distribución de Cognituum — Una plataforma. Dos formas de habitarla, compartido por el usuario en AGENDA FOLLOWUP.
- `docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_RESPONSIBILITY_BOUNDARIES.md`

**Próximo paso concreto**

Cerrar la gobernanza antes de diseñar o implementar:

1. Identidad autoritativa del sujeto individual y organizacional.
2. Contrato y cadena de confianza de la composición deseada.
3. Sustrato mínimo de bootstrap con Nucleus y Metamorph.
4. Componentes físicamente separables frente a capacidades protegidas en runtime.
5. Comportamiento offline, expiración, revocación y rollback.
6. Transiciones PALADIN → organización, organización → PALADIN y organización A → B.
7. Propiedad, transferencia, conservación y retiro de Mandates, Wisdom y datos institucionales.

**Dependencias cruzadas**

- Nucleus: identidad, políticas, autorización y fuente local de decisión.
- Metamorph: reconciliación de la composición, lifecycle, salud y rollback.
- Installer/Setup: instalación del sustrato neutral previo al onboarding.
- Tema 9 / AUTHORIZATION: enforcement efectivo independiente de la presencia física de componentes.
- Tema 8 / Batcave: posible origen remoto de políticas organizacionales; la cadena de autoridad todavía debe cerrarse.
- Tema 2 / Core: onboarding y representación del sujeto y la composición activa.
- Mandates y Wisdom: propiedad personal e institucional durante adopción, salida o revocación.

**Decisiones/riesgos abiertos**

- PALADIN queda confirmado como nombre del producto para ingenieros.
- No está definido todavía el nombre del producto o composición para organizaciones.
- No está cerrado quién produce, autoriza y firma la composición que recibe Metamorph.
- No está cerrado qué capacidades requieren componentes distintos y cuáles permanecen en binarios compartidos con gates de Nucleus.
- El cambio de composición no puede borrar ni transferir conocimiento como efecto secundario.
- La arquitectura no debe reducirse a dos modos hardcodeados ni usar la ausencia de archivos como sustituto de autorización.

---

## 11. Gravity / Orbital Agentic State / Posture

**Estado actual**

Investigación de diseño consolidada sobre el ecosistema Gravity/Orbital, con cuatro coworks completos: Rosetta Stone (traducción de marcos multidisciplinarios), especificación de UX de Postura/Gravity/Masa para Paladin, catálogo de contratos de API/DTOs de Nucleus (con auditoría propia contra el código real), y modelo de objetos de cliente de Paladin. Sobre esa base, tres investigaciones diagnósticas ejecutadas por Codex, todas cerradas sin modificar código: (1) la colisión de nombre entre el `mandate_state.json` real de Nucleus y el diseño agéntico de BTIPS quedó resuelta por separación de artefactos — el registro durable de ejecución agéntica se llama **Orbital Agentic State** (`orbital_agentic_state.json`); (2) la eliminación de `COR_Intent_Spec_v1_0.md` no está autorizada por ninguna fuente real y no tiene sucesor — se mantiene vigente; (3) `AUTH-OWNERSHIP-01` confirmó que el rol `Architect` no bloquea la firma del nivel `PROJECT` de Gravity (existe camino interino vía Master) y que la atribución de esa jerarquía de roles a `BTIPS §9.5` era parcialmente incorrecta (esa fuente solo respalda Master/Specialist).

**[CORRECCIÓN 2026-09-02, sesión de control]** El punto (2) de arriba quedó **superado**: `cor`/`COR_Intent_Spec_v1_0.md` es Intent Core, y Intent Core está deprecado, sin transición en curso — Gravity absorbió por completo el articulado de autorización de postulados y posturas que `cor` cubría. El archivo fue movido (no borrado, reversible) a `_to_delete/docs-BSIP-TYPES-COR_Intent_Spec-deprecated/`, con su propio `DEPRECATED.md` al lado. Cualquier mención de `cor` como requisito pendiente en el resto de esta sección — incluida la razón detrás del fail-closed de `Store.CreateNode` para `ORGANIZATION`/`NUCLEUS` — debe leerse en este contexto: la resolución ya no pasa por `cor`. Ver `docs/ANAYSIS/GRAVITY/COR/Investigacion_Cor_Authorization_Nodos_Gravity_v0_2.md` y el Tablero de Seguimiento Consolidado de control (`ORBITAL/GRAVITY/Tablero_Seguimiento_Consolidado_v0_2.md`, v0.10) para el detalle completo de esta corrección.

Ya se ejecutó el saneamiento documental derivado de esas tres investigaciones: renombre completo a `orbital_agentic_state.json` en los cuatro documentos de diseño de Gravity/Mandates agénticos, y corrección de la atribución de `Architect` en `NUCLEUS_AUTHORIZATION_MODULE_DRAFT_v0_2.md` (línea 16). Ningún cambio tocó código. La referencia a `ownership v0.3` en el Tema 9 fue corregida en esta Agenda a `GOVERNANCE_OWNERSHIP_SPEC_v1_0.md`, con la salvedad de que ese documento todavía no fue contrastado contra `.nucleus-governance.json`.

La primera etapa de implementación real de Gravity dentro del Work Génesis quedó completada. El Grafo de Gravedad persiste bajo `.bloom/.gravity/` mediante archivos JSON por entidad, raíz gobernada y sustitución atómica. `GravityNode` incorpora `nodeVersion` para compare-and-swap de concurrencia, no como caché. `Store.CreateNode` es fail-closed para `ORGANIZATION` y `NUCLEUS`; `PROJECT`, `MANDATE` y `SESSION` mantienen el comportamiento existente.

También se implementaron `ResolveActive`, la Activity de Temporal `resolveActiveGravityActivity` y el cálculo puro de masa. La resolución reutiliza solo la espina estructural del Mandate y relee fresco en cada turno el contenido de sus nodos, incluido siempre `SESSION`; no persiste una segunda copia de `gravityPostures[]`. La Activity ya está registrada en el worker, pero aún no está conectada a `MandateExecutionWorkflow`.

La gramática canónica ANTLR4 `contracts/gravity/GravityExpression.g4` genera parsers equivalentes para Go (validación autoritativa en Nucleus) y TypeScript (validación advisory en Conductor Workspace Core). Reconoce `constraint`, `threshold`, `evidence`, `priority`, `escalation` y `exception`; ambos parsers derivan de forma fija `predicateComputable`, validan WF-1 a WF-5 y producen AST serializable con errores de sintaxis posicionados y rechazos semánticos separados. La etapa incluyó casos válidos de las seis primitivas, `grv_2b91` reexpresado y casos inválidos por regla.

Esta etapa no crea un componente desplegable llamado parser: el parser Go forma parte de `nucleus.exe` y el parser TypeScript deberá incorporarse más adelante a `bloom-workspace`. Java/ANTLR 4.13.2 se usan solo en la regeneración explícita mediante `scripts/generate-gravity-parser.ps1`; el build normal verifica fuentes generadas versionadas y no las regenera. El preflight de `build-all.py` falla antes de compilar Nucleus si falla la suite Go o TypeScript de Gravity.

**Fuentes de control y verificación**

- Coworks: `Rosetta_Stone_Investigacion_Marcos_Externos_v0_1.md`, `Paladin_UX_Postura_Gravity_Masa_Spec_v0_1.md`, `NUCLEUS_API_Contracts_Consolidado_v0_1.md`, `NUCLEUS_API_Contracts_Auditoria_vs_Truth_v0_1.md`, `Paladin_Client_Object_Model_v0_1.md`.
- Investigaciones Codex (diagnóstico, modo lectura, sin cambios): resultado de la colisión `mandate_state.json`/Orbital Agentic State; resultado de la investigación sobre eliminación de `COR_Intent_Spec_v1_0.md`; resultado de `AUTH-OWNERSHIP-01`.
- Saneamiento documental ejecutado por Codex en: `docs/AGENTIC/BTIPS_Mandates_Agenticos_Spec_Unificada.md`, `docs/MANDATE/BLOOM_Mandate_Universal_Schema_v1_2_0.md`, `docs/ANAYSIS/GRAVITY/API/NUCLEUS_API_Contracts_Auditoria_vs_Truth_v0_1.md`, `docs/ANAYSIS/GRAVITY/API/NUCLEUS_API_Contracts_Consolidado_v0_1.md`, `docs/GOVERNANCE/AUTHORIZATION/NUCLEUS_AUTHORIZATION_MODULE_DRAFT_v0_2.md`.
- Implementación y contrato: `.bloom/.gravity/`, `contracts/gravity/GravityExpression.g4`, `installer/nucleus/internal/gravity`, `contracts/gravity`, `scripts/generate-gravity-parser.ps1` y `build-all.py`.

**Próximo paso concreto**

1. Integrar productivamente la etapa cerrada: conectar `resolveActiveGravityActivity` a `MandateExecutionWorkflow`; invocar el parser autoritativo de Nucleus antes de persistir o firmar reglas; e importar/empaquetar el parser TypeScript en Conductor Workspace Core.
2. `docs/MANDATE/MARKETPLACE/BLOOM_Mandate_Package_Spec_v1_0_0.md` (línea 61) quedó revisado y **cerrado sin cambios**: su referencia a `mandate_state.json` es correcta tal como está — el documento excluye deliberadamente el estado operacional del Nucleus vendedor de lo que viaja en un Mandate empaquetado. Queda anotado para una revisión futura, no urgente: ese mismo documento debería excluir también el `orbital_agentic_state.json` crudo, dejando claro que lo transferible nunca es el log completo, sino una proyección sanitizada o Wisdom ya promovida.
3. `docs/MANDATE/MARKETPLACE/BLOOM_Cognitive_Evidence_Model_v1_0_0.md` (línea 292) queda como **pendiente de diseño real**, no de nombre: su “evidencia local directa” es ambigua entre el estado operacional de Nucleus, el historial crudo de Orbital, o una proyección derivada de ambos — no se renombra ni se corrige hasta resolver esa ambigüedad.
4. Se identifica una **investigación futura candidata**, todavía no abierta ni asignada: `mandate_state.json + orbital_agentic_state.json → evidencia derivada → Gravity reusable → Wisdom`. Debe definir qué se deriva, qué se sanitiza, qué se promueve, qué es transferible entre organizaciones (Marketplace) y quién conserva ownership en cada paso — siguiendo la progresión ya fijada en Orbital: Experience → Gravity → Repeated Application → Evidence → Reusable Gravity → Wisdom. Wisdom no es otro nombre para el historial de ejecución.

**Entorno recomendado**

Claude Web/Cowork para las decisiones restantes de diseño; Codex o Claude Code con acceso al repo para integrar Nucleus, Temporal y Conductor Workspace Core. La integración productiva y cualquier rollout requieren verificación posterior en los artefactos ordinarios de Nucleus y Workspace, no un componente parser independiente.

**Dependencias cruzadas**

- Tema 9 (AUTHORIZATION): `AUTH-OWNERSHIP-01` es diagnóstico compartido; la normalización de roles que decida si `Architect` existe formalmente afecta directamente a quién firma `PROJECT` en Gravity.
- Tema 10 (PALADIN): la especificación de UX de Postura/Gravity/Masa y el modelo de objetos de cliente son, en los hechos, parte del diseño de producto de PALADIN — se manejan acá por su origen en la investigación de Gravity, pero cualquier decisión de UI final de PALADIN debe coordinarse con ese tema.

**Decisiones/riesgos abiertos**

- Persistencia, resolución, masa y parseo están implementados y probados, pero todavía no cambian el comportamiento de ejecución de Mandates: falta conectar la Activity al workflow y usar el parser antes de persistir o firmar reglas.
- No existe aún comando Cobra que exponga `gravity.Parse()`, evaluador real ni consumidores de arbitraje.
- No se realizó rollout productivo de esta etapa; el parser Go viajará con `nucleus.exe` y el TypeScript con `bloom-workspace` cuando se integre.
- “Paladin” queda solo como nombre de fuentes históricas de Gravity; el consumidor cliente actual es Conductor Workspace Core.
- `BLOOM_Cognitive_Evidence_Model_v1_0_0.md` tiene una ambigüedad de diseño real (no terminológica) sin resolver sobre qué es “evidencia local directa”.
- `GOVERNANCE_OWNERSHIP_SPEC_v1_0.md` todavía debe contrastarse contra `.nucleus-governance.json` antes de usarlo para normalizar el rol Architect.

---

## 12. ROLES / Autoridad Organizacional Remota

**Estado actual**

Existe una dirección arquitectónica consolidada para la autoridad organizacional, pero no una implementación end-to-end. La cadena objetivo es:

```text
Backend organizacional
  → Batcave: transporte, sincronización y cache
  → Nucleus: verificación y autorización efectiva local
  → Brain / Temporal: ejecución acotada ya autorizada
```

La verdad material vigente continúa siendo local y fail-closed: Nucleus reconoce únicamente `Master`, `Specialist` y `Unknown`; `.master` y `.specialist` participan de la detección efectiva. `Architect` aparece en fuentes históricas y borradores, pero no está aprobado ni materializado en el enum, marcadores, detección, asignación o guards. `team_members[].role` es una declaración administrativa local y no constituye una cadena verificable de identity, membership, asignación, vigencia y revocación.

El modelo remoto objetivo preserva en Backend la fuente organizacional de principals, identidades externas vinculadas, memberships, definiciones de rol, asignaciones scoped, vigencias, revocaciones, auditoría y versión monotónica. Batcave autentica sesión y transporta/sincroniza/cachea los bytes y metadatos exactos del Authority Snapshot; no crea roles, concede permisos ni reemplaza la verificación independiente de Nucleus. Nucleus acepta únicamente snapshots con organización, procedencia, integridad, firma, vigencia y versión monotónica verificadas; mantiene un high-water mark durable y calcula la autorización efectiva junto con políticas soberanas, Gravity, Vault, Executor y límites técnicos.

Brain y Temporal no reconstruyen autoridad desde archivos locales ni datos parciales: reciben la operación y sus límites ya autorizados. Metamorph conserva lifecycle, instalación, actualización, rollback técnico y preservación de estado durable, pero no participa del transporte ordinario ni decide autoridad. Un rollback técnico no puede disminuir el high-water mark ni restaurar membresías, asignaciones o permisos revocados.

Tema 12 no reemplaza ni declara cerrado el Tema 9 / AUTHORIZATION. AUTHORIZATION conserva los fixes locales, roles fail-closed, gates y enforcement inmediato; ROLES gobierna la transición end-to-end hacia autoridad organizacional remota.

**Fuentes de verdad**

- `docs/ROLES/BLOOM_ROLES_ORGANIZATIONAL_AUTHORITY_CONSOLIDATION_v0_1.md`
- `docs/ROLES/BLOOM_ROLES_DISCOVERY_BASE_v0_1.md`
- `docs/BATCAVE/BATCAVE_ARCHITECTURE.md`
- Tema 8 / Batcave, Tema 9 / AUTHORIZATION y Tema 10 / PALADIN de esta agenda.

**Próximo paso concreto**

1. Aprobar el modelo conceptual que separa identidad, membership, definición de rol, asignación scoped, permisos y vigencia.
2. Abrir el diseño coordinado del Authority Snapshot entre Backend, Batcave y Nucleus, sin anticipar tablas, endpoints, eventos, stores, perfil criptográfico ni wire schema.
3. Diseñar por separado producción/versionado monotónico, transporte/cache, verificación/aceptación local, high-water mark, revocación, freshness, operación offline y revalidación de pasos privilegiados.
4. Definir criterios de entrada y salida de la migración `local_legacy → shadow_remote → remote_enforced`.

**Dependencias cruzadas**

- Tema 8 / Batcave: transporta, sincroniza y cachea Authority Snapshots; su gate de sesión no sustituye autorización efectiva.
- Tema 9 / AUTHORIZATION: mantiene el enforcement local actual y deberá coordinar sus boundaries API con la futura decisión efectiva de Nucleus.
- Tema 10 / PALADIN: la composición individual u organizacional depende de identidad, autoridad, expiración, revocación y transiciones gobernadas.
- Tema 1 / Mandate Genesis: creación, firma, promoción, integración e instalación reales requieren una decisión efectiva vigente de Nucleus; los gates locales siguen siendo el enforcement material mientras rija `local_legacy`.
- Tema 11 / Gravity: Gravity puede restringir una operación autorizada, pero nunca crea roles ni concede permisos faltantes.

**Decisiones/riesgos abiertos**

- No existe Authority Snapshot implementado ni sincronización Backend → Batcave → Nucleus para roles.
- No existe todavía enforcement `shadow_remote` ni `remote_enforced`; tampoco hay revocación corporativa extremo a extremo.
- Permanecen sin aprobación el catálogo de roles, la existencia de `Architect`, roles personalizados, scopes, herencia, múltiples Masters, separación de funciones e invitación/aceptación/suspensión/revocación.
- Permanecen abiertos el wire schema, perfil criptográfico, rotación de claves, TTL/freshness, latencia de revocación, snapshots completos o incrementales y acknowledgements de recibido, verificado y aceptado.
- Deben resistirse downgrade, replay inválido, conflicto de digest, expiración offline y rollback técnico sin que ningún archivo local restaure autoridad revocada.

**Informe a AGENDA FOLLOWUP**

Se informa la apertura del hito transversal **ROLES / Autoridad Organizacional Remota**. La dirección aprobada para investigación es Backend como verdad organizacional, Batcave como transporte/sincronización/cache, Nucleus como verificador y decisor efectivo local, y Brain/Temporal como ejecutores acotados. No existe todavía un modelo remoto productivo, Authority Snapshot ni sincronización end-to-end. El próximo Work es aprobar el modelo conceptual y diseñar coordinadamente el Authority Snapshot sin anticipar wire schema ni cambios de implementación. AUTHORIZATION mantiene en paralelo sus fixes y gates locales; este hito no los sustituye ni los declara cerrados.

---

## Cola de prompts para sesiones externas

| Prioridad | Tema | Prompt/entregable a preparar | Precondición |
|---|---|---|---|
| Alta | 1 + 4 + Executor | Consolidar `MANDATE GENESIS — CLI + AITAP + EXECUTOR END-TO-END`: action graph, outputs `doc`/`exp`, transiciones durables y autorización | Composición funcional cerrada; coordinación entre los tres Works |
| Media | Synapse Simulator | Continuar `SYNAPSE SIMULATOR — CONTRACT, FIXTURES AND FAILURE MODES` como canal alternativo posterior | Sin dependencia sobre el primer vertical Genesis |
| Alta | 5 | Certificación operativa de instalación/servicio OpenCode en Windows, macOS y Linux | Acceso a los tres sistemas; confirmar comando real de `serve` |
| Alta | 3 + 5 | Batería de adherencia API/web y OpenCode para decidir formato de patch, checksum y scope usando `validate-contract` | Prompt de ejecución pendiente de preparar; acceso a modelos, OpenCode y comando local |
| Alta | 7 | Corregir §2.2 de Vault Storage y migrar referencias desde la remediación anterior | GitHub App + Device Flow confirmado; mapear referencias a migrar |
| Alta | 8 | Migración de arquitectura/auth de Batcave a GitHub App + Device Flow | Corregir primero la regresión de Vault Storage y confirmar scopes mínimos |
| Alta | 1 | Resolver workspace Nucleus activo para el watcher de Mandates y verificar inicio de Temporal con Master | `onboarding.workspace_org` ausente y fallback por filesystem falla desde el servicio |
| Alta | 9 | Preflight fail-closed sobre instalaciones existentes y verificación de `dev-start` | Próxima instalación completa; no borrar artefactos de prueba todavía |
| P0 | 9 | `AUTH-FIX-02`: completar gate del handler API Node/TypeScript y boundary Go→Node; el tramo CLI ya está cerrado | Asignar Work; no aceptar E2E API de creación real antes del cierre |
| P1 | 9 | `AUTH-MODULE-01` para promoción/materialización/finalización productiva | Cierre de `AUTH-FIX-02` completo |
| P2 paralelo | 9 | `AUTH-OWNERSHIP-01`: resolver el modelo definitivo si incluye Architect | No bloquea el inicio de Genesis |
| Pendiente de autorización | 9 | Limpieza del Mandate de prueba `b15bcdf4...` y carpeta temporal asociada | Autorización explícita de borrado |
| Media | 4 + 6 | Diseño de identidad y alta de dispositivos AITAP/Alfred | Definir caso mobile sin Nucleus local |
| Media | 2 | Diagnóstico del panel derecho de Core | Acceso a resolver de organización y componentes reales |
| Media | 5 | Diseño de Implementation Layer de OpenCode | Contrato de gobernanza con Nucleus por definir |
| Alta | 10 | Gobernanza de PALADIN y distribución por composición: identidad, contrato, bootstrap, transiciones y ownership de conocimiento | Nombre PALADIN confirmado; no iniciar implementación antes del cierre de gobernanza |
| Alta | 11 | Integración productiva de Gravity: workflow Temporal, validación autoritativa Nucleus y empaquetado en Conductor Workspace Core | Persistencia, resolución, masa y parser dual implementados; no crear componente parser independiente |
| Media | 11 | Evaluar si `BLOOM_Mandate_Package_Spec_v1_0_0.md` y `BLOOM_Cognitive_Evidence_Model_v1_0_0.md` requieren investigación propia o se relacionan con Wisdom | Ninguna — solo decidir si se abre |
| Alta | 12 | Aprobar el modelo conceptual de autoridad organizacional remota y abrir el diseño coordinado del Authority Snapshot | No anticipar wire schema, tablas, endpoints ni implementación; conservar el enforcement local del Tema 9 |

## Registro cronológico de avances

| Fecha | Tema(s) | Avance reportado | Fuente / sesión externa | Actualización realizada aquí |
|---|---|---|---|---|
| 2026-08-15 | 1–8 | Creación de la agenda y consolidación inicial basada en las fuentes existentes. | Sesión de control | Se fijaron ownership exclusivo, OpenCode como nombre vigente y GitHub App + Device Flow como criterio cerrado. |
| 2026-08-16 | 3, 5 | Se integró y verificó el validador aislado de Contrato D; se decidió probar adherencia de modelos antes de diseñar el adapter de OpenCode. | Sesión externa de ejecución, reportada por el usuario | Se cerró el traslado del validador; se registraron como abiertos el productor, el consumidor y el adapter. |
| 2026-08-16 | 3, 5 | Primera prueba headless de OpenCode v1.18.18 con salida JSON parseable y edición/verificación reales. | Sesión externa de investigación, reportada por el usuario | Se agregó evidencia para el formato de patch; no se cerró el schema ni se inició el adapter. |
| 2026-08-17 | 5 | Se implementaron instalación Electron y rollout básico de Metamorph para OpenCode en tres plataformas. | Sesión externa de implementación, reportada por el usuario | Se cerró distribución inicial; se abrió certificación operativa, gestión de servicio en Metamorph, versionado y autenticación. |
| 2026-08-19 | 1, 4, 5, 7 | Inspección de despliegue productivo BloomNucleus y workspace `eias-repos`. | Lectura directa autorizada de configuración, telemetría y logs locales | Se agregó la fotografía operativa: OpenCode escuchando sin password, Vault bloqueado en runtime, salud/Temporal a triage y divergencia entre Conductor y `.bloom`. |
| 2026-08-17 | 7, 8 | Split documental de la remediación CORTEX y corrección de alcance de automatización DOM. | Actualización del usuario sobre fuentes y alcance | Se retiró la remediación previa como fuente activa; se condicionó la promoción de Vault Storage a corregir Batcave Auth como segunda GitHub App + Device Flow. |
| 2026-08-18 | 1 / Synapse Simulator | Se separó el vertical Genesis en dos Works coordinados con gates independientes. | AGENDA FOLLOWUP, reportado por el usuario | Genesis cerró Etapa A y espera el contrato del Simulator; el Simulator inició investigación contractual. Ninguno comenzó implementación. |
| 2026-08-21 | 1, 4, Executor | Se cerró la composición funcional de Genesis y se cambió el canal prioritario del primer vertical a CLI + AITAP + Executor. | AGENDA FOLLOWUP, decisión del usuario | El Work Genesis se renombra sin duplicarse; Synapse Simulator deja de ser precondición y continúa como línea posterior. |
| 2026-08-29 | 11 (nuevo) | Se completaron los cuatro coworks de investigación de Gravity/Orbital/Posture y las tres investigaciones diagnósticas de Codex derivadas (colisión de nombre, eliminación de COR, AUTH-OWNERSHIP-01). Se ejecutó el saneamiento documental resultante: renombre a Orbital Agentic State en cuatro documentos y corrección de atribución de Architect en el borrador de AUTHORIZATION. | Sesión externa de investigación (Claude Web) + Codex para diagnóstico y edición documental, reportado por el usuario | Se abre el Tema 11 con su estado consolidado, fuentes, próximos pasos y dependencias cruzadas con Temas 9 y 10. |
| 2026-08-24 | 1, 9 | Se cerraron fail-closed, gate CLI, Alfred Master-only y homologación de mensajes/exit codes; Genesis verificó el contrato de Authorization. | Actualización del usuario; cambios en `main`, `go test ./...` en verde | Se distinguió el tramo CLI cerrado del gate API/boundary Go→Node pendiente; Genesis quedó bloqueado por resolución de workspace del watcher, no por Authorization. |
| 2026-08-26 | 10 / PALADIN | El Work de distribución para desarrolladores e ingenieros externos fue renombrado PALADIN, nombre del producto Cognituum para ingenieros. Se presentó el principio de una plataforma con composición individual u organizacional. | AGENDA FOLLOWUP, decisión y material compartidos por el usuario | Se registró PALADIN como nombre cerrado; la composición, su cadena de autoridad, bootstrap, transiciones y propiedad del conocimiento permanecen pendientes de gobernanza. |
| 2026-08-29 | 11 / Gravity | Se completó la primera etapa de implementación real: persistencia `.bloom/.gravity/`, resolución activa, cálculo de masa, gramática ANTLR4 dual, parsers Go/TypeScript y preflight de build. | Work Génesis, reportado por el usuario | Se cerró el contrato de parseo y sus pruebas; integración con workflow, persistencia/firma autoritativa, Core y rollout quedan pendientes. |
| 2026-08-29 | 1 | Se confirmó, con logs de producción de cuatro días distintos, que el bloqueador de resolución de workspace del watcher de Mandates está corregido y desplegado — no es un blocker activo. Causa real: regresión de esquema (campos planos obsoletos vs. esquema multi-organización), corregida también en `dev-start`. Se identificó el alcance ampliado del mecanismo compartido de resolución (Vault, Ownership, Blueprint, Alfred, metadata) sin evidencia de fallo. | Codex, reportado por el usuario | Se actualiza el estado del Tema 1: el bloqueador de infraestructura queda cerrado; el roadmap avanza al paso 2 (action graph). |
| 2026-09-03 | 12 (nuevo) | Se consolida el hito transversal ROLES / Autoridad Organizacional Remota: Backend como verdad organizacional, Batcave como transporte/sincronización/cache, Nucleus como verificador y decisor efectivo, y Brain/Temporal como ejecución acotada. | Work ROLES, fuentes documentales y decisión del usuario | Se abre el Tema 12 y se informa a AGENDA FOLLOWUP. AUTHORIZATION conserva su enforcement local; el diseño del Authority Snapshot queda pendiente sin anticipar wire schema. |
