# Módulo de Autorización de Nucleus — Borrador v0.2

**Estado:** DRAFT / PROPUESTA — no es contrato aprobado.

> **Nota de evolución aprobada (2026-09-02):** la premisa de este borrador que
> ubica roles y autoridad organizacional en `.ownership.json` fue superada por
> `docs/ROLES/BLOOM_REMOTE_ORGANIZATIONAL_ROLE_AUTHORITY_REQUIREMENT_v0_1.md`
> y la evolución coordinada de `docs/BATCAVE/BATCAVE_ARCHITECTURE.md` §11.
> Se conserva el contenido original como caracterización del modelo
> `local_legacy`. La dirección vigente exige Backend como fuente de verdad
> organizacional, Authority Snapshots transportados por Batcave y verificados
> por Nucleus, y autorización efectiva local propiedad de Nucleus. Las
> superficies concretas de implementación continúan sin aprobar.

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

---

## 10. Evolución requerida de la metodología de autorización

**Estado de esta sección:** dirección estructural aprobada por José Vigil el
2026-09-02; interfaces, schemas, packages, stores, archivos, eventos, TTLs y
perfil criptográfico pendientes de aprobación específica.

Las secciones 1–8 describen el modelo local previo. No deben utilizarse para
inferir que `.ownership.json`, `.master`, `.specialist` o un `actor_role`
declarado continúan siendo la fuente final de autorización después del cutover.

### 10.1 Principio rector actualizado

Nucleus conserva un único punto de decisión efectiva, pero su entrada ya no es
un rol local aislado. La decisión debe resultar de la intersección de:

```text
principal autenticado y organización activa
∩ Authority Snapshot remoto verificado y aceptado
∩ membership, assignment, scope y vigencia
∩ acción y target exactos
∩ Sovereign Policy
∩ GravityPostures aplicables
∩ reglas de Vault
∩ límites de Executor
∩ límites técnicos y ambientales
= decisión efectiva local
```

Backend conserva principals, memberships, definiciones y asignaciones de roles,
vigencias y revocaciones. Batcave autentica sesiones, transporta y cachea el
estado, pero no decide roles ni permisos. Nucleus verifica y decide. Brain y
Temporal ejecutan solamente la operación autorizada. Metamorph permanece fuera
del transporte ordinario y del rollback de autoridad mutable.

### 10.2 Separación de responsabilidades internas

El modelo objetivo requiere separar conceptualmente:

1. recepción y sincronización del Authority Snapshot;
2. verificación criptográfica y semántica independiente;
3. aceptación monotónica, persistencia y reconciliación;
4. resolución de identidad, membership, assignments, scopes y vigencia;
5. evaluación contextual de autorización;
6. propagación de restricciones y revocaciones a boundaries locales;
7. auditoría de la decisión sin convertirla en una fuente alternativa.

Recibir o cachear un snapshot nunca concede autoridad. Sólo una versión
aceptada por Nucleus puede participar en una decisión.

### 10.3 Estado monotónico y anti-downgrade

Nucleus debe conservar por organización un high-water mark separado del
snapshot reemplazable y de los artefactos de aplicación:

```text
versión recibida < versión aceptada          → rechazo
misma versión + mismo digest                 → replay idempotente
misma versión + digest diferente             → incidente de integridad
versión recibida > versión aceptada          → candidata tras verificación completa
```

Rollback de software, restore de Batcave, edición local o reinstalación no
pueden reducir este estado ni restaurar una membership o permiso revocado. Un
procedimiento break-glass, si se aprueba, será un contrato de governance
separado y no un flag `force` ordinario.

### 10.4 Migración explícita

La transición se realiza mediante modos mutuamente excluyentes:

```text
local_legacy → shadow_remote → remote_enforced
```

- `local_legacy` caracteriza y conserva temporalmente los guards actuales.
- `shadow_remote` verifica snapshots y registra divergencias sin cambiar la
  autorización productiva.
- `remote_enforced` elimina la capacidad de los archivos y marcadores locales
  para conceder membership, rol, scope o privilegio.

Ningún modo puede combinar autoridad local y remota seleccionando el resultado
más permisivo. El cutover requiere identidad resuelta, trust binding aceptado,
snapshot inicial válido y high-water mark persistido.

### 10.5 Impacto sobre guards existentes

Los checks directos contra `GetUserRole()`, `.master`, `.specialist`,
`team_members[].role` y lecturas de `.ownership.json` son superficies legacy.
Todos los entry points privilegiados deberán migrar a una decisión única de
Nucleus. Vault, Mandates, Alfred, Brain, UI y Executor no deben reimplementar
roles ni interpretar directamente el snapshot.

`.ownership.json` puede sobrevivir como bootstrap y trust binding local, pero
después de `remote_enforced` una edición de ese archivo nunca puede elevar o
restaurar autoridad.

### 10.6 Revocación, offline y trabajo en curso

Una revocación aceptada puede bloquear nuevas operaciones, invalidar decisiones
cacheadas, afectar accesos de Vault, impedir nuevos attempts de Executor y
obligar a que workflows en curso revaliden antes de pasos privilegiados. La
elección entre cancelar, pausar, drenar o alcanzar un checkpoint seguro requiere
una decisión posterior de policy y lifecycle.

La pérdida de conectividad no extiende autoridad. Un snapshot aceptado continúa
siendo utilizable sólo mientras cumpla la vigencia y frescura aprobadas. Después
de expirar, Nucleus entra en modo restringido fail-closed para nuevas acciones
que dependan de autoridad organizacional. Diagnóstico, observación y operaciones
que reduzcan riesgo pueden continuar únicamente conforme a la política offline
aprobada.

### 10.7 Consulta, decisión y auditoría objetivo

La forma concreta de la interfaz sigue abierta, pero toda consulta deberá
representar como mínimo actor, organización, acción, target, scope solicitado y
contexto técnico relevante. Toda decisión deberá ser bounded y correlacionable
con la versión de autoridad aceptada, policies y Gravity aplicadas, límites
resultantes, razón y vigencia.

El registro de auditoría local debe distinguir:

- hechos organizacionales remotos;
- proyección verificada y aceptada;
- decisión efectiva de Nucleus;
- evidencia posterior de ejecución.

Ninguno de esos registros derivados puede convertirse en una segunda fuente de
autoridad organizacional.

### 10.8 No-decisiones preservadas

Esta actualización no aprueba tablas, endpoints, topics, payload schemas,
algoritmos, claves, trust stores, TTLs, intervalos, nombres de interfaces,
packages, archivos ni cambios de código. Tampoco aprueba un catálogo final de
roles o una política concreta para operaciones offline y revocación de trabajo
en curso.
