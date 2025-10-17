# Bloom Development Extension

Esta extensión para Visual Studio Code agrega un comando llamado "Bloom: Open Markdown Preview" que permite abrir la vista previa de un archivo Markdown (.md) en modo split view (a la derecha) de manera rápida.

## Funcionalidades
- **Comando Principal**: `Bloom: Open Markdown Preview` (identificador: `bloom.openMarkdownPreview`).
- Verifica que el archivo activo sea `.md`; si no, muestra un error: "Please open a Markdown (.md) file first."
- Guarda automáticamente el archivo antes de abrir la preview.
- Abre la preview usando el comando interno de VS Code (`markdown.showPreviewToSide`), sin cerrar ni modificar el editor actual.
- Accesible desde:
  - Paleta de comandos (Ctrl+Shift+P).
  - Menú contextual (clic derecho en archivos `.md` en el Explorador).

## Instalación
1. Descarga el archivo `.vsix` de esta extensión.
2. En VS Code, ve a Extensiones (Ctrl+Shift+X) > ... > Install from VSIX... y selecciona el archivo.

## Uso
1. Abre un archivo `.md` en VS Code.
2. Ejecuta el comando vía Ctrl+Shift+P > "Bloom: Open Markdown Preview".
3. O haz clic derecho en el archivo `.md` en el Explorador y selecciona la opción.

## Requisitos
- VS Code versión 1.80.0 o superior.
- No requiere otras extensiones.

## Desarrollo
- Desarrollado en TypeScript.
- Compilado a `./out/extension.js`.
- Activación: Solo al ejecutar el comando.

Si encuentras issues, reporta en [tu repo si lo tienes, o describe aquí].

## Changelog
Ver [CHANGELOG.md](CHANGELOG.md) para detalles de versiones.
