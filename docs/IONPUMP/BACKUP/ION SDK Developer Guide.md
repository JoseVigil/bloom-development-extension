**ION SDK Developer Guide**

**Building web automation packages for the Bloom ecosystem**  
**Version 1.0 · April 2026 · Bloom Platform Engineering**  
**Case study: github.com PAT authentication flow**

### 1. What Is an Ion Package

An `.ion` package is a ZIP archive that teaches Bloom how to operate a specific website. It contains declarative YAML files — not executable code — that describe user intentions, page structure, and navigation flows. IonPump, the runtime inside Brain, reads these files and translates them into atomic Synapse commands that content.js executes in the browser.

**The key design principle:** the package models *intentions*, not pages. A flow like `get_api_key` is a complete business action that may span multiple pages, handle session recovery, and compose reusable fragments. The developer declares what needs to happen; IonPump decides how to navigate there.

**Core Separation**

- `actions/` → Business intentions (what needs to happen)
- `pages/` → Page descriptors (selectors, ready conditions, signals)
- `shared/` → Reusable fragments (auth guards, retry logic)
- `domain.manifest.json` → Package registry and capability declaration

### 2. Package Structure

Every Ion package follows this directory layout inside the ZIP:

```text
github.com.ion.zip
├── domain.manifest.json       # Package registry and metadata
├── actions/                   # Business-level flows (public entrypoints)
│   ├── auth_pat.ion           # Full PAT authentication flow
│   └── verify_token.ion       # Token verification utility
├── pages/                     # Page Object descriptors
│   ├── settings_tokens.page.ion
│   └── login_page.page.ion
└── shared/                    # Reusable fragments
    └── session_guard.ion
```

#### 2.1 `domain.manifest.json`

The manifest is the package's index. IonLoader reads it first to discover what flows are available, what capabilities are required, and where each file lives. Actions not marked `public` are internal helpers.

```json
{
  "schema_version": "2.0",
  "domain": "github.com",
  "version": "1.0.0",
  "description": "GitHub PAT authentication for Bloom onboarding",
  "author": {
    "name": "Bloom Platform",
    "contact": "platform@bloom.io"
  },
  "actions": {
    "auth_pat":      { "file": "actions/auth_pat.ion",      "public": true  },
    "verify_token":  { "file": "actions/verify_token.ion",  "public": false }
  },
  "pages": {
    "settings_tokens": "pages/settings_tokens.page.ion",
    "login_page":      "pages/login_page.page.ion"
  },
  "shared": {
    "session_guard": "shared/session_guard.ion"
  },
  "entry_actions": ["auth_pat"],
  "capabilities": [
    "dom_navigate", "dom_type", "dom_click",
    "dom_extract", "dom_watch", "clipboard_read"
  ],
  "requires_cortex_version": ">=1.2.0"
}
```

### 3. Page Descriptors (`*.page.ion`)

A page descriptor does not execute anything. It is a static contract that describes a page's URL pattern, how to know when it has loaded, which elements are interactable, which signals to watch for, and which navigations are expected. Actions reference elements by name — never by raw CSS selector.

**Why this matters**  
When GitHub changes a selector, you update one page descriptor. Every action that uses that element inherits the fix automatically. No action ever contains a CSS selector string.

#### 3.1 `settings_tokens.page.ion`

```yaml
page: "settings_tokens"
url_pattern: "*/settings/tokens*"
 
# All conditions must pass before IonPump considers the page ready.
ready_when:
  - selector: "[data-testid='tokens-list'], .token-list, #tokens-table"
    timeout: 10000
  - selector: "body"
    attribute: "data-loading"
    value: "false"
    timeout: 5000
    optional: true    # page is still ready if this condition is absent
 
# Named elements — actions reference these by name, not by selector.
elements:
  generate_button:
    selector: "[data-testid='create-token-btn'], a[href*='/new']"
    type: clickable
 
  token_name_input:
    selector: "input#token_description, input[name='token[description]']"
    type: typeable
 
  confirm_button:
    selector: "button[data-testid='submit-form'], input[type='submit']"
    type: clickable
 
  generated_token_value:
    selector: "#new-oauth-token, .token-result code, input#new-token-value"
    type: extractable
 
  pat_input:
    selector: "#pat-input, input[name='pat']"
    type: typeable
 
# Passive observers — IonPump registers these in content.js on page entry.
signals:
  token_generated:
    detect: ".flash-success, [data-testid='success-banner']"
    once: true
    priority: normal
 
  session_expired:
    detect: ".flash-error[data-message*='session'], [data-testid='session-modal']"
    once: true
    priority: high    # interrupts the active action for recovery
 
# Expected navigations from this page.
transitions:
  on_signal:
    session_expired: "login_page"
  on_navigate:
    "*/login*":    "login_page"
    "*/settings*": "settings_tokens"
```

#### 3.2 `login_page.page.ion`

```yaml
page: "login_page"
url_pattern: "*/login*"
 
ready_when:
  - selector: "input#login_field, input[name='login']"
    timeout: 8000
 
elements:
  username_input:
    selector: "input#login_field, input[name='login']"
    type: typeable
 
  password_input:
    selector: "input#password, input[name='password']"
    type: typeable
 
  submit_button:
    selector: "input[type='submit'], button[type='submit']"
    type: clickable
 
signals:
  login_success:
    detect: "[data-testid='user-avatar'], .avatar"
    once: true
    priority: normal
 
  two_factor_required:
    detect: "#otp, input[name='otp']"
    once: true
    priority: high
 
transitions:
  on_signal:
    login_success: "settings_tokens"
  on_navigate:
    "*/settings/tokens*": "settings_tokens"
```

### 4. Actions (`actions/*.ion`)

Actions are the business-level flows. They are the only files marked `public: true` in the manifest — they are the API surface of your package. An action orchestrates navigation across pages, calls shared fragments, and handles unexpected conditions. It never contains a raw CSS selector.

#### 4.1 `auth_pat.ion` — the full GitHub PAT flow

```yaml
action: "auth_pat"
description: >
  Full GitHub PAT authentication flow for Bloom onboarding.
  Navigates to /settings/tokens, enters the PAT from clipboard,
  waits for confirmation, and emits the generated token.
 
# Fragments that must have run before this action executes.
# IonPump checks the event_log; if absent, it runs them first.
requires:
  - session_guard_passed
 
steps:
  # ── Step 1: Navigate to token settings page ────────────────────────
  - navigate:
      url: "https://github.com/settings/tokens"
      expect_page: "settings_tokens"
      fallback:
        on_page: "login_page"
        call: "shared/session_guard"
        then: retry
 
  # ── Step 2: Enter the PAT from context ─────────────────────────────
  - wait:
      element: "pat_input"
      on_page: "settings_tokens"
      timeout: 8000
 
  - focus:
      element: "pat_input"
      on_page: "settings_tokens"
 
  - type:
      element: "pat_input"
      on_page: "settings_tokens"
      text: "$CONTEXT.clipboard_content"
 
  - click:
      element: "confirm_button"
      on_page: "settings_tokens"
 
  # ── Step 3: Wait for the server to confirm the PAT ──────────────────
  - wait_signal:
      signal: "token_generated"
      on_page: "settings_tokens"
      timeout: 15000
 
  # ── Step 4: Extract the generated token value ───────────────────────
  - extract:
      element: "generated_token_value"
      on_page: "settings_tokens"
      save_to: "$CONTEXT.generated_token"
 
  # ── Step 5: Emit completion ─────────────────────────────────────────
  - emit:
      event: "PAT_AUTH_COMPLETE"
      payload:
        token: "$CONTEXT.generated_token"
        provider: "github"
```

#### 4.2 Step reference

| Step type     | Description & Synapse mapping |
|---------------|-------------------------------|
| navigate      | Navigate to a URL. IonPump sends `DOM_NAVIGATE`, then runs the page's `ready_when` conditions via `DOM_WAIT`, registers all signals via `DOM_WATCH`, and sets up URL observers via `DOM_WATCH_URL`. |
| wait          | Wait for a named element to appear. Resolves the element name to its selector from the page descriptor. Maps to `DOM_WAIT`. |
| focus         | Focus a named element. Maps to `DOM_FOCUS` (extension of `DOM_CLICK` without full click sequence). |
| type          | Type text into a named element. Resolves variable references like `$CONTEXT.*`. Maps to `DOM_TYPE` with React/Vue-compatible event dispatch. |
| click         | Click a named element. Maps to `DOM_CLICK` with full human-simulation sequence: mousedown → click → mouseup. |
| wait_signal   | Block until a signal declared in the current page descriptor fires. Signals are registered passively via `DOM_WATCH`; this step just awaits the event. |
| extract       | Read a value from a named element and write it to `$CONTEXT`. Maps to `DOM_EXTRACT`. |
| scroll        | Scroll to a named element or position. Maps to `DOM_SCROLL`. |
| call          | Invoke another action or fragment. Pushes a new frame onto the action stack; resumes caller when callee completes. |
| emit          | Broadcast a named event with an optional payload. Maps to `EVENT_EMIT`, received by background.js and forwarded to Brain. |
| transition    | Explicitly declare the next page context. Normally IonPump infers page transitions from `DOM_WATCH_URL`; use this when navigation is not URL-based (e.g., SPA modal flows). |
| check         | Conditional branch. Evaluates a condition against the current context or DOM state and executes a nested step list based on the result. |

### 5. Shared Fragments (`shared/*.ion`)

Fragments are reusable logic blocks. They are not actions — they cannot be invoked from outside the package.

**`shared/session_guard.ion`**

```yaml
fragment: "session_guard"
description: "Verify active GitHub session. Login if needed."
 
steps:
  - check:
      condition: "page_matches"
      pattern: "*/login*"
      if_true:
        - type:
            element: "username_input"
            on_page: "login_page"
            text: "$CONTEXT.github_username"
        - type:
            element: "password_input"
            on_page: "login_page"
            text: "$CONTEXT.github_password"
        - click:
            element: "submit_button"
            on_page: "login_page"
        - wait_signal:
            signal: "login_success"
            on_page: "login_page"
            timeout: 10000
 
  - emit:
      event: "session_guard_passed"
```

### 6. Variables and Context

| Syntax                        | Resolves to |
|-------------------------------|-----------|
| `$CONTEXT.key_name`           | A value from the runtime context passed by Brain |
| `$CONTEXT.clipboard_content`  | Content captured by the Clipboard Monitor during onboarding |
| `$CONTEXT.github_username`    | Profile credential injected by Nucleus Vault |
| `${variable_name}`            | A recipe-level variable declared in the page descriptor or action |
| `$SIGNAL.payload.field`       | A value extracted from the last signal event payload |

**Security note**  
`$CONTEXT` values are injected by Brain at execution time. The Ion package never reads from disk, localStorage, or any browser storage. Credentials come through the Nucleus Vault — never hardcoded in `.ion` files.

### 7. Error Handling

Every action can declare error handlers at the action level. Handlers specify retry behavior and fallback actions when a step fails.

**Example (at the bottom of any action file)**

```yaml
error_handlers:
  timeout:
    retry: 2                  # retry the failed step up to 2 times
    backoff: 1500             # wait 1.5s between retries (ms)
    fallback: "emit_error"    # if all retries fail, call this fragment
 
  dom_error:
    retry: 1
    fallback: "emit_error"
 
  page_mismatch:
    # IonPump landed on an unexpected page
    retry: 0
    fallback: "emit_error"
 
  signal_timeout:
    # wait_signal did not fire within its timeout
    retry: 1
    fallback: "emit_error"
```

**Priority signals interrupt error handlers**  
If a signal declared with `priority: high` fires during any step, IonPump suspends the current error handling and executes the signal's recovery path first. Normal error handling resumes after recovery completes.

### 8. Complete Case Study — GitHub PAT Authentication

#### 8.1 The intent that triggers execution

```json
{
  "intent_type": "dev",
  "intent_subtype": "web_automation",
  "domain": "github.com",
  "action": "auth_pat",
  "context": {
    "clipboard_content": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "github_username": "bloom-worker-01"
  }
}
```

#### 8.2 Execution trace

(The full detailed trace is described in the original document, including IonLoader, IonStateMachine, step-by-step Synapse commands, and finalization.)

#### 8.3 Session recovery

Detailed explanation of how the system handles redirects to login via priority signals and recovery frames (full description preserved in original).

### 9. Deployment to AppData

Ion packages are deployed to `%LOCALAPPDATA%\BloomNucleus\bin\cortex\ionsites\`. Each domain gets its own subdirectory. Metamorph handles atomic deployment with staging and verification.

### 10. Ion SDK Commands

| Command | Description |
|---------|-----------|
| `bloom ion dev load ./github.com.ion.zip` | Load a local ZIP as trust level 2 (unverified). Hot-reload stays active. |
| `bloom ion validate ./github.com.ion.zip` | Validate the package structure, manifest schema, and all `.ion` files without loading. |
| `bloom ion inspect` | List all loaded packages, their versions, flow count, and load status. |
| `bloom ion inspect --domain github.com` | Detailed inspection of a single package. |
| `bloom ion reload github.com` | Force hot-reload of a specific domain. |
| `bloom ion test github.com auth_pat --context '{"clipboard_content":"ghp_test"}'` | Execute a single action in dry-run mode. |

### 11. Synapse Command Reference

| Command          | Status & description |
|------------------|----------------------|
| DOM_CLICK        | Existing. Click on a CSS selector with full human-simulation event sequence. |
| DOM_TYPE         | Existing. Type text into an input. Dispatches React/Vue-compatible events. |
| DOM_READ         | Existing. Read text content or input value. |
| DOM_WAIT         | Existing. Poll until a selector appears. |
| DOM_SCROLL       | Existing. Scroll to a selector or position. |
| DOM_SNAPSHOT     | Existing. Capture full page state. |
| DOM_UPLOAD       | Existing. Assign files to input[type=file]. |
| LOCK_UI          | Existing. Activate Slave Mode. |
| UNLOCK_UI        | Existing. Deactivate Slave Mode. |
| DOM_NAVIGATE     | New. Navigate to a URL. |
| DOM_WATCH        | New. Register MutationObserver for signals. |
| DOM_WATCH_URL    | New. Intercept pushState/popstate. |
| DOM_UNWATCH      | New. Disconnect observers. |

---

**ION SDK Developer Guide · v1.0 · Bloom Platform Engineering · April 2026**