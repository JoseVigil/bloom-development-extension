# BLOOM_PLUGIN_ARCHITECTURE.md

## Arquitectura Modular del Bloom VSCode Plugin

Este documento describe la arquitectura refactorizada que **mantiene 100% de funcionalidad original** mientras añade **nuevas capacidades** de forma modular y extensible.

---

## 1. Estructura de Directorios

```
bloom-vscode-plugin/
├── src/
│   ├── extension.ts                      # Entry point (ligero, solo registro)
│   ├── commands/                         # Comandos de usuario
│   │   ├── createCodebase.ts             # Create Codebase
│   │   ├── createIntent.ts               # (futuro) Create Intent
│   │   └── refreshIntent.ts              # (futuro) Refresh Intent
│   ├── core/                             # Lógica de negocio
│   │   ├── codebaseGenerator.ts          # Generación de .codebase.bl
│   │   ├── intentGenerator.ts            # (futuro) Generación de intents
│   │   └── cliExecutor.ts                # (futuro) Ejecución del CLI
│   ├── preview/                          # Sistema de previews
│   │   ├── markdownPreviewManager.ts     # Gestor de previews .md
│   │   └── reportPreviewManager.ts       # (futuro) Previews de .report.bl
│   └── utils/                            # Utilidades compartidas
│       ├── fileSystem.ts                 # Operaciones de archivos
│       ├── outputChannel.ts              # Logging y mensajes
│       └── validators.ts                 # (futuro) Validaciones comunes
├── node_modules/
├── package.json
└── tsconfig.json
```

---

## 2. Principios de Diseño

### 2.1 Separación de Responsabilidades

Cada módulo tiene una responsabilidad única y bien definida:

| Módulo | Responsabilidad |
|--------|-----------------|
| `extension.ts` | Registro de comandos y activación |
| `commands/` | Orquestación de flujos de usuario |
| `core/` | Lógica de negocio y transformaciones |
| `preview/` | Gestión de webviews y renderizado |
| `utils/` | Funcionalidades transversales |

### 2.2 Bajo Acoplamiento

Los módulos se comunican a través de interfaces claras:

```typescript
// Ejemplo: CreateCodebase no conoce los detalles de FileSystem
const generator = new CodebaseGenerator(workspaceRoot);
const content = await generator.generateCodebase(name, uris);
FileSystemHelper.writeFile(path, content);
```

### 2.3 Alta Cohesión

Código relacionado está agrupado:

```typescript
// MarkdownPreviewManager encapsula TODA la lógica de preview
class MarkdownPreviewManager {
    - createWebviewPanel()      // Creación de panels
    - updateWebview()            // Actualización de contenido
    - setupPanelListeners()      // Configuración de eventos
    - handleLinkNavigation()     // Navegación entre .md
    - generateHtmlContent()      // Generación de HTML
}
```

---

## 3. Comparación: Original vs Refactorizado

### 3.1 Código Original (extension.ts monolítico)

```typescript
// TODO en un solo archivo (200+ líneas)
export function activate(context: vscode.ExtensionContext) {
    const previewPanels = new Map<...>();
    
    let disposable = vscode.commands.registerCommand('bloom.openMarkdownPreview', async () => {
        // 150 líneas de lógica inline
        const panel = vscode.window.createWebviewPanel(...);
        const updateWebview = async () => { ... };
        panel.webview.onDidReceiveMessage(...);
        // etc.
    });
}
```

**Problemas:**
- ❌ Difícil de testear (lógica mezclada con UI)
- ❌ No reutilizable (código duplicado)
- ❌ Difícil de extender (agregar Create Codebase = más caos)

### 3.2 Código Refactorizado (modular)

```typescript
// extension.ts: Solo 20 líneas
export function activate(context: vscode.ExtensionContext) {
    const previewManager = new MarkdownPreviewManager(context);
    const outputChannel = new BloomOutputChannel();
    
    vscode.commands.registerCommand('bloom.openMarkdownPreview', 
        () => previewManager.openPreview());
    
    vscode.commands.registerCommand('bloom.createCodebase',
        () => createCodebaseCommand(outputChannel));
}
```

**Beneficios:**
- ✅ Fácil de testear (cada clase es independiente)
- ✅ Reutilizable (MarkdownPreviewManager en múltiples comandos)
- ✅ Extensible (agregar comandos = nuevos archivos, no modificar existentes)

---

## 4. Funcionalidades Preservadas

### 4.1 Preview de Markdown (100% Original)

| Funcionalidad | Estado | Ubicación |
|---------------|--------|-----------|
| Abrir preview .md | ✅ Completa | `MarkdownPreviewManager.openPreview()` |
| Actualización dinámica | ✅ Completa | `setupPanelListeners()` → changeListener |
| Navegación entre .md | ✅ Completa | `handleLinkNavigation()` |
| Múltiples panels simultáneos | ✅ Completa | `Map<Document, Panel>` preservado |
| Scroll a anclas internas | ✅ Completa | JavaScript en `generateHtmlContent()` |
| Estilos (codicon, markdown, highlight) | ✅ Completa | URIs en `generateHtmlContent()` |
| Cleanup de listeners | ✅ Completa | `onDidDispose()` en `setupPanelListeners()` |

### 4.2 Nueva Funcionalidad: Create Codebase

| Funcionalidad | Estado | Ubicación |
|---------------|--------|-----------|
| Selección de archivos | ✅ Nueva | `createCodebaseCommand()` |
| Validación de nombre | ✅ Nueva | Input validation callback |
| Generación de formato | ✅ Nueva | `CodebaseGenerator.generateCodebase()` |
| Guardado en .bloom/ | ✅ Nueva | `FileSystemHelper` |
| Logging detallado | ✅ Nueva | `BloomOutputChannel` |

---

## 5. Flujos de Ejecución

### 5.1 Flujo: Open Markdown Preview

```
User clicks "Bloom: Open Markdown Preview"
    ↓
extension.ts: Llama previewManager.openPreview()
    ↓
MarkdownPreviewManager:
    1. Valida que hay editor activo
    2. Valida que es archivo .md
    3. Guarda documento
    4. Crea nueva columna (workbench actions)
    5. Llama createWebviewPanel(document)
       ↓
       - Crea webview con opciones
       - Registra en Map<Document, Panel>
    6. Llama updateWebview(panel, document)
       ↓
       - Ejecuta markdown.api.render
       - Genera HTML con generateHtmlContent()
       - Asigna a panel.webview.html
    7. Llama setupPanelListeners(panel, document)
       ↓
       - Crea changeListener para actualizaciones dinámicas
       - Crea onDidReceiveMessage para navegación
       - Crea onDidDispose para cleanup
    ↓
Preview abierto y funcional
```

### 5.2 Flujo: Create Codebase

```
User clicks "Bloom: Create Codebase"
    ↓
extension.ts: Llama createCodebaseCommand(outputChannel)
    ↓
createCodebaseCommand:
    1. Valida workspace abierto
    2. Muestra diálogo de selección de archivos
    3. Valida que se seleccionaron archivos
    4. Solicita nombre con validación
    5. Crea directorio .bloom/ (FileSystemHelper)
    6. Crea CodebaseGenerator(workspaceRoot)
    7. Llama generator.generateCodebase(name, uris)
       ↓
       CodebaseGenerator:
           - Lee todos los archivos
           - Genera header y metadata
           - Genera índice
           - Genera contenido indentado (4 espacios)
           - Retorna string completo
    8. Guarda archivo .codebase.bl
    9. Muestra notificación de éxito
    10. Abre documento en panel lateral
    ↓
Codebase creado y visible
```

---

## 6. Extensibilidad: Agregar Create Intent

### Código Necesario (SOLO 3 archivos nuevos):

```typescript
// 1. src/commands/createIntent.ts
export async function createIntentCommand(outputChannel: BloomOutputChannel) {
    // Similar a createCodebase pero genera .intent.json
    const intentGenerator = new IntentGenerator(workspaceRoot);
    const intentContent = await intentGenerator.generate(...);
    // ...
}

// 2. src/core/intentGenerator.ts
export class IntentGenerator {
    async generate(name: string, codebaseName: string): Promise<string> {
        // Lógica para generar structure de .intent.json
        return JSON.stringify({ ... });
    }
}

// 3. extension.ts (SOLO agregar 3 líneas)
const createIntent = vscode.commands.registerCommand(
    'bloom.createIntent',
    () => createIntentCommand(outputChannel)
);
context.subscriptions.push(createIntent);
```

**Sin modificar NADA del código existente** ✅

---

## 7. Testing Estrategia

### 7.1 Tests Unitarios

```typescript
// test/unit/codebaseGenerator.test.ts
describe('CodebaseGenerator', () => {
    it('should generate correct header', () => {
        const generator = new CodebaseGenerator('/workspace');
        const content = generator.generateCodebase('test', []);
        expect(content).toContain('# Bloom Codebase: test');
    });

    it('should indent code with 4 spaces', () => {
        const content = generator.generateCodebase('test', [mockUri]);
        const lines = content.split('\n');
        const codeLine = lines.find(l => l.startsWith('    import'));
        expect(codeLine).toBeTruthy();
    });
});
```

### 7.2 Tests de Integración

```typescript
// test/integration/commands.test.ts
describe('Create Codebase Command', () => {
    it('should create .codebase.bl file', async () => {
        const workspace = await createTestWorkspace();
        await vscode.commands.executeCommand('bloom.createCodebase');
        // Simular selección de archivos y nombre
        const bloomDir = path.join(workspace, '.bloom');
        expect(fs.existsSync(bloomDir)).toBe(true);
    });
});
```

### 7.3 Tests de Preview

```typescript
// test/unit/markdownPreviewManager.test.ts
describe('MarkdownPreviewManager', () => {
    it('should create webview panel', async () => {
        const manager = new MarkdownPreviewManager(mockContext);
        const panel = manager['createWebviewPanel'](mockDocument);
        expect(panel).toBeDefined();
        expect(panel.title).toContain('Bloom Preview');
    });

    it('should handle link navigation', async () => {
        await manager['handleLinkNavigation']('other.md', mockDocument);
        expect(vscode.workspace.openTextDocument).toHaveBeenCalled();
    });
});
```

---

## 8. Ventajas de la Arquitectura Refactorizada

### 8.1 Para Desarrollo

| Aspecto | Antes | Ahora |
|---------|-------|-------|
| Agregar funcionalidad | Modificar extension.ts (riesgo) | Crear nuevo módulo (seguro) |
| Encontrar bugs | Buscar en 200+ líneas | Módulo específico |
| Testing | Imposible (todo acoplado) | Fácil (módulos aislados) |
| Code review | Difícil (todo mezclado) | Fácil (cambios localizados) |

### 8.2 Para Mantenimiento

- ✅ **Single Responsibility**: Cada clase hace una cosa
- ✅ **Open/Closed**: Abierto a extensión, cerrado a modificación
- ✅ **Dependency Inversion**: Depende de abstracciones, no implementaciones
- ✅ **Interface Segregation**: Interfaces pequeñas y específicas

### 8.3 Para Nuevos Desarrolladores

```
Quiero agregar "Export to PDF":
1. Crear src/commands/exportToPdf.ts
2. Crear src/core/pdfGenerator.ts
3. Registrar comando en extension.ts (3 líneas)
4. Listo ✅

NO necesito:
- Entender toda la codebase
- Modificar código existente
- Riesgo de romper funcionalidades previas
```

---

## 9. Migración desde Código Original

### Paso 1: Backup

```bash
git checkout -b refactor/modular-architecture
cp src/extension.ts src/extension.ts.backup
```

### Paso 2: Crear Estructura

```bash
mkdir -p src/{commands,core,preview,utils}
```

### Paso 3: Extraer Preview

```bash
# Mover lógica de preview a MarkdownPreviewManager
# Mantener EXACTAMENTE la misma funcionalidad
```

### Paso 4: Testing

```bash
npm test
# Ejecutar extensión en modo debug
# Verificar TODAS las funcionalidades originales
```

### Paso 5: Agregar Create Codebase

```bash
# Ahora es seguro agregar nueva funcionalidad
# Sin riesgo de romper preview existente
```

---

## 10. Roadmap Futuro

### Fase 1: Comandos Básicos ✅
- [x] Create Codebase
- [ ] Create Intent
- [ ] Refresh Intent

### Fase 2: Integración CLI
- [ ] CLI Executor (ejecutar comandos bloom)
- [ ] Output parsing (capturar resultados)
- [ ] Error handling avanzado

### Fase 3: UI Avanzada
- [ ] Report Preview Manager (.report.bl)
- [ ] Interactive Intent Editor
- [ ] Codebase Diff Viewer

### Fase 4: Productividad
- [ ] Quick Actions (CodeLens)
- [ ] Status Bar Integration
- [ ] Keyboard Shortcuts
- [ ] Context Menu Extensions

---

## 11. Conclusión

La arquitectura refactorizada logra:

✅ **100% de funcionalidad original preservada**
✅ **Nueva funcionalidad agregada sin conflictos**
✅ **Código más limpio, testeable y mantenible**
✅ **Base sólida para crecimiento futuro**
✅ **Menor riesgo de bugs en cambios futuros**

El plugin está listo para escalar de forma profesional y sostenible.