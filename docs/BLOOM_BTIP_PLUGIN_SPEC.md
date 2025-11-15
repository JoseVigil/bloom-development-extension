# 🧩 BLOOM PLUGIN SPEC — VSCode / Visual Studio

## 0. PROPÓSITO

El plugin ofrece una interfaz visual para crear, actualizar y ejecutar BTIPs sin que el desarrollador deje su IDE.
Todas las acciones del plugin delegan en el CLI `bloom`.

---

## 1. PRINCIPIOS DE DISEÑO

- **No duplicar lógica**: el plugin invoca el CLI.
- **UX minimalista**: pocas acciones clave (Crear Intent, Refrescar, Ejecutar en IA, Ver Reporte).
- **Trazabilidad**: mostrar logs y metadatos producidos por el CLI.
- **Seguridad**: no exponer claves de API en UI; plugin usa variables de entorno o `~/.bloomrc`.

---

## 2. FUNCIONALIDADES (acciones rápidas)

### Panel lateral "Bloom Intents"

- Lista System BTIPs (solo lectura)
- Lista Intent BTIPs (clickable)

### Context menu (explorer):

- **Create Intent from selection** — selecciona archivos, clic derecho → invoca `bloom create intent <n> --files <paths>`
- **Refresh Intent** — ejecuta `bloom update intent <n>`
- **Run Intent in AI** — ejecuta `bloom ai run <n>` y muestra salida `.report.bl`
- **Open Report** — `bloom report <n> --open`

### Command Palette (Cmd/Ctrl+P):

- `Bloom: Create Intent`
- `Bloom: List Intents`
- `Bloom: Run Intent`
- `Bloom: Export Project`

---

## 3. COMUNICACIÓN CON EL CLI

- Plugin ejecuta comandos shell (o usa un wrapper RPC).
- Todas las llamadas en modo JSON (`--json`) para parsing de resultados.
- Plugin muestra progresos y errores del CLI en el Output panel.

---

## 4. INTEGRACIÓN CON EL TEMPLATE UNIVERSAL DE CODEBASE

El plugin debe conocer el `# UNIVERSAL_CODEBASE_TEMPLATE.md` (referencia adjunta).

**Comportamiento:**

Al crear un intent con archivos seleccionados, el plugin puede ofrecer la opción **"Aplicar template de codebase"** que:

- Normaliza la estructura de `.codebase.bl` según el template.
- Inserta una cabecera con metadatos (ruta, versión, notas).

El plugin debe incluir una sección de ayuda donde se explique cómo el template se integra en `.codebase.bl` del intent.

Esto ayuda a que el codebase generado sea consistente con lo que CLI espera y con la IA consumidora.

---

## 5. UI/UX — FLUJOS

### Crear Intent:

Usuario selecciona archivos → clic derecho → "Create Intent" → modal con `name`, `type`, `description`, `apply template?` → confirma → plugin invoca CLI → muestra resultado.

### Refrescar Intent:

Detecta cambios guardados → botón Refresh invoca `bloom update intent`.

### Ejecutar en IA:

Modal con `provider` y `model` (opcional) → Run → spinner → al terminar muestra `.report.bl` y meta.

---

## 6. MANEJO DE ERRORES Y RETRIES

- Mostrar errores del proveedor IA (timeouts, límites).
- Permitir retry con backoff.
- Guardar logs del intento en `.bloom/.meta/plugin-logs/`.

---

## 7. EXTENSIBILIDAD

- Plugin debe permitir extensiones: integraciones con GitHub, CI, o chatbots.
- Proveer API local (opcional) para que otras extensiones lo consuman.

---

## 8. APARTADO: INTEGRACIÓN DEL TEMPLATE DE CODEBASE (adjunto)

**Explicación para desarrolladores del plugin:**

El archivo `# UNIVERSAL_CODEBASE_TEMPLATE.md` define cómo debe estructurarse un `.codebase.bl`.

El plugin debe:

- Leer el template y ofrecer una opción para normalizar la sección `.codebase.bl` del intent.
- Insertar metadatos: `generated_by_plugin`, `timestamp`, `source_files`.
- Garantizar que los fragmentos de código dentro de `.codebase.bl` usen indentación de 4 espacios para bloques de código (no usar triple backticks), conforme a la convención Bloom.

Ejemplo de metadatos a insertar en `.codebase.bl`:

    <!-- generated_by_plugin: bloom-plugin-v1 -->
    <!-- source_files: src/main/java/MainActivity.java, src/main/java/DataLoadManager.java -->
    <!-- timestamp: 2025-11-12T12:00:00Z -->

---

## 9. PRIVACIDAD Y SEGURIDAD

- Nunca almacenar claves API en el repositorio.
- Usar `process.env` o `~/.bloomrc` para credenciales.
- Respetar `.bloomignore` para excluir archivos sensibles del contexto IA.

---

## 10. DEPLOY & RELEASE

- Publicar como extensión en VSCode Marketplace y/o Visual Studio Gallery.
- Versionado semántico y compatibilidad con la versión CLI.
- Documentación incluida en `.bloom/system/.prompting-guide.bl`.

---

## 11. CONCLUSIÓN

El plugin es la interfaz humana del ecosistema Bloom y debe ser simple, confiable y delegar toda la lógica compleja al CLI.

El apartado del template universal está integrado en el flujo: el plugin lo aplica para normalizar `.codebase.bl` y garantizar compatibilidad con el motor IA.