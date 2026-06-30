# Harness — Manual de Uso: Debug del Flujo Onboarding

**Versión del sistema:** Bloom Cortex · launchId `004_d7d6d36b_111324`  
**Perfil activo:** MasterWorker · `d7d6d36b-300e-43db-bdf5-d6bfa40c2a12`  
**Objetivo de sesión:** Completar y validar el flujo `github_auth` hasta `DISCOVERY_COMPLETE`

---

## 1. Contexto — qué es el Harness y para qué existe aquí

El Harness es la herramienta de observabilidad y simulación del protocolo Synapse. **Solo existe en builds dev** — no se despliega en producción.

En esta sesión su rol es doble:

- **Observar** todos los mensajes `chrome.runtime` que fluyen entre la extension, background.js y el host mientras el onboarding corre en Discovery.
- **Simular** eventos del protocolo para avanzar o testear pasos del flujo sin depender del sistema real (clipboard, GitHub, Brain) cuando algo no responde.

El Harness **no modifica** el estado del sistema. Despacha mensajes como si los hubiera enviado otro componente. background.js los recibe y los procesa exactamente igual.

---

## 2. Archivos de contexto a adjuntar en una nueva sesión

Para que un nuevo agente pueda continuar este trabajo sin reconstruir contexto, adjuntar:

| Archivo | Path en disco | Para qué sirve |
|---|---|---|
| `BTIPS_Bloom_Technical_Intent_Package_v5_0.md` | (raíz del proyecto) | Arquitectura completa: Cortex, Synapse, Brain, Harness, Discovery, Landing |
| `INVESTIGACION_Harness_Protocol_Autodiscovery.md` | (raíz del proyecto) | Modelo mental del Harness: ProtocolReader, manifests, canales runtime vs tabs |
| `harness_dead_diagnosis.svg` | (raíz del proyecto) | Diagnóstico de las 4 causas raíz + plan de reparación (ya ejecutado) |
| `discoveryProtocol.js` | `.../extension/discovery/discoveryProtocol.js` | Protocolo real + `DISCOVERY_PROTOCOL_MANIFEST` con los 8 mensajes del flujo |
| `harnessProtocol.js` | `.../extension/harness/harnessProtocol.js` | `HARNESS_PROTOCOL_MANIFEST` con los 10 comandos DOM |
| `harness.synapse.config.js` | `.../extension/harness.synapse.config.js` | Config de sesión activa: profileId, launchId, profileAlias |
| `manifest.json` | `.../extension/manifest.json` | Permisos, web_accessible_resources, content_scripts |
| `index.html` | `.../extension/harness/index.html` | HTML del Harness (ahora sin inline scripts) |
| `harness.js` | `.../extension/harness/harness.js` | JS del Harness: ProtocolReader, Simulator, Logger, ConfigReader |

**Path base de todos los archivos de extensión:**
```
~/Library/BloomNucleus/profiles/d7d6d36b-300e-43db-bdf5-d6bfa40c2a12/extension/
```

---

## 3. Cómo abrir el Harness

La URL del Harness es una página interna de la extensión Chrome:

```
chrome-extension://hpblclepliicmihaplldignhjdggnkdh/harness/index.html
```

**Prerequisitos para que esté vivo:**
- La extensión está cargada en modo developer en `chrome://extensions`
- `bloom-host` está corriendo (el handshake en el log de background.js debe mostrar `HANDSHAKE COMPLETADO`)
- El Harness fue generado con `sentinel seed MasterWorker true --dev` (el directorio `harness/` existe)

**Para abrir dev tools del Harness:**
En `chrome://extensions` → Bloom Nucleus Bridge → **Inspect views** → `harness/index.html`

---

## 4. Layout del Harness — los 3 paneles

```
┌─────────────────────────────────────────────────────────────────┐
│  🌱 Bloom Harness  [DEV]          MasterWorker  ● Connected     │  ← Top bar
├────────────────┬──────────────────────────────┬─────────────────┤
│                │                              │  [Log] [Config] │
│  PROTOCOLS     │  SIMULATE                    │                 │
│                │                              │  Log entries    │
│  ▼ discovery   │  Seleccioná un mensaje       │  en tiempo real │
│    8 mensajes  │  del panel izquierdo         │                 │
│                │  para ver el form            │  Filter logs…   │
│  ▼ ionpump     │  y despacharlo               │                 │
│    10 mensajes │                              │  Config raw     │
│                │                              │  (profileId,    │
│                │                              │   launchId)     │
└────────────────┴──────────────────────────────┴─────────────────┘
```

### Panel izquierdo — Protocols
Lista todos los manifests cargados al boot. Cada protocolo es una sección colapsable con sus mensajes. Al hacer click en un mensaje, se carga en el panel central para simular.

**Lo que vas a ver al abrir:**
- `discovery` — 8 mensajes del flujo onboarding
- `ionpump` — 10 comandos DOM de automatización web
- `landing` — solo aparece si el onboarding ya completó y `landing.synapse.config.js` existe

### Panel central — Simulate
Muestra el mensaje seleccionado con:
- Descripción del mensaje
- Campos editables para parámetros de tipo `string` o `enum`
- Preview del payload JSON que se va a despachar (se actualiza en tiempo real)
- Botón **Send** — despacha via `chrome.runtime.sendMessage`

Los parámetros `type: "auto"` (como `profile_id` y `launch_id`) se resuelven automáticamente desde `HARNESS_CONFIG` y `SYNAPSE_CONFIG` — no aparecen como campos editables.

### Panel derecho — Log / Config
**Tab Log:** stream en tiempo real de todos los mensajes que pasan por el Harness.
- `INFO` — eventos de boot y ciclo de vida del Harness
- `SEND` — mensajes despachados desde Simulate, con payload completo
- `ACK` — respuesta de background.js al mensaje despachado
- `ERR` — errores de dispatch o chrome.runtime

**Tab Config:** muestra el estado de `HARNESS_CONFIG` y `SYNAPSE_CONFIG` cargados. Útil para verificar que `profileId` y `launchId` son los correctos antes de despachar.

---

## 5. El flujo de onboarding — estado actual y objetivo

### Estado actual del perfil
El `discovery.synapse.config.js` fue generado con `step: github_auth`. Eso significa que Sentinel arrancó el onboarding en el paso de autenticación GitHub — la extensión abrió la página de GitHub tokens automáticamente.

### Los pasos del flujo completo

```
welcome
  │
  ▼
github_auth          ← ESTADO ACTUAL
  │  El sistema abre https://github.com/login?return_to=.../tokens/new
  │  El usuario genera el PAT
  │  El clipboard monitor detecta el token
  │
  ▼  [evento: GITHUB_PAT_DETECTED]
github_confirm
  │  El usuario confirma que el token es el correcto
  │
  ▼  [evento: GITHUB_TOKEN_STORED]
api_key
  │  El sistema espera que el usuario genere/pegue la API key de Gemini
  │
  ▼  [evento: API_KEY_REGISTERED]
complete
  │
  ▼  [evento: DISCOVERY_COMPLETE]
→ Landing page activa
```

### Qué produce cada paso como output

| Paso | Input que espera | Evento que emite | Output en sistema |
|---|---|---|---|
| `github_auth` | Usuario genera PAT en GitHub | `GITHUB_PAT_DETECTED` con `token` | background.js inicia almacenamiento del token |
| `github_confirm` | Usuario confirma el token | `GITHUB_TOKEN_STORED` con `token_fingerprint` | Token cifrado en Chrome Storage |
| `api_key` | Usuario pega API key de Gemini | `API_KEY_REGISTERED` con `key_fingerprint` | API key cifrada en Chrome Storage |
| `complete` | Todos los anteriores completados | `DISCOVERY_COMPLETE` | Sentinel genera `landing.synapse.config.js`, Landing page se activa |

---

## 6. Cómo usar el Harness para debuggear el onboarding

### Caso A — Observar el flujo real

1. Abrí el Harness y verificá en **Config** que `launchId` coincide con el de la sesión activa (`004_d7d6d36b_111324`).
2. Abrí la Discovery page en otra tab: `chrome-extension://hpblclepliicmihaplldignhjdggnkdh/discovery/index.html`
3. Interactuá con Discovery normalmente (generá el PAT en GitHub, pegalo, confirmá).
4. Cada evento que background.js procesa aparece en el **Log** del Harness en tiempo real.

**Lo que vas a ver en el Log:**
```
[INFO]  Harness booting…
[INFO]  HARNESS_CONFIG loaded — profile: d7d6d36b-300e-43db-bdf5-d6bfa40c2a12
[INFO]  SYNAPSE_CONFIG loaded — launchId: 004_d7d6d36b_111324
[INFO]  Harness ready.
```
Y luego, cuando Discovery procesa eventos:
```
[INFO]  GITHUB_PAT_DETECTED recibido   ← aparece si el clipboard monitor funciona
[INFO]  GITHUB_TOKEN_STORED            ← aparece cuando el usuario confirma
```

> **Nota importante:** el Harness actualmente solo registra mensajes que `chrome.runtime.onMessage` entrega a su propio listener. Mensajes que background.js consume internamente sin hacer broadcast pueden no aparecer en el Log. Esto es un límite de la arquitectura MV3 — el Harness no es un tap pasivo sobre el bus, es un participante más del broadcast.

### Caso B — Simular un evento para testear background.js sin el flujo real

Útil cuando el clipboard monitor no detecta el PAT, o cuando querés saltar directamente a un paso.

1. En el panel **Protocols**, hacé click en el mensaje que querés simular (ej: `github_pat_detected`).
2. El panel central muestra el form con el campo `token` editable.
3. Ingresá un valor de test: `ghp_simulatedToken123456789` (el default ya está precargado).
4. El preview JSON muestra el payload completo antes de enviarlo.
5. Hacé click en **Send**.
6. El **Log** muestra:
   ```
   [SEND]  → github_pat_detected [runtime] {"event":"GITHUB_PAT_DETECTED","token":"ghp_simulated..."}
   [ACK]   {"status": "ok"} | null
   ```
7. En la **Discovery page** debería avanzar al paso `github_confirm` si background.js procesó el evento correctamente.

**Si el ACK devuelve `null`:** background.js recibió el mensaje pero no retornó respuesta — puede ser comportamiento esperado (fire-and-forget) o puede indicar que el handler no reconoció el evento.

**Si el Log muestra `ERR`:** el mensaje no llegó a background.js. Verificar que el `extension_id` en Config sea el correcto y que el host esté conectado.

### Caso C — Simular el flujo completo de onboarding desde cero

Secuencia de dispatches en orden, uno después del otro, esperando el ACK entre cada uno:

1. `onboarding_navigate` → step: `github_auth` — fuerza la UI al paso correcto
2. `github_pat_detected` → token: `ghp_test123` — simula detección de clipboard
3. `github_token_stored` → token_fingerprint: `ghp_...abc123` — simula confirmación
4. `api_key_registered` → key_fingerprint: `sk-...xyz789` — simula API key
5. `account_registered` — simula registro de cuenta
6. `discovery_complete` — cierra el flujo

---

## 7. Inputs y outputs por componente — mapa completo

### Harness → background.js

**Canal:** `chrome.runtime.sendMessage`  
**Input:** payload JSON del manifest  
**Output esperado:** objeto de respuesta o `null`

```
Harness                    background.js
  │                              │
  │── sendMessage(payload) ──→   │
  │                              │  procesa el evento
  │   ←── response / null ──────│
  │                              │
  [ACK logged en Log panel]
```

### background.js → bloom-host (C++)

**Canal:** Chrome Native Messaging  
**Visible en:** Dev Tools de background.js (`chrome://extensions` → Inspect background)  
**No visible directamente en el Harness** — es una capa por debajo

### bloom-host → Brain (Python)

**Canal:** TCP socket  
**Visible en:** logs de Sentinel/Brain en terminal  
**No visible en el Harness** — es infraestructura local

### Discovery page → background.js

**Canal:** `chrome.runtime.sendMessage` desde discovery.js  
**Visible en:** Log del Harness (si background.js hace broadcast) + Dev Tools de Discovery

---

## 8. Qué mirar en cada Dev Tools según el problema

| Síntoma | Dónde mirar | Qué buscar |
|---|---|---|
| Harness no carga protocolos | Dev Tools del Harness → Console | Errores de carga de scripts, `[ProtocolReader] Loaded 0 protocol(s)` |
| Dispatch no tiene ACK | Dev Tools del Harness → Log | `ERR: chrome.runtime.lastError` |
| Discovery no avanza al siguiente paso | Dev Tools de background.js → Console | Handler del evento, posibles errores de validación |
| Handshake no completa | Dev Tools de background.js → Console | `[HANDSHAKE]` logs, `host_ready` recibido o no |
| Token no se almacena | Dev Tools de background.js → Console | Logs de Chrome Storage, Vault operations |

**Para abrir Dev Tools de background.js:**
`chrome://extensions` → Bloom Nucleus Bridge → **Inspect views: background page (service_worker)**

---

## 9. Estado del sistema al cierre de esta sesión

### Qué se reparó en esta sesión
1. **CSP violation:** el JS inline del Harness fue extraído a `harness/harness.js` — Chrome MV3 bloquea inline scripts.
2. **discoveryProtocol.js nunca se cargaba:** el HTML no tenía el `<script src>` para ese archivo.
3. **Timing del boot:** el boot ahora es `async` y espera cada script con `loadScriptOptional()` antes de llamar `Harness.init()`.
4. **Landing condicional:** `landing.synapse.config.js` y `landing/landingProtocol.js` se cargan solo si existen — el Harness funciona en cualquier etapa del onboarding.

### Archivos modificados
- `harness/index.html` — solo tiene `<script src="harness.js"></script>`, sin inline JS
- `harness/harness.js` — archivo nuevo con todo el JS extraído + boot async con carga condicional

### Próximo objetivo de sesión
Completar el flujo `github_auth` → `DISCOVERY_COMPLETE` usando el Harness para observar y validar que cada evento es procesado correctamente por background.js y que el estado persiste en Chrome Storage.

El BTIP de implementación del flag `--dev` en el ciclo `sentinel seed` sigue pendiente — actualmente el Harness se genera manualmente.
