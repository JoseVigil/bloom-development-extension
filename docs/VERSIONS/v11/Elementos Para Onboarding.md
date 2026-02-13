### Resumen del Documento: Lógicas de Negocio en el Plugin Desarrollado

El documento aborda la resolución de un problema de onboarding atascado en "Initializing..." en una aplicación basada en un plugin VSCode (bloom-development-extension), que integra frontend SvelteKit, CLI Python (Brain) y backend Node.js. El contexto se centra en tres elementos interconectados para inicializar y avanzar en el wizard de onboarding, verificando conexiones, auth y health checks. Las lógicas de negocio existentes en el plugin enfatizan la integración full-stack para un flujo de onboarding seguro y eficiente, con énfasis en streaming en tiempo real, validaciones de estado y manejo de APIs/WS.

#### 1. **Servidor Web (Frontend SvelteKit - Port 5173)**
   - **Contexto y Lógica:** Maneja la UI del wizard de onboarding, incluyendo sidebar Copilot con streaming (via WS), historial en localStorage y rendering Markdown. La lógica de negocio radica en inicializar stores (e.g., onboarding.ts, websocket.ts) para conectar con backend, renderizar steps dinámicos y manejar loading states hasta que se confirmen conexiones (WS/API). En dev, usa Vite para hot-reload; en prod, builds estáticos. Verificaciones: HTTP 200 en localhost:5173.

#### 2. **Aplicación Brain de Python (CLI en Runtime)**
   - **Contexto y Lógica:** Actúa como módulo CLI invocado on-demand para checks de negocio como `health onboarding-status --json`, validando auth (GitHub, Gemini), configuración de Nucleus y proyectos. No es un server persistente, pero soporta lógicas de validación de estado (e.g., ready/false, current_step). Integración con plugin via adapters para ejecutar comandos asincrónicos. Verificaciones: Help output y JSON responses; fix con PYTHONPATH si módulo no encontrado.

#### 3. **Plugin VSCode (Backend con F5 - Ports 4124/48215)**
   - **Contexto y Lógica Principal:** Core del backend, donde residen las lógicas de negocio clave: 
     - **WebSocket (Port 4124):** Streaming en tiempo real para Copilot (chunks, events como 'copilot.chunk'), manejado por WebSocketManager.ts para comunicaciones bidireccionales y updates dinámicos en onboarding.
     - **API REST con Swagger (Port 48215):** Routes para health checks (/health → {status: 'ok'}), auth y adapters a Brain CLI (BrainApiAdapter.ts). Lógicas incluyen validaciones full-stack (WS, API, CLI), routing con Fastify (cors, swagger) y activación en VSCode experimental.
     - **Integración General:** El plugin orquesta el flujo: activa extensión, lanza servers, invoca CLI para checks y asegura conexiones para avanzar onboarding. Errores comunes: Puertos down o deps faltantes. Verificaciones: WS connect, API /health JSON, netstat.

**Flujo Integrado de Negocio:** Onboarding inicia en Electron/iframe, espera conexiones (WS/API) y checks CLI; si fallan, atasca en loading. Lógicas aseguran auth segura, streaming eficiente y health modular. Verifica con netstat, curls y logs para depuración.