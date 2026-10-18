# RUNNER — migración del onboarding simulado a Darwin (v1)

**Estado:** onboarding simulado **verificado en Darwin** el 2026-10-18 sobre la instalación del usuario macOS habitual (`SYNAPSE_R0_TARGET=installed`): `onboarding-simulator.spec.ts`, 1 test, 15 pasos, 0 fallos, 3,8 min.
**Máquina:** Mac Intel `x86_64`, macOS, Node del sistema v20.18.0, Go 1.26.4, Python 3.14.7. Instalación Bloom nueva en `~/Library/BloomNucleus` creada por el setup.
**Código:** `synapse-runner/` con el port Darwin descripto en §3, sobre `main` en `d8a35359`.
**Alcance:** `synapse-runner` hasta el cierre del onboarding y el traspaso a RUNNER CORE. No construye, publica ni ejecuta Mandate Genesis.
**Regla de operación:** esta guía no autoriza por sí sola builds, rollouts, borrados de instalación ni corridas. Cada una requiere el pedido correspondiente.

## 1. Resultado verificado

| Paso | Evidencia de la corrida 2026-10-18 02:33 (`~/runner-darwin-20261018-0233.log`) |
|---|---|
| `r0_before_00a` | Gate Darwin `installed`: uid 501, sesión Aqua, Keychain `~/Library/Keychains/login.keychain-db`, instalación `~/Library/BloomNucleus`, workspace `~/repos/elias-repos`, Backend Wrangler del checkout en `:8787`. |
| `profile_closed_before_00a` | Perfil maestro `b7b91187-0737-42da-b7c0-ba1ca3312d69` cerrado, sin procesos. |
| `00a` / `00b` | Organización `9f1de71c-b252-4f90-bbdd-984e1cd5c9c2`, `created=true`, en la D1 de `backend/.wrangler`. |
| `r0_after_conductor` | Gate repetido con Conductor dev abierto; Brain `:5678` y Temporal `:7233` de la instalación. |
| `backend_identity_check` | Milestone con `orgId` igual al de 00b, rama `master_new_org`. |
| `workspace` | Workspace nuevo en `~/repos/elias-repos/.bloom/.nucleus-elias-repos`; `organization_id` = `backend_identity_org_id` = 00b. |
| `profile_and_simulator` | Lanzamiento nuevo del perfil; puerto CDP atribuido al Chromium del perfil (`R0 perfil`); pestañas activadas antes de conectar; duplicados cerrados por `launch_id`. |
| `sim_github`, `sim_vault_navigation` | Device Flow simulado, Vault creado, milestones `github_app_auth` y `vault_init`. |
| `gemini_authority_grant` | Snapshot Authority aceptado, fundador con `create_project`, grant de Vault emitido, `effectiveMode=remote_enforced`. |
| `sim_google`, `sim_ai_provider` | Recibo de Nucleus Vault `gemini-key:default`, grant `01c1230d-a537-4e66-ac78-4ffc78538cd2`. Llavero: una entrada `bloom-brain` / `gemini-key:default`. |
| `sim_completion` | `onboarding_complete` en Discovery. |
| `project_select_and_genesis` | `sample_project` importado desde `~/Desktop/sample_project` a `~/repos/elias-repos/sample_project`; seis SHA-256 iguales; fuente sin cambios; `onboarding.completed=true`; `pending_genesis_launch` ausente, como corresponde a un proyecto importado. |

## 2. Modos del gate R0 en Darwin

El gate vive en `src/preflight/environment-check.ts` (`assertR0Isolation`). En Darwin corre en `npm run preflight` (corta con exit code 1), en el `globalSetup` de Playwright, antes de 00a, antes de `resetOnboardingState()` y después de abrir Conductor. En Windows y Linux el comportamiento previo no cambia.

Conductor (`installer/conductor/shared/global_paths.js`), Nucleus (`supervisor/dev_start.go`), Brain (`brain/shared/paths.py`) y Metamorph (`core/paths.go`) resuelven en Darwin `<HOME>/Library/BloomNucleus` sin override propio, y el Vault de Nucleus guarda en el llavero del usuario. Por eso el gate exige que el usuario y el `HOME` reales determinen la instalación, en lugar de confiar en overrides parciales.

| Exigencia | `installed` (verificado) | `isolated` (implementado, sin corrida) |
|---|---|---|
| Usuario | El actual; `HOME` igual al home de passwd; no root. | Un usuario macOS de prueba distinto del personal (`SYNAPSE_R0_PERSONAL_HOME`). |
| Sesión y llavero | Sesión Aqua; Keychain por defecto dentro de `<HOME>/Library/Keychains`. | Igual, del usuario de prueba. |
| Instalación | `<HOME>/Library/BloomNucleus`. | `BLOOM_NUCLEUS_BASE_DIR_OVERRIDE` = `<HOME de prueba>/Library/BloomNucleus`. |
| Workspace | `<HOME>/repos/<org>`. | `<instalación>/workspaces/<org>`; slug distinto de `elias-repos`. |
| Proyecto fixture | Fuera del workspace y de la instalación. | Dentro del home de prueba. |
| D1 | `wrangler dev --local --persist-to <checkout>/backend/.wrangler`. | `--persist-to <instalación>/backend-d1`. |
| Perfil y binarios | Perfil maestro único, `nucleus`, `sentinel`, `brain` dentro de la instalación. | Igual. |
| Conductor | Modo dev desde `installer/conductor/workspace` del checkout; el build empaquetado se rechaza. | Igual. |
| Puertos | Cada listener de 8787, 5678, 4124, 48215, 7233 y 5173 pertenece al uid actual y a un binario de la instalación o a un comando dentro del checkout. Un puerto que responde sin dueño visible se trata como colisión con otro usuario. | Igual, con el uid de prueba. |

La inspección usa `lsof`, `ps`, `launchctl managername` y `security default-keychain`. Nunca detiene ni modifica procesos.

## 3. Cambios en `synapse-runner/`

| Archivo | Cambio |
|---|---|
| `src/preflight/environment-check.ts` | Rama Darwin de `assertR0Isolation`, modos `installed` e `isolated`, validación pura `validateDarwinR0Evidence`, inspección de puertos por `lsof`/`ps`, `assertDarwinProfileProcess` para el puerto CDP, resumen sin líneas de comando. |
| `src/config/bloom-paths.ts` | En Darwin, `resetOnboardingState()` exige el gate y que `nucleus.json` sea el de la instalación verificada. |
| `scripts/preflight-check.ts` | Preflight fail-closed en Darwin; `globalSetup` que aplica el gate en Darwin. |
| `playwright.config.ts` | Registra el `globalSetup`. |
| `src/surfaces/electron-conductor.ts` | `--no-sandbox` sólo en Linux; Darwin lanza como `dev:darwin`. |
| `src/surfaces/synapse-simulator.ts` | `bringToFrontOnDarwin()` antes de seleccionar un mensaje, pulsar Detect y pulsar Send. |
| `src/surfaces/discovery-chromium.ts` | En Darwin activa cada pestaña de página por `/json/activate` antes de `connectOverCDP` y deja el Simulator al frente. No cierra pestañas. |
| `tests/e2e/onboarding-simulator.spec.ts` | Gates Darwin, workspace/organización/proyecto desde `SYNAPSE_TEST_*`, inventario de procesos por uid, rechazo de `SYNAPSE_RESUME_CURRENT`, verificación del proyecto antes y después de importar, pestaña al frente antes de los clics en Discovery. |
| `tests/preflight/isolation-check.test.ts` | Casos Darwin `isolated` e `installed`. |
| `.env.example` | Variables Darwin documentadas sin valores. |

## 4. Requisitos del entorno

### 4.1 Backend local

`backend/.dev.vars` (fuera de Git) necesita, según `administration-route.ts`, `trust-route.ts` y `authority_command.go`:

| Variable | Motivo |
|---|---|
| `AUTHORITY_ALLOW_TEST_FIXTURES=true` | Modo fixture de 00a/00b. |
| `AUTHORITY_HUMAN_ORIGIN` | Origin exacto, igual a `SYNAPSE_BACKEND_ORIGIN` (`http://127.0.0.1:8787`). |
| `AUTHORITY_HUMAN_SESSION_KEY_B64` | Clave AES-GCM cruda en base64. |
| `AUTHORITY_SIGNING_KEY_ID`, `AUTHORITY_SIGNING_KEY_PKCS8_B64` | Firma de snapshots y emisiones (Ed25519 PKCS8). |
| `AUTHORITY_ISSUER` | Requerida para el manifiesto de confianza del fixture. |
| `AUTHORITY_TEST_TRUST_ROOT_PKCS8_B64` | Clave privada del vector de prueba 1 de RFC 8032; es la raíz que acepta Nucleus (`pinned_roots.go`). |
| `AUTHORITY_SERVICE_TOKEN` | Mismo valor en `synapse-runner/.env`; `nucleus authority register` lo hereda vía Conductor. |

Wrangler 4.127 exige Node 22 o superior. Con Node 20 en el sistema se ejecuta con el Node de la instalación (`~/Library/BloomNucleus/bin/node/node`, v24.15.0). Migraciones y `dev` usan el mismo `--persist-to` absoluto. Verificado: `workerd` abre D1, Durable Objects, R2 y caché bajo `backend/.wrangler/v3/`.

### 4.2 `synapse-runner/.env` (fuera de Git)

`SYNAPSE_R0_TARGET=installed`, `SYNAPSE_TEST_WORKSPACE_ORG`, `SYNAPSE_TEST_WORKSPACE_PATH`, `SYNAPSE_TEST_PROJECT_SOURCE`, `BRAIN_CLI_BIN`, `SYNAPSE_RUNNER_TEST_MODE=1`, `SYNAPSE_BACKEND_ORIGIN`, `GEMINI_API_KEY` y `AUTHORITY_SERVICE_TOKEN`. `SYNAPSE_FIXTURE_SUBJECT` queda sin definir para que 00b cree una organización nueva. `env.ts` sólo carga claves que no estén exportadas en la shell.

### 4.3 Instalación y workspace

- Perfil maestro único creado por el setup, cerrado y sin procesos antes de cada corrida.
- La carpeta del workspace existe y está **vacía**: `brain nucleus create` rechaza una carpeta no vacía que no sea repo git (`nucleus_manager.py`), y un `.DS_Store` de Finder alcanza para que falle.
- Después de un reinicio, launchd levanta `com.bloom.nucleus`, `com.bloom.brain` y `com.bloom.ollama`; Wrangler hay que levantarlo a mano.

## 5. Procedimiento de corrida

Terminal B, Backend (queda abierta):

```sh
cd ~/repos/bloom-development-extension/backend
N="$HOME/Library/BloomNucleus/bin/node/node"
W="$PWD/node_modules/wrangler/bin/wrangler.js"
P="$PWD/.wrangler"
"$N" "$W" d1 migrations apply bloom-backend --local --persist-to "$P"
"$N" "$W" dev --local --persist-to "$P" --ip 127.0.0.1 --port 8787
```

Terminal C, RUNNER:

```sh
cd ~/repos/bloom-development-extension/synapse-runner
npm ci
npm run preflight
npm run test:headed -- tests/e2e/onboarding-simulator.spec.ts 2>&1 | tee ~/runner-darwin-$(date +%Y%m%d-%H%M).log
```

El E2E se lanza sólo si el preflight imprime `✅ R0 Darwin before-00a`. El aviso del EventBus `:4124` es esperable mientras falte `bundle.js` (§8).

## 6. Fallas encontradas en Darwin y su tratamiento

| Síntoma | Causa | Tratamiento |
|---|---|---|
| `profile_closed_before_00a` aborta con procesos Chromium vivos. | El navegador de un lanzamiento previo quedó abierto aunque Nucleus marcó el perfil como cerrado. | Cerrar ese Chromium (⌘Q o `TERM` al proceso principal verificado por id de perfil). El gate se comporta como debe. |
| `workspace` espera `#screen-identity` y Conductor queda en Workspace. | `nucleus create` sale con código 1 porque la carpeta destino no está vacía. | Dejar la carpeta vacía antes de correr. |
| `sim_github`: clic en Send excede 3 s tras «done scrolling». | Discovery abre pestañas activas (`github.com/login/device`, Google, consola); macOS no pinta la pestaña del Simulator en segundo plano. | `bringToFrontOnDarwin()` antes de interactuar (§3). |
| `connectOverCDP` excede 30 s con el websocket ya conectado. | Pestañas restauradas de una sesión cortada (Discovery duplicada) que nunca se mostraron. | Activar cada pestaña antes de conectar (§3). |
| Wrangler no arranca. | Requiere Node 22 o superior. | Node de la instalación Bloom (§4.1). |
| Detectado antes de correr: `.env` tenía un `AUTHORITY_SERVICE_TOKEN` anterior. | Con tokens distintos, `nucleus authority register` sería rechazado por el Backend en el paso Gemini. | Mismo valor en ambos archivos, comprobado sin imprimirlo. |

## 7. Reintento después de una corrida fallida

1. Cerrar el Chromium del perfil y comprobar que no quedan procesos con su id.
2. Si el paso `workspace` llegó a crear `<workspace>/.bloom`, borrarlo antes de reintentar: queda vinculado a la organización de esa corrida y la siguiente crea otra.
3. No hace falta limpiar `nucleus.json`: RUNNER resetea la clave `onboarding` después del gate.
4. Cada 00b deja su organización en la D1; las de intentos fallidos quedan sin uso y no se borran filas a mano.

## 8. Observaciones abiertas

- La instalación Darwin no trae `bin/bootstrap/bundle.js`: el Control Plane (`:48215`) y el EventBus (`:4124`) no arrancan. No afecta el onboarding; sí lo posterior.
- Conductor y Nucleus no registran la salida de `brain nucleus create` cuando falla; sólo queda `exit code 1`.
- El perfil restaura pestañas de la sesión anterior cuando se cierra a mitad de una corrida. RUNNER lo tolera; el producto lo sigue haciendo.
- El modo `isolated` está implementado y cubierto por pruebas unitarias, pero no tuvo una corrida real.

## 9. Traspaso a RUNNER CORE

RUNNER termina cuando el wizard cierra con la organización reconciliada, el proyecto seleccionado y verificado y el handoff de Conductor a Workspace Core. Salida de la corrida verificada: instalación `~/Library/BloomNucleus`, origin `http://127.0.0.1:8787` con D1 en `backend/.wrangler`, organización `9f1de71c-b252-4f90-bbdd-984e1cd5c9c2`, proyecto `~/repos/elias-repos/sample_project`, recibo Vault `gemini-key:default` y `pending_genesis_launch` ausente por tratarse de un proyecto importado. El paso `mandate_genesis` del wizard sólo reconoce la intención; no equivale a un `mandate.json` firmado ni a su publicación. RUNNER CORE parte de este estado.
