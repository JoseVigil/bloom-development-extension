# Remediación Técnica — Rearquitectura de Credenciales y Automatización
**Documento de especificación · v1.0**

---

## 0. Alcance y principio rector

Este documento cubre exclusivamente la migración hacia un modelo donde:

- Cada API key vive **aislada por usuario**, nunca en un pool o vault compartido entre componentes del sistema.
- Toda interacción con proveedores de IA se hace **vía sus APIs/SDKs oficiales**, nunca automatizando su interfaz web.
- Los tokens de GitHub para autenticación de usuario y para operaciones sobre repos/org están **separados**, cada uno con su propio scope mínimo.

Fuera de alcance: cualquier funcionalidad que dependa de automatizar el DOM de `claude.ai`, `chatgpt.com`, `grok.com` o `aistudio.google.com`. No hay diseño que legitime esa pieza — el plan acá es retirarla, no endurecerla.

---

## 1. Gestión de Credenciales — User-Scoped Storage

### 1.1 Diagnóstico

El modelo actual centraliza API keys de múltiples usuarios y múltiples proveedores en un vault compartido (`Vault.go`), consumido por un componente separado (`Brain`) que decide su uso después de la captura. Esto crea:

- Un único punto de fallo con alto blast radius (compromiso del vault = compromiso de credenciales de todos los usuarios, todos los proveedores).
- Desacople entre "cuándo el usuario autorizó" y "cuándo la key se usa" — el uso posterior no es necesariamente visible ni auditable por el usuario en el momento.
- Ambigüedad de responsabilidad: si `Brain` puede usar la key de cualquier usuario en cualquier momento, no hay un límite claro de qué constituye "uso autorizado".

### 1.2 Arquitectura propuesta

**Principio: 1 usuario → N keys propias → cada key cifrada y direccionable solo por su dueño.**

```
┌─────────────────────────────────────────────────────────┐
│  Discovery/Landing (captura)                             │
│  Usuario pega key → POST /keys/register                  │
└───────────────────────┬───────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Encryption Service (por request, sin estado propio)     │
│  - Deriva DEK con KMS local o AEAD                        │
│  - Cifra key con AES-256-GCM                               │
│  - Descarta plaintext de memoria inmediatamente            │
└───────────────────────┬───────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────┐
│  Store cifrado (por usuario)                              │
│  Key: {user_id}:{provider}:{key_id}                        │
│  Value: ciphertext + nonce + metadata (no plaintext nunca) │
└───────────────────────┬───────────────────────────────────┘
                         ▼ (solo en runtime, scoped a la request)
┌─────────────────────────────────────────────────────────┐
│  Runtime de ejecución                                      │
│  - Descifra 1 key, para 1 usuario, para 1 llamada API       │
│  - Usa el SDK oficial del proveedor                         │
│  - Plaintext vive solo en memoria del proceso, nunca en log │
└─────────────────────────────────────────────────────────┘
```

### 1.3 Especificación técnica

| Elemento | Especificación |
|---|---|
| Algoritmo | AES-256-GCM (AEAD) — autenticidad + confidencialidad en una operación |
| Derivación de clave | KMS local del SO (Keychain en macOS, DPAPI en Windows, Secret Service en Linux) o KMS cloud si el backend corre remoto (AWS KMS / GCP KMS) — nunca una clave hardcodeada o derivada solo de un secreto de app |
| Namespacing | `{user_id}:{provider}:{key_id}` — nunca una tabla plana compartida entre usuarios |
| Acceso | El componente que descifra debe recibir `user_id` de la sesión autenticada, no de un parámetro que el llamador controle |
| Logging | Prohibido loguear plaintext de key en cualquier nivel (debug incluido). Loguear solo `key_id` y `provider` |
| Rotación | Cada key tiene `created_at`; el usuario puede revocar/reemplazar desde su panel sin tocar keys de otros usuarios ni requerir downtime del sistema |
| Borrado | Al desconectar un proveedor, `DELETE` real del ciphertext — no soft-delete que deje el secreto recuperable |

### 1.4 Flujo captura → uso

1. Usuario pega key en Discovery/Landing (sin cambio de UX respecto al modelo actual — la fricción para el usuario es la misma).
2. Backend valida el formato de la key contra el proveedor (ej. `GET /v1/models` con la key, para confirmar que es válida antes de guardarla) — nunca vía DOM, vía la API misma.
3. Se cifra y persiste con el namespacing de 1.3.
4. En cada uso posterior, el componente que necesita llamar a la API del proveedor pide al store la key de **ese usuario específico**, la descifra en memoria, hace la llamada vía SDK oficial, y descarta el plaintext al terminar la request.
5. No existe un "modo batch" donde un componente central itere sobre keys de múltiples usuarios sin que cada uso corresponda a una acción explícita de ese usuario.

---

## 2. Migración de DOM/Slave Mode a SDKs Directos

### 2.1 Diagnóstico

`content.js` (Synapse Actuator) e `IonPump` ejecutan comandos DOM sobre las interfaces web de proveedores de IA, emitidos por `Brain` vía Native Messaging. Esto:

- Automatiza superficies que los proveedores no exponen para ese fin (la UI web, a diferencia de la API, no está diseñada para consumo programático de terceros).
- Depende de selectores/estructura de página que puede romper con cualquier deploy del proveedor — es frágil por diseño, no solo riesgoso.
- No tiene mapeo 1:1 garantizado con lo que la API oficial expone, lo que generó la arquitectura DOM en primer lugar.

### 2.2 Solución propuesta

Reemplazar cada función de IonPump por su equivalente de API REST/SDK oficial:

| Función actual (IonPump/DOM) | Reemplazo |
|---|---|
| Enviar prompt y leer respuesta en `claude.ai` | `@anthropic-ai/sdk` → `messages.create()` |
| Enviar prompt y leer respuesta en `chatgpt.com` | `openai` SDK → `chat.completions.create()` / `responses.create()` |
| Enviar prompt en `aistudio.google.com` | `@google/genai` → `generateContent()` |
| Enviar prompt en `grok.com` | SDK/API oficial de xAI (`x.ai/api`) |
| Lectura de historial de conversación desde la UI | Endpoint de listado de conversaciones de la API, si el proveedor lo expone — si no lo expone, esa función se retira, no se automatiza por DOM |

### 2.3 Estrategia de transición

**Paso 1 — Inventario.** Listar cada recipe `.ion` existente en `ionsites/` y clasificarla:
- (a) Tiene equivalente directo en API oficial → migrar.
- (b) No tiene equivalente en API → evaluar si el proveedor ofrece alguna vía oficial de acceso a esa función (webhook, export, feature flag para partners) → si no la hay, retirar la función.

**Paso 2 — Migración por proveedor.** Empezar por el proveedor con SDK más estable y documentado, para validar el patrón de "usuario trae su key → llamada API directa" (ver §1) de punta a punta antes de replicarlo al resto.

**Paso 3 — Retiro de infraestructura DOM.**
- Quitar `content.js` de `content_scripts.matches` para los dominios de proveedores de IA.
- Quitar los permisos de `host_permissions`/`activeTab` que ya no se usan sobre esos dominios.
- Retirar `Slave Mode` y el ribbon visual asociado, si su único consumidor era IonPump.

**Paso 4 — Funciones sin equivalente.** Comunicar al usuario qué funcionalidad se da de baja y por qué (transparencia sobre el cambio, no silencio). Si una función era central al producto y no tiene vía oficial, es una señal de que esa función no debería haber dependido de automatización DOM desde el principio.

---

## 3. Separación de Tokens — GitHub App & Batcave

### 3.1 Diagnóstico

El token obtenido vía Device Flow para la GitHub App (scopes: `Contents: Read & write`, `Administration: Read & write`, `Members: Read-only`) se reutilizaba también para configurar Batcave, el control plane remoto en Codespaces. Un solo token cubriendo dos propósitos distintos amplía el blast radius: si se compromete el canal de Batcave, se compromete también push/create-repo sobre la org.

### 3.2 Solución propuesta

Dos aplicaciones registradas por separado:

| App | Propósito | Scopes |
|---|---|---|
| **GitHub App "Repo Ops"** | Push, clone, create repo, verificación de membresía de org | `Contents: Read & write`, `Administration: Read & write`, `Members: Read-only` |
| **GitHub OAuth App "Batcave Auth"** | Autenticación del usuario contra Batcave (Codespaces) | Mínimo necesario para identificar al usuario y confirmar acceso al Codespace — sin `Contents` ni `Administration` |

### 3.3 Documentación y almacenamiento

- Cada token vive bajo su propio `key_id` en el store cifrado de §1: `{user_id}:github:repo_ops` y `{user_id}:github:batcave_auth` — nunca bajo la misma clave.
- Rotación y revocación son independientes: revocar el acceso a Batcave no debe invalidar el token de `Repo Ops`, y viceversa.
- En `BTIPS-BATCAVE-GITHUB-APP-PLAN.md` y en el handoff, reemplazar cualquier referencia a "el token de GitHub App" (singular, ambiguo) por el nombre específico de cada app y su propósito.
- El mensaje Synapse `GITHUB_APP_AUTHORIZED` debe llevar un campo `app` (`repo_ops` | `batcave_auth`) para que `resolveEvent()` no dependa de inferencia — mismo patrón de discriminación explícita que ya se aplicó para `ACCOUNT_REGISTERED` + `service`.

### 2.4 Gestión de Fallbacks y Graceful Degradation

**Regla:** ausencia de key registrada nunca deriva en fallback no oficial ni en fallo silencioso.

Si un usuario dispara una acción de BTIPS que requiere un proveedor para el cual todavía no registró key:

1. El backend detecta la ausencia **antes** de intentar ejecutar la acción (chequeo de existencia del `key_id` correspondiente en el store, no un intento fallido de llamada).
2. El flujo se **pausa** — no se degrada hacia ninguna alternativa no documentada (nunca hacia DOM, nunca hacia una key compartida de fallback, nunca hacia un proveedor distinto sin consentimiento explícito).
3. Se dispara un modal/pantalla de Discovery en tiempo real pidiendo la key faltante, con contexto de qué acción quedó pendiente.
4. Una vez capturada y validada (mismo flujo de §1.4), la acción original se reanuda automáticamente — el usuario no tiene que repetir la instrucción desde cero.
5. Este chequeo aplica por proveedor y por usuario individualmente: que un usuario tenga la key de Anthropic no implica nada sobre si tiene la de OpenAI o Google.

**Explícitamente prohibido:** reintentar con una key de otro usuario, con una key "de sistema" compartida, o con cualquier ruta que no sea "pedirle la key al dueño de la acción".

---

## 3.5 Rol de la Extensión de Chrome vs. Backend Executor

**Regla:** la extensión de Chrome deja de ser un ejecutor. Pasa a ser exclusivamente un capturador de contexto local y un despachador de mensajes.

| Responsabilidad | Dónde vive | Justificación |
|---|---|---|
| Extraer contexto local (selección de texto, metadatos de la pestaña activa, URL, título) | Extensión de Chrome (`content.js` reducido) | Es información que solo la extensión puede leer directamente del navegador del usuario |
| Empaquetar y despachar ese contexto hacia el backend | Extensión de Chrome (`background.js`) | Rol de mensajería pura, sin lógica de negocio ni llamadas a SDKs de terceros |
| Consumo de SDKs de proveedores IA (Anthropic, OpenAI, Google, xAI) | Backend local / runtime | Es donde vive el store cifrado de §1 — las keys nunca deben descifrarse ni usarse dentro del proceso de la extensión |
| Descifrado de keys y ejecución de llamadas API | Backend local / runtime | Aislamiento de superficie: un bug o compromiso en la extensión no expone keys, porque la extensión nunca las tiene en texto plano |
| Automatización DOM de sitios de terceros | **Eliminado** (ver §2) | No es responsabilidad de ningún componente — se retira, no se reasigna |

**Consecuencia de diseño:** `content.js` deja de tener permisos ni lógica para clickear, tipear o leer el DOM de dominios ajenos a la propia extensión (`claude.ai`, `chatgpt.com`, etc.). Su superficie se reduce a la pestaña activa del usuario, para fines de extracción de contexto (ej. "resumí lo que tengo seleccionado"), nunca para actuar sobre esa pestaña en nombre de un proceso externo.

---

## 3.6 Compatibilidad con Entornos Locales / Offline (Ollama y LLMs auto-hospedados)

**Regla:** los modelos locales se tratan como un proveedor más dentro del mismo estándar de comunicación limpia vía API — nunca como una excepción que reintroduce vault centralizado o automatización DOM.

- Las peticiones a modelos locales (Ollama, llama.cpp server, vLLM, etc.) se canalizan directo contra su endpoint REST local (ej. `http://localhost:11434/api/generate` para Ollama), desde el mismo backend/runtime que consume las APIs de proveedores cloud (§2).
- No requieren key ni cifrado en el store de §1 — no hay secreto que centralizar. Lo único que se registra por usuario es la configuración de endpoint (host, puerto, modelo por defecto), no una credencial.
- El chequeo de disponibilidad reemplaza al chequeo de "key registrada" de §2.4: si el endpoint local no responde, el flujo se pausa igual que en el caso de key faltante — no hay fallback silencioso hacia un proveedor cloud sin que el usuario lo haya elegido explícitamente.
- La extensión de Chrome no tiene ningún rol especial acá tampoco: sigue aplicando la delimitación de §3.5 — captura de contexto y despacho, nunca ejecución directa contra el endpoint local.

---

## 4. Matriz de Remediación

| Déficit actual | Arquitectura correcta | Módulo afectado | Impacto en fricción de usuario | Pasos para implementar |
|---|---|---|---|---|
| Vault multi-tenant compartido entre Brain y Cortex | Store cifrado user-scoped, namespacing `{user_id}:{provider}:{key_id}` | `Vault.go`, `background.js` (Discovery) | Ninguno — misma UX de captura | 1) Implementar cifrado AEAD real (hoy `Vault.go` es stub). 2) Namespacing por usuario. 3) Eliminar cualquier ruta de lectura que no filtre por `user_id` de sesión |
| `content.js`/Slave Mode automatizando DOM de proveedores IA | Llamadas directas a SDKs oficiales | `content.js`, IonPump, `manifest.json` (`content_scripts`) | Ninguno si la función tiene equivalente API; comunicación explícita si se retira | Ver §2.3, pasos 1–4 |
| Token único para Repo Ops + Batcave | Dos apps separadas, scopes mínimos, `key_id` independientes | GitHub App config, `discovery.schema.json`, `milestone-registry.js` | Un paso adicional de autorización la primera vez (aceptable, ocurre una sola vez en onboarding) | Ver §3.2–3.3 |
| Clipboard Monitor documentado como código muerto pero presente en BTIPS §11 | Eliminación física del código, no solo prohibición documental | `background.js` (funciones `startClipboardMonitoring`/etc.) | Ninguno — ya está deshabilitado en producto | Borrar las funciones del archivo, no solo la sección de la doc. Confirmar con `grep` que no queda ninguna referencia activa |
| `GITHUB_APP_AUTHORIZED` sin campo `service`/`app` discriminador | Discriminación explícita en el payload, igual que `ACCOUNT_REGISTERED` | `discovery.schema.json`, `milestone-registry.js` | Ninguno | Agregar campo `app` al payload y actualizar `resolveEvent()` para exigirlo |
| Ausencia de key deriva en fallback no oficial o falla silenciosa | Pausa de flujo + modal de Discovery en tiempo real, reanudación automática post-captura | Backend executor, `discoveryProtocol.js` | Un paso adicional solo la primera vez que falta esa key puntual | Chequeo de existencia previo a ejecución (§2.4); diseño del modal; lógica de reanudación de la acción pausada |
| `content.js` con lógica de ejecución y permisos DOM amplios | Extensión reducida a captura de contexto local + despacho de mensajes | `content.js`, `manifest.json` | Ninguno | Remover permisos/lógica de actuación DOM sobre dominios de terceros (§3.5); dejar solo extracción de contexto de la pestaña activa |
| Sin ruta definida para modelos locales/Ollama | Mismo estándar de API directa, sin vault ni DOM, contra endpoint REST local | Backend executor, config de usuario | Ninguno — no requiere captura de credencial | Agregar modelos locales como tipo de proveedor con `endpoint` en vez de `key_id`; aplicar mismo chequeo de disponibilidad que §2.4 (§3.6) |

---

## 5. Orden de ejecución recomendado

1. **Fix de storage cifrado (§1)** — es la base de todo lo demás; nada se guarda en el vault viejo mientras esto no esté.
2. **Redefinición de responsabilidades extensión/backend (§3.5)** — condición previa para que §2 y §2.4 tengan dónde vivir correctamente.
3. **Separación de tokens GitHub (§3.1–3.3)** — independiente del resto, se puede hacer en paralelo.
4. **Migración de IonPump (§2)**, proveedor por proveedor, empezando por el de SDK más estable.
5. **Gestión de fallbacks/graceful degradation (§2.4)** — se implementa junto con cada proveedor migrado en el paso anterior, no como fase separada al final.
6. **Soporte de entornos locales/Ollama (§3.6)** — puede sumarse en cualquier momento después del paso 1, no tiene dependencias del resto.
7. **Retiro físico de Clipboard Monitor y de `content_scripts` sobre dominios de IA** una vez que §2 esté completo para ese proveedor — no antes, para no romper funcionalidad en producción a mitad de migración.

---

*Documento de especificación técnica — v1.0*
