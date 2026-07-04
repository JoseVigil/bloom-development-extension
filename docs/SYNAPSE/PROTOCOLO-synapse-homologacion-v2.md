# Protocolo Synapse — Auditoría de Homologación v2

**Estado:** documento reconstruido a partir de lectura directa del código fuente real (v1 se había generado sin verlo).
**Archivos auditados en esta ronda (16):** `synapse-bridge.js` (2 pasadas), `discoveryProtocol.js`, `background.js`, `landingProtocol.js`, `harnessProtocol.js`, `server_manager.py`, `workspace-synapse-handlers.js`, `discovery.js`, `landing.js`, `discovery.schema.json`, `milestone-registry.js`, `onboarding_steps.json`, `main_conductor.js`, `preload-synapse.js`, `milestone-reactor.js`, `content.js`.
**Archivos pendientes:** ver sección 7.

---

## 1. Resumen ejecutivo

El protocolo Synapse conecta cuatro capas — extensión de Chrome, Electron (Conductor), Brain (Python/asyncio) y el Chrome Host nativo — mediante un vocabulario de eventos que se declara por separado en al menos **seis lugares distintos** (dos manifests JS legacy, un schema JSON nuevo, un Set hardcodeado en `synapse-bridge.js`, un registry de milestones con fallback hardcodeado, y un JSON de disco). Ningún mecanismo automático mantiene esas seis fuentes sincronizadas entre sí.

Esa falta de sincronización produce dos tipos de problemas, de gravedad muy distinta:

- **Problemas de documentación** (bajo riesgo): eventos reales que funcionan correctamente pero no figuran como "observables" en algún manifest, o eventos simulables desde el Harness sin ningún efecto real en producción.
- **Bugs funcionales activos** (alto riesgo): lógica que hoy, en producción, no hace lo que el propio código dice que debería hacer. Se identificaron **dos bugs de este tipo activos ahora mismo**, y **uno latente** que se activará solo cuando se complete un cambio de despliegue pendiente.

Los tres se detallan en la sección 2. La causa raíz transversal de todo lo demás está en la sección 5.

---

## 2. Bugs activos y latentes, por severidad

### 🔴 CRÍTICO — `_onOnboardingSuccess()` nunca se dispara por su vía normal

**Dónde:** `milestone-reactor.js`, `_onProjectCreateComplete()`.

```js
const allBlockingDone = this._registry.blockingSteps.every(
  s => this._processed.has(s.id)
);
```

`this._processed` es un `Set` cuyas claves tienen formato `"stepId:event"` (ej. `"github_auth:ACCOUNT_REGISTERED"`) en toda la sesión activa — así lo exige el fix documentado como "Bug 3" para permitir que un mismo step reaccione a varios eventos Cortex distintos. Pero este chequeo pregunta por `s.id` **pelado**, sin el sufijo de evento, que nunca existe como clave en `_processed` durante la sesión activa. Resultado: `allBlockingDone` es `false` siempre, sin importar cuántos steps se hayan completado, y `_onOnboardingSuccess()` no se llama nunca por este camino.

Hay además una inconsistencia de formato: `rehydrateFromDisk()` sí puebla `_processed` con `stepId` pelados (leídos de `nucleus.json`), mezclando dos formatos de clave en el mismo Set entre sesiones — lo cual también puede alterar de forma impredecible el guard de idempotencia de `handleMilestone()`.

**Impacto:** el onboarding nunca se marca completo por lógica normal. Solo se comunica al renderer un `__onboarding_complete__` si algo más dispara `_onOnboardingSuccess()` — que hoy no ocurre.

**Fix sugerido:** comparar contra un Set separado de stepIds completados (no contra las claves compuestas), o normalizar `_processed` para que solo contenga `stepId` y mover la discriminación por evento a otra estructura.

---

### 🔴 CRÍTICO — el step `google_auth` nunca se marca completo por ningún evento real

**Dónde:** `milestone-registry.js` (`FALLBACK_STEPS`) + `discovery.js` (`GoogleAuthFlow`) + `milestone-reactor.js`.

- `ACCOUNT_REGISTERED` es, por diseño, un evento **genérico** compartido por GitHub y Google, discriminado por el campo `service` en el payload (confirmado en `GithubAuthFlow._saveToken()` y `GoogleAuthFlow._confirmLogin()` de `discovery.js` — diseño correcto).
- Pero `registry._eventToStepId` es un mapa **plano por nombre de evento**, sin discriminar por `service`. Como `ACCOUNT_REGISTERED` solo aparece en `cortex_events` de `github_auth`, `resolveEvent('ACCOUNT_REGISTERED')` devuelve siempre `'github_auth'`, sin importar el `service` real del payload.
- El evento que el registry sí tiene mapeado a `google_auth` es `GOOGLE_AUTH_COMPLETE` — que nunca se implementó: no aparece en `background.js` ni en `discovery.js`. Fue reemplazado de facto por el `ACCOUNT_REGISTERED` genérico, sin actualizar el registry.

**Impacto:** cuando el usuario completa el login de Google, `milestone-reactor.js` ejecuta `_onGithubAuthComplete()` (marca `github_auth` de nuevo, abre Landing por casualidad) en vez de `_onGoogleAuthComplete()`. El step `google_auth` nunca se persiste en `nucleus.json`. Hoy esto no bloquea el onboarding completo porque `google_auth` tiene `blocking: false` — pero el dato de progreso queda permanentemente incorrecto.

**Fix sugerido:** el mapa de resolución del registry necesita discriminar por `(evento, service)` cuando el evento es intencionalmente genérico, o Google necesita emitir un evento propio real.

---

### 🟠 ALTO (latente) — el `onboarding_steps.json` real no tiene `cortex_events`

**Dónde:** `milestone-registry.js` vs. `onboarding_steps.json`.

El comentario de `milestone-registry.js` afirma: *"El hardcode es idéntico al JSON canónico del repo — cualquier divergencia es un bug de sincronización."* Es falso hoy: `onboarding_steps.json` no tiene los campos `cortex_events`, `blocking` ni `conductor_reaction` en ningún step (tiene en cambio `storage` y `description`, ausentes del fallback). `_normalizeStep()` completa `cortex_events` ausente con `[]`.

**Por qué es latente y no activo:** hoy `MilestoneRegistry.loadSteps()` no encuentra el archivo en disco (`ENOENT`, porque el paso de instalación que lo debería copiar — "Cambio 2 de 8" — todavía no está implementado) y cae al `FALLBACK_STEPS` hardcodeado, que sí tiene `cortex_events` completos.

**Por qué es urgente igual:** `main_conductor.js` confirma que el mecanismo que cargaría ese JSON ya corre en cada boot (`registry.loadSteps()` dentro de `initOnboardingBridge()`). El día que el deploy del JSON se complete, `resolveEvent()` empieza a devolver `null` para **todos** los eventos, sin ningún error visible más que un `console.warn` fácil de perder — el pipeline completo de milestones queda desconectado en silencio, en el mismo commit que se suponía que lo iba a mejorar.

**Fix sugerido:** o se sincroniza `onboarding_steps.json` con los campos de runtime que el registry necesita, o se separan explícitamente "metadata de producto" (label, screen, description) de "config de runtime" (cortex_events, blocking) en dos archivos distintos, para que un cambio en uno no rompa al otro en silencio.

---

### 🟡 MEDIO — `DISCOVERY_COMPLETE` probablemente cierra `project_create` antes de tiempo

**Dónde:** `discovery.js` (`notifyHost()`) + `milestone-registry.js` (`project_create.cortex_events`) + `synapse-bridge.js` (`ONBOARDING_EVENTS`).

`discovery.js` emite `DISCOVERY_COMPLETE` inmediatamente después de que el handshake inicial (ping/pong) tiene éxito — **antes** de que arranque cualquier step del onboarding real. Pero `project_create` (el último step del chain, con `conductor_reaction: 'onOnboardingSuccess'`) tiene `DISCOVERY_COMPLETE` listado junto a `PROJECT_CREATED` en sus `cortex_events`. `synapse-bridge.js` confirma que `DISCOVERY_COMPLETE` se clasifica correctamente como `ONBOARDING_MILESTONE` si llega por Formato B, así que si `background.js` lo reenvía a Brain (que el catálogo original marca como ✅ consistente), el circuito se cierra: `milestone-reactor.js` marcaría `project_create` completo justo al principio del flujo.

`_onProjectCreateComplete()` no discrimina entre los dos eventos que puede recibir — a diferencia de `_onGithubAuthComplete()`, que sí distingue `ACCOUNT_REGISTERED` del resto.

**Por qué no se nota hoy:** el bug crítico de `allBlockingDone` (arriba) ya impide que cualquier combinación de steps complete el onboarding — así que el efecto de este bug queda enmascarado. **El día que se arregle ese primer bug, este segundo se vuelve visible.**

**Fix sugerido:** que `_onProjectCreateComplete()` discrimine igual que `_onGithubAuthComplete()`, o que `DISCOVERY_COMPLETE` deje de estar en `cortex_events` de `project_create` si su semántica real es "handshake completo", no "proyecto creado".

---

### 🟡 MEDIO — lógica de milestones duplicada en dos módulos

`main_conductor.js` (ventana de onboarding) y `workspace-synapse-handlers.js` (ventana de workspace) implementan el mismo bloque `bridge.on('message') → registry.resolveEvent() → reactor.handleMilestone()` de forma independiente. Cualquier fix a los bugs de arriba tiene que aplicarse en los dos lugares — no hay hoy ninguna garantía de que se mantengan sincronizados, el mismo tipo de riesgo que ya existe entre `FALLBACK_STEPS` y el JSON de disco.

---

## 3. Catálogo maestro de eventos (estado final)

Leyenda: ✅ consistente y confirmado · ⚠️ activo pero mal/parcialmente documentado · 💀 código muerto real · 🧟 zombie intencional (simulable, sin efecto real en producción) · ❓ no resoluble sin archivos pendientes

| Evento | Estado | Nota |
|---|---|---|
| `ACCOUNT_REGISTERED` | ✅ / 🔴 | Evento en sí consistente y bien diseñado (genérico, discriminado por `service`). Su **resolución a stepId está rota** para `service: 'google'` — ver bug crítico §2. |
| `DISCOVERY_COMPLETE` | ✅ / 🟠 | Emisión consistente. Sospecha fuerte de **cierre prematuro de `project_create`** — ver bug medio §2. |
| `VAULT_INITIALIZED` | ✅ (fix confirmado) | Bug histórico (nunca escribía en `bloom_profile_state.vaults` si venía simulado/empujado por host) arreglado en `discovery.js` y `landing.js`, ambos confirmados en código. |
| `GITHUB_TOKEN_STORED` | 🧟 | Handler completo en `background.js` y case en `landing.js`, pero confirmado por comentario explícito en `discovery.js`: **nunca fue responsabilidad de la extensión emitirlo**. `server_manager.py` sí lo maneja por TCP — sigue apuntando al Chrome Host nativo, no confirmado (archivo no visto). |
| `GITHUB_PAT_DETECTED` | ⚠️ | Vivo end-to-end (clipboard monitor → `background.js` → `discovery.js`). Ausente de `observable_events` en `harnessProtocol.js` Y en `discovery.schema.json` (nuevo sistema) — el patrón transversal persiste incluso en el reemplazo. |
| `GITHUB_ACCOUNT_CREATED` | ✅ (efecto confirmado) | `landing.js` confirma que recarga el dashboard. Doc sigue incompleta en otros manifests (problema solo documental). |
| `ONBOARDING_STEP_COMPLETE` | ✅ | Contrato dual (Formato A envuelto / Formato B directo) confirmado y bien diseñado en `synapse-bridge.js`, con manejo explícito del caso `data.original_event` ausente. |
| `GOOGLE_LOGIN_DETECTED` | ✅ (por diseño) | Confirmado 100% interno a la extensión — diseño intencional "pasivo" (nunca interactúa con el DOM de Google), no un bug. |
| `GOOGLE_AUTH_COMPLETE` | 💀 (alta confianza) | Esperado por diseño en el registry, nunca implementado. Reemplazado de facto por `ACCOUNT_REGISTERED` genérico sin migrar el mapeo — causa directa del bug crítico §2. |
| `AI_PROVIDER_CONFIGURED`, `PROJECT_CREATED`, `VAULT_INIT` | 💀 (tentativo, intencional) | Confirmado que son alias/eventos intencionales por diseño (están en `cortex_events` y en `ONBOARDING_EVENTS`), pero sin emisor confirmado en ningún archivo de extensión visto. Requieren el host nativo o Brain para cerrar. |
| `SITE_READY` | 🧟 (nuevo) | Vivo en clasificación (`ONBOARDING_EVENTS` de `synapse-bridge.js`), pero **huérfano en el registry** — no está en `cortex_events` de ningún step. Se clasifica pero nunca resuelve a un stepId. |
| `HOST_READY` | ❓ (nuevo) | Declarado en `discovery.schema.json` como simulable ("bloom-host señalando que está listo"), sin rastro en `background.js` ni `synapse-bridge.js`. Apunta al Chrome Host nativo, no confirmable sin ese archivo. |
| `PROFILE_CONNECTED` | ✅ | Confirmado en `server_manager.py` y en la lógica de discriminación `HANDSHAKE` vs `PROFILE` de `synapse-bridge.js`. |
| `HANDSHAKE` con `_recovered: true` | ✅ (nuevo, aclarado) | Evento **sintético**, generado localmente por `main_conductor.js` en el flujo de catch-up — nunca viene de Brain. No confundir con `HANDSHAKE_CONFIRMED` real. |
| `ION_INSPECT_RESULT` | ⚠️ | Implementado y reenviado en `background.js`, ausente de `observable_events` en `harnessProtocol.js` (declara solo 5 de 6). |
| `DOM_NAVIGATE`, `DOM_WATCH`, `DOM_WATCH_URL`, `DOM_UNWATCH` | ✅ (confirmado) | Los 4 están **completamente implementados y funcionales** en `content.js`. El gap era exclusivamente de documentación en `harnessProtocol.js` (solo cubre 6 de 10 comandos DOM). |
| `DOM_EXTRACT` | ✅ | Alias intencional y documentado de `DOM_READ`, para compatibilidad con `HARNESS_PROTOCOL_MANIFEST v2.0`. No es duplicación accidental. |
| `NUCLEUS_SYNC_RESULT`, `INTENT_LIST_RESULT` | 🧟 (probable) | Reenviados por `background.js`, pero sin ningún `case` en el único listener real de `landing.js` (`setupMessageListener`). Mismo patrón que `SESSION_STATUS`/`STATS_UPDATE`. |
| `SESSION_STATUS`, `STATS_UPDATE` | 🧟 (confirmado) | Declarados simulables en `LANDING_PROTOCOL_MANIFEST`. Confirmado: **sin listener real en `landing.js`**. Simulables desde Harness, sin ningún efecto observable en producción. |
| `LANDING_READY` | ❓ (nuevo) | Emitido por `landing.js` (`transitionToReady()`) hacia el host. No catalogado en ningún manifest anterior. Pendiente confirmar si `server_manager.py` tiene handler dedicado o cae al ruteo genérico. |
| `SIGNAL` | ❓ (nuevo) | Emitido por `content.js` (`executeWatch()`), con `name`/`priority`. Evento "contenedor" de Ion automation, no de onboarding — no catalogado en ningún manifest. |
| `PAGE_CHANGED` | ❓ (nuevo) | Emitido por `content.js` (`executeWatchUrl()`). Mismo caso que `SIGNAL`. |
| `ACTUATOR_READY`, `SLAVE_MODE_CHANGED`, `SLAVE_MODE_TIMEOUT` | ✅ (origen confirmado) | Confirmado que se originan en `content.js` (no en `background.js`, que solo reenvía). Siguen sin presencia en ningún manifest — problema solo documental. |
| `HEARTBEAT_SUCCESS` | ⚠️ | Sin cambios — activo en `background.js`/`discovery.js`, no catalogado en manifests. |
| `catch_up_needed` (campo de `STATUS`) | ✅ (confirmado end-to-end) | `synapse-bridge.js` lo emite en `REGISTER_ACK`; `main_conductor.js` lo consume con un poll de seguridad (`nucleus synapse status`) que puede sintetizar un `HANDSHAKE` local si el perfil ya está `ONLINE`. |
| Capa TCP/Brain completa (`REGISTER_*`, `HEARTBEAT`, `POLL_EVENTS`, etc.) | ⚠️ | Sin cambios respecto al catálogo original — real y activa en `server_manager.py`, ausente de los 4 catálogos JS. |
| Mecanismo viejo `onboarding_state.googleEmail`/`.geminiKeyValidated` | 💀 (confirmado por el propio autor) | Comentario explícito en `discovery.js`: nunca se escribía, reemplazado por `stepCurrent` + `routeToStep()`. Ya no hay dos fuentes de verdad en paralelo. |

---

## 4. Mecanismos confirmados end-to-end (sin bugs)

Para que el documento no lea solo como una lista de problemas — esto es lo que **funciona correctamente**, verificado de punta a punta:

- **Handshake y resume:** `synapse:seedAndLaunch`/`synapse:launch` → `SynapseBridge` (TCP framing 4-byte BigEndian) → `server_manager.py` → broadcast `PROFILE_CONNECTED` → clasificado como `HANDSHAKE` → `discovery.js` avanza el flujo. El catch-up de `catch_up_needed` cubre la race condition de timing.
- **Navegación remota de steps:** `nucleus synapse onboarding <profileId> --step <screen>` (CLI) → Brain → host → `background.js` → `chrome.runtime.onMessage` con `command: 'onboarding_navigate'` → `OnboardingFlow.setupListeners()` → `routeToStep()`. Contraparte exacta de la "Incógnita 5" mencionada en `milestone-reactor.js`.
- **Apertura de Landing:** único mecanismo real es `nucleus synapse launch <profileId> --mode landing`, invocado desde `_openLandingTab()` cuando el evento es específicamente `ACCOUNT_REGISTERED` (no cualquier evento de `github_auth`).
- **Comandos DOM:** los 10 comandos (`DOM_CLICK`, `DOM_TYPE`, `DOM_READ`/`DOM_EXTRACT`, `DOM_UPLOAD`, `DOM_SCROLL`, `DOM_FOCUS`, `DOM_WAIT`, `DOM_SNAPSHOT`, `DOM_NAVIGATE`, `DOM_WATCH`, `DOM_WATCH_URL`, `DOM_UNWATCH`) están completamente implementados en `content.js` y ruteados por `background.js`.
- **Persistencia de progreso:** `_persistStepComplete()` escribe en `nucleus.json` de forma idempotente; `rehydrateFromDisk()` restaura ese estado al reiniciar el Conductor (con la salvedad del bug de formato de clave ya documentado).

---

## 5. Causa raíz transversal (por qué pasa todo esto)

El mismo patrón de fondo aparece en **cinco capas distintas**, incluyendo el sistema que se suponía que lo iba a resolver:

1. **Discovery** (legacy): `GITHUB_PAT_DETECTED`/`GITHUB_TOKEN_STORED` simulables como `messages`, ausentes de `observable_events`.
2. **Landing** (legacy): `NUCLEUS_SYNC_RESULT`/`INTENT_LIST_RESULT` declarados como respuestas de comandos, ausentes de `observable_events`.
3. **Harness** (legacy): `ION_INSPECT_RESULT` y 4 comandos DOM completos, ausentes de `observable_events`/enum.
4. **`discovery.schema.json`** (el reemplazo nuevo, pensado como fuente de verdad única): `GITHUB_PAT_DETECTED`/`GITHUB_TOKEN_STORED` **repiten el mismo problema**, ausentes de `observable_events` pese a estar declarados como `messages`.
5. **`milestone-registry.js`** (meta-nivel): el propio comentario que declara "esto debe coincidir con X" ya diverge de X — tanto en el caso `FALLBACK_STEPS` vs. `onboarding_steps.json` de disco, como (sospechado, no confirmado) en `ONBOARDING_EVENTS` de `synapse-bridge.js` vs. el `DISCOVERY_PROTOCOL_MANIFEST` que dice fuente.

**No son cinco bugs sueltos — es un solo problema de proceso**, ahora confirmado en el propio reemplazo del sistema viejo: cada manifest arma su lista de "observables" o "eventos válidos" a mano, sin derivarla automáticamente de lo que sus propios comandos generan o de lo que otra capa declara como fuente. Migrar de manifests JS a un schema JSON no resolvió la causa raíz porque la causa raíz nunca fue el formato — es la ausencia de un mecanismo de validación cruzada.

**Recomendación concreta:** un test o script de CI que, dado el conjunto real de `messages`/comandos declarados en cada manifest, derive automáticamente `observable_events` (o falle si hay una respuesta sin declarar), en vez de mantener ambas listas a mano.

---

## 6. Bugs históricos ya corregidos (confirmados en código, con evidencia)

Estos ya no requieren acción, pero vale documentarlos porque son evidencia repetida del mismo patrón de fondo ("mensaje que llega pero no se clasifica/aplica"):

- `VAULT_INITIALIZED` no escribía en `bloom_profile_state.vaults` cuando venía simulado o empujado directo por el host — arreglado con un listener genérico en `OnboardingFlow` (`discovery.js`).
- `linked_accounts` (`launch_flags`) se leía pero nunca se aplicaba a `profileData.accounts` en Landing — arreglado con `applyLinkedAccounts()`.
- Race condition en `mergeProfileState()`: `bloom_profile_state.accounts` vacío (por carrera con `discovery.js`) pisaba cuentas ya resueltas — arreglado conservando el estado previo si el nuevo viene vacío.
- Race conditions en `_updateVaultState()`/`_updateAccountState()` (dos escrituras concurrentes sobre la misma clave de storage) — arregladas con `await` en secuencia.
- `ONBOARDING_STEP_COMPLETE` se buscaba por `msg.event` en vez de `msg.type` — arreglado en `synapse-bridge.js`, con doble chequeo explícito para ambos formatos (A y B).
- Mecanismo viejo `checkResume()`/`syncWithState()` (esperaba campos que nada escribía) — eliminado, reemplazado por `stepCurrent` + `routeToStep()`.
- Logging: `console.log` no llegaba al archivo de log porque el logger custom del Conductor intercepta sus propios métodos, no la consola global — ya resuelto usando `this._logger` de forma consistente en `milestone-reactor.js`.
- Dedupe de emisión al renderer ("Bug 3"): separación correcta entre `_processed` (por evento, para no perder reacciones legítimas) y `_emitted` (por step, para no duplicar notificaciones al renderer) — este fix es, a su vez, la causa directa del bug crítico de `allBlockingDone` (§2), por dejar sin actualizar el único punto que todavía esperaba el formato de clave viejo.

---

## 7. Pendientes para una próxima ronda

No bloquean lo anterior, pero cerrarían el mapa por completo:

| Archivo | Por qué importa |
|---|---|
| Chrome Host nativo (binario/script, nombre no confirmado) | Sigue siendo el sospechoso principal de emitir `GITHUB_TOKEN_STORED`, `HOST_READY`, y posiblemente `AI_PROVIDER_CONFIGURED`/`PROJECT_CREATED`/`VAULT_INIT` directo por TCP. |
| `onboarding-handlers.js` | Registra `install:start`; podría aportar más contexto sobre `catch_up_needed` del lado del instalador original. |
| `preload_onboarding.js` / `preload_conductor.js` | Confirmar que no colisionan al exponer `bloomSynapse` vía `contextBridge` (solo puede llamarse una vez por nombre). |
| `debug.html` | Consumidor de `synapse:raw-event` — cierra el "Camino C" de debug mencionado en `workspace-synapse-handlers.js`. |
| `discoveryProtocol.js` (relectura puntual) | Confirmar o descartar la divergencia sospechada entre `ONBOARDING_EVENTS` (`synapse-bridge.js`) y el `DISCOVERY_PROTOCOL_MANIFEST` que dice ser su fuente. |
| `HANDOFF-fix-vault-onboarding`, `HARNESS_SOURCE_OF_TRUTH` | Documentos referenciados por `background.js`, nunca vistos — podrían tener contexto histórico sobre varios de los hallazgos de esta sesión. |

---

## 8. Resumen de prioridades para arreglar

1. Bug crítico de `allBlockingDone` (§2) — bloquea la finalización del onboarding hoy.
2. Bug crítico de mapeo `google_auth`/`ACCOUNT_REGISTERED` (§2) — progreso de Google nunca se persiste.
3. Sincronizar `onboarding_steps.json` con los campos de runtime del registry, o separar metadata de producto y config de runtime en archivos distintos — antes de completar "Cambio 2 de 8".
4. Confirmar y, si aplica, corregir el cierre prematuro de `project_create` por `DISCOVERY_COMPLETE`.
5. Unificar la lógica duplicada de conexión bridge→registry→reactor entre `main_conductor.js` y `workspace-synapse-handlers.js`.
6. Adoptar el mecanismo de validación cruzada de manifests descrito en §5 para evitar que el problema se siga repitiendo con cada nuevo sistema de documentación.
