# AUTHORITY_BOUNDARY.md

> **Documento de gobernanza técnica y principios de límite de autoridad.**
>
> Fuente de verdad sobre el límite de autoridad del ecosistema Cognituum/Bloom/Cortex
> respecto del manejo de credenciales de terceros y de automatización de superficies
> ajenas. Tiene **precedencia** sobre cualquier sección de
> `BTIPS_Bloom_Technical_Intent_Package_v6_0.md`,
> `Cognituum_Companion_Implementation_Guide_v1_2.md`,
> `PROTOCOLO-synapse-homologacion-v3.md`, `VAULT-STORAGE-SPEC.md` y
> `PROVIDER-EXECUTION-SPEC.md` en todo lo relativo al *principio* de
> onboarding, captura, almacenamiento o uso de secretos de proveedores
> externos (Google, Gemini, Claude, ChatGPT, GitHub, xAI) y de
> automatización de sus superficies. Ver §0 para la relación exacta entre
> este documento y los dos specs técnicos vigentes.

## Registro de cambios

| Versión | Fecha | Cambios |
|---|---|---|
| v1.0 | 2026-07-09 | Primera versión. Documento existía como referencia citada en v6.0/v1.2/v3 pero nunca se había escrito. Consolida el comportamiento real verificado en `background.js`/`discovery.js` (no el descrito originalmente en Companion Guide §2.1, que asumía un flujo distinto — ver §3 y Nota de discrepancia). |
| v1.1 | 2026-08-17 | El antiguo `REMEDIACION-TECNICA-v1.md` se dividió en `VAULT-STORAGE-SPEC.md` (credenciales/cifrado) y `PROVIDER-EXECUTION-SPEC.md` (ejecución/automatización). Se actualiza este documento para declarar precedencia también sobre esos dos specs, generalizar §3.1 para no fijar mecanismo específico, alinear terminología (`key_id`), y desambiguar §4 respecto del límite de automatización DOM más amplio de `PROVIDER-EXECUTION-SPEC.md` §1–2. |
| v1.2 | 2026-08-17 | Se enriquece la redacción (diagrama de niveles, separación explícita de tokens de GitHub, aclaración de automatización local legítima) manteniendo la separación principio/mecanismo: se revierte la reintroducción de detalle de cifrado (algoritmo, KMS por SO) dentro de §3, que debe vivir únicamente en `VAULT-STORAGE-SPEC.md` — fijarlo acá reabriría este documento cada vez que cambie el mecanismo de storage. Se agrega §6 sobre postura de reducción de riesgo frente a Chrome Web Store/ToS de terceros, redactada como objetivo de diseño y no como garantía de aprobación o cumplimiento legal — este documento no sustituye una revisión legal. Se remueve una ruta de archivo específica para `REMEDIACION-TECNICA-v1.md` que no está confirmada; el documento queda referenciado como diagnóstico histórico sin asumir su ubicación exacta. |

---

## §0. Arquitectura documental y jerarquía de precedencia

El ecosistema de documentación técnica se organiza en tres niveles. Esta separación existe para que los principios de límite de autoridad permanezcan estables aunque el mecanismo de implementación evolucione — por eso este documento no debe fijar detalle de mecanismo (algoritmos, SDKs, nombres de servicios de KMS): ese detalle vive en los specs de nivel 2, y puede cambiar sin que el principio cambie.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   NIVEL 1: PRINCIPIOS Y LÍMITES                        │
│                     AUTHORITY_BOUNDARY.md (este)                       │
│           (qué el sistema nunca hace, sin importar el mecanismo)       │
└───────────────────────────────────┬────────────────────────────────────┘
                                     │ Precedencia sobre
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   NIVEL 2: MECANISMOS TÉCNICOS                         │
│  ┌─────────────────────────────────┐ ┌──────────────────────────────┐  │
│  │     VAULT-STORAGE-SPEC.md        │ │ PROVIDER-EXECUTION-SPEC.md  │  │
│  │ (cifrado, namespacing, identidad)│ │ (SDKs, runner local, BTIP)  │  │
│  └─────────────────────────────────┘ └──────────────────────────────┘  │
└───────────────────────────────────┬────────────────────────────────────┘
                                     │ Gobiernan sobre
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   NIVEL 3: IMPLEMENTACIÓN Y CÓDIGO                      │
│        Guías de integración, esquemas JSON, runtime, UI                │
└────────────────────────────────────────────────────────────────────────┘
```

### Reglas de resolución de conflictos

1. **Precedencia de principios.** Si un mecanismo descrito en `VAULT-STORAGE-SPEC.md` o `PROVIDER-EXECUTION-SPEC.md` contradice un principio de este documento, este documento prevalece y el spec técnico debe corregirse.
2. **Evolución de mecanismos.** Si este documento describe un mecanismo que quedó desactualizado por la evolución real del software (ej. asumir un vault nativo cuando el backend pasó a manejar el cifrado), el mecanismo se actualiza citando al spec correspondiente — el principio subyacente no cambia. Por esta misma regla, este documento **no** repite el algoritmo de cifrado, el proveedor de KMS, ni ningún otro detalle de implementación que ya esté especificado en el nivel 2 — hacerlo generaría dos fuentes de verdad para el mismo dato.
3. **Registro histórico.** `REMEDIACION-TECNICA-v1.md`, el documento único del que se desprendieron los dos specs de nivel 2, queda como diagnóstico histórico. No es fuente de verdad para seguir iterando sobre mecanismo — para eso, `VAULT-STORAGE-SPEC.md` y `PROVIDER-EXECUTION-SPEC.md`.

---

## §1. Principio general — Human-in-the-loop

Cognituum lleva al usuario **hasta la puerta** de cada proveedor de terceros, pero nunca cruza esa puerta en su lugar. Esto significa, sin excepción:

- El sistema **nunca** automatiza un login, registro, o generación de credencial en la superficie de un proveedor externo (no rellena formularios ajenos, no hace clic por el usuario, no resuelve captchas ni 2FA).
- El sistema **nunca** lee pasivamente un canal del sistema operativo para capturar un secreto (clipboard, keystrokes, screenshots automáticos de pantallas de login).
- Toda credencial que el sistema termina poseyendo (API key, token) llegó porque el usuario la pegó o confirmó **explícita y activamente** en una superficie propia de Cognituum — nunca por inferencia o interceptación.
- El permiso `clipboardRead` está **prohibido permanentemente** en el manifest de producción. Si en algún momento existió (Clipboard Monitor v1.0–v1.1), su eliminación es irreversible como decisión de producto, no solo de versión.

Este principio es independiente de qué componente ejecuta la automatización o dónde corre — aplica igual si el ejecutor es la extensión de Chrome, el backend, o el Cognituum Runner local descripto en `PROVIDER-EXECUTION-SPEC.md` §2.

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

### 3.1 Patrón: store cifrado, nunca mensaje con la key en texto plano

**Corrección respecto a versiones anteriores de esta documentación:** el flujo de Condición 2 **no** es "formulario de entrada manual que dispara `API_KEY_REGISTERED` con la key completa viajando por `chrome.runtime.sendMessage`". Ese diseño exponía el secreto en texto plano dentro del bus de mensajes interno de la extensión — superficie innecesaria incluso siendo interno.

El patrón correcto es, a nivel de principio:

1. El usuario genera la key en la puerta real del proveedor (ej. `aistudio.google.com/app/apikey`).
2. El usuario pega la key en un campo local de Cognituum (superficie propia — nunca se lee de otra fuente).
3. La key se transmite desde la extensión hacia el backend exclusivamente por un canal cifrado en tránsito (HTTPS), como único salto entre "el usuario la pegó" y "queda cifrada en el store" — la extensión es tránsito puro, nunca destino final del secreto.
4. La key nunca se persiste en `chrome.storage`, nunca queda en un log, y nunca circula en texto plano por ningún bus de mensajes interno más allá del envío inicial de la extensión al backend.
5. Lo único que circula después por el bus de mensajes interno y por `bloom_profile_state` es un identificador no reversible del secreto (`key_id`, en el namespacing `{user_id}:{provider}:{key_id}`) — nunca el valor de la key ni un dato del que la key sea recuperable. Mismo patrón que `token_fingerprint` en `ACCOUNT_REGISTERED`/`VAULT_INITIALIZED`.
6. El milestone que marca la cuenta como conectada en `linked_accounts` se dispara recién cuando el store cifrado confirma la escritura — no antes.

**Mecanismo concreto (cifrado, namespacing, KMS, rotación, borrado):** especificado en detalle en `VAULT-STORAGE-SPEC.md` §1. Ese documento es la fuente de verdad para el "cómo" — incluyendo si el cifrado corre en un KMS local del SO o en un KMS cloud cuando el backend corre remoto. Este documento no fija ese detalle de infraestructura porque puede variar entre despliegues sin que cambie el principio: en ningún despliegue válido la key existe en texto plano fuera del proceso que la descifra para una única llamada, scoped a un único usuario.

**Separación de tokens de GitHub:** el mismo principio de namespacing por propósito aplica a los tokens de GitHub App. `VAULT-STORAGE-SPEC.md` §2 formaliza esto en dos apps separadas (`Repo Ops` y `Batcave Auth`), cada una con su propio `key_id` (`{user_id}:github:repo_ops` / `{user_id}:github:batcave_auth`) y scopes mínimos independientes — consistente con el principio de este documento de que ningún secreto cubre dos propósitos distintos bajo la misma clave.

### 3.2 Clipboard Monitor — estado permanente

El Clipboard Monitor (detección de la key por regex sobre el portapapeles) está **eliminado y no debe reintroducirse**. Cualquier código que todavía invoque `startClipboardMonitoring`/`stopClipboardMonitoring`/`checkClipboard` es código muerto pendiente de limpieza, no una superficie a mantener. El seguimiento operativo de esa limpieza (grep de referencias activas, remoción física del código) está en la matriz de remediación de `VAULT-STORAGE-SPEC.md` §4 — este documento fija que la reintroducción está prohibida como decisión de producto, sin importar el estado del código en un momento dado.

## §4. Superficie explícitamente prohibida

Cognituum, Cortex, Companion y cualquier activo futuro del ecosistema **nunca**:

- Leen o interceptan el portapapeles del sistema.
- Automatizan formularios de login/registro de proveedores externos.
- Leen el DOM de un proveedor externo para extraer un secreto.
- Transmiten una credencial en texto plano por un canal que no sea el envío inicial extensión→backend descripto en §3.1, ni la persisten fuera del store cifrado.
- Persisten una credencial en `chrome.storage` sin pasar antes por el store cifrado.

**Nota de alcance — no confundir con el límite de automatización de ejecución:** la prohibición de arriba sobre lectura de DOM está acotada al caso de extracción de secretos. Existe un límite **más amplio**, no relacionado con credenciales, sobre automatizar el DOM de `claude.ai`, `chatgpt.com`, `grok.com` y `aistudio.google.com` para *cualquier* fin — incluyendo enviar prompts o leer respuestas de inferencia. Ese límite general está especificado en `PROVIDER-EXECUTION-SPEC.md` §1–2, y aplica sin importar dónde corra el actuador (extensión, backend, o el Cognituum Runner). La automatización *interna* del propio Cognituum Runner (parseo de intents BTIP, orquestación de flujos propios) está explícitamente fuera de este límite — no toca el DOM de ningún proveedor de terceros, y por lo tanto tampoco está alcanzada por la prohibición de este documento.

## §5. Precedencia

Ante cualquier conflicto entre este documento y `BTIPS_Bloom_Technical_Intent_Package_v6_0.md`, `Cognituum_Companion_Implementation_Guide_v1_2.md`, `PROTOCOLO-synapse-homologacion-v3.md`, `VAULT-STORAGE-SPEC.md` o `PROVIDER-EXECUTION-SPEC.md`, este documento gana **en lo relativo al principio** (qué se hace o no se hace). Para el mecanismo concreto de storage/cifrado y de ejecución/automatización, remitirse respectivamente a `VAULT-STORAGE-SPEC.md` y `PROVIDER-EXECUTION-SPEC.md` como fuente vigente — no a `REMEDIACION-TECNICA-v1.md`, que queda como diagnóstico histórico. Los otros documentos deben actualizarse para citar correctamente esta jerarquía de tres niveles (principio → mecanismo de storage → mecanismo de ejecución), no asumirse como la versión vigente del comportamiento de credenciales o automatización.

## §6. Postura frente a Chrome Web Store y ToS de terceros

Los principios de §1–§4 no existen únicamente por razones de seguridad interna — también reducen el riesgo de fricción con las políticas de plataformas de terceros. Vale la pena dejarlo explícito, con el alcance correcto:

- **Qué es esto:** una descripción de cómo las decisiones de arquitectura ya tomadas (sustituir automatización DOM por SDKs oficiales en `PROVIDER-EXECUTION-SPEC.md` §1, no capturar secretos por canales pasivos del SO, extensión como tránsito puro sin permisos amplios) van en la dirección de lo que Chrome Web Store Developer Policies y los ToS de los proveedores de IA suelen exigir: propósito único, permisos mínimos declarados (`activeTab` en vez de `<all_urls>`), y no interactuar con superficies de terceros por fuera de sus vías oficiales.
- **Qué NO es esto:** una certificación de cumplimiento ni una garantía de aprobación en la revisión de Chrome Web Store. La decisión de aprobación la toma el revisor de Google contra la política vigente al momento de la publicación, y el cumplimiento de ToS de cada proveedor de IA depende de sus términos vigentes, que pueden cambiar. Este documento no sustituye una revisión legal — cualquier afirmación de cumplimiento definitivo debe validarse con esa revisión antes de comunicarse externamente como garantía.
- **Consecuencia práctica:** si en el futuro Google o algún proveedor de IA cambia su política de forma que un principio de §1–§4 deje de alcanzar para cumplirla, ese cambio de política prevalece y este documento debe actualizarse — no al revés.
