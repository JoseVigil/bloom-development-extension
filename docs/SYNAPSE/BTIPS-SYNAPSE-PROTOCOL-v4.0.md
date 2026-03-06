# BTIPS — SYNAPSE PROTOCOL v4.0
**Complete Architecture & Flow Reference**
*Platform Engineering · March 2026*

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Complete Round-Trip Flow](#3-complete-round-trip-flow)
4. [Brain Event Bus — Message Reference](#4-brain-event-bus--message-reference)
5. [Sentinel Client — Sync/Async Bridge](#5-sentinel-client--syncasync-bridge)
6. [Cortex Pages — Discovery & Landing](#6-cortex-pages--discovery--landing)
7. [Adding New Commands — Files to Touch](#7-adding-new-commands--files-to-touch)
8. [Port Architecture Decision Log](#8-port-architecture-decision-log)
9. [Logging & Debugging Reference](#9-logging--debugging-reference)
10. [Quick Reference](#10-quick-reference)

---

## 1. Overview

Synapse is the multi-hop communication backbone of BTIPS. It connects every layer of the system — from the Electron desktop application through Nucleus, Temporal, Sentinel, Brain, the Native Host binary, and finally the Cortex Chrome extension running inside a managed Chrome profile — and back again.

This document is the single source of truth for:
- The complete flow in both directions (IDA and VUELTA)
- Exact files that must be touched to add new functionality
- The port architecture decision and rationale
- Message contracts between every component

> **Design Principle:** One TCP port (5678). One Brain server. All clients — `bloom-host.exe` instances and Sentinel — connect to the same endpoint and self-identify via registration messages. The Event Bus is not a separate network server; it is the in-process broadcast layer of the Brain `ServerManager`.

---

## 2. System Architecture

### 2.1 Component Stack

The system has seven distinct layers. Each layer speaks to adjacent layers only.

| Layer | Component | Language | Role |
|-------|-----------|----------|------|
| 1 | Electron App | Node.js | UI host, spawns nucleus CLI as child process |
| 2 | Nucleus CLI | Go | Governance authority, Temporal workflow entry point |
| 3 | Temporal + Worker | Go | Durable workflow orchestrator, activity executor |
| 4 | Sentinel | Go | Profile lifecycle manager, Brain TCP client |
| 5 | Brain ServerManager | Python | TCP server :5678, event bus, profile state, routing |
| 6 | bloom-host.exe | C++ | Chrome Native Messaging host, Brain TCP client |
| 7 | Cortex Extension | JavaScript | Chrome extension, UI pages (discovery / landing) |

### 2.2 Network Topology

All communication is localhost. There is no external network dependency at runtime.

```
Electron (Node.js)
  └─ spawn()  stdout/stderr
       └─ nucleus CLI (Go)
             └─ Temporal gRPC  :7233
                   └─ Nucleus Worker (Go)
                         └─ SentinelClient.Connect()  TCP :5678
                               └─ Brain ServerManager (Python)  :5678
                                     ├─ bloom-host.exe (C++)  TCP :5678
                                     │     └─ Chrome Native Messaging  stdin/stdout
                                     │           └─ Cortex background.js
                                     │                 └─ chrome.storage / runtime.sendMessage
                                     │                       └─ discovery.js / landing.js
                                     └─ EventBus (in-process)
                                           └─ events.jsonl  (disk persistence)
```

### 2.3 The Brain TCP Server — One Port, Two Client Types

The Brain `ServerManager` listens on a single TCP socket at `127.0.0.1:5678`. There is no separate "Event Bus port". The distinction between clients is made at the application layer via the first message each client sends after connecting:

| Registration Message | Client Type | Who Sends It | What Brain Does |
|----------------------|-------------|--------------|-----------------|
| `REGISTER_CLI` / `REGISTER_SENTINEL` | `cli` | Sentinel (Go) | Tags writer as `type=cli`. All broadcast events are delivered to `cli` clients. |
| `REGISTER_HOST` | `host` | bloom-host.exe (C++) | Tags writer as `type=host`. Registers `profile_id` in `profile_registry`. Sets profile online. |

> **Architecture Decision — Why One Port:** Splitting into two ports (e.g. `:5678` for hosts, `:5679` for sentinels) would require the `ServerManager` to share mutable state between two asyncio servers — increasing complexity and failure surface. The `_broadcast_event` logic needs both registries simultaneously. Log differentiation by client type is achievable with zero network changes by branching on `client_info["type"]` in `_log_traffic`. **Decision: keep one port, differentiate by registration message.**

---

## 3. Complete Round-Trip Flow

### 3.1 Outbound — Electron to Chrome Profile (IDA)

#### Phase 1 — CLI & Temporal

**1.** Electron spawns nucleus as a child process:

```bash
spawn("nucleus", ["--json", "synapse", "launch", "profile_001", "--mode", "discovery"])
```

The process blocks on stdout. Electron reads the result when nucleus exits.

**2.** nucleus CLI enters `createLaunchSubcommand()` in `internal/orchestration/commands/synapse.go` and calls `tc.ExecuteLaunchWorkflow()`. This call blocks internally via `we.Get(ctx, &result)` — a Temporal SDK call that waits for the workflow to complete.

**3.** Temporal Server (`:7233`) receives the workflow start request. It assigns the workflow to the Nucleus Worker listening on task queue `profile-orchestration`.

#### Phase 2 — Sentinel Activity

**4.** The Nucleus Worker executes `SentinelActivities.LaunchSentinelActivity()` from `sentinel_activities.go`. This activity:
- Instantiates a `SentinelClient`
- Calls `client.Connect()` → TCP dial to `127.0.0.1:5678`
- Sends `REGISTER_CLI` → Brain responds `REGISTER_ACK { role: "cli" }`

**5.** Activity calls `HostInitSync(profileID, launchID, bloomRoot, timeout)`:
- Sends `HOST_INIT { profile_id, launch_id, bloom_root }`
- Registers `sc.On("HOST_INIT_ACK", handler)` — handler correlates by `launch_id`
- Brain executes `SynapseHostInitManager.init_host()` in an executor thread
- Brain sends `HOST_INIT_ACK { launch_id, status: "ok", data: paths }`
- Handler receives ACK, writes to `resultCh`, `HostInitSync` unblocks

**6.** Activity calls `LaunchProfileSyncWithHeartbeat(profileID, launchID, specPath, mode, timeout, heartbeatFn)`:
- Registers `sc.On("LAUNCH_PROFILE_ACK", handler)` — handler correlates by `launch_id`
- Sends `LAUNCH_PROFILE { profile_id, launch_id, spec_path, mode }`
- Every 10 seconds: calls `heartbeatFn()` → `activity.RecordHeartbeat(ctx)` to keep Temporal alive

#### Phase 3 — Brain Launches Chrome

**7.** Brain `ServerManager` receives `LAUNCH_PROFILE`. It:
- Reads `ignition_spec.json` from `spec_path` (prepared by Sentinel)
- Calls `ProfileManager.launch_profile()` in an executor thread
- `bloom-launcher` starts Chrome with the profile directory and extension
- Chrome process starts, returns PID
- Brain adds event `PROFILE_LAUNCHED` to EventBus → persisted to `events.jsonl`
- Brain `_broadcast_event(PROFILE_LAUNCHED)` to all `cli` Sentinels
- Brain sends `LAUNCH_PROFILE_ACK { launch_id, status: "ok", pid: N }` to the requesting Sentinel

**8.** Sentinel handler receives `LAUNCH_PROFILE_ACK`, correlates `launch_id`, writes `pid` to `resultCh`. `LaunchProfileSyncWithHeartbeat` unblocks and returns `(chromePID, nil)`.

**9.** The Temporal Activity completes with `LaunchResult { chrome_pid: N, debug_port: 9222, state: READY }`. Temporal marks the workflow done. nucleus CLI receives the result from `we.Get()`, calls `outputJSON()`, prints to stdout, and exits.

**10.** Electron receives the stdout JSON:

```json
{ "success": true, "chrome_pid": 12345, "debug_port": 9222, "state": "READY", ... }
```

#### Phase 4 — Chrome Connects Back to Brain

**11.** Chrome opens with the managed profile. Cortex extension loads. `background.js` calls `chrome.runtime.connectNative("com.bloom.host")` which launches `bloom-host.exe` via Chrome Native Messaging.

**12.** `bloom-host.exe` connects to Brain TCP `:5678` and sends:
```json
{ "type": "REGISTER_HOST", "profile_id": "...", "pid": 12345, "launch_id": "..." }
```
Brain responds `REGISTER_ACK`, sets profile online in `ProfileStateManager`, registers the writer in `profile_registry[profile_id]`.

**13.** When the handshake completes, `bloom-host.exe` sends `PROFILE_CONNECTED { profile_id }`. Brain calls `confirm_handshake()`, adds `PROFILE_CONNECTED` event to EventBus, and broadcasts to all Sentinels.

---

### 3.2 Return Path — Chrome Page to Electron (VUELTA)

#### Discovery Page Return

The Discovery page (`discovery.js` + `discoveryProtocol.js`) operates in polling mode. It does not receive push messages from Brain directly — it communicates exclusively with `background.js` via `chrome.runtime.sendMessage`.

**1.** `discovery.js` calls `startPinging()` — sends `chrome.runtime.sendMessage({ command: "check_handshake_status" })` every 1 second until `background.js` responds with `{ handshake_confirmed: true }` or `{ status: "pong" }`.

**2.** `discovery.js` also listens to `chrome.storage.onChanged` for `{ synapseStatus: { command: "system_ready" } }` — `background.js` can push readiness this way without waiting for a ping.

**3.** When `handleSystemReady(payload)` fires, the behavior branches on config flags injected into `SYNAPSE_CONFIG`:

| `heartbeat` flag | `register` flag | Action | Message sent to background.js |
|------------------|-----------------|--------|-------------------------------|
| `true` | any | Send `HEARTBEAT_SUCCESS`, wait 2s, `window.close()` | `{ event: "HEARTBEAT_SUCCESS" }` |
| `false` | `false` | `notifyHost()`, countdown 7s, `window.close()` | `{ event: "DISCOVERY_COMPLETE", payload: { profile_id, launch_id, ... } }` |
| `false` | `true` | Show onboarding screens | `{ event: "onboarding_started" }` |

**4.** `notifyHost()` sends `DISCOVERY_COMPLETE` with full payload including `profile_id`, `profile_alias`, `launch_id`, and the original `ping_response`. `background.js` receives this and forwards the completion signal up the chain.

#### Landing Page Return

The Landing page (`landing.js` + `landingProtocol.js`) is a persistent cockpit — it does not close. Its return path is ongoing health reporting and command dispatch.

**1.** On startup, `landing.js` calls `loadProfileData()` — reads `chrome.storage.local` for `profileData` and `synapseConfig`. Falls back to `window.BLOOM_PROFILE_DATA` and `window.SYNAPSE_CONFIG` (injected by Brain).

**2.** Connection health is checked every 5 seconds via `checkConnections()`:
- Sends `{ action: "ping" }` to `background.js` → updates extension status dot
- Sends `{ action: "checkHost" }` to `background.js` → reads `response.hostConnected` → updates host status dot

**3.** User actions dispatch commands via `window.executeCommand(command)`:

```javascript
chrome.runtime.sendMessage(extensionId, { action: "executeBrainCommand", command: command })
```

`background.js` routes this to `bloom-host.exe` → Brain TCP → executes the command → returns result.

#### Onboarding Return

`OnboardingFlow` (embedded in `discovery.js`) sends `onboarding_complete` when the user finishes:

```javascript
chrome.runtime.sendMessage({
  event: 'onboarding_complete',
  payload: { email, api_key_validated: true }
})
```

This triggers `background.js` to send `ONBOARDING_COMPLETE` through `bloom-host.exe` to Brain, which persists it as a `CRITICAL_EVENT` in `events.jsonl` and broadcasts to Sentinels.

---

## 4. Brain Event Bus — Message Reference

### 4.1 Message Types Handled by ServerManager

Every message arriving at Brain TCP `:5678` is handled by `_handle_client()`. Full contract:

| Message Type | Sent By | Brain Action | Response |
|--------------|---------|--------------|----------|
| `REGISTER_CLI` / `REGISTER_SENTINEL` | Sentinel | `type=cli`, no `profile_registry` entry | `REGISTER_ACK { role: "cli" }` |
| `REGISTER_HOST` | bloom-host.exe | `type=host`, `profile_registry[profile_id]=writer`, `set_profile_online()` | `REGISTER_ACK { role: "host", profile_id }` |
| `PROFILE_CONNECTED` | bloom-host.exe | `confirm_handshake()`, add + broadcast `PROFILE_CONNECTED` event | — (broadcast only) |
| `HEARTBEAT` | bloom-host.exe | `update_heartbeat(profile_id)` | — (silent) |
| `POLL_EVENTS` | Sentinel | `event_bus.poll_events(since_timestamp)` | `EVENTS { events[], count }` |
| `GET_PROFILE_STATE` | Sentinel | `profile_manager.get_profile_state(profile_id)` | `PROFILE_STATE { profile_id, state }` |
| `PROFILE_CREATE` | Sentinel | `ProfileCreator.create_profile()` — Brain is sole writer of `profiles.json` | `PROFILE_CREATE_ACK { status, profile }` |
| `LAUNCH_PROFILE` | Sentinel | `bloom-launcher` → Chrome, add + broadcast `PROFILE_LAUNCHED` event | `LAUNCH_PROFILE_ACK { launch_id, status, pid }` |
| `HOST_INIT` | Sentinel | `SynapseHostInitManager.init_host()` | `HOST_INIT_ACK { launch_id, status, data }` |
| msg with `target_profile` | Sentinel | Direct route to `profile_registry[target_profile]` writer | Routing ACK `{ request_id, status: "routed" }` |
| msg without `target_profile` | Sentinel | Broadcast raw message to all `type=host` writers | — (no ACK) |

### 4.2 Events Emitted by Brain

Brain emits events via `event_bus.add_event()` then `_broadcast_event()` to all connected Sentinels. Critical events are also persisted to `events.jsonl`.

| Event Type | Trigger | Critical (disk) |
|------------|---------|-----------------|
| `PROFILE_CONNECTED` | `bloom-host.exe` sends `PROFILE_CONNECTED` after handshake | ✅ Yes |
| `PROFILE_DISCONNECTED` | `bloom-host.exe` TCP connection closes | ✅ Yes |
| `PROFILE_LAUNCHED` | Chrome process started successfully via `LAUNCH_PROFILE` | No |
| `BRAIN_SERVICE_STATUS` | Service starts or shuts down | ✅ Yes |
| `ONBOARDING_COMPLETE` | Cortex page sends `onboarding_complete` event | ✅ Yes |
| `INTENT_COMPLETE` | Intent execution finishes successfully | ✅ Yes |
| `INTENT_FAILED` | Intent execution fails | ✅ Yes |
| `EXTENSION_ERROR` | Cortex reports an extension-level error | ✅ Yes |
| `PROFILE_STATUS_CHANGE` | Profile state transitions (READY→DEGRADED etc.) | ✅ Yes |

### 4.3 Event Bus Internals

- **In-memory:** `deque` with max 1000 events (configurable via `max_memory` parameter)
- **Timestamps:** Unix nanoseconds as `int64` — matches Go `Event.Timestamp` type
- **Disk persistence:** append-only `events.jsonl` at `BloomNucleus/workers/brain/events.jsonl`
- **On Brain startup:** `hydrate_from_disk()` reloads the most recent N events
- **Polling:** Sentinels can call `POLL_EVENTS { since: <nanoseconds> }` to replay history after reconnect

---

## 5. Sentinel Client — Sync/Async Bridge

### 5.1 The Correlation Pattern

The critical insight of the Sentinel client is that it bridges Temporal's synchronous activity execution model with Brain's asynchronous event model. The pattern is: send a command, register a handler for the matching ACK, wait on a Go channel.

```
SentinelActivities.LaunchSentinelActivity()
  │
  ├─ sc.On("LAUNCH_PROFILE_ACK", func(event) {
  │       if event.LaunchID != launchID { return }  // correlation check
  │       resultCh <- result{event.Pid, nil}
  │   })
  │
  ├─ sc.Send(Event{ Type: "LAUNCH_PROFILE", LaunchID: launchID, ... })
  │
  ├─ heartbeatTicker every 10s → activity.RecordHeartbeat(ctx)  // keeps Temporal alive
  │
  └─ select {
         case res := <-resultCh:  return res.pid, res.err
         case <-deadline.C:       return 0, timeout_error
     }
```

The same pattern applies to `HostInitSync()` with `HOST_INIT` / `HOST_INIT_ACK` correlation.

### 5.2 Event Dispatcher

`SentinelClient` runs a single goroutine (`eventDispatcher`) that consumes from `EventBus.Events()` channel. All registered handlers for matching event types are called concurrently via `go handler(event)`. A wildcard handler registered with `sc.On("*", ...)` receives every event — used by `sentinel listen` and `sentinel poll` commands.

### 5.3 Available High-Level Methods

| Method | Sends | Waits For | Returns |
|--------|-------|-----------|---------|
| `LaunchProfileSync()` | `LAUNCH_PROFILE` | `LAUNCH_PROFILE_ACK` (by `launch_id`) | `chromePID int` |
| `LaunchProfileSyncWithHeartbeat()` | `LAUNCH_PROFILE` | `LAUNCH_PROFILE_ACK` (by `launch_id`) + heartbeat | `chromePID int` |
| `HostInitSync()` | `HOST_INIT` | `HOST_INIT_ACK` (by `launch_id`) | `data map[string]interface{}` |
| `LaunchProfile()` | `LAUNCH_PROFILE` | nothing (fire-and-forget) | — |
| `StopProfile()` | `STOP_PROFILE` | nothing | — |
| `RequestProfileStatus()` | `REQUEST_PROFILE_STATUS` | nothing | — |
| `SubmitIntent()` | `SUBMIT_INTENT` | nothing | — |
| `PollEvents()` | `POLL_EVENTS { since }` | nothing (async via handlers) | — |
| `SendProfileStateSync()` | `PROFILE_STATE_SYNC` | nothing | — |

---

## 6. Cortex Pages — Discovery & Landing

### 6.1 SYNAPSE_CONFIG Injection

Brain injects a `SYNAPSE_CONFIG` object into each page before serving it. This object carries the runtime context the page needs without requiring a round-trip message:

| Field | Type | Used By | Purpose |
|-------|------|---------|---------|
| `extension_id` | string | Both pages | Target for `chrome.runtime.sendMessage` calls |
| `profileId` | string | Both pages | Current profile UUID |
| `profile_alias` | string | Both pages | Human-readable profile name |
| `launchId` | string | Discovery | Correlates `DISCOVERY_COMPLETE` with the launch |
| `register` | boolean | Discovery | `true` → show onboarding after handshake |
| `heartbeat` | boolean | Discovery | `true` → send `HEARTBEAT_SUCCESS` and close immediately |
| `service` | string | Discovery | Target service for Google login (e.g. `"google"`) |
| `email` | string | Discovery/Onboarding | Pre-fills login email |

### 6.2 Discovery Page State Machine

```
DOMContentLoaded
  └─ DiscoveryFlow.start()
        ├─ loadSynapseConfig()  (chrome.storage → SYNAPSE_CONFIG fallback)
        ├─ protocol.init()  (cache DOM elements)
        ├─ Stage 0: Initializing  ──────────────── completes immediately
        ├─ setupStorageListener()  (chrome.storage.onChanged → system_ready)
        └─ startPinging()  (every 1s: sendMessage check_handshake_status)

  On handshake confirmed (ping response or storage change):
  handleSystemReady(payload)
        ├─ Stage 2: Handshake  (visual)
        ├─ Stage 3: Heartbeat  (visual)
        ├─ Stage 4: Ready  (visual)
        │
        ├─ [heartbeat=true]  → sendHeartbeatSuccess() → window.close()
        ├─ [register=true]   → transitionToOnboarding() → show onboarding screens
        └─ [register=false]  → notifyHost(DISCOVERY_COMPLETE) → countdown(7s) → close()
```

### 6.3 Landing Page State Machine

```
DOMContentLoaded
  └─ LandingFlow.start()
        ├─ loadProfileData()  (storage → BLOOM_PROFILE_DATA → SYNAPSE_CONFIG)
        ├─ protocol.init()  (cache DOM elements)
        ├─ protocol.executePhase("initialization")
        ├─ startConnectionChecks()  (every 5s)
        └─ transitionToReady()  → protocol.executePhase("ready", { profile })
              └─ renderDashboard(profile)
                    ├─ renderStats()
                    ├─ renderAccounts()
                    ├─ renderActions()  (buttons with data-command attributes)
                    └─ renderSystemInfo()

  Ongoing (every 5s):
  checkConnections()
        ├─ sendMessage(ping) → update extension status dot
        └─ sendMessage(checkHost) → update host status dot

  On user action:
  window.executeCommand(cmd)
        └─ sendMessage({ action: "executeBrainCommand", command: cmd })
              └─ background.js → bloom-host.exe → Brain TCP → executes → response
```

---

## 7. Adding New Commands — Files to Touch

### 7.1 New `nucleus synapse <command>`

For any new Synapse CLI command that involves a Temporal workflow, touch these files **in order**:

| Step | File | What to Do |
|------|------|------------|
| 1 | `internal/orchestration/commands/synapse.go` | Add `createXxxSubcommand(c)` function. Add `cmd.AddCommand(createXxxSubcommand(c))` inside `createSynapseCommand()`. |
| 2 | `internal/orchestration/temporal/workflows/xxx_workflow.go` | Create new file. Define `XxxWorkflow(ctx, input)` with activity options, retry policy, timeout. |
| 3 | `internal/orchestration/activities/sentinel_activities.go` | Add `XxxActivity(ctx, input)` method to `SentinelActivities` struct. |
| 4 | `internal/orchestration/temporal/worker.go` | Register: `w.worker.RegisterWorkflow(workflows.XxxWorkflow)` and `w.worker.RegisterActivity(activities.XxxActivity)`. |
| 5 | `internal/orchestration/temporal/temporal_client.go` | Add `ExecuteXxxWorkflow()` helper that calls `c.client.ExecuteWorkflow()` and blocks on `we.Get()`. |
| 6 (optional) | `internal/orchestration/types/orchestration.go` | Add shared input/result types if reused across commands. |

> **Naming Convention:**
> - Function: `createXxxSubcommand` (not `newXxxCommand`)
> - Category annotation: `"ORCHESTRATION"` (not `"SYNAPSE"`)
> - Registration: only the parent `synapse` command is in `init()`. Subcommands use `cmd.AddCommand()` inside `createSynapseCommand()`
> - Workflow ID pattern: `{operation}_{profile_id}_{timestamp_unix}`

### 7.2 New Brain Message Handler

For new message types that Brain must process from Sentinel or from `bloom-host.exe`:

| Step | File | What to Do |
|------|------|------------|
| 1 | `brain/core/server/server_manager.py` | Add `elif msg_type == "NEW_MSG_TYPE":` block in `_handle_client()`. Call `_send_to_writer(writer, ack)` with the ACK. |
| 2 | `brain/core/server/server_event_bus.py` | If the new message generates a critical event, add its type to the `CRITICAL_EVENTS` set. |
| 3 (optional) | `brain/core/synapse/` (new file) | If the handler needs complex business logic, extract to a dedicated manager class called via `run_in_executor()`. |

### 7.3 New Sentinel Command or Activity

For new things Sentinel needs to do (send a new message type to Brain, or react to a new event):

| Step | File | What to Do |
|------|------|------------|
| 1 | `sentinel/internal/eventbus/sentinel_client.go` | Add new method to `SentinelClient`. For sync operations: follow the `sc.On(ACK_TYPE)` → `Send` → `select` pattern. For fire-and-forget: just call `sc.Send(event)`. |
| 2 | `sentinel/internal/orchestration/activities/sentinel_activities.go` (in Nucleus) | Call the new `SentinelClient` method from within the activity. |
| 3 (optional) | `sentinel/internal/eventbus/sentinel_client.go` (commands section) | Add new `sentinel` CLI command (`send`/`listen`/`poll` pattern) if manual testing is needed. |

### 7.4 New Cortex Page Interaction

For new actions that users can trigger from Discovery or Landing pages, or new data the pages need to display:

| Step | File | What to Do |
|------|------|------------|
| 1 | `brain/core/profile/web/templates/discovery/` or `landing/` | Add new UI element and wiring in HTML template. |
| 2 | `discoveryProtocol.js` or `landingProtocol.js` | Add new phase or UI update helper if needed. |
| 3 | `discovery.js` or `landing.js` | Add handler. Use `chrome.runtime.sendMessage({ action: "...", ... })` to send to `background.js`. |
| 4 | `cortex/extension/background.js` | Handle the new action key from the page. Forward to `bloom-host.exe` via `nativePort.postMessage()` or handle locally. |
| 5 (if host-level) | `installer/host/bloom-host.cpp` | Add handler for new message type coming from Extension. Forward to Brain via TCP with 4-byte BigEndian framing. |
| 6 | `cd installer/cortex/build-cortex && python package.py` | Rebuild and redeploy the extension. |

---

## 8. Port Architecture Decision Log

### 8.1 Decision: Single TCP Port (5678)

| Consideration | Single Port :5678 | Two Ports :5678/:5679 |
|---------------|-------------------|----------------------|
| Routing complexity | One server, `client_info["type"]` branch | Two servers sharing mutable state (`profile_registry`, `event_bus`) |
| Sentinel connection setup | One `Connect()` + `REGISTER_CLI` | Two `Connect()` calls, two `WaitForConnection()` timeouts |
| Broadcast logic | `_broadcast_event()` has all writers in one map | Must cross-server-call to reach all `cli` writers from host events |
| Log differentiation | Branch on `client_info["type"]` in `_log_traffic` | Automatic by server — marginal benefit |
| Failure surface | One asyncio server | Two asyncio servers, two socket lifetimes |
| Future multi-host support | Add firewall rule on port if needed | Already split — but localhost-only means no security benefit today |

> **Verdict:** Single port. The broadcast requirement (`PROFILE_CONNECTED` must reach Sentinels when a host connects) makes dual-port architecturally unsound without a shared state broker. Log differentiation is achievable at zero cost by filtering on `client_info["type"]`. Revisit only if Brain needs to accept connections from non-localhost clients, at which point port-level isolation becomes a security boundary worth maintaining.

---

## 9. Logging & Debugging Reference

### 9.1 Log File Locations

| Component | Log File | Content |
|-----------|----------|---------|
| Brain TCP | `BloomNucleus/workers/brain/tcp_traffic.log` | Every message RECV/SEND with byte count and timestamp |
| Brain EventBus | `BloomNucleus/workers/brain/events.jsonl` | Persisted critical events (append-only JSONL) |
| Nucleus Worker | `BloomNucleus/logs/orchestration/worker.log` | Workflow and activity execution |
| Temporal | `BloomNucleus/logs/orchestration/temporal.log` | Temporal server internal logs |
| Sentinel EventBus | `BloomNucleus/logs/sentinel/eventbus/` | Per-session event bus logs |
| Chrome profiles | `BloomNucleus/logs/chrome/profile_*/chrome_debug.log` | Chrome and extension logs |
| Host binary | `BloomNucleus/logs/host/synapse_host_*.log` | Native messaging traffic |

### 9.2 Essential Debug Commands

```bash
# Start full stack (production)
nucleus temporal ensure
nucleus worker start -q profile-orchestration
nucleus --json synapse seed my_profile --master
nucleus --json synapse launch my_profile --mode discovery

# Real-time event stream from Brain
sentinel listen
sentinel listen --filter LAUNCH_PROFILE

# Poll historical events (last 5 minutes)
sentinel poll --since-time 5m

# Manual Brain message injection
sentinel send --type LAUNCH_PROFILE --profile-id profile_001

# Check Brain TCP traffic live
tail -f BloomNucleus/workers/brain/tcp_traffic.log

# Check Temporal UI
open http://localhost:8233
```

### 9.3 Workflow State Reference

| State | Description | Next Action |
|-------|-------------|-------------|
| `IDLE` | Initial state, awaiting signal | Run `seed` |
| `SEEDED` | Profile exists in Temporal, no processes running | Run `launch` |
| `ONBOARDING` | Sentinel starting, Chrome launching | Wait for automatic transition |
| `READY` | Chrome + Sentinel + Cortex all running and connected | Operational |
| `DEGRADED` | Non-critical error (extension failed, heartbeat lost) | Monitor — auto-recovery may apply |
| `RECOVERING` | Attempting automatic error recovery | Wait or intervene manually |
| `FAILED` | Critical error, manual intervention required | Check logs, shutdown, relaunch |
| `SHUTDOWN` | Graceful termination in progress | Wait for `TERMINATED` |
| `TERMINATED` | Workflow complete, profile stopped | Can relaunch with `launch` command |

---

## 10. Quick Reference

### 10.1 Existing Synapse Commands

| Command | Description | Key Flags |
|---------|-------------|-----------|
| `nucleus synapse seed <alias>` | Create persistent profile in Temporal | `--master` |
| `nucleus synapse launch <profile>` | Start Chrome + Sentinel via workflow | `--mode landing\|discovery` |
| `nucleus synapse status <profile>` | Query workflow state | — |
| `nucleus synapse shutdown <profile>` | Graceful shutdown of one profile | — |
| `nucleus synapse shutdown-all` | Shutdown all active profiles | — |
| `nucleus synapse start-ollama` | Start Ollama as a Temporal workflow | — |
| `nucleus synapse vault-status` | Query vault initialization state | — |

> **Flag Position Rule:** Global flags (`--json`, `--verbose`) MUST come immediately after `nucleus` and BEFORE the subcommand.
>
> ✅ `nucleus --json synapse seed alice --master`
> ❌ `nucleus synapse seed alice --json --master`

### 10.2 Sentinel Bridge Commands

| Command | Description |
|---------|-------------|
| `sentinel send --type <TYPE> --profile-id <id>` | Send any event directly to Brain (manual / testing) |
| `sentinel listen` | Real-time event stream from Brain (all events) |
| `sentinel listen --filter <string>` | Real-time stream filtered by event type or profile\_id |
| `sentinel poll --since-time 5m` | Replay events from last N minutes |

---

*BTIPS · SYNAPSE PROTOCOL v4.0 · Platform Engineering · March 2026*
*Single source of truth for Synapse architecture, message contracts, and extension guide*
