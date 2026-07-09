# HANDOFF — GitHub App/Batcave + Fixes Synapse
## Prompt de continuación para nueva sesión

**Fecha de esta sesión:** 07 de julio, 2026
**Propósito de este documento:** que una nueva sesión (con Claude o con cualquier otra persona del equipo) pueda retomar exactamente donde quedamos, sin releer todo el historial de chat. Contiene decisiones ya tomadas (y por qué), bugs ya corregidos y verificados, y el scope explícito de lo que falta.

---

## 1. Contexto — qué se está construyendo

El objetivo de fondo es reemplazar la autenticación ad-hoc de **Batcave** (control plane remoto de Bloom, corre en GitHub Codespaces) por una **GitHub App registrada**, con Device Flow, que además de verificar membresía en la organización pueda hacer **push, clone y crear repositorios** — permisos que el plan original no contemplaba y que se agregaron en esta sesión.

En el camino, se descubrió que el sistema de onboarding (**Synapse**, el protocolo que conecta Cortex/Chrome Extension, Electron/Conductor, Brain/Python y el Chrome Host nativo) tiene bugs activos que bloquean el flujo completo — independientemente de GitHub App. Se decidió arreglarlos primero porque el step nuevo que vamos a agregar depende de que el onboarding pueda completar.

---

## 2. Documentos de referencia (todos ya compartidos en la sesión anterior — releer antes de continuar)

| Documento | Qué contiene |
|---|---|
| `BTIPS_Bloom_Technical_Intent_Package_v6_0.md` | Arquitectura completa de Bloom: Nucleus, Cortex, Conductor, VS Code Plugin, Brain, Batcave (§8), Alfred (§9), app mobile (§10). Es el documento maestro — cualquier duda de "cómo encaja X con el resto del sistema" se responde acá primero. |
| `BTIPS-BATCAVE-GITHUB-APP-PLAN.md` | Plan original de reemplazo de Batcave por GitHub App. Desactualizado en dos puntos: los scopes (le falta push/clone/create repo, agregados en esta sesión) y la ubicación del Device Flow (el plan original asumía que lo iniciaba Batcave; se decidió que va en Cortex/Discovery — ver §3 de este handoff). |
| `BTIPS-VAULT-MULTIKEY-ANALYSIS.md` | Auditoría del sistema de vault multi-provider. Confirma que `Vault.go` es un stub (no cifra nada, no toca el Keyring real) y propone el fix v1.1: Nucleus debe autorizar (`Authorize(role, scope, keyID)`) ANTES de tocar el Keyring. **Este fix es dependencia dura** antes de guardar el token de GitHub App en el vault — ver §5. |
| `vault.go` | Código real del vault, confirma el stub descrito arriba. `RequestKey()` devuelve un hash aleatorio, no la key real. |
| `PROTOCOLO-synapse-homologacion-v3.md` | Auditoría línea por línea del protocolo Synapse. Documenta 2 bugs críticos, 1 alto latente, 1 medio, y una causa raíz transversal (falta de validación cruzada entre manifests). Los 2 críticos ya se arreglaron esta sesión — ver §4. |

---

## 3. Decisiones de arquitectura ya tomadas (no reabrir sin nueva información)

1. **GitHub App, no OAuth clásica** — permisos granulares, instalación a nivel org, revocable independiente de la cuenta personal.
2. **Device Flow, no Web Application Flow** — no hay callback URL disponible en el punto donde arranca el flujo (QR desde mobile / Discovery). Confirmado con documentación oficial de GitHub que Device Flow es el uso recomendado para "entornos constreñidos" como este.
3. **El Device Flow vive en Cortex/Discovery (Chrome Extension), no en Batcave ni en el VS Code Plugin.**
   - El "GitHub OAuth" que ya existe en el VS Code Plugin es la autenticación **ad-hoc vieja** que este proyecto reemplaza — no se reutiliza.
   - Batcave no hace falta para nada de esta fase: solo entra en juego más adelante, cuando la app mobile necesite autenticarse sin tener el privilegio de extensión de Chrome que sí tiene Cortex.
   - **Resuelto el problema de CORS:** una página normal no puede llamar a `github.com/login/device/code` ni `github.com/login/oauth/access_token` por CORS. Pero un **service worker de Chrome Extension con `host_permissions` declarados** (`https://github.com/*`, `https://api.github.com/*`) SÍ puede — es un bypass documentado oficialmente por Chrome for Developers, siempre que el código corra en `background.js` (service worker) o una página propia de la extensión, **nunca en un content script** inyectado en el DOM de otra página.
   - **Detalle de implementación pendiente:** el polling del Device Flow (hasta 900s de `expires_in`) no puede hacerse con `setInterval` porque el service worker de Manifest V3 no es persistente (se mata a los ~30s de inactividad). Usar `chrome.alarms` para que el polling sobreviva a que el worker se duerma.
4. **Scopes finales:**

   | Permiso GitHub App | Nivel | Para qué |
   |---|---|---|
   | `Members: Read-only` | Organization | Verificar pertenencia a la org |
   | `Contents: Read & write` | Repository | Clone / push / commits |
   | `Administration: Read & write` | Repository (pero habilita operación a nivel org) | Crear repos nuevos vía `POST /orgs/{org}/repos`. **Importante:** este permiso implica que solo el owner de la org puede instalar la app — coincide con que el Master ya es owner, no cambia nada del flujo de registro, pero queda anotado por si alguien más intenta reinstalar. |
   | `read:user` | Account | Identificación para auditoría (opcional) |

   Un **user access token** de Device Flow SÍ puede crear repos en la org con estos permisos (no hace falta caer a un installation token con private key) — pero el éxito depende de que el usuario autorizante también tenga permisos de owner en la org, que es el caso del Master.

5. **Mensaje Synapse nuevo: `GITHUB_APP_AUTHORIZED`.** No reutilizar `ACCOUNT_REGISTERED` — ver §4, es exactamente el patrón que causó uno de los dos bugs críticos ya arreglados.

---

## 4. Bugs de la auditoría Synapse — YA ARREGLADOS Y VERIFICADOS esta sesión

Archivos entregados con los fixes aplicados (ver adjuntos de esta sesión, o pedir que se vuelvan a generar si no se conservaron):

| Archivo | Fix aplicado |
|---|---|
| `milestone-reactor.js` | **Ticket 1 — bug `allBlockingDone`.** Se agregó un Set separado `_completedSteps` (bare stepId), distinto de `_processed` (claves compuestas `"stepId:event"`, que sigue existiendo solo para dedupe por evento). `_persistStepComplete()` lo puebla automáticamente. `rehydrateFromDisk()` ahora puebla `_completedSteps`, no `_processed`. Verificado con un test simulado end-to-end: `_onOnboardingSuccess()` ahora sí se dispara. |
| `milestone-registry.js` | **Ticket 2 — bug `google_auth`/`ACCOUNT_REGISTERED`.** Se agregó la convención `"EVENTO:service"` en `cortex_events` para eventos genéricos discriminados por el campo `service` del payload. `resolveEvent(cortexEvent, payload)` ahora acepta el payload como segundo argumento opcional; si el evento requiere discriminación y no llega `service`, devuelve `null` con warning en vez de adivinar. Verificado: `ACCOUNT_REGISTERED` + `service:'github'` → `github_auth`; + `service:'google'` → `google_auth`. |
| `main_conductor.js` | Call site actualizado: `registry.resolveEvent(enriched.event, enriched.data ?? enriched)`. |
| `workspace-synapse-handlers.js` | Mismo fix, segundo call site (lógica duplicada respecto a `main_conductor.js`, documentada en la auditoría §2 "medio" — no se resolvió la duplicación en sí, solo se sincronizó el fix en los dos lugares). |

**Verificación:** todos los cambios se probaron con `node --check` (sintaxis) y con un script que simula el flujo completo de onboarding — el log de `_onOnboardingSuccess: todos los steps bloqueantes completos` aparece con el código nuevo y no aparecía con el viejo.

---

## 5. Pendiente — con prioridad y dependencias explícitas

### 5.1 Bloqueante antes de guardar cualquier token de GitHub App

- [ ] **Fix de `Vault.go` v1.1** (`BTIPS-VAULT-MULTIKEY-ANALYSIS.md`): Nucleus debe autorizar (`Authorize(role, scope, keyID)`) antes de que `RequestKey()` toque el Keyring real. Hoy `Vault.go` es un stub — guardar el token de GitHub App ahí tal cual sería guardar un secreto real (con permisos de push/create-repo) sobre una implementación decorativa.

### 5.2 Decisión de diseño pendiente de confirmación — step nuevo vs. reusar `vault_init`

- [ ] Confirmar si se crea el step `github_app_auth` (propuesta ya escrita, ver abajo) o se resuelve distinto. **No sumar `GITHUB_APP_AUTHORIZED` a `cortex_events` de `vault_init`** — esa lista funciona con semántica OR (cualquier evento completa el step), y `vault_init`/Device Flow son dos hechos independientes que necesitan un AND. Hacerlo así reproduciría el mismo tipo de bug que se acaba de arreglar en el Ticket 1.

  Propuesta de step (pendiente de aprobación, no aplicada todavía a `milestone-registry.js`):
  ```js
  {
    id:                 'github_app_auth',
    label:              'Autorizar Batcave (GitHub App)',
    screen:             'github-app-auth',   // pantalla nueva en Discovery, a diseñar
    vault_required:     true,
    requires:           ['vault_initialized'],
    produces:           'github_app_token',
    blocking:           true,
    cortex_events:      ['GITHUB_APP_AUTHORIZED'],
    conductor_reaction: 'markStepComplete',
  }
  ```

- [ ] Si se aprueba el step nuevo: actualizar `project_create.requires` — hoy dice `['vault_initialized', 'github_token']` (el token viejo, sin scopes de `Contents`/`Administration`). Debería depender de `github_app_token` si `project_create` va a crear un repo real.

### 5.3 Implementación del Device Flow en Cortex/Discovery

- [ ] Agregar `host_permissions: ["https://github.com/*", "https://api.github.com/*"]` al manifest de Cortex.
- [ ] `background.js`: `POST /login/device/code`, mostrar QR/código en Discovery, polling con `chrome.alarms` (no `setInterval`).
- [ ] Nuevo mensaje `GITHUB_APP_AUTHORIZED` agregado a **ambos** lugares del manifest de Discovery (`messages` Y `observable_events`) — la auditoría encontró que `GITHUB_PAT_DETECTED`/`GITHUB_TOKEN_STORED` quedaron como "zombies" exactamente por declararse en uno y no en el otro. No repetir el patrón.
- [ ] Verificar membresía de org en cada apertura de sesión remota (ya estaba en el plan original, sigue vigente).

### 5.4 Deuda técnica identificada pero no resuelta esta sesión

- [ ] **Bug medio — `DISCOVERY_COMPLETE` cierra `project_create` antes de tiempo** (auditoría §2). Estaba enmascarado por el bug de `allBlockingDone`; ahora que ese se arregló, **este puede volverse visible**. No se tocó esta sesión — revisar antes de dar por cerrado el onboarding.
- [ ] **`onboarding_steps.json` sin `cortex_events`/`blocking`/`conductor_reaction`** (bug alto, latente). Hoy no rompe nada porque el archivo no existe en disco y el sistema cae al `FALLBACK_STEPS` hardcodeado. Si se completa el deploy del JSON ("Cambio 2 de 8") sin sincronizar estos campos, el step nuevo (`github_app_auth`) y todo el resto del pipeline de milestones se desconecta en silencio.
- [ ] **Decisión de negocio sin resolver** (auditoría §9.4): `harness_simulate_handshake`/`harness_open_landing` bypasean el handshake nativo completo y están expuestos en builds de producción (el Harness ya no respeta `dev_mode`). No es parte del scope de GitHub App, pero quedó marcado como hallazgo de seguridad que alguien con visibilidad de producto tiene que resolver.

---

## 6. Archivos que hacen falta para seguir (no están en esta sesión todavía)

Para poder implementar §5.3 con el mismo nivel de precisión que los fixes ya hechos (leer código real, no adivinar), la próxima sesión necesita:

- `discovery.js` — implementación real del `OnboardingFlow`, incluida la lógica de `GithubAuthFlow`/`GoogleAuthFlow` que ya usa el campo `service`.
- `discovery.schema.json` — el manifest nuevo (reemplazo de `DISCOVERY_PROTOCOL_MANIFEST`), donde hay que declarar `GITHUB_APP_AUTHORIZED`.
- `background.js` — donde va a vivir el POST/polling del Device Flow.
- El manifest de Cortex (`manifest.json` de la Chrome Extension) — para agregar `host_permissions`.
- `synapse-bridge.js` — para confirmar cómo `ONBOARDING_EVENTS` se sincroniza con lo que declara el registry (sospecha abierta en la auditoría §7, no confirmada).

---

## 7. Scope explícito de la próxima sesión

**Sí incluye:**
- Confirmar y aplicar el diseño del step `github_app_auth` (§5.2).
- Implementar el fix de `Vault.go` v1.1 (§5.1) — bloqueante para lo siguiente.
- Implementar el Device Flow real en Cortex/Discovery (§5.3), con los archivos de §6.
- Revisar si el bug medio de `DISCOVERY_COMPLETE` (§5.4) ya se volvió visible con los fixes de esta sesión, y corregirlo si es necesario.

**No incluye (fuera de scope, no traer a menos que bloquee lo anterior):**
- La decisión de negocio sobre Harness/producción (§5.4, último punto) — es de otro dueño.
- Sincronizar `onboarding_steps.json` con el registry — solo urgente el día que "Cambio 2 de 8" se despliegue, no antes.
- Cualquier trabajo de la app mobile o de Batcave en sí — no entran en juego hasta una fase posterior, confirmado en §3.
