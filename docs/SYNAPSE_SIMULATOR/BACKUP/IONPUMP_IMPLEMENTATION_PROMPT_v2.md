# 🧠 IONPUMP IMPLEMENTATION PROMPT - Complete Specification v2.0

> **CHANGELOG v2.0** — Revisión post-análisis de codebase real.  
> Cambios respecto a v1.0: IPC Layer agregado (Inconsistencia F crítica), Phase 2 reescrita,
> Phase 3 marcada DEFERRED, Phase 6 separada en 6a/6b, correcciones menores en Phase 1 y 4.

---

## 📋 CONTEXT & BACKGROUND

This prompt documents the complete architecture, design decisions, and implementation plan for **IonPump**, a web automation runtime for the Bloom BTIPS ecosystem. This specification was developed through iterative architectural analysis and represents the final, approved design.

---

## 📚 REFERENCE DOCUMENTS USED

### **Core Architecture Documents:**
1. `BTIPS__Bloom_Technical_Intent_Package_.md` - General BTIPS system architecture
2. `BTIPS-SYNAPSE-PROTOCOL.md` - Synapse communication protocol specification
3. `_____PROMPT_PARA_CLAUDE___BLOOM_-_IONPUMP_-_SYNAPSE.md` - Initial IonPump requirements

### **System Documentation:**
4. `help-full.txt` - Brain command reference (complete)
5. `sentinel_help.txt` - Sentinel command reference
6. `bloom_project_tree.txt` - Intent pipeline structure
7. `unified_command_prompt.md` - Brain v2 command template
8. `appdata_tree.txt` - BloomNucleus filesystem structure

### **Inspection System Files:**
9. `METAMORPH-INSPECTION-IMPLEMENTATION-PROMPT.md` - Metamorph inspection requirements
10. `status.go`, `inspect.go`, `main.go` - Metamorph implementation examples

### **Codebase Verified (v2.0):**
11. `synapse_manager.py` - Verified: SynapseManager is a **receiver**, not a sender. No `send_command()` exists.
12. `synapse_protocol.py` - Verified: transport layer only (`send_message()` / `read_message()`).
13. `synapse_host_init_manager.py` - Verified: Host process lifecycle. No IPC socket exists today.
14. `bridge.go` - Verified: JSON-RPC over stdin/stdout toward Electron. Not usable for internal IPC.
15. `seed.go` - Verified: Sentinel does NOT touch extensionDir after calling Brain. IPC must be new.

---

## 🎯 WHAT IS IONPUMP?

### **Definition:**
IonPump is a **web automation runtime** that lives inside Brain and executes site-specific automation recipes called `.ion` files. It translates declarative automation flows into atomic Synapse commands that execute in the browser via the Cortex extension.

### **Key Principle:**
> **IonPump is NOT a standalone CLI module.**  
> **IonPump is a RUNTIME invoked by IntentExecutor when an intent requires web automation.**

---

## 🏗️ ARCHITECTURAL POSITION

### **Where IonPump Sits in the Stack:**

```
┌─────────────────────────────────────────────────────────────┐
│ USER                                                        │
│ Creates intent with web_automation subtype                  │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ BRAIN: IntentExecutor                                       │
│ - Detects intent_subtype == "web_automation"                │
│ - Extracts: target_site, automation_flow, context           │
│ - Invokes: IonPumpManager.execute_flow()                    │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ BRAIN: IonPumpManager (RUNTIME - NOT CLI)                   │
│ - Lazy loads .ion recipe if not in memory                   │
│ - Resolves flow from recipe                                 │
│ - Translates .ion steps → SynapseCommand objects            │
│ - Manages state machine per (tab_id, domain)                │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ BRAIN: IonPumpIPCClient (NEW)                               │
│ - Connects to local TCP socket of the active Brain-Host     │
│ - Reads port from run/ipc_{launch_id}.port                  │
│ - Sends SynapseCommand as JSON                              │
└────────────┬────────────────────────────────────────────────┘
             │  TCP localhost
             ▼
┌─────────────────────────────────────────────────────────────┐
│ BRAIN: SynapseIPCServer (NEW — runs in Brain-Host process)  │
│ - Listens on ephemeral TCP port (127.0.0.1 only)            │
│ - Writes port to run/ipc_{launch_id}.port on startup        │
│ - Receives IonPump commands and routes via _action_map      │
│ - Calls protocol.send_message() to forward to Chrome        │
└────────────┬────────────────────────────────────────────────┘
             │ Native Messaging (existing, unchanged)
             ▼
┌─────────────────────────────────────────────────────────────┐
│ BRAIN: SynapseManager (EXISTING — minimal change)           │
│ - run_host_loop() unchanged                                 │
│ - _action_map extended with DOM command handlers            │
│ - SynapseIPCServer launched in thread at startup            │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ HOST: bloom-host.exe (EXISTING - NO CHANGES)                │
│ - Forwards via Native Messaging to Extension                │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ CORTEX: Extension (EXISTING - NO CHANGES)                   │
│ - content.js executes DOM actions                           │
│ - Sends ACK back to Brain                                   │
└─────────────────────────────────────────────────────────────┘
```

### **Why IPC and not direct call:**
`SynapseManager.run_host_loop()` is a blocking loop running in the Brain-Host process (invoked by Chrome as a Native Messaging Host). IonPump runs in a separate Brain process triggered by an intent. These are **different OS processes** — they cannot share memory. A local TCP socket is the correct inter-process channel, consistent with the existing pattern of JSON-over-subprocess used throughout the ecosystem (`seed.go → brain.exe`, `synapse_host_init_manager.py → bloom-host.exe`).

---

## 📁 FILESYSTEM STRUCTURE

### **Location of .ion Recipes:**

```
C:\Users\<USER>\AppData\Local\BloomNucleus\bin\cortex\ionsites\
├── claude.ai/
│   ├── message.ion              # Main entrypoint
│   ├── selectors.json           # Optional: versioned selectors
│   └── flows/
│       ├── send_prompt.ion
│       ├── wait_response.ion
│       └── extract_code.ion
├── chatgpt.com/
│   ├── message.ion
│   └── flows/
│       └── ...
├── grok.com/
│   ├── message.ion
│   └── flows/
│       └── ...
└── _meta/
    └── versions.json            # Recipe version tracking
```

> **Note:** `ionsites/` may not exist on a fresh install. `IonLoader.discover_all()` must create it
> if missing — this is not an error, it means no recipes are deployed yet.

### **IPC Runtime Files:**

```
C:\Users\<USER>\AppData\Local\BloomNucleus\run\
└── ipc_{launch_id}.port         # Written by SynapseIPCServer on startup
                                 # Contains: plain integer (TCP port number)
                                 # Deleted when SynapseManager session ends
```

### **Read/Write Responsibilities:**

| Component | Read | Write | Hot-Reload |
|-----------|------|-------|------------|
| IonPump (Brain) | ✅ | ❌ | ✅ Watches filesystem |
| Metamorph | ✅ (inspect) | ✅ (reconcile) | ❌ Only writes |
| Cortex Extension | ❌ | ❌ | ❌ No access |
| Sentinel | ❌ | ❌ | ❌ No access |
| SynapseIPCServer | ❌ | ✅ (port file) | ❌ |

---

## 📄 .ION FILE FORMAT SPECIFICATION

### **Syntax: YAML-based DSL**

```yaml
# claude.ai/message.ion
version: 1.0.0
site: claude.ai
description: "Send messages and wait for responses in Claude"

entrypoints:
  on_load: bootstrap
  on_user_command: send_prompt
  on_response_ready: extract_response

variables:
  input_selector: "#chat-input"
  send_button: "button[type='submit']"
  response_container: ".markdown-content"

flows:
  bootstrap:
    description: "Initialize Claude interface"
    steps:
      - wait:
          selector: "${input_selector}"
          timeout: 10s
      - check_ready:
          selector: "${send_button}"
      - emit:
          event: "SITE_READY"
          payload: { site: "claude.ai" }

  send_prompt:
    description: "Send prompt to chat"
    requires: ["SITE_READY"]
    steps:
      - focus:
          selector: "${input_selector}"
      - type:
          selector: "${input_selector}"
          text: "$PROMPT"
          delay: 50ms
      - click:
          selector: "${send_button}"
      - transition:
          to: "wait_response"

  wait_response:
    description: "Wait for Claude response"
    steps:
      - wait:
          selector: "${response_container}"
          condition: "text_changed"
          timeout: 60s
      - wait:
          condition: "animation_stopped"
          target: "${response_container}"
      - emit:
          event: "RESPONSE_READY"

  extract_code:
    description: "Extract code blocks from response"
    steps:
      - extract:
          selector: "pre code"
          attribute: "textContent"
          save_to: "$CONTEXT.extracted_code"
      - emit:
          event: "CODE_EXTRACTED"
          payload: { code: "$CONTEXT.extracted_code" }

error_handlers:
  timeout:
    retry: 3
    fallback: "report_error"
  selector_not_found:
    retry: 1
    fallback: "reload_page"
```

### **Ion Step Types → Synapse Command Mapping:**

| Ion Step | Synapse Command | Parameters |
|----------|----------------|------------|
| `wait` | `DOM_WAIT` | selector, timeout, condition |
| `click` | `DOM_CLICK` | selector |
| `type` | `DOM_TYPE` | selector, text, delay |
| `focus` | `DOM_FOCUS` | selector |
| `scroll` | `DOM_SCROLL` | selector, behavior |
| `extract` | `DOM_EXTRACT` | selector, attribute |
| `emit` | `EVENT_EMIT` | event, payload |
| `transition` | `STATE_TRANSITION` | to (next flow) |

> These commands must be registered in `SynapseManager._action_map` as part of Phase 2.
> They do NOT exist today — Phase 2 adds them.

### **Variable Resolution:**

- `${variable_name}` - Recipe-level variables
- `$CONTEXT.key` - Runtime context passed from intent
- `$PROMPT` - Shorthand for `$CONTEXT.prompt`

---

## 🔧 IMPLEMENTATION FILES

### **Core Runtime:**

```
brain/core/ionpump/
├── ionpump_manager.py       # Main orchestrator (singleton)
├── ionpump_loader.py        # Recipe loader with watchdog
├── ionpump_registry.py      # In-memory recipe registry
├── ionpump_executor.py      # Flow executor (Ion → SynapseCommand objects)
├── ionpump_state.py         # State machine per (tab_id, domain)
├── ionpump_models.py        # Dataclasses for .ion structure
├── ionpump_validator.py     # Syntax validator
└── ionpump_ipc.py           # IPC client — connects to SynapseIPCServer
```

### **IPC Layer (new files in existing Synapse module):**

```
brain/core/synapse/
├── synapse_ipc_server.py    # TCP server — receives IonPump commands, forwards to Chrome
└── [existing files unchanged]
```

### **Admin Commands (debugging only):**

```
brain/commands/ionpump/
├── __init__.py
├── ionpump_inspect.py
├── ionpump_validate.py
├── ionpump_reload.py
└── ionpump_test.py
```

### **Integration Points:**

```
brain/core/synapse/synapse_manager.py
  MODIFY: launch SynapseIPCServer in thread inside run_host_loop()
  MODIFY: add DOM command handlers to _action_map

brain/core/intent/
  ⚠️  intent_executor.py — FILE NOT CONFIRMED IN CODEBASE
  ⚠️  See Phase 3 (DEFERRED)
```

---

## 🔄 EXECUTION FLOW

### **Scenario: User Creates Web Automation Intent**

```json
{
  "intent_id": "550e8400-e29b-41d4-a716-446655440000",
  "intent_type": "dev",
  "intent_subtype": "web_automation",
  "target_site": "claude.ai",
  "automation_flow": "send_prompt",
  "automation_context": {
    "prompt": "Write a Python function to reverse a string",
    "wait_for_response": true,
    "extract_code": true
  }
}
```

### **Step-by-Step Execution:**

```
1. User: brain dev execute web_automation_intent.json

2. IntentExecutor reads intent
   - Detects: intent_subtype == "web_automation"
   - Extracts: target_site="claude.ai", flow="send_prompt", launch_id

3. IntentExecutor → IonPumpManager.execute_flow()

4. IonPumpManager checks registry
   - Recipe loaded? NO
   - IonLoader.load_recipe("claude.ai")
   - Recipe parsed and registered in memory

5. IonExecutor.execute_flow("claude.ai", "send_prompt", context)
   - Reads flow "send_prompt" from recipe
   - Steps: [focus, type, click, transition]
   - Yields SynapseCommand objects (does not send them directly)

6. IonPumpManager receives each SynapseCommand
   - Calls IonPumpIPCClient.send_command(launch_id, command)

7. IonPumpIPCClient:
   - Reads port from BloomNucleus/run/ipc_{launch_id}.port
   - Opens TCP connection to 127.0.0.1:{port}
   - Sends JSON: { "type": "DOM_FOCUS", "selector": "#chat-input" }

8. SynapseIPCServer (running in Brain-Host process):
   - Receives JSON command
   - Routes to handler in _action_map
   - Handler calls self.protocol.send_message(command)

9. SynapseProtocol → Native Messaging → bloom-host.exe → Chrome Extension

10. Extension content.js executes:
    - document.querySelector("#chat-input").focus()
    - input.value = "Write a Python function..."
    - button.click()

11. Extension sends ACK → Brain-Host receives it → SynapseIPCServer sends ACK back to IonPumpIPCClient

12. IonStateMachine: EXECUTING → WAITING

13. Flow transitions to "wait_response"

14. wait_response flow executes (polling for response)

15. Response detected → emit "RESPONSE_READY"

16. IonStateMachine: WAITING → READY

17. IntentExecutor continues with post-automation steps

18. Result saved to .pipeline/.execution/.response/

19. ✓ Intent completed
```

---

## 🔌 IPC LAYER SPECIFICATION

### **SynapseIPCServer (`brain/core/synapse/synapse_ipc_server.py`)**

```python
class SynapseIPCServer:
    """
    TCP server that receives IonPump commands and forwards them to Chrome
    via the existing SynapseProtocol.

    Lifecycle:
    - Created by SynapseManager at the start of run_host_loop()
    - Binds to 127.0.0.1 on an ephemeral port
    - Writes port to BloomNucleus/run/ipc_{launch_id}.port
    - Runs in a daemon thread — dies when the host process dies
    - Deletes the port file on shutdown
    """

    def __init__(self, protocol: SynapseProtocol, launch_id: str, run_dir: Path):
        self.protocol = protocol
        self.launch_id = launch_id
        self.run_dir = run_dir
        self._port: Optional[int] = None
        self._server_thread: Optional[threading.Thread] = None

    def start(self) -> int:
        """
        Binds to an ephemeral port, writes port file, starts listener thread.
        Returns the bound port number.
        """

    def stop(self) -> None:
        """Stops listener thread and deletes port file."""

    def _handle_connection(self, conn: socket.socket) -> None:
        """
        Reads a JSON command from conn.
        Routes to _dispatch_ion_command().
        Sends ACK or error JSON back.
        """

    def _dispatch_ion_command(self, command: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validates command type is a known DOM command.
        Calls self.protocol.send_message(command).
        Returns {"status": "ok"} or {"status": "error", "detail": "..."}.
        """
```

**Integration into SynapseManager:**

```python
def run_host_loop(self) -> None:
    # NEW: start IPC server before entering the loop
    ipc_server = SynapseIPCServer(
        protocol=self.protocol,
        launch_id=self._launch_id,   # must be injected via __init__ or set externally
        run_dir=self._run_dir
    )
    ipc_server.start()

    try:
        while True:
            message = self.protocol.read_message()
            if not message:
                break
            self._dispatch_message(message)
    finally:
        ipc_server.stop()
```

**New DOM handlers in `_action_map`:**

```python
self._action_map = {
    # Existing:
    "SYSTEM_HELLO":    self._handle_handshake,
    "HEARTBEAT":       self._handle_heartbeat,
    "LOG_ENTRY":       self._handle_log_entry,
    # NEW (added for IonPump):
    "DOM_FOCUS":       self._handle_dom_passthrough,
    "DOM_TYPE":        self._handle_dom_passthrough,
    "DOM_CLICK":       self._handle_dom_passthrough,
    "DOM_WAIT":        self._handle_dom_passthrough,
    "DOM_SCROLL":      self._handle_dom_passthrough,
    "DOM_EXTRACT":     self._handle_dom_passthrough,
    "EVENT_EMIT":      self._handle_dom_passthrough,
    "STATE_TRANSITION": self._handle_state_transition,
}

def _handle_dom_passthrough(self, message: Dict[str, Any]) -> None:
    """
    Forwards DOM commands from IonPump to Chrome via protocol.
    These commands arrive from SynapseIPCServer, not from Chrome.
    """
    self.protocol.send_message(message)
```

> **Note:** `STATE_TRANSITION` is handled separately — it does not send anything to Chrome,
> it updates IonStateManager instead.

---

### **IonPumpIPCClient (`brain/core/ionpump/ionpump_ipc.py`)**

```python
class IonPumpIPCClient:
    """
    TCP client that sends IonPump commands to the active Brain-Host process.

    Usage:
        client = IonPumpIPCClient(launch_id, run_dir)
        await client.send_command({"type": "DOM_FOCUS", "selector": "#login_field"})
    """

    def __init__(self, launch_id: str, run_dir: Path):
        self.launch_id = launch_id
        self.run_dir = run_dir
        self._port: Optional[int] = None

    def _resolve_port(self) -> int:
        """
        Reads BloomNucleus/run/ipc_{launch_id}.port.
        Raises IonIPCError if file not found (Brain-Host not running for this launch_id).
        """

    async def send_command(self, command: Dict[str, Any]) -> Dict[str, Any]:
        """
        Sends a JSON command to SynapseIPCServer.
        Returns the ACK dict.
        Raises IonIPCError on connection failure or timeout.
        """

    async def send_command_wait_ack(
        self,
        command: Dict[str, Any],
        timeout: float = 30.0
    ) -> Dict[str, Any]:
        """
        Like send_command() but waits for a meaningful ACK from the extension
        (not just the IPC server ACK). Used for DOM_WAIT steps.
        """
```

---

## 🔥 HOT-RELOAD MECHANISM

### **Automatic Recipe Reloading:**

```python
# brain/core/ionpump/ionpump_loader.py

from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class IonRecipeWatcher(FileSystemEventHandler):
    def __init__(self, registry):
        self.registry = registry

    def on_modified(self, event):
        if event.src_path.endswith('.ion'):
            domain = self._extract_domain(event.src_path)
            new_recipe = self._load_recipe(event.src_path)
            if self._validate(new_recipe):
                self.registry.update(domain, new_recipe)
                logger.info(f"Hot-reloaded: {domain}")
            else:
                logger.error(f"Invalid recipe, rollback: {domain}")

observer = Observer()
observer.schedule(IonRecipeWatcher(registry), ionsites_path, recursive=True)
observer.start()
```

> ⚠️ **Prerequisite:** `watchdog` must be declared as a dependency in Brain's `requirements.txt`
> or `pyproject.toml` before implementing Phase 4. Verify this before writing any watchdog code.

### **Rollback on Invalid Recipe:**

If hot-reload detects invalid syntax:
1. Log error with validation details
2. Keep previous recipe in memory
3. Emit telemetry event: `ION_RELOAD_FAILED`
4. Continue using old recipe until fixed

---

## 🔗 INTEGRATION WITH METAMORPH

### **Phase 6a — Inspect (implementable now):**

```bash
metamorph inspect --ion-recipes

# Output:
# Ion Recipe Inspection
# ────────────────────────────────────────────────────────────
# claude.ai       v1.2.0    5 flows    12.0 KB   ✓ Valid
# chatgpt.com     v1.1.0    3 flows     8.0 KB   ✓ Valid
# ────────────────────────────────────────────────────────────
# Total: 3 sites, 10 flows, 25.0 KB
```

**File:** `installer/metamorph/internal/inspection/ionrecipes.go`

```go
type IonRecipe struct {
    Domain          string `json:"domain"`
    Path            string `json:"path"`
    Version         string `json:"version"`
    Hash            string `json:"hash"`
    SizeBytes       int64  `json:"size_bytes"`
    LastModified    string `json:"last_modified"`
    FlowCount       int    `json:"flow_count"`
    Valid           bool   `json:"valid"`
    ValidationError string `json:"validation_error,omitempty"`
}

func InspectIonRecipes(basePath string) ([]IonRecipe, error) {
    ionsitesPath := filepath.Join(basePath, "cortex", "ionsites")
    // Implementation...
}
```

### **Phase 6b — Reconcile (BLOCKED — do not implement yet):**

> ⛔ **Blocked until Bartcave server exists.**  
> The `download_url` field references `https://bartcave.bloom/recipes/...` which is not a live
> server. Implement `metamorph reconcile --manifest ion-recipes.json` only after Bartcave is
> deployed and the manifest endpoint is defined.

**Manifest format (for reference — implement with Bartcave):**

```json
{
  "manifest_version": "1.0",
  "type": "ion_recipes",
  "release_channel": "stable",
  "recipes": [
    {
      "domain": "claude.ai",
      "version": "1.3.0",
      "sha256": "abc123...",
      "download_url": "https://bartcave.bloom/recipes/claude.ai-v1.3.0.ion",
      "flows": ["bootstrap", "send_prompt", "wait_response", "extract_code"]
    }
  ]
}
```

---

## 🎯 ADMIN COMMANDS (Debugging Only)

### **1. ionpump_inspect.py**

```bash
brain ionpump inspect
brain ionpump inspect --site claude.ai
brain ionpump inspect --flows --json
```

**Output:**
```
IonPump Recipe Inspection
────────────────────────────────────────────────────────────
✓ claude.ai         v1.2.0    5 flows   12.0 KB
✓ chatgpt.com       v1.1.0    3 flows    8.0 KB
✓ grok.com          v1.0.0    2 flows    5.0 KB
────────────────────────────────────────────────────────────
Total: 3 sites, 10 flows
```

### **2. ionpump_validate.py**

```bash
brain ionpump validate path/to/recipe.ion
brain ionpump validate path/to/recipe.ion --strict --json
```

### **3. ionpump_reload.py**

```bash
brain ionpump reload claude.ai
brain ionpump reload --all
```

### **4. ionpump_test.py**

```bash
brain ionpump test claude.ai send_prompt --context '{"prompt": "test"}'
brain ionpump test chatgpt.com bootstrap --dry-run --json
```

---

## 📋 IMPLEMENTATION PHASES

### **Phase 1: Core Runtime**
- [ ] Create `brain/core/ionpump/` directory structure
- [ ] Implement `ionpump_models.py`
- [ ] Implement `ionpump_registry.py`
- [ ] Implement `ionpump_loader.py` — `discover_all()` creates `ionsites/` if missing (not an error)
- [ ] Implement `ionpump_validator.py`
- [ ] Implement `ionpump_state.py`
- [ ] Create example recipe: `ionsites/github.com/auth.ion`

### **Phase 2: IPC Layer + Execution Engine**
- [ ] Implement `brain/core/synapse/synapse_ipc_server.py`
- [ ] Create `BloomNucleus/run/` directory if missing in SynapseIPCServer.start()
- [ ] Modify `SynapseManager.__init__()` to accept `launch_id` and `run_dir`
- [ ] Modify `SynapseManager.run_host_loop()` to start/stop SynapseIPCServer
- [ ] Add DOM command handlers to `SynapseManager._action_map`
- [ ] Implement `ionpump_ipc.py` (IonPumpIPCClient)
- [ ] Implement `ionpump_executor.py` — yields SynapseCommand objects, does NOT send
- [ ] Implement `ionpump_manager.py` — receives commands from executor, sends via IPCClient
- [ ] End-to-end test: Load recipe → Execute flow → Verify commands reach Chrome

### **Phase 3: Intent Integration — ⚠️ DEFERRED**
> The file `brain/core/intent/intent_executor.py` is referenced in the spec but **not confirmed
> in the codebase tree**. Before implementing Phase 3, explore `brain/core/intent/` to identify
> which file dispatches intent execution. Do not create `intent_executor.py` from scratch without
> understanding the existing intent pipeline.
>
> This phase does not block Phases 1, 2, 4, or 5.

### **Phase 4: Hot-Reload**
- [ ] **Prerequisite:** confirm `watchdog` is in Brain's declared dependencies
- [ ] Add `watchdog` to `requirements.txt` / `pyproject.toml` if missing
- [ ] Implement `IonRecipeWatcher` in `ionpump_loader.py`
- [ ] Implement `start_watchdog()` / `stop_watchdog()`
- [ ] Validation before applying + rollback on invalid recipe
- [ ] Test hot-reload cycle end-to-end

### **Phase 5: Admin Commands**
- [ ] `brain/commands/ionpump/ionpump_inspect.py`
- [ ] `brain/commands/ionpump/ionpump_validate.py`
- [ ] `brain/commands/ionpump/ionpump_reload.py`
- [ ] `brain/commands/ionpump/ionpump_test.py`
- [ ] Update `help-full.txt`

### **Phase 6a: Metamorph Inspect (implementable now)**
- [ ] `installer/metamorph/internal/inspection/ionrecipes.go`
- [ ] Extend `metamorph inspect --ion-recipes`
- [ ] Test inspect with real `ionsites/` directory

### **Phase 6b: Metamorph Reconcile — ⛔ BLOCKED**
> Blocked until Bartcave server is deployed.

### **Phase 7: Additional Recipes**
- [ ] `chatgpt.com/message.ion`
- [ ] `grok.com/message.ion`
- [ ] `perplexity.ai/message.ion`
- [ ] Document recipe creation guide

### **Phase 8: Testing & Validation**
- [ ] Unit tests for all core modules
- [ ] Integration tests for IPC layer (mock SynapseIPCServer)
- [ ] End-to-end tests with real browser
- [ ] Performance benchmarks

---

## 🚫 CRITICAL CONSTRAINTS

1. ❌ **NO standalone CLI usage** — IonPump is a runtime, not a user-facing command set
2. ❌ **NO eager loading** — Recipes load on-demand only
3. ❌ **NO direct DOM access** — All DOM operations via IPC → SynapseIPCServer → Chrome
4. ❌ **NO hardcoded site logic** — Everything in .ion files
5. ❌ **NO mixing with Discovery/Landing** — Those are bootstrap, not automation
6. ❌ **NO modification of SynapseProtocol** — IonPump uses it indirectly via IPC
7. ❌ **NO modification of Cortex extension** — Extension is passive executor
8. ❌ **NO network calls** — All recipes from local filesystem
9. ❌ **NO IPC on non-localhost** — SynapseIPCServer binds to 127.0.0.1 only
10. ❌ **NO `send_command()` on SynapseManager** — IPC is the only channel for proactive sends

---

## ✅ SUCCESS CRITERIA

### **Functional:**
- [ ] Recipe loaded automatically when needed
- [ ] Flow steps translate correctly to SynapseCommand objects
- [ ] IonPumpIPCClient successfully reaches SynapseIPCServer
- [ ] Extension executes DOM actions as specified
- [ ] ACK flows back from Extension to IonPump
- [ ] Hot-reload updates recipe without Brain restart
- [ ] Invalid recipes rollback automatically
- [ ] State machine tracks execution correctly

### **Performance:**
- [ ] Recipe load time: <100ms
- [ ] Flow execution latency: <50ms per step (excluding DOM wait time)
- [ ] Hot-reload detection: <1s
- [ ] IPC round-trip (localhost): <5ms
- [ ] Memory usage: <10MB per loaded recipe

### **Integration:**
- [ ] Works with existing SynapseProtocol (no changes to transport)
- [ ] Works with existing Extension (no changes)
- [ ] SynapseManager starts IPC server without breaking existing handshake flow
- [ ] Metamorph can inspect recipes (Phase 6a)
- [ ] Admin commands available for debugging

---

## 🔍 VALIDATION CHECKLIST

1. **IPC Architecture:**
   - [ ] SynapseIPCServer binds to 127.0.0.1 only
   - [ ] Port file created before run_host_loop enters blocking state
   - [ ] Port file deleted on clean shutdown AND on crash (use try/finally)
   - [ ] IonPumpIPCClient raises clear error if port file not found

2. **Recipe Runtime:**
   - [ ] IonLoader creates `ionsites/` if missing — does NOT raise error
   - [ ] Lazy loading: recipe only parsed when first needed
   - [ ] No circular dependencies between ionpump modules

3. **SynapseManager:**
   - [ ] Existing handlers (SYSTEM_HELLO, HEARTBEAT, LOG_ENTRY) unchanged
   - [ ] DOM handlers added without touching existing logic
   - [ ] IPC server thread is daemon thread — does not block process exit

4. **Phase 3 Gate:**
   - [ ] Before touching intent pipeline, confirm which file is the intent dispatcher

5. **Metamorph:**
   - [ ] inspect reads from `cortex/ionsites/` path (same as IonLoader)
   - [ ] reconcile NOT implemented until Bartcave exists

---

*Document version: 2.0 — Post codebase analysis*  
*Supersedes: IONPUMP_IMPLEMENTATION_PROMPT_Complete_Specification v1.0*
