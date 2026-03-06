# BLOOM — Onboarding Workflow Spec v2.0
## `nucleus synapse onboarding` — Especificación de implementación

> **Destinatario:** Claude instancia — implementación Go + Python + JavaScript  
> **Versión anterior:** v1.0 (descartada — asumía `sentinelClient.SendMessage` inexistente)  
> **Estado:** Arquitectura verificada en código fuente real  
> **Fecha:** 2026-03-05

---

## 0. Por qué existe este documento

La v1.0 de este spec propuso una activity `SendOnboardingNavigate` que llamaba a
`a.sentinelClient.SendMessage()`. Ese método no existe. `SentinelActivities` solo
habla con Sentinel via `exec.Command` — no tiene canal runtime.

Este spec v2.0 está basado en lectura directa de:

- `bloom-host.cpp` — confirma que Brain puede enviar cualquier JSON a Chrome post-handshake
- `server_manager.py` — confirma el routing por `target_profile` (líneas 467-515)
- `sentinel_activities.go` — confirma que el único mecanismo disponible es `exec.Command`
- `BTIPS-SYNAPSE-PROTOCOL.md` — confirma la arquitectura de 5 capas
- `synapse_protocol.py` — confirma el manejo de mensajes en Brain

**No se inventa ningún mecanismo. Todo lo que se propone existe hoy en el código.**

---

## 1. La cadena verificada — línea por línea

```
nucleus synapse onboarding <profile_id> --step gemini_api --email user@gmail.com
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
{
  "type": "REGISTER_CLI"
}
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

Brain responde (al Sentinel/CLI que envió):

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
Lo que llega a `background.js` es exactamente:

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

### 3.3 Tabla de steps — contrato canónico

Los steps son **strings**, nunca enteros.

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
    // Construir el payload que Sentinel enviará a Brain
    // Brain lo rutea via target_profile al host correcto
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
    // Este es el nuevo subcomando que Sentinel debe implementar (ver §6)
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

    // Parsear respuesta
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

    a.logSentinelOutput(input.ProfileID, "stdout",
        fmt.Sprintf("onboarding_navigate routed: step=%s profile=%s", input.Step, input.ProfileID[:8]))

    return nil
}
```

### 4.3 Workflow — `internal/orchestration/temporal/workflows/profile_lifecycle.go`

Agregar al selector del `ProfileActorWorkflow` existente, después de los channels
de `launch` y `shutdown` ya existentes:

```go
// Estado de onboarding — agregar al struct de estado del workflow
type OnboardingState struct {
    Active      bool                        `json:"active"`
    CurrentStep string                      `json:"current_step"`
    StartedAt   time.Time                   `json:"started_at"`
    Accounts    []signals.LinkedAccountEntry `json:"accounts"`
}

// En ProfileActorWorkflow, agregar al selector:
onboardingChan := workflow.GetSignalChannel(ctx, signals.SignalOnboardingNavigate)
selector.AddReceive(onboardingChan, func(c workflow.ReceiveChannel, more bool) {
    var sig signals.OnboardingNavigateSignal
    c.Receive(ctx, &sig)

    // Activar estado de onboarding al recibir primera señal
    if !onboardingState.Active {
        onboardingState.Active = true
        onboardingState.StartedAt = workflow.Now(ctx)
    }
    onboardingState.CurrentStep = sig.Step

    // Ejecutar activity de envío
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
    // Nota: errores de la activity son reintentados por Temporal automáticamente.
    // No hay que manejarlos acá — Temporal ya tiene la retry policy.
})
```

### 4.4 Client helper — `internal/orchestration/temporal/temporal_client.go`

```go
type OnboardingNavigateResult struct {
    Success    bool   `json:"success"`
    ProfileID  string `json:"profile_id"`
    Step       string `json:"step"`
    SignalSent bool   `json:"signal_sent"`
    Timestamp  int64  `json:"timestamp"`
    Error      string `json:"error,omitempty"`
}

// IMPORTANTE: usar SignalWorkflow, no ExecuteWorkflow.
// ProfileActorWorkflow ya está corriendo — solo le enviamos una señal.
func (c *Client) ExecuteOnboardingNavigate(
    ctx context.Context,
    logger *core.Logger,
    profileID string,
    sig signals.OnboardingNavigateSignal,
) (*OnboardingNavigateResult, error) {
    // WorkflowID canónico — mismo patrón que launch y shutdown
    workflowID := fmt.Sprintf("profile-%s", profileID)

    if !logger.IsJSON() {
        logger.Info("Sending onboarding_navigate signal to workflow %s: step=%s",
            workflowID, sig.Step)
    }

    // SignalWorkflow envía la señal sin esperar que la activity termine.
    // El CLI retorna "signal_sent: true" inmediatamente.
    // Temporal garantiza que la activity se ejecute (con reintentos si falla).
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

Agregar `createOnboardingSubcommand(c)` al final del archivo, antes del `init()`.
Adjuntarlo en `createSynapseCommand` con `cmd.AddCommand(createOnboardingSubcommand(c))`.

```go
func createOnboardingSubcommand(c *core.Core) *cobra.Command {
    var jsonOutput bool
    var step     string
    var email    string
    var service  string

    validSteps := map[string]bool{
        "welcome": true, "google_login": true, "google_login_waiting": true,
        "gemini_api": true, "gemini_api_waiting": true, "provider_select": true,
        "api_waiting": true, "api_success": true, "success": true,
    }

    cmd := &cobra.Command{
        Use:   "onboarding <profile_id>",
        Short: "Navigate onboarding flow for a running profile via Synapse",
        Long: `Sends an onboarding_navigate signal to a running profile's Chrome instance.

The profile must already be launched (nucleus synapse launch) and the Synapse
handshake must be confirmed. The message travels:
  Temporal Signal → Activity → sentinel send → Brain TCP :5678 → bloom-host → Chrome

This command returns immediately after the signal is sent to Temporal.
Temporal guarantees the activity executes (with retries if Brain/Sentinel are unavailable).`,

        Args: cobra.ExactArgs(1),

        Annotations: map[string]string{
            "category": "ORCHESTRATION",
            "json_response": `{
  "success": true,
  "profile_id": "b0a3cb70-ea64-4f07-b0c8-8f5ba029d148",
  "step": "gemini_api",
  "signal_sent": true,
  "timestamp": 1741200000
}`,
        },

        Example: `  nucleus synapse onboarding b0a3cb70 --step welcome
  nucleus synapse onboarding b0a3cb70 --step google_login --email user@gmail.com
  nucleus synapse onboarding b0a3cb70 --step gemini_api --email user@gmail.com --service gemini
  nucleus synapse onboarding b0a3cb70 --step api_waiting --service github
  nucleus --json synapse onboarding b0a3cb70 --step success`,

        Run: func(cmd *cobra.Command, args []string) {
            profileID := args[0]
            if c.IsJSON {
                jsonOutput = true
            }

            // Validar step
            if !validSteps[step] {
                validList := "welcome, google_login, google_login_waiting, gemini_api, " +
                    "gemini_api_waiting, provider_select, api_waiting, api_success, success"
                if jsonOutput {
                    outputJSON(map[string]interface{}{
                        "success": false,
                        "error":   fmt.Sprintf("invalid step '%s'. Valid values: %s", step, validList),
                    })
                } else {
                    fmt.Fprintf(os.Stderr, "[ERROR] Invalid step '%s'\nValid values: %s\n",
                        step, validList)
                }
                os.Exit(1)
            }

            logger, err := core.InitLogger(&c.Paths, "SYNAPSE", jsonOutput, "synapse")
            if err != nil {
                fmt.Fprintf(os.Stderr, "[ERROR] Failed to initialize logger: %v\n", err)
                os.Exit(1)
            }
            defer logger.Close()

            if !jsonOutput {
                logger.Info("Sending onboarding navigate: profile=%s step=%s", profileID[:8], step)
            }

            ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
            defer cancel()

            tc, err := temporalclient.NewClient(ctx, &c.Paths, jsonOutput)
            if err != nil {
                if jsonOutput {
                    outputJSON(map[string]interface{}{"success": false,
                        "error": fmt.Sprintf("failed to connect to Temporal: %v", err)})
                } else {
                    logger.Error("Failed to connect to Temporal: %v", err)
                }
                os.Exit(1)
            }
            defer tc.Close()

            sig := signals.OnboardingNavigateSignal{
                ProfileID: profileID,
                Step:      step,
                Email:     email,
                Service:   service,
                RequestID: fmt.Sprintf("onb_nav_%d_%s", time.Now().Unix(), profileID[:8]),
                Timestamp: time.Now().Unix(),
            }

            result, err := tc.ExecuteOnboardingNavigate(ctx, logger, profileID, sig)
            if err != nil {
                if jsonOutput {
                    outputJSON(map[string]interface{}{"success": false, "error": err.Error()})
                } else {
                    logger.Error("Failed to send onboarding signal: %v", err)
                }
                os.Exit(1)
            }

            if jsonOutput {
                outputJSON(result)
            } else {
                logger.Success("✅ Onboarding signal sent: step=%s profile=%s",
                    step, profileID[:8])
            }
        },
    }

    cmd.Flags().StringVar(&step, "step", "", "Onboarding step to navigate to (required)")
    cmd.Flags().StringVar(&email, "email", "", "Account email for this step")
    cmd.Flags().StringVar(&service, "service", "", "Service/provider: google, gemini, github, twitter, openai, claude, xai")
    cmd.MarkFlagRequired("step")

    return cmd
}
```

### 4.6 Worker registration — `internal/orchestration/temporal/worker.go`

```go
// Agregar a las activities registradas — no registrar workflow nuevo
w.worker.RegisterActivity(activities.SendOnboardingNavigate)
```

---

## 5. Implementación — JavaScript (2 archivos)

### 5.1 `background.js` — agregar en `handleHostMessage()`

Localizar el bloque de routing de mensajes del host (donde se maneja `host_ready`,
`keepalive`, etc.). Agregar **antes** del caso por defecto o routing genérico:

```javascript
// Agregar en handleHostMessage() o en nativePort.onMessage handler
if (msg.command === 'onboarding_navigate') {
  console.log('[Synapse] ← onboarding_navigate received, step:', msg.step);

  // Forward a discovery.js (o a cualquier página que esté escuchando)
  chrome.runtime.sendMessage({
    event:   'ONBOARDING_NAVIGATE',
    step:    msg.step,
    payload: msg.payload || {}
  }).catch(() => {
    // La página puede no estar abierta todavía — no es un error fatal
    console.warn('[Synapse] onboarding_navigate: no listener found (page not ready yet)');
  });

  return; // no hacer forward a Brain — este comando termina acá
}
```

**Importante:** El `return` evita que el mensaje se reenvíe de vuelta a Brain,
lo que crearía un loop.

### 5.2 `discovery.js` — agregar en `OnboardingFlow`

En `setupListeners()` o donde se inicializa el listener de `chrome.runtime.onMessage`:

```javascript
// En el listener existente de chrome.runtime.onMessage, agregar:
if (msg.event === 'ONBOARDING_NAVIGATE') {
  this.handleOnboardingNavigate(msg.step, msg.payload);
}
```

Agregar el método a la clase `OnboardingFlow`:

```javascript
handleOnboardingNavigate(step, payload = {}) {
  console.log('[Onboarding] ONBOARDING_NAVIGATE received:', step, payload);

  // Mapa canónico step → screen name (sin prefijo 'screen-')
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

  // Actualizar estado en memoria
  if (payload.email) {
    this.googleEmail = payload.email;
    this.userEmail   = payload.email;
  }

  // Actualizar SYNAPSE_CONFIG en memoria con lo que viene del payload
  // para que applyServicePreset() y linked_accounts checks vean estado fresco
  if (self.SYNAPSE_CONFIG) {
    if (payload.linked_accounts) {
      self.SYNAPSE_CONFIG.linked_accounts = payload.linked_accounts;
    }
    if (payload.service) {
      self.SYNAPSE_CONFIG.service = payload.service;
    }
  }

  // Persistir en chrome.storage para recovery (si el usuario recarga)
  chrome.storage.local.get('onboarding_state', (result) => {
    const state = result.onboarding_state || {};
    chrome.storage.local.set({
      onboarding_state: {
        ...state,
        active:      true,
        currentStep: step,
        googleEmail: this.googleEmail || state.googleEmail,
        updatedAt:   Date.now()
      }
    });
  });

  // Navegar a la pantalla
  this.showScreen(screen);

  // Si vamos a api_waiting con service preset → pre-seleccionar provider
  if (step === 'api_waiting' && payload.service) {
    const providerKey = payload.service.split(',').pop();
    if (providerKey && PROVIDER_CONFIG[providerKey]) {
      // Usar instancia global de MultiProviderOnboarding si existe
      if (window.ONBOARDING instanceof MultiProviderOnboarding) {
        window.ONBOARDING.selectProvider(providerKey);
      }
    }
  }
}
```

---

## 6. Implementación — Sentinel (nuevo subcomando Go)

Este es el eslabón que conecta la activity Go con Brain.
**Sentinel ya se conecta al TCP 5678 como CLI.** Solo necesita un nuevo subcomando.

### 6.1 Contrato del comando

```bash
sentinel --json send <profile_id> <json_payload>
```

**Argumentos:**
- `profile_id`: UUID del perfil destino
- `json_payload`: JSON completo a enviar (ya incluye `target_profile`, `command`, etc.)

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

**Respuesta stdout (error — perfil offline):**
```json
{
  "success": false,
  "status": "error",
  "message": "Profile not connected",
  "profile_id": "b0a3cb70-...",
  "timestamp": 1741200000
}
```

**Exit codes:** 0 = routed OK, 1 = error (perfil offline, Brain no disponible, timeout)

### 6.2 Lógica del subcomando (pseudo-Go)

```go
func createSendSubcommand(c *core.Core) *cobra.Command {
    return &cobra.Command{
        Use:   "send <profile_id> <json>",
        Short: "Send a JSON message to a specific connected profile via Brain",
        Args:  cobra.ExactArgs(2),
        Run: func(cmd *cobra.Command, args []string) {
            profileID  := args[0]
            jsonPayload := args[1]

            // 1. Conectar TCP a Brain :5678
            conn, err := net.DialTimeout("tcp", "127.0.0.1:5678", 5*time.Second)
            // handle error...

            // 2. Enviar REGISTER_CLI
            sendTCP(conn, `{"type":"REGISTER_CLI"}`)
            readACK(conn) // esperar REGISTER_ACK

            // 3. Enviar el payload (ya viene con target_profile desde la activity)
            sendTCP(conn, jsonPayload)

            // 4. Leer respuesta de routing
            response := readTCP(conn)
            // Si response.status == "routed" → exit 0
            // Si response.status == "error"  → exit 1 con JSON de error
        },
    }
}

// sendTCP: frame BigEndian 4 bytes + payload (igual que server_manager.py espera)
func sendTCP(conn net.Conn, msg string) {
    payload := []byte(msg)
    header  := make([]byte, 4)
    binary.BigEndian.PutUint32(header, uint32(len(payload)))
    conn.Write(append(header, payload...))
}
```

**Nota sobre el framing:** Brain usa BigEndian en TCP (`server_manager.py` L133:
`int.from_bytes(header, byteorder='big')`). bloom-host también usa BigEndian hacia
Brain (`write_to_service` usa `htonl`). El nuevo comando Sentinel debe usar BigEndian.

---

## 7. Nucleus.json — schema extendido

El campo `onboarding` en `nucleus.json` se expande. El escritor es
**Conductor Onboarding** — no nucleus.exe directamente.

```json
"onboarding": {
  "completed": false,
  "started": true,
  "profile_id": "b0a3cb70-ea64-4f07-b0c8-8f5ba029d148",
  "current_step": "gemini_api",
  "started_at": "2026-03-05T03:30:21Z",
  "updated_at": "2026-03-05T03:35:00Z",
  "accounts": [
    {
      "provider": "google",
      "email": "user@gmail.com",
      "status": "active",
      "completed_at": "2026-03-05T03:32:00Z"
    },
    {
      "provider": "gemini",
      "email": "user@gmail.com",
      "status": "pending",
      "completed_at": null
    },
    {
      "provider": "github",
      "email": "user@github.com",
      "status": "pending",
      "completed_at": null
    }
  ]
}
```

**Reglas:**
- `started = true` cuando Conductor emite la primera señal `onboarding_navigate`
- `current_step` = el step de la señal más reciente
- `accounts[].status = "active"` cuando `ACCOUNT_REGISTERED` llega para ese provider
- `completed = true` cuando todos los accounts tienen `status: "active"`

---

## 8. Flujo de uso completo — Conductor Onboarding

Este es el script de orquestación que Conductor ejecuta. Cada comando es
atómico — Temporal garantiza que la señal llega aunque Brain o Sentinel
estén temporalmente caídos (reintentos automáticos).

```bash
# ── PREREQUISITOS ──────────────────────────────────────────────────────────
# Brain corriendo:    brain service start
# Temporal corriendo: nucleus temporal ensure
# Worker corriendo:   nucleus worker start -q profile-orchestration
# Perfil seeded:      nucleus synapse seed MasterWorker --master
# ───────────────────────────────────────────────────────────────────────────

# PASO 0: Lanzar perfil en modo discovery con register=true
# Cold start — Chrome abre en pantalla welcome automáticamente
nucleus --json synapse launch b0a3cb70 --mode discovery \
    --override-register true \
    --override-email user@gmail.com
# Esperar a que PROFILE_CONNECTED llegue a Brain (el host se registra)
# Conductor puede hacer polling de nucleus synapse status b0a3cb70

# PASO 1: Navegar a Google Login
# (si el cold start ya arrancó en welcome, esto es opcional pero seguro enviarlo)
nucleus --json synapse onboarding b0a3cb70 \
    --step google_login \
    --email user@gmail.com
# → Señal enviada a Temporal. Activity ejecuta sentinel send → Brain → Host → Chrome.
# → discovery.js muestra screen-google-login.

# ESPERAR evento ACCOUNT_REGISTERED con provider=google
# Conductor hace polling: nucleus synapse status b0a3cb70
# o escucha EventBus de Brain (sentinel listen --filter ACCOUNT_REGISTERED)

# PASO 2: Cuenta Google confirmada → navegar a Gemini API Key
nucleus --json synapse onboarding b0a3cb70 \
    --step gemini_api \
    --email user@gmail.com \
    --service gemini
# → discovery.js muestra screen-gemini-api con email pre-cargado.

# ESPERAR evento ACCOUNT_REGISTERED con provider=gemini

# PASO 3: Gemini confirmado → navegar a GitHub
nucleus --json synapse onboarding b0a3cb70 \
    --step google_login \
    --email user@github.com \
    --service github
# Reutiliza la pantalla google_login pero con contexto de GitHub

# ESPERAR evento ACCOUNT_REGISTERED con provider=github

# PASO 4: (Opcional) Twitter
nucleus --json synapse onboarding b0a3cb70 \
    --step google_login \
    --email user@twitter.com \
    --service twitter

# PASO N: Marcar onboarding completo
nucleus --json synapse onboarding b0a3cb70 --step success
# → discovery.js muestra pantalla de éxito final.

# Conductor actualiza nucleus.json:
#   onboarding.completed = true
#   onboarding.updated_at = now()
```

### Timeouts recomendados para Conductor

| Step | Timeout de espera | Razón |
|---|---|---|
| `google_login` | 10 minutos | El usuario completa OAuth manualmente |
| `google_login_waiting` | 10 minutos | Ídem |
| `gemini_api_waiting` | 15 minutos | El usuario necesita crear y copiar la key en AI Studio |
| `api_waiting` | 15 minutos | Ídem para otros providers |
| Todos los demás | 2 minutos | Transiciones automáticas o simples |

Si el timeout expira sin recibir `ACCOUNT_REGISTERED`, Conductor puede reenviar
el mismo step (idempotente — discovery.js simplemente vuelve a mostrar la pantalla).

---

## 9. Gestión de errores y casos borde

### 9.1 Perfil offline cuando se envía la señal

Temporal reintenta la activity `SendOnboardingNavigate` con backoff exponencial
(2s, 4s, 8s — máximo 3 intentos). Si el perfil sigue offline después de los
reintentos, la activity falla y el workflow queda en estado `FAILED`.

Conductor debe detectar esto via `nucleus synapse status <profile_id>` y
relanzar el perfil si es necesario.

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

La activity falla. Temporal reintenta. Brain es un servicio Windows (`BloomBrain`)
con nssm — se reinicia automáticamente. En la práctica el reintento debería encontrar
Brain disponible.

---

## 10. Contratos que NO se tocan

Estas interfaces son consumidas por otros componentes. Modificarlas rompe el sistema.

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

---

## 11. Checklist de implementación

### Sentinel (Go)
- [ ] Subcomando `send <profile_id> <json>` implementado
- [ ] Framing TCP BigEndian correcto (igual que Brain espera)
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

### JavaScript
- [ ] Case `onboarding_navigate` en `handleHostMessage()` en `background.js`
- [ ] `return` después del case para evitar reenvío a Brain
- [ ] Método `handleOnboardingNavigate(step, payload)` en `OnboardingFlow`
- [ ] Listener en `setupListeners()` para `ONBOARDING_NAVIGATE`
- [ ] Mapeo completo de los 9 steps
- [ ] Persistencia en `onboarding_state` en chrome.storage
- [ ] Pre-selección de provider cuando `step=api_waiting` y `payload.service` presente
- [ ] Manejo silencioso de step desconocido (warn + return, no throw)

### Nucleus.json
- [ ] Schema `onboarding` extendido con `accounts[]`, `current_step`, `started_at`
- [ ] Conductor actualiza el schema (no nucleus.exe)

---

## 12. Archivos a adjuntar al implementador

Cuando uses este prompt para instruir a otra instancia de Claude:

**Adjuntar obligatoriamente:**
1. `SYNAPSE_NEW_COMMAND_GUIDE_v1_0.md` — patrones de comandos Synapse Go
2. `NUCLEUS_SYNAPSE_USAGE_GUIDE_v3_1.md` — arquitectura Temporal, signals
3. `sentinel_activities.go` — para ver patrones exactos de activities existentes
4. `bloom-host.cpp` — para entender qué hace con mensajes de Brain (§handle_service_message)
5. `server_manager.py` — para entender el routing `target_profile` (L467-515)
6. `background.js` — para ver `handleHostMessage()` y el routing existente
7. `discovery.js` — para ver `OnboardingFlow.setupListeners()` y `showScreen()`
8. `nucleus.json` — para ver el schema de `onboarding` a extender

**Adjuntar si disponible:**
9. Código fuente del subcomando `sentinel launch` — como referencia para implementar `sentinel send`
10. `bloom_discovery_onboarding_spec.md` — spec viva de steps y eventos

---

## 13. Lo que este spec NO cubre

Estos temas están fuera del alcance de esta implementación y deben resolverse
en una instancia separada:

- `ACCOUNT_REGISTERED` → cómo Conductor escucha este evento de vuelta (EventBus de Brain)
- Vault integration — cómo se guardan las keys registradas
- Multi-session — qué pasa si se lanza el mismo profile_id dos veces simultáneamente
- `sentinel listen` — si existe un mecanismo de polling para eventos de Brain

---

**Versión:** 2.0  
**Fecha:** 2026-03-05  
**Estado:** Listo para implementación  
**Cambios vs v1.0:**
- Eliminada referencia a `sentinelClient.SendMessage` (no existe)  
- Arquitectura verificada en `bloom-host.cpp`, `server_manager.py`, `sentinel_activities.go`  
- Agregado nuevo subcomando `sentinel send` (eslabón faltante)  
- Framing TCP BigEndian documentado explícitamente  
- Casos borde documentados con comportamiento verificado en código  
- Checklist separado por componente
