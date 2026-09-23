# Investigación — Estructura de Tenant, Organización y Roles v0.1

**Emitido por:** cowork asignado, Fase 1 del encargo.
**Fecha:** 2026-09-22.
**Encargo que responde:** `Encargo_Investigacion_Estructura_Tenant_Organizacion_Roles_Base_Invitaciones_v1_0.md` (`ANALYSIS/BACKEND/ROLES/`), §2 completo.
**Estado:** Fase 1 — investigación cerrada, a la espera de aprobación de Jose antes de habilitar la Fase 2 (diseño de invitaciones). No propone ni bosqueja ningún diseño de invitaciones — eso está fuera de alcance de este documento por mandato explícito del encargo.
**Método:** lectura completa (no por encima) de todo el código listado en §3 del encargo, más las migraciones 0004–0017, más los documentos previos del proyecto listados en §3 y los dos documentos de ONBOARDING que son el punto de partida directo. Cada afirmación de este documento cita archivo y, cuando aplica, línea o fragmento concreto — ninguna se apoya en intuición ni en lo que otro documento *dice* que el código hace, sin haber confirmado el código en sí.

---

## 0. Resumen ejecutivo

- **Tenant es, hoy, un agrupador puramente administrativo sin ninguna autoridad propia.** No tiene roles, no firma nada, no aparece en ningún lado del contrato de autoridad (`WireFullContent`). Es una fila con `id/name/master_github_username/key_fingerprint/created_at` que agrupa organizaciones (§1).
- **La Organización sigue siendo, sin excepción, el único límite real de autoridad, firma y aislamiento.** Cada organización tiene su propia cadena de emisiones, su propio espacio de `principal_id`, sus propias membresías y asignaciones de rol. Dos organizaciones "hermanas" del mismo Tenant no comparten absolutamente nada de autoridad entre sí — comparten únicamente la fila de `tenants` que las agrupa (§2).
- **El catálogo de roles builtin real en código, hoy, tiene tres roles: `master`, `specialist`, `operator`.** Existe además una decisión de producto ya aprobada por Jose el 2026-09-12 para agregar dos roles builtin más (`delegate`, `scoped_admin`) — **pero esa decisión nunca se implementó**: no hay migración, no hay entrada en `emission.ts`, no hay rastro en código. Cualquier diseño de invitaciones que asuma que esos roles ya existen estaría construyendo sobre un supuesto falso (§3.1).
- **El mecanismo de otorgar/aceptar un rol ya existe, es genérico y no fue construido pensando en invitaciones — pero es exactamente el primitivo que una invitación necesitaría.** `propose_membership`/`propose_assignment` + `accept` en `administration.ts` puede sembrar un `principal_id` que todavía no existe en la organización, siempre que se le entregue evidencia de identidad canónica verificada. Confirmo con lectura directa de código el hallazgo que ya había señalado `Propuesta_Diseno_Invitaciones_Organizacion_v0_1.md` §0 (§3.4).
- **No existe jerarquía nombrada entre roles — existe una relación de subconjunto de permisos, evaluada en cada operación.** Un otorgante nunca puede otorgar un permiso que él mismo no tenga, ni uno que exceda el permission-set vigente del rol `master` builtin. No hay ningún campo de "nivel" o "rango" en ningún lado del schema (§3.5, §4.3).
- **Una empresa real con casa matriz y filiales se modela como 1 Tenant con N Organizaciones, todas "hermanas" — nunca como una jerarquía de organizaciones padre/hija.** No existe ningún concepto de organización "dentro de" otra organización; el único árbol posible es Tenant → Organizaciones, de un solo nivel (§4.1).
- **Hoy sólo hay dos formas de entrar por primera vez a la autoridad de una organización, y las dos entran como `master` de una organización nueva** (génesis, o `createOrganizationUnderTenant`). No existe ningún camino de producción, hoy, para que alguien se una a una organización **ya existente** con un rol no-fundador sin que otro humano con `authority.membership.manage` ya activo lo proponga explícitamente vía el primitivo de administración (§4.2, §4.4).

---

## 1. Eje §2.1 — Tenant: qué es y qué autoridad tiene

### 1.1 Qué representa un Tenant hoy

Un Tenant es una fila de la tabla `tenants`, introducida en la migración `0015_tenants.sql`:

```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  master_github_username TEXT NOT NULL,
  key_fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
ALTER TABLE organizations ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
```

El propio comentario de cabecera de esa migración es explícito y se confirma leyendo el resto del código: **"NINGÚN código de runtime lee `tenant_id` todavía [al momento de esa migración] — es un cambio de schema puro, sin efecto observable"**. Esto fue Fase 1 del plan de `Propuesta_Arquitectura_Tenant_Soberano_v0_1.md` (Opción A, confirmada por Jose 2026-09-16), y quedó cerrado según `Cierre_Implementacion_TenantSoberano_Fase1_v1_0.md`.

Confirmado en código real (no sólo en la propuesta) que el Tenant **no participa del contrato de autoridad en absoluto**: `schema.ts` (`WireFullContent`, `WirePrincipal`, `WireMembership`, `WireRoleDefinition`, `WireRoleAssignment`, `WireRevocation`) no tiene ningún campo `tenant_id` en ningún lado. `normalizeState()` (`emission.ts`) valida cada colección contra un único `organizationId` — nunca contra un tenant. El límite de firma, JCS-canonicalización y digest (`canonical.ts`, usado por `emission-store.ts`) opera exclusivamente por organización.

**Conclusión:** Tenant no tiene autoridad, permiso ni dato propio en el sentido de autoridad — es metadata de agrupamiento. Es intencional y está documentado como decisión explícita: *"El Tenant agrupa. La Organización sigue siendo el único límite real de autoridad, firma y aislamiento — exactamente como hoy"* (`Propuesta_Arquitectura_Tenant_Soberano_v0_1.md` §2.1).

### 1.2 Qué operaciones existen hoy sobre un Tenant, y quién puede ejecutarlas

Sólo tres, todas en `backend/src/authority/tenant-store.ts` + `administration-route.ts`:

| Operación | Función | Ruta HTTP | Quién puede |
|---|---|---|---|
| Crear Tenant | (implícita, ver §1.3) | — | Nadie lo crea directamente; nace siempre junto con una Organización. |
| Listar organizaciones del tenant | `listTenantOrganizations` (`tenant-store.ts:68-73`) | `GET /v1/authority/tenant/organizations` | **Cualquier miembro con sesión activa** en cualquier organización del tenant — no requiere rol `master`. Confirmado en el propio comentario de la función: *"No requiere rol master — cualquier miembro activo de cualquier organización del tenant puede enumerar hermanas"*, y en la ruta (`administration-route.ts:82-94`), que sólo exige `resolveHumanSession`. |
| Crear organización hermana | `createOrganizationUnderTenant` (`tenant-store.ts:82-103`) | `POST /v1/authority/tenant/organizations` | Sólo quien sea `master` builtin **activo** (vía membership activa) en la organización de origen — verificado con `isActiveMaster()` contra `loadCurrentEmission()` de esa organización, el mismo criterio que usa `masterPermissions()` en `administration.ts`. |
| Leer el `tenant_id` propio | `authorityTenantSelfResponse` (`tenant-self-route.ts`) | S2S, autenticado por instalación | Sólo lectura del propio `tenant_id`; sin chequeo de rol adicional — la autenticación de instalación S2S es la única puerta. |

No existe ninguna operación de "editar" o "borrar" un Tenant, ni de mover una organización de un Tenant a otro.

### 1.3 ¿Un Tenant puede tener más de una Organización? ¿Cómo nace esa relación?

Sí, confirmado en dos caminos de código distintos:

1. **Nacimiento conjunto (génesis).** `genesis-store.ts::createOrganizationAndIssue` (líneas 53-90) crea, en un único `db.batch` atómico: un Tenant nuevo (`tenantId = crypto.randomUUID()`, **independiente** de `organizationId` — a propósito, según el comentario de la función, a diferencia del backfill legado de la migración 0015 que reusó `organization.id` como `tenant.id`), la Organización, la identidad canónica del fundador, y el ancla de `authority_genesis_registry`. Esto es lo que corre cada vez que un GitHub subject nuevo pasa por génesis: nace exactamente 1 Tenant con exactamente 1 Organización dentro.

2. **Organización hermana agregada después.** `tenant-store.ts::createOrganizationUnderTenant` (líneas 82-103) resuelve el `tenantId` de la organización de origen (`resolveTenantId`), y luego inserta una Organización **nueva** con ese mismo `tenant_id` — sin crear un Tenant nuevo. El comentario de cabecera del archivo la describe como "mini-génesis sin el paso de OAuth": el humano ya probó posesión de su sesión en la organización de origen, así que se le da un `principal_id` nuevo (propio de la organización nueva) más una identidad canónica ya verificada, reusando los datos (`subject`, `display_handle`) que ya tiene en `authority_human_identities` de la organización de origen.

En ambos casos, la Organización nueva **no** recibe automáticamente una emisión de autoridad — sólo organización + identidad. El comentario de cabecera de `tenant-store.ts` deja registrada explícitamente una corrección de diseño respecto de la Propuesta original: *"la propuesta decía que esta función llamaría a `createInitialAuthorityEmission` inline [...] Al implementar, confirmé [...] que `finishGenesis` NO hace eso [...] La emisión inicial requiere una instalación activa registrada [...], y esa instalación sólo puede registrarse DESPUÉS de conocer el id de la organización nueva"*. El contrato real es de **dos pasos**: crear organización+identidad (esta función), y luego el caller registra una instalación y llama a `/v1/authority/initial-emission` (`initial-emission.ts`, ya existente) por separado.

### 1.4 ¿Hay algo que un Tenant permita que una Organización aislada no permita, o viceversa?

No en términos de autoridad — una organización sin tenant (si pudiera existir; hoy toda organización nace con `tenant_id` seteado, ver `0015_tenants.sql` backfill y ambos caminos de nacimiento de §1.3) tendría exactamente la misma capacidad de firma, autorización y aislamiento que una con hermanas.

La única diferencia funcional real que pertenecer a un Tenant con más de una Organización habilita es: **(a)** enumerar organizaciones hermanas (`listTenantOrganizations`), y **(b)** crear una organización hermana nueva sin repetir el flujo completo de OAuth de génesis, reusando la sesión ya activa (`createOrganizationUnderTenant`). Ninguna autoridad, permiso o dato de negocio cruza esa frontera — es una comodidad operativa de "ya sé quién sos, no te hago loguearte de nuevo", no una relación de autoridad.

---

## 2. Eje §2.2 — Organización: su relación con el Tenant y su independencia de autoridad

### 2.1 Qué autoridad vive en la Organización que NO vive en el Tenant

Toda. Cada organización tiene, de forma completamente independiente de sus hermanas:

- Su propia cadena de emisiones (`authority_emissions`, PK `(organization_id, authority_version)`, migración `0004_authority_emissions.sql`) — versión, firma Ed25519, digest, todo por organización.
- Su propio espacio de `principal_id` — confirmado en `tenant-store.ts::createOrganizationUnderTenant`: el mismo humano recibe un `principal_id` **nuevo** (`crypto.randomUUID()`) al crear/unirse a cada organización, distinto en cada una. `authority_human_identities` no tiene `UNIQUE` sobre `subject` solo — el único anclaje 1:1 real de todo el sistema es `authority_genesis_registry.subject TEXT PRIMARY KEY`, y ese sólo gatea la **primera** organización que un subject de GitHub puede crear por génesis (no impide que ese mismo subject tenga identidades en otras organizaciones por otros caminos).
- Sus propias membresías, asignaciones de rol, definiciones de rol personalizadas y revocaciones — todas con `organization_id` como parte de la clave o como filtro obligatorio en `normalizeState()` (`emission.ts:75`: *"if (m.organization_id !== organizationId [...]) fail(...)"*).
- Su propio catálogo de roles personalizados (`role_definitions` con `organization_id` no-NULL) — nunca compartido entre organizaciones, ni siquiera hermanas del mismo tenant (ver §3.1 más abajo sobre qué sí es global).

**Confirmación en código, no sólo en la propuesta:** ningún archivo de firma/snapshot/administración (`canonical.ts`, `snapshot.ts`, `emission.ts`, `emission-store.ts`, `administration.ts`) tiene ninguna referencia a `tenant_id`. El propio texto de la Propuesta lo afirma y el código lo confirma sin excepción: *"ningún código de firma, snapshot, canonical, ni Nucleus necesita saber que el concepto de Tenant existe"* (`Propuesta_Arquitectura_Tenant_Soberano_v0_1.md` §2.1) — verificado leyendo esos cinco archivos completos en esta sesión.

### 2.2 Qué significa que dos Organizaciones sean "hermanas" — ¿comparten algo?

Comparten **únicamente** la fila de `tenants` a la que ambas apuntan vía `organizations.tenant_id`. No comparten:

- Autoridad, membresías ni asignaciones (cada una tiene su propio `state` completo, ver §2.1).
- Catálogo de roles **personalizados** — un `role_definitions` con `organization_id = A` no es visible ni utilizable desde la organización B, aunque sean hermanas. `normalizeState()` valida el catálogo contra el `organizationId` que se le pasa explícitamente en cada llamada.
- Claves de firma — cada organización tiene su propio ciclo de emisión y firma independiente.

Lo único verdaderamente global (no ligado a organización ni a tenant) es el **catálogo builtin** (`role_definitions` con `organization_id IS NULL`: `master`, `specialist`, `operator` — ver §3.1). Ese catálogo es idéntico y visible para **cualquier** organización del sistema, sean hermanas o no — no es un beneficio de pertenecer al mismo tenant, es una propiedad del sistema entero.

### 2.3 Operaciones que cruzan la frontera de una Organización

Una sola existe hoy: `createOrganizationUnderTenant` (crear una hermana). Está autorizada, según el propio comentario del código, por un criterio explícito confirmado por Jose el 2026-09-16: **ser `master` — builtin, activo — en CUALQUIER organización que ya pertenezca al tenant** (`tenant-store.ts:25-29`, función `isActiveMaster` líneas 48-54). No hace falta ser `master` específicamente de la organización "raíz" del tenant (no existe tal concepto — todas las organizaciones de un tenant son pares, ver §4.1) — alcanza con serlo de cualquiera de las hermanas ya existentes.

No existe ninguna otra operación que cruce esa frontera: no hay forma de que una acción en la Organización A modifique membresías, asignaciones o roles de la Organización B, ni siquiera siendo `master` de ambas.

---

## 3. Eje §2.3 — Roles: catálogo, alcance, y cómo se otorgan

### 3.1 Catálogo builtin completo — confirmado en código, no en documentos

Tres roles builtin existen realmente en código hoy (`organization_id IS NULL` en `role_definitions`), con permisos confirmados en dos fuentes independientes que coinciden exactamente: las constantes de `emission.ts` (líneas 5, 10) y el `INSERT` de semilla de las migraciones `0011_authority_role_catalog_operator.sql` y `0013_authority_genesis.sql`:

| Rol | `role_version` | Permisos | Origen |
|---|---|---|---|
| `master` | `1` | `authority.membership.manage`, `authority.role_definition.manage`, `authority.assignment.manage`, `authority.binding.approve`, `authority.cutover.approve`, `mandate.create`, `mandate.sign`, `mandate.promote`, `mandate.install`, `intent.create`, `intent.cor.merge`, `agent.issuer.designate` | `0013_authority_genesis.sql` |
| `specialist` | `1` | `intent.create` | `0013_authority_genesis.sql` |
| `operator` | `1` | `intent.create`, `agent.issuer.designate` | `0011_authority_role_catalog_operator.sql` |

`normalizeState()` (`emission.ts:82-88`) hace cumplir estos tres catálogos como invariante estructural: cualquier `role_definition` con `role_origin: "builtin"` cuyo `role_id` sea `master`/`specialist`/`operator` **debe** tener exactamente ese permission-set y `role_version: "1"`, o falla con `"builtin contradiction"`. Y ningún rol de organización puede reusar esos tres `role_id` (`"reserved role"`). También hay un cuarto nombre explícitamente **prohibido para siempre**, sin importar el origen: `if (r.role_id.toLowerCase() === "architect") fail("architect forbidden")` (`emission.ts:82`) — no está documentado el porqué en ningún archivo leído; se deja señalado como hallazgo, no como algo a explicar.

**Hallazgo importante — decisión aprobada pero no implementada:** `Cierre_Investigacion_Roles_Organizacionales_y_Nomenclatura_Agente_v0_1.md` registra que Jose aprobó el 2026-09-12 la incorporación de **dos roles builtin adicionales**: `delegate` (administración operativa acotada, permisos de `vault.*`/`executor.*`) y `scoped_admin` (administración de `authority.*` acotada a un proyecto) — nombres explícitamente marcados como "primera pasada, no finales". **Esta investigación confirma que esa decisión nunca se tradujo a código**: no existe ninguna migración que los siembre, `emission.ts` no los define, y `normalizeState()` no los reconoce como builtin (un intento de definir un rol de organización con `role_id: "delegate"` hoy sería tratado como un rol de organización normal, no como builtin — no está en la lista `["master", "specialist", "operator"]` de roles reservados). **Cualquier diseño de invitaciones que asuma la existencia de `scoped_admin` como rol otorgable hoy estaría construyendo sobre un supuesto falso** — es una decisión de producto aprobada, no un hecho del sistema actual.

Universo completo de permisos reconocidos por el sistema (`emission.ts:11`, unión de `master` más cuatro adicionales no incluidos en ningún rol builtin hoy): los 12 de `master`, más `vault.key.read`, `vault.key.write`, `vault.key.delete`, `executor.command.execute`, `executor.filesystem.write`, `executor.network.access`, `executor.change.promote`. Estos siete últimos sólo pueden vivir hoy en roles **personalizados de organización** (`define_role`) — ningún builtin los otorga.

### 3.2 Cómo se define un rol nuevo dentro de una organización, y quién puede hacerlo

Comando `define_role` en `evaluateAdministration` (`administration.ts:187-196`):

- Requiere `authority.role_definition.manage` (`requirePermission`).
- `role_origin` debe ser `"organization"` — nunca se puede definir un rol declarado `"builtin"` vía este comando.
- Cada permiso del rol nuevo debe estar dentro de `masterPermissions()` — el permission-set del rol builtin `master` **actualmente activo** en esa organización (leído dinámicamente de `role_definitions`, no hardcodeado) — si algún permiso pedido no está ahí, falla `"grant_exceeds_authority"`.
- Versionado append-only por `role_id`: la nueva versión debe ser exactamente `max(versiones previas) + 1` — no se puede saltar versión ni reusar una.
- No hay ningún chequeo de que el *actor* ya posea esos permisos para definir el rol (a diferencia de *otorgarlo*, ver §3.3) — definir un rol y poder otorgarlo son dos autorizaciones separadas.

### 3.3 Alcance (`scope`) de un rol asignado, y qué es verificable hoy

El contrato wire define cinco tipos de scope posibles (`schema.ts`, `WireRoleAssignment.scope.type`): `"organization" | "project" | "mandate" | "intent" | "resource" | "environment"`.

**Pero sólo dos son verificables en código hoy** — `scopeVerified()` (`administration.ts:113-122`):
- `"organization"`: válido únicamente si `scope.id === org` (la propia organización).
- `"project"`: válido sólo si existe evidencia activa en `authority_project_scope_evidence` para ese `project_id` (revisión, `source_ref`, tipo de evidencia canónica o fixture de test, vigente).
- **Cualquier otro tipo** (`"mandate"`, `"intent"`, `"resource"`, `"environment"`) hace fallar la operación con `"scope_unverifiable"` — el wire schema los admite como valores válidos de tipo, pero el motor de autorización no tiene ningún mecanismo de evidencia para confirmarlos todavía. Son scopes declarados en el contrato, no scopes utilizables en producción hoy.

### 3.4 Cómo se asigna un rol a alguien hoy — mecanismo completo de dos pasos

Confirmado leyendo `administration.ts` completo — coincide exactamente con lo que ya había señalado `Propuesta_Diseno_Invitaciones_Organizacion_v0_1.md` §0, y esta investigación lo verifica en el código real, no sólo en la cita de ese documento:

1. **Propuesta** (`propose_membership` o `propose_assignment`, función `checkProposal`, `administration.ts:145-173`):
   - `propose_membership`: requiere `authority.membership.manage` en el proponente. Si el `principalId` destinatario **todavía no existe** en el `state` de la organización, se acepta **sólo** si `context.initialIdentity` trae evidencia de identidad canónica ya verificada (un único proveedor externo — GitHub —, verificado, no revocado) que coincida exactamente con ese `principalId` — si no hay esa evidencia, la propuesta falla (`human()` exige que el principal exista y esté activo). Esto es exactamente el primitivo que una invitación necesitaría para sembrar la identidad de alguien que nunca pisó la organización — **hoy sólo se alimenta desde `initialHumanIdentity` (`human-session-store.ts`), que en producción resuelve identidad a partir de una sesión humana ya autenticada del propio proponente, nunca de un tercero sin sesión** (confirmado leyendo la única invocación real en `administration-route.ts:147`: `initialHumanIdentity(db, org, actor.principalId, s)` — siempre el `principalId` del actor autenticado, nunca uno arbitrario). Esta es exactamente la brecha que señala `Propuesta_Diseno_Invitaciones_Organizacion_v0_1.md` §1.1: el primitivo de propuesta ya sabe sembrar un principal nuevo, pero no hay, hoy, ninguna función de producción que le entregue evidencia canónica de un tercero sin sesión.
   - Guardia de auto-elevación: si `principalId === grantorId` (alguien se propone membership a sí mismo), sólo se permite si ya tiene una membership activa que cubra esa misma ventana temporal — no se puede auto-otorgar una membership desde cero.
   - `propose_assignment`: requiere que la membership ya exista y esté activa; el rol pedido debe existir y estar activo (`roleFor`); **`grantable()`** exige que el proponente tenga `authority.assignment.manage` **y** que todos los permisos del rol a otorgar estén simultáneamente dentro de `masterPermissions()` (el cap del sistema) **y** ya en poder del propio proponente (`held`) — nadie puede otorgar lo que no tiene. `scopeVerified()` valida el scope (§3.3). `selfGrant()` es una segunda guardia anti-auto-elevación específica para asignaciones, con el mismo principio: sólo se puede uno auto-asignar un rol si ya tiene, cubriendo la misma ventana, todos los permisos de ese rol.

2. **Aceptación** (`accept`, `administration.ts:178-186`): el `proposalId` debe existir, estar `pending`, y el actor que acepta debe ser exactamente el `recipientId` de la propuesta (`recipient_mismatch` si no). **Se re-evalúa `checkProposal` contra el estado *actual*, no se confía ciegamente en lo guardado** — si algo cambió entre la propuesta y la aceptación (el rol se revocó, el proponente perdió el permiso), la aceptación falla igual que si se estuviera evaluando desde cero. Recién en `accept` se crea la membership o el `role_assignment` real, con `accepted_at` igual al momento efectivo de la aceptación.

**Qué pasa si el destinatario todavía no es parte de la organización:** sólo cubierto por la rama `propose_membership` (crea la membership desde cero, con la identidad sembrada si hay evidencia). `propose_assignment` **siempre** requiere una membership ya existente y activa — no hay forma de proponer una asignación de rol para alguien que todavía no es miembro en el mismo paso.

### 3.5 Suspensión, revocación, expiración

Estados posibles de membership/assignment según el wire contract (`schema.ts`): `"pending" | "active" | "suspended" | "expired" | "revoked"`. En la práctica del motor (`administration.ts:197-227`):

- **Suspender:** sólo desde `active` → `suspended` (`"invalid_transition"` si no).
- **Reanudar (`resume`):** sólo desde `suspended` → `active`. Para reanudar un `role_assignment`, se re-valida `grantable()`/`selfGrant()` **en el momento de reanudar**, no se asume que seguía siendo válido. Para reanudar una `membership`, se reanudan en cascada todas sus asignaciones de rol activas que no hayan expirado, con la misma re-validación cada una. No se puede reanudar algo cuya validez ya expiró (`valid_until <= now`).
- **Revocar:** terminal — requiere un `revocationId` único, y escribe un registro inmutable en `revocations` con `reason_code: "ADMINISTRATIVE_REVOCATION"`. Una vez revocado, ninguna operación posterior puede tocar esa entidad (`historicalRevocation` se chequea en cada paso).

Nota de discrepancia menor entre schema y migraciones, señalada como hallazgo sin resolver: el wire contract (`schema.ts`) admite cinco estados (`pending|active|suspended|expired|revoked`) para `role_assignments`, pero el `CHECK` de la migración `0014_authority_role_assignment_status.sql` sólo permite tres a nivel de columna SQL (`'active','pending','suspended'` — sin `expired` ni `revoked` como valores de columna). No se investigó si esto es un problema real (podría ser que `expired`/`revoked` nunca se persistan como valor de columna porque se expresan de otra forma — revocado sale del `state` normalizado hacia la tabla `revocations`), pero es una discrepancia entre dos fuentes de verdad que vale la pena que alguien confirme si toca este código de cerca.

### 3.6 ¿Hay jerarquía entre roles?

No hay ninguna jerarquía **nombrada** (no existe un campo "nivel"/"rango"/"parent role" en ningún lugar del schema o del código). Lo que existe es una relación de **subconjunto de permisos evaluada en cada operación**, no una propiedad estática del catálogo:

- `grantable()` (§3.4): un otorgante sólo puede otorgar lo que (a) el rol `master` builtin activo del sistema permite como techo, y (b) el otorgante ya posee él mismo.
- `selfGrant()` (§3.4): mismo principio para auto-otorgamiento.

Esto es exactamente el patrón que ya había identificado `Investigacion_Catalogo_Completo_Roles_Organizacionales_v0_1.md` §3 punto 6 como el patrón de industria dominante ("alcance, no jerarquía de poder") — confirmado acá con evidencia de código directa, no sólo con el relevamiento de industria de esa investigación.

---

## 4. Eje §2.4 — Estructura jerárquica de las empresas

### 4.1 ¿Casa matriz + filiales se modela como 1 Tenant con varias Organizaciones?

Sí, confirmado — y con una precisión importante que el encargo pide verificar explícitamente: **no hay jerarquía entre las organizaciones de un mismo tenant.** Todas son pares ("hermanas"), en una estructura de un solo nivel: Tenant → {Organización A, Organización B, ...}. No existe en ningún lugar del schema o del código un concepto de organización "padre" ni "filial de" otra organización — `organizations.tenant_id` es la única relación, y es una relación de pertenencia a un agrupador común, no de subordinación entre organizaciones.

Esto significa que si una empresa real tiene una relación de subordinación genuina entre matriz y filial (la matriz puede, por ejemplo, revocar autoridad en la filial, o la filial hereda automáticamente algún permiso de la matriz), **eso no está representado en el modelo actual** — el sistema sólo sabe modelar "organizaciones que pertenecen al mismo agrupador administrativo", con autoridad totalmente independiente entre ellas (§2). Cualquier diseño que asuma jerarquía real entre organizaciones (no sólo agrupamiento) estaría inventando una capacidad que no existe hoy — sería, en los términos de `Propuesta_Arquitectura_Tenant_Soberano_v0_1.md` §3, la "Opción B" (Tenant como capa de autoridad propia), explícitamente **no** implementada y explícitamente **no recomendada** como próximo paso por quien escribió esa propuesta.

### 4.2 ¿Una persona puede tener roles distintos en distintas Organizaciones del mismo Tenant al mismo tiempo?

Sí, sin ninguna restricción de código. Cada organización asigna al mismo GitHub `subject` un `principal_id` propio (§2.1) — no hay ninguna tabla ni chequeo que sincronice o limite los roles de una misma persona entre organizaciones hermanas. Una persona podría ser `master` en la Organización A y no tener ninguna membership en la Organización B, o tener `specialist` en B — el sistema no tiene ningún mecanismo que lo impida ni que lo favorezca; son completamente independientes entre sí, consistente con que toda la autoridad vive en la organización (§2).

### 4.3 ¿Qué determina qué tan "alto" entra alguien en la jerarquía al unirse por primera vez?

Hoy existen **exactamente dos** caminos de producción para que alguien entre por primera vez a la autoridad de una organización, y **los dos, sin excepción, lo hacen como `master` de una organización recién creada**:

1. **Génesis** (`genesis-store.ts` → `initial-emission.ts::createInitialAuthorityEmission`): el fundador de una organización nueva recibe, atómicamente, exactamente 1 `principal`, 1 `membership` activa sin vencimiento, y 1 `role_assignment` del rol builtin `master` con `scope: {type: "organization", id: <la organización nueva>}`. Esto no es una posibilidad entre varias — `createInitialAuthorityEmission` (`initial-emission.ts:131-142`) **valida estructuralmente** que el estado inicial tenga exactamente esa forma (un solo principal, una sola membership, un solo rol `master` activo, una sola asignación) o falla con `"initial_evidence_required"`. No hay ninguna variante donde el fundador entre con otro rol.

2. **`createOrganizationUnderTenant`** (§1.3): mismo patrón — quien crea la organización hermana se convierte en su fundador-equivalente, y (según el contrato de dos pasos documentado en §1.3) termina, tras el segundo paso (`/v1/authority/initial-emission`), exactamente en la misma posición: `master` de la organización nueva.

**No existe hoy ningún tercer camino de producción para unirse a una organización *ya existente* con un rol no-fundador**, salvo el primitivo genérico de administración (`propose_membership`/`propose_assignment` + `accept`, §3.4) — que requiere que alguien **ya activo** en esa organización, con `authority.membership.manage`/`authority.assignment.manage`, lo proponga explícitamente. Ese primitivo sí permite, en principio, que alguien entre con cualquier rol que el proponente pueda otorgar (no necesariamente `master`) — pero hoy no hay ningún flujo de producto/UI/endpoint dedicado que dispare esa propuesta hacia alguien que todavía no tiene sesión ni cuenta en el sistema. Es exactamente la brecha que confirma, con evidencia de código, el hallazgo ya señalado por ambos documentos de ONBOARDING (§4.4 de este informe).

### 4.4 ¿Documentos previos que ya investigaron esto parcialmente?

Sí, tres, todos releídos y confirmados/corregidos contra el código en esta sesión:

1. **`Investigacion_Catalogo_Completo_Roles_Organizacionales_v0_1.md` (2026-09-12).** Investigación de industria + arquetipos organizacionales (founder solo / equipo chico-mediano / organización grande) y catálogo de roles necesario en cada uno. **Sigue vigente como investigación de industria y como catálogo de necesidades**, pero su recomendación central (agregar `delegate`/`scoped_admin`) **fue aprobada en principio por Jose pero nunca implementada** — confirmado en esta sesión releyendo el código real (§3.1). Cualquier trabajo posterior que asuma que esos roles ya existen como builtin otorgable está partiendo de un supuesto que el código de hoy no respalda.

2. **`Propuesta_Arquitectura_Tenant_Soberano_v0_1.md` + los cuatro `Cierre_Implementacion_TenantSoberano_FaseN_v1_0.md` (2026-09-16).** Es la fuente primaria de casi todo el §1 y parte del §4.1 de este informe. Las cuatro fases (schema inerte, génesis crea tenant, `createOrganizationUnderTenant`, discovery multi-organización en Batcave) están **confirmadas como implementadas y cerradas** — releído el código real de Fase 1-3 (Batcave/Fase 4 no se releyó código, sólo el cierre, por estar fuera del árbol de directorios autorizado por este encargo; el cierre reporta 43/43 tests verdes). La Opción A (Tenant sin autoridad propia) sigue siendo la arquitectura real y vigente — no hay evidencia de que se haya avanzado hacia la Opción B en ningún momento posterior.

3. **`Propuesta_Diseno_Retorno_Genesis_y_Hallazgo_Invitaciones_v0_1.md` y `Propuesta_Diseno_Invitaciones_Organizacion_v0_1.md` (ambas 2026-09-22, mismo día que este encargo).** Estos son el punto de partida directo que el encargo pide **poner a prueba, no heredar**. Esta investigación confirma que su hallazgo técnico central — *"el sistema de autorización ya tiene [...] un primitivo de dos pasos [...] que es exactamente una invitación"* — es correcto y está bien fundado en el código real (§3.4 de este informe llega a la misma conclusión de forma independiente, leyendo `administration.ts` completo). También confirma como ciertos sus dos hallazgos de brecha: (a) no existe hoy función de producción que siembre identidad canónica de un tercero sin sesión (§3.4, §4.3), y (b) el catálogo de roles no tiene, hoy, ningún rol builtin pensado para "invitado no-fundador" más allá de lo que ya existía (`specialist`) — el candidato `scoped_admin` que esos documentos no llegan a mencionar como opción está, de hecho, aprobado en principio pero no construido (hallazgo nuevo de esta investigación, no estaba en ninguno de los dos documentos de ONBOARDING). Ninguna de sus propuestas de diseño (schema de invitaciones, tercer eslabón del callback, etc.) fue evaluada ni validada por esta investigación — eso es explícitamente trabajo de Fase 2, fuera de alcance acá.

---

## 5. Contradicciones o inconsistencias encontradas entre documentos y código

Se dejan señaladas explícitamente, sin resolverlas (no es el rol de esta investigación decidir sobre ellas):

1. **Catálogo de roles aprobado vs. implementado (§3.1).** `Cierre_Investigacion_Roles_Organizacionales_y_Nomenclatura_Agente_v0_1.md` registra `delegate`/`scoped_admin` como aprobados por Jose el 2026-09-12. El código, al 2026-09-22 (fecha de este encargo), no los tiene. Si esa aprobación sigue vigente, falta implementarla; si fue reconsiderada, no hay registro de eso en ningún documento leído.
2. **Estados de `role_assignment` — wire schema vs. constraint SQL (§3.5).** `schema.ts` admite cinco estados; la migración `0014` sólo permite tres a nivel de `CHECK`. No se investigó si es un problema real en runtime.
3. **`Propuesta_Diseno_Invitaciones_Organizacion_v0_1.md` no menciona `scoped_admin` como candidato de rol para invitados**, a pesar de que — si esa decisión de 2026-09-12 se implementara antes o junto con las invitaciones — sería, por diseño, exactamente el rol pensado para "alguien que se une con administración acotada, no plena". No es una contradicción de hechos, es una laguna a tener en cuenta si Fase 2 retoma esa propuesta.

---

## 6. Confirmación del gate

Este documento responde, con cita de código y/o documento fuente en cada afirmación, los cuatro ejes obligatorios de §2 del encargo (Tenant §1, Organización §2, Roles §3, Estructura jerárquica §4), tal como pide §4 del encargo. No propone, sugiere ni bosqueja ningún diseño de invitaciones — el hallazgo de que el primitivo `propose_membership`/`accept` es reutilizable (§3.4) es una confirmación de un hecho ya señalado por `Propuesta_Diseno_Invitaciones_Organizacion_v0_1.md`, no una propuesta nueva de esta investigación.

Queda a la espera de revisión y aprobación de Jose antes de habilitar la Fase 2 (diseño de invitaciones), según manda §6 del encargo.
