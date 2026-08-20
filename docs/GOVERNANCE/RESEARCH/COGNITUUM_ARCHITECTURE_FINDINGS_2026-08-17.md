# Cognituum Architecture Findings Register

**Estado:** registro de investigación  
**Fecha de corte:** 2026-08-17  
**Arquitectura normativa:**
[`../ARCHITECTURE/COGNITUUM_RESPONSIBILITY_BOUNDARIES.md`](../ARCHITECTURE/COGNITUUM_RESPONSIBILITY_BOUNDARIES.md)

## 1. Propósito

Este documento conserva hallazgos verificables del relevamiento arquitectónico
de Cognituum. Registra estado implementado, gaps, contradicciones, riesgos y
trabajo habilitado. No reemplaza la arquitectura normativa ni convierte una
observación del código actual en una decisión durable.

Los IDs son estables y append-only. Un hallazgo resuelto no se elimina: cambia
de estado y agrega evidencia de cierre.

## 2. Método y clasificación

- `NORMATIVO`: decidido por una fuente vigente.
- `IMPLEMENTADO`: confirmado mediante código, registro y call sites.
- `OBSERVADO`: confirmado por una prueba real ejecutada.
- `PROPUESTO`: arquitectura o trabajo todavía no implementado.
- `HISTÓRICO`: fuente superada, conservada como contexto.
- `CONTRADICCIÓN`: dos fuentes incompatibles.
- `ABIERTO`: falta evidencia o decisión.

Para implementación prevalece el código. Para ejecución/providers y
credenciales prevalecen respectivamente
[`PROVIDER-EXECUTION-SPEC.md`](../../CORTEX/PROVIDER-EXECUTION-SPEC.md) y
[`VAULT-STORAGE-SPEC.md`](../../CORTEX/VAULT-STORAGE-SPEC.md) como arquitectura
objetivo.

## 3. Resumen de hallazgos críticos

1. Brain ya posee la semántica y lifecycle que debe conservar, pero concentra
   además acceso directo a providers y credenciales.
2. AITAP todavía no implementa sus tres pilares operativos.
3. IonPump es una capacidad real y valiosa de Runner; el problema es su frontera,
   no la existencia de automatización DOM.
4. Vault actual no satisface el aislamiento user-scoped normativo y puede
   devolver plaintext por CLI.
5. Execution Layer no existe; OpenCode solo aporta evidencia standalone.
6. Alfred funciona localmente, pero todavía no es portable ni consume AITAP.
7. Batcave documentado excede ampliamente el código existente.
8. Mandate Genesis puede continuar sin AITAP, OpenCode o `dis` como bloqueantes.

## 4. Findings Register

| ID | Componente | Hallazgo | Clasificación | Evidencia | Impacto | Trabajo habilitado | Estado |
|---|---|---|---|---|---|---|---|
| CAF-001 | Brain | Conserva creación, estado, contexto, submit y parsing, pero también llama providers directamente | IMPLEMENTADO | `brain/core/intent_manager.py:2000-2191`; `brain/core/context_planning/gemini_router.py:17-186` | Acoplamiento Supply/Brain | Supply Contract y migración gradual | ABIERTO |
| CAF-002 | Brain | El registro declarativo nuevo solo incluye `ing` y `dis`; otros tipos siguen por caminos legacy | IMPLEMENTADO | `brain/core/intent_types.py:38-51,133-186` | Lifecycle fragmentado | Unificación progresiva del motor | ABIERTO |
| CAF-003 | AITAP | Routing inter-provider no está implementado | IMPLEMENTADO | `installer/aitap/src/aitap/commands/route/route_status.py:12-24` | No existe gateway operativo | Vertical mínimo Supply | ABIERTO |
| CAF-004 | AITAP | Integración con Nucleus Vault es placeholder | IMPLEMENTADO | `installer/aitap/src/aitap/commands/keys/keys_list.py:12-26` | No resuelve Credential References | Vault client target | ABIERTO |
| CAF-005 | AITAP | Accounting no posee store/eventos operativos | IMPLEMENTADO | Ausencia de implementación bajo `installer/aitap/src/aitap`; guardrail en `installer/aitap/AGENTS.md` | Consumo no centralizado | Accounting Contract | ABIERTO |
| CAF-006 | Cortex | El manifest declara permisos sobre Gemini, Claude y ChatGPT, aunque el content script estático solo matchea GitHub | IMPLEMENTADO | `installer/cortex/extension/manifest.json:8-29,40-46` | Superficie potencial mayor al uso estático | Auditoría y reducción de permisos | ABIERTO |
| CAF-007 | IonPump | Existe un engine real de recipes con navegación, click, type, select y watchers | IMPLEMENTADO | `brain/core/ionpump/ionpump_executor.py:250-315,581-592` | Capacidad reutilizable para Runner | Runner Boundary Extraction | ABIERTO |
| CAF-008 | IonPump/Runner | El engine no expresa una allowlist arquitectónica first-party/third-party | IMPLEMENTADO | Resolución por paquetes/selectores en `ionpump_executor.py:438-496`; límite solo documental | Riesgo de reintroducir DOM externo | Policy y allowlist de superficies | ABIERTO |
| CAF-009 | Vault | Nucleus usa OS keyring bajo servicio global `bloom-brain` | IMPLEMENTADO | `installer/nucleus/internal/vault/vault.go:64-95` | No prueba aislamiento user-scoped | Vault User-Scoped Migration | ABIERTO |
| CAF-010 | Vault | Gate actual autoriza todos los scopes únicamente a RoleMaster | IMPLEMENTADO | `installer/nucleus/internal/vault/vault.go:39-62` | No representa usuario/dispositivo/grant request-scoped | Capability Grants + identidad | ABIERTO |
| CAF-011 | Vault | CLI `request` puede devolver o imprimir el secreto en plaintext | IMPLEMENTADO | `installer/nucleus/internal/vault/vault.go:435-473` | Exposición en stdout/logs/procesos | Hardening del contrato de acceso | ABIERTO |
| CAF-012 | Vault | AES-256-GCM y namespace `{user_id}:{provider}:{key_id}` no están implementados | CONTRADICCIÓN | Target: `docs/CORTEX/VAULT-STORAGE-SPEC.md`; actual: `vault.go` | Gap normativo de seguridad | PoC AEAD multiusuario | ABIERTO |
| CAF-013 | GitHub Identity | `repo_ops` y `batcave_auth` no forman un flujo end-to-end implementado | IMPLEMENTADO | Milestone actual singular en `installer/conductor/workspace/onboarding/milestone-registry.js:128-136`; spec §2 | Blast radius y ambigüedad | GitHub Identity Split | ABIERTO |
| CAF-014 | Synapse/Onboarding | `GITHUB_APP_AUTHORIZED` no usa todavía el discriminador normativo `app` | CONTRADICCIÓN | `milestone-registry.js:128-136`; `VAULT-STORAGE-SPEC.md` §2.3 | Resolución de evento ambigua | Schema/event migration | ABIERTO |
| CAF-015 | Provider Backend | Brain llama Gemini REST directamente con rotación intraprovider | IMPLEMENTADO | `brain/core/context_planning/gemini_router.py:24-29,69-101,130-186` | Responsabilidad target de AITAP | Adapter cloud inicial | ABIERTO |
| CAF-016 | Provider Backend | Brain/Ollama y Alfred/Ollama implementan roles locales separados sin adapter común | IMPLEMENTADO | `brain/core/bisp/ollama_manager.py:31-49,169-185`; `installer/alfred/src/alfred/providers/ollama_text_provider.py` | Semántica local fragmentada | Decisión local-through-AITAP | ABIERTO |
| CAF-017 | Provider Backend | No existe lifecycle general de pausa/reanudación por key faltante o endpoint caído | CONTRADICCIÓN | Normativo: `PROVIDER-EXECUTION-SPEC.md` §4; ausencia de backend común | Fallback incompleto | Provider fallback lifecycle | ABIERTO |
| CAF-018 | Contrato D | Existe schema y validador aislado, pero no productor ni consumidor real de operaciones | IMPLEMENTADO | `brain/core/intent/fs_contracts.py:14-19,118`; `brain/core/intent/schema/bsip_response_contrato_d_v0_1.json` | No hay integración E2E | Batería de adherencia | ABIERTO |
| CAF-019 | Execution Layer | No existe componente ni ubicación productiva | IMPLEMENTADO | `AGENTS.md:39-44`; ausencia de directorio/adapter | Falta capacidad reemplazable | Execution Contract | ABIERTO |
| CAF-020 | OpenCode | Existen referencias y una prueba standalone, pero no adapter productivo | IMPLEMENTADO | `installer/aitap/experiments/OPENCODE_IMPLEMENTER_TEST_PROTOCOL.md`; ausencia de call sites | No demuestra conformidad Cognituum | OpenCode Conformance | ABIERTO |
| CAF-021 | Installer/Metamorph | OpenCode no está en inventario managed/external | IMPLEMENTADO | `installer/metamorph/internal/inspection/managed_defs.go:29-37,53-86` | No puede instalarse/verificarse como provider | Integración posterior al contrato | ABIERTO |
| CAF-022 | Alfred | Backend conversacional real ofrece Ollama default y Gemini directo opt-in | IMPLEMENTADO | `installer/alfred/src/alfred/server.py:70-120`; `chat.py:104-126` | Camino cloud transicional fuera de AITAP | Migración cloud posterior | ABIERTO |
| CAF-023 | Alfred | Cliente AITAP está diseñado pero no wireado y falla explícitamente | IMPLEMENTADO | `installer/alfred/src/alfred/aitap/client.py:1-9`; `installer/alfred/AGENTS.md` | Integración bloqueada por Supply real | Alfred Device Identity + AITAP | ABIERTO |
| CAF-024 | Alfred | Contexto conversacional contiene path y organización hardcodeados | IMPLEMENTADO | `installer/alfred/src/alfred/chat.py:49-66` | No es portable/multi-org | Portabilidad e identidad | ABIERTO |
| CAF-025 | Batcave | Código actual inicializa paths/config pero no arranca servidor | IMPLEMENTADO | `installer/batcave/src/main.ts:31-45` | Auth/BlindJudge/Relay son target | Batcave Minimum Vertical | ABIERTO |
| CAF-026 | Batcave | Arquitectura documentada menciona BlindJudge/Relay no presentes en `src` | CONTRADICCIÓN | `docs/BATCAVE/BATCAVE_ARCHITECTURE.md`; inventario `installer/batcave/src` | Documentación puede confundirse con implementación | Vertical + actualización de estado | ABIERTO |
| CAF-027 | Accounting/Evidence | No existen contratos operativos ni ownership materializado | IMPLEMENTADO | AITAP scaffold y Execution Layer ausente | Auditoría transversal incompleta | Correlation Contract | ABIERTO |
| CAF-028 | Mandate Genesis | AITAP, OpenCode y `dis` no son dependencias demostradas del primer vertical | IMPLEMENTADO | `docs/MANDATE/Mandate_Genesis_Truth_Matrix_and_Execution_Roadmap_v1.md:132,246`; código citado allí | Riesgo de falso bloqueo | Reparación vertical independiente | CONFIRMADO |
| CAF-029 | Agenda | La Agenda previa contradice la precedencia ordenada por este Work para Vault/Batcave Auth | CONTRADICCIÓN | `docs/CONTROL/AGENDA_MAESTRA.md:279+`; reglas del Work y Vault spec | Drift de coordinación | Handoff posterior a Agenda | ABIERTO |
| CAF-030 | Execution Layer | El ownership físico queda fijado en `installer/execution/`, separado de Brain y AITAP, con core neutral y adapters por provider | NORMATIVO | `docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_LAYER_CONFORMANCE_v1_0.md` §2 | Cierra ubicación sin afirmar implementación | Scaffold y prueba `runtime-swap-no-brain-change` | CERRADO-DISEÑO |
| CAF-031 | Execution Providers | OpenCode, Codex CLI y Claude Code CLI comparten contratos `cognituum.execution/v1` y batería EXC-001..EXC-010; ninguna conformidad fue observada aún | NORMATIVO / ABIERTO | `COGNITUUM_EXECUTION_LAYER_CONFORMANCE_v1_0.md` §§3-6 | Cierra schema; mantiene honesto el gate empírico | Ejecutar matriz y adjuntar Evidence | ABIERTO-EVIDENCIA |
| CAF-032 | Execution Reconciliation | El primer cierre de contracts no estaba reconciliado campo por campo con el árbol y pipeline reales; se detectó además drift `.raw_output.txt` vs `.raw_output.json` | CONTRADICCIÓN / ABIERTO | `docs/GOVERNANCE/ARCHITECTURE/COGNITUUM_EXECUTION_RECONCILIATION_2026-08-20.md` §§3-5; `tree/bloom/bloom_project_tree.txt`; `brain/core/intent/response_parser.py`; `brain/core/intent/staging_manager.py` | Bloquea promover schemas y correr EXC-001..EXC-010 | Resolver los tres puntos secuenciales del pedido de reconciliación | EN CURSO |

## 5. Gaps por componente

### Brain

- Extraer Supply sin mover semántica, planificación o parsing fuera de Brain.
- Unificar progresivamente los lifecycles legacy y declarativos.
- Introducir decisión explícita entre inferencia y ejecución prolongada.

### AITAP

- Implementar Supply Request/Result, capabilities, adapters y routing.
- Integrar Credential References con Vault sin almacenar secretos.
- Materializar Accounting por consumidor.

### Nucleus y Vault

- Sustituir gate global Master-only por identidad y grants acotados.
- Implementar user scope, AEAD, rotación y borrado real.
- Evitar exposición de plaintext mediante CLI.
- Mantener Governance separado del scheduling cognitivo.

### Runner, Cortex, Synapse e IonPump

- Extraer una frontera Runner first-party verificable.
- Clasificar recipes por superficie.
- Reducir permisos de Cortex cuando migre el último consumidor externo.
- Mantener Synapse como transporte neutral.

### Provider Backend

- Normalizar cloud/local.
- Implementar health, pausa y reanudación.
- Prohibir fallback silencioso o cambio de provider sin consentimiento.

### Execution Layer y OpenCode

- Definir lifecycle y contratos antes del adapter.
- Probar OpenCode por conformidad, no copiar su API como arquitectura.
- Definir bridge de grants Nucleus y Evidence verificable.
- Completar primero el gate CAF-032; los schemas v1 son provisionales y la
  batería cross-CLI permanece bloqueada.

### Alfred

- Eliminar paths/identidad organizacional hardcodeados.
- Diseñar alta y revocación por dispositivo.
- Migrar cloud directo a AITAP cuando Supply exista.
- Mantener Ollama/local como decisión explícita pendiente.

### Batcave

- Implementar un vertical mínimo de Auth, BlindJudge y Relay.
- Mantenerlo fuera de lenguaje natural, Supply y ejecución local.

### Installer / Metamorph

- Incorporar Execution Providers solo después de cerrar el contrato de
  conformidad y distribución.

## 6. Stubs, simuladores y caminos rotos

| Pieza | Estado |
|---|---|
| AITAP routing | Placeholder explícito |
| AITAP Vault client | Placeholder explícito |
| AITAP Accounting | Sin implementación operativa |
| Alfred -> AITAP | Cliente no wireado; error deliberado |
| Execution Layer | Inexistente |
| OpenCode adapter | Inexistente |
| Batcave server | TODO en `main.ts` |
| Contrato D E2E | Validador aislado, sin productor/consumidor |
| Vault user-scoped AEAD | Target normativo |
| Provider pause/resume | Target normativo |
| Runner allowlist | No materializada |

## 7. Contradicciones documentales

| ID | Fuente A | Fuente B | Tema | Precedencia | Acción futura |
|---|---|---|---|---|---|
| CAC-001 | Vault spec | Vault Go actual | AES-GCM/user scope vs keyring global/Master | Spec target; código actual | Diseñar migración y tests |
| CAC-002 | Vault spec | Agenda | OAuth App Batcave Auth vs decisión previa Device Flow | Spec para este Work | Corregir Agenda tras aprobación |
| CAC-003 | Provider spec | Cortex manifest | Sin superficie IA externa vs permisos actuales | Spec | Reducir permisos tras migración |
| CAC-004 | Provider spec | IonPump actual | Límite third-party no materializado en engine | Spec | Allowlist + clasificación |
| CAC-005 | AITAP target | Brain/Alfred | Gateway central vs providers directos | Target AITAP; código para actual | Migrar gradualmente |
| CAC-006 | Execution Layer separada | Diagrama AITAP v1.1 | Componente abstracto vs invocación OpenCode local desde Brain | Arquitectura durable | Actualizar vocabulario futuro |
| CAC-007 | Batcave architecture | Batcave source | Auth/BlindJudge/Relay documentados vs ausentes | Código actual | Implementar o marcar target |
| CAC-008 | Roadmap Mandate | Genesis actual | Motor genérico vs workflow especial | Código actual; roadmap target | No bloquear vertical inicial |

`REMEDIACION-TECNICA-v1.md` queda excluido como candidato a prevalecer.

## 8. Riesgos

| ID | Riesgo | Probabilidad | Impacto | Guardrail | Owner propuesto |
|---|---|---|---|---|---|
| CAR-001 | AITAP absorbe parsing o ejecución | Media | Alto | Contratos y fronteras negativas | AITAP/Architecture |
| CAR-002 | Nucleus se convierte en scheduler | Media | Alto | Grants declarativos, no planes | Nucleus |
| CAR-003 | “Retirar DOM” elimina Runner valioso | Alta | Alto | Formular siempre first-party vs third-party | Runner/Cortex |
| CAR-004 | OpenCode define el contrato por conveniencia | Alta | Alto | Conformance contra abstracción previa | Execution Layer |
| CAR-005 | Migración Vault expone secrets | Media | Crítico | PoC, redaction y pruebas multiusuario | Vault/Security |
| CAR-006 | Accounting interpreta contenido | Media | Medio | Solo métricas y correlación | AITAP |
| CAR-007 | Documentación se toma como implementación | Alta | Alto | Findings con evidencia/call sites | Governance |
| CAR-008 | Genesis queda bloqueado por arquitectura transversal | Media | Alto | Dependency map explícito | Mandate/Nucleus |

## 9. Work packages habilitados

| Finding IDs | Work package | Precondición | Entregable | Criterio de aceptación |
|---|---|---|---|---|
| CAF-001, 003-005, 015-017 | Supply Contract & Provider Backend | Arquitectura publicada | Contratos + adapter cloud/local | Swap de provider sin cambiar BISP; pausa explícita |
| CAF-009-014 | Vault User-Scoped Migration | Identidad mínima | Store/API/migración/tests | Aislamiento, rotación, delete y logs seguros |
| CAF-006-008 | Runner Boundary Extraction | Inventario de recipes | Allowlist y separación | Externo rechazado; first-party preservado |
| CAF-018-021 | Execution Contract & Conformance | Contrato preliminar | Harness + informe OpenCode | Eventos/result/evidence recuperables |
| CAF-022-024 | Alfred Device Identity | Modelo Vault/Identity | Alta/revocación/threat model | Renderer sin secret; revocación individual |
| CAF-025-026 | Batcave Minimum Vertical | GitHub Identity Split | Auth/BlindJudge/Relay | Instrucción no autorizada rechazada |
| CAF-027 | Accounting & Evidence Correlation | IDs comunes | Eventos mínimos | Trazabilidad sin mezclar ownership |
| CAF-028 | Mandate Genesis Vertical Repair | Nucleus/Temporal/Brain | E2E persistido | Finalización idempotente sin AITAP/OpenCode |

## 10. Dependency Map

### Puede comenzar ahora

- Supply Contract.
- Execution Contract.
- Vault user-scoped PoC.
- Inventario y boundary Runner.
- Identidad de dispositivo Alfred.
- Batería de conformidad OpenCode.
- Reparación Mandate Genesis.

### Dependencias reales

- Migrar Brain/Alfred cloud requiere Supply operativo.
- OpenCode productivo requiere contrato Execution y grants.
- Reducir permisos Cortex requiere migrar el último consumidor externo.
- Alfred multi-device requiere identidad y storage seguro.

### Falsos bloqueantes

- AITAP, OpenCode y `dis` no bloquean el primer Genesis funcional.
- UI completa de Alfred no bloquea su diseño de identidad.
- Metamorph no necesita conocer OpenCode antes del contrato de conformidad.

## 11. Hallazgos resueltos

| ID | Resolución | Evidencia | Fecha |
|---|---|---|---|
| CAF-028 | Confirmado como dependencia falsa para Genesis inicial | Truth Matrix + código de workflow | 2026-08-17 |

## 12. Regla de cierre y mantenimiento

Para cerrar un finding se deben agregar:

- commit o artefacto;
- prueba ejecutada;
- fecha;
- evidencia nueva por archivo/línea;
- decisión arquitectónica afectada;
- work package que lo resolvió.

No se reutilizan IDs. Los cambios de arquitectura normativa se realizan en el
documento de Responsibilities/Boundaries y se enlazan desde aquí.

## 13. Limitaciones del relevamiento

- No se observaron flujos cloud reales durante este relevamiento.
- Las pruebas Python no pudieron ejecutarse porque el runtime disponible no
  contenía `pytest`.
- Las pruebas Go no llegaron a compilar dentro del sandbox por acceso denegado
  al cache global de build.
- La evidencia etiquetada `IMPLEMENTADO` procede de inspección estática de
  imports, registros, call sites, handlers, schemas y stubs; no se promueve a
  `OBSERVADO` sin una ejecución verificable.
- El estado puede cambiar; por eso este documento tiene fecha de corte y no
  reemplaza el código.
