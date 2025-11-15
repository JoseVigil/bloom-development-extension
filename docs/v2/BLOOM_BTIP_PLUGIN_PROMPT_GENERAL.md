# BLOOM_PLUGIN_PROMPT_GENERAL.md

## Propósito

Este documento es un **prompt de texto general** que describe las instrucciones completas para el desarrollo del **Bloom VSCode Plugin**, asegurando coherencia con la arquitectura Bloom BTIP (Bloom Technical Intent Package) y las especificaciones del CLI.

Todo el contenido de código dentro de este artifact usa **indentación de 4 espacios** (no triple backticks) para evitar conflictos de delimitadores en la renderización markdown.

---

## Prompt General

El proyecto a desarrollar es un **plugin para Visual Studio Code** llamado **Bloom**, diseñado para trabajar junto al **CLI de Bloom (bloom)**. Este plugin permite a los usuarios crear y gestionar *codebases* e *intents* (BTIPs) directamente desde el entorno de desarrollo, sin reemplazar la funcionalidad del CLI.

El plugin **no interactúa directamente con ninguna API de IA** (como ChatGPT, Claude o Grok). Toda la interacción con proveedores externos es responsabilidad exclusiva del CLI. El plugin actúa como una interfaz de productividad local.

### Objetivo

Desarrollar el plugin inicial de Bloom centrado en una única funcionalidad principal: **crear codebases e intents de BTIP** desde VSCode, delegando todas las operaciones lógicas y de red al CLI.

---

## Instrucciones para el desarrollo

1. **Soporte y entorno:**

   * El plugin será exclusivo para **VSCode**.
   * No se dará soporte a Visual Studio nativo.

2. **Dependencias y comunicación:**

   * El plugin requiere que el usuario tenga instalado y configurado el **CLI `bloom`** previamente.
   * Toda comunicación con el sistema Bloom se hará mediante ejecución de comandos del CLI.
   * Ejemplo:

     bloom create intent <name> --files <paths>

3. **Funciones del plugin:**

   * Crear codebases (`.codebase.bl`).
   * Crear intents (`.intent.json`, `.report.bl`, etc.) usando la estructura estándar.
   * Refrescar intents existentes llamando al CLI.
   * Mostrar logs o mensajes de salida del CLI en el panel de salida VSCode.

   - Implementación Create Codebase: definida en BLOOM_BTIP_CREATECODEBASE_IMPLEMENTATION.md.  
  Esta funcionalidad permite empaquetar los archivos seleccionados en Visual Studio Code dentro de un archivo .codebase.bl con estructura y formato idéntico al BLOOM_BTIP_UNIVERSAL_CODEBASE_TEMPLATE.md, incluyendo el contenido completo de cada archivo con indentación de 4 espacios.


4. **Límites del alcance:**

   * El plugin **no debe realizar llamadas directas a APIs de IA**.
   * El plugin **no gestiona autenticación**, configuraciones de IA, ni telemetría.
   * El plugin **no incluye plantillas predefinidas**: el archivo `BLOOM_BTIP_UNIVERSAL_CODEBASE_TEMPLATE.md` es solo una referencia conceptual.

5. **Estructura del proyecto:**

   * El plugin seguirá una estructura modular:

     src/
     ├── commands/
     │   ├── createIntent.ts
     │   ├── createCodebase.ts
     │   └── refreshIntent.ts
     ├── utils/
     │   ├── cliExecutor.ts
     │   ├── fileSystem.ts
     │   └── logger.ts
     ├── ui/
     │   ├── panels.ts
     │   └── notifications.ts
     └── extension.ts

6. **Interfaz de usuario:**

   * Debe incluir:

     * Comando en el *Command Palette*: `Bloom: Create Codebase`.
     * Menú contextual en el explorador de archivos.
     * Panel de salida para logs del CLI.
   * Los errores deben mostrarse mediante notificaciones VSCode.

7. **Formateo de archivos generados:**

   * Los archivos `.codebase.bl` y `.report.bl` deben formatearse con **indentación de 4 espacios para el código**.
   * El plugin debe preservar la estructura estándar del formato Bloom.

8. **Compatibilidad:**

   * Operar sobre el primer `workspaceFolder` del entorno.
   * No es necesario soporte para multi-root workspaces.

9. **Configuración:**

   * El CLI maneja su propia configuración mediante `.env` o `.bloomrc`.
   * El plugin no accede a claves API ni modifica configuraciones del usuario.

10. **Errores y reporting:**

    * Los errores del CLI deben mostrarse en el *Output Panel* de VSCode.
    * Si el CLI no está disponible, mostrar un mensaje instructivo para el usuario: “Bloom CLI no encontrado. Instálalo antes de usar el plugin.”

---

## Comportamiento esperado (flujo principal)

1. El usuario selecciona uno o más archivos en el explorador VSCode.

2. Click derecho → “Bloom: Create Codebase”.

3. El plugin solicita un nombre para el codebase.

4. Ejecuta el comando CLI correspondiente:

   ```
    bloom create codebase <name> --files <paths>
   ```

5. El CLI genera los archivos en `.bloom/`.

6. El plugin muestra una notificación de éxito y registra la salida en el panel de logs.

---

## Estilo y convenciones

* Todo código dentro del plugin debe estar escrito en **TypeScript**.
* Los bloques de código en los archivos markdown generados deben seguir el estilo:

  ```
    # Bloom Codebase: example
    > Generated automatically

    ## File: src/index.ts

        import * as vscode from 'vscode';
        console.log('Hello Bloom');
  ```

---

## Resultado esperado

El resultado de aplicar este prompt debe ser un **plugin funcional para VSCode** que:

* Permita crear codebases e intents.
* Llame al CLI `bloom` para ejecutar acciones.
* No interactúe directamente con modelos IA ni APIs externas.
* Siga la convención markdown de Bloom (indentación de 4 espacios, sin backticks).
* Use el CLI como única fuente de verdad para la generación de archivos.
