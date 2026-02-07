# 🔐 VAULT SYSTEM - CÓDIGO DE REFERENCIA

## Ejemplos completos de implementación por componente

---

## 1. NUCLEUS - Workflow de Vault Requisition

### `internal/orchestration/workflows/vault_requisition.go`

```go
package workflows

import (
    "fmt"
    "time"
    
    "go.temporal.io/sdk/temporal"
    "go.temporal.io/sdk/workflow"
    
    "nucleus/internal/orchestration/types"
)

// VaultRequisitionWorkflow orquesta la obtención segura de una llave del vault
// Este workflow es idempotente y puede ser reiniciado sin efectos secundarios
func VaultRequisitionWorkflow(ctx workflow.Context, input types.VaultRequisitionInput) (*types.VaultRequisitionResult, error) {
    logger := workflow.GetLogger(ctx)
    logger.Info("🔐 Starting Vault Requisition Workflow",
        "profile_id", input.ProfileID,
        "key_name", input.KeyName,
        "purpose", input.Purpose)

    ao := workflow.ActivityOptions{
        StartToCloseTimeout: 10 * time.Second,
        RetryPolicy: &temporal.RetryPolicy{
            InitialInterval:    time.Second,
            BackoffCoefficient: 2.0,
            MaximumInterval:    30 * time.Second,
            MaximumAttempts:    3,
        },
    }
    ctx = workflow.WithActivityOptions(ctx, ao)

    // ═══════════════════════════════════════════════════════════════════
    // FASE 1: VALIDACIÓN DE OWNERSHIP
    // ═══════════════════════════════════════════════════════════════════
    
    logger.Info("Phase 1: Validating ownership")
    
    var ownershipValid types.OwnershipValidation
    err := workflow.ExecuteActivity(ctx, "ValidateOwnership", 
        input.ProfileID, 
        input.Fingerprint,
    ).Get(ctx, &ownershipValid)
    
    if err != nil {
        logger.Error("Ownership validation activity failed", "error", err)
        return &types.VaultRequisitionResult{
            Success: false,
            Error:   fmt.Sprintf("Ownership validation failed: %v", err),
        }, err
    }
    
    if !ownershipValid.Valid {
        logger.Warn("Ownership validation rejected", 
            "fingerprint_provided", input.Fingerprint,
            "error", ownershipValid.Error)
        
        // Emitir alerta de seguridad
        workflow.ExecuteActivity(ctx, "EmitSecurityAlert", types.SecurityAlert{
            Type:      "UNAUTHORIZED_VAULT_ACCESS",
            ProfileID: input.ProfileID,
            Details: map[string]interface{}{
                "fingerprint_provided": input.Fingerprint,
                "key_requested":        input.KeyName,
                "purpose":              input.Purpose,
            },
        })
        
        return &types.VaultRequisitionResult{
            Success: false,
            Error:   "Unauthorized: fingerprint mismatch",
        }, fmt.Errorf("unauthorized vault access attempt")
    }
    
    logger.Info("✓ Ownership validated successfully")

    // ═══════════════════════════════════════════════════════════════════
    // FASE 2: ACTIVAR UI SHIELD
    // ═══════════════════════════════════════════════════════════════════
    
    logger.Info("Phase 2: Activating UI Shield")
    
    shieldEvent := types.UIEvent{
        Type:      "VAULT_LOCK_REQUISITION",
        ProfileID: input.ProfileID,
        Timestamp: time.Now().Unix(),
        Data: map[string]interface{}{
            "key_requested": input.KeyName,
            "purpose":       input.Purpose,
            "requester":     input.Requester,
        },
    }
    
    err = workflow.ExecuteActivity(ctx, "EmitUIEvent", shieldEvent).Get(ctx, nil)
    if err != nil {
        logger.Warn("Failed to emit UI shield event", "error", err)
        // No fatal, continuar
    }
    
    logger.Info("✓ UI Shield activated")

    // ═══════════════════════════════════════════════════════════════════
    // FASE 3: SOLICITAR LLAVE AL VAULT
    // ═══════════════════════════════════════════════════════════════════
    
    logger.Info("Phase 3: Requesting vault key")
    
    // Activity con timeout más largo porque involucra múltiples capas
    vaultAO := workflow.ActivityOptions{
        StartToCloseTimeout: 30 * time.Second,
        HeartbeatTimeout:    5 * time.Second,
        RetryPolicy: &temporal.RetryPolicy{
            InitialInterval:    2 * time.Second,
            BackoffCoefficient: 2.0,
            MaximumInterval:    60 * time.Second,
            MaximumAttempts:    3,
        },
    }
    vaultCtx := workflow.WithActivityOptions(ctx, vaultAO)
    
    var vaultKey types.VaultKeyResponse
    err = workflow.ExecuteActivity(vaultCtx, "RequestVaultKey",
        input.ProfileID,
        input.KeyName,
    ).Get(vaultCtx, &vaultKey)
    
    if err != nil {
        logger.Error("Vault key request failed", "error", err)
        
        // Desactivar shield en caso de error
        workflow.ExecuteActivity(ctx, "EmitUIEvent", types.UIEvent{
            Type:      "VAULT_ACTIVITY_END",
            ProfileID: input.ProfileID,
            Timestamp: time.Now().Unix(),
            Data: map[string]interface{}{
                "success": false,
                "error":   err.Error(),
            },
        })
        
        return &types.VaultRequisitionResult{
            Success: false,
            Error:   fmt.Sprintf("Failed to retrieve key: %v", err),
        }, err
    }
    
    if !vaultKey.Success {
        logger.Error("Vault returned failure", "error", vaultKey.Error)
        
        workflow.ExecuteActivity(ctx, "EmitUIEvent", types.UIEvent{
            Type:      "VAULT_ACTIVITY_END",
            ProfileID: input.ProfileID,
            Timestamp: time.Now().Unix(),
            Data:      map[string]interface{}{"success": false},
        })
        
        return &types.VaultRequisitionResult{
            Success: false,
            Error:   vaultKey.Error,
        }, fmt.Errorf("vault error: %s", vaultKey.Error)
    }
    
    logger.Info("✓ Vault key retrieved")

    // ═══════════════════════════════════════════════════════════════════
    // FASE 4: VALIDAR FIRMA CRIPTOGRÁFICA
    // ═══════════════════════════════════════════════════════════════════
    
    logger.Info("Phase 4: Validating cryptographic signature")
    
    var signatureValid types.SignatureValidation
    err = workflow.ExecuteActivity(ctx, "ValidateSignature",
        vaultKey.Signature,
        vaultKey.PublicKeyFingerprint,
        ownershipValid.PublicKey,
        vaultKey.Secret, // El dato firmado
    ).Get(ctx, &signatureValid)
    
    if err != nil || !signatureValid.Valid {
        logger.Error("Signature validation failed", 
            "error", err,
            "validation_error", signatureValid.Error)
        
        // Alerta de seguridad crítica
        workflow.ExecuteActivity(ctx, "EmitSecurityAlert", types.SecurityAlert{
            Type:      "INVALID_VAULT_SIGNATURE",
            ProfileID: input.ProfileID,
            Severity:  "CRITICAL",
            Details: map[string]interface{}{
                "key_requested":       input.KeyName,
                "fingerprint":         vaultKey.PublicKeyFingerprint,
                "expected_fingerprint": input.Fingerprint,
            },
        })
        
        workflow.ExecuteActivity(ctx, "EmitUIEvent", types.UIEvent{
            Type:      "VAULT_ACTIVITY_END",
            ProfileID: input.ProfileID,
            Timestamp: time.Now().Unix(),
            Data:      map[string]interface{}{"success": false},
        })
        
        return &types.VaultRequisitionResult{
            Success: false,
            Error:   "Signature validation failed - potential tampering",
        }, fmt.Errorf("signature validation failed")
    }
    
    logger.Info("✓ Signature validated successfully")

    // ═══════════════════════════════════════════════════════════════════
    // FASE 5: DESACTIVAR UI SHIELD (SUCCESS)
    // ═══════════════════════════════════════════════════════════════════
    
    logger.Info("Phase 5: Deactivating UI Shield")
    
    endEvent := types.UIEvent{
        Type:      "VAULT_ACTIVITY_END",
        ProfileID: input.ProfileID,
        Timestamp: time.Now().Unix(),
        Data: map[string]interface{}{
            "success":     true,
            "key_name":    input.KeyName,
            "duration_ms": time.Since(time.Unix(shieldEvent.Timestamp, 0)).Milliseconds(),
        },
    }
    
    err = workflow.ExecuteActivity(ctx, "EmitUIEvent", endEvent).Get(ctx, nil)
    if err != nil {
        logger.Warn("Failed to emit shield deactivation event", "error", err)
    }
    
    logger.Info("✓ UI Shield deactivated")

    // ═══════════════════════════════════════════════════════════════════
    // RESULTADO FINAL
    // ═══════════════════════════════════════════════════════════════════
    
    logger.Info("🎉 Vault Requisition Workflow completed successfully")
    
    return &types.VaultRequisitionResult{
        Success: true,
        Key:     vaultKey.Secret,
        KeyName: input.KeyName,
    }, nil
}
```

### `internal/orchestration/activities/vault_activities.go`

```go
package activities

import (
    "context"
    "crypto/ed25519"
    "encoding/json"
    "fmt"
    "os"
    "path/filepath"
    "time"
    
    "nucleus/internal/core"
    "nucleus/internal/orchestration/types"
)

type VaultActivities struct {
    logger          *core.Logger
    bloomRootDir    string
    eventBusClient  *EventBusClient  // Cliente para comunicarse con Sentinel
    uiEventEmitter  *UIEventEmitter  // Emitter para eventos a Conductor
}

func NewVaultActivities(logger *core.Logger, bloomRootDir string, eventBus *EventBusClient, uiEmitter *UIEventEmitter) *VaultActivities {
    return &VaultActivities{
        logger:         logger,
        bloomRootDir:   bloomRootDir,
        eventBusClient: eventBus,
        uiEventEmitter: uiEmitter,
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY: ValidateOwnership
// ═══════════════════════════════════════════════════════════════════════════

func (a *VaultActivities) ValidateOwnership(ctx context.Context, profileID, fingerprint string) (*types.OwnershipValidation, error) {
    a.logger.Info("Validating ownership for profile: %s", profileID)
    
    ownershipPath := filepath.Join(a.bloomRootDir, ".ownership.json")
    
    // Leer archivo de ownership
    data, err := os.ReadFile(ownershipPath)
    if err != nil {
        if os.IsNotExist(err) {
            a.logger.Warning("Ownership file not found - profile not initialized")
            return &types.OwnershipValidation{
                Valid: false,
                Error: "Profile not initialized - no ownership file",
            }, nil
        }
        return nil, fmt.Errorf("failed to read ownership file: %w", err)
    }
    
    // Parsear ownership file
    var ownership types.OwnershipFile
    if err := json.Unmarshal(data, &ownership); err != nil {
        return nil, fmt.Errorf("invalid ownership file format: %w", err)
    }
    
    // Validar versión
    if ownership.Version != "1.0" {
        return &types.OwnershipValidation{
            Valid: false,
            Error: fmt.Sprintf("Unsupported ownership version: %s", ownership.Version),
        }, nil
    }
    
    // Validar profile ID
    if ownership.ProfileID != profileID {
        return &types.OwnershipValidation{
            Valid: false,
            Error: "Profile ID mismatch",
        }, nil
    }
    
    // VALIDACIÓN CRÍTICA: Fingerprint match
    if ownership.KeyFingerprint != fingerprint {
        a.logger.Warning("🚨 FINGERPRINT MISMATCH - Unauthorized access attempt!")
        a.logger.Warning("  Expected: %s", ownership.KeyFingerprint)
        a.logger.Warning("  Received: %s", fingerprint)
        
        return &types.OwnershipValidation{
            Valid: false,
            Error: "Fingerprint mismatch - unauthorized vault access attempt",
        }, nil
    }
    
    a.logger.Success("✓ Ownership validated - Fingerprint match")
    
    return &types.OwnershipValidation{
        Valid:     true,
        PublicKey: ownership.PublicKey,
        OwnerEmail: ownership.OwnerEmail,
    }, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY: RequestVaultKey
// ═══════════════════════════════════════════════════════════════════════════

func (a *VaultActivities) RequestVaultKey(ctx context.Context, profileID, keyName string) (*types.VaultKeyResponse, error) {
    a.logger.Info("Requesting vault key: %s for profile: %s", keyName, profileID)
    
    // Crear comando para Sentinel
    cmd := types.SentinelCommand{
        Type:      "VAULT_GET_KEY",
        ProfileID: profileID,
        Timestamp: time.Now().Unix(),
        Data: map[string]interface{}{
            "key_name": keyName,
            "nonce":    generateNonce(),
        },
    }
    
    // Enviar a Sentinel vía Event Bus
    response, err := a.eventBusClient.SendCommand(ctx, cmd, 30*time.Second)
    if err != nil {
        return nil, fmt.Errorf("failed to send command to Sentinel: %w", err)
    }
    
    // Parsear respuesta
    var vaultResp types.VaultKeyResponse
    if err := json.Unmarshal(response, &vaultResp); err != nil {
        return nil, fmt.Errorf("invalid response from vault: %w", err)
    }
    
    if !vaultResp.Success {
        a.logger.Error("Vault returned error: %s", vaultResp.Error)
        return &vaultResp, nil
    }
    
    a.logger.Success("✓ Vault key retrieved successfully")
    
    return &vaultResp, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY: ValidateSignature
// ═══════════════════════════════════════════════════════════════════════════

func (a *VaultActivities) ValidateSignature(ctx context.Context, signature, fingerprint, publicKeyJWK, message string) (*types.SignatureValidation, error) {
    a.logger.Info("Validating cryptographic signature")
    
    // Parsear JWK de la llave pública
    publicKey, err := parseEd25519PublicKeyFromJWK(publicKeyJWK)
    if err != nil {
        return nil, fmt.Errorf("failed to parse public key: %w", err)
    }
    
    // Decodificar firma (asumiendo base64)
    signatureBytes, err := base64Decode(signature)
    if err != nil {
        return nil, fmt.Errorf("failed to decode signature: %w", err)
    }
    
    // Verificar firma
    messageBytes := []byte(message)
    valid := ed25519.Verify(publicKey, messageBytes, signatureBytes)
    
    if !valid {
        a.logger.Warning("🚨 SIGNATURE VERIFICATION FAILED")
        return &types.SignatureValidation{
            Valid: false,
            Error: "Signature verification failed - message may be tampered",
        }, nil
    }
    
    a.logger.Success("✓ Signature verified successfully")
    
    return &types.SignatureValidation{
        Valid: true,
    }, nil
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY: EmitUIEvent
// ═══════════════════════════════════════════════════════════════════════════

func (a *VaultActivities) EmitUIEvent(ctx context.Context, event types.UIEvent) error {
    a.logger.Info("Emitting UI event: %s", event.Type)
    
    // Publicar al stream SSE que Conductor está escuchando
    if err := a.uiEventEmitter.Emit(event); err != nil {
        a.logger.Warning("Failed to emit UI event: %v", err)
        return err
    }
    
    a.logger.Debug("✓ UI event emitted successfully")
    return nil
}

// ═══════════════════════════════════════════════════════════════════════════
// ACTIVITY: EmitSecurityAlert
// ═══════════════════════════════════════════════════════════════════════════

func (a *VaultActivities) EmitSecurityAlert(ctx context.Context, alert types.SecurityAlert) error {
    a.logger.Warning("🚨 SECURITY ALERT: %s", alert.Type)
    
    // Escribir a log de seguridad
    alertLog := filepath.Join(a.bloomRootDir, "logs", "security.jsonl")
    
    alertData, _ := json.Marshal(alert)
    
    f, err := os.OpenFile(alertLog, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0600)
    if err != nil {
        return fmt.Errorf("failed to write security alert: %w", err)
    }
    defer f.Close()
    
    f.Write(alertData)
    f.WriteString("\n")
    
    // También emitir como evento UI
    a.uiEventEmitter.Emit(types.UIEvent{
        Type:      "SECURITY_ALERT",
        ProfileID: alert.ProfileID,
        Timestamp: time.Now().Unix(),
        Data: map[string]interface{}{
            "alert_type": alert.Type,
            "severity":   alert.Severity,
            "details":    alert.Details,
        },
    })
    
    return nil
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

func generateNonce() string {
    // Generar nonce aleatorio para firma
    return fmt.Sprintf("%d_%s", time.Now().UnixNano(), randomString(16))
}

func parseEd25519PublicKeyFromJWK(jwk string) (ed25519.PublicKey, error) {
    // Implementar parsing de JWK Ed25519
    // Placeholder por ahora
    return nil, nil
}

func base64Decode(s string) ([]byte, error) {
    // Implementar decodificación base64
    return nil, nil
}

func randomString(n int) string {
    // Generar string aleatorio
    return "random"
}
```

---

## 2. BRAIN - Vault Handler

### `brain/vault/vault_handler.py`

```python
"""
Vault Handler - Manejo de llaves secretas con memoria volátil.

PRINCIPIOS:
1. Las llaves NUNCA se almacenan en disco
2. Las llaves SOLO existen en memoria durante la transacción
3. Las llaves se limpian inmediatamente después de usarse
4. Cada acceso es auditado
"""

import logging
import asyncio
from typing import Optional, Dict, Any
from dataclasses import dataclass
from datetime import datetime
import json

logger = logging.getLogger("brain.vault")

@dataclass
class VaultKeyRequest:
    """Request para obtener una llave del vault"""
    key_name: str
    profile_id: str
    purpose: str
    nonce: str

@dataclass
class VaultKeyResponse:
    """Response del vault con la llave"""
    success: bool
    secret: Optional[str] = None
    signature: Optional[str] = None
    public_key_fingerprint: Optional[str] = None
    error: Optional[str] = None

class VaultHandler:
    """
    Handler que gestiona el acceso a llaves secretas.
    
    IMPORTANTE:
    - La llave se mantiene en self._volatile_key SOLO durante la transacción
    - DEBE llamarse clear_volatile_key() después de cada uso
    - Si el proceso falla, la llave se limpia automáticamente en __del__
    """
    
    def __init__(self, host_communicator, audit_logger=None):
        self.host = host_communicator
        self.audit_logger = audit_logger
        self._volatile_key: Optional[str] = None
        self._key_metadata: Dict[str, Any] = {}
        self._access_count = 0
    
    async def request_key(self, request: VaultKeyRequest) -> VaultKeyResponse:
        """
        Solicita una llave al vault vía Host → Cortex.
        
        Args:
            request: Objeto con key_name, profile_id, purpose
            
        Returns:
            VaultKeyResponse con la llave o error
        """
        logger.info(f"🔐 Requesting vault key: {request.key_name}")
        
        # Auditar request
        if self.audit_logger:
            self.audit_logger.log_vault_access({
                "action": "REQUEST",
                "key_name": request.key_name,
                "profile_id": request.profile_id,
                "purpose": request.purpose,
                "timestamp": datetime.now().isoformat()
            })
        
        try:
            # Enviar comando al Host C++
            response = await self.host.send_command({
                "type": "VAULT_GET_KEY",
                "key": request.key_name,
                "profile_id": request.profile_id,
                "nonce": request.nonce
            }, timeout=30.0)
            
            if not response.get("success"):
                error_msg = response.get("error", "Unknown error")
                logger.error(f"❌ Vault key request failed: {error_msg}")
                
                if self.audit_logger:
                    self.audit_logger.log_vault_access({
                        "action": "FAILURE",
                        "key_name": request.key_name,
                        "error": error_msg,
                        "timestamp": datetime.now().isoformat()
                    })
                
                return VaultKeyResponse(
                    success=False,
                    error=error_msg
                )
            
            # Almacenar temporalmente en memoria volátil
            self._volatile_key = response.get("secret")
            self._key_metadata = {
                "key_name": request.key_name,
                "timestamp": datetime.now(),
                "purpose": request.purpose,
                "fingerprint": response.get("public_key_fingerprint")
            }
            self._access_count += 1
            
            logger.success(f"✅ Vault key retrieved: {request.key_name}")
            logger.debug(f"   Access count: {self._access_count}")
            
            if self.audit_logger:
                self.audit_logger.log_vault_access({
                    "action": "SUCCESS",
                    "key_name": request.key_name,
                    "access_number": self._access_count,
                    "timestamp": datetime.now().isoformat()
                })
            
            return VaultKeyResponse(
                success=True,
                secret=self._volatile_key,
                signature=response.get("signature"),
                public_key_fingerprint=response.get("public_key_fingerprint")
            )
            
        except asyncio.TimeoutError:
            logger.error("❌ Vault request timeout")
            return VaultKeyResponse(
                success=False,
                error="Vault request timeout (30s)"
            )
        except Exception as e:
            logger.exception(f"❌ Vault request exception: {e}")
            return VaultKeyResponse(
                success=False,
                error=str(e)
            )
    
    def get_volatile_key(self) -> Optional[str]:
        """
        Retorna la llave volátil si existe.
        
        ⚠️  ADVERTENCIA: Solo usar inmediatamente antes de una operación.
        ⚠️  CRÍTICO: Llamar clear_volatile_key() después de usarla.
        """
        if self._volatile_key is None:
            logger.warning("⚠️  get_volatile_key() called but no key in memory")
        return self._volatile_key
    
    def clear_volatile_key(self):
        """
        Limpia la llave de la memoria de forma segura.
        
        IMPORTANTE: Siempre llamar esto después de usar la llave.
        """
        if self._volatile_key:
            # Sobrescribir con zeros antes de liberar
            key_length = len(self._volatile_key)
            self._volatile_key = "0" * key_length
            self._volatile_key = None
            
            logger.debug(f"🗑️  Volatile key cleared from memory")
            
            if self.audit_logger:
                self.audit_logger.log_vault_access({
                    "action": "CLEARED",
                    "key_name": self._key_metadata.get("key_name"),
                    "duration_ms": (datetime.now() - self._key_metadata.get("timestamp")).total_seconds() * 1000,
                    "timestamp": datetime.now().isoformat()
                })
            
            self._key_metadata = {}
    
    def __del__(self):
        """Destructor - limpiar llave si quedó en memoria"""
        if self._volatile_key:
            logger.warning("⚠️  VaultHandler destroyed with key in memory - auto-clearing")
            self.clear_volatile_key()

# ═══════════════════════════════════════════════════════════════════════════
# EJEMPLO DE USO EN UN INTENT
# ═══════════════════════════════════════════════════════════════════════════

class DevIntent:
    """Ejemplo de intent que usa el vault para generar código"""
    
    def __init__(self, vault_handler: VaultHandler):
        self.vault = vault_handler
    
    async def execute_gemini_code_generation(self, intent_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Genera código usando Gemini API.
        Requiere acceso al vault para obtener API key.
        """
        profile_id = intent_data["profile_id"]
        prompt = intent_data["prompt"]
        
        logger.info(f"🎯 Executing Gemini code generation intent")
        
        # ═══════════════════════════════════════════════════════════════
        # PASO 1: Solicitar llave del vault
        # ═══════════════════════════════════════════════════════════════
        
        vault_request = VaultKeyRequest(
            key_name="gemini_api_key",
            profile_id=profile_id,
            purpose="code_generation",
            nonce=generate_nonce()
        )
        
        vault_response = await self.vault.request_key(vault_request)
        
        if not vault_response.success:
            logger.error(f"❌ Failed to get API key: {vault_response.error}")
            return {
                "success": False,
                "error": f"Vault error: {vault_response.error}"
            }
        
        # ═══════════════════════════════════════════════════════════════
        # PASO 2: Usar la llave para llamar a Gemini
        # ═══════════════════════════════════════════════════════════════
        
        try:
            api_key = self.vault.get_volatile_key()
            
            if not api_key:
                raise ValueError("API key not available in memory")
            
            # Llamar a Gemini API
            result = await self.call_gemini_api(
                api_key=api_key,
                prompt=prompt
            )
            
            logger.success(f"✅ Code generated successfully")
            
            return {
                "success": True,
                "code": result["code"],
                "explanation": result["explanation"]
            }
            
        except Exception as e:
            logger.exception(f"❌ Error during code generation: {e}")
            return {
                "success": False,
                "error": str(e)
            }
        
        finally:
            # ═══════════════════════════════════════════════════════════
            # PASO 3: CRÍTICO - Limpiar llave de memoria
            # ═══════════════════════════════════════════════════════════
            
            self.vault.clear_volatile_key()
            logger.debug("🔒 Vault key cleared - memory secure")
    
    async def call_gemini_api(self, api_key: str, prompt: str) -> Dict[str, Any]:
        """Llama a Gemini API (implementación ejemplo)"""
        # Aquí iría la llamada real a Gemini
        import google.generativeai as genai
        
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-pro')
        
        response = model.generate_content(prompt)
        
        return {
            "code": response.text,
            "explanation": "Generated by Gemini"
        }

def generate_nonce() -> str:
    """Genera un nonce único para la firma"""
    import secrets
    return secrets.token_hex(16)
```

---

## 3. CORTEX (Chrome Extension) - Vault Management

### Extension: `background.js` (Vault Section)

```javascript
// ============================================================================
// VAULT MANAGEMENT - CHROME EXTENSION
// ============================================================================

/**
 * El Vault es el almacenamiento cifrado de llaves secretas.
 * 
 * ARQUITECTURA:
 * - chrome.storage.local proporciona cifrado a nivel OS (SafeStorage)
 * - Windows: DPAPI
 * - macOS: Keychain
 * - Linux: libsecret
 * 
 * ESTRUCTURA DE DATOS:
 * {
 *   "vault": {
 *     "gemini_api_key": "AIza...",
 *     "github_token": "ghp_...",
 *     ...
 *   },
 *   "vault_private_key": "{ ... JWK ... }",
 *   "vault_public_key": "{ ... JWK ... }",
 *   "vault_public_key_fingerprint": "sha256:abc123...",
 *   "vault_initialized": true,
 *   "vault_owner_email": "user@example.com"
 * }
 */

// ═══════════════════════════════════════════════════════════════════════════
// VAULT INITIALIZATION (Durante Onboarding)
// ═══════════════════════════════════════════════════════════════════════════

async function initializeVault(googleEmail, geminiApiKey) {
  console.log('[Vault] 🔐 Initializing vault for:', googleEmail);

  try {
    // 1. Generar par de llaves criptográficas Ed25519
    const keyPair = await generateKeyPair();
    
    // 2. Calcular fingerprint de la llave pública
    const fingerprint = await calculateFingerprint(keyPair.publicKey);
    
    console.log('[Vault] Generated key pair');
    console.log('[Vault] Fingerprint:', fingerprint);
    
    // 3. Guardar en vault (chrome.storage.local)
    await chrome.storage.local.set({
      vault: {
        gemini_api_key: geminiApiKey,
        // Más llaves se agregarán aquí en el futuro
      },
      vault_private_key: keyPair.privateKey,
      vault_public_key: keyPair.publicKey,
      vault_public_key_fingerprint: fingerprint,
      vault_initialized: true,
      vault_owner_email: googleEmail,
      vault_created_at: new Date().toISOString()
    });

    console.log('[Vault] ✅ Vault initialized successfully');
    
    // 4. Enviar fingerprint a Brain para escribir .ownership.json
    sendToHost({
      type: 'VAULT_INITIALIZED',
      fingerprint: fingerprint,
      public_key: keyPair.publicKey,
      email: googleEmail,
      timestamp: Date.now()
    });
    
    console.log('[Vault] 📤 Fingerprint sent to Brain for .ownership.json');
    
    return {
      success: true,
      fingerprint: fingerprint
    };
    
  } catch (error) {
    console.error('[Vault] ❌ Initialization failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VAULT ACCESS (Obtener llaves con firma)
// ═══════════════════════════════════════════════════════════════════════════

async function handleGetSecret(msg, msgId) {
  const { key, nonce, encrypted } = msg;
  
  if (!key) {
    respondToHost(msgId, {
      success: false,
      error: 'key parameter required'
    });
    return;
  }

  console.log('[Vault] 🔍 GET_SECRET request:', key);
  console.log('[Vault]   Encrypted:', encrypted);
  console.log('[Vault]   Nonce:', nonce);

  try {
    // 1. Leer del vault
    const result = await chrome.storage.local.get([
      'vault', 
      'vault_private_key', 
      'vault_public_key_fingerprint',
      'vault_initialized'
    ]);
    
    // Validar que el vault esté inicializado
    if (!result.vault_initialized) {
      respondToHost(msgId, {
        success: false,
        error: 'Vault not initialized - please complete onboarding'
      });
      return;
    }
    
    const vault = result.vault || {};
    const privateKeyJWK = result.vault_private_key;
    const fingerprint = result.vault_public_key_fingerprint;

    // 2. Validar que la llave exista
    if (!vault[key]) {
      console.warn('[Vault] ⚠️  Key not found:', key);
      respondToHost(msgId, {
        success: false,
        error: `Key "${key}" not found in vault`
      });
      return;
    }

    const secret = vault[key];
    console.log('[Vault] ✅ Key found in vault');

    // 3. Si se requiere firma criptográfica
    if (encrypted && privateKeyJWK && nonce) {
      console.log('[Vault] 🔐 Generating cryptographic signature...');
      
      const signature = await signMessage(secret + nonce, privateKeyJWK);
      
      console.log('[Vault] ✅ Signature generated');
      
      respondToHost(msgId, {
        success: true,
        secret: secret,
        signature: signature,
        public_key_fingerprint: fingerprint,
        encrypted: true,
        timestamp: Date.now()
      });
      
    } else {
      // Respuesta simple (sin firma)
      console.log('[Vault] ℹ️  Returning secret without signature');
      
      respondToHost(msgId, {
        success: true,
        secret: secret,
        encrypted: false,
        timestamp: Date.now()
      });
    }
    
    console.log('[Vault] 📤 Secret sent successfully');

  } catch (error) {
    console.error('[Vault] ❌ Error retrieving secret:', error);
    respondToHost(msgId, {
      success: false,
      error: error.message
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CRYPTOGRAPHIC FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function generateKeyPair() {
  console.log('[Crypto] Generating Ed25519 key pair...');
  
  // Generar par de llaves Ed25519 usando Web Crypto API
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "Ed25519",
    },
    true, // extractable
    ["sign", "verify"]
  );

  // Exportar llaves a JWK (JSON Web Key)
  const privateKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);

  console.log('[Crypto] ✅ Key pair generated');

  return {
    privateKey: JSON.stringify(privateKeyJwk),
    publicKey: JSON.stringify(publicKeyJwk)
  };
}

async function calculateFingerprint(publicKeyJwk) {
  console.log('[Crypto] Calculating SHA-256 fingerprint...');
  
  const encoder = new TextEncoder();
  const data = encoder.encode(publicKeyJwk);
  
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  const fingerprint = `sha256:${hashHex}`;
  
  console.log('[Crypto] ✅ Fingerprint calculated:', fingerprint.substring(0, 20) + '...');
  
  return fingerprint;
}

async function signMessage(message, privateKeyJWK) {
  console.log('[Crypto] Signing message with Ed25519...');
  
  // Importar llave privada desde JWK
  const privateKeyObj = JSON.parse(privateKeyJWK);
  
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateKeyObj,
    {
      name: "Ed25519",
    },
    false,
    ["sign"]
  );
  
  // Firmar mensaje
  const encoder = new TextEncoder();
  const messageBuffer = encoder.encode(message);
  
  const signatureBuffer = await crypto.subtle.sign(
    {
      name: "Ed25519",
    },
    privateKey,
    messageBuffer
  );
  
  // Convertir a base64
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  const signatureBase64 = btoa(String.fromCharCode(...signatureArray));
  
  console.log('[Crypto] ✅ Message signed');
  
  return signatureBase64;
}

// ═══════════════════════════════════════════════════════════════════════════
// VAULT UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

async function addSecretToVault(keyName, secretValue) {
  console.log('[Vault] Adding secret:', keyName);
  
  const result = await chrome.storage.local.get(['vault']);
  const vault = result.vault || {};
  
  vault[keyName] = secretValue;
  
  await chrome.storage.local.set({ vault: vault });
  
  console.log('[Vault] ✅ Secret added');
}

async function removeSecretFromVault(keyName) {
  console.log('[Vault] Removing secret:', keyName);
  
  const result = await chrome.storage.local.get(['vault']);
  const vault = result.vault || {};
  
  delete vault[keyName];
  
  await chrome.storage.local.set({ vault: vault });
  
  console.log('[Vault] ✅ Secret removed');
}

async function listVaultKeys() {
  const result = await chrome.storage.local.get(['vault']);
  const vault = result.vault || {};
  
  return Object.keys(vault);
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE ROUTER (Agregar a handleHostMessage)
// ═══════════════════════════════════════════════════════════════════════════

// En handleHostMessage(), agregar:
if (command === 'GET_SECRET') {
  handleGetSecret(msg, msgId);
  return;
}

if (command === 'ADD_SECRET') {
  const { key, value } = msg;
  await addSecretToVault(key, value);
  respondToHost(msgId, { success: true });
  return;
}

if (command === 'REMOVE_SECRET') {
  const { key } = msg;
  await removeSecretFromVault(key);
  respondToHost(msgId, { success: true });
  return;
}

if (command === 'LIST_VAULT_KEYS') {
  const keys = await listVaultKeys();
  respondToHost(msgId, { 
    success: true, 
    keys: keys 
  });
  return;
}
```

---

## 4. CONDUCTOR (Electron) - VaultShield Component

### `conductor/src/components/VaultShield.svelte`

```svelte
<script>
  import { onMount, onDestroy } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  
  // ═══════════════════════════════════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════════════════════════════════
  
  let shieldActive = false;
  let shieldState = 'IDLE'; // IDLE | REQUISITION | TRANSFERRING | VALIDATING | COMPLETE | ERROR
  let currentRequest = null;
  let startTime = null;
  let elapsedTime = 0;
  let progressPercentage = 0;
  
  let eventSource = null;
  let progressInterval = null;
  
  // ═══════════════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════════
  
  onMount(() => {
    console.log('[VaultShield] Mounting - connecting to Nucleus events');
    connectToNucleus();
  });
  
  onDestroy(() => {
    console.log('[VaultShield] Destroying - cleaning up');
    if (eventSource) {
      eventSource.close();
    }
    if (progressInterval) {
      clearInterval(progressInterval);
    }
  });
  
  // ═══════════════════════════════════════════════════════════════════════
  // NUCLEUS CONNECTION
  // ═══════════════════════════════════════════════════════════════════════
  
  function connectToNucleus() {
    // Conectar a Nucleus event stream (Server-Sent Events)
    eventSource = new EventSource('http://localhost:8080/nucleus/events');
    
    eventSource.addEventListener('VAULT_LOCK_REQUISITION', (event) => {
      const data = JSON.parse(event.data);
      console.log('[VaultShield] 🔐 VAULT_LOCK_REQUISITION received:', data);
      activateShield(data);
    });
    
    eventSource.addEventListener('VAULT_ACTIVITY_END', (event) => {
      const data = JSON.parse(event.data);
      console.log('[VaultShield] ✅ VAULT_ACTIVITY_END received:', data);
      deactivateShield(data);
    });
    
    eventSource.addEventListener('SECURITY_ALERT', (event) => {
      const data = JSON.parse(event.data);
      console.error('[VaultShield] 🚨 SECURITY_ALERT:', data);
      handleSecurityAlert(data);
    });
    
    eventSource.onerror = (error) => {
      console.error('[VaultShield] EventSource error:', error);
      // Reconectar después de 5 segundos
      setTimeout(connectToNucleus, 5000);
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // SHIELD ACTIVATION / DEACTIVATION
  // ═══════════════════════════════════════════════════════════════════════
  
  function activateShield(request) {
    shieldActive = true;
    shieldState = 'REQUISITION';
    currentRequest = request;
    startTime = Date.now();
    progressPercentage = 0;
    
    console.log('[VaultShield] Shield ACTIVATED');
    console.log('[VaultShield] Request:', request);
    
    // Iniciar simulación de progreso
    progressInterval = setInterval(() => {
      elapsedTime = Date.now() - startTime;
      
      // Progreso simulado (90% en 5 segundos)
      progressPercentage = Math.min(90, (elapsedTime / 5000) * 90);
      
      // Cambiar estado visual basado en tiempo
      if (elapsedTime > 1000 && shieldState === 'REQUISITION') {
        shieldState = 'TRANSFERRING';
      }
      if (elapsedTime > 3000 && shieldState === 'TRANSFERRING') {
        shieldState = 'VALIDATING';
      }
    }, 100);
  }
  
  function deactivateShield(result) {
    if (!shieldActive) return;
    
    console.log('[VaultShield] Shield DEACTIVATING');
    console.log('[VaultShield] Result:', result);
    
    // Clear progress interval
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
    
    // Completar progreso
    progressPercentage = 100;
    shieldState = result.success ? 'COMPLETE' : 'ERROR';
    
    // Fade out después de 2 segundos
    setTimeout(() => {
      shieldActive = false;
      shieldState = 'IDLE';
      currentRequest = null;
      startTime = null;
      elapsedTime = 0;
      progressPercentage = 0;
    }, 2000);
  }
  
  function handleSecurityAlert(alert) {
    // Mostrar alerta crítica
    shieldState = 'ERROR';
    currentRequest = {
      ...currentRequest,
      error: alert.details
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // COMPUTED
  // ═══════════════════════════════════════════════════════════════════════
  
  $: statusMessage = getStatusMessage(shieldState);
  $: shieldColor = getShieldColor(shieldState);
  
  function getStatusMessage(state) {
    switch (state) {
      case 'REQUISITION':
        return 'Solicitando acceso al Master Profile...';
      case 'TRANSFERRING':
        return 'Transfiriendo credencial cifrada...';
      case 'VALIDATING':
        return 'Validando firma criptográfica...';
      case 'COMPLETE':
        return '✓ Identidad validada exitosamente';
      case 'ERROR':
        return '✗ Error de autenticación';
      default:
        return '';
    }
  }
  
  function getShieldColor(state) {
    switch (state) {
      case 'COMPLETE':
        return '#00FF00';
      case 'ERROR':
        return '#FF0000';
      default:
        return '#FFD700';
    }
  }
</script>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- TEMPLATE -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

{#if shieldActive}
  <div 
    class="vault-shield-overlay" 
    transition:fade={{ duration: 300 }}
  >
    <div 
      class="shield-content"
      transition:scale={{ duration: 300, start: 0.9 }}
    >
      <!-- Shield Icon -->
      <div class="shield-icon" style="--shield-color: {shieldColor}">
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <path d="M50 5 L90 20 L90 50 Q90 80, 50 95 Q10 80, 10 50 L10 20 Z" 
                fill="currentColor" 
                opacity="0.2" 
                stroke="currentColor" 
                stroke-width="2"/>
          <path d="M50 15 L80 25 L80 50 Q80 75, 50 85 Q20 75, 20 50 L20 25 Z" 
                fill="none" 
                stroke="currentColor" 
                stroke-width="3"/>
          <text x="50" y="60" 
                text-anchor="middle" 
                font-size="40" 
                fill="currentColor" 
                font-weight="bold">🔐</text>
        </svg>
      </div>
      
      <!-- Title -->
      <h2 class="shield-title">Sincronizando Identidad Cifrada</h2>
      
      <!-- Request Info -->
      {#if currentRequest}
        <div class="shield-info">
          <div class="info-row">
            <span class="label">Llave:</span>
            <span class="value">{currentRequest.key_requested || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Propósito:</span>
            <span class="value">{currentRequest.purpose || 'N/A'}</span>
          </div>
          {#if currentRequest.requester}
            <div class="info-row">
              <span class="label">Solicitado por:</span>
              <span class="value">{currentRequest.requester}</span>
            </div>
          {/if}
        </div>
      {/if}
      
      <!-- Progress Bar -->
      <div class="shield-progress">
        <div 
          class="progress-bar" 
          class:complete={shieldState === 'COMPLETE'}
          class:error={shieldState === 'ERROR'}
          style="width: {progressPercentage}%"
        ></div>
      </div>
      
      <!-- Status Message -->
      <p class="shield-message">{statusMessage}</p>
      
      <!-- Timer -->
      {#if elapsedTime > 0}
        <p class="shield-timer">{(elapsedTime / 1000).toFixed(1)}s</p>
      {/if}
    </div>
  </div>
{/if}

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- STYLES -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

<style>
  .vault-shield-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0, 0, 0, 0.92);
    backdrop-filter: blur(12px);
    z-index: 999999;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .shield-content {
    text-align: center;
    color: #FFD700;
    max-width: 600px;
    padding: 40px;
  }
  
  /* Shield Icon */
  .shield-icon {
    width: 140px;
    height: 140px;
    margin: 0 auto 30px;
    animation: pulse 2.5s ease-in-out infinite;
    color: var(--shield-color, #FFD700);
  }
  
  @keyframes pulse {
    0%, 100% { 
      transform: scale(1); 
      opacity: 1; 
    }
    50% { 
      transform: scale(1.08); 
      opacity: 0.85; 
    }
  }
  
  .shield-icon svg {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 0 25px currentColor);
  }
  
  /* Title */
  .shield-title {
    font-size: 28px;
    font-weight: 600;
    margin-bottom: 35px;
    color: #FFD700;
    text-shadow: 0 0 20px rgba(255, 215, 0, 0.5);
  }
  
  /* Info Box */
  .shield-info {
    background: rgba(255, 215, 0, 0.08);
    border: 2px solid #FFD700;
    border-radius: 12px;
    padding: 25px;
    margin-bottom: 35px;
    box-shadow: 0 0 30px rgba(255, 215, 0, 0.2);
  }
  
  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin: 12px 0;
    font-size: 15px;
  }
  
  .info-row .label {
    font-weight: 500;
    opacity: 0.8;
  }
  
  .info-row .value {
    font-weight: 700;
    font-family: 'Courier New', monospace;
    background: rgba(255, 215, 0, 0.15);
    padding: 4px 12px;
    border-radius: 6px;
  }
  
  /* Progress Bar */
  .shield-progress {
    width: 100%;
    height: 6px;
    background: rgba(255, 215, 0, 0.15);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 25px;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);
  }
  
  .progress-bar {
    height: 100%;
    background: linear-gradient(90deg, #FFD700, #FFA500, #FFD700);
    background-size: 200% 100%;
    animation: shimmer 2s linear infinite;
    transition: width 0.3s ease;
  }
  
  .progress-bar.complete {
    background: #00FF00;
    animation: none;
  }
  
  .progress-bar.error {
    background: #FF0000;
    animation: none;
  }
  
  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
  
  /* Status Message */
  .shield-message {
    font-size: 18px;
    opacity: 0.95;
    font-weight: 500;
    margin-bottom: 15px;
  }
  
  /* Timer */
  .shield-timer {
    font-size: 14px;
    opacity: 0.6;
    font-family: 'Courier New', monospace;
  }
</style>
```

---

## 5. COMANDOS CLI PARA TESTING

### Test completo del flujo Vault

```bash
# 1. Iniciar Temporal
nucleus temporal start

# 2. Iniciar Worker
nucleus worker start

# 3. Lanzar perfil con register (primera vez)
nucleus --json synapse launch profile_001 \
  --mode discovery \
  --register \
  --email test@example.com

# Output esperado:
# {
#   "success": true,
#   "profile_id": "profile_001",
#   "vault_initialized": true,
#   "fingerprint": "sha256:abc123..."
# }

# 4. Verificar .ownership.json
cat .bloom/.ownership.json

# 5. Solicitar una llave (después de onboarding)
nucleus --json synapse vault-get-key profile_001 gemini_api_key

# Output esperado:
# {
#   "success": true,
#   "key_name": "gemini_api_key",
#   "retrieved": true
# }
```

---

**FIN DEL DOCUMENTO DE CÓDIGO DE REFERENCIA**
