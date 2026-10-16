# RUNNER — migración del onboarding simulado de Windows a Darwin (v1)

**Estado:** plan de port y protocolo de verificación; **RUNNER no ha corrido en Darwin**.  
**Fecha de corte de código:** 2026-10-16, checkout `5c580075a6a9080059a5baf478ac4f7a31231f39` (ref local `origin/main` igual al HEAD al inspeccionar).  
**Alcance:** `synapse-runner` hasta el cierre del onboarding y el traspaso a RUNNER CORE. No construye, publica ni ejecuta Mandate Genesis.  
**Regla de operación:** esta guía no autoriza aplicar sus comandos. El port, los builds, el arranque de servicios, el reset del wizard y cualquier corrida requieren el alcance y las aprobaciones correspondientes. En esta investigación sólo se creó este documento; no se ejecutó RUNNER ni se alteró la instalación.

## 1. Fuentes, grado de certeza y distinciones

1. **Evidencia de este work RUNNER en Windows.** Una corrida visible anterior de `onboarding-simulator.spec.ts` pasó 1 test y 13 pasos usando el Workspace productivo instalado, no Electron desde el repo. Confirmó 00a, 00b, Auth 1, Workspace, perfil/Simulator, GitHub, Vault, grant Gemini, Google, AI provider, cierre y selección de `sample_project`. La organización activa `eias-repos` y Auth 1 compartieron el UUID `52e6b64e-2237-4860-8763-e8119885e559`; `authority sync` automático devolvió tenant `fcc1f552-a281-4237-aafa-715aaac8865b`, `remote_enforced`, reconciliación de ownership y `mandate_delivery:pending`. Esa corrida **no** acreditó un Mandate publicado o firmado ni inferencia Anthropic/AITAP. El trabajo posterior cambió código y estado: los UUID son antecedentes, nunca fixtures Darwin.
2. **Antecedente Linux, distinto del estado Windows.** El side chat informó una corrida visible de 1 test/13 pasos/0 fallos en `bell-ubuntu`, con workspace `~/repos/elias-repos`, organización `7d55a128-93cf-41e7-bc97-e34cd8d57996` y tenant `bed0e43b-da82-4cd9-85b4-ee0ca09fda28`. Fase 0 reutilizó un subject de fixture vinculado a la instalación. Se importó `sample_project` por la UI y se contrastaron seis archivos. `mandate_delivery` seguía `pending`. Esta evidencia no acredita Darwin ni se transfiere con Git; datos, perfil, D1 y llavero son propios del host Linux.
3. **Código actual.** Las fuentes principales son [`synapse-runner/src/runner/synapse-runner.ts`](../../../synapse-runner/src/runner/synapse-runner.ts), [`src/surfaces/`](../../../synapse-runner/src/surfaces), [`src/preflight/`](../../../synapse-runner/src/preflight), [`src/config/`](../../../synapse-runner/src/config), [`onboarding-simulator.spec.ts`](../../../synapse-runner/tests/e2e/onboarding-simulator.spec.ts), [`onboarding-flow.spec.ts`](../../../synapse-runner/tests/e2e/onboarding-flow.spec.ts), [`README.md`](../../../synapse-runner/README.md), el [dossier](Synapse_Runner_E2E_Architecture_Dossier.md), [`build-all.py`](../../../build-all.py), [`installer/conductor/workspace/package.json`](../../../installer/conductor/workspace/package.json) y [`backend/wrangler.jsonc`](../../../backend/wrangler.jsonc). El README, dossier, `flow-matrix.ts` y varios comentarios conservan descripciones históricas de 00a/00b como *stub* o de Auth 1 por inyección directa; para este port prevalecen las llamadas y aserciones del spec actual. Tampoco se confunden `onboarding-flow.spec.ts` (fronteras externas reales y selectores incompletos) con el flujo integral **simulado**.

## 2. Qué hace RUNNER hoy: secuencia y superficies

`package.json` ofrece `npm run preflight`, `npm run test:headed -- tests/e2e/onboarding-simulator.spec.ts` y `typecheck`. `test:headed` llama primero al preflight y luego Playwright. Playwright usa un worker, sin reintentos; el spec simulado eleva el timeout de su test a 900 s. `tests/fixtures/synapse-runner-fixture.ts` crea un `SynapseRunner` por test: intenta conectar al EventBus `ws://localhost:4124`, envuelve cada paso en una sesión diagnóstica y guarda bundles. `SynapseRunner.start()` **no aborta** si EventBus falta; `scripts/preflight-check.ts` tampoco convierte chequeos de entorno fallidos en exit code no cero, salvo excepción inesperada. Por eso un preflight que imprime warnings no es un gate de aislamiento.

### 2.1 Backend y registro 00a/00b

RUNNER **no levanta Wrangler**. Espera un Backend ya iniciado en `SYNAPSE_BACKEND_ORIGIN` (default `http://localhost:8787`). `src/config/env.ts` carga sólo `.env` en `process.cwd()` y deja prevalecer variables del proceso. `backend/package.json` define `dev: wrangler dev`, `db:migrate:local` para `bloom-backend`; `wrangler.jsonc` fija puerto dev 8787, D1 `DB/bloom-backend` y R2 `MANDATES/bloom-mandates` y `RELEASES/bloom-releases`. El modo fixture requiere `AUTHORITY_ALLOW_TEST_FIXTURES=true` en un Backend local, con el resto de credenciales de prueba válidas; la presencia de un archivo `.dev.vars` no prueba por sí misma que el proceso correcto lo cargó.

En `phase0-generic-browser.ts`, **00a** hace `POST /v1/authority/genesis/login` con `Origin` del Backend, obtiene URL y cookie de flow. **00b** hace `GET /v1/authority/human/callback?state=...&code=<fixtureSubject>` con esa cookie y recibe desde Backend `organizationId`, `principalId`, sesión, CSRF y `created`. No abre github.com ni usa Playwright en estas dos fases. `SYNAPSE_FIXTURE_SUBJECT` permite un subject fijo; sin él se genera un UUID nuevo. Un subject nuevo puede crear otra organización, incompatible con una instalación local ya vinculada; recuperar la misma organización exige demostrar primero en la D1 **aislada** el vínculo de instalación y subject. Nunca copiar el UUID Windows o Linux a Darwin por conveniencia. 00c (descarga pública de release) y 00d (instalación) siguen fuera del E2E integral.

### 2.2 Electron, Auth 1, organización y Workspace

Antes de 00a, el spec normal llama `waitForProfileClosed()`. Consulta `nucleus --json synapse status <master_profile>`, `profiles.json` y procesos del perfil; sólo acepta workflow ausente/idle, `sentinel_running=false`, perfil cerrado, handshake falso y ningún proceso suyo. **Esta función contiene PowerShell/Win32 y una alternativa `ps` heredada de Linux; no identifica de forma demostrable los procesos macOS.** Luego de 00b llama `resetOnboardingState()`: borra la clave completa `onboarding` en `config/nucleus.json`. Ésta es una escritura destructiva para el wizard, aun cuando preserve el resto del JSON. No debe apuntar nunca a `~/Library/BloomNucleus` personal.

`launchConductor({browser, backendOrigin})` invoca `_electron.launch()` e inyecta sólo al proceso de Conductor `BLOOM_GENESIS_TEST_BROWSER_SECRET` y `BLOOM_AUTHORITY_ORIGIN`. El modo dev busca `installer/conductor/workspace/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron`; el modo empaquetado usa `CONDUCTOR_EXE_PATH` o intenta `.../bin/conductor/bloom-conductor` (ruta **que no representa por sí sola** el `.app` productivo macOS). La corrida Windows verificada usó el ejecutable productivo de Workspace con override; los comentarios que dicen “sólo modo dev” están desactualizados respecto de esa evidencia. En Darwin, la forma del `.app`, sus recursos y si `_electron.launch()` acepta el ejecutable elegido siguen sin comprobarse.

Conductor abre `screen-entry`; Runner pulsa Start, espera `backend_identity_check` en el buffer `window.onboarding.onMilestone`, compara `orgId` con 00b y continúa. Ese Auth 1 llama al Backend mediante el IPC real de Conductor: el resultado se persiste como `onboarding.backend_identity_org_id`. El spec llena `#ws-path-input`/`#ws-org-input`, crea o reutiliza el workspace mediante la UI y lee `nucleus.json` para comprobar una sola organización activa con `organization_id == backend_identity_org_id == phase0Registration.organizationId` y `workspace_path` correcto, antes y después del cierre. Un resultado `created:false` puede ser legítimo para el subject ya vinculado.

### 2.3 Perfil, handshake y Chromium

El clic `#btn-continue-identity` es el disparador real de `onboarding:launch-discovery` desde Conductor; Nucleus/Sentinel lanzan Chromium y el perfil. RUNNER no spawnea Chromium. Tras la señal UI, `waitForDiscoveryCdpEndpoint()` lee `master_profile` de `nucleus.json`, la spec `config/profile/<id>/ignition_spec.json`, exige `--remote-debugging-port=0`, lee `DevToolsActivePort` bajo `spec.paths.user_data` y consulta `/json/version` del puerto dinámico. El código **permite reutilizar un `DevToolsActivePort` anterior** si `profiles.json` dice `open` y `handshake_confirmed=true`; para una prueba de lanzamiento nuevo debe exigirse además `last_launch_id` diferente y proceso propio nuevo, como intenta el spec. Un puerto que responde solo acredita CDP, no handshake del perfil correcto.

`waitForSimulatorTargets()` inventaría `/json/list` hasta ver las tabs `discovery/index.html` y `synapse-simulator/index.html`. `connectToDiscovery()` conecta `chromium.connectOverCDP()` al browser de Nucleus/Sentinel; al cerrar su handle suelta la conexión, no debe matar un browser personal. El spec comprueba que `profiles.json`, `discovery.synapse.config.js` y la UI Simulator comparten `profile_id`/`launch_id`, inventaría tabs y cierra sólo duplicados atribuidos a ese lanzamiento. **Antes del primer Send** observa en la pestaña viva esos IDs. `selectDiscoveryMessage()` selecciona el ítem de la izquierda, verifica la vista previa; `sendDiscoveryMessage()` completa campos, pulsa `#btn-send` (teclado sólo si el clic está obstruido), observa `✓ Sent` y el spec comprueba por separado el efecto en Discovery/Conductor. `✓ Sent` no demuestra recepción.

### 2.4 Resto del onboarding simulado y límite de éxito

El spec sigue GitHub Device Flow simulado, Vault, dos `syncGeminiVault()` directos desde el test para snapshot/grant, Google (Detect + Send; URL de pestaña y `detected_host` son datos diferentes), Gemini y recibo de Nucleus Vault, Project y completion. Usa `readFileSync()` para comparar IDs en Nucleus y `.ownership.json`; elige proyecto mediante stub sólo del diálogo nativo y verifica los seis SHA-256 después de la importación UI. La corrida Windows antigua observó un handoff con `pending_genesis_launch`; **el spec que está hoy en Git cambió** y termina exigiendo que ese campo sea `undefined`. Esa aserción nueva no demuestra por sí sola Mandate firmado, ejecución ni publicación en Backend. `finally` cierra la conexión CDP y Conductor incluso si falla.

El archivo `onboarding-flow.spec.ts` prueba otra vía, con GitHub/Google reales y selectores aún no resueltos (`detectGoogleButton` placeholder, sentinel `onboarding:success` sospechoso); no sustituye a la simulación ni es el candidato para el primer port Darwin. Los E2E `core-genesis-*.spec.ts` son trabajo RUNNER CORE separado. El dossier describe cinco superficies y cuatro capas diagnósticas, pero conserva hipótesis de build/flujo antiguas; el código y las pruebas ejecutadas delimitan el comportamiento material.

## 3. Dependencias y binarios Darwin por verificar

| Componente | Fuente/ruta Darwin esperada por código | Gate previo a usarlo |
|---|---|---|
| Node, npm, TypeScript, Playwright | `synapse-runner/package.json`; `npm ci` en el checkout de prueba | Arquitectura `arm64`/`x86_64`, Node compatible, `typecheck`; sin ejecutar un navegador de prueba contra datos personales. |
| Electron de desarrollo | `installer/conductor/workspace/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron` | `npm ci` en ese subdirectorio, paquete y preload cargan, primera ventana en modo gráfico; `resolveDevLaunchArgs()` añade hoy `--no-sandbox` en Darwin aunque `package.json` dice `dev:darwin: electron .`: hay que resolver y probar esa discrepancia. |
| Workspace empaquetado | `package.json` construye DMG x64/arm64; Metamorph reconoce `/Applications/Bloom Nucleus Workspace.app` | Identificar el Mach-O exacto del `.app` aislado y sus módulos `shared`/`shared_node_modules`; no apuntar a `/Applications` personal. `resolveConductorExePath()` hoy busca `bin/conductor/bloom-conductor`, no este `.app`. |
| Nucleus y Sentinel | `build-all.py`/scripts `build-darwin.sh`; binarios sin `.exe` bajo base `bin/nucleus/nucleus`, `bin/sentinel/sentinel` | `--json info`, `--help`, procedencia y hash del build; `nucleus dev-start` y Temporal bajo raíz aislada **probados**, no supuestos. |
| Brain, Host, Cortex | `build-all.py` usa `builds/unix/build-brain.sh`, target host y `build_cortex()`; extensión del perfil procede del `.blx` instalado | Brain CLI resoluble por ruta absoluta; native host/bridge 5678; extensión activa y templates del perfil comparados por hash. |
| Backend | `backend/wrangler.jsonc`, `backend/package.json` | `wrangler dev` local, D1/R2 y Durable Objects bajo `--persist-to` aislado, migraciones en esa misma raíz, `AUTHORITY_ALLOW_TEST_FIXTURES=true` sólo en esa instancia. |
| Servicios y puertos | Backend 8787; Temporal gRPC 7233; native host 5678; EventBus 4124; debug panel 48215; Core dev 5173 si aplica; CDP dinámico | Dueño/proceso y ruta de persistencia de cada listener; 48215 **no es requisito antes de 00a ni de `nucleus dev-start --skip-control-plane` durante ONBOARDING**. No usar un puerto libre como prueba de aislamiento. |

`build-all.py --only ...` es **mutante**: genera artefactos/versiones, puede parar servicios y hacer rollout según componente. No es un paso inocuo del diagnóstico de Mac; para el ensayo aislado hacen falta primero un checkout y destino de builds propios, y comprobar qué ruta usa el script/Metamorph. `installer/conductor/workspace/package.json` tiene `build:darwin:x64`, `build:darwin:arm` y `dev:darwin`, pero la existencia del script no demuestra que el bundle arranque ni que Synapse Bridge funcione en Darwin.

## 4. Diferencias de rutas, procesos y persistencia; aislamiento exigido

La ruta personal macOS que resuelven `bloom-paths.ts`, Brain, Nucleus y Sentinel por defecto es **`~/Library/BloomNucleus`**. El override `BLOOM_NUCLEUS_BASE_DIR_OVERRIDE` afecta sólo la resolución Node de RUNNER: **no redirige por sí mismo Brain, Sentinel ni todas las funciones Go**. `brain/shared/paths.py` y `installer/nucleus/internal/supervisor/dev_start.go::getBloomNucleusBase()` construyen la ruta Darwin directamente desde el home. `BLOOM_APPDATA_DIR` se usa en partes de Nucleus pero no es un sustituto universal de ese resolver. Cambiar únicamente `HOME` tampoco es una garantía: puede mover Electron, llavero, preferencias o buscar binarios en un sitio diferente. Hay que demostrar por proceso y por archivo, con la misma cuenta de prueba, que todos resuelven la **misma raíz descartable**.

Propuesta de target, **sólo después de implementar el port**: por ejemplo `<RUN_ROOT>/home/Library/BloomNucleus`, `<RUN_ROOT>/workspace/<slug-de-prueba>`, `<RUN_ROOT>/backend-state`, perfil maestro bajo esa raíz y directorio de diagnóstico propio. `<RUN_ROOT>` debe ser una ruta real elegida en la Mac, fuera del home personal y de otros workspaces; aquí no se inventa su valor. Un home aislado para un usuario macOS de prueba, o una VM con usuario propio, ofrece una frontera más verificable que overrides parciales en la cuenta personal. El Keychain también debe pertenecer a ese usuario/sesión de prueba; usar el Keychain personal invalidaría el aislamiento de Vault aunque las rutas de JSON sean distintas. No montar `~/Library/BloomNucleus`, no copiar `nucleus.json`/`.ownership.json` productivos ni usar Mandates existentes como fixture.

El Backend no comparte estado por el puerto: una instancia en `:8787` puede usar otra D1. Para este ensayo, **D1, R2, Durable Objects y cache** deben quedar bajo un único `--persist-to <RUN_ROOT>/backend-state` absoluto; `db:migrate:local` debe apuntar a esa misma persistencia. Se registra la ruta efectiva y la lista de migraciones aplicadas, sin resetear ninguna D1 ajena. `wrangler.jsonc` define bindings pero no identifica por sí solo el directorio usado por un proceso. Atribuir el PID de `:8787` y su línea de comando completa internamente, publicando sólo rutas/flags no secretos.

En Windows `waitForProfileClosed()` usa `Get-CimInstance Win32_Process`; en Linux usó `ps -eo`. En Darwin hay que correlacionar PID, executable, args, `profile_id`, user-data-dir, `last_launch_id` y señal de Nucleus. `ps` con coincidencia de texto solamente puede incluir procesos ajenos; un `DevToolsActivePort` antiguo que aún responde tampoco acredita lanzamiento nuevo. La prueba debe abortar si no puede distinguirlos. El CDP usa puerto aleatorio de Chromium, no uno fijo que se pueda reservar con antelación.

## 5. Archivos concretos que requieren port o auditoría

| Archivo | Cambio mínimo propuesto / motivo |
|---|---|
| `synapse-runner/src/preflight/environment-check.ts` | Portar R0 fuera de `powershell.exe`, `Get-NetTCPConnection`, `netstat.exe`, `APPDATA`/`LOCALAPPDATA`, `.exe` y `C:\repos`; validar root personal vs descartable, ownership de procesos/puertos y `--persist-to` absoluto en Darwin para las dos fases. Hoy `inspectPorts()` lanza “sólo Windows” y `assertR0Isolation()` se apoya en rutas Windows. No aceptar inspección fallida como éxito. |
| `synapse-runner/scripts/preflight-check.ts` y `synapse-runner/playwright.config.ts` | El preflight actual sólo advierte y Playwright no instala un gate global. Definir fail-closed antes de 00a y antes de `resetOnboardingState()`; comprobar fase después de Conductor sin exigir Control Plane 48215 durante onboarding. |
| `synapse-runner/src/config/bloom-paths.ts` | El override Node Darwin existe, pero `resetOnboardingState()` escribe sin comprobar frontera. Insertar gate de aislamiento antes de esa escritura; no asumir que el override redirige Go/Brain. |
| `synapse-runner/src/surfaces/electron-conductor.ts` | Resolver bundle Darwin productivo o dev según alcance, evitar ruta `bin/conductor`/guard Win32, alinear flags de Electron con `dev:darwin`, comprobar post-arranque que Conductor usa la raíz descartable; cerrar sólo el proceso propio ante fallo. Mantener stdout/stderr abiertos para no inducir `EPIPE`. |
| `synapse-runner/tests/e2e/onboarding-simulator.spec.ts` | Quitar `~/repos/elias-repos` y slug fijos; parametrizar base/org/proyecto y verificar que están bajo el root aislado. Portar `waitForProfileClosed()` con atribución macOS; exigir lanzamiento nuevo, IDs de Simulator/Discovery, comparar organización/tenant y no borrar datos personales. La rama `SYNAPSE_RESUME_CURRENT=1` sólo con estado aislado y aserciones de identidad. Auditar la aserción actual `pending_genesis_launch===undefined` contra el handoff real antes de usarla como gate Darwin. |
| `synapse-runner/tests/e2e/onboarding-flow.spec.ts`, `src/config/selectors.ts` | **No** usar como prueba inaugural: tiene ruta/seletores distintos, una frontera GitHub real y selector Google placeholder. Port separado si se quiere ensayar autenticación real. |
| `synapse-runner/src/config/env.ts` y `.env.example` | Documentar/configurar la ruta Darwin seleccionada, binarios y origin, y verificar que el cwd es `synapse-runner/`; no depender del fallback implícito ni imprimir secretos. |
| `synapse-runner/src/preflight/extension-parity-check.ts` | Convertir advertencia de extensión ausente/desincronizada en bloqueo para el modo aislado; comprobar artefacto activo del perfil realmente lanzado. |
| `installer/conductor/workspace/package.json` y fuentes de empaquetado/bridge | Auditoría específica del `.app` Darwin y ubicación de `shared/logger.js`, `synapse-bridge.js`, `onboarding-schema.js`, dependencias. Cualquier cambio requiere lista/permiso separado; este documento no edita producto. |
| `brain/shared/paths.py`, `installer/nucleus/internal/supervisor/dev_start.go` y rutas Sentinel/Host | Confirmar o implementar un contrato común de raíz aislada que tenga precedencia en Darwin; no resolverlo sólo dentro de Runner. Registrar todos los consumidores que aún hardcodean `~/Library/BloomNucleus`. |
| `synapse-runner/src/runner/synapse-runner.ts` | La envoltura diagnóstica no necesita port de OS evidente; sí revisar que rutas de `diagnostics-output` y logs no contengan secretos y que un EventBus ausente no se tome como éxito integral. |

Estos son **candidatos de cambio**, no archivos autorizados para editar por este encargo. La tabla sólo enumera exactamente qué impide una prueba segura; el diseño final y la autorización de escritura pertenecen a José.

## 6. Preparación y arranque propuestos en Mac — no ejecutados

Los comandos siguientes son una **secuencia propuesta para después del port y de aprobar su ejecución**. Usan placeholders que deben reemplazarse con rutas y puerto acordados en la Mac; no deben correrse literalmente. Ninguno se ejecutó al redactar esta guía.

### Fase A — inventario sólo lectura, antes de crear o arrancar

```sh
uname -s
uname -m
node --version
npm --version
python3 --version
go version
command -v wrangler || true
test -e "$HOME/Library/BloomNucleus" && printf '%s\n' 'personal BloomNucleus existe; no usarlo para RUNNER'
git -C <REPO_MAC> rev-parse HEAD
git -C <REPO_MAC> status --short
```

**Esperado:** `Darwin`, arquitectura conocida, checkout identificado y ruta personal marcada como prohibida. Si se requieren builds Darwin, revisar en el propio host los scripts `build-all.py`, `installer/nucleus/scripts/build-darwin.sh`, `installer/sentinel/scripts/build-darwin.sh` y el `package.json` de Workspace antes de construir; no usar `build-all.py --only` como inspección. También comprobar `nucleus --json info` y los hashes de binarios sólo si se conoce su ruta **aislada**.

### Fase B — diseño del root y dependencias, aún sin 00a

Establecer `<RUN_ROOT>` en un usuario/sesión/volumen descartable y demostrar `realpath(<RUN_ROOT>)` ajeno al home personal. Preparar allí binarios/servicios, workspace, perfil maestro y extensión para **la misma** organización fixture; no copiar archivos de la instalación personal. Definir `AUTHORITY_HUMAN_ORIGIN` en Backend y `SYNAPSE_BACKEND_ORIGIN` en Runner idénticos, ambos loopback. Mantener `backend/.dev.vars` y `synapse-runner/.env` sólo en el checkout aislado, con credenciales de fixture, sin mostrar sus valores. `env.ts` carga `.env` desde el cwd: `npm --prefix` desde otro directorio no lo sustituye. Verificar que ninguna app ya ocupa los puertos previstos; inspeccionar dueños, no detener servicios ajenos.

```sh
# En <REPO_MAC>/backend; persistencia absoluta del ensayo.
npm ci
npx wrangler d1 migrations apply bloom-backend --local --persist-to <RUN_ROOT>/backend-state
npx wrangler dev --local --persist-to <RUN_ROOT>/backend-state --port 8787
```

**Gate previo:** confirmar con `npx wrangler --help`/subcomando en la versión instalada la sintaxis exacta de `--persist-to`; no pasar al E2E si migraciones y `dev` no apuntan al mismo directorio. Levantar Wrangler en terminal persistente y conservar stdout/stderr. **Esperado:** puerto 8787 propiedad de ese Wrangler, D1 creada sólo bajo `<RUN_ROOT>/backend-state`, R2 `MANDATES`/`RELEASES` y DO en ese mismo root, migraciones sin pendientes, fixture habilitado. Una mera respuesta HTTP de 8787 no basta para atribuir D1. Para evitar colisión con un Backend personal ya activo, se puede elegir otro puerto loopback, modificando ambos origins y comprobaciones en conjunto.

El preflight tradicional puede correrse **sólo después** de que el gate Darwin sea fail-closed y de que se hayan comprobado rutas/puertos/servicios de fase `before-00a`; actualmente advierte y continúa. Preparar y arrancar Nucleus/Temporal/worker `profile-orchestration` mediante el mecanismo oficial de Nucleus de esa instalación, comprobar gRPC `:7233` y un poller conectado, y volver a atribuir procesos tras abrir Conductor. El orden exacto de `dev-start` frente a `launchConductor()` debe ajustarse al código empaquetado/dev elegido para no duplicar servicios; Conductor invoca `nucleus dev-start` durante su boot en el recorrido conocido. No arrancar un segundo supervisor a ciegas.

### Fase C — comandos RUNNER propuestos tras el port

```sh
cd <REPO_MAC>/synapse-runner
npm ci
npm run typecheck
npm run preflight
SYNAPSE_BACKEND_ORIGIN=http://127.0.0.1:8787 \
BLOOM_NUCLEUS_BASE_DIR_OVERRIDE=<RUN_ROOT>/home/Library/BloomNucleus \
SYNAPSE_TEST_WORKSPACE_PATH=<RUN_ROOT>/workspace/<ORG_FIXTURE> \
SYNAPSE_TEST_WORKSPACE_ORG=<ORG_FIXTURE> \
SYNAPSE_TEST_PROJECT_SOURCE=<RUN_ROOT>/fixtures/sample_project \
BRAIN_CLI_BIN=<RUN_ROOT>/home/Library/BloomNucleus/bin/brain/brain \
npm run test:headed -- tests/e2e/onboarding-simulator.spec.ts
```

**No usar esta línea con el código de hoy:** `onboarding-simulator.spec.ts` ignora todavía `SYNAPSE_TEST_WORKSPACE_PATH`/`ORG` y apunta a `~/repos/elias-repos`; R0 falla o no demuestra aislamiento en Darwin; y el override Node no redirige todos los servicios. Tras el port deben incluirse las variables de lanzamiento Electron/producto aprobadas y el subject de fixture sólo cuando D1 aislada pruebe su vínculo; nunca reutilizar un subject de Windows/Linux por costumbre. La prueba debe detenerse **antes de 00a y antes del reset** si cualquiera de esas precondiciones no puede comprobarse.

## 7. Verificaciones fase por fase, fallos y teardown

| Fase | Evidencia suficiente | Abortá si... |
|---|---|---|
| 0. Aislamiento | UID/usuario de prueba; root y Keychain propios; `realpath` de Runner, Nucleus, Conductor, perfil, workspace y persistencia Backend; dueños de puertos. | Cualquier ruta apunta a `~/Library/BloomNucleus`, Mandates existentes, otro workspace o D1/R2 desconocidos. |
| 1. Backend | Wrangler propio, origin exacto, migraciones aplicadas en su D1 aislada, fixture habilitado, R2 y DO en mismo `--persist-to`. | `:8787` pertenece a otro proceso, migraciones pendientes, credenciales no disponibles, inspección ambigua. |
| 2. 00a/00b | Flow cookie y luego `organizationId`, `principalId`, sesión/CSRF de la **misma** D1; `created` según subject esperado. | Se crea una segunda org por accidente o falla la asociación instalación↔org. No mostrar cookies/tokens en logs. |
| 3. Auth 1/Workspace | Milestone real y `backend_identity_org_id`; exactamente una entrada para slug activo, mismo `organization_id` de 00b, workspace bajo root aislado, `completed=false`. | La UI requiere editar `nucleus.json` manualmente, falta ID o las rutas salen del root. |
| 4. Perfil/handshake | Nucleus status del perfil nuevo, Sentinel/Chromium atribuibles, `last_launch_id` nuevo, `profile_id`/`launch_id` iguales en `profiles.json`, config de extensión y Simulator. | Puerto CDP viejo o de otro perfil, handshake sin lanzamiento nuevo, targets ajenos. |
| 5. Simulator | Cada ítem se selecciona desde la lista, payload previo, clic Send, recibo/efecto real en Discovery y milestone/recibo en Conductor para eventos reenviados. | Sólo hay `✓ Sent` sin cambio de pantalla/estado, o Detect no observa el tab esperado. |
| 6. Vault/Authority | Snapshot firmado aceptado, fundador fixture y handle verificables, grant, recibo `gemini-key:default` del Vault aislado; sin secretos impresos. | Vault/Keychain personal, principal ambiguo, grant inválido, `account_registered` sin receptor. |
| 7. Project/cierre | SHA-256 de los seis archivos importados/reusados; IDs org/tenant en `nucleus.json` y `.ownership.json`; `authority sync ok`, `ownership_reconciled`, `onboarding.completed=true`. | Se sobrescribe un Project existente, falta tenant/ID, completed se escribe antes de sync o handoff no se observa. |
| 8. Handoff | CORE recibe el Project ID seleccionado y estado de Genesis exactamente una vez. | `pending_genesis_launch` desaparece sin evidencia de consumo o se confunde paso `mandate_genesis` del wizard con un Mandate firmado. |

**Teardown seguro:** guardar sólo trazas y diagnósticos sin cookies, claves ni tokens; soltar CDP; cerrar únicamente Electron/Chromium/servicios/PIDs cuya procedencia aislada se comprobó; esperar cierre efectivo del perfil y pollers, no sólo confirmación de `shutdown` enviada; terminar Wrangler propio y verificar que el puerto quedó libre. Mantener el root descartable para inspección hasta decidir su eliminación; no borrar D1 ni Mandates personales ni usar limpieza recursiva basada en un path sin `realpath` validado. La eliminación del root de prueba requiere una decisión explícita posterior.

## 8. Inventario mínimo a pedir de la Mac, sin secretos

- Versión macOS y CPU (`arm64`/`x86_64`); versiones de Node/npm, Python, Go, Wrangler, Playwright/Electron y hash/commit del checkout.
- Ruta real de checkout y root de prueba; existencia (sí/no) de `~/Library/BloomNucleus`, sin copiar su contenido. UID/usuario de prueba y si usa Keychain propio.
- Rutas reales y hashes/versiones de Nucleus, Sentinel, Brain, Host, Workspace `.app`, extensión de perfil y Chromium; modo dev o empaquetado.
- Nombres de servicios/labels y estado de Temporal gRPC, poller `profile-orchestration`, Brain, native host, EventBus y debug panel. Para cada puerto: número, PID, ejecutable y raíz de datos **sin volcar línea de comando si contiene secretos**.
- Backend: origin, PID/checkout, `--persist-to` canónico, nombres de bindings D1/R2, listado de migraciones aplicadas, existencia de fixture/secretos requerida como booleanos. No pedir `.dev.vars`, claves de firma, cookies de sesión, grant, API key Gemini ni output de `env`.
- Inventario del **perfil de prueba**: ID, `last_launch_id`, estado de handshake, existencia y ruta de `ignition_spec.json`, `DevToolsActivePort`, `profiles.json` y `discovery.synapse.config.js`. Publicar puerto CDP e IDs sólo si pertenecen al perfil de prueba; no copiar config completa.
- Workspace de prueba: slug, ruta y Project de fixture; IDs de organización, tenant, instalación y Project **sólo tras crear el entorno aislado**. No trasladar IDs de otras plataformas.

## 9. Estado de Git y cambios Windows no transportables por `origin/main`

En el corte de esta inspección, `HEAD` y el ref local `origin/main` coinciden en `5c580075a6a9080059a5baf478ac4f7a31231f39`. `git status --short` no mostró modificaciones pendientes en `synapse-runner/`, en `installer/conductor/workspace/` ni en la extensión. **Por tanto, no identifico un cambio fuente del RUNNER Windows actualmente sin Git que pueda enumerar como “pendiente de push”.** Eso es distinto de certificar que el remoto del servidor tiene ese SHA: aquí se comparó el ref local, no se hizo fetch. También es distinto del estado productivo: el `app.asar`, binarios, perfil, Keychain, D1/R2, `.env`/`.dev.vars`, `nucleus.json` y `.ownership.json` de Windows no viajan por `origin/main`, ni deberían copiarse a Mac.

Sí hay modificaciones locales no confirmadas en otros componentes del working tree (Backend mandate publish, Nucleus mandate install/publish, `windows_versions.txt`, y artefactos/archivos AITAP y tools sin seguimiento); no son cambios de RUNNER ni autorizan incluirlos en el port. El spec simulado **actual** apunta a `elias-repos` y tiene aserciones posteriores al cierre que ya no son idénticas a la corrida Windows histórica `eias-repos`. Antes de migrar, fijar SHA de código y de paquete instalado para no atribuir al commit resultados de un binario previo.

## 10. Punto exacto de entrega a RUNNER CORE

RUNNER termina cuando el flujo simulado cierra el wizard con la organización y tenant reconciliados, el Project seleccionado/verificado y Conductor hace el **handoff a Workspace Core**. Su salida mínima para RUNNER CORE es: raíz aislada, origin/D1 efectiva, org/tenant/installation IDs del mismo entorno, Project ID y ruta, versión de Authority, recibo Vault, estado exacto de `pending_genesis_launch` y evidencia de ventana Core. El paso `mandate_genesis` del wizard sólo reconoce la intención; **no equivale** a `mandate.json` firmado ni a publicación/asignación bootstrap. RUNNER CORE toma desde el consumo comprobado de ese pendiente (o su ausencia explicada), observa Genesis real, firma, publicación/entrega, inferencia AITAP y replay sin duplicación. En Darwin, ese traspaso sigue sin verificación.
