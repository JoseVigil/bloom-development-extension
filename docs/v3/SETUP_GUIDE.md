# Guía de Setup: Bloom BTIP Plugin

Esta guía proporciona instrucciones paso a paso para implementar el Bloom BTIP Plugin desde cero.

---

## 📋 Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:

- ✅ Visual Studio Code (versión 1.80.0 o superior)
- ✅ Node.js (versión 18.0.0 o superior)
- ✅ npm (incluido con Node.js)
- ✅ Git (opcional, para control de versiones)

---

## 🚀 Paso 1: Crear Estructura del Proyecto

Crear la siguiente estructura de carpetas y archivos:

```
bloom-btip-plugin/
├── src/
│   ├── commands/
│   ├── ui/
│   ├── core/
│   ├── utils/
│   └── styles/
├── package.json
├── tsconfig.json
├── .vscodeignore
└── README.md
```

### Comandos para crear la estructura:

```bash
mkdir bloom-btip-plugin
cd bloom-btip-plugin
mkdir -p src/commands src/ui src/core src/utils src/styles
```

---

## 📝 Paso 2: Copiar Archivos del Proyecto

Copiar cada uno de los archivos generados en esta implementación a su ubicación correspondiente:

### Archivos de configuración (raíz del proyecto):
1. `package.json`
2. `tsconfig.json`
3. `.vscodeignore`
4. `README.md`

### Código fuente (carpeta src/):

**src/ (raíz):**
1. `extension.ts`

**src/commands/:**
1. `openMarkdownPreview.ts`
2. `generateIntent.ts`

**src/ui/:**
1. `markdownPreviewPanel.ts`
2. `intentFormPanel.ts`

**src/core/:**
1. `validator.ts`
2. `filePackager.ts`
3. `intentGenerator.ts`

**src/utils/:**
1. `logger.ts`

**src/styles/:**
1. `markdown.css` (copiar del proyecto original)
2. `highlight.css` (copiar del proyecto original)

---

## 📦 Paso 3: Instalar Dependencias

Abrir terminal en la carpeta del proyecto y ejecutar:

```bash
npm install
```

Esto instalará todas las dependencias especificadas en `package.json`:
- TypeScript
- Tipos de VSCode
- @vscode/codicons
- punycode
- ESLint y otros dev tools

---

## 🔨 Paso 4: Compilar el Proyecto

Compilar el código TypeScript a JavaScript:

```bash
npm run compile
```

Esto creará una carpeta `out/` con el código JavaScript compilado.

### Modo watch (opcional):

Para desarrollo activo, usar modo watch que recompila automáticamente:

```bash
npm run watch
```

---

## 🧪 Paso 5: Probar el Plugin

### Método 1: Ejecutar en modo debug

1. Abrir el proyecto en VSCode
2. Presionar `F5` (o ir a Run → Start Debugging)
3. Se abrirá una nueva ventana de VSCode con el plugin activo
4. Probar las funcionalidades en esa ventana

### Método 2: Instalar localmente

1. Empaquetar la extensión:
   ```bash
   npm install -g @vscode/vsce
   vsce package
   ```

2. Esto genera un archivo `.vsix`

3. Instalar en VSCode:
   - Extensions → ... → Install from VSIX
   - Seleccionar el archivo `.vsix` generado

---

## ✅ Paso 6: Verificar Funcionalidades

### Test 1: Preview de Markdown

1. Crear un archivo de prueba `test.md`:
   ```markdown
   # Test de Preview
   
   Este es un **test** de preview.
   
   ## Sección 2
   
   - Item 1
   - Item 2
   
   [Link a otro archivo](./otro.md)
   ```

2. Abrir `test.md` en el editor
3. Command Palette (`Ctrl+Shift+P`) → `Bloom: Open Markdown Preview`
4. Verificar que el preview se abre en panel lateral
5. Editar el archivo y verificar que el preview se actualiza
6. Verificar que los estilos se aplican correctamente

### Test 2: Generación de Intent

1. Crear algunos archivos de prueba en tu workspace
2. Seleccionar 2-3 archivos en el explorador
3. Click derecho → `Bloom: Generate Intent`
4. Completar el formulario:
   - Nombre: `test-intent`
   - Completar campos obligatorios con texto de prueba
   - Agregar items a las listas
5. Click en "Generar Intent"
6. Verificar que se crea la carpeta `intents/test-intent/`
7. Verificar que contiene `intent.bl` y `codebase.tar.gz`
8. Abrir `intent.bl` y verificar el formato

### Test 3: Validaciones

1. Intentar generar intent sin archivos seleccionados → debe mostrar error
2. Intentar generar intent con nombre que contiene `/` → debe mostrar error de validación
3. Intentar generar intent con campos vacíos → debe mostrar errores específicos
4. Verificar que los errores se muestran claramente en el formulario

---

## 🐛 Paso 7: Debugging y Logs

### Ver logs del plugin:

1. Abrir Output Panel: `View → Output`
2. Seleccionar canal `Bloom` del dropdown
3. Ver logs con timestamps de todas las operaciones

### Debug con breakpoints:

1. Poner breakpoints en código TypeScript (click en margen izquierdo)
2. Presionar `F5` para ejecutar en modo debug
3. Los breakpoints se activarán cuando se ejecute ese código
4. Usar Debug Console para inspeccionar variables

---

## 📋 Checklist de Verificación

Marcar cada item después de verificarlo:

- [ ] Proyecto compila sin errores
- [ ] Preview de Markdown funciona correctamente
- [ ] Preview se actualiza en tiempo real
- [ ] Navegación entre archivos .md funciona
- [ ] Anclajes internos funcionan con scroll suave
- [ ] Estilos CSS se cargan correctamente
- [ ] Comando "Generate Intent" aparece en menú contextual
- [ ] Formulario se abre con todos los campos
- [ ] Listas dinámicas permiten agregar/eliminar items
- [ ] Validaciones funcionan correctamente
- [ ] Se genera carpeta intents/[nombre]/
- [ ] Se crea archivo intent.bl con formato correcto
- [ ] Se crea archivo codebase.tar.gz
- [ ] Notificaciones de éxito/error se muestran
- [ ] Logs aparecen en Output Panel

---

## 🔧 Solución de Problemas Comunes

### Error: "Cannot find module 'vscode'"

**Solución:**
```bash
npm install --save-dev @types/vscode
```

### Error: "punycode is deprecated"

**Solución:**  
Ya está incluido en `package.json` como dependencia. Si persiste:
```bash
npm install punycode
```

### Los estilos no se cargan en el preview

**Solución:**
1. Verificar que `markdown.css` y `highlight.css` existen en `src/styles/`
2. Verificar que `@vscode/codicons` está instalado
3. Revisar Output Panel para errores de carga de recursos

### El formulario no captura los datos

**Solución:**
1. Abrir Developer Tools en la ventana de Extension Host: `Help → Toggle Developer Tools`
2. Ver errores de JavaScript en la consola
3. Verificar que los scripts del WebView están habilitados

### No se crea el archivo .tar.gz

**Solución:**
1. Verificar permisos de escritura en el workspace
2. Verificar que los archivos seleccionados no exceden 100MB
3. Ver logs detallados en Output Panel ("Bloom")

---

## 📚 Recursos Adicionales

### Documentación de VSCode Extension API:
- [VSCode API Reference](https://code.visualstudio.com/api/references/vscode-api)
- [WebView API](https://code.visualstudio.com/api/extension-guides/webview)
- [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

### Archivos de Referencia del Proyecto:
- `BLOOM_BTIP_INTERFACE_PROMPT.md` - Punto de entrada
- `BLOOM_BTIP_PLUGIN_PROMPT_GENERAL.md` - Prompt maestro
- `BLOOM_BTIP_PLUGIN_SPEC_REVISED.md` - Especificación técnica
- `BLOOM_BTIP_CREATECODEBASE_IMPLEMENTATION.md` - Documentación de implementación

---

## 🎯 Próximos Pasos

Una vez que el plugin esté funcionando correctamente:

1. **Testing exhaustivo:**
   - Probar con diferentes tipos de archivos
   - Probar con grandes cantidades de archivos
   - Probar casos extremos y límites

2. **Optimización:**
   - Revisar rendimiento con archivos grandes
   - Optimizar carga de estilos
   - Mejorar experiencia de usuario

3. **Empaquetado para producción:**
   ```bash
   vsce package
   ```

4. **Publicación (opcional):**
   - Crear cuenta en Visual Studio Marketplace
   - Seguir guías de publicación de Microsoft
   - Mantener versiones y changelog

5. **Documentación adicional:**
   - Crear CHANGELOG.md
   - Documentar API interna
   - Crear guías de contribución

---

## ✨ Conclusión

Si seguiste todos los pasos correctamente, ahora tienes un plugin Bloom BTIP completamente funcional que:

✅ Mantiene la funcionalidad de preview de Markdown  
✅ Genera intents de forma interactiva  
✅ Empaqueta archivos en formato .tar.gz  
✅ Crea archivos intent.bl estructurados  
✅ Valida datos del usuario  
✅ Maneja errores apropiadamente  
✅ Registra logs para debugging  

**¡Felicidades! El plugin está listo para usar.**

---

**Última actualización:** 2025  
**Versión de esta guía:** 1.0