# 🔌 BTIPS Synapse Protocol - Complete Specification

**Synapse** is the proprietary communication protocol that connects the Chrome Extension runtime (Cortex) with the BTIPS execution system (Brain). It enables secure, bidirectional communication between web-based AI interfaces and local system capabilities while maintaining strict security boundaries.

---

## 📋 Table of Contents

1. [Overview & Philosophy](#overview--philosophy)
2. [System Architecture](#system-architecture)
3. [Protocol Layers](#protocol-layers)
4. [Component Responsibilities](#component-responsibilities)
5. [Handshake Flow (3-Phase)](#handshake-flow-3-phase)
6. [Message Format & Encoding](#message-format--encoding)
7. [Web Page Integration (Discovery & Landing)](#web-page-integration-discovery--landing)
8. [Event Types & Payloads](#event-types--payloads)
9. [State Management](#state-management)
10. [Error Handling & Recovery](#error-handling--recovery)
11. [Security Model](#security-model)
12. [Debugging & Troubleshooting](#debugging--troubleshooting)
13. [Extension Adaptation Guide](#extension-adaptation-guide)

---

## 🎯 Overview & Philosophy

### **What is Synapse?**

Synapse is a **multi-hop communication protocol** that bridges the gap between:
- **Web-based AI interfaces** (ChatGPT, Claude, Grok, etc.) running in Chrome
- **Local execution system** (Brain, Sentinel, Nucleus) running on the developer's machine

### **Design Principles**

1. **Zero Trust Architecture**: Each hop validates identity and capabilities before forwarding messages
2. **Layered Security**: Extension → Host → Brain → Sentinel → Nucleus (each layer validates the previous)
3. **Fail-Safe by Default**: Connection failures trigger graceful degradation, not silent errors
4. **Observable Execution**: All Synapse traffic is logged to telemetry streams for audit
5. **Stateless Reconnection**: Extension can reconnect after Host/Brain restart without losing context

### **Why Not Just WebSockets?**

Synapse uses **Chrome Native Messaging** + **TCP Sockets** instead of plain WebSockets because:
- **Stronger Security**: Native Messaging requires Host binary to be registered in OS registry (prevents rogue extensions)
- **Process Isolation**: Host runs as separate process (sandbox escape protection)
- **Binary Protocol**: More efficient for large payloads (context files, artifacts)
- **Offline Capability**: Works without internet (all communication is localhost)

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CHROME BROWSER                                  │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │  Extension Runtime (Cortex)                                     │    │
│  │  ┌──────────────────────────────────────────────────────────┐  │    │
│  │  │  Web Pages (Discovery / Landing)                         │  │    │
│  │  │  - discovery.html  (Profile discovery UI)                │  │    │
│  │  │  - landing.html    (Onboarding UI)                       │  │    │
│  │  │                                                           │  │    │
│  │  │  Synapse Client (JavaScript)                             │  │    │
│  │  │  - discoveryProtocol.js                                  │  │    │
│  │  │  - landingProtocol.js                                    │  │    │
│  │  └──────────────────────────────────────────────────────────┘  │    │
│  │                            ↕                                    │    │
│  │  Content Scripts / Background Script                           │    │
│  │  - content.js (injected into AI provider pages)               │    │    
│  │  - background.js (Chrome Native Messaging bridge)             │    │
│  └────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                               ↕
                    Chrome Native Messaging
                         (stdin/stdout)
                               ↕
┌─────────────────────────────────────────────────────────────────────────┐
│  HOST SERVICE (C++)                                                     │
│  bloom-host.exe                                                         │
│                                                                         │
│  Responsibilities:                                                      │
│  - Validate extension identity                                         │
│  - Protocol version negotiation                                        │
│  - Message framing (4-byte header + JSON)                              │
│  - Forward to Brain TCP server                                         │
│  - Log all traffic to synapse_logger                                   │
└─────────────────────────────────────────────────────────────────────────┘
                               ↕
                         TCP Socket
                      127.0.0.1:5678
                               ↕
┌─────────────────────────────────────────────────────────────────────────┐
│  BRAIN ENGINE (Python)                                                  │
│  brain.exe service start                                                │
│                                                                         │
│  Responsibilities:                                                      │
│  - Synapse server (accept Host connections)                            │
│  - Execute intent payloads                                             │
│  - Generate Discovery/Landing page content                             │
│  - Manage profile state                                                │
│  - Communicate with Sentinel via Event Bus                             │
└─────────────────────────────────────────────────────────────────────────┘
                               ↕
                     Event Bus (TCP)
                      127.0.0.1:5678
                               ↕
┌─────────────────────────────────────────────────────────────────────────┐
│  SENTINEL SIDECAR (Golang)                                              │
│  sentinel.exe daemon                                                    │
│                                                                         │
│  Responsibilities:                                                      │
│  - Launch Chrome profiles                                              │
│  - Monitor profile state                                               │
│  - Route events to Nucleus                                             │
│  - Manage Ollama/Temporal runtimes                                     │
└─────────────────────────────────────────────────────────────────────────┘
                               ↕
                       JSON-RPC / HTTP
                               ↕
┌─────────────────────────────────────────────────────────────────────────┐
│  NUCLEUS CLI (Golang)                                                   │
│  nucleus.exe                                                            │
│                                                                         │
│  Responsibilities:                                                      │
│  - Governance authority                                                │
│  - Vault unlock/lock                                                   │
│  - Temporal workflow orchestration                                     │
│  - Team member management                                              │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📡 Protocol Layers

Synapse operates in **5 distinct layers**, each with specific responsibilities:

### **Layer 1: Web Page (JavaScript)**
- **Location:** `brain/core/profile/web/templates/discovery/` and `landing/`
- **Files:** `discoveryProtocol.js`, `landingProtocol.js`
- **Responsibility:** User interaction, form validation, UI state management
- **Communication:** Sends messages via `chrome.runtime.sendMessage()` to Background Script

### **Layer 2: Extension Background (JavaScript)**
- **Location:** `installer/cortex/extension/background.js`
- **Responsibility:** Bridge between web page and Native Host
- **Communication:** 
  - Receives messages from web pages via `chrome.runtime.onMessage`
  - Forwards to Native Host via `chrome.runtime.connectNative('com.bloom.host')`

### **Layer 3: Native Host (C++)**
- **Location:** `installer/host/bloom-host.cpp`
- **Responsibility:** Protocol validation, message framing, logging
- **Communication:**
  - Receives messages from Extension via stdin (Chrome Native Messaging)
  - Forwards to Brain via TCP socket (127.0.0.1:5678)
  - Binary protocol: 4-byte BigEndian length + JSON payload

### **Layer 4: Brain Synapse Server (Python)**
- **Location:** `installer/brain/core/synapse/synapse_protocol.py`
- **Responsibility:** Message routing, intent execution, state persistence
- **Communication:**
  - Accepts TCP connections from Host
  - Processes Synapse messages
  - Emits events to Event Bus for Sentinel

### **Layer 5: Event Bus (Brain ↔ Sentinel)**
- **Location:** `installer/brain/core/server/server_event_bus.py`
- **Responsibility:** Asynchronous event distribution
- **Communication:**
  - Brain publishes events (INTENT_STARTED, PROFILE_LAUNCHED, etc.)
  - Sentinel subscribes to events
  - TCP-based with sequence numbers (detect message loss)

---

## 🔧 Component Responsibilities

### **Cortex (Chrome Extension)**

**Files:**
- `installer/cortex/extension/manifest.json` - Extension manifest
- `installer/cortex/extension/background.js` - Native Messaging bridge
- `installer/cortex/extension/content.js` - AI provider page injection
- `installer/cortex/extension/synapse/discovery.synapse.config.js` - Discovery page config
- `installer/cortex/extension/synapse/landing.synapse.config.js` - Landing page config

**Responsibilities:**
1. **Load Discovery/Landing pages** (generated by Brain)
2. **Inject Synapse client** into pages
3. **Relay messages** between Web Page ↔ Native Host
4. **Manage extension state** (installation, updates)

**Key Commands (none - extension is passive):**
```javascript
// Example: Web page sends message
window.postMessage({
  type: 'SYNAPSE_SEND',
  payload: { action: 'LAUNCH_PROFILE', profile_id: 'profile_001' }
}, '*');

// Extension background.js listens
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SYNAPSE_SEND') {
    nativePort.postMessage(message.payload);
  }
});
```

---

### **Host (C++ Native Binary)**

**Files:**
- `installer/host/bloom-host.cpp` - Main entry point
- `installer/host/synapse_logger.cpp/h` - Logging subsystem
- `installer/host/chunked_buffer.cpp/h` - Binary message framing
- `installer/host/cli_handler.cpp/h` - CLI argument parsing

**Responsibilities:**
1. **Validate extension identity** (check extension ID matches expected)
2. **Negotiate protocol version** (ensure compatibility)
3. **Frame messages** (4-byte header + JSON)
4. **Forward to Brain** via TCP socket
5. **Log all traffic** for audit/debugging

**Key Commands:**
```bash
# Host runs as Native Messaging binary (invoked by Chrome)
# No direct CLI invocation - registered in Windows Registry:
# HKCU\Software\Google\Chrome\NativeMessagingHosts\com.bloom.host

# Manual test (simulate Chrome):
echo '{"type":"HANDSHAKE_INIT"}' | bloom-host.exe

# Logs location:
# AppData/Local/BloomNucleus/logs/host/synapse_host_{timestamp}.log
```

**Registry Configuration (Windows):**
```json
{
  "name": "com.bloom.host",
  "description": "Bloom Synapse Native Messaging Host",
  "path": "C:\\Users\\{user}\\AppData\\Local\\BloomNucleus\\bin\\host\\bloom-host.exe",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://bloom-cortex-extension-id/"
  ]
}
```

---

### **Brain (Python Engine)**

**Files:**
- `installer/brain/cli/synapse/synapse_host_cli.py` - Synapse CLI commands
- `installer/brain/core/synapse/synapse_protocol.py` - Protocol implementation
- `installer/brain/core/synapse/synapse_manager.py` - Connection manager
- `installer/brain/core/profile/web/discovery_generator.py` - Discovery page generator
- `installer/brain/core/profile/web/landing_generator.py` - Landing page generator

**Responsibilities:**
1. **Run Synapse server** (TCP listener on port 5678)
2. **Accept Host connections**
3. **Execute intent payloads** from Extension
4. **Generate Discovery/Landing pages** dynamically
5. **Publish events** to Event Bus (for Sentinel)

**Key Commands:**
```bash
# Start Synapse host mode (listener loop)
brain synapse host

# Close connection (send termination signal)
brain synapse close

# Check Synapse health
brain health native-ping --timeout 5000

# Full stack check (includes Synapse)
brain health full-stack --json

# Example output:
{
  "host": {
    "status": "healthy",
    "pid": 12345,
    "uptime_seconds": 3600
  },
  "synapse": {
    "connected": true,
    "protocol_version": "3.0",
    "session_active": true
  }
}
```

---

### **Sentinel (Golang Daemon)**

**Files:**
- `installer/sentinel/internal/orchestration/profile_lifecycle.go` - Profile launch/monitor
- `installer/sentinel/internal/bridge/json_rpc.go` - JSON-RPC server for Conductor

**Responsibilities:**
1. **Launch Chrome profiles** with Cortex extension
2. **Monitor profile state** (running/stopped/crashed)
3. **Route Synapse events** to Nucleus
4. **Manage extension deployment** (.blx to profile folder)

**Key Commands:**
```bash
# Launch profile with Synapse
sentinel launch profile_001 --mode landing

# Launch with custom extension
sentinel launch profile_001 --override-extension bloom-cortex-v2.0.0

# Monitor profile state
sentinel listen --filter profile_001

# Example event:
{
  "type": "PROFILE_LAUNCHED",
  "profile_id": "profile_001",
  "chrome_pid": 9876,
  "debug_port": 9222,
  "extension_loaded": true,
  "synapse_connected": true,
  "timestamp": 1707418080
}
```

---

### **Nucleus (Golang CLI)**

**Files:**
- `installer/nucleus/internal/orchestration/commands/synapse.go` - Synapse commands

**Responsibilities:**
1. **Authorize profile launches** (validate user permissions)
2. **Trigger Synapse operations** via Sentinel
3. **Monitor Vault state** during Synapse operations

**Key Commands:**
```bash
# Launch profile via Nucleus (highest authority)
nucleus synapse launch profile_001 --email test@mail.com --service google

# Launch in discovery mode
nucleus synapse launch profile_001 --mode discovery --save

# Shutdown all Synapse-connected services
nucleus synapse shutdown-all

# Check Vault status (required for API key access)
nucleus synapse vault-status

# Start Ollama via Synapse orchestration
nucleus synapse start-ollama --simulation

# Example JSON output:
{
  "success": true,
  "profile_id": "profile_001",
  "launch_id": "launch_abc123",
  "chrome_pid": 9876,
  "debug_port": 9222,
  "extension_loaded": true,
  "state": "RUNNING",
  "timestamp": 1707418080
}
```

---

## 🤝 Handshake Flow (3-Phase)

The Synapse handshake is a **3-phase mutual authentication** protocol:

### **Phase 1: Extension → Host (INIT)**

**Trigger:** Extension background.js connects to Native Host

```javascript
// Extension: background.js
const nativePort = chrome.runtime.connectNative('com.bloom.host');

nativePort.postMessage({
  type: "HANDSHAKE_INIT",
  extension_id: "bloom-cortex-v1.2.3",
  protocol_version: "3.0",
  capabilities: ["intent_execution", "vault_access", "profile_launch"],
  timestamp: Date.now()
});
```

**Host validates:**
- Extension ID matches allowed_origins in registry
- Protocol version is compatible (major version must match)
- Capabilities are within allowed set

---

### **Phase 2: Host → Extension (ACK)**

**Trigger:** Host validates Phase 1, generates session token

```cpp
// Host: bloom-host.cpp
json response = {
  {"type", "HANDSHAKE_ACK"},
  {"host_version", "2.1.0"},
  {"session_token", generateSessionToken(extension_id, timestamp, nonce)},
  {"allowed_operations", {"READ_INTENT", "WRITE_ARTIFACT", "LAUNCH_PROFILE"}},
  {"timestamp", getCurrentTimestamp()}
};

sendToExtension(response);
forwardToBrain(response); // Also notify Brain
```

**Extension validates:**
- Host version is compatible
- Session token is well-formed (not empty, valid format)
- Allowed operations match requested capabilities

---

### **Phase 3: Brain → Host → Extension (CHANNEL_READY)**

**Trigger:** Brain confirms it's ready to receive Synapse messages

```python
# Brain: synapse_protocol.py
def handle_handshake_ack(self, message):
    profile_id = self.get_profile_from_session(message['session_token'])
    
    channel_ready = {
        "type": "CHANNEL_READY",
        "profile_id": profile_id,
        "session_token": message['session_token'],
        "brain_version": "3.2.0",
        "capabilities": ["intent_execution", "context_generation"],
        "timestamp": time.time()
    }
    
    self.send_to_host(channel_ready)
    self.publish_event("SYNAPSE_CONNECTED", profile_id)
```

**Host forwards to Extension:**
```cpp
// Host relays CHANNEL_READY back to Extension
forwardToExtension(brain_response);
logSynapseEvent("CHANNEL_READY", profile_id);
```

**Extension updates UI:**
```javascript
// Extension: background.js
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CHANNEL_READY') {
    // Notify web pages that Synapse is ready
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'SYNAPSE_READY',
          profile_id: message.profile_id
        });
      });
    });
  }
});
```

---

### **Handshake Failure Modes**

| Failure Point | Error | Recovery |
|---------------|-------|----------|
| Extension ID mismatch | `HANDSHAKE_FAILED: Invalid extension ID` | Update registry or rebuild extension with correct ID |
| Protocol version incompatible | `HANDSHAKE_FAILED: Protocol version mismatch (expected 3.x, got 2.x)` | Update Host or Extension to compatible version |
| Brain not responding | `HANDSHAKE_TIMEOUT: Brain server unreachable` | Start Brain: `brain service start` |
| Session token expired | `SESSION_EXPIRED` | Trigger re-handshake from Extension |

---

## 📦 Message Format & Encoding

### **Chrome Native Messaging Format (Extension ↔ Host)**

**Binary Layout:**
```
[4 bytes: uint32 length (little-endian)] [N bytes: UTF-8 JSON]
```

**Example:**
```python
import struct
import json

message = {"type": "HANDSHAKE_INIT", "extension_id": "bloom-cortex"}
payload = json.dumps(message).encode('utf-8')
length = struct.pack('<I', len(payload))  # Little-endian uint32

# Send to stdout (Host receives on stdin)
sys.stdout.buffer.write(length)
sys.stdout.buffer.write(payload)
sys.stdout.buffer.flush()
```

---

### **TCP Socket Format (Host ↔ Brain)**

**Binary Layout:**
```
[4 bytes: uint32 length (big-endian)] [N bytes: UTF-8 JSON]
```

**Example (C++):**
```cpp
// Host: bloom-host.cpp
void sendToBrain(const json& message) {
    std::string payload = message.dump();
    uint32_t length = htonl(payload.size());  // Big-endian for network
    
    // Send length header
    write(brain_socket, &length, 4);
    
    // Send payload
    write(brain_socket, payload.c_str(), payload.size());
}
```

**Example (Python):**
```python
# Brain: synapse_protocol.py
import struct
import socket

def send_message(sock, message):
    payload = json.dumps(message).encode('utf-8')
    length = struct.pack('>I', len(payload))  # Big-endian uint32
    
    sock.sendall(length)
    sock.sendall(payload)

def receive_message(sock):
    # Read 4-byte header
    length_data = sock.recv(4)
    if len(length_data) < 4:
        raise ConnectionError("Incomplete message header")
    
    length = struct.unpack('>I', length_data)[0]
    
    # Read payload
    payload = b''
    while len(payload) < length:
        chunk = sock.recv(length - len(payload))
        if not chunk:
            raise ConnectionError("Connection closed")
        payload += chunk
    
    return json.loads(payload.decode('utf-8'))
```

---

## 🌐 Web Page Integration (Discovery & Landing)

### **Discovery Page**

**Purpose:** Allow users to explore available profiles and AI accounts

**Files:**
- Template: `installer/brain/core/profile/web/templates/discovery/index.html`
- Protocol: `installer/brain/core/profile/web/templates/discovery/discoveryProtocol.js`
- Styles: `installer/brain/core/profile/web/templates/discovery/styles.css`

**Synapse Integration:**

```javascript
// discoveryProtocol.js

// Send message to extension
function sendSynapseMessage(action, data) {
  window.postMessage({
    type: 'SYNAPSE_SEND',
    payload: {
      action: action,
      ...data
    }
  }, '*');
}

// Example: Request profile list
sendSynapseMessage('GET_PROFILES', {});

// Listen for responses
window.addEventListener('message', (event) => {
  if (event.data.type === 'SYNAPSE_RESPONSE') {
    const { action, result } = event.data.payload;
    
    if (action === 'GET_PROFILES') {
      displayProfiles(result.profiles);
    }
  }
});
```

**Dynamic Generation:**

Discovery page is **generated dynamically** by Brain based on current system state:

```python
# Brain: core/profile/web/discovery_generator.py

def generate_discovery_page(profile_id):
    profiles = get_all_profiles()
    accounts = get_linked_accounts(profile_id)
    
    template = load_template('discovery/index.html')
    
    # Inject current state into page
    page_data = {
        'profiles': profiles,
        'accounts': accounts,
        'profile_id': profile_id,
        'timestamp': time.time()
    }
    
    rendered = template.render(**page_data)
    
    # Write to profile's discovery page location
    discovery_path = f"{profile_dir}/discovery/index.html"
    with open(discovery_path, 'w') as f:
        f.write(rendered)
    
    return discovery_path
```

---

### **Landing Page**

**Purpose:** Onboarding flow for new profiles

**Files:**
- Template: `installer/brain/core/profile/web/templates/landing/index.html`
- Protocol: `installer/brain/core/profile/web/templates/landing/landingProtocol.js`
- Config: `installer/brain/core/profile/web/templates/landing/landing.synapse.config.js`

**Synapse Integration:**

```javascript
// landingProtocol.js

// Step 1: Register profile
function registerProfile(alias, role, email, service) {
  sendSynapseMessage('REGISTER_PROFILE', {
    alias: alias,
    role: role,
    email: email,
    service: service,  // 'google', 'twitter', 'github'
    step: 1
  });
}

// Step 2: Link AI account
function linkAIAccount(provider, email, status) {
  sendSynapseMessage('LINK_ACCOUNT', {
    provider: provider,  // 'openai', 'anthropic', 'xai'
    email: email,
    status: status  // 'active', 'pending'
  });
}

// Step 3: Complete onboarding
function completeOnboarding() {
  sendSynapseMessage('COMPLETE_ONBOARDING', {
    profile_id: getCurrentProfileId()
  });
}
```

**Onboarding State Machine:**

```
START → REGISTER_PROFILE → LINK_ACCOUNTS → VERIFY_VAULT → COMPLETE
  ↓            ↓                  ↓               ↓            ↓
  0            1                  2               3            4 (done)
```

Each step is persisted in `profiles.json`:

```json
{
  "profile_001": {
    "alias": "Master Profile",
    "role": "master",
    "onboarding_step": 4,
    "accounts": [
      {
        "provider": "openai",
        "email": "user@example.com",
        "status": "active"
      }
    ]
  }
}
```

---

## 📨 Event Types & Payloads

### **Core Synapse Events**

#### **1. HANDSHAKE_INIT**
```json
{
  "type": "HANDSHAKE_INIT",
  "extension_id": "bloom-cortex-v1.2.3",
  "protocol_version": "3.0",
  "capabilities": ["intent_execution", "vault_access"],
  "timestamp": 1707418080
}
```

#### **2. HANDSHAKE_ACK**
```json
{
  "type": "HANDSHAKE_ACK",
  "host_version": "2.1.0",
  "session_token": "sha256_abc123...",
  "allowed_operations": ["READ_INTENT", "WRITE_ARTIFACT"],
  "timestamp": 1707418080
}
```

#### **3. CHANNEL_READY**
```json
{
  "type": "CHANNEL_READY",
  "profile_id": "profile_001",
  "session_token": "sha256_abc123...",
  "brain_version": "3.2.0",
  "capabilities": ["intent_execution", "context_generation"],
  "timestamp": 1707418080
}
```

---

### **Profile Management Events**

#### **4. LAUNCH_PROFILE**
```json
{
  "type": "LAUNCH_PROFILE",
  "profile_id": "profile_001",
  "mode": "landing",  // or "discovery"
  "config": {
    "email": "user@example.com",
    "service": "google",
    "register": true,
    "heartbeat": true
  }
}
```

#### **5. PROFILE_LAUNCHED**
```json
{
  "type": "PROFILE_LAUNCHED",
  "profile_id": "profile_001",
  "launch_id": "launch_abc123",
  "chrome_pid": 9876,
  "debug_port": 9222,
  "extension_loaded": true,
  "synapse_connected": true,
  "page_url": "file:///path/to/landing/index.html",
  "timestamp": 1707418080
}
```

#### **6. REGISTER_PROFILE**
```json
{
  "type": "REGISTER_PROFILE",
  "alias": "Developer Profile",
  "role": "architect",
  "email": "dev@example.com",
  "service": "google",
  "step": 1
}
```

#### **7. LINK_ACCOUNT**
```json
{
  "type": "LINK_ACCOUNT",
  "profile_id": "profile_001",
  "provider": "openai",
  "email": "user@example.com",
  "status": "active"
}
```

---

### **Intent Execution Events**

#### **8. EXECUTE_INTENT**
```json
{
  "type": "EXECUTE_INTENT",
  "intent_id": "dev_2024-02-08_001",
  "intent_type": "dev",
  "project": "project-alpha",
  "payload": {
    "task": "Implement user authentication",
    "context": ["src/auth/", "docs/security.md"]
  }
}
```

#### **9. INTENT_PROGRESS**
```json
{
  "type": "INTENT_PROGRESS",
  "intent_id": "dev_2024-02-08_001",
  "progress": 0.45,  // 0.0 to 1.0
  "message": "Generating authentication handlers...",
  "timestamp": 1707418080
}
```

#### **10. INTENT_COMPLETED**
```json
{
  "type": "INTENT_COMPLETED",
  "intent_id": "dev_2024-02-08_001",
  "result": {
    "files_modified": ["src/auth/login.ts", "src/auth/session.ts"],
    "artifacts": ["auth-diagram.png"],
    "test_results": "PASS (12/12)"
  },
  "timestamp": 1707418080
}
```

---

### **Vault Events**

#### **11. VAULT_GET_KEY**
```json
{
  "type": "VAULT_GET_KEY",
  "key_id": "openai_api_key",
  "requester": "brain.exe",
  "profile_id": "profile_001"
}
```

#### **12. VAULT_KEY_RECEIVED**
```json
{
  "type": "VAULT_KEY_RECEIVED",
  "key_id": "openai_api_key",
  "key_value": "sk-...",  // Encrypted in transit, only in RAM
  "timestamp": 1707418080
}
```

---

## 🔄 State Management

### **Extension State**

Stored in Chrome's `chrome.storage.local`:

```javascript
// Store Synapse connection state
chrome.storage.local.set({
  synapse_connected: true,
  session_token: 'sha256_abc123...',
  profile_id: 'profile_001',
  last_handshake: Date.now()
});

// Retrieve state
chrome.storage.local.get(['synapse_connected'], (result) => {
  if (result.synapse_connected) {
    console.log('Synapse is connected');
  }
});
```

---

### **Host State**

Host is **stateless** - it only validates and forwards messages. No state persisted.

---

### **Brain State**

Stored in filesystem:

**Profile State:**
```
AppData/Local/BloomNucleus/config/profiles.json
```

```json
{
  "profile_001": {
    "alias": "Master Profile",
    "role": "master",
    "chrome_pid": 9876,
    "debug_port": 9222,
    "synapse_session": "sha256_abc123...",
    "last_activity": 1707418080,
    "onboarding_step": 4,
    "accounts": [...]
  }
}
```

**Synapse Sessions:**
```
AppData/Local/BloomNucleus/logs/synapse_sessions.json
```

```json
{
  "sessions": [
    {
      "session_token": "sha256_abc123...",
      "profile_id": "profile_001",
      "extension_id": "bloom-cortex-v1.2.3",
      "started_at": 1707418080,
      "last_activity": 1707418200,
      "status": "active"
    }
  ]
}
```

---

## ⚠️ Error Handling & Recovery

### **Connection Failures**

| Scenario | Detection | Recovery |
|----------|-----------|----------|
| **Host crashed** | Extension detects disconnected Native Port | Extension shows reconnect UI, retries every 5s |
| **Brain crashed** | Host detects closed TCP socket | Host logs error, waits for Brain restart |
| **Extension crashed** | Host detects EOF on stdin | Host closes TCP connection, logs event |
| **Chrome closed** | Brain detects no messages for 60s | Brain publishes `PROFILE_STOPPED` event |

---

### **Protocol Errors**

| Error | Cause | Response |
|-------|-------|----------|
| `PROTOCOL_VERSION_MISMATCH` | Extension v3.0, Host v2.x | Extension shows "Update required" dialog |
| `INVALID_SESSION_TOKEN` | Token expired or tampered | Extension triggers re-handshake |
| `CAPABILITY_DENIED` | Extension requests disallowed operation | Host returns `PERMISSION_DENIED` |
| `MESSAGE_TOO_LARGE` | Payload exceeds 10MB limit | Host returns `PAYLOAD_TOO_LARGE` |

---

### **Graceful Degradation**

If Synapse connection fails, the system degrades gracefully:

1. **Extension detects failure** → Shows UI notification
2. **User can retry** → Click "Reconnect" button
3. **If Brain is down** → Extension suggests: "Run `brain service start`"
4. **If Host is missing** → Extension suggests: "Reinstall Bloom Nucleus"

---

## 🔐 Security Model

### **Trust Boundaries**

```
Extension (UNTRUSTED) 
  → validates extension_id
Host (TRUSTED VALIDATOR) 
  → validates protocol_version, session_token
Brain (TRUSTED EXECUTOR) 
  → validates permissions, executes intents
Sentinel (GOVERNANCE ENFORCER) 
  → validates role-based access
Nucleus (ULTIMATE AUTHORITY) 
  → validates vault state, team membership
```

Each layer **validates the previous layer** before forwarding messages.

---

### **Attack Mitigation**

| Attack Vector | Mitigation |
|---------------|------------|
| **Malicious Extension** | Host checks extension ID in registry, blocks unregistered extensions |
| **Message Tampering** | Session tokens are SHA-256 hashed (extension_id + timestamp + nonce) |
| **Replay Attacks** | Timestamps are checked, messages older than 60s are rejected |
| **DoS (Large Payloads)** | Host enforces 10MB limit, rejects oversized messages |
| **Session Hijacking** | Session tokens are bound to specific profile_id and extension_id |

---

## 🛠️ Debugging & Troubleshooting

### **Check Synapse Health**

```bash
# Full stack check
brain health full-stack --json

# Specific Synapse check
brain health native-ping --timeout 5000

# Check WebSocket status (if using WS mode)
brain health websocket-status --test-sub
```

**Example Output:**
```json
{
  "synapse": {
    "status": "healthy",
    "connected": true,
    "protocol_version": "3.0",
    "session_active": true,
    "last_message": 1707418080
  },
  "host": {
    "status": "running",
    "pid": 12345,
    "uptime_seconds": 3600
  }
}
```

---

### **View Synapse Logs**

**Host Logs:**
```
AppData/Local/BloomNucleus/logs/host/synapse_host_{timestamp}.log
```

**Brain Logs:**
```
AppData/Local/BloomNucleus/logs/brain/synapse_server_{timestamp}.log
```

**Event Bus Logs:**
```
AppData/Local/BloomNucleus/logs/telemetry.json
```

Filter for Synapse events:
```bash
cat telemetry.json | jq 'select(.event | contains("SYNAPSE"))'
```

---

### **Manual Testing**

**Test Extension → Host:**
```javascript
// In Extension console (chrome://extensions → Inspect views)
chrome.runtime.sendNativeMessage('com.bloom.host', {
  type: 'HANDSHAKE_INIT',
  extension_id: 'bloom-cortex',
  protocol_version: '3.0'
}, (response) => {
  console.log('Host response:', response);
});
```

**Test Host → Brain:**
```bash
# Simulate Host sending message to Brain
echo '{"type":"CHANNEL_READY","profile_id":"test"}' | nc localhost 5678
```

---

### **Common Issues**

#### **Issue: "Native Host not found"**
**Cause:** Registry entry missing or incorrect path

**Fix:**
```bash
# Check registry (Windows)
reg query HKCU\Software\Google\Chrome\NativeMessagingHosts\com.bloom.host

# If missing, reinstall:
cd AppData/Local/BloomNucleus/bin/host
bloom-host.exe --register
```

---

#### **Issue: "Protocol version mismatch"**
**Cause:** Extension and Host have incompatible major versions

**Fix:**
```bash
# Check versions
bloom-host.exe --version
# Extension version: chrome://extensions → Details

# Update Host:
nucleus metamorph reconcile --manifest latest_host.json

# Or update Extension:
sentinel seed profile_001 true  # Re-deploy latest extension
```

---

#### **Issue: "Session expired"**
**Cause:** Session token TTL exceeded (default 30 minutes)

**Fix:**
```javascript
// Extension triggers re-handshake
function reconnectSynapse() {
  nativePort = chrome.runtime.connectNative('com.bloom.host');
  // Handshake will restart automatically
}
```

---

## 🔧 Extension Adaptation Guide

### **When UI Changes on AI Provider Sites**

If an AI provider (e.g., ChatGPT, Claude) updates their UI and breaks Synapse integration:

#### **Step 1: Identify Breaking Changes**

```javascript
// Old selector (broken)
const chatInput = document.querySelector('#prompt-textarea');

// New selector (after UI update)
const chatInput = document.querySelector('[data-testid="chat-input"]');
```

#### **Step 2: Update Content Script**

**File:** `installer/cortex/extension/content.js`

```javascript
// content.js

// Define selectors for different providers
const SELECTORS = {
  chatgpt: {
    input: '[data-testid="chat-input"]',  // UPDATED
    submit: 'button[type="submit"]',
    response: '.markdown-body'
  },
  claude: {
    input: 'textarea[placeholder*="Message"]',  // UPDATED
    submit: 'button[aria-label="Send"]',
    response: '.claude-response'
  },
  grok: {
    input: '#grok-input',
    submit: '.grok-submit',
    response: '.grok-output'
  }
};

// Inject Synapse client when page loads
function injectSynapseClient() {
  const provider = detectProvider();  // 'chatgpt', 'claude', 'grok'
  const selectors = SELECTORS[provider];
  
  // Find current input field
  const inputField = document.querySelector(selectors.input);
  
  if (!inputField) {
    console.error('[Synapse] Input field not found, selectors may be outdated');
    return;
  }
  
  // Inject Synapse UI overlay
  const synapseOverlay = createSynapseOverlay();
  document.body.appendChild(synapseOverlay);
  
  // Listen for intent execution requests
  window.addEventListener('message', handleSynapseMessage);
}

injectSynapseClient();
```

#### **Step 3: Update Discovery/Landing Pages**

**File:** `installer/brain/core/profile/web/templates/discovery/discoveryProtocol.js`

```javascript
// discoveryProtocol.js

// Update Synapse message handler
function handleSynapseResponse(event) {
  if (event.data.type === 'SYNAPSE_RESPONSE') {
    const { action, result } = event.data.payload;
    
    // Handle different response types
    switch (action) {
      case 'GET_PROFILES':
        displayProfiles(result.profiles);
        break;
      
      case 'LINK_ACCOUNT':
        updateAccountStatus(result.account);
        break;
      
      // ADD NEW HANDLERS HERE
      case 'CUSTOM_ACTION':
        handleCustomAction(result);
        break;
    }
  }
}
```

#### **Step 4: Rebuild Extension**

```bash
cd installer/cortex/build-cortex
python package.py

# This creates: installer/native/bin/cortex/bloom-cortex.blx
```

#### **Step 5: Deploy Updated Extension**

```bash
# Option A: Deploy to specific profile
sentinel seed profile_001 false

# Option B: Deploy to all profiles
for profile in $(ls AppData/Local/BloomNucleus/profiles/); do
  sentinel seed $profile false
done

# Option C: Update via Metamorph (production)
nucleus metamorph reconcile --manifest cortex_update.json
```

---

### **Adding New Synapse Event Types**

#### **Step 1: Define Event Schema**

**File:** `installer/contracts/websocket-protocol.ts`

```typescript
// Add new event type
export type SynapseEventType = 
  | 'HANDSHAKE_INIT'
  | 'CHANNEL_READY'
  | 'CUSTOM_NEW_EVENT';  // NEW

export interface CustomNewEvent {
  type: 'CUSTOM_NEW_EVENT';
  custom_field: string;
  timestamp: number;
}
```

#### **Step 2: Handle in Host**

**File:** `installer/host/bloom-host.cpp`

```cpp
// bloom-host.cpp

void handleIncomingMessage(const json& message) {
    std::string type = message["type"];
    
    if (type == "CUSTOM_NEW_EVENT") {
        logSynapseEvent("CUSTOM_NEW_EVENT", message["custom_field"]);
        forwardToBrain(message);
    }
    // ... existing handlers
}
```

#### **Step 3: Handle in Brain**

**File:** `installer/brain/core/synapse/synapse_protocol.py`

```python
# synapse_protocol.py

def handle_message(self, message):
    msg_type = message.get('type')
    
    if msg_type == 'CUSTOM_NEW_EVENT':
        self.handle_custom_event(message)
    # ... existing handlers

def handle_custom_event(self, message):
    custom_field = message['custom_field']
    
    # Execute custom logic
    result = self.execute_custom_logic(custom_field)
    
    # Publish to Event Bus
    self.publish_event('CUSTOM_EVENT_COMPLETED', {
        'custom_field': custom_field,
        'result': result
    })
    
    # Send response back to Extension
    self.send_response({
        'type': 'CUSTOM_EVENT_RESPONSE',
        'result': result
    })
```

#### **Step 4: Update Extension**

**File:** `installer/cortex/extension/background.js`

```javascript
// background.js

// Listen for custom event from web page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRIGGER_CUSTOM_EVENT') {
    // Forward to Host
    nativePort.postMessage({
      type: 'CUSTOM_NEW_EVENT',
      custom_field: message.customField,
      timestamp: Date.now()
    });
  }
});

// Handle response from Host
nativePort.onMessage.addListener((message) => {
  if (message.type === 'CUSTOM_EVENT_RESPONSE') {
    // Notify all tabs
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'CUSTOM_EVENT_COMPLETED',
          result: message.result
        });
      });
    });
  }
});
```

---

### **Testing New Synapse Features**

```bash
# 1. Start Brain in verbose mode
brain service start --verbose

# 2. Launch profile with new extension
sentinel launch profile_001 --override-extension bloom-cortex-v2.0.0

# 3. Monitor Synapse events in real-time
sentinel listen --filter CUSTOM_NEW_EVENT

# 4. Check logs for errors
tail -f AppData/Local/BloomNucleus/logs/host/synapse_host_*.log
tail -f AppData/Local/BloomNucleus/logs/brain/synapse_server_*.log
```

---

## 📚 Related Documentation

| Document | Purpose |
|----------|---------|
| **[BTIPS-SECURITY-COMPLIANCE.md](./BTIPS-SECURITY-COMPLIANCE.md)** | Security model, Vault architecture |
| **[BTIPS-TECHNICAL-OVERVIEW.md](./BTIPS-TECHNICAL-OVERVIEW.md)** | System architecture, component hierarchy |
| **[BTIPS-MODULE-NUCLEUS.md](./BTIPS-MODULE-NUCLEUS.md)** | Nucleus CLI, governance commands |
| **[BTIPS-MODULE-SENTINEL.md](./BTIPS-MODULE-SENTINEL.md)** | Profile lifecycle, Event Bus |
| **[BTIPS-MODULE-BRAIN.md](./BTIPS-MODULE-BRAIN.md)** | Intent execution, context generation |

---

## 🎯 Quick Reference

### **Start Synapse Stack**

```bash
# 1. Start Brain
brain service start

# 2. Start Sentinel
sentinel daemon

# 3. Launch profile
nucleus synapse launch profile_001 --mode landing

# 4. Monitor
sentinel cockpit --health
```

### **Rebuild Extension**

```bash
cd installer/cortex/build-cortex
python package.py
sentinel seed profile_001 false
```

### **Debug Connection**

```bash
brain health full-stack --json
sentinel listen --filter SYNAPSE
tail -f AppData/Local/BloomNucleus/logs/telemetry.json | jq 'select(.event | contains("SYNAPSE"))'
```

---

*Last Updated: February 8, 2024*  
*Protocol Version: 3.0*  
*Synapse Architecture: Multi-Hop Validated Communication*
