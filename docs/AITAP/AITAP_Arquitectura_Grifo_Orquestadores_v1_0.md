# AITAP — Arquitectura: Grifo de Inteligencia vs. Orquestadores Consumidores

**Sistema:** BLOOM / BTIPS / BISP
**Componente:** AITAP
**Versión:** 1.1
**Estado:** Marco conceptual consolidado — fuente de verdad para cualquier trabajo futuro sobre AITAP
**Depende de:** `AITAP_Decision_Arquitectonica_Gateway_vs_Ejecucion.md` (resolución original, 2026-08-12),
`installer/aitap/AGENTS.md` (guardrail operativo de código), `BLOOM_BISP_Fuente_de_Verdad_v1_0.md` Parte A
(protocolo BISP genérico, Contratos de Synapse A/B/C)

**Changelog v1.0 → v1.1:** corrige quién parsea el `BSIP-Response` (era ambiguo, ahora es 100% Brain/cada
orquestador — AITAP nunca lo toca), formaliza la Contabilidad de tokens como tercer pilar explícito del rol
de AITAP (antes mencionada de pasada como "accounting" dentro de una lista), y agrega el ciclo completo
Brain ↔ AITAP ↔ OpenCode (§6) con el punto de ubicación de la invocación local a OpenCode.

---

## 0. Propósito de este documento

Consolidar en la documentación oficial el marco conceptual de AITAP, cerrando imprecisiones de vocabulario
que aparecieron durante el diseño y que, sin corrección, generan acoplamientos no deseados si un
desarrollador las toma como definición literal:

1. AITAP **no es un orquestador**. Es un grifo — con tres pilares, no uno (ver §1).
2. AITAP **no parsea ni interpreta el `BSIP-Response`**. Devuelve la respuesta cruda del modelo; el parseo y
   la validación contra el schema del Contrato D son responsabilidad exclusiva del orquestador consumidor
   (Brain, Alfred).
3. La simetría que existe entre consumidores (Brain, Alfred) es simetría de **contrato/schema compartido**,
   no de artefacto que AITAP produce ni de motor de ejecución.

Este documento no reabre la resolución "Gateway-only" ya tomada — la da por firme y la formaliza con más
precisión de lenguaje.

---

## 1. Rol estricto de AITAP — tres pilares, nada más

**AITAP es Grifo + Vault + Contabilidad. Nada más que eso.**

1. **Gateway / Grifo:** enrutamiento a modelos de frontera, sea por API directa o por el camino
   browser (IonPump/Cortex) cuando ese camino pase a consumir AITAP. Decide qué modelo, qué proveedor,
   failover entre proveedores.
2. **Vault (referencia, no custodia):** resuelve credenciales por `key_id` contra Nucleus Vault, que es el
   dueño real del secreto. AITAP nunca guarda el valor de una credencial.
3. **Contabilidad (pilar explícito, no un ítem suelto de una lista):** conteo estricto de tokens de
   input/output, costo, latencia y auditoría, **por consumidor** (Brain, Alfred, y los que se sumen). Este
   pilar es el que permite responder mañana "cuánto gastó Alfred este mes" o "qué intent consumió más
   tokens" sin tener que reconstruirlo post-hoc.

**Su ciclo operativo es literal: recibe el `BSIP-Payload`, consulta al modelo de frontera, registra la
métrica contable de esa consulta, y devuelve la respuesta cruda tal cual la dio el modelo. Nada más.**

**AITAP no gobierna el ciclo de vida del intent, no ejecuta cambios sobre ningún codebase, y — esto es
la corrección más importante de esta revisión — no parsea ni interpreta el `BSIP-Response`.** No tiene
noción de fases (`briefing`, `execution`, `refinement`), no decide cuándo un intent avanza, no valida la
estructura `create`/`edit`/`patch`/`delete` del Contrato D, no aplica diffs, no administra sesiones de
ejecución (por ejemplo, sesiones headless de OpenCode). Todo eso es responsabilidad exclusiva de quien lo
consume — ver §3.

## 2. Orquestadores consumidores: Brain y Alfred

El orquestador real del ciclo de vida de un intent es quien decide `submit` → `parse` → `stage` → `merge`
(hoy, `IntentExecutor` de Brain para intents `dev/`). AITAP no orquesta nada — **es llamado por el
orquestador** cuando este necesita razonamiento de un modelo de frontera.

Brain es hoy el único orquestador implementado. **Alfred es el segundo consumidor de primer nivel**,
diseñado desde el arranque con el mismo estatus que Brain — no como una integración ad-hoc posterior. Ver
`Alfred_Integracion_AITAP_Disparo2_v1_0.md` para su directiva de integración específica.

```text
                    Orquestadores (gestionan ciclo de vida + parseo + ejecución)
            ┌───────────────────────┬───────────────────────┐
            ▼                       ▼                        │
          Brain                  Alfred                      │
     (IntentExecutor)      (por diseñar)                      │
            │                       │                         │
            └───────────┬───────────┘                         │
                         │  BSIP-Payload                       │
                         ▼                                     │
                      AITAP                                    │
          (Grifo + Vault + Contabilidad — nunca parsea)        │
                         │                                     │
                         │  Respuesta CRUDA del modelo          │
                         │  (+ métrica de tokens/costo          │
                         │    registrada en AITAP, no viajera)  │
                         ▼                                     │
            ┌────────────┴────────────┐                        │
            ▼                         ▼                        │
     Brain PARSEA la              Alfred PARSEA la              │
     respuesta cruda y la         respuesta cruda y la          │
     valida contra el             valida contra el              │
     schema del Contrato D        schema del Contrato D  ◄──────┘
     (BSIP-Response) — esto       (BSIP-Response) — con
     es 100% dominio Brain,       su propia lógica, no
     no de AITAP                 la de Brain
```

**Corrección explícita de vocabulario:** en la síntesis de la sesión de Cowork que originó este documento,
se usó una vez la frase "AITAP expone una interfaz simétrica... sobre si la ejecución la hace `MergeManager`
o el motor de `OpenCode`". Esa frase, leída literalmente, sugiere que AITAP tiene noción de motores de
ejecución. **No la tiene, y no debe tenerla.** Una revisión posterior de esta misma sesión encontró que
había un segundo deslizamiento, más sutil: en la v1.0 de este documento se decía que AITAP "devuelve un
artefacto de respuesta estandarizado (`BSIP-Response`)" — eso también es impreciso. **AITAP devuelve la
respuesta cruda del modelo, sin interpretarla.** El `BSIP-Response` es el resultado de que *Brain* (o
Alfred) parsee esa respuesta cruda contra el schema del Contrato D — no algo que AITAP arma. Ver §3.

## 3. Desacoplamiento operativo: respuesta cruda vs. BSIP-Response

Lo que es simétrico entre Brain y Alfred **no es un artefacto que AITAP les entrega ya parseado — es el
schema del Contrato D**, que ambos implementan de forma independiente (ver
`BSIP_Response_Spec_PoC_Disparo1_v1_0.md`). AITAP entrega la misma respuesta cruda sin importar quién la
pidió; cada orquestador decide, puertas adentro, cómo parsearla y validarla.

**Por qué esto importa y no es un detalle cosmético:** si AITAP fuera quien parsea el `BSIP-Response`, se
convertiría — sin que nadie lo decidiera explícitamente — en un componente con conocimiento del dominio
BTIPS (qué es un `create`/`edit`/`patch`/`delete`, qué es válido, qué no). Eso rompe la promesa de que AITAP
es agnóstico y liviano: un consumidor futuro que no hable BTIPS (otro producto, otro cliente) tendría que
cargar con un parser que no necesita. Mantener el parseo 100% del lado del orquestador es lo que permite que
AITAP siga siendo, literalmente, intercambiable por cualquier otro gateway de modelos sin que Brain ni
Alfred tengan que cambiar una línea de su lógica de parseo.

**Qué hace cada orquestador con la respuesta cruda una vez parseada — aplicarla con su propio `MergeManager`,
con un adapter de OpenCode, o con cualquier otro mecanismo — sigue siendo responsabilidad exclusiva del
orquestador, no de AITAP.** AITAP entrega la respuesta y no vuelve a intervenir. No sabe, no le importa, y
no debe llegar a saber, qué pasó después.

Esta es la misma disciplina que ya está codificada como tripwire operativo en
`installer/aitap/AGENTS.md` ("No administrar sesiones headless de OpenCode... eso es responsabilidad de un
componente separado que consume a AITAP, no que vive dentro de él") — este documento la extiende
explícitamente al caso de múltiples orquestadores (Brain y Alfred), para que no quede como una regla
implícita que alguien tenga que reinferir cuando llegue el segundo consumidor.

## 4. Relación con el resto del ecosistema

- **Vault de credenciales:** AITAP no es dueño del vault — lo es Nucleus. AITAP solo guarda `key_id`
  (referencia) y política de ruteo. Ver `README.md` de `installer/aitap`, sección "Decisiones ya tomadas".
- **Camino browser (IonPump/Cortex):** hoy vive dentro de Brain, es un camino de razonamiento paralelo al
  de los `Provider Adapters` directos. Si en el futuro pasa a consumir AITAP en vez de hablar directo, es
  una migración de Brain — no cambia nada del rol de AITAP.
- **Contratos de Synapse (A/B/C) del protocolo BISP:** describen consumidores que razonan (continuar,
  evaluar, decidir compatibilidad). Ninguno describe ejecución física de cambios — por eso el
  `BSIP-Response`/Contrato D es una pieza nueva del protocolo, no una reinterpretación de las tres
  existentes.

## 5. Lo que este documento fija como no-negociable

- AITAP = Grifo + Vault + Contabilidad. Punto — tres pilares, ninguno de parseo ni de ejecución.
- Brain y Alfred = orquestadores, consumidores de AITAP, dueños de su propio parseo, su propio ciclo de
  vida y su propia ejecución.
- El schema del Contrato D (`BSIP-Response`) es el único contrato compartido *como especificación* entre
  orquestadores — no es un artefacto que AITAP produzca ni un contrato de ejecución compartido. Cada
  orquestador lo implementa e interpreta por su cuenta.

## 6. Ciclo completo: Brain ↔ AITAP ↔ OpenCode (ida, vuelta e implementación)

Este es el ciclo determinista de 4 pasos para el caso concreto de un intent `dev/` orquestado por Brain,
que hoy es el único camino de implementación de código definido en el ecosistema. Sirve como referencia
concreta de cómo se combinan los principios de §1-§3 en un flujo real — **no como precedente automático
para Alfred**, que puede resolver su propio paso 4 de forma distinta (ver
`Alfred_Integracion_AITAP_Disparo2_v1_0.md` §4, todavía bloqueada).

```text
[Brain]  ──(1. BSIP-Payload)──────────────────> [AITAP] ──> [Modelo de Frontera]
   ▲                                                                │
   │                                                    (Respuesta cruda del modelo)
   │                                                                ▼
[Brain]  <───(2. Respuesta cruda + registro────────────────── [AITAP]
   │           de tokens/costo en Contabilidad,
   │           la respuesta NO se transforma)
   │
   ├── (3. Brain parsea y valida contra el schema
   │        del Contrato D → BSIP-Response)
   │
   └── (4. Brain invoca localmente a OpenCode con las
            operaciones del BSIP-Response)  ──> [OpenCode] ──> [Filesystem local]
                                                       │
                                                       └──(reporta resultado del patch)──> [Brain]
```

**Paso 1 — Ida:** Brain empaca la intención en `BSIP-Payload` y lo envía a AITAP.

**Paso 2 — Grifo y métricas:** AITAP consulta al modelo de frontera elegido, registra tokens de
input/output, costo y latencia en su módulo de Contabilidad (asociado a Brain como consumidor), y devuelve
la respuesta **tal cual la dio el modelo** — sin parsear, sin validar estructura de negocio.

**Paso 3 — Vuelta (parsing, 100% Brain):** Brain valida que la respuesta cumpla el schema del Contrato D
(`create`/`edit`/`patch`/`delete` — ver `BSIP_Response_Spec_PoC_Disparo1_v1_0.md`) y la convierte en un
`BSIP-Response` interno. Si no cumple el schema, la lógica de reintento/fallback (§3.2 del documento del
Disparo 1, para el camino browser) es responsabilidad de Brain, no de AITAP.

**Paso 4 — Implementación local:** Brain invoca localmente a OpenCode, pasándole las operaciones ya
validadas del `BSIP-Response`. OpenCode aplica los cambios quirúrgicamente sobre el codebase local
(`edit`/`write`/`patch`/`bash` según corresponda) y reporta el resultado del patch de vuelta a Brain — quien
es, en último término, el que decide qué hacer con ese resultado (por ejemplo, invocar a `MergeManager`
como paso de verificación adicional, o considerarlo el mecanismo de aplicación final).

**Esto resuelve, para el caso Brain, una pregunta que había quedado deliberadamente abierta en documentos
previos** (`Alfred_Integracion_AITAP_Disparo2_v1_0.md` y el guardrail de `installer/aitap/AGENTS.md` hablaban
de una "Implementation Layer... todavía sin ubicación"). **Para Brain, la ubicación queda fijada: la
invocación a OpenCode es local a Brain, no un servicio aparte.** Esto no se extiende automáticamente a
Alfred — si Alfred también termina invocando OpenCode, es una decisión de diseño de Alfred que puede compartir
el mismo adapter técnico sin que eso implique que Alfred delega su ejecución a Brain ni a un tercer
componente compartido.

## 7. Decisión — identidad de consumidor para Alfred: por dispositivo, no por organización

**Confirmado por Jose, 2026-08-14.** Alfred no es un consumidor único por organización — es
**multi-instancia**: cada workspace Electron y, eventualmente, cada instalación mobile corre su propio
Alfred, y cada uno habla con AITAP directo para cualquier uso de tokens, sea cual fuere el caso. No hay
excepción ni ruteo indirecto a través de un único Alfred "primario".

Esto descarta explícitamente un modelo alternativo que se evaluó y se dejó de lado: que un solo Alfred por
organización (el del workspace primario) fuera el único consumidor real de AITAP, y que otros dispositivos
(mobile, workspaces secundarios) llegaran a él como clientes remotos a través del túnel de Batcave, sin
identidad propia frente a AITAP. Ese modelo alternativo es el que describe hoy `.ai_bot.sovereign.bl` de
elias-repos ("routes through Batcave's sovereign tunnel to the local Nucleus") — confirmado por Jose como
contenido **poco desarrollado y legacy**, no como la dirección a seguir. No se edita ese archivo desde acá
(es contenido gestionado por el propio Jose / el pipeline de onboarding, no algo que este documento deba
tocar), pero cualquier trabajo futuro sobre Alfred debe tratar esa descripción como desactualizada frente a
esta decisión, no como fuente de verdad.

**Consecuencia directa sobre el pilar 3 (Contabilidad) de §1:** "por consumidor" significa, para Alfred,
**por dispositivo/instancia** — no por tipo de bot como pasa hoy con Brain (que es un solo proceso por
organización). AITAP va a necesitar tantos `key_id`/registros de consumidor como dispositivos activos de
Alfred existan, no uno solo por organización.

**Pendiente, confirmado sin resolver (no inventar una solución acá):** hoy no existe en ningún lugar del
ecosistema un mecanismo de alta de dispositivo/cliente — se buscó explícitamente en
`installer/nucleus`, `installer/sentinel` y `installer/metamorph` (sin resultados para `device_id`,
`machine_id`, `hardware_id` ni variantes) y en el lado Electron (sin uso de `safeStorage` ni `keytar` en
todo `src/`/`webview/`). `.ownership.json` es identidad de organización, no de dispositivo. El vault de
Nucleus (`installer/nucleus/internal/vault/vault.go`) valida el patrón de guardar secretos en el keyring
del SO, pero no emite identidad — y su propia función `InitializeVault()` no la llama nadie en el código
real todavía. Diseñar este mecanismo (quién emite la credencial inicial de cada dispositivo, dónde se
guarda, cómo se referencia en AITAP) es trabajo nuevo, no una extensión de algo existente — queda como
próximo paso explícito, no resuelto en este documento.
