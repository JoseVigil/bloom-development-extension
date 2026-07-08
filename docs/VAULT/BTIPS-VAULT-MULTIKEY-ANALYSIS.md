# 🔐 BTIPS VAULT MULTI-KEY ANALYSIS
## Investigación del Sistema de Registro y Almacenamiento de API Keys

**Fecha:** 13 de Febrero, 2026 · **Revisado:** 07 de Julio, 2026 (v1.1)  
**Objetivo:** Evaluar y expandir el sistema de gestión de API keys desde Gemini (único) hacia Claude, ChatGPT y Grok  
**Scope:** Protocolo SYNAPSE, Discovery Page, Vault Architecture

> **Nota de revisión v1.1:** esta versión corrige dos contradicciones detectadas respecto a la arquitectura de seguridad real: (1) Vault.go como stub que permite usar el Keyring sin autorización de Nucleus, y (2) un mecanismo de detección de clipboard que depende de una API de Chrome inexistente y viola el principio de "sin automatización de captura" ya establecido en `AUTHORITY_BOUNDARY.md`. Los cambios están marcados inline con `🔧 CORRECCIÓN v1.1`.

---

## 📊 ESTADO ACTUAL DEL SISTEMA

### ✅ **LO QUE FUNCIONA BIEN**

#### 1. **Sistema de Credenciales Multi-Key para Gemini** (`credentials.py`)
```python
class GeminiKeyManager:
    """
    ✓ Arquitectura sólida y escalable
    ✓ Multi-key rotation con strategies (GREEDY, PRIORITY_FIRST, RESERVE_LAST)
    ✓ Quota tracking automático (1.5M tokens/día por key)
    ✓ Error handling con consecutive_errors
    ✓ Auto-reset de quotas cada 24h
    ✓ Validación de keys vía API de Google
    """
```

**Fortalezas:**
- **Storage dual**: Environment vars (CI/CD) + System Keyring (producción)
- **Metadata granular**: `GeminiKeyInfo` con tracking de usage, priority, errors
- **Intelligent rotation**: Algoritmos de selección basados en availability y priority
- **CLI commands**: `keys-add`, `keys-list`, `keys-delete`, `keys-validate`, `keys-stats`

**Ubicación del dato sensible:**
- **Metadata**: `keyring("bloom-brain", "gemini-profiles")` → JSON con info no sensible
- **API Keys**: `keyring("bloom-brain", "gemini-key:{profile_name}")` → Key real

#### 2. **Discovery Flow y Onboarding** (`discovery.js`, `index.html`)
```javascript
class OnboardingFlow {
    // ✓ Flujo de 3 pasos bien estructurado:
    // 1. Google Login detection
    // 2. AI Studio API Key creation
    // 3. Validation automática
}
```

**Fortalezas:**
- Detección automática de clipboard (API Key copiada)
- Storage en `chrome.storage.local` para estado de onboarding
- Progress tracking visual
- Error handling con recovery

**Limitación crítica:**
- **Hardcoded para Gemini únicamente**
- UI solo muestra instrucciones para AI Studio
- No existe abstracción para otros providers

---

### ⚠️ **PUNTOS CRÍTICOS DETECTADOS**

#### 1. **Vault.go - Implementación Incompleta**

```go
// ❌ PROBLEMA: Vault.go es un STUB, no una implementación funcional
func RequestKey(keyID string) (string, error) {
    // ⚠️ Devuelve un HASH ALEATORIO, no la key real
    hash := sha256.Sum256([]byte(keyID + time.Now().String()))
    return hex.EncodeToString(hash[:]), nil
}
```

**Estado actual:**
- ✅ Tiene comandos CLI (`vault-lock`, `vault-unlock`, `vault-status`)
- ✅ Gestiona estado locked/unlocked
- ❌ **NO almacena keys reales** - solo metadata
- ❌ **NO encripta nada** - solo cuenta keys
- ❌ **NO integra con chrome.storage.local**

**Archivo esperado pero AUSENTE:**
- `vault_keys.json` - Existe en código pero nunca se puebla con keys reales

**🔧 CORRECCIÓN v1.1 — fix requerido antes de expandir a más providers:**

El problema no es solo que `RequestKey` devuelva basura — es que su existencia como stub permite que `GeminiKeyManager` (ver punto 3 más abajo) hable directo con el Keyring del OS **sin pasar nunca por esta función**. Eso significa que hoy Nucleus no es realmente la autoridad que firma el acceso a las keys; es un componente decorativo que el código real ignora.

El fix correcto:
```go
// Vault.go DEBE ser el único punto de entrada al Keyring.
// Nucleus valida rol/scope ANTES de esta llamada, no después.
func RequestKey(keyID string, requesterRole Role, scope string) (string, error) {
    if !nucleus.Authorize(requesterRole, scope, keyID) {
        return "", ErrUnauthorized
    }
    // Recién acá se toca el Keyring real del OS
    return osKeyring.Get(SERVICE_NAME, keyID)
}
```
Y `credentials.py` (Python) deja de llamar a `keyring.set_password`/`get_password` directamente — pasa a comunicarse con Vault.go vía el mismo canal `VAULT_GET_KEY` que ya existe en el Event Bus (Sentinel↔Brain). Un solo camino de autorización, no dos sistemas paralelos que hay que mantener sincronizados.

#### 2. **Flujo de Registro NO Conectado a Vault**

**Discovery → Background → Synapse → Brain:**
```
❌ NO EXISTE HANDLER para "API_KEY_REGISTERED"
❌ NO EXISTE MENSAJE en synapse_protocol.py para guardar en Vault
❌ NO EXISTE INTEGRACIÓN entre background.js y Nucleus/Vault
```

**Flujo actual de Gemini (inferido del código):**
```
1. Usuario copia API Key en AI Studio
2. ❓ (BLACK BOX - no documentado)
3. Key aparece en keyring vía `brain gemini keys-add`
```

**El gap crítico:**
- Discovery UI detecta login/clipboard ✅
- Background.js NO captura el evento de API Key ❌
- Synapse NO tiene mensaje "REGISTER_API_KEY" ❌
- Brain NO recibe la key desde Discovery ❌
- **Usuario debe ejecutar manualmente `brain gemini keys-add --key XXX`** ⚠️

#### 3. **Arquitectura Contradictoria Vault vs Keyring**

Según la descripción original:
> "Las credenciales son capturadas por Cortex vía Synapse, cifradas mediante SafeStorage del SO y almacenadas en chrome.storage.local del Master Profile"

**Realidad en el código:**
```python
# credentials.py usa DIRECTAMENTE system keyring
keyring.set_password("bloom-brain", "gemini-key:Personal", api_key)
```

**Contradicción:**
- ❌ NO usa `chrome.storage.local`
- ❌ NO pasa por Vault.go
- ❌ NO usa SafeStorage explícitamente (keyring lo hace internamente)
- ✅ Funciona, pero **NO coincide con la arquitectura descrita**

---

## 🏗️ ARQUITECTURA PROPUESTA: MULTI-PROVIDER VAULT

### **Principios de Diseño**

1. **Provider-Agnostic Storage**: Una sola estructura para todos los providers
2. **Zero Trust Handshake**: API Keys nunca tocan filesystem de Bloom
3. **Delegated Encryption**: System Keyring hace el cifrado (Windows Credential Manager, macOS Keychain)
4. **Fingerprint-Based Ownership**: `.ownership.json` en Nucleus registra qué keys existen sin revelar contenido
5. **Automatic Registration via Discovery**: Usuario solo copia, sistema registra automáticamente

---

### **NUEVO SCHEMA: Multi-Provider Credentials**

#### **Estructura Unificada en Keyring**

```python
# METADATA (no sensible) - Keyring entry
SERVICE_NAME = "bloom-brain"
KEY_ID = "api-providers-metadata"

METADATA_SCHEMA = {
    "gemini": {
        "Personal": GeminiKeyInfo(...),
        "Work": GeminiKeyInfo(...)
    },
    "claude": {
        "Personal": ClaudeKeyInfo(...),
        "Team": ClaudeKeyInfo(...)
    },
    "openai": {
        "Personal": OpenAIKeyInfo(...),
        "GPT4": OpenAIKeyInfo(...)
    },
    "xai": {
        "Grok": XAIKeyInfo(...)
    }
}

# KEYS REALES (cifradas) - Individual keyring entries
"bloom-brain" -> "gemini-key:Personal" -> "AIzaSy..."
"bloom-brain" -> "claude-key:Personal" -> "sk-ant-..."
"bloom-brain" -> "openai-key:GPT4" -> "sk-..."
"bloom-brain" -> "xai-key:Grok" -> "xai-..."
```

#### **Base DataClass para Todos los Providers**

```python
@dataclass
class APIKeyInfo:
    """Base class para metadata de API keys."""
    provider: str           # "gemini" | "claude" | "openai" | "xai"
    profile_name: str       # User-defined label
    total_quota: int        # Provider-specific
    used_quota: int = 0
    quota_unit: str = "tokens"  # "tokens" | "requests" | "credits"
    last_reset: str = ""
    is_active: bool = True
    priority: int = 0       # 1=preferred, 0=normal, -1=backup
    consecutive_errors: int = 0
    created_at: str = ""
    last_used: Optional[str] = None
    validation_endpoint: str = ""  # Provider-specific
    
    @property
    def fingerprint(self) -> str:
        """Hash para .ownership.json sin revelar key."""
        return hashlib.sha256(
            f"{self.provider}:{self.profile_name}".encode()
        ).hexdigest()[:16]

@dataclass
class GeminiKeyInfo(APIKeyInfo):
    total_quota: int = 1_500_000
    quota_unit: str = "tokens"
    validation_endpoint: str = "https://generativelanguage.googleapis.com/v1beta/models"

@dataclass
class ClaudeKeyInfo(APIKeyInfo):
    total_quota: int = 100_000  # Depende del plan
    quota_unit: str = "tokens"
    validation_endpoint: str = "https://api.anthropic.com/v1/messages"

@dataclass
class OpenAIKeyInfo(APIKeyInfo):
    total_quota: int = 200_000  # Depende del plan
    quota_unit: str = "tokens"
    validation_endpoint: str = "https://api.openai.com/v1/models"

@dataclass
class XAIKeyInfo(APIKeyInfo):
    total_quota: int = 50_000
    quota_unit: str = "tokens"
    validation_endpoint: str = "https://api.x.ai/v1/models"
```

---

### **FLUJO COMPLETO: Discovery → Vault**

#### **FASE 1: Usuario Crea API Key**

```
┌─────────────────────────────────────────────┐
│ Discovery Page (index.html)                │
│                                             │
│ 1. Usuario hace clic en "Crear API Key"   │
│    [Gemini] → AI Studio                    │
│    [Claude] → Anthropic Console            │
│    [OpenAI] → Platform OpenAI              │
│    [Grok] → xAI Console                    │
│                                             │
│ 2. Usuario vuelve a Discovery y PEGA la    │
│    key en el campo de texto del provider   │
│    correspondiente                         │
└─────────────────────────────────────────────┘
                    ↓
```

#### **FASE 2: Captura por Input Manual (🔧 CORRECCIÓN v1.1)**

**Por qué se reemplaza el enfoque anterior:** la v1.0 de este documento proponía `chrome.clipboard.onChanged`, una API que **no existe** en Chrome (el propio documento lo reconocía más abajo, en "Decisiones Pendientes #2"). Las dos alternativas que planteaba esa sección — polling con permiso `clipboardRead`, o content script inyectado en las páginas de los providers — violan directamente el principio ya establecido en `AUTHORITY_BOUNDARY.md`: nada de automatizar la captura de credenciales, nada de tocar el DOM de sitios de terceros.

La solución correcta es más simple que el problema que se estaba tratando de resolver: un campo de texto normal en tu propia UI. Pegar en un `<input>` propio no requiere ningún permiso de Chrome — es simplemente recibir texto que el usuario tipeó o pegó en un formulario que vos controlás, igual que un campo de login.

```javascript
// discovery.js — reemplaza el listener de clipboard
// Sin permisos especiales: es un input estándar en tu propia página.
document.querySelectorAll('.api-key-input').forEach((input) => {
    input.addEventListener('change', (e) => {
        const provider = e.target.dataset.provider; // ej. "claude"
        const rawValue = e.target.value.trim();

        const keyPattern = detectAPIKeyPattern(rawValue, provider);

        if (keyPattern) {
            console.log('[Synapse] API Key format válido:', keyPattern.provider);

            sendToHost({
                event: "API_KEY_SUBMITTED",
                provider: keyPattern.provider,
                key: rawValue,  // Solo viaja por Native Messaging, nunca filesystem
                timestamp: Date.now()
            });

            e.target.value = '';           // no dejar la key en el DOM
            e.target.type = 'password';    // enmascarar mientras se procesa
        } else {
            showInlineError(provider, 'Formato de key no reconocido');
        }
    });
});

function detectAPIKeyPattern(text, expectedProvider) {
    const patterns = {
        gemini: /^AIzaSy[A-Za-z0-9_-]{33}$/,
        claude: /^sk-ant-[A-Za-z0-9_-]+$/,
        openai: /^sk-[A-Za-z0-9]{48}$/,
        xai: /^xai-[A-Za-z0-9_-]+$/
    };

    const regex = patterns[expectedProvider];
    if (regex && regex.test(text)) {
        return { provider: expectedProvider, matched: true };
    }
    return null;
}
```

**Diferencias clave respecto al enfoque descartado:**
- Manifest de la extensión: **sin `clipboardRead`**, consistente con `AUTHORITY_BOUNDARY.md` §1.
- El evento pasa de `API_KEY_DETECTED` (pasivo, "algo apareció en el portapapeles") a `API_KEY_SUBMITTED` (activo, "el usuario confirmó este valor en este campo"). El segundo deja intención explícita del usuario; el primero era ambiguo sobre qué texto era y por qué se capturaba.
- El campo asocia el valor pegado a un provider conocido de antemano (`data-provider`) en vez de adivinar el provider a partir del patrón del texto — menos falsos positivos.

#### **FASE 3: Synapse Protocol Relay**

```python
# synapse_protocol.py - NUEVO HANDLER
class SynapseProtocol:
    def handle_message(self, message: Dict[str, Any]):
        event = message.get('event')
        
        if event == 'API_KEY_SUBMITTED':
            self.handle_api_key_registration(message)
    
    def handle_api_key_registration(self, message: Dict[str, Any]):
        """
        Captura API Key y la envía a Brain para registro en Vault.
        ⚠️ Key nunca toca filesystem de Bloom.
        """
        provider = message['provider']
        api_key = message['key']
        
        # 1. Validar key con provider
        validation = self._validate_key(provider, api_key)
        
        if not validation['valid']:
            self.send_message({
                'event': 'API_KEY_INVALID',
                'provider': provider,
                'error': validation['error']
            })
            return
        
        # 2. Registrar en credentials manager
        from brain.shared.credentials import get_provider_manager
        
        manager = get_provider_manager(provider)
        profile_name = self._generate_profile_name(provider)
        
        manager.add_key(
            profile_name=profile_name,
            api_key=api_key,
            priority=0
        )
        
        # 3. Crear fingerprint en .ownership.json (Nucleus)
        self._register_ownership(provider, profile_name)
        
        # 4. Notificar extensión
        self.send_message({
            'event': 'API_KEY_REGISTERED',
            'provider': provider,
            'profile_name': profile_name,
            'fingerprint': manager.get_fingerprint(profile_name)
        })
    
    def _validate_key(self, provider: str, api_key: str) -> dict:
        """Validación real contra API del provider."""
        validators = {
            'gemini': self._validate_gemini,
            'claude': self._validate_claude,
            'openai': self._validate_openai,
            'xai': self._validate_xai
        }
        
        return validators[provider](api_key)
    
    def _register_ownership(self, provider: str, profile_name: str):
        """
        Registra fingerprint en .bloom/.nucleus/.ownership.json
        SIN revelar la key real.
        """
        fingerprint = hashlib.sha256(
            f"{provider}:{profile_name}".encode()
        ).hexdigest()[:16]
        
        ownership_path = Path.home() / ".bloom" / ".nucleus" / ".ownership.json"
        
        # Cargar existente
        if ownership_path.exists():
            with open(ownership_path) as f:
                ownership = json.load(f)
        else:
            ownership = {"api_keys": {}}
        
        # Agregar entrada
        ownership["api_keys"][fingerprint] = {
            "provider": provider,
            "profile_name": profile_name,
            "registered_at": datetime.utcnow().isoformat(),
            "registered_by": "master"  # Role from Nucleus
        }
        
        # Guardar
        with open(ownership_path, 'w') as f:
            json.dump(ownership, f, indent=2)
```

#### **FASE 4: Unified Credential Manager**

```python
# brain/shared/credentials.py - REFACTORIZACIÓN

class ProviderType(Enum):
    GEMINI = "gemini"
    CLAUDE = "claude"
    OPENAI = "openai"
    XAI = "xai"

class UnifiedCredentialManager:
    """
    Manager único para todos los providers.
    Delega operaciones específicas a sub-managers.
    """
    
    def __init__(self):
        self._managers = {
            ProviderType.GEMINI: GeminiKeyManager(),
            ProviderType.CLAUDE: ClaudeKeyManager(),
            ProviderType.OPENAI: OpenAIKeyManager(),
            ProviderType.XAI: XAIKeyManager()
        }
    
    def get_provider_manager(self, provider: str):
        """Factory method para obtener manager específico."""
        provider_type = ProviderType(provider)
        return self._managers[provider_type]
    
    def list_all_keys(self) -> Dict[str, Dict[str, APIKeyInfo]]:
        """
        Retorna todas las keys de todos los providers.
        
        Returns:
            {
                "gemini": {"Personal": GeminiKeyInfo, ...},
                "claude": {"Work": ClaudeKeyInfo, ...},
                ...
            }
        """
        return {
            provider.value: manager.list_keys()
            for provider, manager in self._managers.items()
        }
    
    def get_stats(self) -> Dict[str, Any]:
        """Estadísticas globales cross-provider."""
        stats = {}
        
        for provider, manager in self._managers.items():
            stats[provider.value] = manager.get_stats()
        
        # Agregar totales
        stats["total"] = {
            "providers": len([s for s in stats.values() if s["total_keys"] > 0]),
            "total_keys": sum(s["total_keys"] for s in stats.values()),
            "active_keys": sum(s["active_keys"] for s in stats.values())
        }
        
        return stats

# Sub-managers específicos
class ClaudeKeyManager(BaseKeyManager):
    """Manager específico para Claude API keys."""
    
    PROVIDER = ProviderType.CLAUDE
    KEY_PREFIX = "claude-key"
    DEFAULT_QUOTA = 100_000  # Tokens/día (depende del plan)
    
    def validate_key(self, profile_name: str) -> dict:
        """Validación contra Anthropic API."""
        api_key = self._get_key(profile_name)
        
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=api_key)
            
            # Test call
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=10,
                messages=[{"role": "user", "content": "ping"}]
            )
            
            return {
                "valid": True,
                "provider": "claude",
                "model": "claude-sonnet-4-20250514"
            }
        
        except Exception as e:
            return {
                "valid": False,
                "error": str(e)
            }

class OpenAIKeyManager(BaseKeyManager):
    """Manager específico para OpenAI API keys."""
    
    PROVIDER = ProviderType.OPENAI
    KEY_PREFIX = "openai-key"
    DEFAULT_QUOTA = 200_000
    
    def validate_key(self, profile_name: str) -> dict:
        """Validación contra OpenAI API."""
        api_key = self._get_key(profile_name)
        
        try:
            import openai
            client = openai.OpenAI(api_key=api_key)
            
            # Test call
            response = client.models.list()
            
            return {
                "valid": True,
                "provider": "openai",
                "models_available": len(response.data)
            }
        
        except Exception as e:
            return {
                "valid": False,
                "error": str(e)
            }

class XAIKeyManager(BaseKeyManager):
    """Manager específico para xAI/Grok API keys."""
    
    PROVIDER = ProviderType.XAI
    KEY_PREFIX = "xai-key"
    DEFAULT_QUOTA = 50_000
    
    def validate_key(self, profile_name: str) -> dict:
        """Validación contra xAI API."""
        # Implementación similar a OpenAI/Claude
        pass
```

---

### **FASE 5: Discovery UI - Multi-Provider**

```html
<!-- index.html - REFACTORIZADO -->
<div id="screen-select-provider" class="screen">
  <div class="progress-bar"><div class="progress-fill" style="width: 33%"></div></div>
  <div class="step-indicator">Paso 2 de 4</div>
  <div class="status-icon">🔑</div>
  <h1>Selecciona tu AI Provider</h1>
  <p>¿Qué servicio de IA deseas configurar?</p>
  
  <div class="provider-grid">
    <button class="provider-card" data-provider="gemini">
      <div class="provider-icon">🔷</div>
      <h3>Gemini</h3>
      <p>Google AI Studio</p>
    </button>
    
    <button class="provider-card" data-provider="claude">
      <div class="provider-icon">🟠</div>
      <h3>Claude</h3>
      <p>Anthropic Console</p>
    </button>
    
    <button class="provider-card" data-provider="openai">
      <div class="provider-icon">🟢</div>
      <h3>ChatGPT</h3>
      <p>OpenAI Platform</p>
    </button>
    
    <button class="provider-card" data-provider="xai">
      <div class="provider-icon">⚡</div>
      <h3>Grok</h3>
      <p>xAI Console</p>
    </button>
  </div>
  
  <button class="btn-secondary" id="btn-skip-provider">Configurar después</button>
</div>

<div id="screen-api-key-waiting" class="screen">
  <div class="progress-bar"><div class="progress-fill" style="width: 66%"></div></div>
  <div class="step-indicator">Paso 3 de 4</div>
  <div class="spinner"></div>
  <h1>Esperando API Key...</h1>
  <p>Crea y copia tu API Key de <strong id="current-provider">Gemini</strong>.<br>La detectaremos automáticamente cuando la copies.</p>
  
  <div class="info-box">
    <h3 id="instructions-title">Instrucciones para Gemini:</h3>
    <ol id="instructions-list">
      <li>Haz clic en "Crear API Key"</li>
      <li>Copia la clave generada</li>
      <li>Vuelve a esta ventana</li>
    </ol>
  </div>
  
  <button class="btn" id="btn-open-provider-console">Ir a Console</button>
</div>
```

```javascript
// discovery.js - PROVIDER LOGIC
class OnboardingFlow {
    constructor() {
        this.selectedProvider = null;
        this.providerURLs = {
            gemini: 'https://aistudio.google.com/app/apikey',
            claude: 'https://console.anthropic.com/settings/keys',
            openai: 'https://platform.openai.com/api-keys',
            xai: 'https://console.x.ai/keys'
        };
        
        this.providerInstructions = {
            gemini: [
                'Haz clic en "Create API Key"',
                'Selecciona tu proyecto',
                'Copia la key generada'
            ],
            claude: [
                'Haz clic en "Create Key"',
                'Asigna un nombre (ej: "Bloom")',
                'Copia la key (comienza con sk-ant-)'
            ],
            openai: [
                'Haz clic en "+ Create new secret key"',
                'Asigna un nombre',
                'Copia la key (comienza con sk-)'
            ],
            xai: [
                'Haz clic en "New API Key"',
                'Asigna permisos',
                'Copia la key (comienza con xai-)'
            ]
        };
    }
    
    selectProvider(provider) {
        this.selectedProvider = provider;
        
        // Update UI
        document.getElementById('current-provider').textContent = 
            this.getProviderDisplayName(provider);
        
        const instructionsList = document.getElementById('instructions-list');
        instructionsList.innerHTML = this.providerInstructions[provider]
            .map(step => `<li>${step}</li>`)
            .join('');
        
        // Open console in new tab
        this.openProviderConsole();
    }
    
    openProviderConsole() {
        const url = this.providerURLs[this.selectedProvider];
        chrome.tabs.create({ url });
        this.showScreen('api-key-waiting');
    }
    
    getProviderDisplayName(provider) {
        const names = {
            gemini: 'Gemini (Google)',
            claude: 'Claude (Anthropic)',
            openai: 'ChatGPT (OpenAI)',
            xai: 'Grok (xAI)'
        };
        return names[provider] || provider;
    }
}
```

---

### **NÚCLEO: Ownership Tracking**

```json
// .bloom/.nucleus/.ownership.json
{
  "version": "1.0",
  "master_role": "john@company.com",
  "api_keys": {
    "a3f2c1b8d4e5f6a7": {
      "provider": "gemini",
      "profile_name": "Personal",
      "registered_at": "2026-02-13T10:30:00Z",
      "registered_by": "master",
      "fingerprint": "a3f2c1b8d4e5f6a7"
    },
    "b8c7d6e5f4a3b2c1": {
      "provider": "claude",
      "profile_name": "Work Team",
      "registered_at": "2026-02-13T11:00:00Z",
      "registered_by": "master",
      "fingerprint": "b8c7d6e5f4a3b2c1"
    },
    "c1d2e3f4a5b6c7d8": {
      "provider": "openai",
      "profile_name": "GPT-4 Research",
      "registered_at": "2026-02-13T11:15:00Z",
      "registered_by": "master",
      "fingerprint": "c1d2e3f4a5b6c7d8"
    }
  }
}
```

**Características:**
- ✅ Registra QUÉ keys existen sin revelar contenido
- ✅ Vincula logical identity (fingerprint) con physical storage (keyring)
- ✅ Audit trail de quién registró cada key
- ✅ Permite revocación sin necesidad de acceder a la key real

---

## 🚀 PLAN DE IMPLEMENTACIÓN

### **SPRINT 1: Foundation (Semana 1)**
- [ ] Crear `brain/shared/credentials/base.py` con `APIKeyInfo` y `BaseKeyManager`
- [ ] Refactorizar `GeminiKeyManager` para heredar de `BaseKeyManager`
- [ ] Crear `UnifiedCredentialManager` con factory pattern
- [ ] Implementar `.ownership.json` en Nucleus
- [ ] Tests unitarios para base classes

### **SPRINT 2: Claude Integration (Semana 2)**
- [ ] Implementar `ClaudeKeyManager` con validation
- [ ] Agregar Claude al Discovery UI (provider selector)
- [ ] Crear mensaje Synapse `API_KEY_DETECTED` para Claude
- [ ] CLI commands: `brain claude keys-add/list/delete/validate`
- [ ] Integration tests con Anthropic API

### **SPRINT 3: OpenAI + xAI Integration (Semana 3)**
- [ ] Implementar `OpenAIKeyManager` y `XAIKeyManager`
- [ ] Completar Discovery UI para los 4 providers
- [ ] Actualizar background.js con pattern detection multi-provider
- [ ] CLI commands para OpenAI y xAI
- [ ] Cross-provider statistics en `brain keys stats`

### **SPRINT 4: Vault.go Completion (Semana 4)**
- [ ] **Decisión arquitectónica**: ¿Mantener Vault.go o usar únicamente Keyring?
- [ ] Si mantener: Integrar Vault.go con chrome.storage.local
- [ ] Si deprecar: Documentar que Keyring ES el Vault oficial
- [ ] Actualizar documentación BTIPS con arquitectura final
- [ ] Security audit del flujo completo

### **SPRINT 5: Testing & Polish (Semana 5)**
- [ ] End-to-end tests del flujo Discovery → Keyring
- [ ] Performance testing con 10+ keys de cada provider
- [ ] Error scenarios (clipboard hijacking, invalid keys, network failures)
- [ ] UX polish en Discovery UI
- [ ] Documentation completa

---

## ⚠️ DECISIONES PENDIENTES

### **1. Vault.go: ¿Mantener o Deprecar?**

**Opción A: Mantener Vault.go como Orchestrator**
```
Pros:
- Cumple con arquitectura descrita originalmente
- Centraliza governance en Nucleus (Go)
- Permite audit logging en filesystem
- Facilita team collaboration (shared ownership)

Contras:
- Duplicación con Keyring
- Más complejo de mantener
- Requiere sincronización entre Vault.go y Keyring
```

**Opción B: Deprecar Vault.go, usar SOLO Keyring**
```
Pros:
- Sistema ya funciona así
- Más simple
- OS-native encryption (SafeStorage)
- Sin sincronización necesaria

Contras:
- No cumple spec original
- Dificulta team sharing
- .ownership.json tiene menos sentido
```

**RECOMENDACIÓN:**
- **Opción B (Keyring solo)** para MVP
- .ownership.json se mantiene como "registry" de qué keys existen
- Vault.go se refactoriza para leer de Keyring en lugar de filesystem
- Permite migrar a Opción A después si se necesita team sharing

### **2. Clipboard Detection: RESUELTO en v1.1 — ninguna de las dos opciones**

La v1.0 de este documento dejaba esto como decisión pendiente entre dos opciones de clipboard. Ambas quedan descartadas:

- ~~Opción A: Polling desde Discovery Page con `clipboardRead`~~ — permiso innecesario para el problema real.
- ~~Opción B: Content Script en Provider Pages~~ — invasivo, viola `AUTHORITY_BOUNDARY.md`.

**Decisión final:** input manual en un campo de la propia UI de Discovery (ver Fase 2 arriba). Cero permisos de clipboard, cero scripts inyectados en sitios de terceros. El usuario pega donde vos controlás, no donde controla el navegador en general.

### **3. Multi-Key Rotation Strategy Cross-Provider**

¿Cómo seleccionar entre Gemini, Claude y OpenAI para la misma tarea?

**Opción A: Provider Preference per Intent Type**
```json
{
    "text-generation": ["claude", "gemini", "openai"],
    "code-generation": ["claude", "openai", "gemini"],
    "vision": ["gemini", "gpt-4v"]
}
```

**Opción B: Cost-Based Routing**
```python
# Seleccionar provider más barato para la tarea
def select_provider(task_type, token_estimate):
    costs = {
        "gemini": 0.0,  # Free tier
        "claude": calculate_cost(token_estimate, "claude"),
        "openai": calculate_cost(token_estimate, "gpt-4")
    }
    return min(costs, key=costs.get)
```

**RECOMENDACIÓN:** Por ahora, rotation DENTRO de cada provider. Cross-provider routing es v2.

---

## 📋 CHECKLIST DE SEGURIDAD

- [ ] API Keys NUNCA tocan filesystem de Bloom en plaintext
- [ ] Chrome.storage.local NO se usa para keys (solo para onboarding state)
- [ ] System Keyring es la única fuente de verdad
- [ ] .ownership.json solo contiene fingerprints (SHA256)
- [ ] Validation de keys ocurre ANTES de guardar
- [ ] Error messages NO revelan partes de la key
- [ ] Clipboard polling tiene timeout (no infinite)
- [ ] Native Messaging channel valida handshake antes de transmitir keys
- [ ] Permisos de Chrome Extension son mínimos necesarios
- [ ] Nucleus commands requieren Master role para vault operations

---

## 🎯 MÉTRICAS DE ÉXITO

- ✅ Usuario puede registrar Gemini/Claude/OpenAI/Grok desde Discovery UI
- ✅ Detección automática de API Key en <5 segundos
- ✅ Validation pre-storage detecta 100% de keys inválidas
- ✅ CLI `brain keys list` muestra todas las keys multi-provider
- ✅ Rotation selecciona key correcta basado en quota/priority
- ✅ Zero API Keys en filesystem de Bloom
- ✅ .ownership.json sincronizado con Keyring (100% match)
- ✅ Error rate <1% en flujo de registro

---

## 📚 ARCHIVOS A CREAR/MODIFICAR

### **NUEVOS**
```
brain/shared/credentials/
├── __init__.py
├── base.py              # APIKeyInfo, BaseKeyManager
├── claude.py            # ClaudeKeyManager
├── openai.py            # OpenAIKeyManager
├── xai.py               # XAIKeyManager
└── unified.py           # UnifiedCredentialManager

brain/cli/commands/claude/
├── keys_add.py
├── keys_list.py
├── keys_delete.py
├── keys_validate.py
└── keys_stats.py

brain/cli/commands/openai/
└── (same structure)

brain/cli/commands/xai/
└── (same structure)

installer/cortex/extension/web/discovery/
├── provider-selector.html
└── provider-icons/

installer/brain/core/synapse/handlers/
├── api_key_handler.py    # Nuevo handler para API_KEY_DETECTED
└── ownership_tracker.py  # .ownership.json management
```

### **MODIFICADOS**
```
brain/shared/credentials.py       # Refactor to use base classes
installer/cortex/extension/background.js    # Add clipboard detection
installer/cortex/extension/web/discovery/index.html  # Multi-provider UI
installer/cortex/extension/web/discovery/discovery.js  # Provider logic
installer/brain/core/synapse/synapse_protocol.py  # New event handlers
installer/nucleus/vault/vault.go  # (Decisión pendiente: refactor o deprecar)
```

---

## 🔍 PRÓXIMOS PASOS INMEDIATOS

1. **Validar con el equipo**: ¿Opción A o B para Vault.go?
2. **Priorizar providers**: ¿Claude primero, o todos en paralelo?
3. **Definir quota limits**: Confirmar quotas diarias de Claude/OpenAI/xAI
4. **Testing plan**: ¿Necesitamos test keys de cada provider?
5. **Security review**: ¿Audit externo del flujo de credenciales?

---

**Última actualización:** 13 de Febrero, 2026  
**Autor:** BTIPS Research Team  
**Status:** Draft - Pending Team Review
