# BLOOM — Onboarding Workflow Spec v2.3
## `nucleus synapse onboarding` — Especificación de implementación

> **Destinatario:** Claude instancia — implementación Go + Python + JavaScript
> **Versión anterior:** v2.2 (2026-06-25)
> **Estado:** Actualizado contra código fuente real · Conductor onboarding expandido
> **Fecha:** 2026-06-29

---

## Registro de cambios v2.3

| § | Cambio | Fuente de verdad |
|---|--------|-----------------|
| §0.5 | Steps del Conductor onboarding ahora completos con IDs canónicos, `blocking`, `cortex_events` y quién los persiste | `milestone-registry.js` FALLBACK_STEPS |
| §0.6 | **Nueva sección** — Arquitectura inbound: SynapseBridge v3, MilestoneRegistry, MilestoneReactor | `synapse-bridge.js`, `milestone-registry.js`, `milestone-reactor.js` |
| §4.5 | Flag `--service` **eliminado** del CLI `nucleus synapse onboarding`. No existe en el binario real | `onboarding-handlers.js` línea 166-169 |
| §4.5 | Steps válidos del CLI actualizados — se usa el mapeo del Conductor, no el de Discovery (son distintos namespaces) | `onboarding-handlers.js` |
| §7 | Schema real de `nucleus.json` para onboarding del Conductor: `completed_steps[]`, `workspace_path`, `workspace_org`, `github_username` | `onboarding-handlers.js`, `milestone-reactor.js` |
| §8 | Nuevo gate `waitForProfileConnected` antes de `nucleus synapse onboarding` | `onboarding-handlers.js` líneas 87-115 |
| §8 | Apertura de Landing via `nucleus synapse launch --mode landing` (Incógnita 5 resuelta) | `milestone-reactor.js` `_openLandingTab()` |
| §8 | `nucleus_create` marcado por el handler de `onboarding:init-nucleus`, no por Brain | `onboarding-handlers.js` líneas 316-335 |
| §9.5 | **Nueva subsección** — Harness de desarrollo: `harness:inject-milestone` | `onboarding-handlers.js`, `preload_onboarding.js` |

---

## 0. Por qué existe este documento

La v1.0 de este spec propuso una activity `SendOnboardingNavigate` que llamaba a
`a.sentinelClient.SendMessage()`. Ese método no existe. `SentinelActivities` solo
habla con Sentinel via `exec.Command` — no tiene canal runtime.

Este spec está basado en lectura directa de:

- `bloom-host.cpp` — confirma que Brain puede enviar cualquier JSON a Chrome post-handshake
- `server_manager.py` — confirma el routing por `target_profile` (líneas 467-515)
- `sentinel_activities.go` — confirma que el único mecanismo disponible es `exec.Command`
- `BTIPS-SYNAPSE-PROTOCOL.md` — confirma la arquitectura de 5 capas
- `synapse_protocol.py` — confirma el manejo de mensajes en Brain
- `synapse-bridge.js` v3 — fuente de verdad del flujo inbound Brain → Conductor
- `milestone-registry.js` — fuente de verdad de steps del Conductor onboarding
- `milestone-reactor.js` — fuente de verdad de reacciones a hitos
- `onboarding-handlers.js` — fuente de verdad de handlers IPC del main process
- `preload_onboarding.js` — fuente de verdad de la API expuesta al renderer

**No se inventa ningún mecanismo. Todo lo que se propone existe hoy en el código.**

---

## 0.5 Mapa del sistema — dos onboardings, dos capas

Bloom tiene **dos flujos de onboarding independientes** que no deben confundirse:

| Capa | Onboarding | Descripción | Spec de referencia |
|---|---|---|---|
| **Conductor (Electron)** | Onboarding del operador | GitHub token · Vault · Nucleus init · Genesis Mandate | `IMPL_PROMPT_ONBOARDING_UX_v1.md` + esta sección |
| **Synapse (Chrome)** | Onboarding de perfil | Google login · Gemini API · Provider connect | §§1-8 de este documento |

**Relación entre capas:**
- El onboarding de Conductor ocurre **una sola vez por instalación**. El operador conecta su cuenta GitHub, inicializa Nucleus y crea su primer mandate.
- El onboarding Synapse ocurre **una vez por perfil Chrome gestionado**. Conductor orquesta el flujo via `nucleus synapse onboarding` para conectar las cuentas del perfil.

### Steps del Conductor onboarding — fuente de verdad: `milestone-registry.js`

Los steps son los declarados en `FALLBACK_STEPS` (y en `config/onboarding/onboarding_steps.json` cuando el setup lo deploya). Los IDs son **strings canónicos**, no enteros.

| Orden | `id` | `label` | `screen` | `blocking` | `cortex_events` | Quién persiste |
|---|---|---|---|---|---|---|
| 1 | `nucleus_create` | Configurar workspace | `nucleus-create` | ✓ | *(ninguno)* | Handler `onboarding:init-nucleus` al exit 0 de `nucleus create` |
| 2 | `github_auth` | Conectar GitHub | `github-login` | ✓ | `GITHUB_PAT_DETECTED`, `GITHUB_TOKEN_STORED`, `ACCOUNT_REGISTERED` | MilestoneReactor vía SynapseBridge |
| 3 | `vault_init` | Inicializar Vault | `vault-init` | ✓ | `VAULT_INITIALIZED`, `VAULT_INIT` | MilestoneReactor |
| 4 | `google_auth` | Conectar Google | `google-login` | ✗ | `GOOGLE_AUTH_COMPLETE` | MilestoneReactor |
| 5 | `ai_provider_setup` | Configurar proveedor de IA | `provider-select` | ✗ | `AI_PROVIDER_CONFIGURED` | MilestoneReactor |
| 6 | `project_create` | Crear proyecto | `project-create` | ✓ | `PROJECT_CREATED`, `DISCOVERY_COMPLETE` | MilestoneReactor → `_onOnboardingSuccess()` |

**Reglas de `blocking`:** `_onOnboardingSuccess()` se llama cuando todos los steps con `blocking: true` están en `_processed`. Los steps no-blocking (`google_auth`, `ai_provider_setup`) pueden completar en cualquier orden y no bloquean la finalización.

**`nucleus_create` no tiene `cortex_events`:** Brain nunca emite un evento para este step. Lo marca el handler `onboarding:init-nucleus` directamente en `nucleus.json → onboarding.completed_steps[]` al recibir exit code 0 del proceso `nucleus create`.

### Prerequisitos del stack completo antes de `nucleus synapse onboarding`

```
1. Conductor onboarding completo:
   - nucleus_create: workspace local configurado (nucleus create --org ... --path ...)
   - github_auth:    GitHub autenticado — requiere nucleus_create
   - vault_init:     Vault inicializado — requiere github_auth + nucleus_create
   - project_create: Genesis Mandate creado — requiere vault_init + github_auth

2. Servicios corriendo:
   - brain service start           → Brain TCP :5678
   - nucleus temporal ensure       → Temporal server
   - nucleus worker start -q ...   → Worker de Temporal
   - nucleus synapse seed ...      → Perfil seeded en Temporal

3. Perfil lanzado:
   - nucleus synapse launch <profile_id> --mode discovery
   - PROFILE_CONNECTED evento recibido de Brain
```

---

## 0.6 Arquitectura inbound — Brain → Conductor

Esta sección documenta el flujo **inverso**: cómo los eventos de Brain llegan a Conductor
para marcar steps como completados. Esta arquitectura es nueva en v2.3 — no existía en
versiones anteriores del spec.

### Stack de módulos

```
Brain (TCP :5678)
  │   EventBus broadcast (ej: GITHUB_TOKEN_STORED, VAULT_INITIALIZED...)
  ▼
SynapseBridge._onBrainMessage()                 [synapse-bridge.js]
  │   _classifyMessage(): si evento ∈ ONBOARDING_EVENTS → type: 'ONBOARDING_MILESTONE'
  │   emite 'message' con payload enriched
  ▼
workspace-synapse-handlers.js
  │   bridge.on('message', enriched) →
  │   if enriched.type === 'ONBOARDING_MILESTONE':
  │     stepId = registry.resolveEvent(enriched.event)
  │     if stepId: reactor.handleMilestone(stepId, enriched)
  ▼
MilestoneReactor.handleMilestone(stepId, enriched)   [milestone-reactor.js]
  │   Idempotencia: si stepId ∈ _processed → ignorar
  │   _processed.add(stepId)
  │   Ejecutar handler específico o _defaultReaction()
  ▼
Handler específico (ej: _onGithubAuthComplete)
  │   _persistStepComplete(stepId) → nucleus.json.onboarding.completed_steps[]
  │   _emitMilestone(stepId)       → IPC 'milestone:reached' → renderer
  │   _emitStepUiUpdate(stepId)    → IPC 'onboarding:step-ui-update' → renderer
  │   (para github_auth + ACCOUNT_REGISTERED): _openLandingTab()
  ▼
preload_onboarding.js                            [preload_onboarding.js]
  │   onMilestone(callback)  → listener de 'milestone:reached'
  │   onStepUpdate(callback) → listener de 'onboarding:step-ui-update'
  ▼
onboarding.js (renderer)
  │   handleMilestoneReached(stepId, data) → avance automático del stepper
```

### SynapseBridge v3 — `ONBOARDING_EVENTS`

El Set exportado `ONBOARDING_EVENTS` es la fuente de clasificación de mensajes de onboarding.
`_classifyMessage()` lo consulta antes del fallback genérico. El `MilestoneRegistry` puede
extenderlo en runtime con eventos declarados en `onboarding_steps.json`.

```javascript
// Eventos activos en synapse-bridge.js v3:
const ONBOARDING_EVENTS = new Set([
  // GitHub
  'GITHUB_PAT_DETECTED',     // PAT detectado en clipboard — pre-confirmación
  'GITHUB_TOKEN_STORED',     // Brain persistió fingerprint del PAT
  'ACCOUNT_REGISTERED',      // Cuenta creada en Nucleus con token validado
  // Vault
  'VAULT_INITIALIZED',       // Vault creado y cifrado
  'VAULT_INIT',              // Alias alternativo (algunos builds de Brain)
  // Google / AI
  'GOOGLE_AUTH_COMPLETE',    // OAuth Google completado
  'AI_PROVIDER_CONFIGURED',  // API key de proveedor IA almacenada en vault
  // Proyecto
  'PROJECT_CREATED',         // Primer proyecto creado
  // Flujo completo
  'ONBOARDING_STEP_COMPLETE', // Step genérico (step ID en payload)
  'DISCOVERY_COMPLETE',       // Todos los steps completados — señal de cierre
  'SITE_READY',               // Ionsite listo para automatización
]);
```

### MilestoneRegistry — resolución de eventos

`MilestoneRegistry.resolveEvent(cortexEvent)` mapea nombre de evento Cortex → stepId.
Carga desde `<BloomRoot>/config/onboarding/onboarding_steps.json`; si no existe, usa
el fallback hardcoded (idéntico al canónico del repo).

```javascript
registry.resolveEvent('GITHUB_TOKEN_STORED')  // → 'github_auth'
registry.resolveEvent('VAULT_INITIALIZED')    // → 'vault_init'
registry.resolveEvent('PROJECT_CREATED')      // → 'project_create'
```

**Nota:** `nucleus_create` no tiene `cortex_events`, por lo que `resolveEvent` nunca
lo retorna. Este step se persiste directamente por el handler IPC.

### MilestoneReactor — idempotencia y persistencia

- **Idempotencia en memoria:** `_processed: Set<string>` — no re-ejecuta un step ya procesado en la sesión.
- **Idempotencia en disco:** `_persistStepComplete()` no duplica si ya está en `completed_steps[]`.
- **Rehidratación:** `rehydrateFromDisk()` carga `completed_steps[]` de `nucleus.json` al reconectar con Brain, para no re-ejecutar steps de sesiones anteriores.

### Handlers específicos por step

| stepId | Handler | Comportamiento extra |
|---|---|---|
| `github_auth` | `_onGithubAuthComplete` | Si `enriched.event === 'ACCOUNT_REGISTERED'` → llama `_openLandingTab()` |
| `nucleus_create` | `_onNucleusCreateComplete` | Sin comportamiento extra |
| `vault_init` | `_onVaultInitComplete` | Sin comportamiento extra |
| `google_auth` | `_onGoogleAuthComplete` | — |
| `ai_provider_setup` | `_onAiProviderSetupComplete` | — |
| `project_create` | `_onProjectCreateComplete` | Verifica si todos los blocking steps completan → llama `_onOnboardingSuccess()` |

### Apertura de Landing — `_openLandingTab()`

Al recibir `ACCOUNT_REGISTERED` con `enriched.event === 'ACCOUNT_REGISTERED'` en `_onGithubAuthComplete`, el reactor abre Landing:

```javascript
// milestone-reactor.js _openLandingTab()
await this._execNucleus(
  ['--json', 'synapse', 'launch', profileId, '--mode', 'landing'],
  15_000
);
```

**Esto resuelve la Incógnita 5 del spec anterior.** `nucleus synapse onboarding --step <screen>` solo navega Discovery (la ventana de onboarding ya abierta) — no abre una tab nueva. El único mecanismo para abrir Landing es `nucleus synapse launch --mode landing`.

### Finalización del onboarding — `_onOnboardingSuccess()`

Cuando todos los `blockingSteps` están en `_processed`:

1. Emite `milestone:reached` con `stepId: '__onboarding_complete__'` al renderer.
2. Llama `nucleus synapse onboarding <profileId> --step success` para navegar Discovery a la pantalla de éxito.
3. Landing ya está abierta desde `_openLandingTab()` (paso anterior).

### Canales IPC — preload_onboarding.js

| Canal IPC | Dirección | Descripción |
|---|---|---|
| `milestone:reached` | main → renderer | Emitido por MilestoneReactor cuando un hito completa. Payload: `{ stepId, _ts, ...extra }` |
| `onboarding:step-ui-update` | main → renderer | Actualizaciones granulares de UI. Payload: `{ stepId, phase, _ts }`. `phase` puede ser `'ESTABLISHED'`, `'IN_PROGRESS'`, `'ERROR'` |
| `synapse:raw-event` | main → renderer | Feed raw de mensajes Synapse (solo en modo verbose, para debug panel) |

```javascript
// Uso en onboarding.js:
window.onboarding.onMilestone(({ stepId, ...data }) => {
  handleMilestoneReached(stepId, data);
});
window.onboarding.onStepUpdate(({ stepId, phase }) => {
  if (phase === 'ESTABLISHED') setStepperEstablished(STEP_TO_NODE[stepId]);
});
```

---

## 1. La cadena verificada — línea por línea

```
nucleus synapse onboarding <profile_id> --step gemini_api
  │
  │  [Go — synapse.go]
  ▼
temporal_client.ExecuteOnboardingNavigate()
  │  SignalWorkflow → ProfileActorWorkflow (ya corriendo)
  ▼
OnboardingNavigateSignal recibida en profile_lifecycle.go
  │  workflow.ExecuteActivity(ctx, "SendOnboardingNavigate", sig)
  ▼
sentinel_activities.go → SendOnboardingNavigate()
  │  exec.Command(sentinelPath, "--json", "send", profileID, jsonPayload)
  ▼
sentinel.exe send <profile_id> <json>
  │  TCP connect → 127.0.0.1:5678
  │  envía: { "type": "REGISTER_CLI" }
  │  recibe: { "type": "REGISTER_ACK" }
  │  envía: { "target_profile": "<uuid>", "command": "onboarding_navigate", ... }
  │  recibe: { "status": "routed", "target": "<uuid>" }
  │  exit 0
  ▼
server_manager.py — _handle_client() L467-481
  │  target_profile lookup en profile_registry
  │  target_writer.write(header + data)
  ▼
bloom-host.cpp — handle_service_message() L517
  │  is_handshake_confirmed() == true → pasa
  │  write_message_to_chrome(forwarded)  [L581-583]
  ▼
background.js — nativePort.onMessage → handleHostMessage()
  │  msg.command === 'onboarding_navigate'
  │  chrome.runtime.sendMessage({ event: 'ONBOARDING_NAVIGATE', ... })
  ▼
discovery.js — chrome.runtime.onMessage
  └─ handleOnboardingNavigate(step, payload)
       └─ showScreen(screenMap[step])
```

**Cada flecha está respaldada por código fuente. No hay suposiciones.**

---

## 2. Prerequisitos de estado

Para que el mensaje llegue a Chrome, deben cumplirse estas condiciones:

| Condición | Dónde se verifica | Qué pasa si falla |
|---|---|---|
| Brain corriendo en :5678 | `server_manager.py start_blocking()` | Sentinel no puede conectar → activity falla → Temporal reintenta |
| Host conectado a Brain | `bloom-host.cpp tcp_client_loop()` | Brain no tiene `profile_registry[profile_id]` → routing falla |
| Handshake confirmado | `bloom-host.cpp is_handshake_confirmed()` | Mensaje se encola en `g_pending_messages` → se envía cuando confirme |
| `profile_id` en `profile_registry` | `server_manager.py` L183: `REGISTER_HOST` | Brain responde `"Profile not connected"` |

**Caso especial del handshake pendiente:** El host encola hasta 500 mensajes
(`MAX_QUEUED_MESSAGES`) y los flushea en cuanto el handshake confirma. Esto significa
que si se envía `onboarding_navigate` justo después del launch, el mensaje no se pierde
— llega en cuanto Chrome termina el handshake.

---

## 3. Schema de mensajes — contrato canónico

### 3.1 Mensaje que Sentinel envía a Brain (TCP 5678)

```json
{ "type": "REGISTER_CLI" }
```

Luego, inmediatamente:

```json
{
  "target_profile": "b0a3cb70-ea64-4f07-b0c8-8f5ba029d148",
  "command": "onboarding_navigate",
  "step": "gemini_api",
  "payload": {
    "email": "user@gmail.com",
    "service": "gemini",
    "linked_accounts": [
      { "provider": "google", "email": "user@gmail.com", "status": "active" },
      { "provider": "gemini", "email": "user@gmail.com", "status": "pending" }
    ]
  },
  "request_id": "onb_nav_1741200000_b0a3cb70"
}
```

Brain responde:

```json
{
  "request_id": "onb_nav_1741200000_b0a3cb70",
  "status": "routed",
  "target": "b0a3cb70-ea64-4f07-b0c8-8f5ba029d148"
}
```

Si el perfil no está conectado:

```json
{
  "status": "error",
  "message": "Profile not connected",
  "request_id": "onb_nav_1741200000_b0a3cb70"
}
```

### 3.2 Mensaje que Host reenvía a Chrome (Native Messaging stdout)

El host hace `msg.dump()` y lo pasa directamente — no modifica el payload.

```json
{
  "target_profile": "b0a3cb70-...",
  "command": "onboarding_navigate",
  "step": "gemini_api",
  "payload": {
    "email": "user@gmail.com",
    "service": "gemini",
    "linked_accounts": [...]
  },
  "request_id": "onb_nav_..."
}
```

### 3.3 Tabla de steps — Synapse/Chrome (namespace de Discovery)

Los steps son **strings**, nunca enteros. Este es el namespace de Discovery (Chrome),
distinto de los IDs del Conductor onboarding.

| Orden | `step` string | Pantalla `screen-*` | Descripción |
|---|---|---|---|
| 1 | `welcome` | `screen-onboarding-welcome` | Pantalla inicial de bienvenida |
| 2 | `google_login` | `screen-google-login` | Iniciar login con Google |
| 3 | `google_login_waiting` | `screen-google-waiting` | Esperando que el usuario complete el login |
| 4 | `gemini_api` | `screen-gemini-api` | Solicitar API key de Gemini |
| 5 | `gemini_api_waiting` | `screen-gemini-waiting` | Esperando que el usuario copie la key |
| 6 | `provider_select` | `screen-provider-select` | Selección de provider (sin preset) |
| 7 | `api_waiting` | `screen-api-waiting` | Esperando API key de provider seleccionado |
| 8 | `api_success` | `screen-api-success` | Key detectada, confirmando |
| 9 | `success` | `screen-onboarding-success` | Onboarding completado |

---

## 4. Implementación — Go (5 archivos)

Seguir los patrones de `SYNAPSE_NEW_COMMAND_GUIDE_v1.1` en todos los casos.

### 4.1 Tipos — `internal/orchestration/signals/onboarding_signals.go` (nuevo archivo)

```go
package signals

const SignalOnboardingNavigate = "onboarding_navigate"

type LinkedAccountEntry struct {
    Provider    string `json:"provider"`
    Email       string `json:"email"`
    Status      string `json:"status"` // "active" | "pending" | "expired"
}

type OnboardingNavigateSignal struct {
    ProfileID      string               `json:"profile_id"`
    Step           string               `json:"step"`
    Email          string               `json:"email,omitempty"`
    Service        string               `json:"service,omitempty"`
    LinkedAccounts []LinkedAccountEntry `json:"linked_accounts,omitempty"`
    RequestID      string               `json:"request_id"`
    Timestamp      int64                `json:"timestamp"`
}
```

### 4.2 Activity — `internal/orchestration/activities/sentinel_activities.go`

Agregar al struct `SentinelActivities` existente. **No crear struct separado.**

```go
// Input type — agregar en types/orchestration.go
type OnboardingNavigateInput struct {
    ProfileID      string                    `json:"profile_id"`
    Step           string                    `json:"step"`
    Email          string                    `json:"email,omitempty"`
    Service        string                    `json:"service,omitempty"`
    LinkedAccounts []signals.LinkedAccountEntry `json:"linked_accounts,omitempty"`
    RequestID      string                    `json:"request_id"`
}

// Activity — agregar al final de sentinel_activities.go
func (a *SentinelActivities) SendOnboardingNavigate(
    ctx context.Context,
    input types.OnboardingNavigateInput,
) error {
    msg := map[string]interface{}{
        "target_profile": input.ProfileID,
        "command":        "onboarding_navigate",
        "step":           input.Step,
        "payload": map[string]interface{}{
            "email":           input.Email,
            "service":         input.Service,
            "linked_accounts": input.LinkedAccounts,
        },
        "request_id": input.RequestID,
    }

    msgBytes, err := json.Marshal(msg)
    if err != nil {
        return fmt.Errorf("failed to marshal onboarding message: %w", err)
    }

    // sentinel --json send <profile_id> <json>
    args := []string{"--json", "send", input.ProfileID, string(msgBytes)}
    cmd := exec.CommandContext(ctx, a.sentinelPath, args...)

    var stdoutBuf bytes.Buffer
    var stderrBuf bytes.Buffer
    cmd.Stdout = &stdoutBuf
    cmd.Stderr = &stderrBuf

    if err := cmd.Run(); err != nil {
        a.logSentinelOutput(input.ProfileID, "stderr", stderrBuf.String())
        return fmt.Errorf("sentinel send failed: %w (stderr: %s)", err, stderrBuf.String())
    }

    var result struct {
        Status    string `json:"status"`
        Message   string `json:"message,omitempty"`
        RequestID string `json:"request_id,omitempty"`
    }
    if err := json.Unmarshal([]byte(strings.TrimSpace(stdoutBuf.String())), &result); err != nil {
        return fmt.Errorf("failed to parse sentinel send response: %w", err)
    }

    if result.Status != "routed" && result.Status != "ok" {
        return fmt.Errorf("sentinel send returned error: %s", result.Message)
    }

    return nil
}
```

### 4.3 Workflow — `internal/orchestration/temporal/workflows/profile_lifecycle.go`

```go
onboardingChan := workflow.GetSignalChannel(ctx, signals.SignalOnboardingNavigate)
selector.AddReceive(onboardingChan, func(c workflow.ReceiveChannel, more bool) {
    var sig signals.OnboardingNavigateSignal
    c.Receive(ctx, &sig)

    actCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
        StartToCloseTimeout: 30 * time.Second,
        RetryPolicy: &temporal.RetryPolicy{
            MaximumAttempts:    3,
            InitialInterval:    2 * time.Second,
            BackoffCoefficient: 2.0,
        },
    })

    workflow.ExecuteActivity(actCtx, "SendOnboardingNavigate", types.OnboardingNavigateInput{
        ProfileID:      sig.ProfileID,
        Step:           sig.Step,
        Email:          sig.Email,
        Service:        sig.Service,
        LinkedAccounts: sig.LinkedAccounts,
        RequestID:      sig.RequestID,
    }).Get(actCtx, nil)
})
```

### 4.4 Client helper — `internal/orchestration/temporal/temporal_client.go`

```go
func (c *Client) ExecuteOnboardingNavigate(
    ctx context.Context,
    logger *core.Logger,
    profileID string,
    sig signals.OnboardingNavigateSignal,
) (*OnboardingNavigateResult, error) {
    workflowID := fmt.Sprintf("profile-%s", profileID)

    err := c.client.SignalWorkflow(
        ctx,
        workflowID,
        "",   // runID vacío = workflow más reciente activo
        signals.SignalOnboardingNavigate,
        sig,
    )
    if err != nil {
        return nil, fmt.Errorf("failed to signal workflow %s: %w", workflowID, err)
    }

    return &OnboardingNavigateResult{
        Success:    true,
        ProfileID:  profileID,
        Step:       sig.Step,
        SignalSent: true,
        Timestamp:  time.Now().Unix(),
    }, nil
}
```

### 4.5 Subcomando CLI — `internal/orchestration/commands/synapse.go`

> ⚠️ **CORRECCIÓN v2.3:** El flag `--service` **no existe** en el binario real de `nucleus synapse onboarding`. El código en `onboarding-handlers.js` lo documenta explícitamente:
> ```javascript
> // NOTA: nucleus synapse onboarding solo acepta --step.
> // El flag --service no existe. Ver log: "unknown flag: --service"
> const result = await execNucleus(
>   ['--json', 'synapse', 'onboarding', profileId, '--step', step],
>   15_000
> );
> ```
> El routing al provider lo determina el step ID, no un flag separado. Si el spec anterior o cualquier otro documento lo documenta como flag válido del CLI, es incorrecto.

Flags del subcomando `onboarding`:

```go
cmd.Flags().StringVar(&step, "step", "", "Onboarding step to navigate to (required)")
cmd.Flags().StringVar(&email, "email", "", "Account email for this step")
// NO hay --service en el CLI real
cmd.MarkFlagRequired("step")
```

Steps válidos del subcomando `onboarding` (namespace de Discovery/Chrome):

```go
validSteps := map[string]bool{
    "welcome": true, "google_login": true, "google_login_waiting": true,
    "gemini_api": true, "gemini_api_waiting": true, "provider_select": true,
    "api_waiting": true, "api_success": true, "success": true,
}
```

**Nota:** Estos son distintos de los IDs del Conductor onboarding (`github_auth`, `vault_init`, etc.). Son los steps de la UI de Discovery (Chrome).

### 4.6 Worker registration — `internal/orchestration/temporal/worker.go`

```go
w.worker.RegisterActivity(activities.SendOnboardingNavigate)
```

---

## 5. Implementación — JavaScript (2 archivos)

### 5.1 `background.js` — agregar en `handleHostMessage()`

```javascript
if (msg.command === 'onboarding_navigate') {
  console.log('[Synapse] ← onboarding_navigate received, step:', msg.step);
  chrome.runtime.sendMessage({
    event:   'ONBOARDING_NAVIGATE',
    step:    msg.step,
    payload: msg.payload || {}
  }).catch(() => {
    console.warn('[Synapse] onboarding_navigate: no listener found (page not ready yet)');
  });
  return; // no hacer forward a Brain — este comando termina acá
}
```

### 5.2 `discovery.js` — agregar en `OnboardingFlow`

```javascript
// Mapa canónico step → screen name (sin prefijo 'screen-')
handleOnboardingNavigate(step, payload = {}) {
  const screenMap = {
    welcome:              'onboarding-welcome',
    google_login:         'google-login',
    google_login_waiting: 'google-waiting',
    gemini_api:           'gemini-api',
    gemini_api_waiting:   'gemini-waiting',
    provider_select:      'provider-select',
    api_waiting:          'api-waiting',
    api_success:          'api-success',
    success:              'onboarding-success'
  };

  const screen = screenMap[step];
  if (!screen) {
    console.warn('[Onboarding] Unknown step received:', step, '— ignoring');
    return;
  }

  // Actualizar estado y navegar
  if (payload.email) {
    this.googleEmail = payload.email;
    this.userEmail   = payload.email;
  }
  this.showScreen(screen);

  if (step === 'api_waiting' && payload.service) {
    const providerKey = payload.service.split(',').pop();
    if (providerKey && PROVIDER_CONFIG[providerKey]) {
      if (window.ONBOARDING instanceof MultiProviderOnboarding) {
        window.ONBOARDING.selectProvider(providerKey);
      }
    }
  }
}
```

---

## 6. Implementación — Sentinel (nuevo subcomando Go)

### 6.1 Contrato del comando

```bash
sentinel --json send <profile_id> <json_payload>
```

**Respuesta stdout (éxito):**
```json
{
  "success": true,
  "status": "routed",
  "profile_id": "b0a3cb70-...",
  "request_id": "onb_nav_...",
  "timestamp": 1741200000
}
```

**Exit codes:** 0 = routed OK, 1 = error

### 6.2 Lógica del subcomando

```go
// 1. Conectar TCP a Brain :5678
conn, err := net.DialTimeout("tcp", "127.0.0.1:5678", 5*time.Second)

// 2. Enviar REGISTER_CLI y esperar ACK
sendTCP(conn, `{"type":"REGISTER_CLI"}`)
readACK(conn)

// 3. Enviar el payload (ya viene con target_profile desde la activity)
sendTCP(conn, jsonPayload)

// 4. Leer respuesta de routing
response := readTCP(conn)
// Si response.status == "routed" → exit 0
// Si response.status == "error"  → exit 1

// Wire format: BigEndian 4 bytes + JSON UTF-8
func sendTCP(conn net.Conn, msg string) {
    payload := []byte(msg)
    header  := make([]byte, 4)
    binary.BigEndian.PutUint32(header, uint32(len(payload)))
    conn.Write(append(header, payload...))
}
```

**Nota sobre el framing:** Brain usa BigEndian en TCP (`server_manager.py` L133:
`int.from_bytes(header, byteorder='big')`). El comando Sentinel debe usar BigEndian.

---

## 7. Nucleus.json — schema real del Conductor onboarding

> ⚠️ **CORRECCIÓN v2.3:** El schema documentado en v2.2 era para el **Synapse onboarding** (perfil Chrome). El schema real para el **Conductor onboarding** es distinto. Fuente de verdad: `onboarding-handlers.js` y `milestone-reactor.js`.

```json
{
  "master_profile": "b0a3cb70-ea64-4f07-b0c8-8f5ba029d148",
  "onboarding": {
    "started":         true,
    "completed":       false,
    "started_at":      "2026-03-05T03:30:21Z",
    "updated_at":      "2026-03-05T03:35:00Z",
    "completed_at":    null,
    "current_step":    "github_auth",
    "workspace_path":  "/home/jose/repos/elias-repos",
    "workspace_org":   "elias-repos",
    "github_username": "jose",
    "github_org":      "bloom-labs",
    "completed_steps": ["nucleus_create", "github_auth"],
    "workspace_url":   null
  }
}
```

**Reglas de escritura:**

| Campo | Quién escribe | Cuándo |
|---|---|---|
| `started` | Handler `onboarding:navigate` | Al primer `persistStep()` |
| `current_step` | Handler `onboarding:navigate` | En cada llamada a `navigate` |
| `started_at` | Handler `onboarding:navigate` | Primera vez solamente |
| `updated_at` | Varios handlers | En cada mutación |
| `completed_steps[]` | `MilestoneReactor._persistStepComplete()` + handler `onboarding:init-nucleus` | Cuando un step completa |
| `workspace_path` | Handler `onboarding:init-nucleus` | Al completar `nucleus create` |
| `workspace_org` | Handler `onboarding:init-nucleus` | Ídem |
| `github_username` | Brain vía EventBus | Cuando procesa `GITHUB_TOKEN_STORED` (opcional) |
| `github_org` | Brain vía EventBus | Ídem |
| `completed` | Handler `onboarding:complete` | Al finalizar el onboarding |
| `completed_at` | Handler `onboarding:complete` | Ídem |
| `workspace_url` | Handler `onboarding:complete` | Ídem |

**Detección de github_auth por polling:** `onboarding:poll-identity` acepta tres nombres alternativos para compatibilidad con distintos builds de Brain:
```javascript
const githubTokenStored = !!(
  nucleusData.onboarding?.github_token_fingerprint ||
  nucleusData.onboarding?.github_token_stored      ||
  nucleusData.onboarding?.vault_github_stored
);
```

---

## 8. Flujo de uso completo — Conductor Onboarding

### 8.1 Gate: `waitForProfileConnected` antes de `nucleus synapse onboarding`

> ⚠️ **NUEVO en v2.3.** El handler `onboarding:navigate` espera activamente que el perfil
> esté conectado a Brain antes de enviar la señal. Sin este gate, `SendOnboardingNavigate`
> falla porque Brain no tiene `profile_registry[profileId]` todavía.

```javascript
// onboarding-handlers.js — waitForProfileConnected
async function waitForProfileConnected(profileId, { timeoutMs = 30_000, intervalMs = 1_500 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = await execNucleus(['--json', 'synapse', 'status', profileId], 5_000);
    // Estado válido: 'RUNNING' o sentinel_running === true
    // NOTA: 'CONNECTED' NO es un ProfileState válido — usar 'RUNNING'
    const profileState = status?.status;
    if (profileState?.state === 'RUNNING' || profileState?.sentinel_running === true) {
      return true;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false; // timeout — navigate continúa de todos modos (no-fatal)
}
```

Si el timeout expira sin conexión, `navigate` retorna `{ success: true, status: 'skipped_not_connected' }` — Chrome ya está abierto con el step correcto desde los flags `--override-service` / `--override-step` del launch.

### 8.2 Script de orquestación completo

```bash
# ── PREREQUISITOS ──────────────────────────────────────────────────────────
# Brain corriendo:    brain service start
# Temporal corriendo: nucleus temporal ensure
# Worker corriendo:   nucleus worker start -q profile-orchestration
# Perfil seeded:      nucleus synapse seed MasterWorker --master
# ───────────────────────────────────────────────────────────────────────────

# PASO 0: Lanzar perfil en modo discovery con register=true
# --override-service y --override-step son necesarios para que background.js
# reciba valores válidos desde el primer mensaje del Native Messaging host.
# Sin estos flags, service:"" y step:"" — la guarda de github nunca dispara.
nucleus --json synapse launch b0a3cb70 --mode discovery \
    --override-register  true \
    --override-heartbeat false \
    --override-service   github \
    --override-step      github_auth
# [Opcional: --skip-preflight si el perfil ya tiene session activa en profiles.json]

# ESPERAR: waitForProfileConnected — polling nucleus synapse status b0a3cb70
# hasta state === 'RUNNING' o sentinel_running === true (timeout: 30s)

# PASO 1: Navegar al step de GitHub login en Discovery
nucleus --json synapse onboarding b0a3cb70 --step google_login
# → Signal enviada a Temporal → Activity → sentinel send → Brain → Host → Chrome
# → discovery.js muestra screen-google-login

# ESPERAR: MilestoneReactor recibe ACCOUNT_REGISTERED (o GITHUB_TOKEN_STORED)
# → _onGithubAuthComplete() persiste 'github_auth' en completed_steps[]
# → emite milestone:reached { stepId: 'github_auth' } al renderer
# → _openLandingTab(): nucleus synapse launch b0a3cb70 --mode landing
#   (Landing se abre en Chrome)

# PASO 2: Cuenta Google confirmada → navegar a Gemini API Key
nucleus --json synapse onboarding b0a3cb70 --step gemini_api
# → discovery.js muestra screen-gemini-api

# ESPERAR: MilestoneReactor recibe AI_PROVIDER_CONFIGURED
# → 'ai_provider_setup' persiste en completed_steps[]

# PASO 3: (Opcional) Otros providers
nucleus --json synapse onboarding b0a3cb70 --step api_waiting
# Nota: el provider se determina por el step, no por --service (que no existe)

# PASO N: Todos los blocking steps completos → MilestoneReactor llama _onOnboardingSuccess()
# → nucleus synapse onboarding b0a3cb70 --step success  (automático, desde el reactor)
# → discovery.js muestra pantalla de éxito final.
# → Conductor emite milestone:reached { stepId: '__onboarding_complete__' }
```

### 8.3 Timeouts recomendados para Conductor

| Step | Timeout de espera | Razón |
|---|---|---|
| `google_login` | 10 minutos | El usuario completa OAuth manualmente |
| `google_login_waiting` | 10 minutos | Ídem |
| `gemini_api_waiting` | 15 minutos | El usuario necesita crear y copiar la key en AI Studio |
| `api_waiting` | 15 minutos | Ídem para otros providers |
| Todos los demás | 2 minutos | Transiciones automáticas o simples |

---

## 9. Gestión de errores y casos borde

### 9.1 Perfil offline cuando se envía la señal

Temporal reintenta la activity `SendOnboardingNavigate` con backoff exponencial
(2s, 4s, 8s — máximo 3 intentos). Si el perfil sigue offline, la activity falla
y el workflow queda en estado `FAILED`.

### 9.2 Handshake no confirmado cuando llega el mensaje

bloom-host encola hasta 500 mensajes (`MAX_QUEUED_MESSAGES`). El mensaje
`onboarding_navigate` se enviará automáticamente en cuanto el handshake confirme.
**No se pierde.** No hay acción requerida.

### 9.3 `step` desconocido en discovery.js

```javascript
if (!screen) {
  console.warn('[Onboarding] Unknown step received:', step, '— ignoring');
  return;  // nunca crashear — simplemente ignorar
}
```

### 9.4 Brain no disponible en el momento del `sentinel send`

La activity falla. Temporal reintenta. Brain es un servicio con nssm — se reinicia
automáticamente. En la práctica el reintento debería encontrar Brain disponible.

### 9.5 Harness de desarrollo — `harness:inject-milestone`

Para testing en builds de desarrollo sin una cuenta real ni Brain corriendo,
el handler `harness:inject-milestone` permite inyectar milestones directamente
al `MilestoneReactor`:

```javascript
// Solo disponible cuando app.isPackaged === false
// Rechazado en production builds con error 'harness not available in production builds'

// Desde preload_onboarding.js (renderer):
window.onboarding.injectMilestone({ stepId: 'github_auth', data: { username: 'test' } });

// El handler construye un enriched mínimo:
const enriched = {
  type:     'ONBOARDING_MILESTONE',
  event:    stepId.toUpperCase(),
  data,
  _ts:      Date.now(),
  _harness: true,   // trazabilidad: indica que fue inyectado por harness
};
reactor.handleMilestone(stepId, enriched);
```

### 9.6 Race condition: PROFILE_CONNECTED antes de que el bridge conecte

Si `PROFILE_CONNECTED` ocurrió antes de que `SynapseBridge` conectase a Brain,
Brain no re-emite el evento. El bridge detecta esto al recibir `REGISTER_ACK`
y emite `{ type: 'STATUS', catch_up_needed: true }` para que el caller
dispare un poll CLI de seguridad (`nucleus synapse status`).

---

## 10. Contratos que NO se tocan

| Contrato | Archivo | Qué NO cambiar |
|---|---|---|
| Handshake 3 fases | `bloom-host.cpp`, `background.js` | Orden, mensajes, transiciones de estado |
| `handleHostMessage()` | `background.js` | Firma, bloqueo pre-handshake, routing existente |
| `showScreen(name)` | `discovery.js` | Prefijo `screen-`, activación de clase `active` |
| `ACCOUNT_REGISTERED` shape | `background.js`, `discovery.js` | `{ provider, email, profile_id, launch_id, timestamp, status, key_hint, linked_accounts }` |
| `WorkflowID` format | Temporal | Siempre `profile-<uuid>` |
| TCP framing Brain | `server_manager.py` | BigEndian 4 bytes + JSON UTF-8 |
| `REGISTER_CLI` / `REGISTER_HOST` | `server_manager.py` | Tipos de mensaje de registro |
| `target_profile` routing | `server_manager.py` L467-481 | Campo de routing — no renombrar |
| `ONBOARDING_EVENTS` Set | `synapse-bridge.js` | No remover eventos existentes; solo agregar |
| `MILESTONE_IPC_CHANNEL` | `milestone-reactor.js` | Siempre `'milestone:reached'` |
| `STEP_UPDATE_IPC_CHANNEL` | `milestone-reactor.js` | Siempre `'onboarding:step-ui-update'` |
| `ONBOARDING_STEP_IDS` | `onboarding-handlers.js` | Lista canónica de IDs válidos |

---

## 11. Checklist de implementación

### Sentinel (Go)
- [ ] Subcomando `send <profile_id> <json>` implementado
- [ ] Framing TCP BigEndian correcto
- [ ] Envía `REGISTER_CLI` antes del payload
- [ ] Lee ACK de routing y sale con código apropiado
- [ ] `--json` output con schema documentado en §6.1
- [ ] Timeout de conexión: 5 segundos
- [ ] Timeout de respuesta: 10 segundos

### Go (Nucleus)
- [ ] `OnboardingNavigateSignal` en `signals/onboarding_signals.go`
- [ ] `OnboardingNavigateInput` en `types/orchestration.go`
- [ ] `SendOnboardingNavigate` activity en `sentinel_activities.go`
- [ ] Activity registrada en `worker.go`
- [ ] Signal handler `onboarding_navigate` en `profile_lifecycle.go`
- [ ] `ExecuteOnboardingNavigate` en `temporal_client.go` usando `SignalWorkflow`
- [ ] `createOnboardingSubcommand` en `synapse.go`
- [ ] Adjuntado con `cmd.AddCommand` en `createSynapseCommand`
- [ ] Validación de step strings con mensaje de error legible
- [ ] Flag `--step` marcado como requerido (`cmd.MarkFlagRequired`)
- [ ] **Sin flag `--service`** — no existe en el binario real

### JavaScript (Discovery/Chrome)
- [ ] Case `onboarding_navigate` en `handleHostMessage()` en `background.js`
- [ ] `return` después del case para evitar reenvío a Brain
- [ ] Método `handleOnboardingNavigate(step, payload)` en `OnboardingFlow`
- [ ] Listener en `setupListeners()` para `ONBOARDING_NAVIGATE`
- [ ] Mapeo completo de los 9 steps de Discovery
- [ ] Persistencia en `onboarding_state` en chrome.storage
- [ ] Pre-selección de provider cuando `step=api_waiting` y `payload.service` presente
- [ ] Manejo silencioso de step desconocido (warn + return, no throw)

### JavaScript (Conductor/Electron — inbound)
- [ ] `SynapseBridge` v3 con `ONBOARDING_EVENTS` Set exportado
- [ ] `MilestoneRegistry.loadSteps()` llamado al arrancar
- [ ] `MilestoneReactor` instanciado con `{ registry, getWindow, execNucleus, NUCLEUS_JSON }`
- [ ] `workspace-synapse-handlers.js`: bridge.on('message') → `reactor.handleMilestone()`
- [ ] `rehydrateFromDisk()` llamado al reconectar con Brain
- [ ] `preload_onboarding.js`: `onMilestone` y `onStepUpdate` expuestos al renderer
- [ ] `onboarding.js`: listeners de `milestone:reached` y `onboarding:step-ui-update` en DOMContentLoaded

### Nucleus.json
- [ ] Schema `onboarding` con `completed_steps[]`, `workspace_path`, `workspace_org`
- [ ] `nucleus_create` persiste en `completed_steps[]` por el handler `onboarding:init-nucleus`
- [ ] `MilestoneReactor._persistStepComplete()` persiste los demás steps

---

## 12. Archivos a adjuntar al implementador

**Adjuntar obligatoriamente:**
1. `SYNAPSE_NEW_COMMAND_GUIDE_v1_0.md` — patrones de comandos Synapse Go
2. `NUCLEUS_SYNAPSE_USAGE_GUIDE_v3_1.md` — arquitectura Temporal, signals
3. `sentinel_activities.go` — patrones exactos de activities existentes
4. `bloom-host.cpp` — §handle_service_message
5. `server_manager.py` — routing `target_profile` (L467-515)
6. `background.js` — `handleHostMessage()` y routing existente
7. `discovery.js` — `OnboardingFlow.setupListeners()` y `showScreen()`
8. `nucleus.json` — schema de `onboarding` a extender

**Adjuntar para la capa inbound (MilestoneReactor):**
9. `synapse-bridge.js` — `ONBOARDING_EVENTS`, `_classifyMessage()`
10. `milestone-registry.js` — `FALLBACK_STEPS`, `resolveEvent()`
11. `milestone-reactor.js` — handlers por step, `_openLandingTab()`, `_onOnboardingSuccess()`
12. `onboarding-handlers.js` — todos los handlers IPC, `waitForProfileConnected()`
13. `preload_onboarding.js` — API expuesta al renderer

**Adjuntar si disponible:**
14. Código fuente del subcomando `sentinel launch` — referencia para `sentinel send`
15. `workspace-synapse-handlers.js` — cómo se conecta el bridge con el reactor

---

## 13. Lo que este spec NO cubre

- Multi-session — qué pasa si se lanza el mismo profile_id dos veces simultáneamente
- `sentinel listen` — si existe un mecanismo de polling para eventos de Brain adicional al bridge
- Vault integration completa — cómo se guardan las keys registradas en detalle

---

**Versión:** 2.3
**Fecha:** 2026-06-29
**Estado:** Actualizado contra código fuente real
**Cambios vs v2.2:** Ver tabla al inicio del documento.
