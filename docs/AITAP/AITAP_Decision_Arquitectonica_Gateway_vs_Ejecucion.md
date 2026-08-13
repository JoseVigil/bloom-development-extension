# AITAP — Decisión Arquitectónica: ¿Grifo puro o Grifo + Motor de Ejecución?

**Documento de contexto e insumo para trabajo de Cowork**
**Sistema:** BLOOM / BTIPS / BISP
**Componente en discusión:** AITAP
**Estado:** **RESUELTO — ver Resolución al final del documento**
**Fecha del documento original:** 2026-08-12
**Fecha de resolución:** 2026-08-12

---

## RESOLUCIÓN (leer primero)

**Decisión: Opción A — AITAP como grifo puro (Gateway-only).**

Confirmada directamente por Jose en la sesión de Cowork "Vault - AiTap" /
scaffold de `installer/aitap`, **no derivada por Cowork** a partir de las
opciones planteadas más abajo. Esta sección es la fuente de verdad; las
secciones 1-11 quedan como el razonamiento previo que llevó a la pregunta,
no como una decisión abierta.

**La separación de roles:**

- **AITAP es el grifo.** Control plane que gobierna el suministro de
  inteligencia: qué modelo, qué proveedor, cuánto contexto, cuánto se
  consume, qué credenciales (vía Nucleus Vault, nunca las guarda),
  cuotas, accounting. **AITAP no ejecuta código ni toca filesystem.**
  Nunca tiene tools de bash/edit/write/patch. Si un consumidor de OpenCode
  aparece en AITAP, es exclusivamente como *modelo* (razonamiento) detrás
  del mismo gateway que Claude/ChatGPT/Gemini — nunca como *harness* de
  ejecución.
- **OpenCode (o un runtime equivalente) es el implementador.** Traduce una
  decisión ya tomada por el frontier en cambios reales sobre el codebase
  (edit, write, bash, diff, tests), usando sus sesiones headless
  (`opencode serve`). Vive en un componente **separado de AITAP**, todavía
  no construido ni ubicado en el repo. Ese componente consume a AITAP como
  su grifo de razonamiento, pero administra su propia sesión de ejecución.
- **Nucleus gobierna.** Autoriza qué cambios del implementador se aplican
  realmente al codebase. Ese límite (gobernanza de cambios de código) es
  un dominio distinto de "gobernanza de acceso a modelos" (que es lo que
  hace AITAP).

**Lo que esto implica en código, ahora mismo:**

- `installer/aitap` nunca debe ganar una categoría de comandos tipo
  `EXECUTE`/`BASH`/`APPLY`. El set cerrado de categorías hoy es
  `SYSTEM`, `KEYS`, `ROUTE`, `HEALTH` (`installer/aitap/src/aitap/cli/categories.py`).
  Si alguien (humano o agente) se ve tentado a agregar una categoría de
  ejecución acá, es la señal de que está en el componente equivocado.
- La "Implementation Layer" (capa de implementación que administra
  sesiones OpenCode headless) **no tiene ubicación todavía**. No asumir
  que va dentro de `installer/aitap` por conveniencia ni por ahorro de
  trabajo — esa es exactamente la mezcla de responsabilidades que esta
  resolución prohíbe.
- Ver `installer/aitap/AGENTS.md` para el guardrail operativo completo.

---

## 0. Propósito de este documento

Cowork está construyendo actualmente **AITAP**, la nueva aplicación del sistema BLOOM que actúa como **grifo (gateway) de acceso a frontier models**. Durante la exploración de OpenCode como posible proveedor de capacidad, surgió una pregunta arquitectónica que todavía no está resuelta y que **condiciona el diseño de AITAP desde ahora**:

> **¿AITAP debe limitarse a controlar el suministro de inteligencia (routing, credenciales, cuotas, contexto, accounting), o debe absorber también la capa de implementación/ejecución de turns (edición de archivos, ejecución de comandos, verificación de resultados) que herramientas como OpenCode ya resuelven?**

Este documento reúne el razonamiento previo (dos conversaciones exploratorias), plantea las dos opciones arquitectónicas en juego, sus tradeoffs, y una serie de preguntas guía. La decisión final quedó resuelta arriba.

---

## 1. Contexto: qué es BTIPS/BISP (resumen)

BTIPS es la capa de ingeniería de intención del sistema. Su tesis central:

> **BTIPS no es un agente. Es una capa de ingeniería de intención que permite que distintos agentes, runtimes y frontier models ejecuten la misma intención de ingeniería bajo un estado persistente, portable y verificable.**

Un **BISP** (unidad de intención) puede contener: intent, objective, context, archivos relevantes, constraints, decisiones previas, findings, decisiones abiertas, estado de ejecución, outputs y conocimiento reusable.

La propiedad que se busca proteger es:

> **El BISP permanece estable mientras el executor y el modelo pueden cambiar.**

Es decir, BTIPS separa deliberadamente:

```text
INTENT (qué hay que lograr)
   ≠
SUPPLY (quién/qué lo ejecuta)
```

AITAP nace precisamente para gobernar ese segundo bloque: el **suministro de inteligencia**.

---

## 2. Qué es AITAP hoy (según lo definido hasta ahora)

AITAP fue concebido como un **control plane / gateway** para todo acceso a frontier models:

```text
                    BTIPS / BISP
                         │
                         ▼
                    ┌─────────┐
                    │  AITAP  │
                    │         │
                    │ Gateway │
                    │ Control │
                    │ Metering│
                    │ Policy  │
                    └────┬────┘
                         │
              Frontier Model Supply
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
     Claude           ChatGPT          OpenCode
```

Responsabilidades que ya se le atribuyeron en la exploración previa:

- Qué modelo se utiliza y qué proveedor.
- Cuánto contexto recibe y cuánto consume.
- Qué intent está ejecutando.
- Qué credenciales se usan.
- Qué presupuesto/cuota existe.
- Qué resultado produce.
- Logging, accounting, quotas, governance, routing.

Hasta acá, **AITAP no incluía ejecución de código**. Su rol era puramente de intermediación entre BISP y el modelo frontier.

---

## 3. El hallazgo que abre la pregunta: OpenCode como motor de implementación

En una conversación paralela apareció un uso de OpenCode distinto al de "otro proveedor de frontier": **OpenCode como Implementation Engine**, es decir, como el componente que resuelve el "último kilómetro" que hoy no existe en el sistema:

```text
frontera
   ↓
"hacé estos cambios"
   ↓
?????                <-- este es el hueco que resuelve OpenCode
   ↓
código local modificado
```

Puntos clave de esa exploración:

1. **OpenCode ya tiene las herramientas de ejecución resueltas**: `read`, `grep`, `edit`, `write`, `patch`, `bash`, LSP, permisos, sesiones, diff, revert, fork. Construir esto desde cero en BLOOM sería una cantidad enorme de trabajo evitable.
2. **OpenCode tiene un servidor headless** (`opencode serve`) pensado explícitamente para interacción programática vía API HTTP/OpenAPI, con conceptos de `session`, `message`, `diff`, `revert`, `fork`. Esto permite mantener **una sesión de OpenCode persistente por Intent**, y no crear una instancia nueva por cada turn.
3. **Modelo de reparto propuesto en esa conversación** (fuera del contexto de AITAP, pensado en ese momento como parte de "Nucleus/Genesis"):

```text
Frontier razona  →  decide qué construir (Genesis)
OpenCode opera   →  sabe cómo construirlo físicamente
Nucleus gobierna →  decide qué está autorizado a ocurrir
```

4. Se propuso **no dejar que OpenCode reciba el BSIP directo y decida por su cuenta**, sino que el frontier model (gobernado por BTIPS) razone primero, y OpenCode reciba una **instrucción de implementación ya elaborada** (Implementation Turn) con objetivo, estado previo, decisión del frontier, constraints, archivos esperados, criterios de aceptación y qué no tocar.
5. Se sugirió también la posibilidad de **custom tools** dentro de OpenCode (`bloom_apply_btip`, `bloom_validate_btip`, `bloom_commit`, `bloom_test`, `bloom_report`) para que OpenCode "hable el idioma" de BTIPS y devuelva resultados estructurados en vez de texto libre.
6. Y una barrera explícita: no `Frontier → OpenCode → edit` sin control, sino `Frontier → OpenCode → proposed changes → Nucleus → permission/validation → apply`.

**Esta pieza (razonamiento del frontier + implementación vía OpenCode + gobernanza de Nucleus) nunca se pensó como parte de AITAP.** Se pensó como una capa de ejecución de turns, independiente del gateway de modelos.

---

## 4-9. Opciones A/B, tabla comparativa y preguntas guía originales

Se mantienen sin editar como registro histórico del razonamiento — no repetidas acá para no duplicar; ver el archivo original adjunto a la sesión de Cowork del 2026-08-12 si hace falta recuperar el detalle completo de la Opción B (Gateway + Ejecución, descartada) y sus tradeoffs.

---

## 12. Próximo paso real (post-resolución)

1. `installer/aitap/AGENTS.md` ya codifica el guardrail para cualquier agente que trabaje en ese directorio.
2. Falta decidir y ubicar la "Implementation Layer" (componente que administra sesiones OpenCode headless) — no es parte de este documento ni de este scaffold. Cuando se aborde, debería tener su propia carpeta bajo `installer/` con su propio `AGENTS.md`, y consumir a AITAP como cliente (nunca al revés).
3. Falta definir el bridge Implementation Layer ↔ Nucleus (gobernanza de cambios de código) — dominio distinto del que ya existe (`nucleus vault`). No asumir que es el mismo subcomando ni el mismo contrato.
