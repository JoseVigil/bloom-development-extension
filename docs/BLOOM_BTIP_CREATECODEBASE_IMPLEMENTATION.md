# BLOOM_BTIP_CREATECODEBASE_IMPLEMENTATION.md

Este documento define la implementación exacta de la funcionalidad **Create Codebase** del plugin Bloom para Visual Studio Code. Se utiliza como guía técnica directa para el desarrollo del archivo `src/commands/createCodebase.ts`. Todo el código y pseudocódigo usa **indentación de 4 espacios** sin triple backticks.

---

## 1. Propósito

Permitir que el usuario seleccione uno o varios archivos en el explorador de VSCode y, mediante el comando **“Bloom: Create Codebase”**, generar automáticamente un archivo `.codebase.bl` con el contenido completo de cada archivo incluido, siguiendo la estructura del documento `BLOOM_BTIP_UNIVERSAL_CODEBASE_TEMPLATE.md`.

El resultado será un archivo unificado que pueda ser subido a una IA o al sistema Bloom CLI, conteniendo todo el código de un conjunto de archivos.

---

## 2. Flujo general

1. El usuario selecciona uno o varios archivos en el explorador de VSCode.

2. Hace clic derecho → **Bloom: Create Codebase**.

3. El plugin solicita un nombre para el codebase.

4. Se recopilan las rutas y contenidos de los archivos seleccionados.

5. Se genera un archivo `.bloom/<nombre>.codebase.bl` con la estructura:

   ```
    # Bloom Codebase: <nombre>
    > Generated automatically by Bloom VSCode Plugin

    ## Index
    - <ruta relativa 1>
    - <ruta relativa 2>

    ## File: <ruta relativa 1>

        (código del archivo 1)

    ## File: <ruta relativa 2>

        (código del archivo 2)
   ```

6. Se muestra una notificación de éxito y el archivo se abre en el editor.

7. Se registra el evento en el canal `BloomOutputChannel`.

---

## 3. Validaciones requeridas

* Si no hay archivos seleccionados y no hay archivo activo, mostrar error.
* Si el usuario cancela el nombre del codebase, abortar.
* Si ocurre error de lectura o escritura, mostrar mensaje en Output y notificación.

---

## 4. Ubicación y estructura del archivo generado

El archivo debe guardarse en:

```
${workspaceFolder}/.bloom/<nombre>.codebase.bl
```

Si no existe la carpeta `.bloom/`, debe crearse automáticamente.

---

## 5. Implementación sugerida (pseudocódigo)

```
async function createCodebaseCommand(outputChannel, uri, uris) {
    // 1. Determinar archivos seleccionados
    const selectedFiles = uris || (uri ? [uri] : []);
    if (selectedFiles.length === 0) {
        const active = vscode.window.activeTextEditor?.document.uri;
        if (active) selectedFiles.push(active);
    }
    if (selectedFiles.length === 0) {
        vscode.window.showErrorMessage('No hay archivos seleccionados.');
        return;
    }

    // 2. Pedir nombre al usuario
    const codebaseName = await vscode.window.showInputBox({
        prompt: 'Nombre del Codebase',
        placeHolder: 'Ejemplo: ecommerce'
    });
    if (!codebaseName) return;

    // 3. Preparar estructura del archivo
    const workspace = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    const bloomDir = path.join(workspace, '.bloom');
    await fs.promises.mkdir(bloomDir, { recursive: true });
    const outputPath = path.join(bloomDir, `${codebaseName}.codebase.bl`);

    // 4. Construir contenido
    let content = `# Bloom Codebase: ${codebaseName}\n`;
    content += `> Generated automatically by Bloom VSCode Plugin\n\n`;
    content += `## Index\n`;

    const files = [];
    for (const fileUri of selectedFiles) {
        const relativePath = path.relative(workspace, fileUri.fsPath);
        content += `- ${relativePath}\n`;
        files.push({ path: relativePath, uri: fileUri });
    }

    content += `\n`;

    for (const file of files) {
        const text = await fs.promises.readFile(file.uri.fsPath, 'utf8');
        const indented = text.split('\n').map(line => `    ${line}`).join('\n');
        content += `## File: ${file.path}\n\n${indented}\n\n`;
    }

    // 5. Guardar archivo
    await fs.promises.writeFile(outputPath, content, 'utf8');

    // 6. Mostrar resultado
    outputChannel.log(`Codebase creado: ${outputPath}`);
    vscode.window.showInformationMessage(`Codebase '${codebaseName}' creado correctamente.`);
    const doc = await vscode.workspace.openTextDocument(outputPath);
    vscode.window.showTextDocument(doc);
}
```

---

## 6. Dependencias

* `fs` (File System)
* `path`
* `vscode`
* `BloomOutputChannel` (para logs)

---

## 7. Mensajes de error posibles

* “No hay archivos seleccionados.”
* “Error al leer archivo: <ruta>.”
* “Error al escribir el codebase.”
* “No se encontró el workspace.”

---

## 8. Resultado esperado

* Crear automáticamente el archivo `.bloom/<nombre>.codebase.bl` con el contenido completo de los archivos seleccionados.
* Mantener la indentación de 4 espacios.
* Notificar el éxito al usuario.
* Registrar en el canal de salida Bloom.

---

## 9. Integración con el plugin

* El archivo `createCodebase.ts` debe exportar la función `createCodebaseCommand`.
* Esta función será llamada desde `extension.ts` al ejecutar el comando `bloom.createCodebase`.
* No debe realizar llamadas al CLI Bloom ni a APIs externas.

---

Fin del documento.
