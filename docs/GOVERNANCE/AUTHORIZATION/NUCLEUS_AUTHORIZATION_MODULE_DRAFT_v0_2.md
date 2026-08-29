# Módulo de Autorización de Nucleus — Borrador v0.2

**Estado:** DRAFT / PROPUESTA — no es contrato aprobado.

**Cambios vs. v0.1:** incorpora hallazgo estructural a partir de `bloom_nucleus_tree.txt` y
`bloom_project_tree.txt` — Nucleus no es un bloque opaco monolítico, tiene doble naturaleza (autoridad
organizacional + proyecto propio que ejecuta sus propios intents). Esto resuelve una tensión que había
quedado abierta en la revisión anterior sobre dónde vive el registro de decisiones de `cor`. Se agrega
mapeo candidato desde los árboles de filesystem (§8) y se ajusta §3 (registro de decisiones).
Todo lo marcado como "candidato" en este documento es **inferencia por naming convention y estructura de
árbol**, no contenido confirmado — ningún archivo `.bl`/`.json` fue leído, porque no están disponibles.

**Origen de cada pieza:**
- `proposer_type` y el punto de enforcement (`validate_and_sign`, previo a firma) → `COR_Intent_Spec_v1_0.md`
  §1, §1.1, §3.1.
- Niveles de rol Master/Specialist → nombrados en `BTIPS v7.0` §9.5. `Architect` es una propuesta de
  diseño de este documento, sin respaldo en esa fuente ni en ninguna otra fuente confirmada hasta ahora.
- Doble naturaleza de Nucleus (autoridad + proyecto propio) → inferencia estructural de
  `bloom_nucleus_tree.txt` (§0 de esta sección), aportada por José.
- Necesidad de mecanismo de verificación en el boundary de Executor → gap identificado en la limpieza del
  término `Grant`, sigue sin resolver.
- Roles aplicados a `mrg` e instalación de Mandates, y el paradigma "orbital" → mencionados por José, sin
  spec propia todavía.

---

## 0. Hallazgo estructural: Nucleus tiene doble naturaleza

`.nucleus-{organization}/` no es solo el store de reglas y políticas de la organización — tiene su propio
`.intents/` (`.exp/`, `.cor/`), con la misma forma de pipeline que un proyecto usa para `dev`/`doc`/`ing`/
`dis`: turnos, `.files/` de staging, `.pipeline/` con `.payload.json`/`.response/`. Esto separa dos capas
que `COR_Intent_Spec_v1_0.md` trataba como una sola:

| Capa | Qué es | Dónde vive (candidato) | Opacidad para Agent Loop |
|---|---|---|---|
| **Nucleus-autoridad** | Store real de reglas, políticas y roles — la "regla de negocio cruda" | `.core/.policies.bl`, `.core/.rules.bl`, `.core/.ownership.json` | Total — nunca expuesto, es lo que la Invariante de opacidad (`cor` §3.2) protege |
| **Nucleus-proyecto** | Ejecución del intent `cor` (u otro) como cualquier otro intent: staging, turnos, logs locales | `.intents/.cor/.{uuid}/...` | Irrelevante por boundary de filesystem — un Agent Loop corre dentro de `.project-{name}/.bloom/` y no tiene ruta física hacia `.nucleus-{organization}/`, exista ahí lo que exista |

Esto resuelve la tensión que había quedado marcada en la revisión de los árboles: `.governed_submission/
.files/.approval_log.json` (bajo un path de intent) no contradice que `CorNucleusRecord` "nunca se
serializa a un path accesible por Agent Loop" — el registro real de autoridad sigue viviendo en la capa
Nucleus-autoridad; lo que hay bajo `.intents/.cor/` es evidencia/staging de una decisión ya tomada, no el
mecanismo que la toma.

**Consecuencia para el módulo:** Nucleus-como-proyecto se autoriza con la misma máquina que autoriza a
cualquier otro proyecto — no necesita un mecanismo especial por el solo hecho de correr "dentro de"
Nucleus. Refuerza el principio de un solo lugar (§0 de v0.1): incluso la ejecución de `cor` pasa por el
mismo módulo, no por una excepción de sistema.

---

## 1. Principio rector

*(sin cambios respecto a v0.1)* Ningún componente implementa su propia lógica de autorización. Toda
decisión pasa por un único punto en Nucleus (`validate_and_sign`). Cualquier necesidad nueva se agrega
como fila al registro de este módulo, nunca como mecanismo local.

---

## 2. Los dos ejes de autorización

| Eje | Pregunta | Fuente | Estado | Candidato en filesystem |
|---|---|---|---|---|
| **A — Proponente** | ¿Humano, sistema, o agente originó esto? | `COR_Intent_Spec_v1_0.md` §3.1 | Formalizado | `.core/.ai_bot.sovereign.bl` / `.governance.bl` / `.plane.bl` (tres niveles de abstracción del mismo eje — relación exacta entre ellos sin confirmar) |
| **B — Rol** | Dado un humano, ¿qué nivel jerárquico tiene? | `BTIPS v7.0` §9.5 (solo Master/Specialist) + diseño propio de este documento (`Architect`, sin fuente externa confirmada) | Formalizado por primera vez acá | `.core/.ownership.json` (único archivo, posición de raíz — candidato fuerte) |

**Asimetría observada, sin resolver:** el Eje A tiene tres archivos dedicados a nivel Nucleus; el Eje B
tiene uno solo. No está claro todavía si eso refleja que el Eje A necesita más granularidad real, o si es
un artefacto de cómo fue creciendo el sistema. Queda como pregunta abierta para cuando haya contenido real
que revisar — no se resuelve por inferencia de nombres.

---

## 3. Interfaz única de consulta

*(sin cambios respecto a v0.1)*

```typescript
interface AuthorizationQuery {
  proposer_type: "agent" | "human_operator" | "nucleus_system_decision";
  actor_role?: "master" | "architect" | "specialist";
  action: string;
  target: string;
  context?: Record<string, unknown>;
}

interface AuthorizationDecision {
  allowed: boolean;
  reason_code: string;
  decided_at: "validate_and_sign";
  authorized_by: "human_operator" | "nucleus_system_decision";
}
```

---

## 4. Registro de decisiones — ajustado por el hallazgo de §0

Se distingue ahora entre la fuente de autoridad y la evidencia de ejecución:

```typescript
// Fuente de autoridad — vive en la capa Nucleus-autoridad (.core/), nunca expuesta
// a ningún path bajo .intents/ de ningún proyecto ni del propio Nucleus.
interface AuthorizationRecord {
  record_id: string;
  action: string;
  target: string;
  proposer_type: "agent" | "human_operator" | "nucleus_system_decision";
  actor_role?: "master" | "architect" | "specialist";
  decision: "allowed" | "denied";
  reason_code: string;
  authorized_by: "human_operator" | "nucleus_system_decision";
  created_at: string;
}
```

El staging/evidencia local que un intent como `cor` produce durante su propia ejecución (tipo
`approval_log.json`) es un artefacto derivado de esta decisión, no un segundo lugar donde la autoridad se
define. Si en algún momento hay divergencia entre ambos, la fuente en `.core/` gana siempre.

Motor de persistencia concreto de `AuthorizationRecord`: sigue abierto (mismo GAP #C1 de `cor`, ahora a
escala de sistema).

---

## 5. Familia de `reason_code`

*(sin cambios respecto a v0.1)*

| `reason_code` | Eje | Ejemplo |
|---|---|---|
| `COR_FORBIDDEN_FOR_AGENT` | A | Ya existe |
| `ROLE_INSUFFICIENT` | B | Specialist intenta `mrg` reservado a Master |
| `MANDATE_INSTALL_FORBIDDEN` | B | Rol sin permiso instala Mandate |
| `PROPOSER_TYPE_FORBIDDEN` | A | Generalización futura de `COR_FORBIDDEN_FOR_AGENT` |

---

## 6. GAP — Executor y el boundary de verificación

*(sin cambios respecto a v0.1 — sigue sin evidencia en ninguno de los dos árboles.)* Ticket firmado
efímero vs. callback síncrono, decisión pendiente de José.

---

## 7. Pendientes explícitos

- [ ] Confirmar con contenido real (no solo nombres) que `.ownership.json` y `.core/.policies.bl` son
  efectivamente la fuente de autoridad — hipótesis fuerte, no confirmada.
- [ ] Confirmar la relación exacta entre `.ai_bot.sovereign.bl`, `.governance.bl` y `.plane.bl` — ¿son tres
  niveles de la misma jerarquía o tres mecanismos independientes?
- [ ] Resolver la asimetría Eje A (3 archivos) vs. Eje B (1 archivo) — ¿intencional o histórica?
- [ ] Confirmar que `approval_log.json` es staging/evidencia y no una segunda fuente de autoridad —
  hipótesis de §0, no confirmada.
- [ ] Formalizar permisos de `mrg` — depende de `MRG_Intent_Spec_v1_0.md`, todavía no revisado.
- [ ] Formalizar permisos de instalación de Mandates — pista nueva: posible relación entre
  `parent_mandates` ausente en `mandate.json` (mandate raíz) y rol requerido para instalarlo. Hipótesis,
  no confirmada.
- [ ] GAP #A1 (Executor, boundary de verificación) — sin resolver, sin evidencia en los árboles.
- [ ] Determinar si "orbital" introduce un eje nuevo — requiere spec propia.

---

## 8. Mapeo candidato — resumen desde los árboles de filesystem

| Pieza del módulo | Candidato | Certeza |
|---|---|---|
| Eje B (rol humano) | `.ownership.json` | Alta |
| Eje A (agente), 3 niveles | `.ai_bot.sovereign/governance/plane.bl` | Media |
| Regla combinada (decisión) | `.core/.policies.bl` | Media |
| Fuente de autoridad vs. evidencia de ejecución | Distinción `.core/` vs. `.intents/.cor/` | Media-alta (hallazgo §0) |
| Boundary Executor (GAP #A1) | Sin evidencia en ningún árbol | Ninguna |

---

## 9. Regla de gobernanza para agentes

*(sin cambios respecto a v0.1)* Ningún agente introduce mecanismos de autorización fuera de este
documento. Toda necesidad detectada se reporta como fila pendiente acá.
