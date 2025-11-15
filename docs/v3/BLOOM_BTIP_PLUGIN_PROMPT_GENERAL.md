# BLOOM_BTIP_PLUGIN_PROMPT_GENERAL.md

## Propósito

Este documento es un prompt de texto general que describe las instrucciones completas para el desarrollo del Bloom VSCode Plugin, asegurando coherencia con la arquitectura Bloom BTIP (Bloom Technical Intent Package).

Todo el contenido de código dentro de este artifact usa indentación de 4 espacios (no triple backticks) para evitar conflictos de delimitadores en la renderización markdown.

---

## Prompt General

El proyecto a desarrollar es un plugin para Visual Studio Code llamado Bloom, diseñado para trabajar con documentación técnica y facilitar la creación de Technical Intent Packages (Intents) directamente desde el entorno de desarrollo.

El plugin incluye dos funcionalidades principales:

1. Preview avanzado de archivos Markdown (ya implementado)
2. Generación de intents mediante empaquetado de archivos (nueva funcionalidad)

Todo el procesamiento se realiza de forma local sin interacción con APIs externas o servicios de IA.

### Objetivo

Mantener y extender el plugin de Bloom con:

* Funcionalidad existente: Preview de archivos Markdown con navegación y actualización en tiempo real
* Nueva funcionalidad: Crear intents de BTIP desde VSCode mediante un proceso guiado que incluye selección de archivos, empaquetado en formato .tar.gz, y generación de documento de intent mediante formulario interactivo

---

## Instrucciones para el desarrollo

1. Soporte y entorno:

   * El plugin será exclusivo para VSCode.
   * No se dará soporte a Visual Studio nativo.

2. Funcionalidad existente: Preview de Markdown (MANTENER INTACTA)

   El plugin ya incluye el comando: Bloom: Open Markdown Preview

   Características actuales que deben preservarse:

   * Renderizado de archivos .md usando la API de Markdown de VSCode
   * Apertura del preview en panel lateral derecho
   * Actualización automática al editar el documento
   * Navegación mediante links entre archivos .md
   * Soporte para anclajes internos con scroll suave
   * Estilos personalizados con codicons y highlight
   * Gestión de múltiples paneles de preview simultáneos

   Detalles técnicos:

   * Usa vscode.commands.executeCommand('markdown.api.render') para renderizado
   * WebView con CSP configurado correctamente
   * Listeners de cambios de documento para actualización en tiempo real
   * Manejo de disposición de paneles y listeners

3. Nueva funcionalidad: Generación de Intents

   El plugin implementará un nuevo comando: Bloom: Generate Intent

   Flujo completo:

   a) El usuario selecciona uno o varios archivos en el explorador de VSCode
   
   b) Ejecuta el comando mediante:
      * Command Palette: Bloom: Generate Intent
      * Menú contextual: Click derecho sobre archivos seleccionados
   
   c) El plugin valida que haya archivos seleccionados
   
   d) Se abre un formulario modal interactivo que solicita:
      * Nombre del intent
      * Descripción del problema
      * Contexto relevante
      * Comportamiento actual (lista numerada)
      * Comportamiento deseado (lista numerada)
      * Objetivo específico
      * Alcance y restricciones
      * Hipótesis o consideraciones (opcional)
      * Tests o criterios de validación
      * Salida esperada del modelo
   
   e) Una vez completado el formulario:
      * Se crea carpeta: intents/[nombre-del-intent]/
      * Se genera archivo: intents/[nombre-del-intent]/intent.bl
      * Se crea archivo: intents/[nombre-del-intent]/codebase.tar.gz
   
   f) Se muestra notificación de éxito con ruta de los archivos generados

4. Estructura de archivos generados:

   El plugin debe generar la siguiente estructura:

    intents/
    └── [nombre-del-intent]/
        ├── intent.bl
        └── codebase.tar.gz

   Donde:
   * intent.bl: Archivo de texto que sigue el template estándar de Bloom BTIP
   * codebase.tar.gz: Archivo comprimido que contiene todos los archivos seleccionados por el usuario

5. Template del archivo intent.bl:

   El archivo intent.bl debe seguir exactamente esta estructura:

    # INTENT - [Nombre descriptivo del intent]

    ## Problema
    [Descripción del problema proporcionada por el usuario]

    ## Contexto
    [Contexto proporcionado por el usuario]

    ## Comportamiento Actual
    1. [Item 1]
    2. [Item 2]
    3. [Item 3]

    ## Comportamiento Deseado
    1. [Item 1]
    2. [Item 2]
    3. [Item 3]

    ## Objetivo
    [Objetivo específico proporcionado por el usuario]

    ## Archivos incluidos en codebase.tar.gz
    - [archivo1.ext]
    - [archivo2.ext]
    - [archivo3.ext]

    ## Alcance y Restricciones
    [Restricciones proporcionadas por el usuario]

    ## Hipótesis / Consideraciones
    [Consideraciones proporcionadas por el usuario]

    ## Tests / Validación Necesaria
    - [ ] [Criterio 1]
    - [ ] [Criterio 2]
    - [ ] [Criterio 3]

    ## Salida Esperada del Modelo
    [Descripción de la salida esperada]

    ---
    bloom/v1
    includes_archive: "codebase.tar.gz"

6. Límites del alcance:

   * El plugin no interactúa con APIs de IA ni servicios externos.
   * El plugin no gestiona autenticación, configuraciones de IA, ni telemetría.
   * El plugin no ejecuta comandos CLI externos.
   * Todo el procesamiento es local y sincrónico.

7. Estructura del proyecto actualizada:

   * El plugin seguirá una estructura modular extendida:

    src/
    ├── commands/
    │   ├── openMarkdownPreview.ts     (funcionalidad existente)
    │   └── generateIntent.ts          (nueva funcionalidad)
    ├── ui/
    │   ├── intentFormPanel.ts         (nuevo)
    │   └── notifications.ts           (nuevo)
    ├── utils/
    │   ├── filePackager.ts            (nuevo)
    │   ├── intentGenerator.ts         (nuevo)
    │   └── logger.ts                  (nuevo)
    ├── styles/
    │   ├── markdown.css               (existente)
    │   └── highlight.css              (existente)
    └── extension.ts                   (punto de entrada - actualizar)

8. Interfaz de usuario:

   * Debe incluir:

     * Comando existente: Bloom: Open Markdown Preview
     * Nuevo comando: Bloom: Generate Intent
     * Menú contextual en el explorador de archivos: Bloom > Generate Intent
     * Formulario modal para capturar datos del intent
     * Panel de salida para logs del plugin
   * Los errores deben mostrarse mediante notificaciones VSCode.

9. Formateo de archivos generados:

   * Los archivos intent.bl deben formatearse con indentación de 4 espacios para listas y contenido.
   * El plugin debe preservar la estructura estándar del formato Bloom BTIP.
   * Los archivos .tar.gz deben incluir las rutas relativas correctas de los archivos seleccionados.

10. Compatibilidad:

    * Operar sobre el primer workspaceFolder del entorno.
    * No es necesario soporte para multi-root workspaces.

11. Validaciones:

    * Verificar que hay archivos seleccionados antes de abrir el formulario.
    * Verificar que el nombre del intent no contenga caracteres inválidos.
    * Verificar que no exista ya una carpeta con ese nombre de intent.
    * Validar que todos los campos obligatorios del formulario estén completos.

12. Errores y reporting:

    * Los errores deben mostrarse en notificaciones VSCode.
    * Registrar eventos importantes en el Output Panel de VSCode (canal Bloom).
    * Proporcionar mensajes de error claros y accionables.

---

## Comportamiento esperado (flujo completo detallado)

### Flujo existente: Preview de Markdown

1. El usuario abre un archivo .md en el editor.

2. Ejecuta: Bloom: Open Markdown Preview

3. Se abre un panel WebView a la derecha con el contenido renderizado.

4. Al editar el archivo, el preview se actualiza automáticamente.

5. Los links internos funcionan con navegación suave.

6. Los links a otros archivos .md abren nuevos paneles de preview.

### Nuevo flujo: Generación de Intent

1. El usuario selecciona uno o más archivos en el explorador VSCode.

2. Click derecho → Bloom: Generate Intent.

3. El plugin valida que hay archivos seleccionados.

4. Se abre un WebView Panel con un formulario que incluye:
   * Campo de texto: Nombre del intent
   * Área de texto: Problema
   * Área de texto: Contexto
   * Lista dinámica: Comportamiento Actual (permite agregar/eliminar items)
   * Lista dinámica: Comportamiento Deseado (permite agregar/eliminar items)
   * Área de texto: Objetivo
   * Lista dinámica: Alcance y Restricciones
   * Área de texto: Hipótesis/Consideraciones (opcional)
   * Lista dinámica: Tests/Validación
   * Área de texto: Salida Esperada del Modelo

5. El usuario completa el formulario y hace clic en Generar Intent.

6. El plugin ejecuta las siguientes acciones:
   * Crea la carpeta: intents/[nombre-del-intent]/
   * Empaqueta los archivos seleccionados en: intents/[nombre-del-intent]/codebase.tar.gz
   * Genera el archivo: intents/[nombre-del-intent]/intent.bl usando el template y los datos del formulario
   * Lista los nombres de archivos incluidos en la sección correspondiente del intent.bl

7. El plugin muestra una notificación de éxito:

    ✅ Intent '[nombre]' creado exitosamente en intents/[nombre-del-intent]/

8. La salida completa del proceso se registra en el panel Bloom Output.

---

## Estilo y convenciones

* Todo código dentro del plugin debe estar escrito en TypeScript.
* Los archivos intent.bl generados deben seguir el estilo:

    # INTENT - Implementar sistema de autenticación

    ## Problema
    La aplicación no cuenta con un sistema de autenticación seguro.

    ## Contexto
    El proyecto es una aplicación web que maneja datos sensibles de usuarios.

    ## Comportamiento Actual
    1. Cualquier usuario puede acceder sin credenciales
    2. No existe validación de sesiones
    3. Los datos están expuestos públicamente

    ## Comportamiento Deseado
    1. Sistema de login con credenciales
    2. Validación de tokens JWT
    3. Protección de rutas sensibles

    ## Objetivo
    Implementar autenticación completa con JWT y protección de rutas

    ## Archivos incluidos en codebase.tar.gz
    - src/app.ts
    - src/routes/auth.ts
    - src/middleware/verify.ts

    ## Alcance y Restricciones
    - No modificar la base de datos existente
    - Mantener compatibilidad con API v1

    ## Tests / Validación Necesaria
    - [ ] Login exitoso con credenciales válidas
    - [ ] Rechazo de tokens inválidos
    - [ ] Protección correcta de rutas

    ## Salida Esperada del Modelo
    Código completo del sistema de autenticación con tests

    ---
    bloom/v1
    includes_archive: "codebase.tar.gz"

---

## Resultado esperado

El resultado de aplicar este prompt debe ser un plugin funcional para VSCode que:

* Mantenga intacta la funcionalidad de preview de Markdown existente.
* Permita seleccionar archivos y generar intents basados en template.
* Empaquete archivos seleccionados en formato .tar.gz.
* Genere archivos intent.bl con formato correcto y estructura clara.
* Proporcione una interfaz de usuario intuitiva mediante formularios.
* Organice los archivos generados en una estructura de carpetas coherente.
* No interactúe con servicios externos ni APIs de IA.
* Siga la convención markdown de Bloom (indentación de 4 espacios, sin backticks).
* Opere completamente de forma local y sincrónica.
* Preserve todos los estilos CSS y configuraciones de WebView existentes.