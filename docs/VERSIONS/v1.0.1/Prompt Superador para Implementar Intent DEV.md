# Prompt Superador para Implementar "Intent DEV" en Plugin VSCode (Bloom)

Eres un experto en desarrollo de extensiones VSCode, con dominio en TypeScript, Python, APIs locales, WebSockets y workflows de IA. Tu tarea es generar una implementación completa y ejecutable basada en este spec refinado. El objetivo es crear una funcionalidad minimalista para "Intent DEV" en el plugin VSCode "Bloom", enfocada en intents draft mutables (con sessions para edición), que se crean minimalmente en el plugin y se enriquecen en la UI web. Usa los archivos proporcionados como base para refactorizar y extender el código existente.

## Archivos Proporcionados (Usa Estos como Base)
Incluyo el contenido completo de archivos clave del repositorio actual. Analízalos en profundidad para asegurar compatibilidad y reutilización (e.g., integra con `IntentSession`, `MetadataManager`, `PluginApiServer`, `WebSocketManager`). No reinventes; extiende lo existente.

- **intentFormPanel.ts**: Lógica del WebviewPanel para formulario. Simplifícalo para campos mínimos (nombre, profile, AI provider/account, archivos). Añade post-submit: abre URL `/intents/<name>-<uid>` en browser externo via `vscode.env.openExternal(vscode.Uri.parse(url))`. Si offline, fallback a edición local en plugin (muestra mensaje y mantiene form abierto).

- **intentForm.html, .css, .js**: UI del formulario. Actualiza HTML/JS para selects (fetch profiles via `postMessage` a TS, que llama `GET /api/v1/profiles`). Quita campos enriquecidos. Al guardar, habilita link a URL en el form (e.g., botón "Continuar en Web").

- **PluginApiServer.ts**: Servidor HTTP local. Añade POST `/api/v1/intents/dev/create` que valida, llama Python `create_intent.py`, y broadcast via WebSocket.

- **WebSocketManager.ts**: Maneja broadcasts. Añade `broadcast('intents:created', {id, name, profileId, aiProvider, projectId})`.

- **intentSession.ts**: Gestión de sessions mutables. Extiende para drafts: soporta `queueAutoSave` para ediciones web (via API). Para inmutabilidad, al "commit" (e.g., generación .bl), marca como immutable y fuerza forks para cambios.

- **intent.ts**: Modelos (IntentMetadata, etc.). Añade `uid: string` (hash random 3 dígitos), `derivedFrom?: string` para forks. Actualiza schema JSON mínimo con `uid`.

- **metadataManager.ts**: Manejo de metadata JSON. Actualiza `create` para generar UID (usa `shortid` o hash), incluir en nombre carpeta/URL. Soporta updates en drafts.

- **generate_nucleus.py**: Script Python existente para nucleus. Usa como patrón para `create_intent.py`: genera estructura .bloom/.intents/.dev/.<name>-<uid>/ con JSON mínimo, .intent.bl opcional.

- **intentGenerator.ts**: Generación de .bl. Migra a Python: llama `runPythonScript('create_intent.py', args)` desde TS.

## Objetivo Actualizado
Implementa creación de "Intent DEV" minimalista y mutable en drafts. Intents son drafts editables (via plugin/UI web) hasta "commit" (generación .bl), luego inmutables con forks para iteraciones (`derivedFrom`). Plugin escribe minimal en disco (.bloom), llama Python para estructura, valida secrets, y notifica WebSocket. Post-guardado, abre URL `/intents/<name>-<uid>` (UID: hash random 3 dígitos, e.g., _abc). UI web enriquece (edita JSON en drafts). Alinea con estructura .bloom proporcionada.

## Tecnologías (Extiende Existentes)
- TypeScript/VSCode API: Comandos, Webview, FS (`vscode.workspace.fs`), SecretStorage (`UserManager`).
- Node.js: Para servers, UUID/shortid (instala si falta via package.json).
- SecretStorage: Via `UserManager` para AI keys.
- API Local: `PluginApiServer` (http://localhost:4123/api/v1/).
- WebSocket: `WebSocketManager` (ws://localhost:4124).
- Python Scripts: Migra creación a `create_intent.py` (nuevo, basado en `generate_nucleus.py`). Llama via `runPythonScript` en `PluginApiServer`.
- Opcional: Gemini para optimizar prompts (hook en config).

## Requisitos Funcionales Actualizados (Minimales)
1. **Formulario en Plugin (Webview Simplificado)**:
   - Campos: Nombre (string, obligatorio, filesystem-safe), Chrome Profile (select from `GET /api/v1/profiles`), AI Provider (select: Claude, Grok, ChatGPT, Gemini), AI Account (select dependiente), Archivos (array via QuickPick/drag-drop, mínimo 1).
   - No campos enriquecidos (problem, behaviors—van a UI web).
   - Al submit: Genera UID (random hash 3 dígitos, e.g., abc, compatible web, separado "-"), crea carpeta `.<name>-<uid>`, llama Python para estructura.

2. **Validaciones (en TS, Antes de Python)**:
   - Profile/Account válido (fetch `GET /api/v1/profiles`, checa key en SecretStorage via `UserManager`). Si falta, abre flujo InputBox para key.
   - Al menos 1 archivo.
   - Workspace con nucleus/project (checa `.bloom/.core/` existencia; error si no, sugiere comando "bloom.createNucleus").
   - Nombre + UID no colisión (checa FS con `fs.readdir`); si colide, regenera UID.
   - Offline: Siempre disponible (file-based), pero si API falla, fallback local.

3. **Comportamiento de Creación (Híbrido TS/Python)**:
   - TS valida y prepara args (e.g., json payload).
   - Llama `runPythonScript('create_intent.py', ['--name=<name>', '--uid=<uid>', '--profile=<id>', ...])` para generar estructura:
     ```
     .bloom/.intents/.dev/.<name>-<uid>/
       ├── .session_state.json  // {id: uuid, createdAt, status: 'draft', uid}
       └── .briefing/
           ├── .intent.json     // Schema mínimo + uid
           └── .intent.bl (opcional, plantilla vacía)
     ```
   - `.intent.json` Schema:
     ```json
     {
       "id": "uuid-v4",
       "uid": "abc",  // 3 dígitos random hash
       "name": "name",
       "profileId": "profile-123",
       "aiProvider": "claude|grok|chatgpt|gemini",
       "aiAccountId": "acc-456",
       "files": ["rel/path1", ...],
       "nucleusId": "nucleus-...",
       "projectId": "project-...",
       "createdAt": "ISO8601",
       "status": "draft",
       "derivedFrom": null  // Para forks
     }
     ```
   - Post-Python: Actualiza `IntentSession` para draft mutable, guarda metadata via `MetadataManager`.
   - Iteraciones: Ediciones directas en drafts (modifica JSON via API/UI). Para "commit", genera .bl (inmutable), forks crean nuevo con `derivedFrom`.

4. **Escritura y Empaquetado**:
   - Python genera estructura/JSON (basado en `generate_nucleus.py` templates).
   - Opcional gzip `.package.gz` si config `packPreview` true (en TS post-Python).
   - Sessions: Usa `IntentSession` para auto-save en drafts.

5. **Integración API & WebSocket**:
   - POST `/api/v1/intents/dev/create`: Acepta payload JSON, valida, llama Python, responde `{ok: true, id, uid, path, url: '/intents/name-uid'}`.
   - Broadcast: `intents:created` con {id, uid, name, ...}.
   - Edición web: API PUT `/api/v1/intents/dev/<id>/update` para drafts (actualiza JSON via `IntentSession`).

6. **Inmutabilidad / Versioning (Híbrido)**:
   - Drafts mutables (edita JSON/.session_state).
   - Post-commit: Inmutable; ediciones fuerzan fork (nuevo intent con `derivedFrom: <prev-id>`).
   - UID permite iteraciones sin colisiones (e.g., same name, different UID).

7. **Selector AI + Cuentas**:
   - Fetch `GET /api/v1/profiles` en Webview TS.
   - Valida key; guía a agregar si falta.

8. **Gemini Opcional**:
   - Hook `optimizePrompt: boolean` (false default). Llama `GeminiEngine.rawPrompt` interno.

9. **Logs y UX Post-Guardado**:
   - Logs en OutputChannel.
   - Muestra URL en form, abre automáticamente en browser externo.
   - Summary en API response para UI preview.

## Archivos a Crear/Editar (Genera Código Stubs)
- Nuevo: `scripts/create_intent.py` (basado en `generate_nucleus.py`): Args para name, uid, etc.; genera estructura/JSON.
- Nuevo: `src/commands/intent/createIntentDev.ts`: Comando para formulario.
- Nuevo: `src/core/intentWriter.ts`: Wrapper TS para llamar Python.
- Editar: `src/managers/userManager.ts`: Añade check/add secret.
- Editar: `src/server/PluginApiServer.ts`: Añade POST/PUT routes.
- Editar: `src/server/WebSocketManager.ts`: Añade broadcast.
- Editar UI: `src/ui/intent/intentForm.*`: Simplifica, añade UID/URL.
- Actualiza `package.json`: Nuevo comando `bloom.createIntentDev`.
- Tests: Genera unit tests para validaciones, Python call.

## Expectativas de Este Prompt
Genera:
1. Código completo para nuevos/editados archivos (stubs funcionales).
2. `create_intent.py` full script.
3. Diagrama flujo (Markdown UML).
4. Tests Jest para TS, Pytest para Python.
5. Instrucciones instalación/pruebas.
Asegura compatibilidad con estructura .bloom (e.g., .briefing/, .execution/ para post-enriquecimiento). Si ambigüedades, asume best practices (e.g., error handling async). Salida: Zip o Markdown con código.