# Tu Primer Ion — GitHub PAT

Guía para crear, estructurar y desplegar tu primer paquete Ion para el ecosistema Bloom.

**Caso de uso:** Autenticación con GitHub Personal Access Token  
**Protocolo:** Ion SDK v2.0 · IonPump v2.0 · Cortex >=1.2.0  
**Despliegue:** Metamorph — AppData atomic deploy

---

## ¿Qué vas a construir?

Este paquete Ion automatiza el flujo completo de generación de un PAT en GitHub. El usuario ya está logueado. El ion navega a la página de tokens, completa el formulario, y emite el token generado de vuelta a Brain.

El flujo cubre tres páginas reales: la lista de tokens (`/settings/tokens`), el formulario de creación (`/settings/tokens/new`), y el login (solo para recovery si la sesión expiró).

> **Compatibilidad Metamorph:** Este paquete usa Ion SDK v2.0 con la estructura `actions/` + `pages/` + `shared/`. IonPump lo cargará desde `ionsites/github.com/` dentro del AppData de BloomNucleus. Metamorph lo desplegará como ZIP atómico — ver sección 5.

---

## 1. Estructura del paquete

```
github.com.ion.zip
├── domain.manifest.json
├── actions/
│   └── generate_pat.ion
├── pages/
│   ├── tokens_page.page.ion
│   ├── new_token_page.page.ion
│   └── login_page.page.ion
└── shared/
    └── session_guard.ion
```

---

## 2. domain.manifest.json

Lo primero que lee IonPump. Declara actions, páginas, fragments y capabilities.

```json
{
  "schema_version": "2.0",
  "domain": "github.com",
  "version": "1.0.0",
  "description": "Generate a GitHub Personal Access Token",
  "author": { "name": "Tu Nombre", "contact": "tu@email.com" },

  "actions": {
    "generate_pat": {
      "file": "actions/generate_pat.ion",
      "public": true
    }
  },

  "pages": {
    "tokens_page":    "pages/tokens_page.page.ion",
    "new_token_page": "pages/new_token_page.page.ion",
    "login_page":     "pages/login_page.page.ion"
  },

  "shared": {
    "session_guard": "shared/session_guard.ion"
  },

  "entry_actions": ["generate_pat"],

  "capabilities": [
    "dom_navigate", "dom_type", "dom_click",
    "dom_extract", "dom_watch", "clipboard_read"
  ],

  "requires_cortex_version": ">=1.2.0"
}
```

---

## 3. Page Descriptors

Los page descriptors **no ejecutan nada**. Son contratos estáticos: cómo saber que la página cargó, cuáles son sus elementos interactivos, y qué señales observar pasivamente. Los actions referencian elementos por nombre — nunca por selector CSS directo.

### 3.1 tokens_page.page.ion

La página `/settings/tokens` — lista de tokens y punto de entrada al formulario.

```yaml
page: "tokens_page"
url_pattern: "*/settings/tokens"

ready_when:
  - selector: ".listgroup, [data-testid='tokens-list'], #tokens-table"
    timeout: 10000

elements:
  generate_button:
    selector: "a[href*='/new'], [data-testid='create-token-btn']"
    type: clickable

signals:
  session_expired:
    detect: ".flash-error, [data-testid='session-modal']"
    once: true
    priority: high

transitions:
  on_signal:
    session_expired: "login_page"
  on_navigate:
    "*/settings/tokens/new*": "new_token_page"
    "*/login*":               "login_page"
```

### 3.2 new_token_page.page.ion

La página `/settings/tokens/new` — el formulario de configuración y generación.

```yaml
page: "new_token_page"
url_pattern: "*/settings/tokens/new*"

ready_when:
  - selector: "input#token_description, input[name='token[description]']"
    timeout: 10000

elements:
  token_name_input:
    selector: "input#token_description, input[name='token[description]']"
    type: typeable

  expiration_select:
    selector: "select#token_expiration, select[name='token[expiration]']"
    type: selectable

  scope_repo:
    selector: "input#user_oauth_application_scopes_repo"
    type: checkable

  submit_button:
    selector: "button[type='submit'], input[type='submit']"
    type: clickable

  # Aparece DESPUÉS del submit exitoso
  token_value:
    selector: "#new-oauth-token, .token-result code, input#new-token-value"
    type: extractable

signals:
  token_generated:
    detect: ".flash-success, #new-oauth-token, [data-testid='success-banner']"
    once: true
    priority: normal

transitions:
  on_navigate:
    "*/settings/tokens":  "tokens_page"
    "*/login*":           "login_page"
```

### 3.3 login_page.page.ion

Solo se usa para recovery — cuando GitHub redirige al login porque la sesión expiró.

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
    detect: ".avatar, [data-testid='user-avatar'], header .AppHeader-user"
    once: true
    priority: normal

  two_factor_required:
    detect: "input[name='otp'], #otp"
    once: true
    priority: high

transitions:
  on_signal:
    login_success: "tokens_page"
```

---

## 4. generate_pat.ion

El flujo de negocio completo. Orquesta navegación, completa el formulario con los datos del contexto, espera confirmación, y extrae el token. **Nunca contiene un selector CSS.**

> **Importante:** Los valores `$CONTEXT.*` son inyectados por Brain al ejecutar el intent. Nunca hardcodees credenciales en el archivo `.ion`. En producción, `github_username` y `github_password` los provee Nucleus Vault.

```yaml
action: "generate_pat"
description: >
  Genera un Personal Access Token en GitHub.
  Navega a /settings/tokens, completa el formulario,
  y emite el token resultante via PAT_GENERATED.

requires:
  - session_guard_passed

steps:

  # 1. Ir a la página de tokens
  - navigate:
      url: "https://github.com/settings/tokens"
      expect_page: "tokens_page"
      fallback:
        on_page: "login_page"
        call: "shared/session_guard"
        then: retry

  # 2. Click en "Generate new token (classic)"
  - click:
      element: "generate_button"
      on_page: "tokens_page"

  # 3. Esperar que cargue el formulario
  - wait:
      element: "token_name_input"
      on_page: "new_token_page"
      timeout: 8000

  # 4. Nombre del token
  - type:
      element: "token_name_input"
      on_page: "new_token_page"
      text: "$CONTEXT.token_name"       # ej: "bloom-terminal"

  # 5. Expiración
  - select:
      element: "expiration_select"
      on_page: "new_token_page"
      value: "$CONTEXT.expiration"      # ej: "30", "90", "no_expiration"

  # 6. Marcar scope repo si no está marcado
  - check:
      element: "scope_repo"
      on_page: "new_token_page"
      if_unchecked:
        - click:
            element: "scope_repo"
            on_page: "new_token_page"

  # 7. Generar
  - click:
      element: "submit_button"
      on_page: "new_token_page"

  # 8. Esperar confirmación
  - wait_signal:
      signal: "token_generated"
      on_page: "new_token_page"
      timeout: 15000

  # 9. Extraer el token
  - extract:
      element: "token_value"
      on_page: "new_token_page"
      save_to: "$CONTEXT.generated_pat"

  # 10. Emitir resultado
  - emit:
      event: "PAT_GENERATED"
      payload:
        token: "$CONTEXT.generated_pat"
        token_name: "$CONTEXT.token_name"
        provider: "github"

error_handlers:
  timeout:
    retry: 2
    backoff: 1500
    fallback: "emit_error"
  signal_timeout:
    retry: 1
    fallback: "emit_error"
```

### 4.1 shared/session_guard.ion

Verifica sesión antes de cualquier action que lo requiera. IonPump lo memoiza en el `event_log` — si otro action lo requiere en la misma sesión, no se vuelve a ejecutar.

```yaml
fragment: "session_guard"
description: "Verifica sesión GitHub. Hace login si es necesario."

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
            timeout: 12000

  - emit:
      event: "session_guard_passed"
```

---

## 5. Despliegue con Metamorph

Los paquetes Ion se despliegan en:

```
%LOCALAPPDATA%\BloomNucleus\bin\cortex\ionsites\
```

Cada dominio tiene su propio subdirectorio. Metamorph garantiza que el despliegue es atómico: IonLoader nunca ve un paquete a medio escribir.

**El proceso:**

1. Metamorph recibe el ZIP y verifica el hash SHA-256 contra el manifest.
2. Extrae el contenido en un directorio de staging: `ionsites/_staging/github.com/`.
3. Cuando la extracción es completa y verificada, hace un único **rename atómico** del staging al destino final: `ionsites/github.com/`.
4. Si el proceso falla antes del rename, `_staging/github.com/` se elimina y la versión anterior queda intacta.

Un rename de directorio es una operación atómica del sistema de archivos en Windows y Unix. IonLoader no puede observar un estado intermedio.

**Hot-reload:** IonLoader tiene un watchdog activo sobre `ionsites/`. Cuando detecta que `github.com/` aparece o es reemplazado, recarga el paquete en memoria sin reiniciar Brain. El próximo intent ya usa la versión nueva.

---

## 6. El intent que dispara el flujo

```json
{
  "intent_type": "dev",
  "intent_subtype": "web_automation",
  "domain": "github.com",
  "action": "generate_pat",
  "context": {
    "token_name":      "bloom-terminal",
    "expiration":      "30",
    "github_username": "tu-usuario",
    "github_password": "tu-password"
  }
}
```

El campo `expiration` acepta: `"7"`, `"30"`, `"60"`, `"90"`, `"no_expiration"`.

---

## 7. Validar y testear antes de desplegar

**Paso 1 — Validar la estructura:**

```bash
brain ionpump validate ./github.com/

# Salida esperada:
# ✓ domain.manifest.json          schema válido
# ✓ actions/generate_pat.ion      10 steps, sin errores
# ✓ pages/tokens_page.page.ion    1 elemento, 1 signal
# ✓ pages/new_token_page.page.ion 5 elementos, 1 signal
# ✓ pages/login_page.page.ion     3 elementos, 2 signals
# ✓ shared/session_guard.ion      fragment válido
```

**Paso 2 — Cargar localmente:**

```bash
bloom ion dev load ./github.com/
brain ionpump inspect --domain github.com
```

**Paso 3 — Dry-run:**

```bash
brain ionpump test github.com generate_pat --dry-run \
  --context '{"token_name":"test-token","expiration":"30"}'

# Muestra los Synapse commands que se enviarían a content.js
# sin abrir el browser ni ejecutar nada real.
```

**Paso 4 — Empaquetar:**

```bash
# macOS / Linux
cd github.com && zip -r ../github.com.ion.zip . && cd ..

# Windows PowerShell
Compress-Archive -Path ./github.com/* -DestinationPath ./github.com.ion.zip

# Hash SHA-256 para el registry
shasum -a 256 github.com.ion.zip          # macOS / Linux
Get-FileHash github.com.ion.zip -Algorithm SHA256  # Windows
```

---

## 8. Checklist de compatibilidad con IonPump

Antes de entregar el ZIP a Metamorph:

- `schema_version: "2.0"` presente en el manifest — IonLoader rechaza versiones anteriores.
- Ningún selector CSS en los archivos de `actions/` — solo `element:` + `on_page:`.
- Todos los elementos referenciados en el action existen en el page descriptor correspondiente.
- Todos los signals usados en `wait_signal` están declarados en el page descriptor.
- Las capabilities declaradas en el manifest cubren todos los steps (`dom_navigate` si hay `navigate`, etc.).
- Los `$CONTEXT.*` usados en el action están documentados en el intent de ejemplo.
- `error_handlers` cubre al menos `timeout` y `signal_timeout`.
- El fragment emite su evento de confirmación en el último step (`session_guard_passed`).
