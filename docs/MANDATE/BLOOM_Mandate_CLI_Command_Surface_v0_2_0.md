# BLOOM — Mandate CLI Command Surface v0.2.0

**Tipo:** RFC / Design Specification
**Estado:** Borrador — depende de gaps abiertos (ver §0)
**Fecha:** 2026-07-01
**Dominio:** Nucleus · Sentinel · Brain · Sensor · Ciclo de vida del Mandate
**Depende de:** `BLOOM_Mandate_Package_Spec_v1_0_0.md` · `BLOOM_Mandate_Universal_Schema_v1_0_0.md` · `BLOOM_Cognitive_Evidence_Model_v1_0_0.md` · `BTIPS_Bloom_Technical_Intent_Package_v5_0.md`
**Reemplaza:** `BLOOM_Mandate_CLI_Command_Surface_v0_1_0.md` — corrige la asunción de que Nucleus ejecuta directamente. Introduce delegación explícita por componente.

---

## 0. Qué cambió respecto a v0.1.0 y por qué

v0.1.0 trataba cada comando `nucleus mandate *` como una operación monolítica local. Eso contradice la arquitectura real descripta en BTIPS §2.1–2.6: Nucleus **nunca ejecuta lógica directamente** — es autoridad y gobernanza. La ejecución real (parsing, LLM, embeddings, ChromaDB) vive en Brain, y llega ahí exclusivamente a través del Event Bus que mantiene Sentinel. Sensor es un observable pasivo que nadie controla, solo publica.

```
Sensor mide.  Nucleus decide.  Brain ejecuta.  Sentinel conecta a los tres.
```

Correcciones puntuales sobre v0.1.0:

| # | Corrección |
|---|---|
| R-1 | `nucleus mandate execute` → `nucleus mandate run`, y se agregan `pause`/`resume` — ciclo de vida oficial según BTIPS §7 |
| R-2 | Cada comando de la capa de Pipeline (§3) y de Empaquetado (§5) ahora declara explícitamente Autoridad / Enrutamiento / Ejecución / Persistencia, en vez de asumir que "Nucleus lo hace" |
| R-3 | La capa de Evidencia (§6) se rediseña: captura pasa a ser responsabilidad primaria de Sentinel (observa el event bus, no del desarrollador invocando comandos manualmente), linting/paráfrasis es Brain, contexto ambiental lo aporta Sensor |
| R-4 | El namespace de comandos sigue siendo `nucleus *` — el usuario nunca invoca `sentinel` o `brain` directamente. Ver §1.2 |

### Bloqueantes heredados de v0.1.0 (siguen sin resolverse)

| Gap | Origen | Afecta a |
|---|---|---|
| `cognitive.federatedCognition` no está definido en el Universal Schema | Evidence Model lo asume como ancla vía `ledgerRef`, el Universal Schema no lo tiene | Todo `nucleus evidence submit` / `nucleus ledger *` |
| `evidenceTaxonomy.json` no existe como artefacto versionado | I-15, I-16, §1 y §3.1 del Evidence Model lo referencian sin fuente propia | Todo `nucleus evidence record *` |

### Bloqueante nuevo, detectado al leer BTIPS

| Gap | Origen | Afecta a |
|---|---|---|
| G-1 | BTIPS define 5 intent types canónicos (`dev/doc/exp/inf/cor`). El Package Spec usa `dev/doc/gen/cor/exp` — `gen` no existe en la lista canónica de BTIPS. No está claro si `gen` es un sexto tipo real (el que registra Genes, mencionado en el Genesis contract del Universal Schema §5) o un error de nomenclatura por `inf`. | `mandate action add --intent-type`, todo el pipeline de Genes |

---

## 1. Modelo de responsabilidad

### 1.1 Los cuatro roles

| Componente | Qué NO hace | Qué SÍ hace |
|---|---|---|
| **Nucleus** | No ejecuta lógica, no llama LLMs, no toca ChromaDB directamente | Autoridad: valida identidad/rol, decide qué se necesita, firma (`mandate.json`), gobierna Vault, persiste el resultado final en el contrato |
| **Sentinel** | No decide, no ejecuta, no tiene lógica de negocio | Sidecar daemon persistente: mantiene el Event Bus vivo, enruta `EXECUTE_INTENT`/`VAULT_GET_KEY`/`POLL_EVENTS` hacia Brain, reenvía `INTENT_PROGRESS`/`COMPLETED`/`FAILED` de vuelta, garantiza reconexión con backoff y recuperación de eventos perdidos vía `sequence number` |
| **Brain** | No decide autoridad, no persiste el contrato firmado | Motor Python: parsea el intent, ejecuta el pipeline paso a paso (LLM para perfil/summary, Ollama para embedding, queries a ChromaDB), publica progreso, solicita llaves a Nucleus vía Vault cuando necesita un AI Provider externo |
| **Sensor** | No participa en la ejecución de intents ni recibe comandos | Observable pasivo: publica `energy_index` [0.0–1.0] y eventos `HUMAN_*` a Sentinel cada 60s. Nadie lo controla activamente, solo se lo consulta |

### 1.2 Por qué el namespace sigue siendo `nucleus *`

El Conductor **no se comunica con Sentinel** — se conecta directamente a Nucleus (BTIPS §2.4). Ese mismo principio aplica al CLI: el desarrollador nunca invoca `sentinel run-intent` ni `brain embed` a mano. Toda la delegación de este documento es **interna a la implementación de cada comando** `nucleus mandate *` / `nucleus evidence *`. La autoridad siempre entra y sale por Nucleus, igual que en el flujo de Alfred (BTIPS §10.5: *"la autoridad nunca se distribuye, aunque el acceso sí"*).

### 1.3 Notación usada en §3, §5 y §6

Cada comando que involucra ejecución real se documenta con esta forma compacta:

```
Autoridad: <qué valida/decide Nucleus antes de disparar>
Enrutamiento: <evento Sentinel usado — EXECUTE_INTENT | VAULT_GET_KEY | POLL_EVENTS | HUMAN_* passthrough>
Ejecución: <qué hace Brain concretamente>
Persistencia: <qué escribe Nucleus al recibir INTENT_COMPLETED>
```

Los comandos que son operaciones estructurales puramente locales sobre el draft (§2) no llevan esta notación — no hay nada que ejecutar, son mutaciones directas de `mandate.json` bajo autoridad exclusiva de Nucleus.

---

## 2. Capa de Creación — `nucleus mandate` (draft)

**Cadena: Nucleus solamente.** No hay razonamiento cognitivo ni ejecución involucrada — es escritura estructural directa sobre el filesystem gobernado por Nucleus (`.bloom/.intents/`, `mandate.json` en estado `draft`). Sentinel y Brain no participan.

```
nucleus mandate create --project <projectId> --name <name> --objective "<string>"
nucleus mandate action add --mandate <mandateId>
  --type <run_intent|call_service|await_mandate>
  --intent-type <dev|doc|exp|inf|cor>          # ⚠ ver G-1 — 'gen' pendiente de resolución
  --name <string> --description <string>
  --depends-on <actionId,...> --payload <payloadKey>
  --on-success <actionId|null> --on-failure <fail_mandate|actionId>
nucleus mandate payload set --mandate <mandateId> --key <payloadKey> --description <string> --data '<json>'
nucleus mandate workflow set --mandate <mandateId> --type <sequential|parallel|conditional> --entry <actionId>
nucleus mandate workflow step add --mandate <mandateId> --step-id <id> --action <actionId> --condition <expr|null>
nucleus mandate dependency add --mandate <mandateId> [--mandates <id,...>] [--genes <id,...>]
nucleus mandate temporal-config set --mandate <mandateId> --queue <taskQueue> --timeout <seconds> --retry-max <n> ...
nucleus mandate validate --mandate <mandateId>
```

`validate` sigue siendo puramente local: chequeo estructural de referencias (`actionId`, `payload`, ciclos en `dependsOn`), no invoca a Brain.

---

## 3. Capa de Pipeline de Firma Cognitiva — `nucleus mandate pipeline`

**Cadena completa por primera vez.** Esta es la capa que v0.1.0 modelaba mal — asumía que "Nucleus genera el perfil cognitivo" cuando en realidad Nucleus decide *que* hace falta un perfil, Brain lo genera, y Nucleus lo persiste al recibir la confirmación.

```
nucleus mandate pipeline run --mandate <mandateId>
```
Orquesta los 5 pasos en secuencia. `currentStatus → pending_cognitive` al iniciar. Cada paso individual es un `EXECUTE_INTENT` (`intentType: exp`) distinto — no un solo intent monolítico — para que un fallo puntual (ej. Brain cae durante `embed`) no obligue a re-analizar desde cero: Sentinel reconecta y el paso interrumpido se reintenta solo.

```
nucleus mandate pipeline analyze --mandate <mandateId>
```
```
Autoridad: Nucleus decide que corresponde analizar (mandate.validate ya pasó)
Enrutamiento: Sentinel → EXECUTE_INTENT (intentType: exp) → Brain
Ejecución: Brain lee operational.objective + operational.actions, identifica dominios candidatos
Persistencia: Nucleus, al recibir INTENT_COMPLETED, marca cognitiveSigningPipeline.steps.analyze → 'completed'
```

```
nucleus mandate pipeline profile --mandate <mandateId>
```
```
Autoridad: Nucleus autoriza el siguiente paso solo si analyze == 'completed'
Enrutamiento: Sentinel → EXECUTE_INTENT (exp) → Brain
Ejecución: Brain genera cognitive.cognitiveProfile completo (mission, domain, capabilities,
           concepts, architecturalImpact, intentions, relations, keywords) vía LLM
Persistencia: Nucleus escribe el bloque cognitiveProfile en mandate.json (aún no firmado)
```

```
nucleus mandate pipeline embed --mandate <mandateId>
```
```
Autoridad: Nucleus decide que el perfil está listo para sintetizarse
Enrutamiento: Sentinel → EXECUTE_INTENT (exp) → Brain. Si Brain necesita un AI Provider externo
              para el semanticSummary, dispara VAULT_GET_KEY hacia Nucleus antes de continuar (Vault Authority)
Ejecución: Brain genera semanticSummary (I-6: única fuente vectorizable) y lo vectoriza
           localmente vía Ollama (nomic-embed-text, 768 dim) — el vectorizado NO sale a un
           provider externo, corre en Brain
Persistencia: Nucleus escribe cognitive.embedding.ref/model/dimensions/sourceText
```

```
nucleus mandate pipeline search-similar --mandate <mandateId> [--threshold <0.0-1.0>]
```
```
Autoridad: Nucleus decide el threshold de similitud aceptable
Enrutamiento: Sentinel → EXECUTE_INTENT (exp) → Brain
Ejecución: Brain consulta ChromaDB, colección 'nucleus-mandates', con el vector recién generado
Persistencia: Nucleus escribe cognitive.similarMandates[]
```

```
nucleus mandate pipeline link-genes --mandate <mandateId> [--min-cohesion <0.0-1.0>]
```
```
Autoridad: Nucleus decide el umbral de cohesión mínimo para considerar un match válido
Enrutamiento: Sentinel → EXECUTE_INTENT (exp) → Brain
Ejecución: Brain consulta ChromaDB, colección 'nucleus-genes', vincula genes preexistentes
Persistencia: Nucleus escribe cognitive.linkedGenes[], currentStatus → 'ready_to_sign'
```

```
nucleus mandate pipeline status --mandate <mandateId>
```
Puramente local — lee `mandate_state.json.cognitiveSigningPipeline`. No requiere chain.

---

## 4. Capa de Firma y Ejecución — `nucleus mandate`

```
nucleus mandate sign --mandate <mandateId>
```
**Autoridad exclusiva de Nucleus, sin chain.** Aplica R-5 localmente (`embedding.ref`/`sourceText` no nulos), congela `mandate.json`, `signedAt ← now()`. Ni Sentinel ni Brain participan del acto de firma — es coherente con BTIPS §7: *"Un contrato inmutable firmado por Nucleus"*, nunca por Brain.

```
nucleus mandate run --mandate <mandateId>          # nombre corregido, ver R-1
nucleus mandate pause --mandate <mandateId>
nucleus mandate resume --mandate <mandateId>
nucleus mandate status --mandate <mandateId>
```
```
Autoridad: Nucleus inicia el Workflow de Temporal, orquesta Action → Intent
Enrutamiento: por cada Action, Sentinel → EXECUTE_INTENT hacia Brain con el intentType
              concreto de la Action (dev/doc/exp/cor — ver G-1 sobre 'gen'/'inf')
Ejecución: Brain corre el ciclo de vida completo del intent (Recepción → Parsing →
           Contexto → Ejecución → Progreso → Finalización → Persistencia, BTIPS §2.6)
Persistencia: Nucleus actualiza mandate_state.json.operationalState en cada
              INTENT_COMPLETED/FAILED; en crash, Temporal retoma desde el último
              intent completado sin repetir trabajo
```
`pause`/`resume` operan sobre el Workflow de Temporal a nivel Nucleus — no interrumpen la conexión de Sentinel con Brain, solo detienen el avance a la siguiente Action.

---

## 5. Capa de Empaquetado y Distribución — `nucleus mandate publish` / `install`

```
nucleus mandate lint --mandate <mandateId> [--dry-run]
```
```
Autoridad: Nucleus decide qué reglas de compliance.linter aplican (I-7 a I-12)
Enrutamiento: chequeos de patrón (UUIDs, paths absolutos, secretos) NO requieren LLM —
              corren localmente en Nucleus, sin Sentinel ni Brain
Ejecución: N/A — este paso es determinístico, no cognitivo
```

```
nucleus mandate publish <mandateId> --target marketplace
```
```
Autoridad: Nucleus verifica currentStatus == 'completed', aplica tokens de inyección (I-7),
           decide qué Gene Blueprints incluir
Enrutamiento: Sentinel → EXECUTE_INTENT (exp) → Brain, únicamente para extraer los vectores
              ya existentes de ChromaDB hacia embeddings.json — no se re-vectoriza nada nuevo
Ejecución: Brain lee de 'nucleus-mandates'/'nucleus-genes' y serializa vector+sourceText+model
Persistencia: Nucleus corre compliance.linter (local, sin chain), calcula checksum,
              firma con la clave de organización (Vault Authority), empaqueta el .zip
```

```
nucleus mandate install <package.zip> --project <targetProjectId>
```
```
Autoridad: Nucleus verifica integridad del paquete ANTES de cualquier otro paso (I-12),
           ejecuta el rebind de identidad (I-7)
Enrutamiento: Sentinel → EXECUTE_INTENT (exp) → Brain, para la hidratación de vectores
              y la resolución de Gene Blueprints (I-10)
Ejecución: Brain compara modelo/dimensiones (§4.2 failsafe), inyecta directo o encola
           re-vectorización; corre resolveGeneBlueprint contra ChromaDB local del comprador
Persistencia: Nucleus decide el estado final — 'pending_cognitive' si hubo incompatibilidad
              de modelo (I-11), 'blocked_on_dependency' si faltan Mandates dependientes,
              o avanza a 'ready_to_sign' → firma local → 'signed'
```

```
nucleus mandate install status --mandate <mandateId>
nucleus mandate install resolve-dependencies --mandate <mandateId>
```
Local, sin chain — lectura/disparo de instalación de dependencias ya resueltas por Nucleus.

---

## 6. Capa de Evidencia — `nucleus evidence` / `nucleus ledger`

**Rediseño respecto a v0.1.0.** La versión anterior asumía que el desarrollador invoca `evidence record decision` manualmente después de cada decisión — eso rompe I-24 (append-only, sin huecos) porque depende de que alguien se acuerde de correrlo. La posición correcta es la que señalaste: **Sentinel ya observa cada `INTENT_COMPLETED` con su `sequence number`** — es el punto natural de captura pasiva, no un comando que el usuario dispara.

```
⚠ BLOQUEADO POR: cognitive.federatedCognition no definido en Universal Schema (sigue sin resolverse)
```

### 6.1 Captura — pasiva, propiedad de Sentinel

```
[automático — no es un comando invocado por el usuario]
```
```
Autoridad: Nucleus define, al momento de crear la Action, si esa Action es "evidence-eligible"
           (ej. una Action cuyo intentType es 'exp' o 'cor' suele producir una decisión;
           una Action 'dev' pura normalmente no)
Enrutamiento: Sentinel, al recibir INTENT_COMPLETED de una Action marcada evidence-eligible,
              extrae el payload de salida y lo empuja a un buffer local append-only,
              indexado por sequence number — mismo mecanismo de POLL_EVENTS que ya usa
              para recuperar eventos perdidos, reutilizado para no perder evidencia
Ejecución: Sentinel NO interpreta el contenido — solo captura el evento crudo con su
           timestamp y sequence number. La interpretación (categorizar, taggear) es de Brain
Contribución de Sensor: en el mismo instante de captura, Sentinel adjunta el último
              energy_index conocido (ring buffer de Sensor, hasta 24h de snapshots) como
              parte de environmentFingerprint — señal de contexto humano, no una decisión
              nueva que Sensor tome, solo lo que ya publica cada 60s
```

Esto resuelve, de paso, un problema que v0.1.0 no atacaba: el `narrativeDigest` nunca debería escribirse en texto libre por el desarrollador en tiempo real — sale directamente del payload que Brain ya generó al ejecutar la Action, evitando que el desarrollador reconstruya de memoria una justificación después del hecho.

### 6.2 Comandos manuales — solo para casos que el evento automático no cubre

```
nucleus evidence record decision --mandate <mandateId> --action <actionId>
  --category <architecture|data_model|protocol|dependency_choice|security_control|performance_strategy|concurrency_model|error_handling_strategy>
  --concept-tag <tag> --driver <enum> --confidence <high|medium|low>
  --taxonomy-version <version>          # sin evidenceTaxonomy.json real, ver bloqueante
nucleus evidence record rejected-alternative --decision <decisionId> --concept-tag <tag> --reason-category <enum>
nucleus evidence record tradeoff --decision <decisionId> --gained <dim:dir:mag> --sacrificed <dim:dir:mag>
nucleus evidence record failure --action <actionId> --failure-class <enum> --remediation-applied <enum>
```
Reservados para decisiones tomadas **fuera** del ciclo de un intent gobernado (ej. una decisión de arquitectura discutida en el Conductor antes de que exista una Action formal). Autoridad: Nucleus. Sin chain — es una escritura directa al buffer, igual que §6.1 pero con origen humano en vez de evento de Sentinel.

### 6.3 Linting y envío al agregador

```
nucleus evidence submit --epoch current
```
```
Autoridad: Nucleus deriva nucleusAttestation (HMAC de clave raíz + epoch, I-19) —
           es una operación de Vault, exclusiva de Nucleus
Enrutamiento: Sentinel → EXECUTE_INTENT (exp) → Brain, con el buffer completo del epoch
Ejecución: Brain corre el Evidence Linter (I-14): elimina identificadores locales,
           elimina secretos, reescribe narrativeDigest vía paráfrasis (LLM, nunca copia
           el texto crudo del buffer de Sentinel)
Persistencia: Nucleus firma el payload linteado con nucleusAttestation y lo envía al agregador
```
```
⚠ BLOQUEADO POR: sin ledgerRef no hay epoch destino conocido
```

### 6.4 Consumo local

```
nucleus evidence search "<query>"
```
```
Autoridad: N/A — solo lectura
Enrutamiento: Sentinel → EXECUTE_INTENT (exp) → Brain
Ejecución: Brain embebe la query y consulta 'nucleus-evidence' LOCALMENTE (I-23 — nunca
           un query en tiempo real al agregador), retorna clusters, nunca registros individuales
```

```
nucleus evidence confidence --cluster <clusterId> | --edge <edgeId>
nucleus ledger epoch pull
nucleus ledger epoch status
```
`confidence` es lectura local sobre datos ya descargados (Brain), sin chain nueva. `epoch pull` repite el patrón de §6.3 en reversa: Nucleus autoriza, Sentinel enruta, Brain descarga y popula ChromaDB local.

---

## 7. Diagrama de la cadena completa — reemplaza el §6 de v0.1.0

```
mandate create → action/payload/workflow/dependency/temporal-config set → mandate validate
       │                                    (Nucleus, sin chain)
       ▼
mandate pipeline run
       │  analyze → profile → embed → search-similar → link-genes
       │  (cada paso: Nucleus decide → Sentinel enruta EXECUTE_INTENT → Brain ejecuta →
       │   Nucleus persiste al recibir INTENT_COMPLETED)
       ▼
mandate sign                                (Nucleus, sin chain — autoridad exclusiva)
       │
       ▼
mandate run ──────► Action → Intent (dev/doc/exp/cor) por Sentinel → Brain
       │                            │
       │                            ▼
       │                   Sentinel captura INTENT_COMPLETED
       │                   evidence-eligible → buffer append-only
       │                   + energy_index de Sensor (environmentFingerprint)
       ▼
mandate status == completed         evidence submit → Brain (lint) → Nucleus (attestation) ⚠ bloqueado
       │
       ▼
mandate publish --target marketplace          mandate install <pkg> --project <id>
  (Nucleus firma, Brain extrae vectores)         (Nucleus verifica+rebind, Brain hidrata)
```

---

## 8. Pendientes abiertos de este documento

| # | Pendiente | Bloqueante para |
|---|---|---|
| C-1 (heredado) | Resolver `federatedCognition` en el Universal Schema | Toda §6.3/§6.4 |
| C-4 (heredado) | `evidenceTaxonomy.json` real, no el flag `--taxonomy-version` como parche | §6.2 |
| G-1 (nuevo) | Resolver si `gen` es un sexto intent type real o un error de nomenclatura por `inf` en el Package Spec | `mandate action add --intent-type`, todo el subsistema de Genes |
| D-1 (nuevo) | Definir el criterio exacto de "evidence-eligible" para que Sentinel decida qué Actions capturar automáticamente (§6.1) — hoy es una heurística por intentType, no una regla declarada en el schema | Cierre real de §6.1, evitar que Sentinel capture ruido o pierda señal |
| D-2 (nuevo) | Definir si `pause`/`resume` de Temporal (§4) requieren also pausar la ingestión de eventos evidence-eligible de Sentinel, o si Sentinel sigue capturando aunque el Workflow esté pausado | Cierre de §4 y §6.1 |

---

*Fin del documento — v0.2.0 — Reemplaza v0.1.0. Introduce delegación explícita nucleus-sentinel-brain-sensor por comando.*
