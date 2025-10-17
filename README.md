# Bloom Development Extension

**Bloom Development Extension** es una extensión para Visual Studio Code que permite abrir vistas previas de archivos Markdown (`.md`) en un grupo de editores separado a la derecha. Al hacer clic en enlaces a otros archivos `.md` en la vista previa, se abre únicamente una nueva vista previa en un nuevo grupo de editores, sin abrir el editor de texto del archivo linkeado, imitando el comportamiento de "Abrir enlace en nueva pestaña" de un navegador.

## Instalación

### Prerrequisitos
- **Node.js** (versión 20.x o superior)
- **Visual Studio Code** (versión 1.80.0 o superior)
- **TypeScript** y `vsce` instalados globalmente o en el proyecto

### Compilar e Instalar
1. Clona el repositorio:
   ```bash
   git clone https://github.com/JoseVigil/bloom-development-extension.git
   cd bloom-development-extension
   ```

2. Instala las dependencias:
   ```bash
   npm install
   ```

3. Compila el código TypeScript:
   ```bash
   npm run compile
   ```

4. Empaqueta la extensión en un archivo `.vsix`:
   ```bash
   npx vsce package
   ```

5. Instala la extensión en VS Code:
   ```bash
   code --install-extension bloom-development-extension-0.0.1.vsix
   ```
   O en VS Code: `Ctrl+Shift+X` > ... > **"Install from VSIX..."** > Selecciona `bloom-development-extension-0.0.1.vsix`.

6. Reinicia VS Code:
   ```bash
   code
   ```

## Uso

1. Abre un archivo Markdown (`.md`) en VS Code.
2. Ejecuta el comando **"Bloom: Open Markdown Preview"**:
   - Presiona `Ctrl+Shift+P` y escribe `Bloom: Open Markdown Preview`.
   - O haz clic derecho en un archivo `.md` en el Explorador y selecciona **"Bloom: Open Markdown Preview"**.
3. La vista previa se abrirá en un nuevo grupo de editores a la derecha.
4. Haz clic en cualquier enlace a otro archivo `.md` (por ejemplo, `[Otro archivo](./otro.md)`) en la vista previa. Esto abrirá solo la vista previa del archivo linkeado en un nuevo grupo de editores, sin abrir su editor de texto.

### Ejemplo
Crea un archivo `test.md`:
```markdown
# Test Document
[Ir a otro documento](./otro.md)
```

Crea un archivo `otro.md`:
```markdown
# Otro Documento
Este es otro archivo Markdown.
```

1. Abre `test.md`.
2. Ejecuta **"Bloom: Open Markdown Preview"**.
3. Haz clic en el enlace "Ir a otro documento". Se abrirá una vista previa de `otro.md` en un nuevo grupo de editores a la derecha.

## Estructura del Proyecto

```plaintext
bloom-development-extension/
├── src/
│   └── extension.ts
├── out/
│   └── extension.js
├── .vscode/
│   ├── launch.json
│   └── tasks.json
├── package.json
├── tsconfig.json
└── README.md
```

## Dependencias
- `marked`: Para renderizar Markdown a HTML.
- `@types/marked`, `@types/vscode`, `typescript`, `vsce`: Para desarrollo y compilación.

## Contribuir
Consulta el repositorio en [GitHub](https://github.com/JoseVigil/bloom-development-extension) para reportar problemas o contribuir.

## Licencia
MIT