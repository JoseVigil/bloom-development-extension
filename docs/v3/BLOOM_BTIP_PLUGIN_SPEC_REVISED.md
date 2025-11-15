# BLOOM_BTIP_PLUGIN_SPEC_REVISED.md

## Propósito

Este documento define la especificación técnica revisada del Bloom VSCode Plugin, describiendo en detalle tanto la funcionalidad existente de preview de Markdown como la nueva funcionalidad de generación de intents mediante empaquetado de archivos.

Todos los bloques de código dentro de este archivo usan indentación de 4 espacios en lugar de triple backticks, siguiendo la convención de Bloom para evitar conflictos de delimitadores en artifacts markdown.

---

## 1. Descripción general

El Bloom VSCode Plugin es un complemento que permite a los desarrolladores:

1. Visualizar archivos Markdown con renderizado avanzado y navegación
2. Crear Bloom Technical Intent Packages (BTIPs) directamente desde Visual Studio Code mediante un proceso guiado e interactivo

El plugin opera completamente de forma local, sin requerir conexión a servicios externos ni CLI instalado.

---

## 2. Alcance

* Solo soporta Visual Studio Code.
* No se dará soporte a Visual Studio nativo.
* No requiere CLI externo ni dependencias adicionales.
* No interactúa con APIs de IA ni realiza conexión a servicios externos.
* No gestiona autenticación, API keys ni telemetría.
* Opera completamente de forma local y sincrónica.

---

## 3. Responsabilidades

### Plugin

Funcionalidad existente:
* Renderizar archivos Markdown con estilos personalizados
* Mantener sincronización entre editor y preview
* Gestionar navegación entre archivos Markdown
* Manejar anclajes internos y scroll suave

Nueva funcionalidad:
* Proporcionar comando para generar intents
* Presentar formulario interactivo para capturar datos del usuario
* Empaquetar archivos seleccionados en formato .tar.gz
* Generar archivo intent.bl basado en template estándar
* Crear estructura de carpetas organizada (intents/[nombre]/)
* Mostrar notificaciones de éxito o error al usuario
* Registrar eventos en el panel de salida de VSCode

### Usuario

* Abrir archivos Markdown para preview
* Seleccionar los archivos relevantes para el intent
* Completar el formulario con información clara y detallada
* Revisar los archivos generados
* Utilizar el intent generado según su workflow preferido

---

## 4. Comandos del plugin

El plugin expone dos comandos principales:

### Comando existente: Bloom: Open Markdown Preview

* Identificador: bloom.openMarkdownPreview
* Función: Abre un panel de preview para el archivo .md activo
* Ubicación: Command Palette
* Requisitos: Tener un archivo .md abierto y activo en el editor

### Nuevo comando: Bloom: Generate Intent

* Identificador: bloom.generateIntent
* Función: Inicia el proceso de generación de intent
* Ubicación: Command Palette y menú contextual del explorador
* Requisitos: Tener archivos seleccionados en el explorador

---

## 5. Interfaz de usuario

### Command Palette

* Bloom: Open Markdown Preview - Abre preview del archivo .md activo
* Bloom: Generate Intent - Inicia el proceso de generación de intent

### Context Menu (File Explorer)

* Click derecho sobre archivos → Bloom → Generate Intent

### Preview de Markdown (WebView Panel - Existente)

Panel lateral que muestra:
* Contenido Markdown renderizado con HTML
* Estilos personalizados (markdown.css, highlight.css, codicons)
* Navegación funcional mediante links
* Actualización en tiempo real al editar

Características técnicas:
* Usa markdown.api.render de VSCode
* CSP configurado para seguridad
* Scripts para navegación interna y entre archivos
* Gestión de múltiples paneles simultáneos

### Formulario de Intent (WebView Panel - Nuevo)

Panel modal interactivo que solicita:

1. Nombre del Intent (campo de texto, obligatorio)
2. Problema (área de texto multilínea, obligatorio)
3. Contexto (área de texto multilínea, obligatorio)
4. Comportamiento Actual (lista dinámica de items, mínimo 1 item)
5. Comportamiento Deseado (lista dinámica de items, mínimo 1 item)
6. Objetivo (área de texto multilínea, obligatorio)
7. Alcance y Restricciones (lista dinámica de items, opcional)
8. Hipótesis / Consideraciones (área de texto multilínea, opcional)
9. Tests / Validación Necesaria (lista dinámica de items, opcional)
10. Salida Esperada del Modelo (área de texto multilínea, obligatorio)

Botones:
* Generar Intent - Procesa el formulario y genera los archivos
* Cancelar - Cierra el formulario sin generar nada

### Output Panel

* Canal de logs: Bloom
* Registra eventos de preview y generación de intents

### Notificaciones

* Mensajes de éxito o error usando vscode.window.showInformationMessage o showErrorMessage.

---

## 6. Estructura técnica del plugin

    src/
    ├── commands/
    │   ├── openMarkdownPreview.ts     (funcionalidad existente refactorizada)
    │   └── generateIntent.ts          (nueva funcionalidad)
    ├── ui/
    │   ├── markdownPreviewPanel.ts    (gestión de preview - extraído de extension.ts)
    │   ├── intentFormPanel.ts         (nuevo - formulario de intent)
    │   └── notifications.ts           (nuevo - gestión de notificaciones)
    ├── core/
    │   ├── filePackager.ts            (nuevo - creación de .tar.gz)
    │   ├── intentGenerator.ts         (nuevo - generación de intent.bl)
    │   └── validator.ts               (nuevo - validaciones de entrada)
    ├── utils/
    │   └── logger.ts                  (nuevo - gestiona logs y salida)
    ├── styles/
    │   ├── markdown.css               (existente - estilos de preview)
    │   └── highlight.css              (existente - resaltado de código)
    └── extension.ts                   (punto de entrada - actualizar para ambos comandos)

---

## 7. Flujo de ejecución detallado

### 7.1. Flujo existente: Preview de Markdown

1. El usuario abre un archivo .md en el editor de VSCode.

2. Ejecuta el comando Bloom: Open Markdown Preview desde Command Palette.

3. El plugin valida que el archivo activo sea .md.

4. Se guarda el documento antes de renderizar.

5. Se ejecuta workbench.action.newGroupRight para crear panel lateral.

6. Se crea un WebView Panel con:
   * Título: Bloom Preview: [nombre-archivo]
   * Scripts habilitados
   * LocalResourceRoots configurados para estilos

7. Se obtienen los URIs de los estilos:
   * codicon.css (iconos de VSCode)
   * markdown.css (estilos personalizados)
   * highlight.css (resaltado de código)

8. Se ejecuta markdown.api.render con el contenido del documento.

9. Se genera el HTML del WebView con:
   * Meta tags de seguridad (CSP)
   * Links a hojas de estilo
   * Contenido renderizado
   * Scripts para navegación

10. Se registra listener para cambios en el documento:
    * Al editar, se re-renderiza automáticamente

11. Se registra listener para mensajes del WebView:
    * Maneja clicks en links a otros archivos .md
    * Abre nuevos paneles de preview para archivos enlazados

12. Se registra disposición del panel:
    * Limpia listeners al cerrar

### 7.2. Nuevo flujo: Generación de Intent

#### 7.2.1. Validación inicial

1. El usuario ejecuta el comando Bloom: Generate Intent.
2. El plugin verifica que haya archivos seleccionados en el explorador.
3. Si no hay archivos seleccionados, se muestra error:

    ❌ Por favor selecciona al menos un archivo antes de generar un intent.

4. Si hay archivos seleccionados, se procede al siguiente paso.

#### 7.2.2. Presentación del formulario

1. Se abre un WebView Panel con el formulario de intent.
2. El formulario muestra todos los campos necesarios con validaciones en tiempo real.
3. Los campos de lista dinámica incluyen botones para agregar/eliminar items.

#### 7.2.3. Validación del formulario

Al hacer clic en Generar Intent, se valida:

* Nombre del intent no vacío y sin caracteres inválidos (/, \, :, *, ?, ", <, >, |)
* No existe ya una carpeta con ese nombre en intents/
* Campos obligatorios completos
* Al menos un item en comportamiento actual y deseado

Si hay errores, se muestran en el formulario sin cerrar el panel.

#### 7.2.4. Generación de archivos

Una vez validado:

1. Se crea la carpeta: intents/[nombre-del-intent]/

2. Se empaquetan los archivos seleccionados en: intents/[nombre-del-intent]/codebase.tar.gz
   * Se preservan las rutas relativas de los archivos
   * Se usa compresión gzip estándar

3. Se genera el archivo: intents/[nombre-del-intent]/intent.bl
   * Se usa el template estándar de Bloom BTIP
   * Se completa con los datos del formulario
   * Se lista automáticamente los archivos incluidos en codebase.tar.gz

#### 7.2.5. Confirmación

1. Se cierra el formulario.

2. Se muestra notificación de éxito:

    ✅ Intent 'nombre-del-intent' creado exitosamente en intents/nombre-del-intent/

3. Se registra en el Output Panel:

    [Bloom] Intent generado exitosamente
    [Bloom] Carpeta: intents/nombre-del-intent/
    [Bloom] Archivos: intent.bl, codebase.tar.gz

---

## 8. Formato del archivo intent.bl

El archivo intent.bl generado debe seguir esta estructura exacta:

    # INTENT - [Nombre descriptivo del intent]

    ## Problema
    [Descripción del problema]

    ## Contexto
    [Contexto del problema]

    ## Comportamiento Actual
    1. [Item comportamiento actual 1]
    2. [Item comportamiento actual 2]
    3. [Item comportamiento actual 3]

    ## Comportamiento Deseado
    1. [Item comportamiento deseado 1]
    2. [Item comportamiento deseado 2]
    3. [Item comportamiento deseado 3]

    ## Objetivo
    [Objetivo específico]

    ## Archivos incluidos en codebase.tar.gz
    - [archivo1.ext]
    - [archivo2.ext]
    - [archivo3.ext]

    ## Alcance y Restricciones
    - [Restricción 1]
    - [Restricción 2]

    ## Hipótesis / Consideraciones
    [Consideraciones opcionales]

    ## Tests / Validación Necesaria
    - [ ] [Criterio de validación 1]
    - [ ] [Criterio de validación 2]
    - [ ] [Criterio de validación 3]

    ## Salida Esperada del Modelo
    [Descripción de la salida esperada]

    ---
    bloom/v1
    includes_archive: "codebase.tar.gz"

---

## 9. Estructura de archivos generados

Para un intent llamado fix-authentication, la estructura será:

    intents/
    └── fix-authentication/
        ├── intent.bl
        └── codebase.tar.gz

Dentro de codebase.tar.gz:

    src/
    ├── auth/
    │   ├── login.ts
    │   └── verify.ts
    └── middleware/
        └── auth.middleware.ts

---

## 10. Validaciones y restricciones

### Validaciones de nombre

* No vacío
* Máximo 100 caracteres
* No contiene: / \ : * ? " < > |
* No existe carpeta con ese nombre en intents/

### Validaciones de campos

* Problema: obligatorio, mínimo 10 caracteres
* Contexto: obligatorio, mínimo 10 caracteres
* Comportamiento Actual: al menos 1 item
* Comportamiento Deseado: al menos 1 item
* Objetivo: obligatorio, mínimo 10 caracteres
* Salida Esperada: obligatorio, mínimo 10 caracteres

### Restricciones técnicas

* Máximo 1000 archivos seleccionados
* Tamaño total máximo del .tar.gz: 100MB
* Solo archivos de texto (se ignoran binarios grandes)

### Validaciones de preview (existentes)

* Archivo debe tener extensión .md
* Archivo debe estar guardado antes de preview
* Debe existir un editor activo

---

## 11. Manejo de errores

### Errores de preview (existentes)

    ❌ Please open a Markdown (.md) file first.
    ❌ Failed to render Markdown: [error detallado]
    ❌ Failed to open document: [ruta]: [error detallado]

### Errores de validación (nuevos)

Se muestran inline en el formulario con mensajes específicos:

    ⚠️ El nombre del intent no puede contener caracteres especiales
    ⚠️ El campo "Problema" debe tener al menos 10 caracteres
    ⚠️ Debes agregar al menos un comportamiento actual

### Errores de sistema (nuevos)

Se muestran como notificaciones VSCode:

    ❌ Error al crear la carpeta del intent
    ❌ Error al empaquetar archivos: [detalle del error]
    ❌ Error al generar intent.bl: [detalle del error]

Todos los errores se registran en el Output Panel para debugging.

---

## 12. Configuración

El plugin no requiere configuración inicial y funciona out-of-the-box.

Configuraciones potenciales para el futuro:

    bloom.defaultIntentsFolder: "intents"
    bloom.autoOpenIntent: true
    bloom.compressionLevel: 6
    bloom.previewSplitDirection: "right"

---

## 13. Estilos y recursos

### Estilos existentes (preview)

* src/styles/markdown.css - Estilos para contenido Markdown renderizado
* src/styles/highlight.css - Resaltado de sintaxis para bloques de código
* node_modules/@vscode/codicons/dist/codicon.css - Iconos de VSCode

### Nuevos estilos (formulario)

* Se implementarán inline en el WebView del formulario
* Usarán variables CSS de VSCode para coherencia visual
* Responsive design para diferentes tamaños de panel

---

## 14. Casos de uso

### Caso 1: Documentación técnica

Usuario trabaja en documentación en Markdown, usa preview para visualizar en tiempo real mientras escribe.

### Caso 2: Bug fix

Usuario selecciona archivos con el bug, describe el problema actual y el comportamiento deseado, genera el intent para enviar a un modelo de IA.

### Caso 3: Nueva feature

Usuario selecciona archivos base, describe la funcionalidad deseada, genera el intent como especificación técnica.

### Caso 4: Refactorización

Usuario selecciona código legacy, describe el estado actual y los objetivos de refactorización, genera el intent como guía de trabajo.

### Caso 5: Navegación de docs

Usuario navega entre múltiples archivos Markdown relacionados usando los links internos del preview.

---

## 15. Consideraciones de implementación

### Refactorización del código existente

El código actual en extension.ts debe refactorizarse para:

* Extraer la lógica de preview a openMarkdownPreview.ts
* Extraer la gestión de paneles a markdownPreviewPanel.ts
* Mantener la misma funcionalidad pero con código más modular
* Permitir agregar el nuevo comando sin conflictos

### Gestión de estado

* El Map de previewPanels debe mantenerse para tracking de paneles activos
* Se agregará un nuevo sistema de tracking para paneles de formulario
* Ambos sistemas operan independientemente

### Reutilización de recursos

* Los estilos existentes no se modifican
* Las rutas de recursos se mantienen iguales
* El sistema de URIs de WebView se reutiliza para el formulario

---

## 16. Extensibilidad futura

El plugin está diseñado para ser extensible:

* Templates personalizados de intent
* Integración con sistemas de tickets (Jira, Linear)
* Exportación directa a servicios de IA
* Versionado de intents
* Comparación de intents antes/después
* Preview de archivos .bl (similar al preview de .md)
* Temas personalizados para preview

---

## 17. Resultado esperado

Un plugin funcional para VSCode que:

* Mantiene intacta la funcionalidad de preview de Markdown
* Genera intents de BTIP de forma local y rápida
* Empaqueta archivos correctamente en .tar.gz
* Crea archivos intent.bl con formato estándar
* Proporciona UI intuitiva mediante formularios
* Valida entradas del usuario adecuadamente
* Maneja errores de forma clara y útil
* Opera sin dependencias externas
* Sigue convenciones Bloom (indentación 4 espacios)
* Tiene código modular y bien estructurado

---

Fin del documento.