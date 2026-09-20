# Fase 0 — Onboarding Server-Side (previo a instalación local)

> **Estado:** Investigación de solo lectura cerrada. Este documento responde al `Encargo_Investigacion_Fase0_Onboarding_ServerSide_Cowork_Linux.md` y complementa (sin modificar) `Synapse_Runner_E2E_Architecture_Dossier.md`.
>
> **Terminología fijada por el encargo:** "onboarding" = registro server-side de una persona/organización. "Bootstrap" queda reservado exclusivamente al arranque del servidor local (Nucleus/Batcave). Este documento respeta esa distinción en todo su texto.
>
> **Precedencia documental aplicada:** ante contradicción, gana el documento más reciente (`Tablero_Seguimiento_Consolidado_v0_2.md`, hasta §Z.24); `AUTHORITY_BOUNDARY.md` tiene precedencia específica en todo lo relativo a credenciales/automatización de proveedores externos.
>
> **Archivos confirmados ausentes del repo (no se buscaron, por instrucción del encargo):** `Cierre_Implementacion_Genesis_Primer_Registro_Organizacion_Personal_v1_0.md`, `Encargo_Genesis_Primer_Registro_Organizacion_Personal_v1_0.md`. El código es la fuente de verdad para esa funcionalidad — ver §1.1.

---

## 1. Fase 0: Arquitectura Real

Fase 0 cubre todo lo que ocurre **antes** de que exista una instalación local de Nucleus: registro de la organización/persona, autorización de identidad (GitHub), descarga del instalador, y el primer punto de sincronización donde una instalación local recién nacida se conecta con lo que el servidor ya registró.

### 1.1 Registro (Génesis / Primer Registro)

**[CONSTRUIDO]** El primer login de un GitHub subject nunca visto crea, atómicamente, una organización personal nueva. No existe un formulario de "crear cuenta" separado del login — el login mismo es el registro.

- `/home/jose/repos/bloom-development-extension/backend/src/authority/genesis-store.ts` — `beginGenesis`/`finishGenesis`. `finishGenesis` (línea ~41 en adelante) busca una identidad existente para el `subject` devuelto por GitHub; si no existe, ejecuta un `db.batch` atómico que inserta en `organizations`, `authority_human_identities`, `authority_genesis_registry` (línea ~81, `INSERT INTO authority_human_identities(...)`) en una sola transacción. Maneja la carrera de dos requests concurrentes para el mismo subject vía catch-and-lookup (confirmado por el test de la letra c, ver abajo).
- `/home/jose/repos/bloom-development-extension/backend/migrations/0013_authority_genesis.sql` — siembra el catálogo builtin `master`/`specialist` en `role_definitions` (organization_id IS NULL) y crea `authority_genesis_registry` (PK en `subject`: garantiza "un GitHub subject = una organización personal, una sola vez") y `authority_genesis_flows`.
- `/home/jose/repos/bloom-development-extension/backend/test/authority-genesis.spec.ts` — leído completo, no ejecutado (instrucción explícita del encargo). Cubre con Miniflare+D1 real: (a) creación de organización+identidad+registro para subject nuevo; (b) mismo subject dos veces nunca crea segunda organización; (c) carrera concurrente para el mismo subject resuelve a un solo ganador; (d) un callback de login normal (no génesis) no toca las tablas de génesis; (e) una organización nacida por génesis, sin instalación registrada, sigue rechazando la emisión inicial con `configuration_unavailable`; más dos tests de punta a punta HTTP (`POST /v1/authority/genesis/login` → `GET /v1/authority/human/callback`).
- Ruta HTTP real: `POST /v1/authority/genesis/login` y `GET /v1/authority/genesis/login` (variante navegable, 302), ambas en `/home/jose/repos/bloom-development-extension/backend/src/authority/administration-route.ts` líneas 57-64 y 82-86; el callback compartido `GET /v1/authority/human/callback` (líneas 28-42) intenta primero `finishHumanLogin` (login normal a una organización existente) y sólo si falla específicamente con `flow_invalid` reintenta como `finishGenesis`.
- Confirmado con evidencia independiente en `/home/jose/repos/bloom-development-extension/docs/ORBITAL/GRAVITY/Tablero_Seguimiento_Consolidado_v0_2.md` (tramo §Z.15-§Z.24).

Los dos documentos de encargo/cierre de esta funcionalidad ("Genesis Primer Registro Organizacion Personal") están confirmados ausentes del repo por instrucción explícita — no se buscaron. El código listado arriba es la fuente de verdad y está completo y coherente por sí solo.

### 1.2 Autorización de identidad — GitHub (login humano al backend)

**[CONSTRUIDO]** El backend tiene su propia GitHub App, con Authorization Code + PKCE y un callback real — distinta de las otras tres fronteras GitHub descriptas en la §3.

- `/home/jose/repos/bloom-development-extension/backend/src/authority/human-identity.ts` — `githubAppProvider()` (línea 14). `authorize()` (línea 25) arma `https://github.com/login/oauth/authorize` con `client_id`, `redirect_uri`, `state`, `code_challenge`, `code_challenge_method=S256` — sin parámetro `scope`. `exchange()` (línea 28) hace `POST https://github.com/login/oauth/access_token` con `client_id`+`client_secret`+`code`+`code_verifier`; valida que el token empiece con `ghu_` y que `token_type==='bearer'`. `identify()` (línea 34) llama `GET https://api.github.com/user`.
- El callback exacto es `{AUTHORITY_HUMAN_ORIGIN}/v1/authority/human/callback`, construido en `configuredAuthorityHumanResponse` en `/home/jose/repos/bloom-development-extension/backend/src/authority/administration-route.ts` línea 161.
- Credenciales vía variables de entorno `AUTHORITY_GITHUB_APP_CLIENT_ID` / `AUTHORITY_GITHUB_APP_CLIENT_SECRET` (mismo archivo, líneas 12-13, 161) — **no se transcribió ningún valor**, sólo se citan los nombres de las variables tal como aparecen en `HumanRouteEnv`.
- El flujo PKCE completo (state/verifier/challenge, cookie `__Host-authority-flow`) vive en `/home/jose/repos/bloom-development-extension/backend/src/authority/human-session-store.ts`, `beginHumanLogin`/`finishHumanLogin` (líneas 19-42).

### 1.3 Descarga del instalador

**[CONSTRUIDO, con alcance limitado]** Existe una sola ruta pública, sin autenticación, para descargar un release por id:

- `/home/jose/repos/bloom-development-extension/backend/src/index.ts` líneas 69-79: `GET /v1/releases/:releaseId/download`. Busca `r2_key` en la tabla D1 `releases` por `id`, y sirve el objeto directamente desde el bucket R2 `RELEASES` (binding `bloom-releases`, confirmado en `/home/jose/repos/bloom-development-extension/backend/wrangler.jsonc` líneas 33-34). No exige `X-Bloom-*`, no exige sesión, no exige organización.
- **[NO ENCONTRADO]** No existe ninguna ruta que permita a un humano anónimo *descubrir* qué `releaseId` corresponde al instalador que debería descargar (no hay `GET /v1/releases` ni listado público). La única ruta de manifiesto real, `GET /v1/manifest?org=&channel=` (`/home/jose/repos/bloom-development-extension/backend/src/index.ts` líneas 47-67, lógica en `/home/jose/repos/bloom-development-extension/backend/src/manifest.ts`, `resolveIonManifest`), **requiere una `organizationId` ya existente** — es decir, presupone que Fase 0 (registro) ya ocurrió. No hay, en este repo, un mecanismo confirmado de "landing page pública → botón descargar instalador" para alguien que todavía no tiene organización. Ver §6.
- `/home/jose/repos/bloom-development-extension/backend/wrangler.jsonc` no declara `routes` ni dominio custom ni configuración de Pages — no hay evidencia en el repo de qué dominio sirve una eventual landing pública.
- Medición estructural (no de tamaño exacto) de `~/.local/share/BloomNucleus/bin` confirmada por listado de directorio (presencia de `chrome-linux` y binarios grandes); el tamaño exacto de 2.2GB citado en `Backend_Cloudflare_Arquitectura_v0_1.md` no pudo re-verificarse en bytes en esta sesión (sin acceso a shell local, ver §5/§6).

### 1.4 Punto de sincronización (bisagra Fase 0 → instalación local)

**[CONSTRUIDO]** La bisagra completa está trazada de punta a punta en código real, tanto del lado backend como del lado Nucleus (Go).

Secuencia real ejecutada por `nucleus authority sync` (caso `"sync"`, `/home/jose/repos/bloom-development-extension/installer/nucleus/internal/governance/authority_command.go`, switch en línea 115):

1. **Registro de instalación** — línea 130: `authority.RegisterInstallation(...)`. Genera/carga un par de claves Ed25519 + UUID local (`/home/jose/repos/bloom-development-extension/installer/nucleus/internal/authority/identity.go`, `LoadOrCreateLocalIdentity`) y lo registra contra `POST /v1/authority/installations/register` (`/home/jose/repos/bloom-development-extension/backend/src/index.ts` línea 155).
2. **Trust manifest** — línea 137: `authority.FetchAndVerifyTrustManifest(...)` contra `GET /v1/authority/trust-manifest` (índice línea 192), protegido por `verifyInstallationAuth` (firma S2S Ed25519, headers `X-Bloom-Installation-Id`/`X-Bloom-Timestamp`/`X-Bloom-Signature`, canonicalización JCS-RFC8785).
3. **Resolución del tenant** — línea 189: `authority.FetchOrganizationTenantID(...)` (`/home/jose/repos/bloom-development-extension/installer/nucleus/internal/authority/tenant_fetch.go`) contra `GET /v1/authority/tenant/self?org=` (índice línea 206, lógica en `/home/jose/repos/bloom-development-extension/backend/src/authority/tenant-self-route.ts`). Usa la misma firma Ed25519 que el trust-manifest/sync — **no** el token de servicio estático.
4. **Inyección en `nucleus.json`** — líneas 203-214: si `tenantID` viene no-nulo, se anota en `config/nucleus.json` de la instalación local; un fallo al escribir sólo genera un warning (`governanceLogger.Warning`), no aborta el flujo.
5. **Reconciliación de `.ownership.json`** — línea 221: `ReconcileCanonicalOrganization(...)` (`/home/jose/repos/bloom-development-extension/installer/nucleus/internal/governance/ownership_reconciliation.go`). Es idempotente y protege el estado `DIVERGENT` (no lo pisa). Requiere que `.ownership.json` **ya exista** en disco — si no existe, la reconciliación falla de forma **no fatal** (no bloquea el resto del `sync`), consistente con que `.ownership.json` sólo se crea manualmente (ver §1.5).
6. **Cutover opcional a `remote_enforced`** — línea 335: `CutoverRemoteEnforced(...)`, gateado por precondiciones estrictas (tenantID no nulo, high-water-mark verificado anti-downgrade, bindings de proyecto requeridos presentes).
7. Entrega de mandate / auto-encadenamiento de instalación, según el resto del archivo (no detallado aquí por no ser parte del límite Fase 0 → local, que termina en el paso 6).

### 1.5 `.ownership.json` — creación y validación

**[CONSTRUIDO]** `.ownership.json` **no se crea nunca automáticamente**. Sólo existen dos caminos de creación en todo el repo, ambos manuales:

- `/home/jose/repos/bloom-development-extension/installer/nucleus/internal/governance/ownership.go` — `SaveOwnership`/`CreateInitialOwnership`, invocados exclusivamente desde el comando CLI manual `nucleus init --github-id X [--master]`.
- `/home/jose/repos/bloom-development-extension/installer/nucleus/internal/governance/ownership_migration.go` — `LoadCanonicalOwnership`/`migrateOwnershipLocked` (líneas 41-127): `os.ReadFile(path)` en la línea 42 falla con error si el archivo no existe; no hay fallback de creación. La migración sólo actualiza el *formato* de un `.ownership.json` legado ya existente a la forma canónica, nunca lo origina desde cero.
- `/home/jose/repos/bloom-development-extension/installer/nucleus/internal/governance/ownershipcontract/schema.go`, `Validate()` (línea 165): desde la decisión de José del 2026-09-16 (`Propuesta_Secuenciacion_Endurecimiento_Validacion_TenantID_v0_1.md`, citada en el propio comentario del código, línea 60-61), exige `TenantID` no vacío para los estados `BOUND`/`REMOTE_LOCKED` (línea 198). Esto es un endurecimiento posterior a `GOVERNANCE_OWNERSHIP_SPEC_v1_0.md` (fechado 2026-08-07) — ver §7.

---

## 2. Tabla Final de Componentes

| Componente | Estado | Ruta absoluta / documento | ¿Bloqueante para automatizar? |
|---|---|---|---|
| Génesis / primer registro (login nuevo → org nueva) | **CONSTRUIDO** | `backend/src/authority/genesis-store.ts` | Sí — cruza frontera GitHub #3 |
| Login GitHub del backend (Auth Code+PKCE) | **CONSTRUIDO** | `backend/src/authority/human-identity.ts` | Sí — credencial de terceros |
| `POST/GET /v1/authority/genesis/login`, `GET /v1/authority/human/callback` | **CONSTRUIDO** | `backend/src/authority/administration-route.ts:28-64,82-86` | Sí |
| `POST /v1/authority/initial-emission` (emite `master`, requiere instalación ya registrada) | **CONSTRUIDO** | `backend/src/authority/initial-emission.ts`; ruta en `administration-route.ts:103-110` | Sí (requiere identidad ya autenticada) |
| Descarga pública de release por id | **CONSTRUIDO** (alcance limitado, sin descubrimiento) | `backend/src/index.ts:69-79` | No (no requiere login) |
| Manifiesto ion-recipe (`GET /v1/manifest`) | **CONSTRUIDO** — requiere `organizationId` ya existente | `backend/src/index.ts:47-67`, `backend/src/manifest.ts` | Sí — presupone Fase 0 ya cerrada |
| Landing pública / dominio de descarga sin cuenta | **NO ENCONTRADO** | — (no hay `routes` en `wrangler.jsonc`; Vercel no confirmado) | Pendiente de José |
| `nucleus authority sync` (registro instalación → trust manifest → tenant → reconciliación → cutover) | **CONSTRUIDO** | `installer/nucleus/internal/governance/authority_command.go:115-390` | Sí — mecanismo S2S firmado, no login humano |
| `.ownership.json` (creación) | **CONSTRUIDO** — sólo manual, sin hook automático | `installer/nucleus/internal/governance/ownership.go` | No en sí mismo — pero es prerequisito de reconciliación |
| `.ownership.json` `Validate()` — exige `TenantID` en BOUND/REMOTE_LOCKED | **CONSTRUIDO** | `installer/nucleus/internal/governance/ownershipcontract/schema.go:165-198` | No |
| Rol builtin `operator` | **CONSTRUIDO** (contradice evidencia #11 del encargo — ver §7) | `backend/migrations/0011_authority_role_catalog_operator.sql`; `installer/nucleus/internal/authority/roles.go:11,45,57` | No |
| Invitar miembro no-fundador a organización existente | **DISEÑADO (parcial) / NO ALCANZABLE EN LA PRÁCTICA** | `backend/src/authority/administration.ts` (política), `administration-store.ts:72-73` (wiring), `human-session-store.ts:79-84` (`initialHumanIdentity`) | Sí, si se llegara a habilitar — ver §5/§8 |
| Frontend `backend/web/` (mock de auth/usuarios) | **DISEÑADO** — explícitamente mockeado, desconectado del backend real | `backend/web/README.md`, `backend/web/src/api/mock.ts` | No — no es funcional |
| Batcave (control plane de Codespaces) | **DISEÑADO** — código no vive en este repo (`npx degit`) | `docs/BATCAVE/BATCAVE_ARCHITECTURE.md` | Depende del repo externo |
| Repo Ops (GitHub App + Device Flow, Cortex/Discovery) | **CONSTRUIDO** | `docs/CORTEX/HANDOFF-github-app-batcave-synapse.md`; extensión Cortex (fuera del alcance de código Fase 0) | Sí — frontera GitHub #1 |
| `ACCOUNT_REGISTERED` (Discovery → Nucleus) | **CONSTRUIDO**, pero es Google, no GitHub ni servidor | `docs/CORTEX/AUTHORITY_BOUNDARY.md` §2 | Sí — pero es una superficie distinta de Fase 0 server-side |

---

## 3. Fronteras Externas de GitHub (una por cada flujo confirmado)

El repo contiene **cuatro** fronteras GitHub distintas y no intercambiables — el encargo nombraba tres; la investigación encontró una cuarta.

1. **Repo Ops (Cortex/Discovery, GitHub App + Device Flow).** Vive en la extensión Chrome (Discovery), scopes de Contents/Administration/Members sobre repositorios. Documentada en `/home/jose/repos/bloom-development-extension/docs/CORTEX/HANDOFF-github-app-batcave-synapse.md` (evento Synapse `GITHUB_APP_AUTHORIZED`). **[CONSTRUIDO]** (el propio dossier destino, fila "03. OAuth GitHub", la marca ✅ confirmada como "frontera externa #1").

2. **Batcave Auth (control plane de Codespaces).** OAuth App **clásica** (no GitHub App), con callback propio. Documentada en `/home/jose/repos/bloom-development-extension/docs/BATCAVE/BATCAVE_ARCHITECTURE.md` §4.3. **[DISEÑADO]** para este repo — el código fuente de Batcave no está en `bloom-development-extension` (se genera vía `npx degit your-org/batcave-template`, §10 del mismo documento); los fragmentos TypeScript en ese documento son ilustrativos, no código auditable en este repo.

3. **Login humano del backend (`human-identity.ts`).** GitHub App propia, Authorization Code + PKCE, callback real `{origin}/v1/authority/human/callback`. Client id/secret propios, distintos de (1) y (2). **[CONSTRUIDO]** — ver §1.2. Esta es la frontera que efectivamente resuelve Fase 0 (registro/login server-side).

4. **GitHub App instalada por organización (acceso a repos).** Referenciada como invariante en la documentación de arquitectura (`INVARIANT-ORG-008`, citado en el Tablero); separada de (1)-(3) porque su alcance es "qué repos puede ver el sistema", no "quién es la persona". No se auditó código específico de instalación de esta App en el árbol de `backend/src/authority/` — su evidencia es documental. **[DISEÑADO]** en el alcance de esta investigación (no se encontró una ruta HTTP dedicada a instalar/desinstalar esta App dentro de `backend/src/`).

Ninguna de las cuatro comparte client id, client secret, ni mecanismo de callback con otra. Tratarlas como una sola "integración GitHub" sería un error de diseño para cualquier arnés de automatización.

---

## 4. Quinta Superficie de Automatización — Fase 0 Browser-Based Registration

El encargo pide documentar esta superficie como una quinta superficie de automatización, distinta de las cuatro ya conocidas por el dossier destino (Electron/Conductor, Discovery/Chromium, Companion, Synapse Intent/CLI). Se describe aquí su ciclo de vida por plataforma.

### Linux — **verificado contra filesystem/código real**

1. El usuario visita, en un navegador de escritorio normal, la URL que dispara `POST /v1/authority/genesis/login` (o su variante `GET`, redirect 302 directo a GitHub) — **[CONSTRUIDO]**, `administration-route.ts:57-64,82-86`.
2. GitHub muestra su propia pantalla de autorización (frontera #3, fuera del control de Bloom).
3. El callback `GET /v1/authority/human/callback` cae en el backend, crea la organización (génesis) y setea la cookie de sesión `__Host-authority-session` — **[CONSTRUIDO]**.
4. En algún punto posterior (fuera de este flujo de login) el usuario descarga el instalador Nucleus para Linux y lo ejecuta. La instalación local corre `nucleus init` (crea `.ownership.json` manualmente) y luego `nucleus authority sync`, que cierra la bisagra descripta en §1.4. **[CONSTRUIDO]**, verificado en `installer/nucleus/internal/governance/authority_command.go` y `ownership.go`.
5. No existe, en este repo, evidencia de que el paso 1 y el paso 4 estén conectados por una única sesión de navegador continua — son dos actos independientes del usuario (login web, luego ejecución de un binario local). **[NO ENCONTRADO]** cualquier automatización de "un solo flujo" que cruce ambos.

### Windows / macOS — **[NO VERIFICADO EN EJECUCIÓN]**

El código de `human-identity.ts`, `administration-route.ts` y las rutas HTTP del backend son agnósticas de sistema operativo (Cloudflare Workers, HTTP puro) — no hay razón de código para que el flujo de login/génesis difiera por plataforma, y por lo tanto se infiere que el comportamiento del lado servidor (pasos 1-3 arriba) es idéntico. Sin embargo:

- No se pudo verificar en esta sesión ninguna ejecución real del instalador Nucleus en Windows o macOS (no hay acceso a esos sistemas de archivos ni binarios desde este entorno).
- El propio dossier destino y `BATCAVE_ARCHITECTURE.md` no documentan diferencias de instalador por plataforma más allá de menciones genéricas.
- Toda afirmación sobre Windows/macOS en este documento debe leerse como **inferencia de código, no verificación de ejecución**.

### La pregunta de automatización — no decidida aquí

`/home/jose/repos/bloom-development-extension/docs/CORTEX/AUTHORITY_BOUNDARY.md` §1 establece, textualmente: *"Este principio es independiente de qué componente ejecuta la automatización o dónde corre — aplica igual si el ejecutor es la extensión de Chrome, el backend, o el Cognituum Runner local"* — es decir, el principio está explícitamente redactado para ser **agnóstico de componente**. No usa el término "test harness" ni excluye Playwright por nombre. Ver §8 para las opciones que esto abre, presentadas sin decisión tomada.

---

## 5. Archivos No Encontrados

| Archivo esperado | Ruta esperada | Preguntas que quedan sin responder por su ausencia |
|---|---|---|
| `Cierre_Implementacion_Genesis_Primer_Registro_Organizacion_Personal_v1_0.md` | `docs/SYNAPSE/SYNAPSE-RUNNER/` o `ANALYSIS/BACKEND/ROLES/` | Ninguna — el código (`genesis-store.ts` + `authority-genesis.spec.ts` + migración 0013) es completo y autosuficiente; se cita como ausente por instrucción del encargo, no por bloquear ninguna respuesta. |
| `Encargo_Genesis_Primer_Registro_Organizacion_Personal_v1_0.md` | ídem | ídem |
| Documento/ruta que confirme el dominio de la landing pública o el proyecto Vercel | `docs/BACKEND/` (sólo hay una nota "pendiente de José" en `Backend_Cloudflare_Arquitectura_v0_1.md`) | Pregunta 1 del encargo (¿dónde empieza el humano sin cuenta?) queda parcialmente sin responder — ver §6. |
| Ruta HTTP de listado/descubrimiento público de releases | Se esperaría en `backend/src/index.ts` junto a `/v1/releases/:releaseId/download` | Cómo un humano anónimo llega al `releaseId` correcto sin ya tener `organizationId`. |
| Caller HTTP real que provea `initialIdentity` para un principal genuinamente nuevo en `propose_membership` | Se esperaría en `administration-route.ts` o un archivo de "invitaciones" dedicado | Pregunta 3 del encargo — ver conclusión en §1 tabla y detalle abajo. |

---

## 6. Datos que Sólo José Puede Aportar

- **URL/dominio de la landing pública** desde la cual un humano sin cuenta empezaría Fase 0 (no hay `routes` en `wrangler.jsonc`; `Backend_Cloudflare_Arquitectura_v0_1.md` deja esto explícitamente pendiente).
- **Proyecto(s) Vercel**, si existen, que sirvan esa landing — no hay referencia verificable en el repo.
- **Confirmación en bytes** del tamaño de `~/.local/share/BloomNucleus/bin` (esta sesión sólo pudo confirmar estructura del directorio, no medir tamaño exacto sin acceso a shell local).
- **Cadencia/intervalo de polling** de `nucleus authority sync` en producción — mencionada como pendiente en `Backend_Cloudflare_Arquitectura_v0_1.md` §6, no fijada en código como constante consultable sin más contexto de despliegue.
- **Roles-schema pendiente** (§0/§4 del mismo documento) — ese documento marca explícitamente ítems como pendientes de decisión de José, no resueltos por este código.
- **Decisión sobre la Pregunta 3** (invitar miembro no-fundador): el código de política (`administration.ts`) y de store (`administration-store.ts`) **soportan la forma** de una propuesta de membresía con `initialIdentity` para un principal nuevo (línea 72-73 de `administration-store.ts`: sólo se busca `initialIdentity` cuando `command.principalId` **no** está ya en `current.state.principals`). Pero el único adaptador real de `initialIdentity` conectado (`initialHumanIdentity`, `human-session-store.ts:79-84`) exige que ya exista una fila `authority_human_identities` **activa y verificada** para ese `organization_id`+`principal_id`. Rastreando todos los `INSERT INTO authority_human_identities` del repo, sólo hay dos: `genesis-store.ts` (fundador de una organización nueva) y `tenant-store.ts:90-100` (clona la identidad del **mismo** fundador hacia una organización hermana del mismo tenant). **No existe en el repo ningún código que inserte una fila de identidad para una segunda persona distinta dentro de una organización existente.** Conclusión: la capacidad de "invitar a alguien que no es el fundador" está diseñada a nivel de política pura, tiene un wiring parcial hacia la ruta HTTP real (`POST /v1/authority/administration`, `administration-route.ts:125-150`), pero **no es alcanzable en la práctica** porque no hay forma de que esa segunda persona llegue a tener una fila de identidad verificada en esa organización antes de la propuesta. El gap que `Tablero_Seguimiento_Consolidado_v0_2.md` §Z.16 marcaba como abierto **sigue abierto**, con esta causa raíz específica ahora identificada.

---

## 7. Correcciones al Dossier Existente

*(Listadas aquí, no aplicadas — `Synapse_Runner_E2E_Architecture_Dossier.md` no fue modificado, por instrucción del encargo.)*

1. El dossier no menciona la cuarta frontera GitHub (login humano del backend, `human-identity.ts`) — sólo documenta las fronteras relevantes a su propio alcance (Cortex/Discovery/Companion). No es un error del dossier, es simplemente un alcance distinto; se señala para que la nueva sesión de Playwright sepa que existe una cuarta frontera fuera de su radar original.
2. La evidencia #11 citada en el encargo de esta investigación ("sólo existen `master`/`specialist`, no `operator`") es **incorrecta/desactualizada** frente al código actual: `operator` está completamente sembrado (`0011_authority_role_catalog_operator.sql`) e implementado (`roles.go:11,45,57` — `RoleOperator` está en `BuiltinRoles`).
3. Un comentario en `/home/jose/repos/bloom-development-extension/backend/src/authority/tenant-self-route.ts` (líneas 7-10) describe el endurecimiento de `Validate()` para exigir `TenantID` en `BOUND`/`REMOTE_LOCKED` como "todavía no ejecutado" — esto está **desactualizado**: `ownershipcontract/schema.go` línea 165-198 ya lo exige, con fecha de decisión 2026-09-16 citada en su propio comentario. El comentario de `tenant-self-route.ts` debería actualizarse en un futuro encargo (no en este, por la restricción de solo-lectura).
4. `GOVERNANCE_OWNERSHIP_SPEC_v1_0.md` (2026-08-07) §2/§6 describe a `ownership.go` escribiendo en una ruta legada no-canónica; el código actual resuelve rutas específicas por organización vía `core.ResolveNucleusRoot`, lo que sugiere que este punto ya fue corregido después de la fecha de ese documento — candidato a actualización documental futura.

---

## 8. Decisiones para José

1. **¿Aplica la restricción de `AUTHORITY_BOUNDARY.md` §1 a un arnés de pruebas Playwright que automatiza el login/registro de Fase 0?**

   El texto del documento (§1, citado textualmente en §4 de este documento) es explícitamente agnóstico de componente ("aplica igual si el ejecutor es la extensión de Chrome, el backend, o el Cognituum Runner local"). No decide esta pregunta por sí mismo porque nunca menciona un "arnés de pruebas" como categoría. Se presentan las opciones, sin inclinar la balanza:

   - **Opción A — Tratar Playwright como sujeto a la restricción.** Un test E2E que automatiza clics en la pantalla de autorización de GitHub sería, en la letra del documento, indistinguible de "el sistema automatiza un login... en la superficie de un proveedor externo". Consecuencia: cualquier suite Playwright para Fase 0 tendría que detenerse en la puerta de GitHub (igual que el resto del sistema) y requerir una sesión ya autenticada inyectada por fixture/mock, nunca un login real automatizado contra `github.com`.
   - **Opción B — Tratar Playwright como fuera de alcance por ser herramienta de desarrollo/QA, no un componente de producción.** El documento habla de "el sistema" (lo que el producto hace en manos de un usuario real); un test harness que sólo corre en CI/desarrollo, nunca en producción, y nunca actúa en nombre de un usuario real, podría argumentarse que no es "el sistema" en el sentido que el documento protege. Consecuencia: se podría automatizar un login de prueba contra una cuenta de test dedicada, con las debidas precauciones de secreto (nunca credenciales reales de producción).
   - **Riesgo de la Opción B:** si mañana ese mismo arnés se reutiliza (aunque sea parcialmente) como base de un flujo de producto real, la línea entre "sólo QA" y "el sistema" se vuelve difícil de sostener retroactivamente — el propio §1 fue escrito, según su changelog, para prevenir justamente ese tipo de erosión gradual.

   Esta decisión queda explícitamente para José; este documento no la toma.

2. **Landing pública / punto de entrada sin cuenta:** confirmar si existe (Vercel u otro) fuera de este repo, o si Fase 0 hoy empieza siempre desde una superficie ya autenticada de otro componente (Discovery/Cortex) y nunca desde una landing anónima.

3. **Descubrimiento de releases:** decidir si se necesita una ruta pública de listado/discovery antes de que un humano anónimo pueda descargar el instalador, dado que hoy sólo existe descarga por id ya conocido.

4. **Habilitar "invitar miembro no-fundador":** decidir si se prioriza cerrar el gap identificado en §6 (falta de un mecanismo que cree una fila de identidad verificada para una segunda persona en una organización existente) antes de construir cualquier automatización de Fase 0 que dependa de multi-usuario.

5. **Actualizaciones documentales menores** listadas en §7 (comentario desactualizado en `tenant-self-route.ts`, nota de ruta legada en `GOVERNANCE_OWNERSHIP_SPEC_v1_0.md`) — quedan para un encargo de documentación futuro, no se tocan aquí.

---

## Nota de cumplimiento de restricciones

Esta investigación fue de solo lectura: no se modificó ningún archivo existente del repo, no se ejecutaron tests ni servidores, no se accedió a red ni se inició sesión con ningún proveedor. No se transcribió ningún valor de secreto — donde el código referencia `client_secret`/tokens (`AUTHORITY_GITHUB_APP_CLIENT_SECRET`, `AUTHORITY_SIGNING_KEY_PKCS8_B64`, cookies de sesión), se citó únicamente el nombre de la variable/archivo, nunca un valor. El único archivo creado por esta investigación es este mismo documento.
