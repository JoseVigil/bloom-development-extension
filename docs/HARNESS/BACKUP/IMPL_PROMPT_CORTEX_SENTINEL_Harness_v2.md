# PROMPT DE IMPLEMENTACIÓN — Cortex + Sentinel v2.0
## Harness Integration + Protocol Manifests
### Referencia: BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md · v2.0

> **CHANGELOG v2.0**
> - Sentinel seed.go: eliminadas `copyHarnessPage()`, `copyIonPumpProtocol()`, `writeHarnessConfig()` — Brain las maneja
> - Sentinel seed.go: único agregado real es el flag `--dev` pasado a `brain profile create`
> - `harness.synapse.config.js`: movido de seed a **launch** (`ignition_identity.go`)
> - `ionpump_protocol.js`: lo copia `discovery_generator.py` de Brain, no Sentinel
> - `harness/index.html`: lo copia `harness_generator.py` de Brain en `profile create --dev`
> - Cortex: sin cambios respecto a v1.0

---

## Contexto para el implementador

Este prompt cubre los cambios en **Cortex** (extensión Chrome) y **Sentinel** (seed orchestrator).

**Principio rector (actualizado):** Sentinel no toca el `extensionDir` del perfil después de llamar a
`brain profile create`. Brain es el único escritor del `extensionDir`. Sentinel solo orquesta
el seed y pasa flags.

**El flujo real de seed (de seed.go verificado):**
```
sentinel seed <alias> <master> [--dev]
  │
  ├── 1. Extrae .blx → bin/extension/ (TEMPORAL)
  │
  ├── 2. Llama: brain profile create <alias> [--dev]
  │       └── Brain crea extension/, genera páginas, copia assets
  │           En --dev: también copia harness/index.html e ionpump_protocol.js
  │
  └── 3. bin/extension/ se borra (defer cleanup en Sentinel)
      — Sentinel no escribe nada en extension/ después de este punto
```

**Documentos de referencia:**
- `seed.go` — implementación real verificada
- `profile_create.py` — flujo verificado de creación de perfil
- `discovery_generator.py` — patrón que Brain usa para copiar assets (v3.0)
- `ignition_identity.go` — donde Sentinel escribe los `*.synapse.config.js` (en launch, no seed)

---

## Parte 1 — Cortex

### 1.1 Cambios en discoveryProtocol.js

**Agregar al FINAL del archivo.** No modificar nada de la lógica existente.

El archivo fuente es `brain/core/profile/web/templates/discovery/discoveryProtocol.js`.
Este es el template — se modifica en el repo de Brain, no en la extensión directamente.

```javascript
// ============================================================
// DISCOVERY_PROTOCOL_MANIFEST
// Agrega al final de discoveryProtocol.js — no modifica lógica existente
// Actualizar cuando se agreguen nuevos mensajes al protocolo
// ============================================================

self.DISCOVERY_PROTOCOL_MANIFEST = {
  version: "1.0.0",
  protocol: "discovery",
  description: "Onboarding flow — GitHub auth, API key detection, account registration",

  messages: [
    // ── Comandos de navegación ──────────────────────────────
    {
      id: "onboarding_navigate",
      type: "command",
      direction: "harness_to_background",
      channel: "runtime",
      description: "Navigate Discovery to a specific onboarding step",
      payload_template: {
        command: "onboarding_navigate",
        payload: { step: "$STEP" }
      },
      parameters: [
        {
          name: "step",
          type: "enum",
          variable: "$STEP",
          options: ["welcome", "github_auth", "github_confirm", "api_key", "complete"]
        }
      ]
    },

    // ── Eventos de GitHub ───────────────────────────────────
    {
      id: "github_pat_detected",
      type: "event",
      direction: "harness_to_background",
      channel: "runtime",
      description: "Simulate clipboard monitor detecting a GitHub PAT",
      payload_template: {
        event: "GITHUB_PAT_DETECTED",
        token: "$TOKEN"
      },
      parameters: [
        {
          name: "token",
          type: "string",
          variable: "$TOKEN",
          default: "ghp_simulatedToken123456789"
        }
      ]
    },
    {
      id: "github_token_stored",
      type: "event",
      direction: "harness_to_background",
      channel: "runtime",
      description: "Simulate user confirming GitHub token in Discovery",
      payload_template: {
        event: "GITHUB_TOKEN_STORED",
        token_fingerprint: "$FINGERPRINT",
        profile_id: "$PROFILE_ID",
        launch_id: "$LAUNCH_ID"
      },
      parameters: [
        {
          name: "token_fingerprint",
          type: "string",
          variable: "$FINGERPRINT",
          default: "ghp_...abc123"
        },
        {
          name: "profile_id",
          type: "auto",
          variable: "$PROFILE_ID",
          source: "HARNESS_CONFIG.profileId"
        },
        {
          name: "launch_id",
          type: "auto",
          variable: "$LAUNCH_ID",
          source: "SYNAPSE_CONFIG.launchId"
        }
      ]
    },
    {
      id: "account_registered",
      type: "event",
      direction: "harness_to_background",
      channel: "runtime",
      description: "Simulate GitHub account registered in Nucleus",
      payload_template: {
        event: "ACCOUNT_REGISTERED",
        service: "github",
        profile_id: "$PROFILE_ID",
        launch_id: "$LAUNCH_ID"
      },
      parameters: [
        {
          name: "profile_id",
          type: "auto",
          variable: "$PROFILE_ID",
          source: "HARNESS_CONFIG.profileId"
        },
        {
          name: "launch_id",
          type: "auto",
          variable: "$LAUNCH_ID",
          source: "SYNAPSE_CONFIG.launchId"
        }
      ]
    },

    // ── Handshake manual ────────────────────────────────────
    {
      id: "host_ready",
      type: "command",
      direction: "harness_to_background",
      channel: "runtime",
      description: "Manually complete the 3-phase handshake",
      payload_template: { command: "host_ready" },
      parameters: []
    },

    // ── Discovery complete ──────────────────────────────────
    {
      id: "discovery_complete",
      type: "event",
      direction: "harness_to_background",
      channel: "runtime",
      description: "Simulate Discovery flow completion",
      payload_template: {
        event: "DISCOVERY_COMPLETE",
        payload: {
          profile_id: "$PROFILE_ID",
          launch_id: "$LAUNCH_ID"
        }
      },
      parameters: [
        {
          name: "profile_id",
          type: "auto",
          variable: "$PROFILE_ID",
          source: "HARNESS_CONFIG.profileId"
        },
        {
          name: "launch_id",
          type: "auto",
          variable: "$LAUNCH_ID",
          source: "SYNAPSE_CONFIG.launchId"
        }
      ]
    }
  ],

  observable_events: [
    "HANDSHAKE_CONFIRMED",
    "API_KEY_REGISTERED",
    "ACCOUNT_REGISTERED",
    "DISCOVERY_COMPLETE",
    "GITHUB_PAT_DETECTED",
    "GITHUB_TOKEN_STORED"
  ]
};
```

---

### 1.2 ionpump_protocol.js — ubicación correcta

> ⚠️ **Diferencia respecto a v1.0:** Este archivo NO es creado por Sentinel.
> Vive en `brain/core/profile/web/templates/discovery/ionpump_protocol.js` y
> es copiado por `discovery_generator.py` de Brain junto con los demás assets estáticos.
> Sentinel no interviene.

**Ubicación del template:** `brain/core/profile/web/templates/discovery/ionpump_protocol.js`

**Quién lo copia:** `discovery_generator.py` → `_copy_static_assets()` → lista `files_to_copy`

**Dónde termina:** `profiles/<uuid>/extension/discovery/ionpump_protocol.js`

El contenido del manifest (`IONPUMP_PROTOCOL_MANIFEST`) no cambia respecto a v1.0.
Ver `IMPL_PROMPT_BRAIN_IonPump_Harness_v2.md` para el contenido completo.

---

### 1.3 Actualización de manifest.json de Cortex

Agregar a `web_accessible_resources` en el `manifest.json` del `.blx`:

```json
{
  "web_accessible_resources": [
    {
      "matches": ["<all_urls>"],
      "resources": [
        "discovery.synapse.config.js",
        "landing.synapse.config.js",
        "harness.synapse.config.js",
        "discovery/*",
        "landing/*",
        "discovery/index.html",
        "discovery/styles.css",
        "discovery/discovery.js",
        "discovery/ionpump_protocol.js",
        "landing/index.html",
        "landing/styles.css",
        "landing/landing.js",
        "harness/index.html",
        "harness/*"
      ]
    }
  ]
}
```

**Cambios respecto al manifest actual:**
- Agrega `"harness.synapse.config.js"` — config que Sentinel escribe en **launch**
- Agrega `"harness/index.html"` y `"harness/*"` — solo existe en dev builds
- Agrega `"discovery/ionpump_protocol.js"` — nuevo asset en discovery/

> **Nota:** `harness/index.html` solo existe en el filesystem de la extensión cuando Brain
> lo copió en `profile create --dev`. En prod la entrada en `web_accessible_resources`
> no causa error si el archivo no existe — Chrome devuelve 404 silenciosamente.

---

### 1.4 harness/index.html — el Harness UI

El template vive en `brain/core/profile/web/templates/harness/index.html`.
Brain lo copia al `extensionDir` en `profile create --dev` vía `harness_generator.py`.

**Estructura interna (sin cambios respecto a v1.0):**

```
harness/index.html
├── Estilos CSS (inline)
├── ProtocolReader class
│   ├── loadAll()              ← descubre manifests en self.*
│   ├── resolvePayload()       ← resuelve variables en templates
│   └── _resolveAutoSource()   ← lee paths como "HARNESS_CONFIG.profileId"
├── Panel: Feed
│   └── chrome.runtime.onMessage listener (pasivo — solo observa)
├── Panel: Simulate
│   └── renderSimulatePanel()  ← genera botones desde manifest dinámicamente
├── Panel: Config
│   ├── Muestra profileId, launchId del config activo
│   ├── Permite override manual de IDs
│   └── Selector de tab (activo cuando hay mensajes channel: "tabs")
└── Panel: Protocols
    └── Visualiza los manifests cargados (para inspección)
```

**El listener del Feed:**
```javascript
// Observador pasivo — NO interfiere con routing de background.js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  addToFeed('received', msg, sender);
  sendResponse({ harness_ack: true });
  return true;
});
```

**El dispatcher (Panel Simulate):**
```javascript
async function dispatchMessage(message, overrides) {
  const payload = reader.resolvePayload(message, overrides);

  if (message.channel === 'runtime') {
    addToFeed('simulated', payload, null);
    const response = await chrome.runtime.sendMessage(payload);
    addToFeed('ack', response, null);
  } else if (message.channel === 'tabs') {
    const tabId = getSelectedTabId();
    if (!tabId) {
      showError('No tab selected. Set active tab in Config panel.');
      return;
    }
    addToFeed('simulated', payload, { tab_id: tabId });
    const response = await chrome.tabs.sendMessage(tabId, payload);
    addToFeed('ack', response, null);
  }
}
```

---

### 1.5 Reglas para Cortex — qué NO se hace

- NO modificar `discovery.js`
- NO modificar `discoveryProtocol.js` excepto agregar el manifest al final
- NO modificar `content.js`
- NO modificar `background.js` (excepto el fix de URL pendiente)
- NO abrir un segundo `chrome.runtime.connectNative()` en el Harness
- NO agregar lógica de negocio al Harness
- NO modificar el comportamiento del Service Worker

---

## Parte 2 — Sentinel

### 2.1 seed.go — único cambio real: flag --dev

> ⚠️ **Diferencia crítica respecto a v1.0:** Sentinel NO implementa `writeHarnessConfig()`,
> `copyHarnessPage()` ni `copyIonPumpProtocol()`. Esas funciones estaban arquitecturalmente
> incorrectas — Sentinel no tiene acceso al `extensionDir` después de que Brain lo crea.
>
> El único cambio en `seed.go` es agregar el flag `--dev` y pasarlo a `brain profile create`.

```go
// sentinel/internal/seed/seed.go
// Agregar flag --dev al comando seed

func init() {
    core.RegisterCommand("IDENTITY", func(c *core.Core) *cobra.Command {
        var devMode bool  // NUEVO

        cmd := &cobra.Command{
            Use:   "seed [alias] [is_master]",
            Short: "Registra una nueva identidad de perfil",
            Args:  cobra.ExactArgs(2),
            Example: `  sentinel seed profile_001 true
  sentinel seed dev_profile false --dev
  sentinel --json seed burner_temp false | jq .`,
            Run: func(cmd *cobra.Command, args []string) {
                alias := args[0]
                isMaster, _ := strconv.ParseBool(args[1])

                uuid, profilePath, err := HandleSeed(c, alias, isMaster, devMode)  // NUEVO: pasar devMode
                // ... resto sin cambios ...
            },
        }

        // NUEVO: flag --dev
        cmd.Flags().BoolVar(&devMode, "dev", false, "Enable dev mode: deploys Harness UI to extension")

        // ... anotaciones existentes ...
        return cmd
    })
}
```

**Modificar `HandleSeed` para pasar `--dev` a Brain:**

```go
func HandleSeed(c *core.Core, alias string, isMaster bool, devMode bool) (string, string, error) {
    // ... lógica existente sin cambios hasta la llamada a brain ...

    // Paso 3: llamada a brain profile create
    args := []string{"--json", "profile", "create", alias}
    if isMaster {
        args = append(args, "--master")
    }
    if devMode {
        args = append(args, "--dev")  // NUEVO: pasa el flag a Brain
    }

    // ... resto sin cambios ...
}
```

Eso es todo el cambio en Sentinel para seed. Brain hace el resto.

---

### 2.2 ignition_identity.go — harness.synapse.config.js en launch

> `harness.synapse.config.js` NO se escribe en seed. Se escribe en **launch**, cuando
> ya existe el `launch_id`. Esto sigue el mismo patrón que `discovery.synapse.config.js`
> y `landing.synapse.config.js` que Sentinel ya escribe en `prepareSessionFiles()`.

Agregar en `ignition_identity.go::prepareSessionFiles()`:

```go
// Solo si el perfil tiene dev_mode activo
// La forma de detectar dev_mode puede ser:
// - Flag en ignition_spec.json escrito por seed
// - Variable de entorno BLOOM_DEV_MODE=true
// - Presencia del archivo harness/index.html en extensionDir

func writeHarnessConfig(profileID, launchID, profileAlias, extensionDir string) error {
    // Solo activo si extensionDir/harness/index.html existe
    // (garantiza que solo corre en perfiles creados con --dev)
    harnessPage := filepath.Join(extensionDir, "harness", "index.html")
    if _, err := os.Stat(harnessPage); os.IsNotExist(err) {
        return nil  // no-op: no es un perfil dev
    }

    config := fmt.Sprintf(`// harness.synapse.config.js — generado por Sentinel en launch
// No editar manualmente

self.HARNESS_CONFIG = {
  profileId: %q,
  launchId:  %q,
  profileAlias: %q,
  generatedAt: %q
};`,
        profileID,
        launchID,
        profileAlias,
        time.Now().UTC().Format(time.RFC3339),
    )

    configPath := filepath.Join(extensionDir, "harness.synapse.config.js")
    return os.WriteFile(configPath, []byte(config), 0644)
}
```

**Dónde llamarlo en `prepareSessionFiles()`:**

```go
// Existente:
if err := writeDiscoveryConfig(...); err != nil { ... }
if err := writeLandingConfig(...); err != nil { ... }

// NUEVO — agregar después:
if err := writeHarnessConfig(profileID, launchID, profileAlias, extDir); err != nil {
    // No fatal — el harness simplemente no tendrá config
    c.Logger.Warning("[LAUNCH] Could not write harness config: %v", err)
}
```

---

### 2.3 Re-seed como mecanismo de actualización

Cuando el Harness se actualiza (nueva versión del template en Brain):

```bash
sentinel seed <alias> <master> --dev
```

Esto re-ejecuta `brain profile create --dev` que sobrescribe `harness/index.html`.
No requiere reinstalar Cortex ni empaquetar un nuevo `.blx`.

---

### 2.4 Verificación post-seed (dev)

Después de `sentinel seed <alias> <master> --dev`, verificar:

```
profiles/<uuid>/extension/
├── discovery/
│   ├── index.html                    ← existente
│   ├── discoveryProtocol.js          ← existente
│   ├── ionpump_protocol.js           ← NUEVO (copiado por Brain/discovery_generator)
│   └── [otros assets existentes]
├── landing/
│   └── [existente]
└── harness/
    └── index.html                    ← NUEVO (solo en --dev, copiado por Brain/harness_generator)
```

Después de `sentinel launch <alias>` (primer launch post-seed), verificar también:

```
profiles/<uuid>/extension/
├── discovery.synapse.config.js       ← existente (Sentinel, en launch)
├── landing.synapse.config.js         ← existente (Sentinel, en launch)
└── harness.synapse.config.js         ← NUEVO (Sentinel, en launch, solo si harness/index.html existe)
```

---

## Checklist de implementación — Cortex

- [ ] `DISCOVERY_PROTOCOL_MANIFEST` agregado al final de `templates/discovery/discoveryProtocol.js`
- [ ] 6 mensajes del milestone GitHub presentes en el manifest
- [ ] `ionpump_protocol.js` creado en `templates/discovery/` (Brain lo copia via discovery_generator)
- [ ] `manifest.json` actualizado: `harness.synapse.config.js`, `harness/*`, `discovery/ionpump_protocol.js`
- [ ] `harness/index.html` implementado con ProtocolReader y UI dinámica
- [ ] Harness dispatcher diferencia `channel: "runtime"` vs `channel: "tabs"`
- [ ] Harness listener es pasivo — no interfiere con routing de background.js

## Checklist de implementación — Sentinel

- [ ] Flag `--dev` agregado al comando `seed` en `seed.go`
- [ ] `HandleSeed()` actualizado para recibir y pasar `devMode` a `brain profile create`
- [ ] `writeHarnessConfig()` implementado en `ignition_identity.go` (en launch, no en seed)
- [ ] `writeHarnessConfig()` es no-op si `harness/index.html` no existe en extensionDir
- [ ] `prepareSessionFiles()` llama `writeHarnessConfig()` (no fatal si falla)
- [ ] NO existe `copyHarnessPage()` en seed.go — es responsabilidad de Brain
- [ ] NO existe `copyIonPumpProtocol()` en seed.go — es responsabilidad de Brain/discovery_generator

---

*Cortex: implementar en orden: manifest discovery → ionpump_protocol.js → manifest.json → harness/index.html*  
*Sentinel seed: solo agregar --dev flag*  
*Sentinel launch: agregar writeHarnessConfig en ignition_identity.go*
