# AUTHORITY_BOUNDARY.md

> Fuente de verdad sobre el límite de autoridad del sistema Cognituum/Bloom
> respecto de credenciales de terceros. Tiene **precedencia** sobre cualquier
> sección de `BTIPS_Bloom_Technical_Intent_Package_v6_0.md`,
> `Cognituum_Companion_Implementation_Guide_v1_2.md` y
> `PROTOCOLO-synapse-homologacion-v3.md` en todo lo relativo a onboarding,
> captura o almacenamiento de secretos de proveedores externos (Google,
> Gemini, Claude, ChatGPT, GitHub, xAI).

## Registro de cambios

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | 2026-07-09 | Primera versión. Documento existía como referencia citada en v6.0/v1.2/v3 pero nunca se había escrito. Consolida el comportamiento real verificado en `background.js`/`discovery.js` (no el descrito originalmente en Companion Guide §2.1, que asumía un flujo distinto — ver §3 y Nota de discrepancia). |

---

## §1. Principio general — Human-in-the-loop

Cognituum lleva al usuario **hasta la puerta** de cada proveedor de terceros, pero nunca cruza esa puerta en su lugar. Esto significa, sin excepción:

- El sistema **nunca** automatiza un login, registro, o generación de credencial en la superficie de un proveedor externo (no rellena formularios ajenos, no hace clic por el usuario, no resuelve captchas ni 2FA).
- El sistema **nunca** lee pasivamente un canal del sistema operativo para capturar un secreto (clipboard, keystrokes, screenshots automáticos de pantallas de login).
- Toda credencial que el sistema termina poseyendo (API key, token) llegó porque el usuario la pegó o confirmó **explícita y activamente** en una superficie propia de Cognituum — nunca por inferencia o interceptación.
- El permiso `clipboardRead` está **prohibido permanentemente** en el manifest de producción. Si en algún momento existió (Clipboard Monitor v1.0–v1.1), su eliminación es irreversible como decisión de producto, no solo de versión.

## §2. Autenticación de Google (Condición 1 del onboarding de Companion)

### 2.1 Método: observación pasiva de URL

`background.js` implementa un watcher scoped a una tab puntual (la que el usuario abrió desde el botón "Open Google"). El watcher:

- Se suscribe a `chrome.tabs.onUpdated` **solo** para esa `tabId`.
- Compara la URL resultante contra dos listas: hosts terminales (`myaccount.google.com`, `mail.google.com`) y patrones intermedios (`/speedbump`, `/oauth2`, `/ServiceLogin`, `/signin/`, `/o/oauth2`) que todavía cuentan como "dentro del flujo", no como "llegó".
- **Nunca** lee el DOM, el título de la tab, ni ejecuta scripts sobre esa tab.
- Se autodesregistra al detectar el host terminal, al cerrarse la tab, o tras un timeout de cortesía de 10 minutos.

### 2.2 Confirmación explícita del usuario (obligatoria)

A diferencia de lo que describía `Companion Implementation Guide v1.2 §2.1` (que asumía emisión automática de `ACCOUNT_REGISTERED` al detectar la URL terminal), **la implementación real agrega un paso intermedio**: al detectar el host terminal, el sistema emite `GOOGLE_LOGIN_DETECTED` y muestra una pantalla de confirmación (`google-auth-confirm`) con el host detectado. Recién cuando el usuario hace clic en "Confirmar" se emite:

```javascript
chrome.runtime.sendMessage({
  event:      'ACCOUNT_REGISTERED',
  service:    'google',
  username:   string,   // email de la cuenta
  profile_id: string,
  launch_id:  string,
  timestamp:  number
})
```

Esta doble capa (detección pasiva + confirmación activa) es la implementación de referencia y **tiene precedencia** sobre cualquier documento que describa emisión automática. Los documentos que digan lo contrario deben corregirse para citar este comportamiento, no al revés.

## §3. Credenciales de API key de terceros (Condición 2 del onboarding de Companion, y cualquier provider)

### 3.1 Patrón: Vault, no mensaje con la key en texto plano

**Corrección respecto a versiones anteriores de esta documentación:** el flujo de Condición 2 **no** es "formulario de entrada manual que dispara `API_KEY_REGISTERED` con la key completa viajando por `chrome.runtime.sendMessage`". Ese diseño exponía el secreto en texto plano dentro del bus de mensajes interno de la extensión — superficie innecesaria incluso siendo interno.

El patrón correcto, consistente con el que ya usa GitHub (`GITHUB_APP_AUTHORIZED` → `VAULT_INITIALIZED`), es:

1. El usuario genera la key en la puerta real del proveedor (ej. `aistudio.google.com/app/apikey`).
2. El usuario pega la key en un campo local de Cognituum.
3. La key se persiste directamente en el **vault** (host nativo / keychain del sistema operativo, según implemente `nativeMessaging`) — nunca transita como valor plano por `chrome.runtime.sendMessage`, `chrome.storage`, ni por ningún log.
4. Lo único que circula por el bus de mensajes interno y por `bloom_profile_state` es un **fingerprint** no reversible (mismo patrón que `token_fingerprint` en `ACCOUNT_REGISTERED`/`VAULT_INITIALIZED`).
5. El milestone que marca la cuenta como conectada en `linked_accounts` se dispara recién cuando el vault confirma la escritura — no antes.

### 3.2 Clipboard Monitor — estado permanente

El Clipboard Monitor (detección de la key por regex sobre el portapapeles) está **eliminado y no debe reintroducirse**. Cualquier código que todavía invoque `startClipboardMonitoring`/`stopClipboardMonitoring`/`checkClipboard` es código muerto pendiente de limpieza, no una superficie a mantener.

## §4. Superficie explícitamente prohibida

Cognituum, Cortex, Companion y cualquier activo futuro del ecosistema **nunca**:

- Leen o interceptan el portapapeles del sistema.
- Automatizan formularios de login/registro de proveedores externos.
- Leen el DOM de un proveedor externo para extraer un secreto.
- Transmiten una credencial en texto plano por un canal que no sea la escritura directa al vault.
- Persisten una credencial en `chrome.storage` sin pasar antes por el vault.

## §5. Precedencia

Ante cualquier conflicto entre este documento y `BTIPS_Bloom_Technical_Intent_Package_v6_0.md`, `Cognituum_Companion_Implementation_Guide_v1_2.md`, o `PROTOCOLO-synapse-homologacion-v3.md`, este documento gana. Los otros documentos deben actualizarse para citarlo correctamente, no asumirse como la versión vigente del comportamiento de credenciales.
