# PROMPT DE IMPLEMENTACIÓN — Cortex + Sentinel v2.0
## SynapseSimulator Integration + Protocol Manifests
### Referencia: BLOOM_SYNAPSE_SIMULATOR_IONPUMP_INTEGRATION_MASTER.md · v2.0

> **CHANGELOG v2.0**
> - Sentinel seed.go: eliminadas `copySynapseSimulatorPage()`, `copyIonPumpProtocol()`, `writeSynapseSimulatorConfig()` — Brain las maneja
> - Sentinel seed.go: único agregado real es el flag `--dev` pasado a `brain profile create`
> - `synapse-simulator.synapse.config.js`: movido de seed a **launch** (`ignition_identity.go`)
> - `synapseSimulatorProtocol.js`: lo copia `discovery_generator.py` de Brain, no Sentinel
> - `synapse-simulator/index.html`: lo copia `synapse_simulator_generator.py` de Brain en `profile create --dev`
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
  │           En --dev: también copia synapse-simulator/index.html e synapseSimulatorProtocol.js
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
      direction: "synapse_simulator_to_background",
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
      direction: "synapse_simulator_to_background",
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
      direction: "synapse_simulator_to_background",
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
          source: "SYNAPSE_SIMULATOR_CONFIG.profileId"
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
      direction: "synapse_simulator_to_background",
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
          source: "SYNAPSE_SIMULATOR_CONFIG.profileId"
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
      direction: "synapse_simulator_to_background",
      channel: "runtime",
      description: "Manually complete the 3-phase handshake",
      payload_template: { command: "host_ready" },
      parameters: []
    },

    // ── Discovery complete ──────────────────────────────────
    {
      id: "discovery_complete",
      type: "event",
      direction: "synapse_simulator_to_background",
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
          source: "SYNAPSE_SIMULATOR_CONFIG.profileId"
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

### 1.2 synapseSimulatorProtocol.js — ubicación correcta

> ⚠️ **Diferencia respecto a v1.0:** Este archivo NO es creado por Sentinel.
> Vive en `brain/core/profile/web/templates/discovery/synapseSimulatorProtocol.js` y
> es copiado por `discovery_generator.py` de Brain junto con los demás assets estáticos.
> Sentinel no interviene.

**Ubicación del template:** `brain/core/profile/web/templates/discovery/synapseSimulatorProtocol.js`

**Quién lo copia:** `discovery_generator.py` → `_copy_static_assets()` → lista `files_to_copy`

**Dónde termina:** `profiles/<uuid>/extension/discovery/synapseSimulatorProtocol.js`

El contenido del manifest (`SYNAPSE_SIMULATOR_PROTOCOL_MANIFEST`) no cambia respecto a v1.0.
Ver `IMPL_PROMPT_BRAIN_IonPump_SynapseSimulator_v2.md` para el contenido completo.

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
        "synapse-simulator.synapse.config.js",
        "discovery/*",
        "landing/*",
        "discovery/index.html",
        "discovery/styles.css",
        "discovery/discovery.js",
        "discovery/synapseSimulatorProtocol.js",
        "landing/index.html",
        "landing/styles.css",
        "landing/landing.js",
        "synapse-simulator/index.html",
        "synapse-simulator/*"
      ]
    }
  ]
}
```

**Cambios respecto al manifest actual:**
- Agrega `"synapse-simulator.synapse.config.js"` — config que Sentinel escribe en **launch**
- Agrega `"synapse-simulator/index.html"` y `"synapse-simulator/*"` — solo existe en dev builds
- Agrega `"discovery/synapseSimulatorProtocol.js"` — nuevo asset en discovery/

> **Nota:** `synapse-simulator/index.html` solo existe en el filesystem de la extensión cuando Brain
> lo copió en `profile create --dev`. En prod la entrada en `web_accessible_resources`
> no causa error si el archivo no existe — Chrome devuelve 404 silenciosamente.

---

### 1.4 synapse-simulator/index.html — el SynapseSimulator UI

El template vive en `brain/core/profile/web/templates/synapse-simulator/index.html`.
Brain lo copia al `extensionDir` en `profile create --dev` vía `synapse_simulator_generator.py`.

**Estructura interna (sin cambios respecto a v1.0):**

```
synapse-simulator/index.html
├── Estilos CSS (inline)
├── ProtocolReader class
│   ├── loadAll()              ← descubre manifests en self.*
│   ├── resolvePayload()       ← resuelve variables en templates
│   └── _resolveAutoSource()   ← lee paths como "SYNAPSE_SIMULATOR_CONFIG.profileId"
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
  sendResponse({ synapse_simulator_ack: true });
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
- NO abrir un segundo `chrome.runtime.connectNative()` en el SynapseSimulator
- NO agregar lógica de negocio al SynapseSimulator
- NO modificar el comportamiento del Service Worker

---

## Parte 2 — Sentinel

### 2.1 seed.go — único cambio real: flag --dev

> ⚠️ **Diferencia crítica respecto a v1.0:** Sentinel NO implementa `writeSynapseSimulatorConfig()`,
> `copySynapseSimulatorPage()` ni `copyIonPumpProtocol()`. Esas funciones estaban arquitecturalmente
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
        cmd.Flags().BoolVar(&devMode, "dev", false, "Enable dev mode: deploys SynapseSimulator UI to extension")

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

### 2.2 ignition_identity.go — synapse-simulator.synapse.config.js en launch

> `synapse-simulator.synapse.config.js` NO se escribe en seed. Se escribe en **launch**, cuando
> ya existe el `launch_id`. Esto sigue el mismo patrón que `discovery.synapse.config.js`
> y `landing.synapse.config.js` que Sentinel ya escribe en `prepareSessionFiles()`.

Agregar en `ignition_identity.go::prepareSessionFiles()`:

```go
// Solo si el perfil tiene dev_mode activo
// La forma de detectar dev_mode puede ser:
// - Flag en ignition_spec.json escrito por seed
// - Variable de entorno BLOOM_DEV_MODE=true
// - Presencia del archivo synapse-simulator/index.html en extensionDir

func writeSynapseSimulatorConfig(profileID, launchID, profileAlias, extensionDir string) error {
    // Solo activo si extensionDir/synapse-simulator/index.html existe
    // (garantiza que solo corre en perfiles creados con --dev)
    synapseSimulatorPage := filepath.Join(extensionDir, "synapse-simulator", "index.html")
    if _, err := os.Stat(synapseSimulatorPage); os.IsNotExist(err) {
        return nil  // no-op: no es un perfil dev
    }

    config := fmt.Sprintf(`// synapse-simulator.synapse.config.js — generado por Sentinel en launch
// No editar manualmente

self.SYNAPSE_SIMULATOR_CONFIG = {
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

    configPath := filepath.Join(extensionDir, "synapse-simulator.synapse.config.js")
    return os.WriteFile(configPath, []byte(config), 0644)
}
```

**Dónde llamarlo en `prepareSessionFiles()`:**

```go
// Existente:
if err := writeDiscoveryConfig(...); err != nil { ... }
if err := writeLandingConfig(...); err != nil { ... }

// NUEVO — agregar después:
if err := writeSynapseSimulatorConfig(profileID, launchID, profileAlias, extDir); err != nil {
    // No fatal — el synapse-simulator simplemente no tendrá config
    c.Logger.Warning("[LAUNCH] Could not write synapse-simulator config: %v", err)
}
```

---

### 2.3 Re-seed como mecanismo de actualización

Cuando el SynapseSimulator se actualiza (nueva versión del template en Brain):

```bash
sentinel seed <alias> <master> --dev
```

Esto re-ejecuta `brain profile create --dev` que sobrescribe `synapse-simulator/index.html`.
No requiere reinstalar Cortex ni empaquetar un nuevo `.blx`.

---

### 2.4 Verificación post-seed (dev)

Después de `sentinel seed <alias> <master> --dev`, verificar:

```
profiles/<uuid>/extension/
├── discovery/
│   ├── index.html                    ← existente
│   ├── discoveryProtocol.js          ← existente
│   ├── synapseSimulatorProtocol.js           ← NUEVO (copiado por Brain/discovery_generator)
│   └── [otros assets existentes]
├── landing/
│   └── [existente]
└── synapse-simulator/
    └── index.html                    ← NUEVO (solo en --dev, copiado por Brain/synapse_simulator_generator)
```

Después de `sentinel launch <alias>` (primer launch post-seed), verificar también:

```
profiles/<uuid>/extension/
├── discovery.synapse.config.js       ← existente (Sentinel, en launch)
├── landing.synapse.config.js         ← existente (Sentinel, en launch)
└── synapse-simulator.synapse.config.js         ← NUEVO (Sentinel, en launch, solo si synapse-simulator/index.html existe)
```

---

## Checklist de implementación — Cortex

- [ ] `DISCOVERY_PROTOCOL_MANIFEST` agregado al final de `templates/discovery/discoveryProtocol.js`
- [ ] 6 mensajes del milestone GitHub presentes en el manifest
- [ ] `synapseSimulatorProtocol.js` creado en `templates/discovery/` (Brain lo copia via discovery_generator)
- [ ] `manifest.json` actualizado: `synapse-simulator.synapse.config.js`, `synapse-simulator/*`, `discovery/synapseSimulatorProtocol.js`
- [ ] `synapse-simulator/index.html` implementado con ProtocolReader y UI dinámica
- [ ] SynapseSimulator dispatcher diferencia `channel: "runtime"` vs `channel: "tabs"`
- [ ] SynapseSimulator listener es pasivo — no interfiere con routing de background.js

## Checklist de implementación — Sentinel

- [ ] Flag `--dev` agregado al comando `seed` en `seed.go`
- [ ] `HandleSeed()` actualizado para recibir y pasar `devMode` a `brain profile create`
- [ ] `writeSynapseSimulatorConfig()` implementado en `ignition_identity.go` (en launch, no en seed)
- [ ] `writeSynapseSimulatorConfig()` es no-op si `synapse-simulator/index.html` no existe en extensionDir
- [ ] `prepareSessionFiles()` llama `writeSynapseSimulatorConfig()` (no fatal si falla)
- [ ] NO existe `copySynapseSimulatorPage()` en seed.go — es responsabilidad de Brain
- [ ] NO existe `copyIonPumpProtocol()` en seed.go — es responsabilidad de Brain/discovery_generator

---

*Cortex: implementar en orden: manifest discovery → synapseSimulatorProtocol.js → manifest.json → synapse-simulator/index.html*  
*Sentinel seed: solo agregar --dev flag*  
*Sentinel launch: agregar writeSynapseSimulatorConfig en ignition_identity.go*
