# Cognituum — Responsabilidades, fronteras y contratos

**Estado:** arquitectura normativa durable  
**Versión:** 1.0  
**Fecha:** 2026-08-17  
**Ámbito:** Cognituum / BTIPS  
**Registro de evidencia:**
[`../RESEARCH/COGNITUUM_ARCHITECTURE_FINDINGS_2026-08-17.md`](../RESEARCH/COGNITUUM_ARCHITECTURE_FINDINGS_2026-08-17.md)

## 1. Propósito

Este documento define quién posee cada responsabilidad arquitectónica de
Cognituum, qué decisiones puede tomar cada componente, qué capacidades puede
ejecutar y qué fronteras no debe cruzar.

Es una fuente normativa de arquitectura. No afirma que todo lo aquí definido
esté implementado. El estado real, los stubs, las contradicciones y la evidencia
por archivo se conservan en el registro de hallazgos asociado.

La propiedad principal que gobierna esta arquitectura es:

> El Intent, el BISP y el Mandate mantienen su significado aunque cambien el
> modelo, el proveedor, el mecanismo de suministro de inteligencia, la identidad
> utilizada o el runtime de ejecución.

## 2. Fuentes y precedencia

Para ejecución de inferencia, automatización y fallbacks prevalece
[`PROVIDER-EXECUTION-SPEC.md`](../../CORTEX/PROVIDER-EXECUTION-SPEC.md).

Para secretos, cifrado, aislamiento por usuario e identidad GitHub prevalece
[`VAULT-STORAGE-SPEC.md`](../../CORTEX/VAULT-STORAGE-SPEC.md).

Como marco semántico general se utiliza
[`BTIPS_Bloom_Technical_Intent_Package_v6_0.md`](../../BTIPS_Bloom_Technical_Intent_Package_v6_0.md).
Para AITAP prevalecen
[`AITAP_Decision_Arquitectonica_Gateway_vs_Ejecucion.md`](../../AITAP/AITAP_Decision_Arquitectonica_Gateway_vs_Ejecucion.md)
y
[`AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md`](../../AITAP/AITAP_Arquitectura_Grifo_Orquestadores_v1_0.md),
excepto donde una formulación posterior de este documento separa de forma más
estricta la Execution Layer de un runtime concreto.

El código define el estado implementado, no reemplaza silenciosamente una
decisión normativa. `REMEDIACION-TECNICA-v1.md` y las investigaciones previas
denominadas “Resolución Arquitectónica Transversal” no son fuentes vigentes.

## 3. Principios e invariantes

### 3.1 Semántica durable

Brain conserva el significado del Intent/BISP. El proveedor de inteligencia y
el runtime de ejecución son reemplazables. Ningún identificador de modelo,
provider o herramienta forma parte necesaria de la semántica del Intent.

### 3.2 Supply no es Execution

Intelligence Supply obtiene razonamiento o generación. Execution aplica trabajo
mediante herramientas, sesiones y efectos verificables. Una consulta puede usar
Supply sin conceder acceso a filesystem; una ejecución puede solicitar Supply
sin convertir al gateway en executor.

### 3.3 Gobernanza no es scheduling cognitivo

Nucleus decide si una capacidad está autorizada y bajo qué scope. Brain decide
qué trabajo cognitivo corresponde. Execution Layer decide cómo conducir una
sesión autorizada. Nucleus no ordena los pasos internos del razonamiento ni
selecciona modelos o runtimes.

### 3.4 Custodia no es routing

Vault cifra, almacena, rota, revoca y entrega un secreto bajo autorización. No
elige provider, modelo ni Execution Provider. AITAP mantiene referencias de
credenciales, pero no se convierte en custodio físico del secreto.

### 3.5 Automatización DOM precisa

> Cognituum sí utiliza automatización DOM.

La automatización DOM first-party es válida y pertenece a Cognituum Runner. La
automatización del DOM de proveedores IA externos —incluidos `claude.ai`,
`chatgpt.com`, `grok.com`, `aistudio.google.com` y equivalentes— queda fuera de
alcance. Captura de contexto, automatización first-party e inferencia son tres
responsabilidades diferentes.

### 3.6 Least privilege e identidad explícita

Todo secreto es user-scoped. Todo acceso deriva el usuario de una sesión
autenticada, no de un parámetro libre del llamador. Repo Ops y Batcave Auth usan
apps, tokens, scopes, rotación y `key_id` separados.

### 3.7 Accounting no es Evidence

AITAP produce Accounting sobre consumo de inteligencia. Execution Layer produce
Evidence sobre efectos de ejecución. Ambos comparten IDs de correlación, pero
conservan ownership y semántica diferentes.

## 4. Glosario canónico

- **Intent:** unidad semántica de propósito, contexto y restricciones.
- **BISP:** paquete durable de trabajo cognitivo-ingenieril: intent, objetivo,
  contexto, decisiones, findings, estado y outputs.
- **Mandate:** unidad gobernada de autoridad y trabajo, descompuesta en Actions
  e Intents.
- **Brain:** orquestador cognitivo que conserva la semántica y lifecycle del
  Intent/BISP.
- **Intelligence Supply:** capacidad de obtener razonamiento o generación sin
  conceder herramientas de ejecución.
- **AITAP:** gateway de Intelligence Supply; enruta provider/model, controla
  disponibilidad y failover y registra Accounting.
- **Governance:** ownership, policy, scopes, grants, consentimientos,
  denegaciones, firma y auditoría.
- **Vault:** custodio user-scoped de secretos cifrados.
- **Identity Reference:** identificador autenticado de usuario, dispositivo,
  organización o app; nunca el secreto.
- **Cognituum Runner:** runtime local de superficies propias que parsea,
  empaqueta y automatiza first-party bajo policy.
- **Cortex:** extensión Chromium de captura de contexto y transporte.
- **Synapse:** protocolo y bridge de comandos, eventos, correlación y handshake.
- **IonPump:** intérprete de recipes declarativas que produce comandos de
  automatización para Runner.
- **Provider Backend:** adapter que consume un SDK/API oficial o endpoint local.
- **Execution Layer:** capacidad abstracta que administra ejecuciones
  prolongadas, sesiones, eventos, cancelación, resultado y Evidence.
- **Execution Provider:** runtime concreto conforme al contrato de Execution
  Layer, por ejemplo OpenCode.
- **Execution Package:** instrucción portable de ejecución con objetivo, estado,
  restricciones, inputs, criterios y capacidades solicitadas.
- **Accounting:** registro de tokens, costo, latencia, provider/model, consumidor
  y resultado operacional de Supply.
- **Evidence:** prueba verificable de lo ejecutado: eventos, herramientas, tests,
  diff, hashes, timestamps y resultados.

## 5. Planos arquitectónicos

```text
Semantic / Control Plane
  Intent · BISP · Mandate -> Brain / Alfred

Intelligence Supply Plane
  Brain / Alfred -> AITAP -> Provider Backend -> API o endpoint local

Credential Plane
  Identity -> Nucleus Vault -> Credential Reference / uso efímero

Governance Plane
  Nucleus -> Policy / Grant -> Runner · Vault · Execution Layer

Runner / Context Plane
  Cortex -> Synapse -> Brain
  Cognituum Runner + IonPump -> automatización first-party

Execution Plane
  Brain -> Execution Layer -> Execution Provider -> tools/filesystem/tests

Accounting / Evidence Plane
  AITAP -> Accounting
  Execution Layer -> Evidence
```

### 5.1 Ownership de estado

| Estado canónico | Owner |
|---|---|
| Intent/BISP y decisiones cognitivas | Brain |
| Conversación y contexto de sesión | Alfred |
| Routing, salud de providers y Accounting | AITAP |
| Secretos y lifecycle de credenciales | Vault bajo Nucleus |
| Ownership, policy, grants y auditoría | Nucleus |
| Sesión y lifecycle de ejecución | Execution Layer |
| Resultado nativo de tools | Execution Provider, proyectado por Execution Layer |
| Contexto capturado del navegador | Cortex hasta su entrega; luego el consumidor |
| Estado de automatización first-party | Cognituum Runner |
| Instalación, versión y health de runtimes | Installer/Metamorph |

## 6. Matriz de responsabilidades

| Componente | Es dueño de | Decide | Ejecuta | Recibe | Devuelve | No debe hacer |
|---|---|---|---|---|---|---|
| Brain | Semántica y lifecycle BISP | Plan, contexto e inferencia vs ejecución | Orquestación y comandos internos | Intent, contexto y resultados | BISP y resultados validados | Custodiar secretos o acoplarse a un provider/runtime |
| AITAP | Supply y Accounting | Provider/model, disponibilidad y failover permitido | Llamada de inferencia por adapters | Supply Request y referencias | Supply Result crudo normalizado | Parsear BISP, tocar filesystem o gobernar |
| Nucleus | Ownership y autoridad | Policy, scopes, grants, firma y denegación | Actos de governance | Solicitudes de capacidad | Grant, denial y auditoría | Planificar Intents o elegir provider/runtime |
| Vault | Secretos | Acceso, rotación, revocación y borrado según grant | Cifrado/descifrado efímero | Identity y Credential Reference | Handle/secreto request-scoped | Routing o scheduling |
| Runner | Runtime propio | Orden local permitido por paquete y policy | DOM first-party, parseo y empaquetado | BTIP, contexto y grants | Eventos y paquetes | Actuar en DOM de providers IA |
| Cortex | Contexto del navegador | Qué contexto autorizado capturar | Lectura, captura y transporte | Pestaña/UI y mensajes | Eventos/contexto | Inferencia, persistencia de secretos o ejecución third-party |
| Synapse | Transporte | Correlación y handshake técnico | Entrega de comandos/eventos | Envelopes | ACK y eventos | Decidir semántica o policy |
| IonPump | Interpretación de recipes | Próximo paso declarado | Comandos Runner first-party | Recipe `.ion` | Comandos Synapse | Ejecutar recipes sobre providers IA externos |
| Provider Backend | Inferencia concreta | Retry técnico autorizado | SDK/API/endpoint local | Provider Execution Request | Provider Execution Result | Cambiar Intent o hacer fallback sin consentimiento |
| Execution Layer | Lifecycle de ejecución | Execution Provider conforme a requisitos/grants | Sesiones, coordinación de tools y cancelación | Execution Package y Grant | Events, Result y Evidence | Razonar el Intent o custodiar keys |
| OpenCode | Ejecución concreta | Decisiones locales autorizadas | Read/edit/bash/test/diff | Package adaptado | Resultado nativo | Definir la arquitectura Cognituum |
| Alfred | Orquestación conversacional | Qué consulta emitir y cómo mantener la sesión | Conversación y composición de contexto | Mensaje/contexto | Respuesta conversacional/BISP | Firmar, enrutar providers o guardar keys target |
| Batcave | Acceso remoto gobernado | Validación de sesión y autoridad remota | Auth, BlindJudge y relay | Instrucción estructurada | Resultado relay | Interpretar lenguaje, suministrar IA o ejecutar localmente |
| Installer/Metamorph | Distribución y salud | Compatibilidad y versión | Instalar, inspeccionar y actualizar | Manifiestos | Estado de instalación | Elegir runtime para un Intent |

## 7. Fronteras negativas obligatorias

1. AITAP no ejecuta código ni toca filesystem.
2. AITAP no parsea ni valida BSIP Response.
3. AITAP no conoce el lifecycle completo del Intent.
4. Vault no selecciona provider, modelo o runtime.
5. Nucleus no planifica trabajo cognitivo ni se convierte en scheduler de
   Brain o Execution Layer.
6. Cortex no consume inferencia ni persiste secretos.
7. Runner e IonPump no automatizan UIs de proveedores IA externos.
8. Execution Layer no redefine el Intent ni absorbe Intelligence Supply.
9. OpenCode no es la Execution Layer; es un posible provider.
10. Alfred no firma y su renderer no recibe credenciales.
11. Batcave no interpreta lenguaje natural y no reemplaza AITAP o Alfred.
12. Installer/Metamorph no selecciona el runtime para una tarea.

## 8. Contratos mínimos

| Contrato | Owner | Productor -> consumidor | Campos indispensables | Información excluida | Estado 2026-08-17 |
|---|---|---|---|---|---|
| Supply Request | AITAP | Brain/Alfred -> AITAP | `request_id`, `consumer_id`, input opaco, capability, constraints, credential ref opcional | Lifecycle completo, tools | Nuevo |
| Supply Result | AITAP | AITAP -> consumidor | IDs, raw response, provider/model, finish reason, usage ref, error | BISP parseado | Nuevo |
| Provider Capability | AITAP | Adapter -> router | provider/model, modalidad, local/cloud, límites, health, costo | Policy organizacional | Nuevo |
| Credential Reference | Vault | Consumer/AITAP -> Vault | identidad autenticada, provider, `key_id`, purpose/app | Plaintext | Parcial |
| Provider Execution Request | Provider Backend | AITAP -> adapter | model, input, parameters, credential handle o endpoint | Intent lifecycle | Nuevo |
| Provider Execution Result | Provider Backend | Adapter -> AITAP | raw output, metadata, usage, latencia, error normalizado | Interpretación BISP | Nuevo |
| Execution Package | Brain | Brain -> Execution Layer | objective, prior state, constraints, workspace ref, inputs, acceptance criteria, capabilities, policy ref, correlation IDs | Sintaxis de tool y secretos | Nuevo |
| Execution Event | Execution Layer | Adapter -> Brain/UI | execution/session ID, sequence, type, timestamp, summary, evidence refs | Secrets y razonamiento privado | Nuevo |
| Execution Result | Execution Layer | Layer -> Brain | status, outputs, changed paths, tests, diff/evidence/accounting refs, error/cancel reason | Nueva decisión semántica | Nuevo |
| Evidence | Execution Layer | Layer/provider -> Brain/Nucleus | ID inmutable, actor/runtime, timestamps, hashes, tool events, tests, diff y outputs | Secretos | Nuevo |
| Policy/Grant | Nucleus | Nucleus -> Runner/Execution/Vault | subject, capability, resource scope, constraints, expiry, consent, audit ID/firma | Plan cognitivo | Parcial |
| Accounting Event | AITAP | AITAP/adapters -> Accounting | consumer, provider/model, tokens, costo, latencia, outcome, correlation ID | Interpretación del contenido | Nuevo |

Los campos son el mínimo conceptual. No constituyen todavía schemas cerrados.
Cada contrato se versiona por su owner y debe permitir idempotencia y
correlación sin transportar secretos o estado semántico innecesario.

## 9. Decisiones normativas cerradas

1. Brain conserva la semántica; Brain y Alfred son orquestadores.
2. AITAP posee Intelligence Supply, routing y Accounting.
3. AITAP no ejecuta ni interpreta BSIP Response.
4. Nucleus posee Governance; no scheduling cognitivo.
5. Vault es user-scoped y no es router.
6. Inferencia cloud usa SDK/API oficial; inferencia local usa endpoint local.
7. Una key faltante o endpoint caído pausa el flujo; no habilita fallback
   oculto, key compartida ni DOM de contingencia.
8. Runner conserva automatización DOM first-party.
9. DOM de proveedores IA externos queda fuera de alcance.
10. Cortex captura y transporta.
11. Execution Layer es abstracta y reemplazable.
12. OpenCode es un posible Execution Provider.
13. Repo Ops y Batcave Auth son apps y credenciales separadas.
14. Accounting y Evidence permanecen separados aunque correlacionados.

## 10. Preguntas abiertas

| Pregunta | Decisión que bloquea | Experimento mínimo | Criterio de cierre |
|---|---|---|---|
| ¿Todo local inference pasa por AITAP? | Provider Backend común | Adapter Ollama bajo Supply Request sin key | Misma observabilidad y fallback sin acoplar Alfred |
| ¿Contrato D o formato nativo de runtime? | Forma final de Execution Package | Batería OpenCode con structured output, patch, diff y checksum | Cumplimiento estable y recuperación determinista |
| ¿Dónde vive Execution Layer? | Ownership físico y distribución | Adapter fuera de AITAP y Brain | Swap de runtime sin cambio semántico en Brain |
| ¿Cómo gobierna Nucleus tools/filesystem? | Modelo de Policy/Grant | Grant firmado por workspace/tool/tiempo | Denegación previa y Evidence posterior verificables |
| ¿Quién posee la persistencia de ejecución? | Recovery/reconnect | Restart, cancel y reconexión de sesión | Una única fuente recuperable e idempotente |
| ¿Cómo se emite identidad de Alfred? | Alfred multi-device y mobile | Alta/revocación de dos dispositivos | Credencial individual, revocable y fuera del renderer |
| ¿Cómo materializar Vault target? | Migración de secretos | PoC AEAD Windows/Linux multiusuario | Aislamiento, rotación, delete real y logs sin plaintext |

## 11. Reglas de evolución

- **Nuevo provider de inteligencia:** implementa Provider Capability y Provider
  Execution Request/Result; no cambia Brain ni la semántica del BISP.
- **Nuevo endpoint local:** usa el mismo contrato de backend sin Credential
  Reference, con health y pausa/reanudación explícitos.
- **Nuevo Execution Provider:** implementa Package/Event/Result/Evidence; no
  agrega campos vendor-specific al Intent.
- **Nueva superficie first-party:** se registra en una allowlist gobernada de
  Runner; no amplía por defecto permisos de Cortex.
- **Nueva identidad de dispositivo:** recibe un Identity Reference único,
  revocable y separado de identidad organizacional y secrets de providers.
- **Nueva policy:** modifica Grants; nunca reescribe Intent/BISP.

## 12. Pruebas de arquitectura

La arquitectura es válida únicamente si se cumplen todas estas pruebas:

1. Si OpenCode desaparece, el Intent conserva significado.
2. Si cambia el modelo, el Intent conserva significado.
3. Si cambia el provider, el Intent conserva significado.
4. Si cambia el runtime, Execution Package sigue siendo interpretable.
5. Si cambia la policy, cambia el Grant y no la semántica.
6. Cognituum Runner conserva automatización first-party.
7. Ninguna contingencia reintroduce DOM de proveedores IA externos.
8. Vault conserva aislamiento por usuario.
9. Repo Ops y Batcave Auth permanecen separados.
10. Brain, AITAP, Nucleus y Execution Layer pueden evolucionar sin absorberse
    mutuamente.

## 13. Relación con el estado actual

A la fecha de este documento, Brain todavía concentra accesos directos a
providers y credenciales; AITAP es un scaffold; Vault no implementa el modelo
user-scoped objetivo; IonPump conserva capacidades DOM no delimitadas por una
policy first-party; Execution Layer no existe como componente; OpenCode no está
integrado; Alfred usa paths/providers directos transicionales; Batcave no
implementa aún su vertical documentado; y Metamorph no descubre OpenCode.

La evidencia, impacto y trabajos habilitados se mantienen en
[`COGNITUUM_ARCHITECTURE_FINDINGS_2026-08-17.md`](../RESEARCH/COGNITUUM_ARCHITECTURE_FINDINGS_2026-08-17.md).

