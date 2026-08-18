# BTIPS / Cognituum — Agenda Maestra

**Propósito:** fuente única de control y coordinación de los ocho frentes activos. Esta agenda no sustituye las fuentes técnicas de cada tema: registra su estado consolidado, dependencias, próximos pasos y decisiones vigentes.

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
| Agenda maestra | Cerrada | Solo se actualiza en esta sesión mediante reportes del usuario. |

## Material para Resolución Arquitectónica Transversal

La investigación transversal debe usar el split vigente de CORTEX por dominio, sin volver a tomar `REMEDIACION-TECNICA-v1.md` como fuente activa:

| Eje de análisis | Material vigente o candidato | Límite de coordinación |
|---|---|---|
| Supply | `docs/CORTEX/PROVIDER-EXECUTION-SPEC.md` | SDKs/endpoints oficiales, modelos locales y fallbacks; nunca DOM de providers externos. |
| Identity | `docs/CORTEX/VAULT-STORAGE-SPEC.md` | Cifrado, user scope y tokens; no promover hasta corregir §2.2 para GitHub App + Device Flow. |
| Synapse / DOM | `docs/CORTEX/PROVIDER-EXECUTION-SPEC.md` + `docs/CORTEX/AUTHORITY_BOUNDARY.md` | Se preserva automatización first-party del Cognituum Runner; se excluye permanentemente DOM de proveedores externos. |
| Governance | `docs/BATCAVE/BATCAVE_ARCHITECTURE.md` + handoff de GitHub App | Batcave autoriza y enruta; Nucleus firma/ejecuta; la segunda GitHub App permanece separada de Repo Ops. |

## Tabla compacta de control

| # | Tema | Estado consolidado | Próximo paso concreto | Dependencia inmediata |
|---|---|---|---|---|
| 1 | Mandate Genesis | Etapa A del vertical con Synapse Simulator cerrada; implementación en gate | Aprobar contrato del Simulator y luego cerrar diseño de integración Genesis | Synapse Simulator contractual; Brain/Temporal/Core locales |
| 2 | Core UI Redesign | Sidebar y Profiles cerrados | Definir/armar panel derecho, Home y Wisdom tras diagnóstico | Switch de organización; Alfred; contrato de Mandate |
| 3 | BSIP Response | Validador aislado listo; formato de patch con evidencia inicial | Ejecutar batería de adherencia antes de cerrar schema | Modelos de frontera; OpenCode; canal API/web |
| 4 | AITAP | Frontera arquitectónica cerrada; scaffold incompleto | Resolver integración real de Contrato D y alta de dispositivos | BSIP Response; Nucleus; Alfred |
| 5 | OpenCode | Instalación multiplataforma y rollout básico implementados; adapter pendiente | Certificación operativa multiplataforma | Sistemas destino; comando `serve`; Metamorph |
| 6 | Alfred | Backend/pipe avanzados; UI y recepción pendientes | Diseñar alta de dispositivo y construir UI de chat | AITAP; Contrato D; Core UI |
| 7 | CORTEX / IonPump | Ownership documental dividido; Vault spec pendiente de corrección | Corregir §2.2 de Vault y migrar referencias antes de retirar la spec previa | GitHub App + Device Flow; Batcave; specs nuevas |
| 8 | Batcave | Arquitectura multi-org definida; decisión GitHub App vigente | Corregir regresión de Batcave Auth en Vault spec y actualizar referencias | CORTEX; Nucleus; Alfred remoto |

---

## 1. Mandate Genesis en Workspace Core

**Estado actual**

El paso de Onboarding a Core para Genesis avanzó: D-22 y D-23 están implementados, pero todavía no recibieron QA manual end-to-end. El mecanismo de eventos y la presentación en Core fueron trabajados; sin embargo, el mandate real permanece bloqueado por el watcher y el registro de activities necesarias para completar el workflow.

Se abrió el Work **MANDATE GENESIS — SYNAPSE SIMULATOR END-TO-END** para priorizar un primer corte vertical determinístico antes de depender de AITAP, credenciales, browser o modelos reales. Su Etapa A de relevamiento y diseño está completa y la implementación permanece detenida en gate de aprobación. El diseño reconstruyó el flujo consumidor, los blockers internos, los contratos que necesita consumir, ownership, idempotencia, recuperación y la continuidad Brain/Temporal/Core.

En paralelo se abrió el Work **SYNAPSE SIMULATOR — CONTRACT, FIXTURES AND FAILURE MODES**, todavía en investigación y diseño. Es dueño de definir una contraparte cognitiva determinística, reusable, agnóstica y headless: envelopes request/response, correlación, idempotencia, fixtures versionados, failure modes, retry/replay/recovery y observabilidad. No implementará hasta entregar su informe y recibir aprobación explícita.

La división de ownership queda fijada: Genesis consume la frontera y conserva el workflow, Brain/intents, continuidad de Temporal y proyección a Core; Synapse Simulator provee la contraparte determinística genérica. El Simulator no conoce fases de Genesis, Domains, Genes, Temporal ni estado canónico de Mandates. La futura migración al motor genérico Mandate → Actions → Intents permanece como dirección arquitectónica, pero no bloquea este vertical.

**Fuentes de verdad**

- `docs/MANDATE/BLOOM_Estado_Consolidado_Takeaway_v1.md`
- `docs/MANDATE/BLOOM_Mandate_Genesis_Roadmap_Maestro_v3_3.md`
- `docs/MANDATE/Mandate_Genesis_Completion_Plan_v1.md`
- `docs/CONDUCTOR/WORKSPACE/Bloom_Conductor_Workspace_Core_UI_01.md`

**Próximo paso concreto**

1. Recibir y aprobar el informe contractual de **SYNAPSE SIMULATOR — CONTRACT, FIXTURES AND FAILURE MODES**.
2. Entregar ese contrato al Work **MANDATE GENESIS — SYNAPSE SIMULATOR END-TO-END** para cerrar su integración propuesta sin asumir detalles de la contraparte.
3. Aprobar explícitamente la Etapa B de cada Work antes de implementar.
4. Mantener QA de D-22/D-23 y los blockers internos comprobados dentro del plan de ejecución del vertical, sin sustituirlos por eventos o estados simulados.

**Entorno recomendado**

Works de investigación separados hasta superar sus gates; después, Codex o Claude Code para cambios verificables sobre Brain, Go/Temporal, Core y el Simulator. Esta sesión conserva las devoluciones y coordina dependencias, sin retener el análisis detallado de ambos Works en contexto activo.

**Dependencias cruzadas**

- Synapse Simulator: contrato genérico aprobado antes de fijar detalles de integración del consumidor Genesis.
- Tema 2: D-25 define la forma final de la tab y dónde integra Genesis en Core.
- Tema 3: el motor genérico de intents y la respuesta estructurada condicionan la evolución posterior.
- Tema 6: el flujo de Core comparte superficie con Alfred, pero no debe mezclar scopes.
- AITAP, OpenCode, credenciales, proveedores reales y `dis/` no son bloqueantes para el primer corte.

**Decisiones/riesgos abiertos**

- Ambos Works están en gate de diseño: no interpretar su apertura ni el cierre de Etapa A como implementación iniciada.
- Genesis no debe inventar el contrato del Simulator; el Simulator no debe incorporar lógica de Genesis.
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

## Cola de prompts para sesiones externas

| Prioridad | Tema | Prompt/entregable a preparar | Precondición |
|---|---|---|---|
| Alta | 1 / Synapse Simulator | Aprobar diseño contractual de `SYNAPSE SIMULATOR — CONTRACT, FIXTURES AND FAILURE MODES` | Informe de Etapa A del Simulator; implementación detenida en gate |
| Alta | 1 | Cerrar integración propuesta de `MANDATE GENESIS — SYNAPSE SIMULATOR END-TO-END` | Contrato del Simulator aprobado; implementación Genesis detenida en gate |
| Alta | 5 | Certificación operativa de instalación/servicio OpenCode en Windows, macOS y Linux | Acceso a los tres sistemas; confirmar comando real de `serve` |
| Alta | 3 + 5 | Batería de adherencia API/web y OpenCode para decidir formato de patch, checksum y scope usando `validate-contract` | Prompt de ejecución pendiente de preparar; acceso a modelos, OpenCode y comando local |
| Alta | 7 | Corregir §2.2 de Vault Storage y migrar referencias desde la remediación anterior | GitHub App + Device Flow confirmado; mapear referencias a migrar |
| Alta | 8 | Migración de arquitectura/auth de Batcave a GitHub App + Device Flow | Corregir primero la regresión de Vault Storage y confirmar scopes mínimos |
| Media | 4 + 6 | Diseño de identidad y alta de dispositivos AITAP/Alfred | Definir caso mobile sin Nucleus local |
| Media | 2 | Diagnóstico del panel derecho de Core | Acceso a resolver de organización y componentes reales |
| Media | 5 | Diseño de Implementation Layer de OpenCode | Contrato de gobernanza con Nucleus por definir |

## Registro cronológico de avances

| Fecha | Tema(s) | Avance reportado | Fuente / sesión externa | Actualización realizada aquí |
|---|---|---|---|---|
| 2026-08-15 | 1–8 | Creación de la agenda y consolidación inicial basada en las fuentes existentes. | Sesión de control | Se fijaron ownership exclusivo, OpenCode como nombre vigente y GitHub App + Device Flow como criterio cerrado. |
| 2026-08-16 | 3, 5 | Se integró y verificó el validador aislado de Contrato D; se decidió probar adherencia de modelos antes de diseñar el adapter de OpenCode. | Sesión externa de ejecución, reportada por el usuario | Se cerró el traslado del validador; se registraron como abiertos el productor, el consumidor y el adapter. |
| 2026-08-16 | 3, 5 | Primera prueba headless de OpenCode v1.18.18 con salida JSON parseable y edición/verificación reales. | Sesión externa de investigación, reportada por el usuario | Se agregó evidencia para el formato de patch; no se cerró el schema ni se inició el adapter. |
| 2026-08-17 | 5 | Se implementaron instalación Electron y rollout básico de Metamorph para OpenCode en tres plataformas. | Sesión externa de implementación, reportada por el usuario | Se cerró distribución inicial; se abrió certificación operativa, gestión de servicio en Metamorph, versionado y autenticación. |
| 2026-08-17 | 7, 8 | Split documental de la remediación CORTEX y corrección de alcance de automatización DOM. | Actualización del usuario sobre fuentes y alcance | Se retiró la remediación previa como fuente activa; se condicionó la promoción de Vault Storage a corregir Batcave Auth como segunda GitHub App + Device Flow. |
| 2026-08-18 | 1 / Synapse Simulator | Se separó el vertical Genesis en dos Works coordinados con gates independientes. | AGENDA FOLLOWUP, reportado por el usuario | Genesis cerró Etapa A y espera el contrato del Simulator; el Simulator inició investigación contractual. Ninguno comenzó implementación. |
