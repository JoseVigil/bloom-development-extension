# PROMPT DE IMPLEMENTACIÓN — Cortex + Sentinel
## Harness Integration + Protocol Manifests
### Referencia: BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md · v1.0

---

## Contexto para el implementador

Este prompt cubre los cambios en **Cortex** (extensión Chrome) y **Sentinel** (seed orchestrator) para soportar Harness e IonPump en el milestone GitHub Onboarding.

**Principio rector:** Cortex es stateless y pasivo. Los cambios son mínimos: agregar manifests de protocolo al final de archivos existentes y actualizar `manifest.json`. Sentinel agrega la copia del Harness al seed. Nada más.

**Documentos de referencia:**
- `BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md` — arquitectura completa
- `INVESTIGACION_Harness_Protocol_Autodiscovery.md` — fuente de verdad del Harness
- `SYNAPSE_HARNESS_PROTOCOL.md` — insights de implementación (no es fuente de verdad)

---

## Parte 1 — Cortex

### 1.1 Cambios en discoveryProtocol.js

**Agregar al FINAL del archivo.** No modificar nada de la lógica existente.

El manifest es autodescriptivo: describe los mensajes que el protocolo ya maneja. El Harness lo lee para generar su UI dinámica.

```javascript
// ============================================================
// DISCOVERY_PROTOCOL_MANIFEST
// Agrega al final de discoveryProtocol.js — no modifica lógica
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
          source: "HARNESS_CONFIG.profileId"     // resuelto automáticamente
        },
        {
          name: "launch_id",
          type: "auto",
          variable: "$LAUNCH_ID",
          source: "SYNAPSE_CONFIG.launchId"      // resuelto automáticamente
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
      payload_template: {
        command: "host_ready"
      },
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

  // Eventos que el Harness observa (los muestra en el Feed cuando los recibe)
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

### 1.2 Crear harnessProtocol.js

Archivo nuevo en `extension/`. Expone `HARNESS_PROTOCOL_MANIFEST` en `self.*`.

Ver contenido completo en: `IMPL_PROMPT_BRAIN_IonPump_Harness.md` sección 2.2

El archivo es copiado por Brain/Sentinel en seed. No editar manualmente en producción.

**Ubicación:** `extension/harness/harnessProtocol.js`

**Regla:** los `options` del parámetro `site` se actualizan cuando se agrega un nuevo ion site. El Harness refleja el cambio automáticamente sin modificar su código.

---

### 1.3 Actualización de manifest.json

Agregar a `web_accessible_resources`:

```json
{
  "web_accessible_resources": [
    {
      "matches": ["<all_urls>"],
      "resources": [
        "protocols/discovery.schema.json",
        "protocols/landing.schema.json",
        "protocols/harness.schema.json",
        "discovery.synapse.config.js",
        "landing.synapse.config.js",
        "harness.synapse.config.js",
        "discovery/*",
        "landing/*",
        "discovery/index.html",
        "discovery/styles.css",
        "discovery/discovery.js",
        "discovery/discoveryProtocol.js",
        "landing/index.html",
        "landing/styles.css",
        "landing/landing.js",
        "harness/index.html",
        "harness/harnessProtocol.js",
        "harness/*"
      ]
    }
  ]
}
```

**Cambios respecto al manifest actual:**
- Agrega `"harness.synapse.config.js"` — config que Sentinel escribe
- Agrega `"harness/index.html"` — ya estaba pero confirmar
- Agrega `"harnessProtocol.js"` — NUEVO
- Agrega `"harness/*"` — para recursos futuros del Harness

**Nota:** `harness/index.html` solo existe en el filesystem de la extensión cuando Sentinel lo copió (builds de dev). En prod, la entrada en `web_accessible_resources` no causa error si el archivo no existe — Chrome simplemente devuelve 404.

---

### 1.4 harness/index.html — el Harness UI

El archivo vive en `brain/core/profile/web/templates/harness/index.html` y Sentinel lo copia al directorio de la extensión en seed.

El Harness es completamente autocontenido: un solo archivo HTML+CSS+JS. No tiene dependencias externas.

**Estructura interna del Harness:**

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
// Observador pasivo — NO interfiere con el routing de background.js
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

**Importante:** el Harness registra su propio `onMessage` listener. Esto es seguro porque `background.js` no se modifica — el listener del Harness es adicional, no reemplaza nada. Chrome entrega el mensaje a todos los listeners registrados.

---

### 1.5 Reglas para Cortex — qué NO se hace

- NO modificar `discovery.js`
- NO modificar `discoveryProtocol.js` excepto agregar el manifest al final
- NO modificar `content.js`
- NO modificar `background.js` (excepto el fix de URL que ya estaba pendiente)
- NO abrir un segundo `chrome.runtime.connectNative()` en el Harness
- NO agregar lógica de negocio al Harness
- NO modificar el comportamiento del Service Worker

---

## Parte 2 — Sentinel

### 2.1 seed.go — agregar writeHarnessConfig()

Sentinel ya escribe `discovery.synapse.config.js` y `landing.synapse.config.js` en seed. Agregar el mismo patrón para el Harness.

```go
// sentinel/internal/seed/seed.go

// NUEVO: Agrega junto a writeDiscoveryConfig() y writeLandingConfig()

func writeHarnessConfig(profileID, launchID, profileAlias, extensionDir string) error {
    config := fmt.Sprintf(`
// harness.synapse.config.js — generado por Sentinel en seed
// No editar manualmente

self.HARNESS_CONFIG = {
  profileId: %q,
  launchId:  %q,
  profileAlias: %q,
  generatedAt: %q
};
`,
        profileID,
        launchID,
        profileAlias,
        time.Now().UTC().Format(time.RFC3339),
    )

    configPath := filepath.Join(extensionDir, "harness.synapse.config.js")
    return os.WriteFile(configPath, []byte(strings.TrimSpace(config)), 0644)
}

func copyHarnessPage(brainTemplatesDir, extensionDir string) error {
    // Solo en modo dev. En prod, no copiar.
    // La detección de modo dev puede ser un flag del seed command o
    // una variable de entorno BLOOM_DEV_MODE=true.
    
    if !isDevMode() {
        return nil  // no-op en prod
    }

    src := filepath.Join(brainTemplatesDir, "harness", "index.html")
    if _, err := os.Stat(src); os.IsNotExist(err) {
        // El template no existe — no es un error en prod
        return nil
    }

    harnessDir := filepath.Join(extensionDir, "harness")
    if err := os.MkdirAll(harnessDir, 0755); err != nil {
        return fmt.Errorf("creating harness dir: %w", err)
    }

    dst := filepath.Join(harnessDir, "index.html")
    return copyFile(src, dst)
}

func copyIonPumpProtocol(brainTemplatesDir, extensionDir string) error {
    // Copia harnessProtocol.js al directorio raíz de la extensión.
    // Siempre se copia (dev y prod) — es parte del runtime de Cortex.
    
    src := filepath.Join(brainTemplatesDir, "harnessProtocol.js")
    if _, err := os.Stat(src); os.IsNotExist(err) {
        return fmt.Errorf("harnessProtocol.js not found in Brain templates: %s", src)
    }
    
    dst := filepath.Join(extensionDir, "harnessProtocol.js")
    return copyFile(src, dst)
}
```

**Dónde llamar estas funciones:**

```go
func RunSeed(cfg SeedConfig) error {
    // ... lógica existente de seed ...

    // Existente:
    if err := writeDiscoveryConfig(cfg.ProfileID, cfg.LaunchID, cfg.ExtensionDir); err != nil {
        return fmt.Errorf("writing discovery config: %w", err)
    }

    // NUEVOS — agregar después de writeDiscoveryConfig:
    if err := writeHarnessConfig(cfg.ProfileID, cfg.LaunchID, cfg.ProfileAlias, cfg.ExtensionDir); err != nil {
        return fmt.Errorf("writing harness config: %w", err)
    }
    if err := copyHarnessPage(cfg.BrainTemplatesDir, cfg.ExtensionDir); err != nil {
        return fmt.Errorf("copying harness page: %w", err)
    }
    if err := copyIonPumpProtocol(cfg.BrainTemplatesDir, cfg.ExtensionDir); err != nil {
        return fmt.Errorf("copying ionpump protocol: %w", err)
    }

    // ... resto de la lógica existente ...
}
```

---

### 2.2 Re-seed como mecanismo de actualización

Cuando el Harness se actualiza (nueva versión del template en Brain), el developer ejecuta:

```bash
sentinel seed --profile-id <id> --reseed
```

Esto sobrescribe:
- `harness/index.html` → nueva versión del Harness
- `harness.synapse.config.js` → regenerado con timestamps actualizados
- `harnessProtocol.js` → actualizado si cambió

No requiere reinstalar Cortex. No requiere empaquetar un nuevo `.blx`.

---

### 2.3 Verificación post-seed

Después del seed, verificar que existen:

```
{extension_dir}/
├── discovery.synapse.config.js   ← existente
├── landing.synapse.config.js     ← existente
├── harness.synapse.config.js     ← NUEVO (siempre)
├── harnessProtocol.js           ← NUEVO (siempre)
└── harness/
    └── index.html                ← NUEVO (solo en dev)
```

El Sentinel puede agregar estas verificaciones a su output de seed:

```
✓ Discovery config written
✓ Landing config written
✓ Harness config written
✓ IonPump protocol copied
✓ Harness page copied (dev mode)
```

---

## Checklist de implementación — Cortex

- [ ] `DISCOVERY_PROTOCOL_MANIFEST` agregado al final de `discoveryProtocol.js`
- [ ] 6 mensajes del milestone GitHub presentes en el manifest
- [ ] `harnessProtocol.js` creado con `HARNESS_PROTOCOL_MANIFEST`
- [ ] `manifest.json` actualizado: `harness.synapse.config.js`, `harness/*`, `harnessProtocol.js`
- [ ] `harness/index.html` implementado con ProtocolReader y UI dinámica
- [ ] Harness dispatcher diferencia `channel: "runtime"` vs `channel: "tabs"`
- [ ] Harness listener es pasivo — no interfiere con routing de background.js
- [ ] `LANDING_PROTOCOL_MANIFEST` pendiente (no bloqueante para milestone GitHub)

## Checklist de implementación — Sentinel

- [ ] `writeHarnessConfig()` implementado en seed.go
- [ ] `copyHarnessPage()` implementado — no-op en prod
- [ ] `copyIonPumpProtocol()` implementado — siempre activo
- [ ] `RunSeed()` llama las tres funciones nuevas
- [ ] Output de seed muestra confirmación de archivos copiados
- [ ] Re-seed (`--reseed`) sobrescribe harness/index.html correctamente
- [ ] `isDevMode()` tiene lógica clara (flag o env var) — no ambiguo

---

*Este prompt referencia: BLOOM_HARNESS_IONPUMP_INTEGRATION_MASTER.md*
*Cortex: implementar en orden: manifest discovery → manifest ionpump → manifest.json → harness/index.html*
*Sentinel: implementar writeHarnessConfig → copyHarnessPage → copyIonPumpProtocol → integrar en RunSeed*
