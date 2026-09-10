# Encargo de implementación — Génesis de organización: primera emisión canónica

**Fecha:** 2026-09-10
**Destinatario:** cowork de Backend
**Tipo:** encargo de implementación, listo para ejecutar sin ronda de clarificación adicional — grounded en
lectura directa de `backend/src/authority/administration.ts`, `administration-store.ts`,
`administration-route.ts`, `emission-store.ts`, `human-session-store.ts` y las migraciones `0001`, `0006`,
`0004` del repo real.

---

## §0. Por qué este encargo existe — el gap está nombrado en el propio código

`prepareEmission` (`emission-store.ts`) ya tiene una rama explícita para la primerísima emisión de una
organización (`expectedVersion === null`), pero hoy esa rama **sólo acepta evidencia de test-fixture**:

```ts
if (input.expectedVersion === null) {
  if (signer.allowTestFixtures !== true || input.initialFixtureEvidence?.environment !== "test"
    || typeof input.initialFixtureEvidence.reference !== "string" || !input.initialFixtureEvidence.reference.length)
    throw new EmissionStoreError("initial_evidence_required");
}
```

Y el endpoint de administración (`administration-route.ts`) falla cerrado, con un código de error que ya
nombra el problema, apenas no hay una emisión previa:

```ts
const current = await loadCurrentEmission(db, org);
if (!current) return reply({ error: 'authority_admin_onboarding_unavailable' }, 409);
```

No hay ningún camino productivo hoy para que una organización nueva obtenga su primera emisión (v1: un
principal, una membership, un role_assignment `master`). Esto es la respuesta concreta, a nivel de código, a
P1 ("quién verifica el onboarding real de la primera identidad y qué evidencia canónica acepta").

## §1. Lo que este encargo NO resuelve — fuera de alcance, a propósito

- **Quién siembra la fila inicial de `authority_human_identities`** (organization_id + subject de GitHub +
  `principal_id` recién generado, `evidence_kind='canonical'`, `status='active'`, sin `verified_at` todavía)
  para el primer humano de una organización nueva. `finishHumanLogin` (`human-session-store.ts`) **requiere
  que esa fila ya exista** — sólo verifica y completa `verified_at`, nunca la crea. Este encargo **consume**
  esa fila ya sembrada; no resuelve quién la siembra ni con qué proceso (es, en los hechos, la pieza que falta
  del flujo de alta de Sovereign Tenant, todavía sin definir — ver `Nota_Tecnica_Analisis_Fase4_...
  Onboarding_Primer_Principal_v0_2.md` §1.1). Se deja explícitamente pendiente, no se infiere.
- **Creación de la fila en `organizations`** — sigue sin existir ningún `INSERT INTO organizations` en el
  repo (confirmado); es un acto externo, no parte de este encargo.
- Cualquier cambio a `evaluateAdministration` (`administration.ts`) o al motor de propuesta/aceptación — el
  camino de génesis que se describe abajo es deliberadamente un camino aparte, no una rama nueva dentro del
  motor existente. El motor existente está bien diseñado para prevenir auto-elevación entre principals que ya
  existen; génesis es, por definición, el único momento en que no hay ningún principal previo contra el cual
  evaluar ese chequeo, y no debe forzarse a pasar por ahí.
- Relación Tenant↔Organización (§1.1 de la nota citada) — sigue sin decidirse; este encargo opera al nivel
  `organization` tal como existe hoy en el schema.

## §2. Diseño — camino de génesis, separado del motor de administración

### 2.1 Evidencia canónica aceptada (la decisión concreta de P1 que este encargo fija)

Una emisión inicial canónica (no test-fixture) se acepta si y sólo si existe una fila en
`authority_human_identities` para `(organization_id, principal_id)` con `status='active'`,
`verified_at IS NOT NULL` y `evidence_kind='canonical'` — es decir, exactamente lo que `initialHumanIdentity`
ya sabe leer y devolver como `InitialHumanIdentity`. No se exige ninguna evidencia adicional (KYC, facturación,
dominio verificado) en esta ronda — un login de GitHub verificado es, por decisión de este encargo, evidencia
suficiente para fundar una organización como su primer `master`. Si José quiere exigir algo más fuerte, es una
ronda aparte; este encargo no espera esa decisión para poder construirse.

### 2.2 Extensión de `PersistEmissionInput` / `prepareEmission`

Agregar una unión discriminada en lugar del `initialFixtureEvidence` suelto actual:

```ts
export type InitialEmissionEvidence =
  | { kind: "test-fixture"; environment: "test"; reference: string }
  | { kind: "canonical"; identity: InitialHumanIdentity };
```

En `prepareEmission`, cuando `input.expectedVersion === null`:

- Si `initialEmissionEvidence.kind === "test-fixture"`: mismo comportamiento exacto que hoy (gateado por
  `signer.allowTestFixtures === true`), sin cambios de conducta.
- Si `initialEmissionEvidence.kind === "canonical"`:
  - Verificar `identity.organizationId === metadata.organization_id` y `identity.source === "canonical"`.
  - Verificar que `input.state` es **exactamente** el estado de génesis derivado de esa identidad — no un
    estado arbitrario provisto por el caller. Construir `input.state` desde `identity.principal` de forma
    determinista dentro de la función que arma el request (ver §2.3), nunca aceptarlo como parámetro libre
    del lado del route handler.
  - No requiere `signer.allowTestFixtures`.
- Mantener el error `initial_evidence_required` para cualquier combinación que no matchee ninguna de las dos
  ramas — no se relaja el fail-closed existente, sólo se agrega una segunda evidencia válida.

### 2.3 Función de orquestación — `genesisEmission` (nuevo, en `administration-store.ts` o archivo propio `genesis.ts`)

```ts
export async function genesisEmission(
  db: D1Database, organizationId: string, principalId: string,
  services: { now: () => string; signer: EmissionSigner; initialIdentity: (org: string, id: string) => Promise<InitialHumanIdentity | undefined> },
): Promise<AdministrationResult>
```

Pasos:

1. `loadCurrentEmission(db, organizationId)` — si devuelve algo distinto de `null`, rechazar
   (`already_bootstrapped`, 409). Esto es lo que hace que génesis sea de una sola vez, sin carrera con el motor
   normal: una vez que existe la emisión v1, este camino queda permanentemente cerrado para esa organización y
   toda mutación futura pasa por `administerAuthority` como siempre.
2. `services.initialIdentity(organizationId, principalId)` — si devuelve `undefined`, rechazar
   (`identity_not_ready`, 403). Este es el punto exacto donde este encargo depende de la precondición de §1
   (la fila ya sembrada y verificada) sin intentar resolverla.
3. Si `evidence.source !== 'canonical'`, rechazar (`canonical_evidence_required`, 403) — el camino de test
   fixture sigue siendo sólo para tests, nunca alcanzable desde este endpoint de producción.
4. Construir el estado de génesis, determinista, sin aceptar nada del caller más allá de `principalId`:
   - `principals`: `[evidence.principal]` (ya viene con `principal_type:'human'`, `external_identities` de
     GitHub verificado).
   - `memberships`: una única fila `{ membership_id: genUUID(), principal_id, organization_id, status:'active', valid_from: now, valid_until: null, accepted_at: now }`.
   - `role_assignments`: una única fila con el `role_definition` built-in `master` en su versión activa más
     reciente (leer de `role_definitions` global, `organization_id IS NULL`, `key='master'`, mayor `version`),
     scope `{ type:'organization', id: organizationId }`, `valid_from: now`, `valid_until: null`.
   - `role_definitions`: vacío en el estado (los built-in no se duplican por organización, mismo criterio ya
     usado en el resto del sistema).
   - `revocations`: vacío.
5. `prepareEmission(db, { requestId: \`genesis:${organizationId}\`, expectedVersion: null, metadata: {...},
   state, initialEmissionEvidence: { kind:'canonical', identity: evidence } }, services.signer)`.
6. Ejecutar el `statement` preparado en la misma sesión D1 (`first-primary`), igual patrón que
   `administerAuthority` ya usa para su propio commit.

### 2.4 Endpoint

Nueva ruta `POST /v1/authority/genesis` en `administration-route.ts` (o archivo de ruta propio) — **no**
reutilizar `/v1/authority/administration`, que ya falla cerrado a propósito cuando no hay emisión previa. Body:
`{ organizationId: string }`. Requiere sesión humana válida (`resolveHumanSession`, mismo mecanismo que ya usa
`/v1/authority/administration`) — el `principalId` sale de la sesión, nunca del body. Devuelve el mismo shape
que `AdministrationResult` (`authorityVersion`, `stateDigest`, `status:'committed'`) para que el cliente no
necesite un contrato distinto.

## §3. Archivos

| Archivo | Acción |
|---|---|
| `backend/src/authority/emission-store.ts` | Modificado: `InitialEmissionEvidence` como unión discriminada, rama `canonical` en `prepareEmission`. |
| `backend/src/authority/genesis.ts` | Nuevo: `genesisEmission(...)` según §2.3. |
| `backend/src/authority/administration-route.ts` | Modificado: nueva ruta `POST /v1/authority/genesis`. |
| `backend/test/genesis.spec.ts` | Nuevo: identidad no lista → `identity_not_ready`; emisión ya existente → `already_bootstrapped`; evidencia test-fixture rechazada en este camino; happy path produce v1 con exactamente un principal/membership/role_assignment master; segunda llamada tras el bootstrap es rechazada (no genera v2). |

## §4. Validación

```bash
npm run typecheck && npm test
```

`genesis.spec.ts` debe aparecer en la salida — confirmar contra el `include` de `vitest.config.mts` antes de
dar por cerrado, mismo error que ya se cometió una vez con `authority.spec.additions.ts`.

## §5. Regla de continuidad

3 archivos nuevos/modificados + 1 test nuevo. No toca `administration.ts` (el motor de propuesta/aceptación
queda intacto). No resuelve quién siembra `authority_human_identities` para el primer humano de una
organización nueva — eso sigue abierto, nombrado en §1, y es lo único que falta después de este encargo para
que el flujo completo (alta de organización → primer login humano → génesis → operación normal) esté cerrado
de punta a punta.
