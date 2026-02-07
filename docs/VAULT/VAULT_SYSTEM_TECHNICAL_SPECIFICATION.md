# 🛡️ VAULT SYSTEM - ESPECIFICACIÓN TÉCNICA COMPLETA
## Bóveda Volátil con Arquitectura Nucleus/Temporal

> **Última actualización:** 2026-02-06  
> **Versión:** 2.0 (Post-Synapse Migration to Nucleus)

---

## 📋 ÍNDICE

1. [Contexto Arquitectónico](#1-contexto-arquitectónico)
2. [Flujo de Jerarquía de Comunicación](#2-flujo-de-jerarquía-de-comunicación)
3. [Componentes del Sistema](#3-componentes-del-sistema)
4. [Protocolo de Seguridad: VAULT_LOCK_REQUISITION](#4-protocolo-de-seguridad-vault_lock_requisition)
5. [Implementación por Capas](#5-implementación-por-capas)
6. [Contratos de Datos](#6-contratos-de-datos)
7. [Escenarios de Uso](#7-escenarios-de-uso)
8. [Plan de Implementación](#8-plan-de-implementación)

---

## 1. CONTEXTO ARQUITECTÓNICO

### 1.1 Cambio Fundamental: Nucleus como Orquestador

**ANTES (Sentinel directo):**
```
Conductor → Sentinel → Brain → Host → Cortex
```

**AHORA (Nucleus con Temporal):**
```
Conductor → Nucleus (Temporal) → Sentinel → Brain → Host → Cortex
```

### 1.2 Implicaciones del Cambio

- **Nucleus** es ahora el punto de autoridad y gobierno
- **Temporal.io** maneja la orquestación, reintentos y seguimiento de estado
- **Sentinel** es un sidecar ejecutor, no el orquestador
- **Conductor** (Electron) se comunica ÚNICAMENTE con Nucleus
- El **Vault Shield** vive en Conductor y se sincroniza con Nucleus

### 1.3 Principios de Diseño

1. **Zero Trust**: Nucleus nunca ve las llaves reales
2. **Volatile Storage**: Las llaves solo existen en `chrome.storage.local` (cifrado OS)
3. **Signed Authority**: Toda operación sensible requiere firma criptográfica
4. **Temporal Orchestration**: Operaciones del vault son workflows rastreables
5. **UI Transparency**: El usuario debe VER cuando una llave viaja por el sistema

---

## 2. FLUJO DE JERARQUÍA DE COMUNICACIÓN

### 2.1 Arquitectura Completa

```
┌─────────────────────────────────────────────────────────────────┐
│                        CONDUCTOR (Electron)                      │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │           VaultShield.svelte (UI Component)                │ │
│  │  • Muestra overlay cuando se accede al vault               │ │
│  │  • Se comunica con Nucleus vía IPC/HTTP                    │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │ IPC / HTTP REST API
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                    NUCLEUS (Go + Temporal)                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │         Vault Orchestration Workflow                       │ │
│  │  • VaultRequisitionWorkflow                                │ │
│  │  • Valida .ownership.json                                  │ │
│  │  • Emite eventos para UI Shield                            │ │
│  │  • Orquesta la cadena de comunicación                      │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Event Bus TCP (BigEndian)
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                    SENTINEL (Go Sidecar)                         │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │         Event Bus Relay                                    │ │
│  │  • Recibe comando VAULT_GET_KEY de Nucleus                 │ │
│  │  • Forwarding a Brain vía socket                           │ │
│  │  • Relay de respuestas                                     │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Socket TCP (BigEndian)
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                      BRAIN (Python)                              │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │       Vault Request Handler                                │ │
│  │  • Recibe petición de llave                                │ │
│  │  • Envía comando a Host C++                                │ │
│  │  • Mantiene llave en volatile memory                       │ │
│  │  • Usa y descarta inmediatamente                           │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Socket TCP (BigEndian)
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│                   HOST (bloom-host.cpp)                          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │    🔐 Encrypted Channel to Extension                       │ │
│  │  • Recibe GET_VAULT_KEY desde Brain                        │ │
│  │  • Envía comando cifrado a Extension                       │ │
│  │  • Recibe llave cifrada                                    │ │
│  │  • Devuelve a Brain sin almacenar                          │ │
│  └────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────────────┘
                           │ Chrome Native Messaging (LittleEndian)
                           ↓
┌─────────────────────────────────────────────────────────────────┐
│             CORTEX (Chrome Extension - background.js)            │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              🔒 THE VAULT                                  │ │
│  │  • chrome.storage.local (SafeStorage/DPAPI/Keychain)       │ │
│  │  • Llave privada para firma                                │ │
│  │  • API Keys (Gemini, GitHub, etc.)                         │ │
│  │  • NUNCA sale del contexto de Chrome                       │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Secuencia de Eventos para Obtener una Llave

```mermaid
sequenceDiagram
    participant C as Conductor
    participant N as Nucleus
    participant T as Temporal
    participant S as Sentinel
    participant B as Brain
    participant H as Host
    participant X as Cortex

    C->>N: Request: Launch Profile with API Call
    N->>T: Start VaultRequisitionWorkflow
    T->>N: Execute VaultValidateOwnership Activity
    N->>N: Read .ownership.json
    N->>N: Verify key_fingerprint exists
    N->>C: Event: VAULT_LOCK_REQUISITION (Shield ON)
    N->>S: Event: GET_VAULT_KEY (via TCP)
    S->>B: Forward: GET_VAULT_KEY
    B->>H: Socket: {"type":"VAULT_GET_KEY","key":"gemini_api"}
    H->>X: Native Msg (encrypted): {"command":"GET_SECRET","key":"gemini_api"}
    X->>X: Read chrome.storage.local["vault"]["gemini_api"]
    X->>X: Sign with private key
    X->>H: Response (encrypted): {"secret":"AIz...","signature":"..."}
    H->>B: Socket: {"success":true,"secret":"AIz..."}
    B->>B: Store in volatile string (immediate use)
    B->>N: Event: VAULT_KEY_RECEIVED
    N->>C: Event: VAULT_ACTIVITY_END (Shield OFF)
    B->>B: Use key for API call
    B->>B: Clear volatile string
```

---

## 3. COMPONENTES DEL SISTEMA

### 3.1 Conductor (Electron) - VaultShield.svelte

**Responsabilidades:**
- Renderizar overlay visual cuando el vault está activo
- Comunicarse con Nucleus vía HTTP/WebSocket
- NO maneja lógica de vault, solo visualización

**Comunicación:**
```javascript
// Conductor se suscribe a eventos de Nucleus
const nucleusEventStream = new EventSource('http://localhost:8080/events');

nucleusEventStream.addEventListener('VAULT_LOCK_REQUISITION', (event) => {
  showVaultShield(event.data);
});

nucleusEventStream.addEventListener('VAULT_ACTIVITY_END', (event) => {
  hideVaultShield();
});
```

### 3.2 Nucleus (Go + Temporal)

**Archivo nuevo:** `internal/orchestration/workflows/vault_requisition.go`

```go
package workflows

import (
    "time"
    "go.temporal.io/sdk/workflow"
    "nucleus/internal/orchestration/types"
)

// VaultRequisitionWorkflow orquesta la obtención segura de una llave
func VaultRequisitionWorkflow(ctx workflow.Context, input types.VaultRequisitionInput) (*types.VaultRequisitionResult, error) {
    logger := workflow.GetLogger(ctx)
    logger.Info("Starting Vault Requisition", "profile_id", input.ProfileID, "key", input.KeyName)

    // Activity 1: Validar ownership
    var ownershipValid types.OwnershipValidation
    err := workflow.ExecuteActivity(ctx, 
        workflow.ActivityOptions{
            StartToCloseTimeout: 10 * time.Second,
        },
        "ValidateOwnership",
        input.ProfileID,
        input.Fingerprint,
    ).Get(ctx, &ownershipValid)
    
    if err != nil || !ownershipValid.Valid {
        return &types.VaultRequisitionResult{
            Success: false,
            Error:   "Ownership validation failed",
        }, err
    }

    // Activity 2: Emitir evento UI (Shield ON)
    workflow.ExecuteActivity(ctx,
        workflow.ActivityOptions{StartToCloseTimeout: 5 * time.Second},
        "EmitUIEvent",
        types.UIEvent{
            Type:      "VAULT_LOCK_REQUISITION",
            ProfileID: input.ProfileID,
            Data: map[string]interface{}{
                "key_requested": input.KeyName,
                "purpose":       input.Purpose,
            },
        },
    )

    // Activity 3: Solicitar llave a Sentinel → Brain → Host → Cortex
    var vaultKey types.VaultKeyResponse
    err = workflow.ExecuteActivity(ctx,
        workflow.ActivityOptions{
            StartToCloseTimeout: 30 * time.Second,
            RetryPolicy: &temporal.RetryPolicy{
                MaximumAttempts: 3,
            },
        },
        "RequestVaultKey",
        input.ProfileID,
        input.KeyName,
    ).Get(ctx, &vaultKey)

    if err != nil {
        // Emitir Shield OFF en caso de error
        workflow.ExecuteActivity(ctx,
            workflow.ActivityOptions{StartToCloseTimeout: 5 * time.Second},
            "EmitUIEvent",
            types.UIEvent{Type: "VAULT_ACTIVITY_END"},
        )
        
        return &types.VaultRequisitionResult{
            Success: false,
            Error:   err.Error(),
        }, err
    }

    // Activity 4: Validar firma de la respuesta
    var signatureValid types.SignatureValidation
    err = workflow.ExecuteActivity(ctx,
        workflow.ActivityOptions{StartToCloseTimeout: 5 * time.Second},
        "ValidateSignature",
        vaultKey.Signature,
        vaultKey.PublicKeyFingerprint,
        ownershipValid.PublicKey,
    ).Get(ctx, &signatureValid)

    if err != nil || !signatureValid.Valid {
        return &types.VaultRequisitionResult{
            Success: false,
            Error:   "Signature validation failed",
        }, err
    }

    // Activity 5: Emitir evento UI (Shield OFF)
    workflow.ExecuteActivity(ctx,
        workflow.ActivityOptions{StartToCloseTimeout: 5 * time.Second},
        "EmitUIEvent",
        types.UIEvent{Type: "VAULT_ACTIVITY_END"},
    )

    // Retornar la llave (solo dentro del contexto del workflow)
    return &types.VaultRequisitionResult{
        Success: true,
        Key:     vaultKey.Secret,
        KeyName: input.KeyName,
    }, nil
}
```

**Archivo nuevo:** `internal/orchestration/activities/vault_activities.go`

```go
package activities

import (
    "context"
    "encoding/json"
    "fmt"
    "os"
    "path/filepath"
    
    "nucleus/internal/core"
)

type VaultActivities struct {
    logger       *core.Logger
    bloomRootDir string
}

func NewVaultActivities(logger *core.Logger, bloomRootDir string) *VaultActivities {
    return &VaultActivities{
        logger:       logger,
        bloomRootDir: bloomRootDir,
    }
}

// ValidateOwnership verifica que el fingerprint coincida con .ownership.json
func (a *VaultActivities) ValidateOwnership(ctx context.Context, profileID, fingerprint string) (*types.OwnershipValidation, error) {
    ownershipPath := filepath.Join(a.bloomRootDir, ".ownership.json")
    
    data, err := os.ReadFile(ownershipPath)
    if err != nil {
        return &types.OwnershipValidation{Valid: false}, fmt.Errorf("ownership file not found: %w", err)
    }

    var ownership types.OwnershipFile
    if err := json.Unmarshal(data, &ownership); err != nil {
        return &types.OwnershipValidation{Valid: false}, fmt.Errorf("invalid ownership file: %w", err)
    }

    // Validar fingerprint
    if ownership.KeyFingerprint != fingerprint {
        a.logger.Warning("Fingerprint mismatch: expected=%s got=%s", ownership.KeyFingerprint, fingerprint)
        return &types.OwnershipValidation{
            Valid: false,
            Error: "Fingerprint mismatch - unauthorized access attempt",
        }, nil
    }

    return &types.OwnershipValidation{
        Valid:     true,
        PublicKey: ownership.PublicKey,
    }, nil
}

// RequestVaultKey solicita una llave al vault vía Sentinel
func (a *VaultActivities) RequestVaultKey(ctx context.Context, profileID, keyName string) (*types.VaultKeyResponse, error) {
    // Crear comando para Sentinel
    cmd := types.SentinelCommand{
        Type:      "VAULT_GET_KEY",
        ProfileID: profileID,
        Data: map[string]interface{}{
            "key_name": keyName,
        },
    }

    // Enviar a Sentinel vía Event Bus (implementación depende de cómo Nucleus se comunica con Sentinel)
    // Aquí asumimos que hay un cliente de Event Bus disponible
    response, err := a.sendToSentinel(ctx, cmd)
    if err != nil {
        return nil, err
    }

    return response, nil
}

// EmitUIEvent envía eventos a Conductor
func (a *VaultActivities) EmitUIEvent(ctx context.Context, event types.UIEvent) error {
    // Publicar evento en el stream de SSE que Conductor está escuchando
    // Implementación depende del mecanismo de eventos Nucleus → Conductor
    a.logger.Info("Emitting UI event: %s", event.Type)
    
    // TODO: Implementar publicación real al event stream
    return nil
}

// ValidateSignature verifica la firma criptográfica de la respuesta
func (a *VaultActivities) ValidateSignature(ctx context.Context, signature, fingerprint, publicKey string) (*types.SignatureValidation, error) {
    // Implementar validación de firma usando crypto/ed25519 o similar
    // Por ahora, placeholder
    
    return &types.SignatureValidation{
        Valid: true,
    }, nil
}
```

### 3.3 Sentinel (Go Sidecar)

**Modificación:** `internal/core/eventbus.go`

```go
// Agregar handler para VAULT_GET_KEY
func (eb *EventBus) handleVaultCommand(event Event) error {
    // Forwarding directo a Brain
    return eb.forwardToBrain(event)
}
```

**No necesita lógica compleja:** Sentinel solo actúa como relay.

### 3.4 Brain (Python)

**Archivo nuevo:** `brain/vault/vault_handler.py`

```python
"""
Manejo de peticiones de vault desde Nucleus.
La llave NUNCA se almacena, solo se mantiene en memoria volatile durante la transacción.
"""

import logging
from typing import Optional, Dict, Any
from dataclasses import dataclass

logger = logging.getLogger("brain.vault")

@dataclass
class VaultKeyRequest:
    key_name: str
    profile_id: str
    purpose: str

class VaultHandler:
    """
    Handler que solicita llaves al Host C++ y las mantiene en memoria volátil.
    """
    
    def __init__(self, host_communicator):
        self.host = host_communicator
        self._volatile_key: Optional[str] = None
    
    async def request_key(self, request: VaultKeyRequest) -> Optional[str]:
        """
        Solicita una llave al vault.
        La llave se mantiene en self._volatile_key SOLO durante la transacción.
        """
        logger.info(f"Requesting vault key: {request.key_name}")
        
        # Enviar comando al Host
        response = await self.host.send_command({
            "type": "VAULT_GET_KEY",
            "key": request.key_name,
            "profile_id": request.profile_id
        })
        
        if not response.get("success"):
            logger.error(f"Vault key request failed: {response.get('error')}")
            return None
        
        # Almacenar temporalmente en memoria
        self._volatile_key = response.get("secret")
        
        return self._volatile_key
    
    def get_volatile_key(self) -> Optional[str]:
        """Retorna la llave volátil (si existe)"""
        return self._volatile_key
    
    def clear_volatile_key(self):
        """Limpia la llave de la memoria"""
        if self._volatile_key:
            # Sobrescribir con zeros antes de liberar
            self._volatile_key = "0" * len(self._volatile_key)
            self._volatile_key = None
            logger.debug("Volatile key cleared from memory")
```

**Uso en un intent:**

```python
# En brain/intents/dev_intent.py (ejemplo)

async def execute_api_call_with_vault(self, intent: Intent):
    """Ejecuta un API call que requiere llave del vault"""
    
    # 1. Solicitar llave
    vault_request = VaultKeyRequest(
        key_name="gemini_api_key",
        profile_id=intent.profile_id,
        purpose="gemini_code_generation"
    )
    
    api_key = await self.vault_handler.request_key(vault_request)
    
    if not api_key:
        raise VaultError("Failed to retrieve API key")
    
    try:
        # 2. Usar la llave
        result = await self.gemini_client.generate(
            prompt=intent.prompt,
            api_key=api_key
        )
        
        return result
    
    finally:
        # 3. CRÍTICO: Limpiar inmediatamente
        self.vault_handler.clear_volatile_key()
```

### 3.5 Host (C++)

**Modificación:** `bloom-host.cpp`

Agregar soporte para comando `VAULT_GET_KEY` con cifrado:

```cpp
// En handle_chrome_message()

if (cmd == "VAULT_GET_KEY") {
    std::string key_name = json_get_string_safe(msg, "key", "");
    
    if (key_name.empty()) {
        std::cerr << "[VAULT] ✗ key_name required" << std::endl;
        return;
    }
    
    // 🔐 Generar nonce para cifrado
    std::string nonce = generate_nonce();
    
    json vault_request;
    vault_request["command"] = "GET_SECRET";
    vault_request["key"] = key_name;
    vault_request["nonce"] = nonce;
    vault_request["encrypted"] = true;
    
    std::cerr << "[VAULT] Requesting key: " << key_name << std::endl;
    
    // Enviar a Extension
    write_message_to_chrome(vault_request.dump());
    
    // La respuesta llegará por handle_chrome_message con type="VAULT_RESPONSE"
    // y será forwardeada a Brain vía write_to_service()
}
```

**Agregar handler para respuesta:**

```cpp
// En handle_chrome_message(), agregar:

if (msg_type == "VAULT_RESPONSE") {
    std::cerr << "[VAULT] Response received - forwarding to Brain" << std::endl;
    
    // Validar firma (TODO: implementar validación real)
    bool signature_valid = validate_vault_signature(msg);
    
    if (!signature_valid) {
        std::cerr << "[VAULT] ✗ Invalid signature" << std::endl;
        
        json error_response;
        error_response["type"] = "VAULT_ERROR";
        error_response["error"] = "Invalid signature";
        
        write_to_service(error_response.dump());
        return;
    }
    
    // Forward a Brain (NO almacenar)
    write_to_service(msg_str);
}
```

### 3.6 Cortex (Chrome Extension - background.js)

**Agregar al final de background.js:**

```javascript
// ============================================================================
// VAULT MANAGEMENT
// ============================================================================

/**
 * El Vault es el almacenamiento cifrado de llaves secretas.
 * Usa chrome.storage.local que está protegido por SafeStorage (OS level).
 */

// Estructura del vault en storage:
// {
//   "vault": {
//     "gemini_api_key": "AIza...",
//     "github_token": "ghp_...",
//     "private_key": "-----BEGIN PRIVATE KEY-----...",
//     "public_key_fingerprint": "sha256:abc123..."
//   }
// }

async function handleGetSecret(msg, msgId) {
  const { key, nonce, encrypted } = msg;
  
  if (!key) {
    respondToHost(msgId, {
      success: false,
      error: 'key parameter required'
    });
    return;
  }

  console.log('[Vault] GET_SECRET request:', key);

  try {
    // Leer del vault
    const result = await chrome.storage.local.get(['vault', 'vault_private_key']);
    const vault = result.vault || {};
    const privateKey = result.vault_private_key;

    if (!vault[key]) {
      respondToHost(msgId, {
        success: false,
        error: `Key "${key}" not found in vault`
      });
      return;
    }

    const secret = vault[key];

    // Si se requiere firma
    if (encrypted && privateKey) {
      const signature = await signWithPrivateKey(secret + nonce, privateKey);
      const fingerprint = await getPublicKeyFingerprint();

      respondToHost(msgId, {
        success: true,
        secret: secret,
        signature: signature,
        public_key_fingerprint: fingerprint,
        encrypted: true
      });
    } else {
      // Respuesta simple (sin firma)
      respondToHost(msgId, {
        success: true,
        secret: secret,
        encrypted: false
      });
    }

  } catch (e) {
    console.error('[Vault] Error:', e);
    respondToHost(msgId, {
      success: false,
      error: e.message
    });
  }
}

async function signWithPrivateKey(data, privateKey) {
  // Implementar firma usando Web Crypto API
  // Por ahora, placeholder
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  // TODO: Importar privateKey y firmar con crypto.subtle.sign()
  
  return "signature_placeholder";
}

async function getPublicKeyFingerprint() {
  const result = await chrome.storage.local.get(['vault_public_key_fingerprint']);
  return result.vault_public_key_fingerprint || "";
}

// Agregar al router de comandos en handleHostMessage:
if (command === 'GET_SECRET') {
  handleGetSecret(msg, msgId);
  return;
}
```

**Inicialización del Vault durante Onboarding:**

```javascript
// En discovery.js (cuando register=true)

async function initializeVault(googleEmail, geminiApiKey) {
  console.log('[Vault] Initializing vault for:', googleEmail);

  // 1. Generar par de llaves criptográficas
  const keyPair = await generateKeyPair();
  
  // 2. Calcular fingerprint de la llave pública
  const fingerprint = await calculateFingerprint(keyPair.publicKey);
  
  // 3. Guardar en vault
  await chrome.storage.local.set({
    vault: {
      gemini_api_key: geminiApiKey,
      // Otros secretos se agregarán aquí
    },
    vault_private_key: keyPair.privateKey,
    vault_public_key: keyPair.publicKey,
    vault_public_key_fingerprint: fingerprint,
    vault_initialized: true,
    vault_owner_email: googleEmail
  });

  // 4. Enviar fingerprint a Brain para que lo escriba en .ownership.json
  sendToHost({
    type: 'VAULT_INITIALIZED',
    fingerprint: fingerprint,
    public_key: keyPair.publicKey,
    email: googleEmail
  });

  console.log('[Vault] ✓ Vault initialized');
  console.log('[Vault] Fingerprint:', fingerprint);
}

async function generateKeyPair() {
  // Generar par de llaves Ed25519
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "Ed25519",
      namedCurve: "Ed25519"
    },
    true, // extractable
    ["sign", "verify"]
  );

  // Exportar llaves
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  return {
    privateKey: JSON.stringify(privateKeyJwk),
    publicKey: JSON.stringify(publicKeyJwk)
  };
}

async function calculateFingerprint(publicKeyJwk) {
  const encoder = new TextEncoder();
  const data = encoder.encode(publicKeyJwk);
  
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `sha256:${hashHex}`;
}
```

---

## 4. PROTOCOLO DE SEGURIDAD: VAULT_LOCK_REQUISITION

### 4.1 Estados del Shield

```typescript
type ShieldState = 
  | 'IDLE'           // No hay actividad de vault
  | 'REQUISITION'    // Nucleus solicitó una llave
  | 'TRANSFERRING'   // La llave está viajando por el bus
  | 'VALIDATING'     // Se está validando la firma
  | 'COMPLETE'       // Operación completada
  | 'ERROR';         // Error en el proceso
```

### 4.2 Eventos del Protocolo

**Nucleus → Conductor:**

```json
{
  "event": "VAULT_LOCK_REQUISITION",
  "profile_id": "profile_001",
  "timestamp": 1707145200,
  "data": {
    "key_requested": "gemini_api_key",
    "purpose": "code_generation",
    "requester": "dev_intent_abc123"
  }
}
```

```json
{
  "event": "VAULT_ACTIVITY_END",
  "profile_id": "profile_001",
  "timestamp": 1707145205,
  "data": {
    "success": true,
    "duration_ms": 5234
  }
}
```

### 4.3 Implementación del Shield (VaultShield.svelte)

```svelte
<script>
  import { onMount } from 'svelte';
  
  let shieldActive = false;
  let shieldState = 'IDLE';
  let currentRequest = null;
  
  onMount(() => {
    // Conectar a Nucleus event stream
    const eventSource = new EventSource('http://localhost:8080/nucleus/events');
    
    eventSource.addEventListener('VAULT_LOCK_REQUISITION', (event) => {
      const data = JSON.parse(event.data);
      activateShield(data);
    });
    
    eventSource.addEventListener('VAULT_ACTIVITY_END', (event) => {
      const data = JSON.parse(event.data);
      deactivateShield(data);
    });
  });
  
  function activateShield(request) {
    shieldActive = true;
    shieldState = 'REQUISITION';
    currentRequest = request;
    
    console.log('[Shield] Activated:', request);
  }
  
  function deactivateShield(result) {
    shieldState = 'COMPLETE';
    
    setTimeout(() => {
      shieldActive = false;
      shieldState = 'IDLE';
      currentRequest = null;
    }, 2000);
    
    console.log('[Shield] Deactivated:', result);
  }
</script>

{#if shieldActive}
  <div class="vault-shield-overlay" class:active={shieldActive}>
    <div class="shield-content">
      <div class="shield-icon">
        <svg viewBox="0 0 100 100">
          <!-- Shield icon SVG -->
        </svg>
      </div>
      
      <h2>🔐 Sincronizando Identidad Cifrada</h2>
      
      <div class="shield-info">
        <p class="key-name">Llave: <strong>{currentRequest?.key_requested}</strong></p>
        <p class="purpose">Propósito: {currentRequest?.purpose}</p>
      </div>
      
      <div class="shield-progress">
        <div class="progress-bar" class:complete={shieldState === 'COMPLETE'}></div>
      </div>
      
      <p class="shield-message">
        {#if shieldState === 'REQUISITION'}
          Solicitando acceso al Master Profile...
        {:else if shieldState === 'TRANSFERRING'}
          Transfiriendo credencial cifrada...
        {:else if shieldState === 'VALIDATING'}
          Validando firma criptográfica...
        {:else if shieldState === 'COMPLETE'}
          ✓ Identidad validada exitosamente
        {/if}
      </p>
    </div>
  </div>
{/if}

<style>
  .vault-shield-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(10px);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    animation: fadeIn 0.3s ease-in forwards;
  }
  
  @keyframes fadeIn {
    to { opacity: 1; }
  }
  
  .shield-content {
    text-align: center;
    color: #FFD700;
    max-width: 500px;
  }
  
  .shield-icon {
    width: 120px;
    height: 120px;
    margin: 0 auto 20px;
    animation: pulse 2s ease-in-out infinite;
  }
  
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.1); opacity: 0.8; }
  }
  
  .shield-icon svg {
    width: 100%;
    height: 100%;
    fill: #FFD700;
    filter: drop-shadow(0 0 20px #FFD700);
  }
  
  h2 {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 30px;
  }
  
  .shield-info {
    background: rgba(255, 215, 0, 0.1);
    border: 1px solid #FFD700;
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 30px;
  }
  
  .key-name, .purpose {
    margin: 10px 0;
    font-size: 14px;
  }
  
  .shield-progress {
    width: 100%;
    height: 4px;
    background: rgba(255, 215, 0, 0.2);
    border-radius: 2px;
    overflow: hidden;
    margin-bottom: 20px;
  }
  
  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #FFD700, #FFA500);
    width: 0%;
    animation: progress 3s ease-in-out forwards;
  }
  
  .progress-bar.complete {
    width: 100%;
    background: #00FF00;
  }
  
  @keyframes progress {
    to { width: 90%; }
  }
  
  .shield-message {
    font-size: 16px;
    opacity: 0.9;
  }
</style>
```

---

## 5. IMPLEMENTACIÓN POR CAPAS

### 5.1 Fase 1: Fundación (.ownership.json)

**Objetivo:** Crear el sistema de propiedad durante onboarding.

**Archivos a modificar:**
1. `discovery.js` - Inicializar vault y generar llaves
2. `background.js` - Agregar handlers para `VAULT_INITIALIZED`
3. `brain/onboarding/genesis_handler.py` - Escribir `.ownership.json`

**Contrato `.ownership.json`:**

```json
{
  "version": "1.0",
  "created_at": "2026-02-06T10:30:00Z",
  "profile_id": "profile_001",
  "owner_email": "user@example.com",
  "key_fingerprint": "sha256:abc123...",
  "public_key": "{...jwk...}",
  "roles": {
    "master": ["user@example.com"],
    "architect": [],
    "specialist": []
  }
}
```

### 5.2 Fase 2: Comunicación Host ↔ Cortex (Cifrada)

**Objetivo:** Establecer canal seguro para transferencia de llaves.

**Archivos a modificar:**
1. `bloom-host.cpp` - Agregar `VAULT_GET_KEY` command
2. `background.js` - Agregar `GET_SECRET` handler con firma

**Test:**
```bash
# Enviar comando directo al host
echo '{"command":"VAULT_GET_KEY","key":"gemini_api_key"}' | ./bloom-host.exe
```

### 5.3 Fase 3: Orquestación en Nucleus

**Objetivo:** Implementar workflow de Temporal para vault.

**Archivos nuevos:**
1. `internal/orchestration/workflows/vault_requisition.go`
2. `internal/orchestration/activities/vault_activities.go`
3. `internal/orchestration/types/vault_types.go`

**Test:**
```bash
nucleus synapse vault-get-key profile_001 gemini_api_key
```

### 5.4 Fase 4: UI Shield en Conductor

**Objetivo:** Visualización transparente de operaciones de vault.

**Archivos nuevos:**
1. `conductor/src/components/VaultShield.svelte`
2. `conductor/src/services/NucleusEventStream.js`

**Test:**
```bash
# Simular evento desde Nucleus
curl -X POST http://localhost:8080/nucleus/events \
  -H "Content-Type: application/json" \
  -d '{"event":"VAULT_LOCK_REQUISITION","profile_id":"profile_001","data":{"key_requested":"gemini_api_key"}}'
```

---

## 6. CONTRATOS DE DATOS

### 6.1 Nucleus Types

**Archivo:** `internal/orchestration/types/vault_types.go`

```go
package types

type VaultRequisitionInput struct {
    ProfileID   string `json:"profile_id"`
    KeyName     string `json:"key_name"`
    Purpose     string `json:"purpose"`
    Fingerprint string `json:"fingerprint"`
}

type VaultRequisitionResult struct {
    Success bool   `json:"success"`
    Key     string `json:"key,omitempty"`
    KeyName string `json:"key_name,omitempty"`
    Error   string `json:"error,omitempty"`
}

type OwnershipFile struct {
    Version        string            `json:"version"`
    CreatedAt      string            `json:"created_at"`
    ProfileID      string            `json:"profile_id"`
    OwnerEmail     string            `json:"owner_email"`
    KeyFingerprint string            `json:"key_fingerprint"`
    PublicKey      string            `json:"public_key"`
    Roles          map[string][]string `json:"roles"`
}

type OwnershipValidation struct {
    Valid     bool   `json:"valid"`
    PublicKey string `json:"public_key,omitempty"`
    Error     string `json:"error,omitempty"`
}

type VaultKeyResponse struct {
    Success              bool   `json:"success"`
    Secret               string `json:"secret,omitempty"`
    Signature            string `json:"signature,omitempty"`
    PublicKeyFingerprint string `json:"public_key_fingerprint,omitempty"`
    Error                string `json:"error,omitempty"`
}

type SignatureValidation struct {
    Valid bool   `json:"valid"`
    Error string `json:"error,omitempty"`
}

type UIEvent struct {
    Type      string                 `json:"event"`
    ProfileID string                 `json:"profile_id,omitempty"`
    Timestamp int64                  `json:"timestamp"`
    Data      map[string]interface{} `json:"data,omitempty"`
}
```

### 6.2 Brain Types

**Archivo:** `brain/vault/types.py`

```python
from dataclasses import dataclass
from typing import Optional, Dict, Any

@dataclass
class VaultKeyRequest:
    key_name: str
    profile_id: str
    purpose: str

@dataclass
class VaultKeyResponse:
    success: bool
    secret: Optional[str] = None
    signature: Optional[str] = None
    public_key_fingerprint: Optional[str] = None
    error: Optional[str] = None

@dataclass
class OwnershipFile:
    version: str
    created_at: str
    profile_id: str
    owner_email: str
    key_fingerprint: str
    public_key: str
    roles: Dict[str, list]
```

### 6.3 Cortex (Extension) Types

```javascript
/**
 * @typedef {Object} VaultSecret
 * @property {string} key - Nombre de la llave
 * @property {string} value - Valor secreto
 * @property {string} created_at - Timestamp de creación
 */

/**
 * @typedef {Object} VaultGetSecretRequest
 * @property {string} command - Siempre "GET_SECRET"
 * @property {string} key - Nombre de la llave a obtener
 * @property {string} nonce - Nonce para firma
 * @property {boolean} encrypted - Si se requiere firma
 */

/**
 * @typedef {Object} VaultGetSecretResponse
 * @property {boolean} success
 * @property {string} secret - La llave secreta
 * @property {string} signature - Firma criptográfica
 * @property {string} public_key_fingerprint - Fingerprint de la llave pública
 * @property {boolean} encrypted - Si la respuesta está firmada
 */
```

---

## 7. ESCENARIOS DE USO

### 7.1 Escenario 1: Primer Onboarding (Genesis)

**Usuario:** Nuevo usuario instalando Bloom por primera vez

**Flow:**
1. Usuario ejecuta `nucleus synapse launch profile_001 --mode discovery --register --email user@example.com`
2. Nucleus lanza Sentinel → Brain → Host → Chrome con extension
3. Discovery page se abre, detecta `register=true`
4. Usuario hace login en Google
5. Extension detecta login exitoso, pide API key de Gemini
6. Usuario obtiene API key y la pega
7. Extension ejecuta `initializeVault(email, apiKey)`
8. Se generan llaves Ed25519, se calcula fingerprint
9. Extension envía `VAULT_INITIALIZED` a Host
10. Host → Brain → Nucleus recibe evento
11. Nucleus escribe `.bloom/.ownership.json` con el fingerprint
12. Onboarding completo, usuario es Master

### 7.2 Escenario 2: Ejecución de Intent que Necesita API Key

**Usuario:** Developer ejecutando un `dev` intent para generar código con Gemini

**Flow:**
1. Usuario en Conductor ejecuta intent: `Generate React component with Gemini`
2. Conductor → Nucleus: `ExecuteIntent(type=dev, profile_id=profile_001)`
3. Nucleus inicia `IntentExecutionWorkflow`
4. Workflow detecta que necesita `gemini_api_key`
5. Workflow inicia `VaultRequisitionWorkflow` como child workflow
6. VaultRequisitionWorkflow:
   - Valida `.ownership.json` (fingerprint)
   - Emite `VAULT_LOCK_REQUISITION` → Conductor (Shield ON)
   - Solicita llave: Nucleus → Sentinel → Brain → Host → Cortex
   - Cortex lee de `chrome.storage.local`, firma con llave privada
   - Respuesta: Cortex → Host → Brain → Sentinel → Nucleus
   - Valida firma
   - Emite `VAULT_ACTIVITY_END` → Conductor (Shield OFF)
   - Retorna llave al workflow padre
7. `IntentExecutionWorkflow` continúa:
   - Brain usa llave para llamar a Gemini API
   - Brain limpia llave de memoria (volatile)
   - Genera código
8. Resultado retorna a Conductor
9. Usuario ve código generado

**Timing:**
- Shield visible: ~3-5 segundos
- Usuario VE cuando una llave está en tránsito

### 7.3 Escenario 3: Colaborador Intenta Usar sus Propias Llaves

**Usuario:** Specialist clonó el proyecto de un Master

**Flow:**
1. Specialist ejecuta `nucleus synapse launch profile_001`
2. Nucleus inicia workflow
3. Specialist hace intent que requiere API key
4. VaultRequisitionWorkflow:
   - Lee `.ownership.json` del Master
   - Lee fingerprint del vault del Specialist (diferente)
   - **ValidateOwnership FALLA**
   - Emite `SECURITY_ALERT`
   - Bloquea el intent
5. Conductor muestra mensaje:
   ```
   ⚠️ Acceso Denegado
   
   Este proyecto pertenece a: master@example.com
   Tu vault no está autorizado para este proyecto.
   
   Opciones:
   - Solicitar acceso al Master
   - Configurar tus propias llaves como Specialist
   ```

### 7.4 Escenario 4: Rotación de Llaves

**Usuario:** Master necesita rotar su API key de Gemini

**Flow:**
1. Usuario en Conductor: Settings → Vault Management
2. Click "Rotate Gemini API Key"
3. Conductor → Nucleus: `RotateVaultKey(key_name=gemini_api_key)`
4. Nucleus inicia `VaultRotationWorkflow`:
   - Valida ownership
   - Emite `VAULT_LOCK_REQUISITION`
   - Solicita llave ACTUAL para validar
   - Genera nueva llave (o usuario la provee)
   - Nucleus → Sentinel → Brain → Host → Cortex: `UPDATE_SECRET`
   - Cortex actualiza `chrome.storage.local`
   - Emite `VAULT_ACTIVITY_END`
5. Success notification en Conductor

---

## 8. PLAN DE IMPLEMENTACIÓN

### 8.1 Sprint 1: Fundación (1 semana)

**Objetivo:** `.ownership.json` + Vault initialization en Extension

**Tasks:**
- [ ] Crear types en Nucleus (`vault_types.go`)
- [ ] Implementar `initializeVault()` en `discovery.js`
- [ ] Agregar handler `VAULT_INITIALIZED` en `background.js`
- [ ] Implementar escritura de `.ownership.json` en Brain
- [ ] Tests de onboarding completo

**Entregable:** Onboarding crea vault y ownership file

### 8.2 Sprint 2: Comunicación Segura (1 semana)

**Objetivo:** Host ↔ Cortex puede transferir llaves firmadas

**Tasks:**
- [ ] Implementar `VAULT_GET_KEY` en `bloom-host.cpp`
- [ ] Implementar `GET_SECRET` handler en `background.js`
- [ ] Agregar firma criptográfica con Ed25519
- [ ] Implementar `VaultHandler` en Brain
- [ ] Tests de transferencia end-to-end

**Entregable:** Brain puede obtener llaves del vault

### 8.3 Sprint 3: Orquestación Nucleus (1 semana)

**Objetivo:** Workflows de Temporal para vault

**Tasks:**
- [ ] Implementar `VaultRequisitionWorkflow`
- [ ] Implementar activities: `ValidateOwnership`, `RequestVaultKey`, `ValidateSignature`
- [ ] Agregar comando CLI: `nucleus synapse vault-get-key`
- [ ] Integrar con `IntentExecutionWorkflow`
- [ ] Tests de workflows

**Entregable:** Nucleus orquesta vault via Temporal

### 8.4 Sprint 4: UI Shield (1 semana)

**Objetivo:** Visualización transparente en Conductor

**Tasks:**
- [ ] Crear `VaultShield.svelte`
- [ ] Implementar event stream Nucleus → Conductor
- [ ] Agregar emisión de eventos UI en activities
- [ ] Styling y animaciones del shield
- [ ] Tests de integración UI

**Entregable:** Usuario VE cuando se accede al vault

### 8.5 Sprint 5: Seguridad & Auditoría (1 semana)

**Objetivo:** Hardening y logging de seguridad

**Tasks:**
- [ ] Implementar validación de firmas real (no placeholder)
- [ ] Agregar audit log de accesos al vault
- [ ] Implementar rate limiting para vault access
- [ ] Security review del protocolo
- [ ] Penetration testing

**Entregable:** Sistema seguro y auditado

---

## 9. NOTAS FINALES

### 9.1 Decisiones de Diseño Críticas

1. **¿Por qué Nucleus y no Sentinel?**
   - Nucleus tiene Temporal, que es ideal para workflows complejos
   - Sentinel es sidecar sin estado, no debe tener lógica de gobierno
   - Nucleus es el "Notario" natural del sistema

2. **¿Por qué no usar un secret manager externo?**
   - Chrome SafeStorage ya proporciona cifrado OS-level
   - No queremos dependencias externas
   - El Master Profile ya es la identidad soberana

3. **¿Por qué firmar las respuestas?**
   - Garantiza que la llave viene del vault correcto
   - Previene man-in-the-middle attacks
   - Permite auditoría criptográfica

### 9.2 Limitaciones Conocidas

- **Single Master:** Solo un Master puede ser el owner del vault
- **No Backup:** Si el usuario pierde su Chrome profile, pierde las llaves
- **No Sync:** El vault NO se sincroniza entre máquinas (by design)
- **OS Dependency:** SafeStorage depende del OS (DPAPI/Keychain)

### 9.3 Futuras Mejoras

- **Multi-Master:** Soporte para múltiples Masters con multi-sig
- **Vault Backup:** Protocolo de backup cifrado opcional
- **Hardware Keys:** Soporte para YubiKey/hardware security modules
- **Vault Sharing:** Compartir llaves específicas con Specialists

---

## 10. REFERENCIAS

- [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
- [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- [Temporal.io Workflows](https://docs.temporal.io/workflows)
- [Web Crypto API - Ed25519](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign)
- [DPAPI (Windows)](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/)
- [Keychain Services (macOS)](https://developer.apple.com/documentation/security/keychain_services)

---

**Fin de la Especificación Técnica**
