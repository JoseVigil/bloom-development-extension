# PROVIDER-EXECUTION-SPEC.md
**Execution & Provider Migration Spec · v1.0**

---

## 0. Alcance

Este documento cubre exclusivamente ejecución de inferencia e interfaz de transporte:

- Cómo el backend invoca modelos de IA usando SDKs oficiales.
- Qué automatización local es válida y dónde está el límite.
- Cómo se gestionan fallbacks cuando falta una credencial o un endpoint no responde.

Gestión de credenciales, cifrado y separación de tokens de GitHub están fuera de alcance — ver `VAULT-STORAGE-SPEC.md`.

---

## 1. Migración de DOM/Slave Mode a SDKs Directos

### 1.1 Diagnóstico

`content.js` (Synapse Actuator) e `IonPump` ejecutan comandos DOM sobre las interfaces web de proveedores de IA (`claude.ai`, `chatgpt.com`, `grok.com`, `aistudio.google.com`), emitidos por `Brain` vía Native Messaging. Esto:

- Automatiza superficies que los proveedores no exponen para ese fin (la UI web, a diferencia de la API, no está diseñada para consumo programático de terceros).
- Depende de selectores/estructura de página que puede romper con cualquier deploy del proveedor — es frágil por diseño, no solo riesgoso.
- No tiene mapeo 1:1 garantizado con lo que la API oficial expone, lo que generó la arquitectura DOM en primer lugar.

### 1.2 Solución propuesta

Reemplazar cada función de IonPump por su equivalente de API REST/SDK oficial:

| Función actual (IonPump/DOM) | Reemplazo |
|---|---|
| Enviar prompt y leer respuesta en `claude.ai` | `@anthropic-ai/sdk` → `messages.create()` |
| Enviar prompt y leer respuesta en `chatgpt.com` | `openai` SDK → `chat.completions.create()` / `responses.create()` |
| Enviar prompt en `aistudio.google.com` | `@google/genai` → `generateContent()` |
| Enviar prompt en `grok.com` | SDK/API oficial de xAI (`x.ai/api`) |
| Inferencia local (Ollama u otro self-hosted) | Endpoint REST local directo (ver §3) |
| Lectura de historial de conversación desde la UI | Endpoint de listado de conversaciones de la API, si el proveedor lo expone — si no lo expone, esa función se retira, no se automatiza por DOM |

### 1.3 Estrategia de transición

**Paso 1 — Inventario.** Listar cada recipe `.ion` existente en `ionsites/` y clasificarla:
- (a) Tiene equivalente directo en API oficial → migrar.
- (b) No tiene equivalente en API → evaluar si el proveedor ofrece alguna vía oficial de acceso a esa función (webhook, export, feature flag para partners) → si no la hay, retirar la función.

**Paso 2 — Migración por proveedor.** Empezar por el proveedor con SDK más estable y documentado, para validar el patrón "key del usuario → llamada API directa" de punta a punta antes de replicarlo al resto.

**Paso 3 — Retiro de infraestructura DOM sobre dominios de terceros.**
- Quitar `content.js` de `content_scripts.matches` para los dominios de proveedores de IA.
- Quitar los permisos de `host_permissions`/`activeTab` que ya no se usan sobre esos dominios.
- Retirar `Slave Mode` y el ribbon visual asociado, si su único consumidor era IonPump.

**Paso 4 — Funciones sin equivalente.** Comunicar al usuario qué funcionalidad se da de baja y por qué. Si una función era central al producto y no tiene vía oficial, es una señal de que esa función no debería haber dependido de automatización DOM de terceros desde el principio.

---

## 2. Alcance de la Automatización Local (Cognituum Runner)

**Regla:** la automatización DOM no está prohibida en sí misma — lo que está fuera de alcance es automatizar dominios de proveedores de IA de terceros. La automatización dentro del propio Cognituum Runner es una cuestión distinta.

- El runtime local (Chromium / Cognituum Runner) puede automatizar y orquestar libremente su **propia interfaz**: parseo de paquetes de intent en formato BTIP, empaquetado de contexto local, orquestación de flujos internos entre componentes propios de la app.
- Esa automatización interna no interactúa con el DOM de `claude.ai`, `chatgpt.com`, `grok.com`, `aistudio.google.com` ni ningún otro dominio de un proveedor de IA — su superficie es exclusivamente el propio software.
- El resultado de esa orquestación interna (el intent ya parseado, el contexto ya empaquetado) es lo que se pasa al backend para ejecutar la llamada real, vía SDK oficial (§1) o endpoint local (§3) — nunca vía DOM de terceros.

**Consecuencia de diseño para la extensión de Chrome:** su rol se reduce a capturador de contexto local (selección de texto, metadatos de la pestaña activa del usuario) y despachador de mensajes hacia el backend — nunca ejecutor de acciones sobre dominios ajenos a la propia extensión.

| Responsabilidad | Dónde vive |
|---|---|
| Extraer contexto local de la pestaña activa del usuario | Extensión de Chrome (`content.js` reducido, scoped a la propia superficie) |
| Empaquetar y despachar ese contexto hacia el backend | Extensión de Chrome (`background.js`) |
| Parseo de intents BTIP y orquestación de flujos internos | Cognituum Runner (propio) |
| Consumo de SDKs de proveedores IA / endpoints locales | Backend local / runtime (§1, §3) |
| Automatización DOM de dominios de terceros | **Fuera de alcance, en cualquier variante** — no se implementa |

---

## 3. Compatibilidad con Entornos Locales / Offline (Ollama y LLMs auto-hospedados)

**Regla:** los modelos locales se tratan como un proveedor más dentro del mismo estándar de comunicación limpia vía API — nunca como una excepción que reintroduce automatización DOM.

- Las peticiones a modelos locales (Ollama, llama.cpp server, vLLM, etc.) se canalizan directo contra su endpoint REST local (ej. `http://localhost:11434/api/generate` para Ollama), desde el mismo backend/runtime que consume las APIs de proveedores cloud (§1).
- No requieren key ni cifrado — no hay secreto que centralizar. Lo único que se registra por usuario es la configuración de endpoint (host, puerto, modelo por defecto), no una credencial.
- El chequeo de disponibilidad reemplaza al chequeo de "key registrada" de §4: si el endpoint local no responde, el flujo se pausa igual que en el caso de key faltante.
- La extensión de Chrome no tiene ningún rol especial acá tampoco: sigue aplicando la delimitación de §2 — captura de contexto y despacho, nunca ejecución directa.

---

## 4. Gestión de Fallbacks y Graceful Degradation

**Regla:** ausencia de key registrada o endpoint no disponible nunca deriva en fallback no oficial ni en fallo silencioso.

Si un usuario dispara una acción que requiere un proveedor para el cual todavía no registró credencial (o cuyo endpoint local no responde):

1. El backend detecta la ausencia **antes** de intentar ejecutar la acción.
2. El flujo se **pausa** — no se degrada hacia ninguna alternativa no documentada (nunca hacia DOM de terceros, nunca hacia una key compartida de fallback, nunca hacia un proveedor distinto sin consentimiento explícito).
3. Se dispara un modal/pantalla de Discovery en tiempo real pidiendo la credencial faltante (o notificando el endpoint local caído), con contexto de qué acción quedó pendiente.
4. Una vez resuelto, la acción original se reanuda automáticamente — el usuario no tiene que repetir la instrucción desde cero.
5. Este chequeo aplica por proveedor y por usuario individualmente.

**Explícitamente prohibido:** reintentar con una key de otro usuario, con una key "de sistema" compartida, con automatización DOM de contingencia, o con cualquier ruta que no sea "pedirle la credencial al dueño de la acción".

---

## 5. Matriz de Remediación — Ejecución y Providers

| Déficit actual | Arquitectura correcta | Módulo afectado | Impacto en fricción de usuario | Pasos para implementar |
|---|---|---|---|---|
| `content.js`/Slave Mode automatizando DOM de proveedores IA de terceros | Llamadas directas a SDKs oficiales | `content.js`, IonPump, `manifest.json` (`content_scripts`) | Ninguno si la función tiene equivalente API; comunicación explícita si se retira | Ver §1.3, pasos 1–4 |
| Ausencia de credencial deriva en fallback no oficial o falla silenciosa | Pausa de flujo + modal de Discovery en tiempo real, reanudación automática | Backend executor, `discoveryProtocol.js` | Un paso adicional solo la primera vez que falta esa credencial puntual | Chequeo de existencia previo a ejecución (§4); diseño del modal; lógica de reanudación |
| Sin ruta definida para modelos locales/Ollama | Mismo estándar de API directa contra endpoint REST local | Backend executor, config de usuario | Ninguno — no requiere credencial | Agregar modelos locales como tipo de proveedor con `endpoint`; aplicar mismo chequeo de disponibilidad (§3) |
| Extensión con lógica de ejecución y permisos DOM amplios sobre terceros | Extensión reducida a captura de contexto + despacho | `content.js`, `manifest.json` | Ninguno | Remover permisos/lógica de actuación DOM sobre dominios de terceros (§2); dejar solo extracción de contexto de la propia pestaña |

---

## 6. Orden de ejecución recomendado

1. **Migración de IonPump (§1)**, proveedor por proveedor, empezando por el de SDK más estable.
2. **Delimitación de la extensión (§2)** — condición previa para que el resto tenga dónde vivir correctamente.
3. **Soporte de entornos locales/Ollama (§3)** — puede sumarse en paralelo, no tiene dependencias del resto.
4. **Gestión de fallbacks (§4)** — se implementa junto con cada proveedor migrado en el paso 1, no como fase separada al final.
5. **Retiro físico de `content_scripts` sobre dominios de IA de terceros** una vez que §1 esté completo para ese proveedor — no antes, para no romper funcionalidad en producción a mitad de migración.

---

*Ver `VAULT-STORAGE-SPEC.md` para todo lo relativo a cifrado, storage y separación de tokens.*

*Documento de especificación técnica — v1.0*
