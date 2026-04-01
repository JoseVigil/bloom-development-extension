# 🧠 IONPUMP IMPLEMENTATION PROMPT - Complete Specification

## 📋 CONTEXT & BACKGROUND

This prompt documents the complete architecture, design decisions, and implementation plan for **IonPump**, a web automation runtime for the Bloom BTIPS ecosystem. This specification was developed through iterative architectural analysis and represents the final, approved design.

---

## 📚 REFERENCE DOCUMENTS USED

The following documents were analyzed to reach this specification:

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

### **Current State:**
11. `metamorph_help.txt` - Current Metamorph commands (used to validate integration points)

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
│ Creates intent with web_automation subtype                 │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ BRAIN: IntentExecutor                                       │
│ - Detects intent_subtype == "web_automation"               │
│ - Extracts: target_site, automation_flow, context          │
│ - Invokes: IonPumpManager.execute_flow()                   │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ BRAIN: IonPumpManager (RUNTIME - NOT CLI)                  │
│ - Lazy loads .ion recipe if not in memory                  │
│ - Resolves flow from recipe                                │
│ - Translates .ion steps → Synapse commands                 │
│ - Manages state machine per (tab_id, domain)               │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ BRAIN: SynapseServer (EXISTING - NO CHANGES)               │
│ - Receives commands from IonPump                           │
│ - Forwards to Host via TCP                                 │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ HOST: bloom-host.exe (EXISTING - NO CHANGES)               │
│ - Forwards via Native Messaging to Extension               │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│ CORTEX: Extension (EXISTING - NO CHANGES)                  │
│ - content.js executes DOM actions                          │
│ - Sends ACK back to Brain                                  │
└─────────────────────────────────────────────────────────────┘
```

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

### **Read/Write Responsibilities:**

| Component | Read | Write | Hot-Reload |
|-----------|------|-------|------------|
| IonPump (Brain) | ✅ | ❌ | ✅ Watches filesystem |
| Metamorph | ✅ (inspect) | ✅ (reconcile) | ❌ Only writes |
| Cortex Extension | ❌ | ❌ | ❌ No access |
| Sentinel | ❌ | ❌ | ❌ No access |

---

## 📄 .ION FILE FORMAT SPECIFICATION

### **Syntax: YAML-based DSL**

```yaml
# claude.ai/message.ion
version: 1.0.0
site: claude.ai
description: "Send messages and wait for responses in Claude"

# Entry points - execution triggers
entrypoints:
  on_load: bootstrap
  on_user_command: send_prompt
  on_response_ready: extract_response

# Global variables for the site
variables:
  input_selector: "#chat-input"
  send_button: "button[type='submit']"
  response_container: ".markdown-content"

# Flow definitions
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

# Error handling
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

### **Variable Resolution:**

- `${variable_name}` - Recipe-level variables
- `$CONTEXT.key` - Runtime context passed from intent
- `$PROMPT` - Shorthand for `$CONTEXT.prompt`

---

## 🔧 IMPLEMENTATION FILES

### **Core Runtime (No CLI exposure to end users):**

```
brain/core/ionpump/
├── ionpump_manager.py       # Main orchestrator
├── ionpump_loader.py        # Recipe loader with watchdog
├── ionpump_registry.py      # In-memory recipe registry
├── ionpump_executor.py      # Flow executor (Ion → Synapse)
├── ionpump_state.py         # State machine per (tab_id, domain)
├── ionpump_models.py        # Dataclasses for .ion structure
└── ionpump_validator.py     # Syntax validator
```

### **Admin Commands (For debugging/maintenance only):**

```
brain/commands/ionpump/
├── __init__.py                   # Command registration
├── ionpump_inspect.py            # Inspect loaded recipes
├── ionpump_validate.py           # Validate .ion syntax
├── ionpump_reload.py             # Force hot-reload
└── ionpump_test.py               # Dry-run flows
```

### **Integration Points:**

```
brain/core/intent/
└── intent_executor.py            # MODIFY: Add web_automation detection
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
   - Extracts: target_site="claude.ai", flow="send_prompt"

3. IntentExecutor → IonPumpManager.execute_flow()

4. IonPumpManager checks registry
   - Recipe loaded? NO
   - IonLoader.load_site("claude.ai")
   - Recipe parsed and registered in memory

5. IonExecutor.execute_flow("claude.ai", "send_prompt", context)
   - Reads flow "send_prompt" from recipe
   - Steps: [focus, type, click, transition]

6. IonExecutor translates each step:
   - focus → { type: "DOM_FOCUS", selector: "#chat-input" }
   - type → { type: "DOM_TYPE", selector: "#chat-input", text: "..." }
   - click → { type: "DOM_CLICK", selector: "button[type='submit']" }

7. IonExecutor → SynapseServer.send_command()

8. SynapseServer → Host → Extension

9. Extension content.js executes:
   - document.querySelector("#chat-input").focus()
   - input.value = "Write a Python function..."
   - button.click()

10. Extension sends ACK to Brain

11. IonStateMachine: EXECUTING → WAITING

12. Flow transitions to "wait_response"

13. wait_response flow executes (polling for response)

14. Response detected → emit "RESPONSE_READY"

15. IonStateMachine: WAITING → READY

16. IntentExecutor continues with post-automation steps

17. Result saved to .pipeline/.execution/.response/

18. ✓ Intent completed
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
            
            # Reload recipe
            new_recipe = self._load_recipe(event.src_path)
            
            # Validate before applying
            if self._validate(new_recipe):
                self.registry.update(domain, new_recipe)
                logger.info(f"Hot-reloaded: {domain}")
            else:
                logger.error(f"Invalid recipe, rollback: {domain}")

# Start watcher on Brain initialization
observer = Observer()
observer.schedule(IonRecipeWatcher(registry), ionsites_path, recursive=True)
observer.start()
```

### **Rollback on Invalid Recipe:**

If hot-reload detects invalid syntax:
1. Log error with validation details
2. Keep previous recipe in memory
3. Emit telemetry event: `ION_RELOAD_FAILED`
4. Continue using old recipe until fixed

---

## 🔗 INTEGRATION WITH METAMORPH

### **Metamorph Responsibilities:**

1. **Inspect Ion Recipes:**
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

2. **Reconcile Ion Recipes:**
```bash
metamorph reconcile --manifest ion-recipes-v2.json

# Metamorph downloads new .ion files from Bartcave
# Writes to ionsites/{domain}/
# Brain's watchdog detects changes
# IonRegistry automatically hot-reloads
```

### **Manifest Format for Ion Recipes:**

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
    },
    {
      "domain": "chatgpt.com",
      "version": "1.2.0",
      "sha256": "def456...",
      "download_url": "https://bartcave.bloom/recipes/chatgpt.com-v1.2.0.ion",
      "flows": ["bootstrap", "send_message", "extract_response"]
    }
  ]
}
```

### **Metamorph Extensions Required:**

**File:** `installer/metamorph/internal/inspection/ionrecipes.go`

```go
type IonRecipe struct {
    Domain          string   `json:"domain"`
    Path            string   `json:"path"`
    Version         string   `json:"version"`
    Hash            string   `json:"hash"`
    SizeBytes       int64    `json:"size_bytes"`
    LastModified    string   `json:"last_modified"`
    FlowCount       int      `json:"flow_count"`
    Valid           bool     `json:"valid"`
    ValidationError string   `json:"validation_error,omitempty"`
}

func InspectIonRecipes(basePath string) ([]IonRecipe, error) {
    ionsitesPath := filepath.Join(basePath, "cortex", "ionsites")
    // Implementation...
}
```

---

## 🎯 ADMIN COMMANDS (Debugging Only)

### **1. ionpump_inspect.py**

**Purpose:** Display loaded recipes in memory

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

---

### **2. ionpump_validate.py**

**Purpose:** Validate .ion file syntax before deployment

```bash
brain ionpump validate path/to/recipe.ion
brain ionpump validate path/to/recipe.ion --strict --json
```

**Output:**
```
✅ Recipe is valid: claude.ai/message.ion
   Version: 1.2.0
   Flows: 5
   Entrypoints: 3
```

---

### **3. ionpump_reload.py**

**Purpose:** Force manual hot-reload (debugging watchdog issues)

```bash
brain ionpump reload claude.ai
brain ionpump reload --all
```

**Output:**
```
✅ Recipe reloaded: claude.ai
   Old version: 1.1.0
   New version: 1.2.0
```

---

### **4. ionpump_test.py**

**Purpose:** Dry-run flow execution without side effects

```bash
brain ionpump test claude.ai send_prompt --context '{"prompt": "test"}'
brain ionpump test chatgpt.com bootstrap --dry-run --json
```

**Output:**
```
✓ Flow validation passed: send_prompt
   Steps: 4
   Estimated duration: 2.5s
   Commands to emit:
     1. DOM_FOCUS #chat-input
     2. DOM_TYPE #chat-input "test"
     3. DOM_CLICK button[type='submit']
     4. STATE_TRANSITION wait_response
```

---

## 📋 IMPLEMENTATION PHASES

### **Phase 1: Core Runtime (Week 1)**
- [ ] Create `brain/core/ionpump/` directory structure
- [ ] Implement `ionpump_manager.py` (orchestrator)
- [ ] Implement `ionpump_loader.py` (YAML parser, no watchdog yet)
- [ ] Implement `ionpump_registry.py` (in-memory storage)
- [ ] Implement `ionpump_models.py` (dataclasses)
- [ ] Create example recipe: `claude.ai/message.ion`

### **Phase 2: Execution Engine (Week 2)**
- [ ] Implement `ionpump_executor.py` (Ion → Synapse translator)
- [ ] Implement `ionpump_state.py` (state machine)
- [ ] Integration with existing `SynapseServer`
- [ ] End-to-end test: Load recipe → Execute flow → Verify Synapse commands

### **Phase 3: Intent Integration (Week 3)**
- [ ] Modify `brain/core/intent/intent_executor.py`
- [ ] Add detection for `intent_subtype == "web_automation"`
- [ ] Add hook to invoke `IonPumpManager.execute_flow()`
- [ ] Create example web_automation intent
- [ ] Test full intent execution with IonPump

### **Phase 4: Hot-Reload (Week 4)**
- [ ] Add `watchdog` to `ionpump_loader.py`
- [ ] Implement automatic reload on file change
- [ ] Implement validation before applying changes
- [ ] Implement rollback on invalid recipe
- [ ] Test hot-reload cycle

### **Phase 5: Admin Commands (Week 5)**
- [ ] Implement `brain/commands/ionpump/ionpump_inspect.py`
- [ ] Implement `brain/commands/ionpump/ionpump_validate.py`
- [ ] Implement `brain/commands/ionpump/ionpump_reload.py`
- [ ] Implement `brain/commands/ionpump/ionpump_test.py`
- [ ] Update `help-full.txt` with new commands

### **Phase 6: Metamorph Integration (Week 6)**
- [ ] Create `installer/metamorph/internal/inspection/ionrecipes.go`
- [ ] Extend `metamorph inspect --ion-recipes`
- [ ] Implement `metamorph reconcile` for `.ion` files
- [ ] Define manifest format for ion recipes
- [ ] Test download and deployment cycle

### **Phase 7: Additional Recipes (Week 7)**
- [ ] Create `chatgpt.com/message.ion`
- [ ] Create `grok.com/message.ion`
- [ ] Create `perplexity.ai/message.ion`
- [ ] Document recipe creation guide

### **Phase 8: Testing & Validation (Week 8)**
- [ ] Unit tests for all core modules
- [ ] Integration tests for intent → ionpump flow
- [ ] End-to-end tests with real browser
- [ ] Performance benchmarks
- [ ] Documentation update

---

## 🚫 CRITICAL CONSTRAINTS

### **What IonPump MUST NOT Do:**

1. ❌ **NO standalone CLI usage** - IonPump is a runtime, not a user-facing command set
2. ❌ **NO eager loading** - Recipes load on-demand only
3. ❌ **NO direct DOM access** - All DOM operations via Synapse → Extension
4. ❌ **NO hardcoded site logic** - Everything in .ion files
5. ❌ **NO mixing with Discovery/Landing** - Those are bootstrap, not automation
6. ❌ **NO modification of Synapse protocol** - IonPump uses existing commands
7. ❌ **NO modification of Cortex extension** - Extension is passive executor
8. ❌ **NO network calls** - All recipes from local filesystem

---

## ✅ SUCCESS CRITERIA

### **Functional:**
- [ ] Intent with `web_automation` subtype executes successfully
- [ ] Recipe loaded automatically when needed
- [ ] Flow steps translate correctly to Synapse commands
- [ ] Extension executes DOM actions as specified
- [ ] Hot-reload updates recipe without Brain restart
- [ ] Invalid recipes rollback automatically
- [ ] State machine tracks execution correctly

### **Performance:**
- [ ] Recipe load time: <100ms
- [ ] Flow execution latency: <50ms per step
- [ ] Hot-reload detection: <1s
- [ ] Memory usage: <10MB per loaded recipe

### **Integration:**
- [ ] Works with existing Synapse protocol (no changes)
- [ ] Works with existing Extension (no changes)
- [ ] Works with existing Intent pipeline
- [ ] Metamorph can inspect and update recipes
- [ ] Admin commands available for debugging

---

## 🔍 VALIDATION CHECKLIST

Before considering IonPump complete, verify:

1. **Architecture:**
   - [ ] IonPump is runtime, not CLI module
   - [ ] Lazy loading implemented
   - [ ] No circular dependencies

2. **Integration:**
   - [ ] IntentExecutor detects web_automation
   - [ ] IonPumpManager invoked correctly
   - [ ] Synapse commands emitted properly

3. **Recipes:**
   - [ ] YAML syntax well-defined
   - [ ] Variable resolution works
   - [ ] Error handlers functional

4. **Hot-Reload:**
   - [ ] Watchdog detects changes
   - [ ] Validation before reload
   - [ ] Rollback on error

5. **Metamorph:**
   - [ ] Inspect shows ion recipes
   - [ ] Reconcile updates recipes
   - [ ] Manifest format defined

6. **Documentation:**
   - [ ] help-full.txt updated
   - [ ] Recipe creation guide written
   - [ ] Architecture diagrams created

---

## 📝 FINAL NOTES

### **Key Design Decisions:**

1. **Why runtime, not CLI?**
   - Users don't manually load recipes
   - Recipes load automatically when intents need them
   - Admin commands only for debugging

2. **Why lazy loading?**
   - Brain startup faster
   - Only loads what's needed
   - Reduces memory footprint

3. **Why hot-reload?**
   - Recipes change daily (sites update)
   - No Brain restart needed
   - Faster iteration cycle

4. **Why YAML for .ion?**
   - Human-readable
   - Easy to version control
   - Standard for declarative configs

5. **Why separate from Synapse?**
   - Synapse is transport layer
   - IonPump is orchestration layer
   - Clear separation of concerns

---

## 🎯 CONTINUATION INSTRUCTIONS

To continue implementation:

1. Start with Phase 1 (Core Runtime)
2. Create `ionpump_manager.py` first
3. Implement basic recipe loading
4. Create example `claude.ai/message.ion`
5. Test loading and registry storage
6. Then proceed to Phase 2 (Execution)

**Next conversation should begin with:**
> "Continuing IonPump implementation. Starting Phase [X]. Reference documents already analyzed. Ready to implement [specific file]."

---

**End of Specification**

*This document represents the complete, approved architecture for IonPump as of the current conversation. All design decisions have been validated against existing BTIPS architecture and integration points.*