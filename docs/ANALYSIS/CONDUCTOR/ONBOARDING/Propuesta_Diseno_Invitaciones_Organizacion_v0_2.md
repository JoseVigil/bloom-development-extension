# Propuesta de Diseño — Invitaciones a Organización Ajena v0.2

**Emitido por:** cowork asignado, Fase 2 del encargo.
**Fecha:** 2026-09-22.
**Encargo que responde:** `Encargo_Investigacion_Estructura_Tenant_Organizacion_Roles_Base_Invitaciones_v1_0.md` §5, habilitado por luz verde explícita de Jose tras aprobar `Investigacion_Estructura_Tenant_Organizacion_Roles_v0_1.md` y `Propuesta_Resolucion_Inconsistencias_Investigacion_TenantOrganizacionRoles_v0_1.md`.
**Relación con `Propuesta_Diseno_Invitaciones_Organizacion_v0_1.md`:** la confirma en su hallazgo central (§0 — el primitivo `propose_membership`/`propose_assignment` + `accept` es reutilizable) y en su modelo de datos (§2.1, adoptado casi sin cambios). La **corrige y completa** en el punto que ese documento dejó explícitamente abierto como "el más delicado" (§2.3.6: cómo ejecutar la membership sin una sesión humana viva del invitado en el momento del `accept`) — la Fase 1 de este encargo, al leer `administration.ts`/`administration-route.ts` completos, encontró que ese punto tiene una resolución limpia que **no requiere tocar `administration.ts`**, evitando el trade-off que v0.1 planteaba entre "relajar el núcleo" o "sesión primero" (esta última, además, tiene un problema de autorización que v0.1 no había detectado — ver §3.3). También incorpora las tres decisiones de resolución de inconsistencias ya acordadas: el rol otorgado es siempre un parámetro validado dinámicamente, nunca un nombre de rol hardcodeado, y no depende de `scoped_admin` existir como builtin.
**Estado:** propuesta de diseño, no encargo de implementación. Igual que v0.1, corresponde que Jose revise el punto de §3 (el mecanismo de actor sintético) antes de que se escriba código — es la pieza más sensible de este diseño, aunque, a diferencia de v0.1, no toca el núcleo de autorización.

---

## 0. Resumen ejecutivo

- **Modelo de datos:** se adopta el de `Propuesta_Diseno_Invitaciones_Organizacion_v0_1.md` §2.1 casi sin cambios (`authority_organization_invitations` + `authority_invitation_flows`), con dos campos nuevos para soportar scope y ventana de validez como parámetros (§1).
- **Autorización para crear una invitación:** no se exige ser `master` — se exige sostener `authority.membership.manage` **y** `authority.assignment.manage` en la organización, y que el rol/scope concretos pedidos pasen el mismo chequeo `grantable()` que ya usa `propose_assignment` hoy. `master` lo cumple trivialmente; también lo cumpliría, sin cambios de código, cualquier rol personalizado que una organización decida definir con esos dos permisos — continuidad directa de la decisión de resolución §1 (el rol es un parámetro, no una decisión hardcodeada) (§2).
- **El punto que v0.1 dejó abierto (§2.3.6 de ese documento) se resuelve sin tocar `administration.ts` ni `administration-store.ts`.** `administerAuthority` ya recibe `verifyActor` como una función inyectada por el caller (`administration-route.ts:155` construye el actor a partir de una cookie HTTP y se lo entrega así) — `finishInvitation` puede, de la misma forma, entregarle un `VerifiedHumanActor` construido internamente (nunca desde un campo controlado por el cliente), tanto para el paso de "proponer" (actuando en nombre de quien invitó) como para el paso de "aceptar" (actuando en nombre de quien fue invitado) — sin necesitar que ninguno de los dos tenga una sesión HTTP viva en ese momento. Cada paso sigue re-evaluándose contra el estado de autoridad vigente, en el momento exacto de la redención — no contra lo que valía cuando se creó la invitación (§3).
- **Tres rutas nuevas + reutilización del callback existente**, mismo patrón que génesis/Diseño P (§4).
- **`branch: "invited_existing_org"`** se agrega al contrato de retorno del callback, tal como proponía v0.1 §3 — confirmado como diseño correcto, sin cambios.
- Explícitamente fuera de alcance (§6), igual que v0.1: distribución del link (producto/UI), la decisión de `no_organization`, y reactivación de una membership previamente revocada vía invitación (nuevo hallazgo de esta versión, ver §5.4).

---

## 1. Modelo de datos

Igual que `Propuesta_Diseno_Invitaciones_Organizacion_v0_1.md` §2.1, con dos adiciones (marcadas `NUEVO`) que formalizan que scope y ventana de validez son parámetros de la invitación, no valores fijos — continuación directa de la lógica que ya rige `propose_assignment` hoy (scope y validez ya son campos de ese comando, no constantes).

```sql
CREATE TABLE authority_organization_invitations (
  id TEXT PRIMARY KEY NOT NULL,
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  invited_by_principal_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  role_version TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'organization' CHECK (scope_type IN ('organization','project')), -- NUEVO
  scope_id TEXT,                                          -- NUEVO: NULL si scope_type='organization' (implícitamente la propia org); requerido si 'project'
  valid_until TEXT,                                        -- NUEVO: NULL = sin vencimiento (igual que génesis por defecto); si se setea, es el valid_until de la membership Y del role_assignment resultantes
  invited_subject TEXT,                                     -- NULL = link abierto; no-NULL = fijado a un GitHub subject
  token_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,      -- vencimiento de la INVITACIÓN en sí (no de la membership resultante)
  accepted_at TEXT,
  accepted_principal_id TEXT
);
CREATE UNIQUE INDEX idx_invitations_token ON authority_organization_invitations(token_hash);
CREATE INDEX idx_invitations_org ON authority_organization_invitations(organization_id);

CREATE TABLE authority_invitation_flows (
  state_hash TEXT PRIMARY KEY NOT NULL,
  browser_hash TEXT NOT NULL,
  invitation_id TEXT NOT NULL REFERENCES authority_organization_invitations(id),
  verifier TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed IN (0,1)),
  result_json TEXT
);
```

Se mantiene sin cambios la justificación de v0.1 para separar `authority_invitation_flows` de `authority_genesis_flows` (ciclo de vida distinto: una invitación puede generar más de un intento de OAuth) y para incluir `result_json` desde el día uno (Diseño P, poll del resultado).

**Nota de scope, ligada a la decisión de resolución §3 (no formalizar `scoped_admin` ahora):** con `scope_type`/`scope_id` como parámetros de la invitación, "invitar con administración acotada a un proyecto" ya es expresable hoy sin ningún rol builtin nuevo — el `master` que invita puede usar un rol personalizado ya definido en su organización (`define_role`) y pedir `scope_type: 'project'`. Si `scoped_admin` se formaliza en el futuro, este modelo no necesita ningún cambio — es una opción más de `role_id`.

---

## 2. `createInvitation` — autorización y validación

Nuevo archivo `backend/src/authority/invitation-store.ts`, mismo patrón de archivo aditivo que `tenant-store.ts`.

### 2.1 Quién puede crear una invitación

**No se exige `isActiveMaster`.** Se exige, sobre el `state` de la emisión vigente de la organización:

1. El actor sostiene `authority.membership.manage` **y** `authority.assignment.manage` en scope de organización (misma función `permissions(principalId, orgScope)` que ya usa internamente `administration.ts` — ver nota de reuso en §2.3).
2. El rol pedido (`role_id`/`role_version`) existe, está `active`, y sus permisos son subconjunto simultáneo de: (a) el permission-set vigente del `master` builtin (`masterPermissions()`), y (b) los permisos que el propio actor ya sostiene en `orgScope` — exactamente el mismo par de condiciones que `grantable()` exige hoy dentro de `evaluateAdministration` para `propose_assignment`.
3. Si `scope_type: 'project'`, el `scope_id` debe tener evidencia activa en `authority_project_scope_evidence` — mismo criterio que `scopeVerified()`.

Esto es deliberadamente más general que "sólo `master`": cualquier organización que ya haya definido (vía `define_role`) un rol personalizado con esos dos permisos puede delegar la capacidad de invitar sin que ese rol se llame `master` — consistente con la decisión de resolución §1 (el catálogo de roles no condiciona el diseño de invitaciones) y con la de §3 (no hace falta `scoped_admin` builtin para lograr esto).

### 2.2 Por qué esta validación en creación es "fail-fast", no la autoridad real

La validación de §2.1 corre en `createInvitation`, pero **no es la fuente de verdad** — es una conveniencia para no dejar crear una invitación que se sabe, de antemano, que va a fallar en la redención. La autoridad real se re-evalúa en el momento de la redención (§3), contra el estado vigente en ese momento, que puede ser distinto (el actor pudo perder el permiso, el rol pudo suspenderse) — si eso pasa, la redención falla igual que fallaría hoy un `propose_assignment` tardío. Esto es el mismo principio que ya aplica `administerAuthority` al re-evaluar `checkProposal` en `accept` en vez de confiar en lo guardado (confirmado en la investigación de Fase 1, §3.4).

### 2.3 Nota de implementación — no reabrir `administration.ts`

Los chequeos de §2.1.1-2.1.2 (permisos sostenidos, subconjunto de `masterPermissions()`) están hoy implementados como funciones **privadas** dentro de `evaluateAdministration` (closures `permissions`, `masterPermissions`, `grantable` — `administration.ts:101-127`), no exportadas. Dos caminos, ninguno reabre la lógica de negocio de ese archivo:

- **(a) Duplicar la lógica de lectura** (no de decisión) en `invitation-store.ts`: leer `state.role_assignments`/`state.role_definitions` filtrando por `principalId`+`orgScope`+vigencia, igual que hace `activeAssignments`/`permissions` en `administration.ts`. Es lectura pura, sin ninguna rama de autorización nueva — el mismo criterio que ya se aplicó al construir `isActiveMaster` en `tenant-store.ts`, que tampoco reabre `administration.ts` y en cambio replica localmente el criterio de "rol activo vía membership activa".
- **(b) Exportar** `permissions`/`masterPermissions` desde `administration.ts` para reuso — cambio puramente aditivo (agregar `export` a una función existente, sin tocar su cuerpo), pero técnicamente sigue siendo "tocar" el archivo más sensible del backend.

**Recomiendo (a)**, por el mismo criterio que ya se usó en `tenant-store.ts`: cero riesgo sobre el archivo más cubierto por tests de todo el sistema, a costa de una duplicación de lectura acotada y de bajo riesgo (si diverge, el peor caso es una invitación que se crea optimista y falla en redención — nunca una invitación que otorgue más de lo debido, porque eso lo decide, en última instancia, la re-evaluación real de §3).

### 2.4 Contrato de la función

```ts
export async function createInvitation(db: D1Database, organizationId: string, actor: SessionActor,
  input: { roleId: string; roleVersion: string; scopeType: 'organization'|'project'; scopeId?: string;
    invitedSubject?: string; validUntil?: string; expiresInSeconds?: number },
  s: InvitationStoreServices): Promise<CreateInvitationResult>
```

Devuelve `{ invitationId, token, url }` — `url` navegable para que quien invita la comparta por el canal que decida (fuera de alcance de Backend, igual que v0.1 §4). `expiresInSeconds` con default razonable (p. ej. 7 días — a definir por producto, no es una decisión técnica).

---

## 3. Redención — el punto que v0.1 dejó abierto, resuelto

### 3.1 Por qué la opción "sesión primero" de v0.1 no alcanza

v0.1 §2.3.6 proponía, como opción recomendada, emitir primero la sesión del invitado (`issueSession`, igual que génesis) y usarla como actor para un segundo request interno de administración. Al construir el flujo completo en esta sesión se encontró un problema que v0.1 no había detectado: **el primer comando necesario es `propose_membership`, y ese comando exige que el *proponente* (`grantorId`) sostenga `authority.membership.manage`**. Si el actor de ese primer paso es el propio invitado recién identificado, no tiene ningún permiso todavía — no puede proponerse su propia membership (y el guard de auto-elevación de `checkProposal`, línea 162 de `administration.ts`, lo bloquearía explícitamente incluso si lo intentara). La sesión del invitado sólo sirve para el paso de **aceptar** (`accept` exige que el actor sea exactamente el `recipientId`), no para el de **proponer**.

### 3.2 La resolución: `verifyActor` ya es una función inyectada, no un cable fijo a una cookie HTTP

Releyendo `administration-store.ts::administerAuthority` (confirmado en Fase 1): su firma recibe `services: AdministrationServices`, y `AdministrationServices.verifyActor: (proof: string, organizationId: string) => Promise<VerifiedHumanActor | null>` es un valor que **el caller construye**. `administration-route.ts:155` ya lo hace exactamente así para el caso HTTP normal: `verifyActor: async()=>actor` — un closure que ignora el `proof` recibido y devuelve un `VerifiedHumanActor` ya resuelto de antemano (ahí, desde `resolveHumanSession`). **Nada en `administerAuthority` ni en `evaluateAdministration` exige que ese actor haya sido derivado de una cookie real** — sólo exige que tenga la forma correcta (`organizationId`/`principalId`/`sessionId`/`expiresAt`/`source: "backend-session"|"test-fixture"`) y que pase los mismos chequeos de vigencia y de identidad humana verificada que corren igual para cualquier actor (`human()`, `validActor()`).

Esto significa que `finishInvitation` puede invocar `administerAuthority` **directamente** (mismo nivel de llamada interna que ya hace `administration-route.ts`, nunca a través de un endpoint HTTP nuevo) con un `services.verifyActor` que devuelve, según el paso:

- **Al proponer** (`propose_membership`, luego `propose_assignment`): un `VerifiedHumanActor` para `invitation.invited_by_principal_id` (quien invitó), con `source: "backend-session"`, `sessionId` sintético (`crypto.randomUUID()`, generado en el momento, nunca persistido como sesión real), y `expiresAt` unos segundos en el futuro — sólo lo necesario para que pase la validación de vigencia dentro de la única llamada que lo usa.
- **Al aceptar** (`accept` × 2): el mismo patrón, pero para `principalId` = la identidad recién verificada del invitado.

**Por qué esto no es un bypass de autorización, y por qué no hace falta tocar `administration.ts`:**

1. El actor nunca se construye a partir de nada que el cliente controle — ni `proof`, ni ningún campo del request HTTP de redención llega a influir en qué `principalId` se usa como actor. El único input externo en todo el flujo es el resultado del OAuth de GitHub (qué `subject` completó el login) y el `token` de la invitación (ya validado contra `token_hash` antes de llegar a este punto).
2. **Toda la autorización real sigue corriendo, sin excepción, dentro de `evaluateAdministration`, exactamente igual que para cualquier otro llamador**: `requirePermission`, `grantable`, `scopeVerified`, `selfGrant` — todas leen el `state` vigente en el momento de la llamada, no algo cacheado de cuando se creó la invitación. Si entre la creación de la invitación y su redención el invitador perdió `authority.membership.manage` (se lo revocaron, su membership expiró), el primer `propose_membership` falla exactamente como debería — el mecanismo no le da a la invitación ninguna autoridad que el invitador no sostenga *en ese momento*.
3. `human()` sigue exigiendo, para cualquier actor (real o sintético), que el principal exista, esté activo y tenga una identidad externa verificada — no se saltea para este caso.
4. El `sessionId` sintético no habilita nada fuera de esa única llamada: no se persiste en ninguna tabla de sesiones, no es reusable, no queda ningún artefacto que alguien pueda capturar y reusar para otra cosa — vive y muere dentro de la ejecución de `finishInvitation`.

En síntesis: es el mismo patrón que `administration-route.ts` ya usa para desacoplar "quién verificó al actor" de "qué hace `evaluateAdministration` con ese actor" — `finishInvitation` simplemente resuelve el actor de una fuente distinta (una invitación ya autorizada y una identidad recién verificada por OAuth) en vez de una cookie de sesión. No requiere ningún cambio de tipo, de firma ni de lógica en `administration.ts` ni en `administration-store.ts`.

### 3.3 Por qué esto es preferible a la Opción (a) que v0.1 también había dejado planteada

v0.1 §2.3.6 mencionaba, como alternativa a "sesión primero", "relajar `evaluateAdministration` para aceptar una autoridad de sistema acotada a este caso" — y explícitamente la descartaba por tocar el archivo más sensible. La resolución de §3.2 logra el mismo resultado (una autorización de sistema, acotada exactamente a este caso) **sin relajar nada de `evaluateAdministration`** — no se agrega ningún nuevo valor a `source`, no se agrega ningún parámetro nuevo, no se toca ese archivo en absoluto. Lo que v0.1 buscaba como concesión necesaria resulta no serlo: el seam ya existía (`verifyActor` inyectable), sólo no se había identificado como tal hasta leer `administration-route.ts` completo en la Fase 1 de este encargo.

### 3.4 Secuencia completa de `finishInvitation`

1. Consumir la fila de `authority_invitation_flows` (mismo `UPDATE...consumed=1...RETURNING`, patrón idéntico a `finishGenesis`).
2. Cargar la invitación (`authority_organization_invitations`), exigir `status='pending'` y no vencida (`expires_at`) — si no, falla (mismo criterio anti-enumeración que génesis: no se distingue "no existe" de "vencida" de "ya usada" en la respuesta al cliente).
3. Intercambio OAuth + `identify()` (idéntico a génesis).
4. Si `invited_subject` está fijado, verificar coincidencia — `deny` si no.
5. Resolver identidad del invitado en `authority_human_identities` para `(organization_id, subject)`:
   - Si ya existe **y tiene membership activa** en esta organización: no hay nada que hacer — redención idempotente, devolver el resultado ya vigente sin duplicar nada (ver también §5.4 sobre membership no-activa).
   - Si no existe: insertar la fila (mismo `INSERT` que usa el batch de `finishGenesis`, sin crear tenant ni organización — ya existen).
6. **Paso propone+acepta membership:** dos llamadas a `administerAuthority` (no una — cada comando es una emisión separada, ver §3.5): `propose_membership` (actor sintético = invitador, `context.initialIdentity` resuelto con `initialHumanIdentity(db, org, invitedPrincipalId, s)`, que ya sabe leer la fila insertada en el paso 5), seguido de `accept` (actor sintético = invitado).
7. **Paso propone+acepta assignment:** mismo patrón, dos llamadas más, con `role_id`/`role_version`/`scope`/`valid_until` tomados de la invitación.
8. Marcar la invitación `accepted`, `accepted_at`, `accepted_principal_id`.
9. Persistir `result_json` (Diseño P) con el shape de §4.3, incluido `branch: "invited_existing_org"`.

### 3.5 Cuatro emisiones por redención — explícito, no un problema

Cada comando (`propose_membership`, `accept`, `propose_assignment`, `accept`) es una llamada independiente a `administerAuthority`, y cada una avanza `authority_version` en uno — una redención de invitación produce **cuatro** nuevas emisiones encadenadas (`expectedVersion` de cada llamada es el resultado de la anterior). No es una limitación de este diseño: es como el primitivo ya funciona hoy para cualquier flujo de propose+accept, y no hay ningún mecanismo de "comando compuesto" en `administerAuthority` que permita agruparlas en una sola emisión. Se deja explícito para que quien lo implemente no lo trate como una sorpresa ni intente forzar un atajo que no existe en el motor actual.

### 3.6 Resumibilidad ante fallo parcial

Si el paso 6 tiene éxito pero el 7 falla (p. ej. el rol se suspendió entre la creación de la invitación y la redención), el invitado queda con membership activa pero sin el rol pedido. `finishInvitation` debe ser re-entrante: un segundo intento de redención (nuevo `authority_invitation_flows` row sobre la misma invitación `pending` — la invitación en sí sigue viva hasta que se marque `accepted`) tiene que detectar, en el paso 5, que la membership ya existe y saltar directo al paso 7. Esto es el mismo patrón de chequeo-antes-de-crear que ya usa génesis para su propio manejo de carrera (`createOrganizationAndIssue`, rama de `catch`).

---

## 4. Rutas nuevas

| Ruta | Método | Auth | Qué hace |
|---|---|---|---|
| `/v1/authority/tenant/invitations` | `POST` | Sesión + CSRF (mismo patrón que `tenant/organizations`) | `createInvitation` (§2) |
| `/v1/authority/tenant/invitations` | `GET` | Sesión (**no** abierto a cualquier miembro — ver nota abajo) | Lista invitaciones de la organización |
| `/v1/authority/tenant/invitations/:id/revoke` | `POST` | Sesión + CSRF, mismo criterio de autorización que crear | Marca una invitación `pending` como `revoked` — no afecta invitaciones ya aceptadas (eso es `revoke_membership`, ya existe, fuera de alcance igual que v0.1 §4) |
| `/v1/authority/tenant/invitations/:id/redeem` | `GET` (navegable) | El `token` de la invitación es la prueba de posesión — sin sesión | Arranca el flujo OAuth (`beginInvitation`), mismo patrón que la variante navegable de `genesis/login` |
| `/v1/authority/invitations/result` | `GET` | Secreto `browser` (mismo patrón que `genesis/result`) | Poll del resultado (Diseño P), `pollInvitationResult` — mismo contrato de entrega única |
| `/v1/authority/human/callback` | `GET` | (sin cambios de ruta) | Se le agrega el tercer eslabón: `finishHumanLogin` → `finishGenesis` → **`finishInvitation`** |

**Nota sobre `GET /v1/authority/tenant/invitations` — desviación deliberada del criterio de `tenant/organizations`:** `listTenantOrganizations` es de lectura abierta a cualquier miembro (§1.2 de la investigación de Fase 1). Listar invitaciones **no** debería serlo con el mismo criterio: una invitación en curso revela con qué rol y con qué scope se está por incorporar alguien, información que no todo miembro debería poder ver. Se propone gatearlo con el mismo criterio de autorización que crear una invitación (§2.1) — quien puede invitar puede ver las invitaciones pendientes; quien no, no. Es una decisión de diseño de este documento, no heredada de ningún patrón previo — señalada explícitamente para que Jose la confirme o la ajuste.

---

## 5. Casos borde — resueltos explícitamente

### 5.1 Invitación a un `subject` que ya es miembro activo de la organización

Redención idempotente (§3.4 paso 5) — no duplica nada, no falla, devuelve el estado ya vigente. Evita que un doble-click en el link de invitación, o un segundo intento tras cerrar el navegador, produzca un error confuso.

### 5.2 Invitación a un `subject` que ya tiene una organización personal propia (por génesis)

No hay conflicto: `authority_human_identities` no tiene restricción cruzada de organización (confirmado en Fase 1, §2.1 de la investigación) — el mismo GitHub `subject` recibe un `principal_id` nuevo, propio de la organización a la que fue invitado, exactamente igual que si hubiera usado `createOrganizationUnderTenant`. `authority_genesis_registry.subject` (el único anclaje 1:1 real) sólo gatea la creación de una organización **nueva** por génesis — no se toca ni se consulta en este flujo.

### 5.3 El actor que invitó pierde su permiso entre la creación y la redención

Cubierto por diseño — ver §3.2 punto 2: el primer `propose_membership` de la redención falla con `permission_denied`, igual que fallaría hoy cualquier `propose_membership` tardío de ese mismo actor. La invitación queda `pending` (no se marca `accepted`); un master con permiso vigente podría, en una versión futura no cubierta por este documento, "reasignar" la invitación a otro invitador — fuera de alcance acá.

### 5.4 Invitar a alguien cuya membership en esa organización fue previamente `suspended` o `revoked` — hallazgo nuevo de esta versión

No estaba contemplado en v0.1. Al diseñar el paso 5 de §3.4 en detalle, aparece un tercer estado posible además de "no existe" / "ya activo": alguien que fue miembro, se le revocó o suspendió la membership, y ahora se lo re-invita. Reactivar una membership `suspended` ya tiene su propio comando (`resume_membership`) — no es lo que una invitación debería hacer. Reactivar una `revoked` no tiene ningún comando hoy (la revocación es terminal, confirmado en la investigación de Fase 1 §3.5) — permitir que una invitación la "resucite" sería inventar una vía alternativa a `revoke_membership` que nadie pidió.

**Se propone, para esta versión:** si en el paso 5 la identidad existe pero su membership más reciente en esa organización no está `active` (está `suspended` o fue `revoked`), `finishInvitation` falla con un código explícito (p. ej. `membership_conflict`) en vez de intentar resolverlo — un master que quiera reincorporar a alguien así usa el mecanismo que ya existe (`resume_membership` para `suspended`; para `revoked` no hay camino, por diseño, y no corresponde que esta propuesta lo abra). Queda señalado como límite consciente, no como omisión.

---

## 6. Explícitamente fuera de alcance — igual que v0.1, sin cambios

- Cómo se distribuye el link de invitación (email, copiar/pegar, código corto) — producto/UI.
- La decisión de `no_organization` (v0.1 §3.1) — sigue sin resolverse acá; no es parte del gate de invitaciones.
- UI de Conductor para crear/listar/revocar invitaciones.
- Reactivar una membership `suspended`/`revoked` vía invitación (§5.4, nuevo hallazgo — explícitamente no resuelto, no sólo no mencionado).
- Formalización de `delegate`/`scoped_admin` como roles builtin — sigue postergada (Fase 1, resolución §1/§3); este diseño no depende de que se resuelva.

---

## 7. Plan de ataque por fases (para cuando se autorice implementación)

Mismo espíritu que `Propuesta_Arquitectura_Tenant_Soberano_v0_1.md` §4 — cada fase cierra sola.

**Fase A — Schema.** `0018_authority_invitations.sql`: las dos tablas de §1. Inerte hasta que el resto del código las use. Criterio de cierre: migra limpio, sin efecto observable.

**Fase B — `createInvitation` + rutas de creación/listado/revocación.** `invitation-store.ts` (§2), tres rutas de `POST/GET/POST revoke`. Tests: actor con ambos permisos puede crear; actor sin alguno de los dos es rechazado; rol que excede `masterPermissions()` o los permisos del actor es rechazado (mismo criterio que `grantable()`); scope de proyecto sin evidencia es rechazado.

**Fase C — Redención.** `beginInvitation`, `finishInvitation` (§3), tercer eslabón del callback, `pollInvitationResult`. Es la fase más grande y la que amerita más tests: idempotencia (§5.1), invitado con organización propia (§5.2), invitador sin permiso vigente al momento de redimir (§5.3), membership `suspended`/`revoked` preexistente (§5.4), resumibilidad tras fallo parcial (§3.6), y — crítico — un test que confirme que el actor sintético de §3.2 **nunca** puede exceder lo que `evaluateAdministration` ya le permitiría a un actor real con la misma autoridad (es decir: correr el mismo escenario con un actor HTTP real y con el actor sintético de invitaciones, y confirmar que producen exactamente el mismo resultado de autorización).

**Fase D — Batcave.** Espejar las rutas nuevas en `authority-proxy.ts`, mismo patrón que Fase 4 del Tenant Soberano.

---

## 8. Confirmación del gate

Este documento completa la Fase 2 del encargo: propone el diseño de invitaciones sobre la estructura ya validada en Fase 1, confirma la mayor parte de `Propuesta_Diseno_Invitaciones_Organizacion_v0_1.md`, y reemplaza puntualmente su §2.3.6 con una resolución que no requiere tocar `administration.ts`. Queda a la espera de revisión de Jose — en particular del mecanismo de actor sintético (§3) — antes de habilitar implementación.
