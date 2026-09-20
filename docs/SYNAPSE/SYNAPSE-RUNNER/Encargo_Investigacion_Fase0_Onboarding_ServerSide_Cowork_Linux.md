# Encargo — Investigación de la Fase 0 del Onboarding (Server-Side, Pre-Electron)

**Tipo:** Investigación pura, solo lectura. Para ejecutar en un cowork sobre Linux, con acceso directo al repo.
**Autoridad:** José Vigil
**Destino del resultado:** una sección nueva ("Fase 0 — Server-Side Onboarding") para anexar al dossier de synapse-runner.

---

## 0. Entorno y reglas de ejecución

**Raíz del repo (Linux):** `/home/jose/repos/bloom-development-extension`

Todas las rutas de este documento son absolutas y de Linux. El cowork lee los archivos directamente desde disco. No hace falta que nadie adjunte nada.

**Dossier destino (leerlo completo antes de escribir nada):**
`/home/jose/repos/bloom-development-extension/docs/SYNAPSE/SYNAPSE-RUNNER/Synapse_Runner_E2E_Architecture_Dossier.md`

**Único archivo que el cowork puede crear (el entregable):**
`/home/jose/repos/bloom-development-extension/docs/SYNAPSE/SYNAPSE-RUNNER/Fase0_Server_Side_Onboarding_Seccion.md`

### Permitido
- Leer archivos y listar directorios: `cat`, `sed -n`, `grep`, `find`, `ls`, `head`, `wc`.
- Comandos de solo lectura de git: `git log`, `git status`, `git remote -v`, `git blame`.
- Crear el único archivo entregable indicado arriba.

### Prohibido
- Modificar, mover o borrar cualquier archivo existente, incluido el dossier.
- Crear o editar código, schemas o migraciones.
- Ejecutar tests (`npm test`, `go test`), levantar servidores, correr Playwright o ejecutar el instalador.
- Cambiar la rama o el estado de git.
- Acceder a la red o hacer login en GitHub, Cloudflare o cualquier proveedor.

### Si algo falta
Si un archivo no existe en la ruta indicada, no suponer su contenido. Buscarlo con `find` por nombre. Si no aparece, registrarlo en la sección "Archivos no encontrados" del entregable y clasificar lo que dependa de él como `[NO ENCONTRADO]`.

---

## 1. Objetivo

Documentar la etapa server-side del onboarding, que ocurre **antes** de que exista cualquier instalación local. El dossier existente asume, incorrectamente, que el onboarding empieza cuando Conductor/Electron arranca en la máquina del usuario. Falta la fase anterior.

Hipótesis de flujo a verificar (no asumir):

1. El ingeniero llega a una página web server-side de registro.
2. Se registra.
3. Autoriza GitHub.
4. Descarga el instalador (Conductor/Electron + extensión Cortex).
5. Instala.
6. Corre el onboarding local ya documentado, que sincroniza contra la cuenta y el rol creados en el servidor.

**Clasificación obligatoria de cada afirmación:**

- `[CONSTRUIDO]`: existe en código, con ruta absoluta y línea o función.
- `[DISEÑADO]`: hay un documento que lo define, pero no hay código.
- `[NO ENCONTRADO]`: no hay evidencia en el repo ni en los documentos.

Prohibido presentar un diseño como si fuera implementación. Lo que abajo aparece como "evidencia de documentos" viene de documentos de terceros: **hay que verificarlo contra el código real, no repetirlo**. Si el código contradice al documento, prevalece el código y se registra la discrepancia.

**Terminología:** "onboarding" es el alta de persona o empresa en el servidor. "Bootstrap" queda reservado al arranque de un servidor local (Nucleus o Batcave). Ante contradicción entre documentos prevalece el más reciente (Tablero v0.48, hasta §Z.24). `AUTHORITY_BOUNDARY.md` tiene precedencia en credenciales y automatización de proveedores externos.

---

## 2. Paso previo: resolver rutas

Ejecutar esto primero y anotar el resultado en el entregable.

```bash
ROOT=/home/jose/repos/bloom-development-extension
ls "$ROOT"
git -C "$ROOT" remote -v
find "$ROOT" -type d -name ANALYSIS -not -path '*/node_modules/*'
find "$ROOT" -name 'authority_command.go' -not -path '*/node_modules/*'
for n in Tablero_Seguimiento_Consolidado_v0_2.md AUTHORITY_BOUNDARY.md BATCAVE_ARCHITECTURE.md \
         Backend_Cloudflare_Arquitectura_v0_1.md GOVERNANCE_OWNERSHIP_SPEC_v1_0.md \
         GOVERNANCE_OWNERSHIP_SPEC.md HANDOFF-github-app-batcave-synapse.md \
         Investigacion_Installer_Metamorph_Autoupdate_v0_1.md \
         Backend_Batcave_Nucleus_Identidad_y_Comunicacion_v0_1.md \
         Nota_Tecnica_Analisis_Fase4_Escrituras_y_Onboarding_Primer_Principal_v0_2.md; do
  echo "== $n"; find "$ROOT" -name "$n" -not -path '*/node_modules/*'
done
```

Notas:
- Los documentos de Backend llaman al repo `bloom-nucleus-installer`. Tratarlo como nombre anterior o equivalente. `git remote -v` lo aclara. No reabrir la cuestión salvo que el código muestre lo contrario.
- Los documentos de análisis (Tablero, `AUTHORITY_BOUNDARY.md`, etc.) pueden estar bajo una carpeta `ANALYSIS` o `docs`. Usar el resultado de `find` de arriba para obtener su ruta absoluta y usar esa en las citas.
- Dos documentos **no existen en el repo** y no hay que buscarlos: `Cierre_Implementacion_Genesis_Primer_Registro_Organizacion_Personal_v1_0.md` y `Encargo_Genesis_Primer_Registro_Organizacion_Personal_v1_0.md`. La fuente de verdad de esa funcionalidad es el código.

---

## 3. Archivos a leer

### 3.1 Dossier destino
- `/home/jose/repos/bloom-development-extension/docs/SYNAPSE/SYNAPSE-RUNNER/Synapse_Runner_E2E_Architecture_Dossier.md`

### 3.2 Backend: alta humana y génesis (leer primero, es el núcleo)
- `/home/jose/repos/bloom-development-extension/backend/src/authority/human-session-store.ts`
- `/home/jose/repos/bloom-development-extension/backend/src/authority/genesis-store.ts`
- `/home/jose/repos/bloom-development-extension/backend/src/authority/administration-route.ts`
- `/home/jose/repos/bloom-development-extension/backend/src/authority/initial-emission.ts`
- `/home/jose/repos/bloom-development-extension/backend/src/index.ts`
- `/home/jose/repos/bloom-development-extension/backend/migrations/0013_authority_genesis.sql`
- `/home/jose/repos/bloom-development-extension/backend/migrations/` (listar todo; leer `0006_*`, que define `authority_human_identities`, y toda migración que toque `tenants`)
- `/home/jose/repos/bloom-development-extension/backend/wrangler.jsonc`
- `/home/jose/repos/bloom-development-extension/backend/test/authority-genesis.spec.ts` (solo leerlo; no ejecutarlo)

### 3.3 Backend: landing y distribución
- `/home/jose/repos/bloom-development-extension/backend/web/` (todo el árbol, sin `node_modules`)
- `/home/jose/repos/bloom-development-extension/backend/src/manifest.ts`
- Buscar en `/home/jose/repos/bloom-development-extension/backend/src/` cualquier ruta o módulo relacionado con descarga, `releases`, `downloadRules`, R2 o URLs firmadas.

### 3.4 Nucleus (Go): punto de sincronización
- `authority_command.go` (ruta obtenida en el paso previo)
- `/home/jose/repos/bloom-development-extension/installer/nucleus/internal/authority/sync.go`
- `/home/jose/repos/bloom-development-extension/installer/nucleus/internal/authority/tenant_fetch.go`
- `/home/jose/repos/bloom-development-extension/installer/nucleus/internal/authority/identity.go`
- `/home/jose/repos/bloom-development-extension/installer/nucleus/internal/authority/roles.go`
- `/home/jose/repos/bloom-development-extension/installer/nucleus/internal/governance/ownership_reconciliation.go`
- `ownershipcontract/schema.go` (ubicar con `find`)
- `/home/jose/repos/bloom-development-extension/installer/nucleus/internal/governance/ownership.go`

### 3.5 Documentos (rutas resueltas en el paso previo)
- `Tablero_Seguimiento_Consolidado_v0_2.md`: leer §Z.15 a §Z.24.
- `AUTHORITY_BOUNDARY.md`: §1, §2.2 y §4.
- `BATCAVE_ARCHITECTURE.md`: §4.3 y §12.
- `Backend_Cloudflare_Arquitectura_v0_1.md`: §3, §4, §7 y §8.
- `GOVERNANCE_OWNERSHIP_SPEC_v1_0.md`: §4.
- `HANDOFF-github-app-batcave-synapse.md`: detalle de Repo Ops (si no existe, registrarlo).

Lectura secundaria si hace falta: `Investigacion_Installer_Metamorph_Autoupdate_v0_1.md`, `Backend_Batcave_Nucleus_Identidad_y_Comunicacion_v0_1.md`, `Nota_Tecnica_Analisis_Fase4_Escrituras_y_Onboarding_Primer_Principal_v0_2.md`.

---

## 4. Evidencia de documentos (verificar contra el código)

Cada punto indica su fuente. Todo debe re-verificarse leyendo los archivos de la sección 3.

1. **Backend.** Hono sobre Cloudflare Worker, D1, R2, unas 13 migraciones, carpeta `backend/` en la raíz del repo, fuera de `installer/`. (Backend_Cloudflare §2-3; Tablero §Z.16.)
2. **Alta humana (P1 de Fase 4).** El primer login humano con GitHub, sin organización, ejecuta `finishHumanLogin` y, si el flujo no es válido, cae a `finishGenesis`. Este crea atómicamente identidad (`authority_human_identities`, migración 0006), tenant y organización personal, y registra en `authority_genesis_registry`. (Tablero §Z.16-17, verificado por Control leyendo código. Los tests los corrió el cowork previo; Control no los re-ejecutó.)
3. **Emisión de `master`.** No ocurre en el alta: ocurre después, vía `POST /v1/authority/initial-emission` (`createInitialAuthorityEmission()`), que exige una instalación Nucleus ya registrada y activa. `master` y `specialist` se siembran con la migración 0013. (Tablero §Z.16.)
4. **Sovereign Tenant.** Cerrado: tabla `tenants`, `organizations.tenant_id`, `createOrganizationUnderTenant`, `discoverTenant()` en Batcave, `TenantID` obligatorio en estado BOUND. (Tablero §Z.21-22.)
5. **Sincronización local.** Caso `"sync"` de `authority_command.go`: `RegisterInstallation`, luego `FetchAndVerifyTrustManifest`, luego el tenant lookup (`tenant_fetch.go`), luego la inyección en `config/nucleus.json`, luego `ReconcileCanonicalOrganization` (`ownership_reconciliation.go`), que une el id local `org_<timestamp>` con el `organizationId` del Backend. El rol llega por el snapshot de autoridad (`GET /v1/authority/snapshot`). (Tablero §Z.21-22.)
6. **`ACCOUNT_REGISTERED` NO es el registro del servidor.** En el dossier es el evento de la cuenta de **Google** del Companion (`AUTHORITY_BOUNDARY.md` §2.2, `service: 'google'`). No usarlo como bisagra con el servidor.
7. **Flujos de GitHub conocidos.** Tratarlos como fronteras externas separadas hasta demostrar lo contrario:
   - (a) Repo Ops: GitHub App con Device Flow, en Cortex/Discovery.
   - (b) Batcave Auth: OAuth App clásica con callback, en Batcave. (BATCAVE_ARCHITECTURE §4.3.)
   - (c) Login humano del backend: tipo de app sin confirmar.
   - (d) Una GitHub App instalada por organización (INVARIANT-ORG-008).
8. **Autenticación S2S.** Pedidos firmados con la clave Ed25519 de la instalación (Tablero §Z.24). No sirve para el paso humano previo a toda instalación, porque en ese momento todavía no existe un `installation_id`.
9. **Distribución.** Tabla `releases` con `component` (brain, host, sentinel, conductor, cortex, sensor, ionrecipe), `platform` (win/mac/linux), `channel` (stable/beta), `r2Key`, `sha256`; y tabla `downloadRules` por organización. `~/.local/share/BloomNucleus/bin` pesa unos 2,2 GB (697 MB solo `chrome-linux`). No hay diseño conocido de descarga inicial para un humano ni de firma de builds. (Backend_Cloudflare §4 y §8.)
10. **Landing.** Candidatos sin confirmar: el prototipo `backend/web/` (mockeado contra el schema legado `users`/`org_members`, sin conexión a rutas reales según Tablero §Z.16) y dos sitios en Vercel a migrar a Cloudflare Pages o Workers, con rutas sin confirmar. (Backend_Cloudflare §0 y §7.)
11. **Roles.** Solo existen `master` y `specialist`. `delegate`/`operator`, `scoped_admin` y `auditor` son candidatos no aprobados.

---

## 5. Preguntas a responder

Para cada una, dar la respuesta con su clasificación, ruta absoluta y línea o función.

1. **Landing y registro.** ¿`backend/web/` se conectó a las rutas reales o sigue mockeado? ¿Los sitios de Vercel son la landing de registro, la de descarga o ninguna de las dos? ¿Dónde se sirve la página y con qué stack? Buscar en `wrangler.jsonc` rutas, dominios y bindings de assets. Si no hay URL o dominio en el repo, marcar `[NO ENCONTRADO]` y dejar el dato como pendiente para José.
2. **Login GitHub del backend.** Tipo de app (OAuth App o GitHub App), URL de callback, scopes pedidos, y si reutiliza las credenciales de Batcave Auth o de Repo Ops o es una app propia. No transcribir ningún valor secreto: si aparece un `client_secret` o token en algún archivo, citar solo la ruta y avisar aparte.
3. **Miembro que no es el fundador.** En Tablero §Z.16 la invitación a una organización ajena estaba sin resolver. ¿Sigue así?
4. **Descarga del instalador.** Mecanismo (link directo, URL firmada de R2, build generado), plataformas, firma de builds, qué componentes incluye el instalador inicial y su relación con `releases`/`downloadRules`.
5. **Bisagra con el onboarding local.** ¿Cómo obtiene Nucleus el `organizationId` recién creado antes de registrar la instalación? (Tablero §Z.16 lo nombraba pendiente; el tenant lookup de §Z.21-22 puede haberlo cubierto en parte.) Trazar el camino exacto de datos desde el alta hasta el caso `"sync"`.
6. **`.ownership.json`.** Según `GOVERNANCE_OWNERSHIP_SPEC` §4, solo se genera con `nucleus init` manual. ¿Sigue así? Si sí, ¿qué garantiza que exista cuando corre `"sync"`?
7. **Contradicciones.** Listar todo lo que el dossier existente afirma y esta investigación contradice.

---

## 6. Quinta superficie de automatización

La Fase 0 corre sobre un Chrome genérico, sin la extensión Cortex instalada todavía. Es una quinta superficie de Playwright, distinta de las cuatro ya documentadas (Electron, Discovery, Companion, CLI). Documentarla como fase separada, sin mezclarla con la matriz existente.

Ciclo de vida a describir: browser limpio, registro con login GitHub, descarga real de archivo, instalación, y recién ahí lo ya documentado.

Por plataforma (Linux, Windows, macOS): dónde cae el instalador descargado, nombre y formato del archivo, y dónde queda la instalación. Referencia en Linux: `~/.local/share/BloomNucleus/bin`. El cowork corre en Linux, así que solo Linux puede verificarse contra el código y el sistema de archivos. Windows y macOS se documentan por inferencia del código y se marcan `[NO VERIFICADO EN EJECUCIÓN]`.

**Restricción a resolver antes de proponer nada.** `AUTHORITY_BOUNDARY.md` §1 y §4 prohíben que el sistema automatice login, registro o generación de credencial en un proveedor externo (GitHub incluido): no rellena formularios ajenos, no hace clic por el usuario, no resuelve captcha ni 2FA. El §1 aclara que el principio aplica sin importar qué componente ejecute la automatización. Determinar si el harness de pruebas de synapse-runner está alcanzado por esa regla. **No decidirlo.** Presentar las opciones que se le ocurran (por ejemplo, un paso humano dentro del loop o una sesión pre-autenticada) con sus consecuencias, y elevarlas a José como decisión pendiente.

Si algún tramo de la Fase 0 resulta ser `[DISEÑADO]` y no `[CONSTRUIDO]`, indicar qué parte se puede automatizar hoy y cuál queda bloqueada.

---

## 7. Entregable

Escribir el archivo:
`/home/jose/repos/bloom-development-extension/docs/SYNAPSE/SYNAPSE-RUNNER/Fase0_Server_Side_Onboarding_Seccion.md`

Debe estar escrito con el mismo formato, nivel de detalle, numeración y terminología del dossier existente (leerlo completo primero), listo para que José lo anexe manualmente como fase previa a todo lo ya documentado. No modificar el dossier.

Contenido obligatorio, en este orden:

1. **Fase 0: arquitectura real.** Registro, autorización de GitHub, descarga del instalador y punto de sincronización, con rutas absolutas confirmadas.
2. **Tabla final.** Columnas: componente | estado (`CONSTRUIDO` / `DISEÑADO` / `NO ENCONTRADO`) | ruta absoluta o documento | bloqueante para automatizar (sí/no).
3. **Fronteras externas de GitHub.** Una por cada flujo distinto que se confirme.
4. **Quinta superficie de automatización.** Ciclo de vida por plataforma, con lo no verificado marcado.
5. **Archivos no encontrados.** Con la ruta esperada y qué preguntas quedaron sin responder por esa causa.
6. **Datos que solo José puede aportar.** Por ejemplo URL o dominio de la landing, y rutas de los proyectos de Vercel.
7. **Correcciones al dossier existente.** En lista aparte, sin aplicarlas.
8. **Decisiones para José.** Incluir la restricción de `AUTHORITY_BOUNDARY.md` sobre automatización, y cualquier otra que surja.

---

## 8. Criterios de aceptación

El entregable se considera completo cuando:

- Cada afirmación sobre el estado material tiene clasificación, ruta absoluta y línea o función.
- Ninguna afirmación proviene solo de un documento cuando existe el código para verificarla.
- Las siete preguntas de la sección 5 están respondidas o marcadas explícitamente como `[NO ENCONTRADO]` con el motivo.
- La diferencia entre `ACCOUNT_REGISTERED` (cuenta de Google) y el registro de la cuenta del servidor está reflejada.
- Los flujos de GitHub están separados como fronteras externas distintas.
- No se modificó ningún archivo salvo el entregable.
- No se transcribió ningún secreto.
