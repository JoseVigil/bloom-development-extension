# Bloom — Harness + IonPump: Fuente de Verdad
## Versión fusionada · 17 de junio 2026
### Supersede a: `HARNESS_SOURCE_OF_TRUTH.md`, `HARNESS_IONPUMP_SOURCE_OF_TRUTH.md`, y todos los documentos que ambos listaban como fuente.

---

## 0. Cómo se construyó este documento

Existían dos documentos de "fuente de verdad" independientes — `HARNESS_SOURCE_OF_TRUTH.md` y `HARNESS_IONPUMP_SOURCE_OF_TRUTH.md` — cada uno autodeclarado como la única referencia vigente, sin que ninguno supiera de la existencia del otro. Compartían ~85% del contenido (vienen de las mismas fuentes v2), pero diferían en puntos concretos de arquitectura, y en algunos casos cada uno se contradecía a sí mismo.

Durante esta fusión se aportó el código real de `harness_generator.py` y `harness.js`. Eso cambió el resultado: ninguno de los dos documentos anteriores describe correctamente el estado actual del sistema en al menos tres puntos. La jerarquía de autoridad usada acá es:

1. **Código real** (`harness_generator.py`, `harness.js`, aportados en esta sesión) — máxima autoridad.
2. **`HARNESS_IONPUMP_SOURCE_OF_TRUTH.md`** — su metodología ya priorizaba código real verificado sobre specs, y tenía mayor profundidad en IonPump (capa IPC, formato `.ion`, Metamorph). Se usa como base para esas secciones.
3. **`HARNESS_SOURCE_OF_TRUTH.md`** — tenía mejor cobertura operativa (manual de debug, estructura de checklist por componente) y un índice más completo. Se usa como base para esas secciones.
4. Donde ambos coincidían, no hubo nada que resolver.

### 0.1 Contradicciones entre los dos documentos y cómo se resolvieron

| # | Contradicción | Qué decía cada uno | Resolución |
|---|---|---|---|
| 1 | `dev_mode` y el deploy del Harness | Ambos: "no-op completo si `dev_mode=False`", "no existe en prod" | **Código real lo contradice a los dos.** Ver §0.2 — es el hallazgo más importante de esta fusión. |
| 2 | Archivos que copia `harness_generator.py` | IONPUMP-SOT decía 4 (`index.html`, `harness.js`, `harnessProtocol.js`, `ion.manifest.json`), citando "código real" de una sesión anterior. SOURCE_OF_TRUTH mostraba un snippet con solo 1 (`index.html`), pero su propio texto narrativo asumía que `harness.js` también existía. | **Código real (esta sesión): son 3** — `index.html`, `harness.js`, `harnessProtocol.js`. Ninguno de los dos documentos tenía razón. `ion.manifest.json` no se copia a `extension/harness/` con el código actual; la pregunta abierta que IONPUMP-SOT dejaba pendiente sobre ese archivo queda resuelta: no aplica a esta versión del generador. |
| 3 | Ubicación de `harnessProtocol.js` | IONPUMP-SOT: doble ubicación por diseño, origen canónico en `templates/harness/`. SOURCE_OF_TRUTH: única ubicación en `templates/discovery/`, sin copia en `harness/`. | El boot real de `harness.js` (línea 631) carga `harnessProtocol.js` con ruta relativa local (sin `../`), y `harness_generator.py` real lo incluye en su propio `files_to_copy`. Esto **confirma que existe una copia local en `harness/`**, consistente con el modelo de IONPUMP-SOT. No hay evidencia en esta sesión sobre si `discovery/` tiene o no su propia copia — se preserva esa parte como no verificada (§18). |
| 4 | Estructura del manifest `HARNESS_PROTOCOL_MANIFEST` | IONPUMP-SOT: un solo array `messages` mezclando canales `runtime` y `tabs`. SOURCE_OF_TRUTH: dos arrays separados, `messages` (runtime) y `tab_messages` (tabs). | El `ProtocolReader.discover()` real (`harness.js` línea 76) solo itera `manifest.messages` — nunca lee `tab_messages`. **Con la estructura de SOURCE_OF_TRUTH, los mensajes de canal `tabs` nunca aparecerían en el panel Protocols.** Se adopta el formato de array único de IONPUMP-SOT como el correcto. |
| 5 | Dispatcher de canal `tabs` | Ambos documentan un dispatcher que diferencia `runtime` de `tabs`, con `chrome.tabs.sendMessage` implementado. | El `Simulator.send()` real solo implementa `channel === 'runtime'`. El `else` loguea `Unknown channel` como error. **Esto no es una contradicción entre los documentos — es algo que los dos documentaron como ya resuelto y en realidad no lo está.** Ver §18.1. |

### 0.2 El hallazgo que invalida un principio "no negociable" de ambos documentos

El docstring real de `generate_harness_page()` dice textualmente que el parámetro `dev_mode` **"se mantiene por compatibilidad pero ya no suprime el deploy"**, y que el Harness **"siempre se despliega igual que discovery y landing"**. Hay un `TODO` confirmando que es una decisión consciente, no un bug: *"dev_mode puede usarse a futuro para assets o config adicional de desarrollo. Por ahora harness siempre se despliega igual que discovery y landing."*

Esto contradice directamente el principio que ambos documentos previos trataban como fundacional: que el Harness existe exclusivamente en builds dev "por construcción", y que `harness_generator.py` es no-op cuando `dev_mode=False`. Con el código actual, **el Harness se copia a `extension/harness/` en todos los perfiles, dev o no**. Las implicancias en cascada de esto (¿se sigue escribiendo `harness.synapse.config.js` en producción? ¿la URL `harness/index.html` queda accesible en perfiles de usuarios finales?) se documentan en §10 y §18 — no se inventan respuestas donde no hay evidencia.

---

## 1. Qué es el Harness y qué es IonPump

### Harness

Herramienta de **observabilidad y simulación** del protocolo Synapse. Sus dos roles: **observar** los mensajes `chrome.runtime` que fluyen entre la extensión, `background.js` y el host durante el onboarding; y **simular** eventos del protocolo para avanzar o testear pasos sin depender del sistema real (clipboard, GitHub, Brain).

El Harness no modifica el estado del sistema. Despacha mensajes como si los hubiera enviado otro componente; `background.js` los procesa exactamente igual que a un mensaje real.

### IonPump

**Runtime de automatización web** que vive dentro de Brain. Traduce recipes declarativos `.ion` por sitio en comandos Synapse atómicos que `content.js` ya sabe ejecutar. No es un módulo CLI de usuario — es un runtime interno invocado por el pipeline de intents (`IntentExecutor`, integración aún DEFERRED, ver §5.9).

### Relación entre ambos

Problemas ortogonales que comparten infraestructura: ambos necesitan que Cortex exponga manifests de protocolo legibles en runtime. IonPump produce `HARNESS_PROTOCOL_MANIFEST`; el Harness lo consume. Relación unidireccional.

> **Regla de oro:** la fuente de verdad es el protocolo. El Harness la lee. IonPump la alimenta. Nadie la duplica.

---

## 2. Principios de diseño

**El Harness no tiene protocolo propio.** Lee los protocolos existentes en runtime vía `ProtocolReader`. Es un lector, no un duplicador. Agregar un mensaje al protocolo actualiza el Harness automáticamente — no hay paso 2.

**El manifest es el contrato.** Cada protocolo expone un `*_PROTOCOL_MANIFEST` autodescriptivo, agregado al **final** de su archivo existente, sin tocar la lógica existente.

**Los canales son tipos, no hardcoding** — *en el diseño*. El manifest diferencia `runtime` de `tabs`. **Nota de implementación real:** el dispatcher actual del Harness solo ejecuta `runtime`; `tabs` está modelado en el contrato pero no implementado en `Simulator.send()` (§18.1).

**~~Dev/prod por construcción, no por flags~~ — ya no es así.** Este principio decía que el Harness existe en dev porque Brain lo genera en seed con `--dev`, y no existe en prod porque Brain no lo genera. El código real de `harness_generator.py` ya no respeta esto: despliega los assets del Harness siempre, independientemente de `dev_mode`. Se preserva el principio acá tachado porque describe la *intención* de diseño original — el comportamiento actual diverge de ella, y eso es exactamente lo que hay que decidir si corregir o documentar como cambio de rumbo (§18.2).

**Re-seed como mecanismo de actualización.** Cambios en el Harness se aplican con `sentinel seed <alias> <master> --dev`. No requiere empaquetar ni distribuir Cortex.

**Brain es el único escritor del `extensionDir`.** Sentinel orquesta el seed y pasa flags, pero no toca `extensionDir` después de invocar a `brain profile create`.

---

## 3. Mapa de responsabilidades por componente

| Componente | Rol |
|---|---|
| **Brain** | Aloja `IonPumpManager` (runtime singleton). Expone admin CLI. Genera los assets del Harness vía `harness_generator.py` — **siempre**, no solo en `--dev` (ver §0.2). Genera `discovery/` vía `discovery_generator.py` (incluye su propia copia de `harnessProtocol.js`). Único escritor del `extensionDir` durante el seed. |
| **Sentinel** | Pasa el flag `--dev` a `brain profile create` en seed (su efecto real sobre el Harness está en duda, ver §0.2). Escribe `harness.synapse.config.js` en **launch** (no en seed), condicionado a que `harness/index.html` exista — condición que ahora se cumple casi siempre, dado que Brain ya no lo gatea por `dev_mode`. No toca `extensionDir` después de llamar a Brain. |
| **Cortex** | Aloja `harness/index.html`, `harness/harness.js`, `harness/harnessProtocol.js` (copiados por Brain). Expone `DISCOVERY_PROTOCOL_MANIFEST` e `HARNESS_PROTOCOL_MANIFEST` en `self.*`. `content.js` ejecuta comandos DOM de IonPump. No modifica nada más. |
| **Metamorph** | Único escritor de `ionsites/`. Inspecciona y reconcilia `.ion` recipes. No participa del runtime IonPump ni del Event Bus. |
| **Harness** | Lee manifests de protocolo en runtime. Genera UI dinámica. Observa y simula. No tiene tabla de mensajes propia, no abre canales propios. |

---

## 4. Arquitectura del Harness

### 4.1 Dónde vive y quién lo genera

El Harness **no vive en el `.blx` de Cortex**. Brain lo despliega vía `harness_generator.py`, siguiendo el mismo patrón que `discovery_generator.py`: solo copia assets estáticos, no inyecta datos de runtime, no genera configs.

```
brain/core/profile/web/
├── templates/harness/
│   ├── index.html            ← sin scripts inline (fix CSP)
│   ├── harness.js             ← todo el JS, boot async
│   └── harnessProtocol.js    ← copia local del manifest IonPump para el Harness
└── harness_generator.py

profiles/<uuid>/extension/harness/
├── index.html
├── harness.js
└── harnessProtocol.js
```

**Código real de `harness_generator.py`** (verificado en esta sesión, reemplaza cualquier versión anterior citada en los documentos fuente):

```python
def generate_harness_page(target_ext_dir: Path, profile_data: Dict[str, Any], dev_mode: bool = False) -> None:
    """
    Siempre despliega los assets estáticos de harness/ al extensionDir/harness/.
    El parámetro dev_mode se mantiene por compatibilidad pero ya no suprime el deploy.
    Patrón: idéntico a generate_discovery_page() — solo copia assets estáticos.
    La configuración (harness.synapse.config.js) es responsabilidad de Sentinel en el launch.
    """
    harness_dir = target_ext_dir / "harness"
    harness_dir.mkdir(parents=True, exist_ok=True)
    _copy_static_assets(harness_dir)


def _copy_static_assets(harness_dir: Path) -> None:
    template_dir = Path(__file__).parent / "templates" / "harness"
    files_to_copy = ["index.html", "harness.js", "harnessProtocol.js"]
    for file_name in files_to_copy:
        source = template_dir / file_name
        if source.exists():
            shutil.copy2(source, harness_dir / file_name)
```

No hay rama `if not dev_mode: return`. El parámetro se recibe pero no condiciona nada en el cuerpo de la función.

### 4.2 Los 3 paneles del Harness

```
┌─────────────────────────────────────────────────────────────────┐
│  🌱 Bloom Harness  [DEV]          MasterWorker  ● Connected     │  ← Top bar
├────────────────┬──────────────────────────────┬─────────────────┤
│                │                              │  [Log] [Config] │
│  PROTOCOLS     │  SIMULATE                    │                 │
│  ▼ discovery   │  Seleccioná un mensaje       │  Log entries    │
│    N mensajes  │  del panel izquierdo         │  en tiempo real │
│  ▼ ionpump     │  para ver el form y          │  Filter logs…   │
│    N mensajes  │  despacharlo                 │  Config raw     │
└────────────────┴──────────────────────────────┴─────────────────┘
```

**Protocols (izquierda):** lista los manifests cargados al boot, sección colapsable por protocolo. `landing` solo aparece si el onboarding ya completó.

**Simulate (centro):** mensaje seleccionado con descripción, campos editables para parámetros `string`/`enum`, preview del payload JSON, botón **Send**. Los parámetros `type: "auto"` se resuelven desde `HARNESS_CONFIG`/`SYNAPSE_CONFIG` y no son editables.

**Log / Config (derecha):** stream en tiempo real (`INFO`, `SEND`, `ACK`, `ERR`) y estado de la config cargada.

### 4.3 Cómo abrir el Harness

```
chrome-extension://<extension_id>/harness/index.html
```

Prerrequisitos: extensión en modo developer, `bloom-host` corriendo (log de `background.js` con `HANDSHAKE COMPLETADO`), perfil existente. **Nota:** dado §0.2, ya no se puede asumir que esto requiera haber seedeado con `--dev` — confirmar contra el comportamiento real antes de documentar esto como prerrequisito estricto.

Dev Tools del Harness: `chrome://extensions` → la extensión → **Inspect views** → `harness/index.html`.

### 4.4 `ProtocolReader` — el motor del Harness (código real)

```javascript
const ProtocolReader = {
  manifests: [],
  discover() {
    const candidates = ['DISCOVERY_PROTOCOL_MANIFEST', 'LANDING_PROTOCOL_MANIFEST', 'HARNESS_PROTOCOL_MANIFEST'];
    this.manifests = [];
    for (const key of candidates) {
      const manifest = (typeof self !== 'undefined' && self[key]) || (typeof window !== 'undefined' && window[key]);
      if (manifest) this.manifests.push({ key, manifest });
    }
    return this.manifests;
  },
  render() { /* itera this.manifests, y por cada uno itera manifest.messages — NO lee tab_messages */ }
};
```

Implicancia directa: cualquier manifest que separe mensajes `tabs` en un array distinto a `messages` quedaría invisible en el panel Protocols (§0.1 #4).

### 4.5 Dispatcher real — solo canal `runtime`

```javascript
send() {
  const channel = msg.channel || 'runtime';
  if (channel === 'runtime') {
    chrome.runtime.sendMessage(payload, (response) => { /* loggea ACK/ERR */ });
  } else {
    Logger.log('ERR', `Unknown channel: ${channel}`);   // ← 'tabs' cae acá
  }
}
```

El diseño documentado en ambas fuentes anteriores (diferenciar `tabs` con `chrome.tabs.sendMessage` y selector de tab activo) **no está implementado**. Es deuda de implementación real, no solo de documentación — ver §18.1.

### 4.6 Boot — orden de carga de scripts (código real)

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  // Siempre presentes (según comentario del código — revisar a la luz de §0.2)
  await loadScriptOptional('../harness.synapse.config.js');
  await loadScriptOptional('../discovery.synapse.config.js');
  await loadScriptOptional('../discovery/discoveryProtocol.js');
  await loadScriptOptional('harnessProtocol.js');        // ← local, mismo directorio que index.html

  // Solo existen post-onboarding
  await loadScriptOptional('../landing.synapse.config.js');
  await loadScriptOptional('../landing/landingProtocol.js');

  Harness.init();
});
```

`loadScriptOptional()` nunca lanza error ante un 404 — resuelve la promesa igual y el Harness arranca con lo que haya disponible. Esto es lo que permite que protocolos opcionales (`landing`) no rompan el boot cuando no existen.

**Nota de coherencia interna del código:** el comentario "Siempre presentes desde seed --dev" en este boot asume el modelo viejo (Harness exclusivo de `--dev`). Con `harness_generator.py` desplegando siempre, ese comentario quedó desactualizado respecto al propio código que lo acompaña — deuda de documentación in-code, no solo de los SOT (§18.4).

### 4.7 El manifest autodescriptivo — formato (adoptado: array único)

```javascript
self.HARNESS_PROTOCOL_MANIFEST = {
  version: "1.0.0",
  protocol: "harness",
  description: "Web automation runtime — ion site control",
  messages: [
    {
      id: "site_ready", type: "event", direction: "content_to_background", channel: "runtime",
      description: "Content script signals site loaded and ready",
      payload_template: { event: "SITE_READY", site: "$SITE", tab_id: "$TAB_ID" },
      parameters: [
        { name: "site", type: "enum", variable: "$SITE", options: ["github.com", "claude.ai", "chatgpt.com", "grok.com"] },
        { name: "tab_id", type: "auto", variable: "$TAB_ID", source: "selectedTabId" }
      ]
    },
    {
      id: "dom_focus", type: "command", direction: "background_to_content", channel: "tabs",
      description: "Focus a DOM element in active ion tab",
      payload_template: { command: "DOM_FOCUS", selector: "$SELECTOR" },
      parameters: [{ name: "selector", type: "string", variable: "$SELECTOR", default: "#login_field" }]
    }
  ]
};
```

Tipos de parámetro: `auto` (se resuelve solo, invisible), `string` (campo editable), `enum` (dropdown). Tipos de canal: `runtime` → `chrome.runtime.sendMessage`; `tabs` → diseñado para `chrome.tabs.sendMessage`, no implementado hoy (§4.5).

### 4.8 Lo que el Harness hace y lo que no hace

| Hace | No hace |
|---|---|
| Observa mensajes `chrome.runtime` pasivamente | Abre su propio Native Messaging port |
| Genera UI dinámica desde manifests | Tiene tabla de mensajes hardcodeada |
| Despacha vía `chrome.runtime.sendMessage` | Despacha vía `chrome.tabs.sendMessage` (modelado, no implementado) |
| Lee `SYNAPSE_CONFIG`/`HARNESS_CONFIG` para resolver `auto` | Modifica el estado de iones |
| Se actualiza con re-seed `--dev` | Requiere rebuild de Cortex para actualizarse |

### 4.9 `manifest.json` — `web_accessible_resources`

```json
{
  "web_accessible_resources": [
    {
      "matches": ["<all_urls>"],
      "resources": [
        "harness/index.html",
        "harness/harness.js",
        "harness/harnessProtocol.js",
        "harness.synapse.config.js",
        "discovery/harnessProtocol.js"
      ]
    }
  ]
}
```

---

## 5. Arquitectura de IonPump

### 5.1 Qué es y qué no es

Runtime de automatización web dentro de Brain. No es CLI de usuario, no es extensión de Cortex, no modifica el protocolo Synapse, no toca `content.js`. Traduce recipes `.ion` a comandos Synapse atómicos que `content.js` ya sabe ejecutar.

### 5.2 Posición en el stack — con capa IPC

Corrección crítica entre el diseño v1 y v2: v1 asumía que `IonPumpManager` podía llamar directamente a `SynapseManager`. Verificado contra código real que eso es arquitectónicamente imposible — `SynapseManager.run_host_loop()` corre en el proceso `bloom-host` (Native Messaging Host invocado por Chrome), mientras IonPump corre en un proceso Brain distinto disparado por un intent. Son procesos de OS diferentes, no comparten memoria. Por eso existe la capa IPC vía TCP localhost.

```
IntentExecutor (Brain)                    [DEFERRED — ver §5.9]
  │  detecta intent_subtype == "web_automation"
  ▼
IonPumpManager (Brain) — runtime singleton
  │  lazy-load del recipe .ion, traduce pasos → SynapseCommand objects (vía IonExecutor)
  ▼
IonPumpIPCClient (Brain) — conecta por TCP a 127.0.0.1:{puerto} leído de run/ipc_{launch_id}.port
  ▼
SynapseIPCServer (Brain-Host process) — escucha solo en 127.0.0.1, rutea vía _action_map
  ▼
SynapseManager (existente, sin cambios en su lógica) — _action_map extendido con handlers DOM_*
  ▼
bloom-host.exe (sin cambios) → content.js en Cortex (sin cambios) — ejecuta acciones DOM
```

### 5.3 Archivos IPC de runtime

```
BloomNucleus/run/ipc_{launch_id}.port    # entero plano = puerto TCP, escrito por SynapseIPCServer al arrancar
                                          # borrado en shutdown (try/finally, incluso ante excepción)
```

`SynapseIPCServer` solo escucha en `127.0.0.1` — nunca en `0.0.0.0`.

### 5.4 Formato `.ion` — YAML

```yaml
# github.com/auth.ion
version: 1.0.0
site: github.com
description: "GitHub PAT authentication flow for Bloom onboarding"

entrypoints:
  on_load: bootstrap
  on_pat_clipboard: handle_pat_detected

variables:
  settings_url: "https://github.com/settings/tokens"

flows:
  bootstrap:
    steps:
      - wait: { selector: "body", timeout: 10s }
      - emit: { event: "SITE_READY", payload: { site: "github.com" } }
  handle_pat_detected:
    requires: ["SITE_READY"]
    steps:
      - emit: { event: "GITHUB_PAT_DETECTED", payload: { token: "$CONTEXT.clipboard_value" } }
      - transition: { to: "await_confirmation" }

error_handlers:
  timeout: { retry: 1, fallback: "emit_error" }
  selector_not_found: { retry: 2, fallback: "emit_error" }
```

**Mapeo de step a comando Synapse:**

| Ion Step | Synapse Command | Parámetros |
|---|---|---|
| `wait` | `DOM_WAIT` | selector, timeout, condition |
| `click` | `DOM_CLICK` | selector |
| `type` | `DOM_TYPE` | selector, text, delay |
| `focus` | `DOM_FOCUS` | selector |
| `scroll` | `DOM_SCROLL` | selector, behavior |
| `extract` | `DOM_EXTRACT` | selector, attribute |
| `emit` | `EVENT_EMIT` | event, payload |
| `transition` | `STATE_TRANSITION` | to (no genera comando hacia Chrome — actualiza `IonStateManager` directamente) |

Resolución de variables: `${variable_name}` (nivel recipe), `$CONTEXT.key` (contexto de runtime del intent), `$PROMPT` (shorthand de `$CONTEXT.prompt`).

### 5.5 `ion.manifest.json` — autodiscovery sin cargar el recipe completo

```
ionsites/
├── github.com/{ion.manifest.json, auth.ion}
├── claude.ai/{ion.manifest.json, message.ion, selectors.json, flows/*.ion}
└── _meta/versions.json
```

```json
{
  "site": "github.com",
  "version": "1.0.0",
  "entrypoint": "auth.ion",
  "flows": ["bootstrap", "handle_pat_detected", "await_confirmation"],
  "triggers": { "on_load": "bootstrap", "on_pat_clipboard": "handle_pat_detected" },
  "capabilities": ["auth", "clipboard_monitor"],
  "requires_cortex_version": ">=1.2.0"
}
```

> Si `ionsites/` no existe en una instalación fresca, `IonLoader.discover_all()` debe **crearlo silenciosamente** y retornar 0 — no es un error.

### 5.6 Capa IPC — especificación

`SynapseIPCServer` (`brain/core/synapse/synapse_ipc_server.py`, en el proceso Brain-Host): creado por `SynapseManager` al inicio de `run_host_loop()`; bind a `127.0.0.1` en puerto efímero; corre en daemon thread; borra el port file en shutdown con `try/finally`.

```python
self._action_map = {
    # Existentes — NO modificar:
    "SYSTEM_HELLO": self._handle_handshake, "HEARTBEAT": self._handle_heartbeat, "LOG_ENTRY": self._handle_log_entry,
    # Nuevos para IonPump:
    "DOM_FOCUS": self._handle_dom_passthrough, "DOM_TYPE": self._handle_dom_passthrough,
    "DOM_CLICK": self._handle_dom_passthrough, "DOM_WAIT": self._handle_dom_passthrough,
    "DOM_SCROLL": self._handle_dom_passthrough, "DOM_EXTRACT": self._handle_dom_passthrough,
    "EVENT_EMIT": self._handle_dom_passthrough, "STATE_TRANSITION": self._handle_state_transition,
}
```

`IonPumpIPCClient` (`brain/core/ionpump/ionpump_ipc.py`, en el proceso Brain que ejecuta el intent): lee el puerto desde `run/ipc_{launch_id}.port`, lanza `IonIPCError` si no existe. Expone `send_command()` y `send_command_wait_ack()` (este último espera un ACK significativo de la extensión, no solo el del IPC server — usado en steps `DOM_WAIT`).

`ionpump_executor.py` (`IonExecutor`): traduce pasos `.ion` a `SynapseCommand` objects. **No envía nada** — es un async generator puro. `IonPumpManager` consume cada comando y lo envía vía `IonPumpIPCClient`.

### 5.7 Estructura de módulos en Brain

```
brain/core/ionpump/
├── ionpump_models.py        ← dataclasses: IonStep, IonFlow, IonRecipe, IonManifest, SynapseCommand
├── ionpump_registry.py      ← registro en memoria
├── ionpump_loader.py        ← discover_all(), load_recipe(), start_watchdog()
├── ionpump_validator.py     ← retorna ValidationResult, no lanza excepciones
├── ionpump_state.py         ← state machine por (tab_id, domain)
├── ionpump_executor.py      ← yield SynapseCommand, no envía
├── ionpump_manager.py       ← singleton, envía vía IPCClient
└── ionpump_ipc.py
brain/core/synapse/synapse_ipc_server.py
brain/commands/ionpump/{ionpump_inspect,ionpump_validate,ionpump_reload,ionpump_test}.py
```

### 5.8 Hot-reload

```python
class IonRecipeWatcher(FileSystemEventHandler):
    def on_modified(self, event):
        if event.src_path.endswith('.ion'):
            new_recipe = self._load_recipe(event.src_path)
            if self._validate(new_recipe):
                self.registry.update(domain, new_recipe)
            else:
                logger.error(f"Invalid recipe, rollback: {domain}")  # mantiene el anterior en memoria
```

> **Prerrequisito no negociable:** confirmar que `watchdog` está declarado en `requirements.txt`/`pyproject.toml` de Brain antes de implementar esta fase.

Si la validación falla: se loguea, se mantiene el recipe anterior, se emite telemetría `ION_RELOAD_FAILED`. Rollback implícito.

### 5.9 Integración con `IntentExecutor` — DEFERRED

No implementar hasta confirmar el archivo dispatcher real en `brain/core/intent/`. El archivo `intent_executor.py` referenciado en specs anteriores **no fue confirmado en el codebase**. Patrón previsto cuando se desbloquee (agregar al método que procesa intents, no reescribirlo):

```python
if intent.subtype == "web_automation":
    result = await self.ionpump_manager.execute_flow(
        site=intent.context.get("target_site"),
        flow_name=intent.context.get("automation_flow", "send_prompt"),
        tab_id=intent.context.get("tab_id"),
        launch_id=intent.context.get("launch_id"),
        context=intent.context,
    )
    return result
```

No bloquea el resto de las fases (core runtime, IPC, hot-reload, admin commands, Metamorph inspect).

### 5.10 Comandos admin

```bash
brain ionpump inspect [--json]
brain ionpump validate github.com/auth.ion
brain ionpump reload github.com | --all
brain ionpump test github.com bootstrap [--dry-run]
```

---

## 6. Manifests de protocolo — `DISCOVERY_PROTOCOL_MANIFEST`

6 mensajes del milestone GitHub, agregados al final de `discoveryProtocol.js`: `onboarding_navigate` (command, enum `step`), `github_pat_detected` (event, string `token`), `github_token_stored` (event, string + 2 auto), `account_registered` (event, 2 auto), `host_ready` (command, sin parámetros), `discovery_complete` (event, 2 auto). Todos `channel: "runtime"`, dirección `harness_to_background`. `observable_events`: `HANDSHAKE_CONFIRMED`, `API_KEY_REGISTERED`, `ACCOUNT_REGISTERED`, `DISCOVERY_COMPLETE`, `GITHUB_PAT_DETECTED`, `GITHUB_TOKEN_STORED`.

**Agregar un sitio nuevo a IonPump (ej. `perplexity.ai`):** crear `ionsites/perplexity.ai/{message.ion, ion.manifest.json}` (IonPumpManager lo detecta por hot-reload); agregar el dominio a `matches` del content script si falta; agregar `perplexity.ai` a `options` del parámetro `site` en `HARNESS_PROTOCOL_MANIFEST`. **El Harness no se toca** — `ProtocolReader` refleja el cambio automáticamente en runtime.

---

## 7. Ciclo de vida — seed, launch, re-seed

### 7.1 Seed (actualizado por §0.2)

```
sentinel seed <alias> <master> --dev
  ├── 1. Extrae .blx → bin/extension/ (temporal)
  ├── 2. Llama: brain profile create <alias> --dev
  │       └── discovery_generator.py: copia discoveryProtocol.js, harnessProtocol.js
  │       └── harness_generator.py: copia index.html, harness.js, harnessProtocol.js
  │           ⚠️ esto ocurre SIEMPRE — el flag --dev ya no lo condiciona (§0.2)
  └── 3. bin/extension/ se borra (Sentinel)
```

### 7.2 Launch

```
sentinel launch <alias>
  └── ignition_identity.go::prepareSessionFiles()
        ├── writeDiscoveryConfig() / writeLandingConfig()  ← existentes
        └── writeHarnessConfig()                            ← solo si harness/index.html existe
              escribe harness.synapse.config.js con profileId, launchId, profileAlias, generatedAt
```

`harness.synapse.config.js` se escribe en **launch**, no en seed (en seed aún no existe `launch_id`). El guard `if harness/index.html no existe → no-op` fue diseñado como el mecanismo real de "es dev o no". **Dado que `harness_generator.py` ya despliega `index.html` siempre, este guard prácticamente ya no filtra nada** — ver §18.2 para la pregunta abierta sobre si esto es intencional.

### 7.3 Re-seed como actualización

```bash
sentinel seed <alias> <master> --dev
```

Sobrescribe los assets del Harness. No requiere reinstalar Cortex ni empaquetar un nuevo `.blx`.

---

## 8. Implementación — Brain

Ver §5.7 para la estructura de módulos de IonPump y §4.1 para el código real y verificado de `harness_generator.py`. Modificación en `profile_create.py`:

```python
def _generate_profile_pages(self, profile_id, profile_name, dev_mode=False):
    from brain.core.profile.web.harness_generator import generate_harness_page
    generate_harness_page(extension_dir, profile_data, dev_mode=dev_mode)
```

`discovery_generator.py` — agregar a `files_to_copy`:
```python
files_to_copy = [
    "index.html", "discovery.js", "script.js", "discoveryProtocol.js",
    "harnessProtocol.js",  # copia para el contexto de discovery
    "content-aistudio.js", "onboarding.js", "styles.css",
]
```

**Fases de implementación:** Fase 1 (Core: models → registry → loader → validator → state) · Fase 2 (IPC + Execution Engine) · Fase 3 (Intent Integration, DEFERRED, §5.9) · Fase 4 (Hot-reload, prerrequisito watchdog) · Fase 5 (Admin commands) · Fase 6a (Metamorph inspect, implementable ahora) · Fase 6b (Metamorph reconcile, BLOCKED por Bartcave) · Fase 7 (recipes adicionales: chatgpt.com, grok.com, perplexity.ai).

---

## 9. Implementación — Cortex

Reglas de qué NO se toca: `discovery.js`, `content.js`, `background.js` (salvo fix de URL pendiente), `discoveryProtocol.js` excepto agregar el manifest al final. No abrir un segundo `chrome.runtime.connectNative()` en el Harness. No agregar lógica de negocio al Harness. Ver §4.9 para `web_accessible_resources`.

---

## 10. Implementación — Sentinel

```go
// seed.go — único cambio para seed
cmd.Flags().BoolVar(&devMode, "dev", false, "Enable dev mode")
args := []string{"--json", "profile", "create", alias}
if devMode { args = append(args, "--dev") }
```

```go
// ignition_identity.go — writeHarnessConfig() en launch
func writeHarnessConfig(profileID, launchID, profileAlias, extensionDir string) error {
    harnessPage := filepath.Join(extensionDir, "harness", "index.html")
    if _, err := os.Stat(harnessPage); os.IsNotExist(err) {
        return nil  // diseñado como guard de "solo en dev" — ya no es confiable como tal, ver §18.2
    }
    config := fmt.Sprintf(`self.HARNESS_CONFIG = { profileId: %q, launchId: %q, profileAlias: %q, generatedAt: %q };`,
        profileID, launchID, profileAlias, time.Now().UTC().Format(time.RFC3339))
    return os.WriteFile(filepath.Join(extensionDir, "harness.synapse.config.js"), []byte(config), 0644)
}
```

Llamada no fatal: si falla, se loguea warning y el Harness simplemente no tiene config.

**Lo que Sentinel NO hace:** no implementa `copyHarnessPage()` ni `copyIonPumpProtocol()` en seed (eso es de Brain); no escribe en `extensionDir` después de invocar a `brain profile create`.

---

## 11. Implementación — Metamorph

Único escritor de `ionsites/`. Para el milestone GitHub solo se necesita `metamorph inspect --ion-recipes` — el ciclo de reconciliación (download + swap) es fase siguiente, bloqueada hasta que el servidor Bartcave exista.

```
installer/metamorph/internal/inspection/
├── types.go       ← IonRecipeInfo, IonRecipesResult
├── inspect.go     ← flag --ion-recipes
└── ionrecipes.go  ← InspectIonRecipe, InspectAllIonRecipes
```

```go
type IonRecipeInfo struct {
    Site, Version, Description, Entrypoint, LastModified, Status, ManifestHash string
    FlowCount    int
    Capabilities []string
    SizeBytes    int64
}
type IonRecipesResult struct {
    Recipes    []IonRecipeInfo
    BasePath   string
    TotalSites, TotalFlows int
    Timestamp  string
}
```

Comportamiento: si `ionsites/` no existe → error informativo (no panic); si existe vacío → 0 recipes, sin error; ignora directorios que empiezan con `_`; por sitio calcula SHA-256 del manifest y verifica que el entrypoint exista (`healthy` / `missing` / `corrupted`).

**Formato de manifest para reconciliación (referencia futura, no implementar hasta que exista el endpoint):**
```json
{ "manifest_version": "1.1", "ion_recipes": [{ "site": "github.com", "version": "1.1.0", "download_url": "https://bartcave.internal/recipes/github.com-1.1.0.tar.gz", "files": [{"path": "ion.manifest.json", "sha256": "..."}] }] }
```
Proceso previsto: inspect → comparar versiones → descargar a staging → verificar sha256 → swap atómico (`ionsites/{site}/` ↔ `.bak/`) → IonPump watchdog recarga → rollback si falla.

**Invariantes:** solo Metamorph escribe en `ionsites/`; el swap es atómico; Metamorph no ejecuta recipes ni valida semántica (solo hashes/syntax); no participa del Event Bus.

---

## 12. Uso operativo — debug del flujo de onboarding

### 12.1 El flujo

```
welcome → github_auth [GITHUB_PAT_DETECTED] → github_confirm [GITHUB_TOKEN_STORED]
        → api_key [API_KEY_REGISTERED] → complete [DISCOVERY_COMPLETE] → Landing activa
```

| Paso | Espera | Emite | Resultado |
|---|---|---|---|
| `github_auth` | Usuario genera PAT en GitHub | `GITHUB_PAT_DETECTED` (token) | background.js inicia almacenamiento |
| `github_confirm` | Usuario confirma el token | `GITHUB_TOKEN_STORED` (fingerprint) | Token cifrado en Chrome Storage |
| `api_key` | Usuario pega API key | `API_KEY_REGISTERED` | API key cifrada |
| `complete` | Todo lo anterior | `DISCOVERY_COMPLETE` | Sentinel genera `landing.synapse.config.js` |

Cuando IonPump está activo, `IonPumpManager` corre el flow `bootstrap` de `github.com` al navegar a `github_auth`; `content.js` emite `SITE_READY`. El clipboard monitor sigue siendo el mecanismo de detección del PAT — IonPump no lo reemplaza, automatiza la verificación de que la página está lista.

### 12.2 Caso A — Observar el flujo real

Verificar en **Config** que `launchId` coincide con la sesión activa → abrir Discovery en otra tab → interactuar normalmente → cada evento que `background.js` procesa aparece en el **Log**.

> **Límite de arquitectura:** el Harness solo registra mensajes que `chrome.runtime.onMessage` entrega a su propio listener — es un participante más del broadcast, no un tap pasivo sobre el bus. Mensajes que `background.js` consume internamente sin broadcast pueden no aparecer.

### 12.3 Caso B — Simular un evento puntual

Click en el mensaje (ej. `github_pat_detected`) → completar/ajustar el campo editable → **Send** → Log muestra `[SEND]` con el payload y `[ACK]` con la respuesta. ACK `null` puede ser fire-and-forget esperado, o el handler no reconoció el evento. `ERR` indica que el mensaje no llegó — revisar `extension_id` en Config y que el host esté conectado.

### 12.4 Caso C — Flujo completo desde cero

Secuencia con ACK entre cada uno: `onboarding_navigate(github_auth)` → `github_pat_detected` → `github_token_stored` → `api_key_registered` → `account_registered` → `discovery_complete`.

### 12.5 Troubleshooting por síntoma

| Síntoma | Dónde mirar | Qué buscar |
|---|---|---|
| Harness no carga protocolos | Dev Tools del Harness → Console | `[ProtocolReader] Loaded 0 protocol(s)` |
| Dispatch sin ACK | Log del Harness | `ERR: chrome.runtime.lastError` |
| Discovery no avanza | Dev Tools de `background.js` | Handler del evento, errores de validación |
| Handshake no completa | Dev Tools de `background.js` | logs `[HANDSHAKE]`, `host_ready` recibido o no |
| Token no se almacena | Dev Tools de `background.js` | logs de Chrome Storage / Vault |

Dev Tools de `background.js`: `chrome://extensions` → la extensión → **Inspect views: background page (service_worker)**.

---

## 13. Estado conocido al momento de esta fusión

Ninguno de los dos documentos previos refleja el estado real verificado en esta sesión. El snapshot operativo que traía `HARNESS_SOURCE_OF_TRUTH.md` (perfil de referencia, launchId, "`--dev` pendiente de implementación formal") es **anterior** al código aportado acá y queda superado — el código ya no depende de ese flag para decidir si despliega el Harness. No se reconstruye un nuevo snapshot de estado porque no hay evidencia de primera mano sobre el perfil/launch activos en este momento; cualquier snapshot futuro debería generarse contra el sistema corriendo, no copiarse de este documento.

---

## 14. Estructura de archivos completa

**Nuevos:**
```
brain/core/profile/web/templates/harness/{index.html, harness.js, harnessProtocol.js}
brain/core/profile/web/harness_generator.py
brain/core/ionpump/{ionpump_manager,ionpump_loader,ionpump_registry,ionpump_executor,ionpump_state,ionpump_models,ionpump_validator,ionpump_ipc}.py
brain/core/synapse/synapse_ipc_server.py
brain/commands/ionpump/{ionpump_inspect,ionpump_validate,ionpump_reload,ionpump_test}.py
BloomNucleus/bin/cortex/ionsites/github.com/{ion.manifest.json, auth.ion}, ionsites/_meta/versions.json
installer/metamorph/internal/inspection/ionrecipes.go
```

**Modificados:**
```
brain/core/profile/web/templates/discovery/{discoveryProtocol.js (+manifest al final), harnessProtocol.js (nuevo)}
brain/core/profile/web/discovery_generator.py        ← agrega harnessProtocol.js a files_to_copy
brain/core/profile/profile_create.py                  ← agrega llamada a generate_harness_page
brain/core/synapse/synapse_manager.py                  ← lanza SynapseIPCServer en thread, agrega handlers DOM
sentinel/internal/seed/seed.go                         ← agrega flag --dev
sentinel/internal/ignition/ignition_identity.go        ← agrega writeHarnessConfig()
extension/manifest.json                                ← agrega harness/*, harness.synapse.config.js, discovery/harnessProtocol.js
installer/metamorph/internal/inspection/{types.go, inspect.go} ← IonRecipeInfo, flag --ion-recipes
```

**No se modifican:** `background.js`, `discovery/index.html`, `discovery/discovery.js`, `content.js`, `bloom-host.exe`, capa de protocolo de `SynapseServer`, `landing/landingProtocol.js` (no requerido para milestone GitHub).

---

## 15. Checklist de implementación por componente

**Brain:** `ionpump_models.py` con dataclasses completas · `ionpump_registry.py` con invariantes · `ionpump_loader.py` crea `ionsites/` si no existe (no error) · `ionpump_validator.py` retorna `ValidationResult`, no lanza excepciones · `ionpump_executor.py` es async generator puro, no envía · `ionpump_ipc.py` con error claro si falta el port file · `synapse_ipc_server.py` solo en 127.0.0.1, port file borrado en `try/finally` · `ionpump_manager.py` singleton · `harness_generator.py` — **verificar con el equipo si el deploy incondicional (§0.2) es la conducta deseada o hay que reintroducir el gate de `dev_mode`** · `discovery_generator.py` con `harnessProtocol.js` en `files_to_copy` · scan de manifests al arrancar no bloquea el start de Brain.

**Cortex:** `DISCOVERY_PROTOCOL_MANIFEST` al final de `discoveryProtocol.js`, 6 mensajes del milestone · `harnessProtocol.js` en `templates/discovery/` · `manifest.json` con los recursos de §4.9 · `harness/index.html` con `ProtocolReader` y UI dinámica, sin JS inline · boot async con `loadScriptOptional()` · **implementar el dispatcher de canal `tabs` en `Simulator.send()`, hoy ausente (§4.5, §18.1)**.

**Sentinel:** flag `--dev` en `seed.go` · `writeHarnessConfig()` en launch, no en seed · no fatal si falla · sin `copyHarnessPage()` ni `copyIonPumpProtocol()` en seed.go.

**Metamorph:** `IonRecipeInfo`/`IonRecipesResult` en `types.go` · `ionrecipes.go` con `InspectIonRecipe`/`InspectAllIonRecipes` · flag `--ion-recipes` · 0 recipes sin error si `ionsites/` vacío · reconciliación marcada BLOCKED hasta Bartcave.

---

## 16. Restricciones absolutas

**Harness:** (1) no define contratos de mensajes, los lee · (2) no abre `chrome.runtime.connectNative()` · (3) no habla directamente con bloom-host · (4) ~~no existe en prod, `harness_generator.py` es no-op cuando `dev_mode=False`~~ — **falso en el código actual, ver §0.2** · (5) no modifica el estado de iones, solo observa y simula.

**IonPump:** (6) no es CLI de usuario, es runtime interno · (7) no hace eager loading, lazy only · (8) no modifica el protocolo Synapse · (9) no modifica `content.js` · (10) no hace llamadas de red, recipes locales · (11) no escribe en `ionsites/` · (12) no llama directo a `SynapseManager`, usa IPC · (13) no existe `send_command()` en `SynapseManager`, IPC es el único canal para envíos proactivos.

**Manifests:** (14) cada protocolo exporta su manifest como adición al final del archivo · (15) IDs únicos dentro del protocolo · (16) parámetros `auto` invisibles al developer · (17) `SynapseIPCServer` solo en `127.0.0.1` · (18) Brain es el único escritor del `extensionDir` · (19) `harness.synapse.config.js` se escribe en launch, no en seed.

---

## 17. Invariantes del sistema a preservar

1. Un solo canal Native Messaging — solo `background.js` tiene `nativePort`.
2. Un solo handshake — `bloom-host` espera exactamente un `extension_ready` por launch.
3. `background.js` es el router. Todos los mensajes pasan por él.
4. Synapse es el protocolo de transporte. IonPump lo usa vía IPC, no lo reemplaza.
5. Cortex es stateless. No guarda estado de iones, solo ejecuta.
6. Metamorph no participa del Event Bus. Invocado bajo demanda por Nucleus.
7. Sentinel no escribe en `extensionDir` después de invocar a `brain profile create`.
8. `ionpump_executor.py` no envía — solo genera `SynapseCommand` objects; `IonPumpManager` es quien llama al `IPCClient`.

---

## 18. Deuda técnica y preguntas abiertas

### 18.1 Canal `tabs` no implementado en el dispatcher real — ALTA PRIORIDAD

Ambos documentos fuente y el propio manifest modelan `channel: "tabs"` como un mecanismo de primera clase, pero `Simulator.send()` real solo maneja `runtime`. Si `HARNESS_PROTOCOL_MANIFEST` incluye mensajes `tabs` (razonable, dado que las acciones DOM de IonPump ocurren en una tab), hoy esos mensajes no se pueden simular desde el Harness — caen en `Unknown channel`. Implementar el branch faltante (`chrome.tabs.sendMessage` + selector de tab activo) o, si se decidió deprioritizar `tabs` para esta fase, dejarlo documentado explícitamente en vez de tácito.

### 18.2 Deploy incondicional del Harness — requiere decisión del equipo, no solo documentación

`harness_generator.py` ya no respeta `dev_mode`. Antes de seguir construyendo sobre este documento, alguien con visibilidad del repo actual debería confirmar: ¿es intencional que el Harness (y por viabilidad, `harness.synapse.config.js` con `profileId`/`launchId` reales) se despliegue en perfiles de producción? Si no lo es, es una regresión a corregir. Si lo es, hay que actualizar el principio "dev/prod por construcción" en este mismo documento y evaluar si corresponde ocultar la entrada en el menú de extensión o restringir el acceso a la URL en prod por otra vía.

### 18.3 `ion.manifest.json` en `extension/harness/` — resuelto, no aplica

La pregunta abierta que `HARNESS_IONPUMP_SOURCE_OF_TRUTH.md` dejaba pendiente sobre este archivo queda cerrada: el `harness_generator.py` real no lo copia. Si en algún momento se necesita, hay que agregarlo explícitamente a `files_to_copy`.

### 18.4 Comentario desactualizado en `harness.js`

La línea de boot que dice "Siempre presentes desde seed --dev" asume el modelo viejo. Corregir el comentario para que no induzca a pensar que esos archivos dependen de `--dev`, dado §0.2.

### 18.5 Copia de `harnessProtocol.js` en `discovery/` — no verificado en esta sesión

Se confirmó la copia local en `harness/`. No se aportó código de `discovery_generator.py` en esta sesión, así que no se puede confirmar si también copia su propia versión a `extension/discovery/` o si depende de algún otro mecanismo. No asumir — confirmar leyendo `discovery_generator.py` real antes de tocar esa ruta.

### 18.6 Heredadas de las fuentes anteriores, aún sin resolver

| # | Pregunta | Bloquea |
|---|---|---|
| 1 | ¿Existe `intent_executor.py` en `brain/core/intent/`? | Fase 3 IonPump |
| 2 | ¿`watchdog` está en `requirements.txt` de Brain? | Fase 4 (hot-reload) |
| 3 | ¿`LANDING_PROTOCOL_MANIFEST` se requiere para el milestone GitHub? | No bloquea |
| 4 | ¿Versión mínima de Cortex que requiere el ion de `github.com`? | Semana 2 del roadmap |
| 5 | Bartcave — ¿cuándo se despliega? | Fase 6b Metamorph (reconcile) |

---

## 19. Orden de implementación recomendado

```
Semana 1 — Fundaciones Harness
  1. DISCOVERY_PROTOCOL_MANIFEST en discoveryProtocol.js (6 mensajes GitHub)
  2. Confirmar con el equipo el comportamiento de dev_mode en harness_generator.py (§18.2) antes de seguir
  3. Flag --dev en seed.go + paso a brain profile create
  4. writeHarnessConfig() en ignition_identity.go (launch, no seed)

Semana 2 — IonPump Core
  5. ionpump_models.py, ionpump_registry.py, ionpump_loader.py (sin watchdog)
  6. github.com/ion.manifest.json + auth.ion

Semana 3 — IonPump IPC + Ejecución
  7. synapse_ipc_server.py + modificación de SynapseManager
  8. ionpump_ipc.py (IonPumpIPCClient)
  9. ionpump_executor.py (async generator) + ionpump_manager.py
  10. Implementar el branch channel: "tabs" en Simulator.send() del Harness (§18.1)
  11. manifest.json de Cortex actualizado (web_accessible_resources)

Semana 4 — Hot-reload + Metamorph + Validación end-to-end
  12. Watchdog en ionpump_loader.py (confirmar dependencia declarada primero)
  13. ionpump_validator.py
  14. ionrecipes.go en Metamorph (--ion-recipes)
  15. Test completo del flujo GitHub con Harness (Casos A/B/C de §12)

Fase siguiente (no bloquea milestone GitHub)
  16. Integración con IntentExecutor (confirmar dispatcher real primero)
  17. Reconciliación de ion recipes vía Metamorph (bloqueado por Bartcave)
  18. Recipes adicionales: chatgpt.com, grok.com, perplexity.ai
```

---

## 20. Criterios de éxito

**Funcional:** recipe cargado automáticamente cuando se necesita · steps traducen correctamente a `SynapseCommand` · `IonPumpIPCClient` alcanza al `SynapseIPCServer` · ACK fluye de Extension a IonPump · hot-reload actualiza sin reiniciar Brain · recipes inválidos hacen rollback automático.

**Performance:** carga de recipe <100ms · latencia por step <50ms (sin contar espera DOM) · detección de hot-reload <1s · round-trip IPC (localhost) <5ms · memoria por recipe <10MB.

**Integración:** funciona con `SynapseProtocol` existente sin cambios en la capa de transporte · funciona con la Extension existente sin cambios en `content.js` · `SynapseManager` arranca el IPC server sin romper el handshake existente · Metamorph puede inspeccionar recipes.

---

*Documento fusionado el 17 de junio de 2026 a partir de `HARNESS_SOURCE_OF_TRUTH.md`, `HARNESS_IONPUMP_SOURCE_OF_TRUTH.md`, y el código real de `harness_generator.py` y `harness.js` aportado en esta sesión. Ambos documentos fuente quedan archivados — no usar como fuente de verdad para nuevas decisiones. Las secciones marcadas con ⚠️ en §0.2, §18.1 y §18.2 requieren una decisión humana, no son inferencias a resolver por este documento.*
