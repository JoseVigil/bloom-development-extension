# BLOOM_BTIP_INTENT_MANAGER.md

## Propósito

Este documento define la especificación técnica completa del Intent Manager para el Bloom VSCode Plugin, describiendo el sistema de gestión de intents mediante TreeView, metadata basada en archivos JSON (sin SQLite), búsqueda piramidal de contexto, y operaciones CRUD completas.

El Intent Manager es el componente central que permite a los desarrolladores crear, organizar, editar y reutilizar intents de forma eficiente dentro del ecosistema Bloom BTIP.

Todos los bloques de código en este documento usan indentación de 4 espacios, sin uso de triple backticks, siguiendo la convención Bloom para compatibilidad con artifacts markdown.

---

## 1. Visión General

### 1.1. Objetivo

El Intent Manager transforma el plugin Bloom de un simple generador de intents en un sistema completo de gestión del ciclo de vida de intenciones técnicas, permitiendo:

- Visualizar todos los intents en una vista jerárquica
- Crear nuevos intents con detección automática de contexto
- Editar intents existentes sin perder historial
- Duplicar intents para reutilización
- Organizar intents por estado (In Progress, Completed, Archived)
- Buscar y filtrar intents por nombre, tags o contenido
- Acceder rápidamente al contexto piramidal completo
- Copiar contexto al clipboard para uso manual (versión gratis)

### 1.2. Arquitectura Base

El Intent Manager opera sobre una arquitectura basada en archivos, sin uso de bases de datos:

    .bloom/
    ├── core/                           # Contexto global compartido
    │   ├── .rules.bl                  # Reglas de código universales
    │   └── .standards.bl              # Estándares del proyecto
    ├── project/
    │   └── .context.bl                # Contexto del proyecto actual
    └── intents/                        # Carpeta de intents
        ├── auth-feature/
        │   ├── .bloom-meta.json       # Metadata del intent
        │   ├── intent.bl              # Definición del intent
        │   └── codebase.md            # Archivos (versión gratis)
        └── payment-module/
            ├── .bloom-meta.json
            ├── intent.bl
            └── codebase.tar.gz        # Archivos (versión paga)

### 1.3. Principios de Diseño

- File-based: Todo se almacena en archivos, no en SQLite
- Stateless: Cada intent es autocontenido y portable
- Piramidal: Herencia automática de contexto padre → hijo
- Auditable: Historial completo visible en archivos
- Extensible: Fácil agregar nuevos campos sin migraciones

---

## 2. Sistema de Metadata

### 2.1. Archivo .bloom-meta.json

Cada intent tiene un archivo de metadata que describe su estado, tags, archivos incluidos y estadísticas.

Ubicación:

    .bloom/intents/[nombre-intent]/.bloom-meta.json

Estructura completa:

    {
      "id": "uuid-v4-generado",
      "name": "auth-feature",
      "displayName": "Authentication Feature",
      "created": "2025-11-15T10:30:00.000Z",
      "updated": "2025-11-15T14:20:00.000Z",
      "status": "in-progress",
      "tags": ["authentication", "security", "backend"],
      "description": "Implementar sistema completo de autenticación JWT",
      "projectType": "android",
      "version": "free",
      "files": {
        "intentFile": "intent.bl",
        "codebaseFile": "codebase.md",
        "filesIncluded": [
          "app/src/main/java/com/example/auth/AuthService.kt",
          "app/src/main/java/com/example/auth/TokenManager.kt"
        ],
        "filesCount": 2,
        "totalSize": 15420
      },
      "stats": {
        "timesOpened": 5,
        "lastOpened": "2025-11-15T14:20:00.000Z",
        "estimatedTokens": 8500
      },
      "bloomVersion": "1.0.0"
    }

### 2.2. Campos Obligatorios

- id: UUID v4 único
- name: Nombre técnico del intent (slug)
- created: Timestamp ISO 8601 de creación
- status: Estado actual (draft, in-progress, completed, archived)
- files.intentFile: Nombre del archivo intent (siempre intent.bl)
- bloomVersion: Versión del formato BTIP

### 2.3. Campos Opcionales

- displayName: Nombre legible para humanos
- tags: Array de strings para categorización
- description: Descripción breve del intent
- projectType: Tipo de proyecto detectado (android, ios, web, etc.)
- version: Versión del plugin (free, pro)
- stats: Estadísticas de uso

### 2.4. Estados del Intent

    draft: Recién creado, no completo
    in-progress: Siendo trabajado activamente
    completed: Finalizado exitosamente
    archived: Completado y archivado para referencia

Transiciones válidas:

    draft → in-progress → completed → archived
    draft → archived (cancelado)
    in-progress → archived (cancelado)
    completed → in-progress (reabrir)

---

## 3. TreeView: Interfaz Principal

### 3.1. Ubicación y Activación

El TreeView se activa mediante:

- Command Palette: Bloom: Show Intents
- Activity Bar: Ícono de Bloom (flor 🌸)
- Atajo de teclado: Ctrl+Shift+B (configurable)

### 3.2. Estructura Jerárquica

    🌸 BLOOM INTENTS
    ├── 📂 In Progress (3)
    │   ├── 📄 auth-feature
    │   │   ├── 🔷 Open Intent
    │   │   ├── ✏️ Edit Intent
    │   │   ├── 📋 Copy Context
    │   │   ├── 📊 View Stats
    │   │   ├── 🏷️ Edit Tags
    │   │   ├── 📁 Open Folder
    │   │   ├── 🔄 Duplicate
    │   │   ├── ✅ Mark Completed
    │   │   └── 🗑️ Delete
    │   ├── 📄 payment-module
    │   └── 📄 notification-system
    ├── 📂 Completed (5)
    │   ├── 📄 user-profile
    │   └── 📄 login-screen
    ├── 📂 Archived (12)
    │   └── 📄 legacy-refactor
    └── ➕ New Intent

### 3.3. Íconos por Tipo de Proyecto

    📱 Android
    🍎 iOS
    🌐 Web
    ⚛️ React
    📄 Genérico

Detección automática basada en projectType en metadata.

### 3.4. Badges y Decoradores

    📄 auth-feature (5 archivos) 🏷️ security
    📄 payment-module (12 archivos) 🏷️ backend, critical
    📄 old-feature (archived 30 días atrás)

---

## 4. Búsqueda Piramidal de Contexto

### 4.1. Concepto

La búsqueda piramidal permite que un intent en un proyecto hijo herede automáticamente el contexto de proyectos padres, creando una biblioteca de contexto compartido.

Ejemplo de jerarquía:

    /mi-startup/
    ├── .bloom/                         # Nivel 1: Contexto global
    │   ├── core/
    │   │   ├── .rules.bl
    │   │   └── .standards.bl
    │   └── project/
    │       └── .context.bl             # "Este directorio tiene 3 proyectos"
    │
    ├── backend-api/
    │   └── .bloom/                     # Nivel 2: Contexto del proyecto API
    │       └── project/
    │           └── .context.bl         # "Soy la API REST"
    │
    └── mobile-app/
        └── .bloom/                     # Nivel 2: Contexto del proyecto móvil
            └── project/
                └── .context.bl         # "Consumo la API en localhost:3000"

Cuando se crea un intent en mobile-app/, el contexto final incluye:

1. /mi-startup/.bloom/core/.rules.bl
2. /mi-startup/.bloom/core/.standards.bl
3. /mi-startup/.bloom/project/.context.bl
4. /mi-startup/mobile-app/.bloom/project/.context.bl

### 4.2. Algoritmo de Búsqueda

    function gatherPyramidalContext(projectRoot: string): ContextLayer[] {
        const layers: ContextLayer[] = [];
        let currentDir = projectRoot;
        const visitedDirs = new Set<string>();
        
        // Subir en el árbol de directorios hasta encontrar .bloom padre
        while (currentDir !== path.parse(currentDir).root) {
            if (visitedDirs.has(currentDir)) break;
            visitedDirs.add(currentDir);
            
            const bloomDir = path.join(currentDir, '.bloom');
            
            if (fs.existsSync(bloomDir)) {
                // Capa 1: Core (solo del padre más alto)
                if (layers.length === 0) {
                    const coreLayer = readCoreFiles(bloomDir);
                    if (coreLayer) layers.push(coreLayer);
                }
                
                // Capa 2: Project context (de todos los niveles)
                const projectLayer = readProjectContext(bloomDir);
                if (projectLayer) layers.push(projectLayer);
            }
            
            currentDir = path.dirname(currentDir);
        }
        
        // Invertir para que el contexto global esté primero
        return layers.reverse();
    }
    
    function readCoreFiles(bloomDir: string): ContextLayer | null {
        const coreDir = path.join(bloomDir, 'core');
        if (!fs.existsSync(coreDir)) return null;
        
        const files: ContextFile[] = [];
        
        const rulesFile = path.join(coreDir, '.rules.bl');
        if (fs.existsSync(rulesFile)) {
            files.push({
                path: rulesFile,
                content: fs.readFileSync(rulesFile, 'utf8'),
                type: 'rules'
            });
        }
        
        const standardsFile = path.join(coreDir, '.standards.bl');
        if (fs.existsSync(standardsFile)) {
            files.push({
                path: standardsFile,
                content: fs.readFileSync(standardsFile, 'utf8'),
                type: 'standards'
            });
        }
        
        return files.length > 0 ? { type: 'core', files } : null;
    }
    
    function readProjectContext(bloomDir: string): ContextLayer | null {
        const contextFile = path.join(bloomDir, 'project', '.context.bl');
        if (!fs.existsSync(contextFile)) return null;
        
        return {
            type: 'project',
            files: [{
                path: contextFile,
                content: fs.readFileSync(contextFile, 'utf8'),
                type: 'context'
            }]
        };
    }

### 4.3. Formato de Contexto Concatenado

Al generar un intent o copiar contexto, se concatena en este orden:

    # CONTEXTO BASE DEL PROYECTO
    
    ## Reglas de Código
    [Contenido de .bloom/core/.rules.bl del nivel más alto]
    
    ---
    
    ## Estándares del Proyecto
    [Contenido de .bloom/core/.standards.bl del nivel más alto]
    
    ---
    
    ## Contexto Global
    [Contenido de .bloom/project/.context.bl del nivel más alto]
    
    ---
    
    ## Contexto del Proyecto Actual
    [Contenido de .bloom/project/.context.bl del nivel actual]
    
    ---
    
    # INTENT - [Nombre del Intent]
    [Contenido de intent.bl]
    
    ---
    
    # CODEBASE
    [Contenido de codebase.md o referencia a codebase.tar.gz]

---

## 5. Operaciones CRUD

### 5.1. CREATE: Crear Intent

Comando: Bloom: Generate Intent

Flujo detallado:

1. Usuario selecciona archivos en File Explorer
2. Click derecho → Bloom: Generate Intent
3. Plugin valida que hay archivos seleccionados
4. Plugin detecta tipo de proyecto (Android, iOS, Web)
5. Plugin recopila contexto piramidal
6. Se abre IntentFormPanel con:
   - Campos pre-poblados con detección inteligente
   - Lista de archivos seleccionados
   - Botones para insertar nombres de archivo
7. Usuario completa formulario
8. Al enviar:
   - Validar datos
   - Generar UUID para el intent
   - Crear carpeta .bloom/intents/[nombre]/
   - Generar intent.bl
   - Generar codebase.md (versión gratis) o codebase.tar.gz (versión paga)
   - Crear .bloom-meta.json con metadata completa
   - Agregar al TreeView
   - Mostrar notificación de éxito

Validaciones:

- Nombre no vacío, sin caracteres especiales
- No existe carpeta con ese nombre
- Campos obligatorios completos
- Al menos 1 archivo seleccionado

Código de referencia:

    async function createIntent(data: IntentFormData, files: vscode.Uri[]): Promise<void> {
        // 1. Validar
        const validator = new Validator();
        const errors = validator.validateIntentForm(data, workspaceFolder);
        if (errors.length > 0) throw new ValidationError(errors);
        
        // 2. Generar UUID
        const intentId = uuidv4();
        
        // 3. Crear carpeta
        const intentFolder = vscode.Uri.joinPath(
            workspaceFolder.uri,
            '.bloom',
            'intents',
            data.name
        );
        await vscode.workspace.fs.createDirectory(intentFolder);
        
        // 4. Recopilar contexto piramidal
        const context = await gatherPyramidalContext(workspaceFolder.uri.fsPath);
        
        // 5. Generar intent.bl
        const intentContent = buildIntentContent(data, context, files);
        const intentPath = vscode.Uri.joinPath(intentFolder, 'intent.bl');
        await writeFile(intentPath, intentContent);
        
        // 6. Generar codebase
        const codebaseFile = config.get('version') === 'free' 
            ? 'codebase.md' 
            : 'codebase.tar.gz';
        
        if (codebaseFile === 'codebase.md') {
            await generateCodebaseMarkdown(files, intentFolder);
        } else {
            await generateCodebaseTarball(files, intentFolder);
        }
        
        // 7. Crear metadata
        const metadata: IntentMetadata = {
            id: intentId,
            name: data.name,
            displayName: data.name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            status: 'in-progress',
            tags: extractTags(data.problem + data.context),
            description: data.problem.substring(0, 100),
            projectType: detectProjectType(workspaceFolder.uri.fsPath),
            version: config.get('version'),
            files: {
                intentFile: 'intent.bl',
                codebaseFile: codebaseFile,
                filesIncluded: files.map(f => path.relative(workspaceFolder.uri.fsPath, f.fsPath)),
                filesCount: files.length,
                totalSize: await calculateTotalSize(files)
            },
            stats: {
                timesOpened: 0,
                lastOpened: null,
                estimatedTokens: estimateTokens(intentContent)
            },
            bloomVersion: '1.0.0'
        };
        
        const metaPath = vscode.Uri.joinPath(intentFolder, '.bloom-meta.json');
        await writeFile(metaPath, JSON.stringify(metadata, null, 2));
        
        // 8. Refrescar TreeView
        intentTreeProvider.refresh();
        
        // 9. Notificar
        vscode.window.showInformationMessage(
            `✅ Intent '${data.name}' creado exitosamente`
        );
    }

### 5.2. READ: Visualizar Intent

Acción: Open Intent (doble click o menú contextual)

Comportamiento:

1. Abre intent.bl en el editor de VSCode
2. Incrementa stats.timesOpened en metadata
3. Actualiza stats.lastOpened con timestamp actual
4. Guarda metadata actualizada

Código:

    async function openIntent(intent: IntentTreeItem): Promise<void> {
        const intentPath = vscode.Uri.joinPath(
            intent.folderUri,
            'intent.bl'
        );
        
        // Abrir archivo
        const document = await vscode.workspace.openTextDocument(intentPath);
        await vscode.window.showTextDocument(document);
        
        // Actualizar stats
        const metadata = await readMetadata(intent.folderUri);
        metadata.stats.timesOpened += 1;
        metadata.stats.lastOpened = new Date().toISOString();
        await saveMetadata(intent.folderUri, metadata);
        
        // Refrescar TreeView
        intentTreeProvider.refresh();
    }

### 5.3. UPDATE: Editar Intent

Acción: Edit Intent (menú contextual)

Comportamiento:

1. Lee intent.bl y .bloom-meta.json
2. Parsea intent.bl para extraer campos
3. Abre IntentFormPanel con datos pre-poblados
4. Al guardar:
   - Actualiza intent.bl
   - Actualiza metadata.updated
   - Mantiene metadata.created original
   - Preserva codebase existente (no regenera)

Código:

    async function editIntent(intent: IntentTreeItem): Promise<void> {
        // 1. Leer archivos existentes
        const intentPath = vscode.Uri.joinPath(intent.folderUri, 'intent.bl');
        const intentContent = await readFile(intentPath);
        const metadata = await readMetadata(intent.folderUri);
        
        // 2. Parsear intent.bl
        const parsedData = parseIntentFile(intentContent);
        
        // 3. Abrir formulario con datos
        const formPanel = new IntentFormPanel(
            context,
            logger,
            workspaceFolder,
            [], // No files (ya existen)
            []
        );
        
        formPanel.showWithData(parsedData);
        
        // 4. Al guardar, actualizar archivos
        formPanel.onSave(async (newData) => {
            const newIntentContent = buildIntentContent(newData, context, []);
            await writeFile(intentPath, newIntentContent);
            
            metadata.updated = new Date().toISOString();
            metadata.description = newData.problem.substring(0, 100);
            await saveMetadata(intent.folderUri, metadata);
            
            intentTreeProvider.refresh();
            
            vscode.window.showInformationMessage(
                `✅ Intent '${metadata.name}' actualizado`
            );
        });
    }
    
    function parseIntentFile(content: string): IntentFormData {
        const data: Partial<IntentFormData> = {};
        
        // Regex para extraer secciones
        const nameMatch = content.match(/# INTENT - (.+)/);
        if (nameMatch) data.name = nameMatch[1].trim();
        
        const problemMatch = content.match(/## Problema\n([\s\S]+?)\n\n##/);
        if (problemMatch) data.problem = problemMatch[1].trim();
        
        const contextMatch = content.match(/## Contexto\n([\s\S]+?)\n\n##/);
        if (contextMatch) data.context = contextMatch[1].trim();
        
        // Extraer listas numeradas
        const currentBehaviorMatch = content.match(/## Comportamiento Actual\n([\s\S]+?)\n\n##/);
        if (currentBehaviorMatch) {
            data.currentBehavior = currentBehaviorMatch[1]
                .split('\n')
                .filter(line => line.match(/^\d+\./))
                .map(line => line.replace(/^\d+\.\s*/, '').trim());
        }
        
        const desiredBehaviorMatch = content.match(/## Comportamiento Deseado\n([\s\S]+?)\n\n##/);
        if (desiredBehaviorMatch) {
            data.desiredBehavior = desiredBehaviorMatch[1]
                .split('\n')
                .filter(line => line.match(/^\d+\./))
                .map(line => line.replace(/^\d+\.\s*/, '').trim());
        }
        
        return data as IntentFormData;
    }

### 5.4. DELETE: Eliminar Intent

Acción: Delete (menú contextual)

Comportamiento:

1. Muestra confirmación con nombre del intent
2. Si confirma:
   - Elimina carpeta completa .bloom/intents/[nombre]/
   - Remueve del TreeView
   - Muestra notificación

Confirmación:

    ¿Eliminar intent 'auth-feature'?
    Esta acción no se puede deshacer.
    [Eliminar] [Cancelar]

Código:

    async function deleteIntent(intent: IntentTreeItem): Promise<void> {
        const metadata = await readMetadata(intent.folderUri);
        
        const confirm = await vscode.window.showWarningMessage(
            `¿Eliminar intent '${metadata.displayName || metadata.name}'?`,
            { modal: true, detail: 'Esta acción no se puede deshacer.' },
            'Eliminar'
        );
        
        if (confirm !== 'Eliminar') return;
        
        try {
            await vscode.workspace.fs.delete(intent.folderUri, { recursive: true });
            
            intentTreeProvider.refresh();
            
            vscode.window.showInformationMessage(
                `🗑️ Intent '${metadata.name}' eliminado`
            );
        } catch (error) {
            vscode.window.showErrorMessage(
                `Error al eliminar intent: ${error.message}`
            );
        }
    }

### 5.5. Operaciones Adicionales

#### Duplicate: Duplicar Intent

    async function duplicateIntent(intent: IntentTreeItem): Promise<void> {
        const metadata = await readMetadata(intent.folderUri);
        
        // Solicitar nuevo nombre
        const newName = await vscode.window.showInputBox({
            prompt: 'Nombre del intent duplicado',
            value: `${metadata.name}-copy`,
            validateInput: (value) => {
                if (!/^[a-z0-9-]+$/.test(value)) {
                    return 'Solo letras minúsculas, números y guiones';
                }
                return null;
            }
        });
        
        if (!newName) return;
        
        // Copiar carpeta completa
        const newFolder = vscode.Uri.joinPath(
            workspaceFolder.uri,
            '.bloom',
            'intents',
            newName
        );
        
        await copyFolder(intent.folderUri, newFolder);
        
        // Actualizar metadata
        const newMetadata = await readMetadata(newFolder);
        newMetadata.id = uuidv4();
        newMetadata.name = newName;
        newMetadata.created = new Date().toISOString();
        newMetadata.updated = new Date().toISOString();
        await saveMetadata(newFolder, newMetadata);
        
        intentTreeProvider.refresh();
        
        vscode.window.showInformationMessage(
            `✅ Intent duplicado como '${newName}'`
        );
    }

#### Mark Completed: Cambiar Estado

    async function changeStatus(intent: IntentTreeItem, newStatus: IntentStatus): Promise<void> {
        const metadata = await readMetadata(intent.folderUri);
        metadata.status = newStatus;
        metadata.updated = new Date().toISOString();
        await saveMetadata(intent.folderUri, metadata);
        
        intentTreeProvider.refresh();
        
        vscode.window.showInformationMessage(
            `✅ Intent marcado como '${newStatus}'`
        );
    }

#### Edit Tags: Gestionar Tags

    async function editTags(intent: IntentTreeItem): Promise<void> {
        const metadata = await readMetadata(intent.folderUri);
        
        const tagsString = await vscode.window.showInputBox({
            prompt: 'Tags separados por comas',
            value: metadata.tags?.join(', ') || '',
            placeHolder: 'authentication, backend, security'
        });
        
        if (tagsString === undefined) return;
        
        metadata.tags = tagsString
            .split(',')
            .map(t => t.trim().toLowerCase())
            .filter(t => t.length > 0);
        
        metadata.updated = new Date().toISOString();
        await saveMetadata(intent.folderUri, metadata);
        
        intentTreeProvider.refresh();
    }

---

## 6. Funcionalidad Free Mode: Copy Context

### 6.1. Propósito

Para usuarios de la versión gratuita, el comando Copy Context copia al clipboard todo el contexto necesario para pegar manualmente en claude.ai:

1. Contexto piramidal completo
2. Intent.bl
3. Codebase.md

### 6.2. Flujo de Usuario

1. Usuario hace click derecho en intent → Copy Context
2. Plugin recopila todo el contexto
3. Copia al clipboard
4. Muestra notificación con instrucciones
5. Opcionalmente abre claude.ai en el browser

### 6.3. Formato del Contexto Copiado

    # CONTEXTO BASE DEL PROYECTO
    
    ## Reglas de Código
    [Contenido de core/.rules.bl]
    
    ---
    
    ## Estándares
    [Contenido de core/.standards.bl]
    
    ---
    
    ## Contexto Global
    [Contenido de project/.context.bl del nivel superior]
    
    ---
    
    ## Contexto del Proyecto
    [Contenido de project/.context.bl del nivel actual]
    
    ---
    
    # INTENT - [Nombre]
    
    [Contenido completo de intent.bl]
    
    ---
    
    # CODEBASE RELEVANTE
    
    [Contenido completo de codebase.md]
    
    ---
    
    ## INSTRUCCIONES PARA LA IA
    
    - NO escribas guías ni summaries innecesarios
    - Dame SOLO el código completo y funcional
    - NUNCA uses "//rest of your code" o similares
    - Si modificas varios archivos, devuelve TODOS los archivos COMPLETOS
    - Sigue estrictamente las reglas y estándares definidos arriba

### 6.4. Implementación

    async function copyContextToClipboard(intent: IntentTreeItem): Promise<void> {
        try {
            // 1. Recopilar contexto piramidal
            const context = await gatherPyramidalContext(workspaceFolder.uri.fsPath);
            
            // 2. Leer intent.bl
            const intentPath = vscode.Uri.joinPath(intent.folderUri, 'intent.bl');
            const intentContent = await readFile(intentPath);
            
            // 3. Leer codebase.md
            const codebasePath = vscode.Uri.joinPath(intent.folderUri, 'codebase.md');
            const codebaseContent = await readFile(codebasePath);
            
            // 4. Construir contexto completo
            let fullContext = '# CONTEXTO BASE DEL PROYECTO\n\n';
            
            // Agregar core files
            if (context.coreRules) {
                fullContext += '## Reglas de Código\n\n';
                fullContext += context.coreRules;
                fullContext += '\n\n---\n\n';
            }
            
            if (context.coreStandards) {
                fullContext += '## Estándares\n\n';
                fullContext += context.coreStandards;
                fullContext += '\n\n---\n\n';
            }
            
            // Agregar project context
            if (context.globalProjectContext) {
                fullContext += '## Contexto Global\n\n';
                fullContext += context.globalProjectContext;
                fullContext += '\n\n---\n\n';
            }
            
            if (context.localProjectContext) {
                fullContext += '## Contexto del Proyecto\n\n';
                fullContext += context.localProjectContext;
                fullContext += '\n\n---\n\n';
            }
            
            // Agregar intent
            fullContext += intentContent;
            fullContext += '\n\n---\n\n';
            
            // Agregar codebase
            fullContext += '# CODEBASE RELEVANTE\n\n';
            fullContext += codebaseContent;
            fullContext += '\n\n---\n\n';
            
            // Agregar instrucciones
            fullContext += '## INSTRUCCIONES PARA LA IA\n\n';
            fullContext += '- NO escribas guías ni summaries innecesarios\n';
            fullContext += '- Dame SOLO el código completo y funcional\n';
            fullContext += '- NUNCA uses "//rest of your code" o similares\n';
            fullContext += '- Si modificas varios archivos, devuelve TODOS los archivos COMPLETOS\n';
            fullContext += '- Sigue estrictamente las reglas y estándares definidos arriba\n';
            
            // 5. Copiar al clipboard
            await vscode.env.clipboard.writeText(fullContext);
            
            // 6. Calcular estadísticas
            const metadata = await readMetadata(intent.folderUri);
            const tokenCount = estimateTokens(fullContext);
            const charCount = fullContext.length;
            
            // 7. Mostrar notificación con opciones
            const action = await vscode.window.showInformationMessage(
                `📋 Contexto copiado al clipboard\n${charCount.toLocaleString()} caracteres | ~${tokenCount.toLocaleString()} tokens`,
                'Abrir Claude.ai',
                'Ver Instrucciones'
            );
            
            if (action === 'Abrir Claude.ai') {
                await vscode.env.openExternal(vscode.Uri.parse('https://claude.ai/new'));
            } else if (action === 'Ver Instrucciones') {
                await showCopyInstructionsPanel();
            }
            
            // 8. Actualizar stats
            metadata.stats.timesOpened += 1;
            metadata.stats.lastOpened = new Date().toISOString();
            await saveMetadata(intent.folderUri, metadata);
            
            logger.info(`Contexto copiado: ${charCount} chars, ${tokenCount} tokens`);
            
        } catch (error) {
            vscode.window.showErrorMessage(
                `Error al copiar contexto: ${error.message}`
            );
            logger.error('Error en copyContextToClipboard', error);
        }
    }
    
    async function showCopyInstructionsPanel(): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'bloomCopyInstructions',
            'Cómo usar el contexto copiado',
            vscode.ViewColumn.Beside,
            { enableScripts: false }
        );
        
        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        padding: 20px;
                        line-height: 1.6;
                    }
                    h1 { color: var(--vscode-textLink-foreground); }
                    .step {
                        background: var(--vscode-editor-inactiveSelectionBackground);
                        padding: 15px;
                        margin: 15px 0;
                        border-left: 4px solid var(--vscode-textLink-foreground);
                        border-radius: 4px;
                    }
                    .step-number {
                        display: inline-block;
                        background: var(--vscode-textLink-foreground);
                        color: var(--vscode-editor-background);
                        width: 30px;
                        height: 30px;
                        line-height: 30px;
                        text-align: center;
                        border-radius: 50%;
                        margin-right: 10px;
                        font-weight: bold;
                    }
                    code {
                        background: var(--vscode-textCodeBlock-background);
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-family: monospace;
                    }
                    .tip {
                        background: #1E3A1E;
                        border-left-color: #4EC9B0;
                        padding: 15px;
                        margin: 15px 0;
                        border-left: 4px solid #4EC9B0;
                        border-radius: 4px;
                    }
                </style>
            </head>
            <body>
                <h1>🌸 Uso del Contexto en Claude.ai (GRATIS)</h1>
                
                <div class="tip">
                    <strong>💰 COSTO: $0.00</strong><br>
                    Estás usando el plan gratuito de Claude.ai (~50-100 mensajes/día)
                </div>
                
                <div class="step">
                    <span class="step-number">1</span>
                    <strong>Abre Claude.ai</strong><br>
                    Ve a <a href="https://claude.ai/new">https://claude.ai/new</a>
                </div>
                
                <div class="step">
                    <span class="step-number">2</span>
                    <strong>Pega el contexto</strong><br>
                    Presiona <code>Ctrl+V</code> (o <code>Cmd+V</code> en Mac) en el cuadro de mensaje
                </div>
                
                <div class="step">
                    <span class="step-number">3</span>
                    <strong>Envía el mensaje</strong><br>
                    Presiona Enter o click en el botón de enviar
                </div>
                
                <div class="step">
                    <span class="step-number">4</span>
                    <strong>Espera la respuesta</strong><br>
                    Claude analizará todo el contexto y generará la solución completa
                </div>
                
                <div class="step">
                    <span class="step-number">5</span>
                    <strong>Copia el código</strong><br>
                    Usa los botones "Copy" en cada bloque de código que Claude genere
                </div>
                
                <h2>💡 Tips para Mejores Resultados</h2>
                <ul>
                    <li><strong>Primera respuesta es la mejor:</strong> Claude rinde mejor en el primer mensaje</li>
                    <li><strong>Sé específico:</strong> Si algo no está claro, pide aclaraciones concretas</li>
                    <li><strong>Pide parar:</strong> Si Claude escribe demasiado, di "Para, dame solo el código"</li>
                    <li><strong>Archivos completos:</strong> Siempre pide archivos completos, no fragmentos</li>
                </ul>
                
                <h2>⚠️ Evita Perder Tokens</h2>
                <ul>
                    <li>No pidas guías ni explicaciones largas</li>
                    <li>No pidas summaries ni documentación extra</li>
                    <li>Si Claude no entiende, crea un nuevo intent con mejor contexto</li>
                </ul>
                
                <div class="tip">
                    <strong>🚀 Cuando tu startup despegue</strong><br>
                    Podrás activar el Modo API para automatización completa desde VSCode
                </div>
            </body>
            </html>
        `;
    }

---

## 7. Búsqueda y Filtrado

### 7.1. Quick Pick de Búsqueda

Comando: Bloom: Search Intents

Atajo: Ctrl+Shift+F (dentro del TreeView)

Funcionalidad:

    [🔍 Buscar intents...]
    
    Resultados:
    ├── 📄 auth-feature (5 archivos) 🏷️ security
    ├── 📄 payment-module (12 archivos) 🏷️ backend
    └── 📄 login-screen (3 archivos) 🏷️ ui

Búsqueda por:

- Nombre del intent
- Tags
- Descripción
- Contenido del intent.bl

Implementación:

    async function searchIntents(): Promise<void> {
        const allIntents = await loadAllIntents();
        
        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = 'Buscar intents por nombre, tags o contenido...';
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;
        
        quickPick.items = allIntents.map(intent => ({
            label: `$(file) ${intent.metadata.displayName || intent.metadata.name}`,
            description: intent.metadata.tags?.join(', ') || '',
            detail: `${intent.metadata.files.filesCount} archivos | ${intent.metadata.status}`,
            intent: intent
        }));
        
        quickPick.onDidChangeSelection(async (items) => {
            if (items.length > 0) {
                await openIntent(items[0].intent);
                quickPick.dispose();
            }
        });
        
        quickPick.show();
    }

### 7.2. Filtros del TreeView

Botones en la toolbar del TreeView:

    [🔍 Search] [🏷️ Filter by Tag] [📊 Sort by...]

Filter by Tag:

    Selecciona tags:
    ☑ authentication (3)
    ☑ backend (5)
    ☐ frontend (2)
    ☐ mobile (4)
    ☐ critical (1)

Sort by:

    - Creación (más reciente primero)
    - Actualización (más reciente primero)
    - Nombre (A-Z)
    - Archivos (más archivos primero)

---

## 8. Estructura de Archivos del Plugin

### 8.1. Nuevos Archivos

    src/
    ├── commands/
    │   ├── openMarkdownPreview.ts         (existente)
    │   ├── generateIntent.ts              (existente - refactorizar)
    │   ├── showIntents.ts                 (nuevo)
    │   ├── editIntent.ts                  (nuevo)
    │   ├── deleteIntent.ts                (nuevo)
    │   ├── duplicateIntent.ts             (nuevo)
    │   ├── changeIntentStatus.ts          (nuevo)
    │   ├── copyContextToClipboard.ts      (nuevo)
    │   └── searchIntents.ts               (nuevo)
    │
    ├── providers/
    │   └── intentTreeProvider.ts          (nuevo - TreeView)
    │
    ├── models/
    │   ├── intent.ts                      (nuevo - interfaces)
    │   └── contextLayer.ts                (nuevo - interfaces)
    │
    ├── core/
    │   ├── filePackager.ts                (existente)
    │   ├── intentGenerator.ts             (existente)
    │   ├── validator.ts                   (existente)
    │   ├── metadataManager.ts             (nuevo)
    │   ├── contextGatherer.ts             (nuevo)
    │   └── tokenEstimator.ts              (nuevo)
    │
    ├── ui/
    │   ├── intentFormPanel.ts             (existente - refactorizar)
    │   ├── markdownPreviewPanel.ts        (existente)
    │   └── copyInstructionsPanel.ts       (nuevo)
    │
    └── utils/
        ├── logger.ts                      (existente)
        └── fileSystem.ts                  (nuevo - helpers)

### 8.2. Interfaces TypeScript

    // models/intent.ts
    
    export interface IntentMetadata {
        id: string;
        name: string;
        displayName?: string;
        created: string;
        updated: string;
        status: IntentStatus;
        tags?: string[];
        description?: string;
        projectType?: ProjectType;
        version: 'free' | 'pro';
        files: {
            intentFile: string;
            codebaseFile: string;
            filesIncluded: string[];
            filesCount: number;
            totalSize: number;
        };
        stats: {
            timesOpened: number;
            lastOpened: string | null;
            estimatedTokens: number;
        };
        bloomVersion: string;
    }
    
    export type IntentStatus = 'draft' | 'in-progress' | 'completed' | 'archived';
    
    export type ProjectType = 'android' | 'ios' | 'web' | 'react' | 'flutter' | 'generic';
    
    export interface Intent {
        metadata: IntentMetadata;
        folderUri: vscode.Uri;
    }
    
    // models/contextLayer.ts
    
    export interface ContextLayer {
        type: 'core' | 'project';
        files: ContextFile[];
    }
    
    export interface ContextFile {
        path: string;
        content: string;
        type: 'rules' | 'standards' | 'context';
    }
    
    export interface PyramidalContext {
        coreRules?: string;
        coreStandards?: string;
        globalProjectContext?: string;
        localProjectContext?: string;
    }

### 8.3. IntentTreeProvider

    // providers/intentTreeProvider.ts
    
    export class IntentTreeProvider implements vscode.TreeDataProvider<IntentTreeItem> {
        private _onDidChangeTreeData = new vscode.EventEmitter<IntentTreeItem | undefined>();
        readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
        
        constructor(
            private workspaceFolder: vscode.WorkspaceFolder,
            private logger: Logger
        ) {}
        
        refresh(): void {
            this._onDidChangeTreeData.fire(undefined);
        }
        
        getTreeItem(element: IntentTreeItem): vscode.TreeItem {
            return element;
        }
        
        async getChildren(element?: IntentTreeItem): Promise<IntentTreeItem[]> {
            if (!element) {
                // Root level: mostrar grupos por estado
                return [
                    new IntentGroupItem('in-progress', 'In Progress', this.workspaceFolder),
                    new IntentGroupItem('completed', 'Completed', this.workspaceFolder),
                    new IntentGroupItem('archived', 'Archived', this.workspaceFolder)
                ];
            }
            
            if (element instanceof IntentGroupItem) {
                // Cargar intents del grupo
                const intents = await this.loadIntentsByStatus(element.status);
                return intents.map(intent => new IntentTreeItem(intent));
            }
            
            return [];
        }
        
        private async loadIntentsByStatus(status: IntentStatus): Promise<Intent[]> {
            const intentsDir = vscode.Uri.joinPath(
                this.workspaceFolder.uri,
                '.bloom',
                'intents'
            );
            
            try {
                const entries = await vscode.workspace.fs.readDirectory(intentsDir);
                const intents: Intent[] = [];
                
                for (const [name, type] of entries) {
                    if (type === vscode.FileType.Directory) {
                        const intentFolder = vscode.Uri.joinPath(intentsDir, name);
                        const metadataPath = vscode.Uri.joinPath(intentFolder, '.bloom-meta.json');
                        
                        try {
                            const metadataContent = await vscode.workspace.fs.readFile(metadataPath);
                            const metadata: IntentMetadata = JSON.parse(
                                new TextDecoder().decode(metadataContent)
                            );
                            
                            if (metadata.status === status) {
                                intents.push({
                                    metadata,
                                    folderUri: intentFolder
                                });
                            }
                        } catch (error) {
                            this.logger.warn(`Error al leer metadata de ${name}`, error);
                        }
                    }
                }
                
                // Ordenar por updated desc
                return intents.sort((a, b) => 
                    new Date(b.metadata.updated).getTime() - 
                    new Date(a.metadata.updated).getTime()
                );
                
            } catch (error) {
                this.logger.error('Error al cargar intents', error);
                return [];
            }
        }
    }
    
    class IntentGroupItem extends vscode.TreeItem {
        constructor(
            public readonly status: IntentStatus,
            label: string,
            private workspaceFolder: vscode.WorkspaceFolder
        ) {
            super(label, vscode.TreeItemCollapsibleState.Expanded);
            this.contextValue = 'intentGroup';
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
    
    class IntentTreeItem extends vscode.TreeItem {
        constructor(public readonly intent: Intent) {
            super(
                intent.metadata.displayName || intent.metadata.name,
                vscode.TreeItemCollapsibleState.None
            );
            
            this.contextValue = 'intent';
            this.tooltip = this.buildTooltip();
            this.description = this.buildDescription();
            this.iconPath = this.getIcon();
            
            // Comando al hacer click
            this.command = {
                command: 'bloom.openIntent',
                title: 'Open Intent',
                arguments: [this]
            };
        }
        
        private buildTooltip(): string {
            const meta = this.intent.metadata;
            return `${meta.displayName || meta.name}
${meta.description || 'Sin descripción'}

Archivos: ${meta.files.filesCount}
Creado: ${new Date(meta.created).toLocaleDateString()}
Actualizado: ${new Date(meta.updated).toLocaleDateString()}
Tags: ${meta.tags?.join(', ') || 'ninguno'}`;
        }
        
        private buildDescription(): string {
            const meta = this.intent.metadata;
            const tags = meta.tags && meta.tags.length > 0 
                ? `🏷️ ${meta.tags.slice(0, 2).join(', ')}` 
                : '';
            return `(${meta.files.filesCount} archivos) ${tags}`;
        }
        
        private getIcon(): vscode.ThemeIcon {
            const projectTypeIcons: Record<ProjectType, string> = {
                'android': 'device-mobile',
                'ios': 'device-mobile',
                'web': 'globe',
                'react': 'symbol-property',
                'flutter': 'layers',
                'generic': 'file'
            };
            
            const iconName = projectTypeIcons[this.intent.metadata.projectType || 'generic'];
            return new vscode.ThemeIcon(iconName);
        }
    }

---

## 9. Comandos del Plugin

### 9.1. Comandos Principales

    bloom.showIntents
        - Muestra el TreeView de intents
        - Atajo: Ctrl+Shift+B
    
    bloom.generateIntent
        - Crea un nuevo intent (existente - refactorizar)
        - Atajo: Ctrl+Shift+I
    
    bloom.searchIntents
        - Búsqueda rápida de intents
        - Atajo: Ctrl+Shift+F (en TreeView)
    
    bloom.openIntent
        - Abre un intent en el editor
        - Trigger: Click en TreeView
    
    bloom.editIntent
        - Edita un intent existente
        - Trigger: Menú contextual
    
    bloom.deleteIntent
        - Elimina un intent
        - Trigger: Menú contextual
    
    bloom.duplicateIntent
        - Duplica un intent
        - Trigger: Menú contextual
    
    bloom.changeIntentStatus
        - Cambia el estado del intent
        - Trigger: Menú contextual
    
    bloom.copyContextToClipboard
        - Copia contexto completo (Free Mode)
        - Trigger: Menú contextual
    
    bloom.editTags
        - Edita tags del intent
        - Trigger: Menú contextual
    
    bloom.viewStats
        - Muestra estadísticas del intent
        - Trigger: Menú contextual
    
    bloom.openFolder
        - Abre carpeta del intent en Explorer
        - Trigger: Menú contextual

### 9.2. Menú Contextual del TreeView

    IntentTreeItem:
        - 📝 Open Intent
        - ✏️ Edit Intent
        - 📋 Copy Context (Free Mode)
        - ---
        - 🔄 Duplicate
        - 🏷️ Edit Tags
        - 📊 View Stats
        - ---
        - ✅ Mark as Completed
        - 📦 Mark as Archived
        - 🔄 Mark as In Progress
        - ---
        - 📁 Open Folder
        - 🗑️ Delete

---

## 10. Configuración

### 10.1. Settings de VSCode

    "bloom.intents.defaultStatus": "in-progress",
    "bloom.intents.autoOpenAfterCreate": true,
    "bloom.intents.sortBy": "updated",
    "bloom.intents.showFileCount": true,
    "bloom.intents.showTags": true,
    "bloom.intents.estimateTokens": true,
    "bloom.context.includeGlobalContext": true,
    "bloom.context.includeProjectContext": true,
    "bloom.freeMode.openClaudeAfterCopy": true

### 10.2. Configuración en package.json

    "contributes": {
        "configuration": {
            "title": "Bloom Intents",
            "properties": {
                "bloom.intents.defaultStatus": {
                    "type": "string",
                    "enum": ["draft", "in-progress", "completed", "archived"],
                    "default": "in-progress",
                    "description": "Estado por defecto al crear intents"
                },
                "bloom.intents.autoOpenAfterCreate": {
                    "type": "boolean",
                    "default": true,
                    "description": "Abrir intent.bl automáticamente después de crear"
                }
            }
        },
        "views": {
            "explorer": [
                {
                    "id": "bloomIntents",
                    "name": "Bloom Intents",
                    "icon": "resources/bloom-icon.svg"
                }
            ]
        },
        "commands": [
            {
                "command": "bloom.showIntents",
                "title": "Bloom: Show Intents",
                "icon": "$(list-tree)"
            },
            {
                "command": "bloom.searchIntents",
                "title": "Bloom: Search Intents",
                "icon": "$(search)"
            },
            {
                "command": "bloom.copyContextToClipboard",
                "title": "Copy Context to Clipboard",
                "icon": "$(clippy)"
            }
        ],
        "menus": {
            "view/title": [
                {
                    "command": "bloom.searchIntents",
                    "when": "view == bloomIntents",
                    "group": "navigation"
                }
            ],
            "view/item/context": [
                {
                    "command": "bloom.openIntent",
                    "when": "view == bloomIntents && viewItem == intent",
                    "group": "1_main@1"
                },
                {
                    "command": "bloom.editIntent",
                    "when": "view == bloomIntents && viewItem == intent",
                    "group": "1_main@2"
                },
                {
                    "command": "bloom.copyContextToClipboard",
                    "when": "view == bloomIntents && viewItem == intent",
                    "group": "1_main@3"
                },
                {
                    "command": "bloom.duplicateIntent",
                    "when": "view == bloomIntents && viewItem == intent",
                    "group": "2_actions@1"
                },
                {
                    "command": "bloom.deleteIntent",
                    "when": "view == bloomIntents && viewItem == intent",
                    "group": "3_danger@1"
                }
            ]
        },
        "keybindings": [
            {
                "command": "bloom.showIntents",
                "key": "ctrl+shift+b",
                "mac": "cmd+shift+b"
            },
            {
                "command": "bloom.generateIntent",
                "key": "ctrl+shift+i",
                "mac": "cmd+shift+i"
            }
        ]
    }

---

## 11. Migración de Intents Existentes

Para intents creados antes de implementar el Intent Manager, el plugin debe detectar y migrar automáticamente.

### 11.1. Detección de Intents Legacy

    async function detectLegacyIntents(): Promise<string[]> {
        const intentsDir = vscode.Uri.joinPath(workspaceFolder.uri, '.bloom', 'intents');
        
        try {
            const entries = await vscode.workspace.fs.readDirectory(intentsDir);
            const legacyIntents: string[] = [];
            
            for (const [name, type] of entries) {
                if (type === vscode.FileType.Directory) {
                    const metadataPath = vscode.Uri.joinPath(intentsDir, name, '.bloom-meta.json');
                    const intentPath = vscode.Uri.joinPath(intentsDir, name, 'intent.bl');
                    
                    const hasIntent = await fileExists(intentPath);
                    const hasMetadata = await fileExists(metadataPath);
                    
                    if (hasIntent && !hasMetadata) {
                        legacyIntents.push(name);
                    }
                }
            }
            
            return legacyIntents;
            
        } catch (error) {
            return [];
        }
    }

### 11.2. Migración Automática

    async function migrateLegacyIntents(): Promise<void> {
        const legacyIntents = await detectLegacyIntents();
        
        if (legacyIntents.length === 0) return;
        
        const migrate = await vscode.window.showInformationMessage(
            `Se encontraron ${legacyIntents.length} intents sin metadata. ¿Migrar ahora?`,
            'Migrar', 'Más tarde'
        );
        
        if (migrate !== 'Migrar') return;
        
        for (const intentName of legacyIntents) {
            try {
                await migrateIntent(intentName);
                logger.info(`Intent migrado: ${intentName}`);
            } catch (error) {
                logger.error(`Error al migrar ${intentName}`, error);
            }
        }
        
        vscode.window.showInformationMessage(
            `✅ ${legacyIntents.length} intents migrados exitosamente`
        );
        
        intentTreeProvider.refresh();
    }
    
    async function migrateIntent(intentName: string): Promise<void> {
        const intentFolder = vscode.Uri.joinPath(
            workspaceFolder.uri,
            '.bloom',
            'intents',
            intentName
        );
        
        // Leer intent.bl para extraer info
        const intentPath = vscode.Uri.joinPath(intentFolder, 'intent.bl');
        const intentContent = await readFile(intentPath);
        
        // Detectar archivos
        const files = await vscode.workspace.fs.readDirectory(intentFolder);
        const codebaseFile = files.some(([name]) => name === 'codebase.tar.gz')
            ? 'codebase.tar.gz'
            : files.some(([name]) => name === 'codebase.md')
            ? 'codebase.md'
            : 'unknown';
        
        // Extraer archivos incluidos del intent.bl
        const filesIncludedMatch = intentContent.match(
            /## Archivos incluidos en codebase\.(tar\.gz|md)\n([\s\S]+?)\n\n##/
        );
        const filesIncluded = filesIncludedMatch
            ? filesIncludedMatch[2].split('\n').map(line => line.replace(/^-\s*/, '').trim())
            : [];
        
        // Crear metadata
        const stat = await vscode.workspace.fs.stat(intentPath);
        const metadata: IntentMetadata = {
            id: uuidv4(),
            name: intentName,
            created: new Date(stat.ctime).toISOString(),
            updated: new Date(stat.mtime).toISOString(),
            status: 'in-progress',
            version: codebaseFile === 'codebase.md' ? 'free' : 'pro',
            files: {
                intentFile: 'intent.bl',
                codebaseFile: codebaseFile,
                filesIncluded: filesIncluded,
                filesCount: filesIncluded.length,
                totalSize: stat.size
            },
            stats: {
                timesOpened: 0,
                lastOpened: null,
                estimatedTokens: estimateTokens(intentContent)
            },
            bloomVersion: '1.0.0'
        };
        
        // Guardar metadata
        const metadataPath = vscode.Uri.joinPath(intentFolder, '.bloom-meta.json');
        await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }

---

## 12. Testing y Validación

### 12.1. Unit Tests

    // tests/metadataManager.test.ts
    
    describe('MetadataManager', () => {
        it('should create valid metadata', async () => {
            const metadata = await createMetadata({
                name: 'test-intent',
                files: [],
                projectType: 'android'
            });
            
            expect(metadata.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
            expect(metadata.name).toBe('test-intent');
            expect(metadata.status).toBe('in-progress');
        });
        
        it('should update metadata without changing id', async () => {
            const original = await createMetadata({ name: 'test' });
            const updated = await updateMetadata(original, { status: 'completed' });
            
            expect(updated.id).toBe(original.id);
            expect(updated.status).toBe('completed');
            expect(new Date(updated.updated).getTime()).toBeGreaterThan(
                new Date(original.updated).getTime()
            );
        });
    });

### 12.2. Integration Tests

    // tests/intentTreeProvider.test.ts
    
    describe('IntentTreeProvider', () => {
        it('should load all intents from workspace', async () => {
            const provider = new IntentTreeProvider(workspaceFolder, logger);
            const children = await provider.getChildren();
            
            expect(children).toHaveLength(3); // 3 grupos
            expect(children[0]).toBeInstanceOf(IntentGroupItem);
        });
        
        it('should filter intents by status', async () => {
            const provider = new IntentTreeProvider(workspaceFolder, logger);
            const inProgress = await provider.getChildren(
                new IntentGroupItem('in-progress', 'In Progress', workspaceFolder)
            );
            
            expect(inProgress.every(item => item.intent.metadata.status === 'in-progress')).toBe(true);
        });
    });

### 12.3. End-to-End Tests

    // tests/e2e/intentWorkflow.test.ts
    
    describe('Intent Workflow E2E', () => {
        it('should complete full lifecycle', async () => {
            // 1. Crear intent
            const intent = await createIntent({
                name: 'e2e-test',
                problem: 'Test problem',
                context: 'Test context',
                currentBehavior: ['Item 1'],
                desiredBehavior: ['Item 1'],
                objective: 'Test objective',
                expectedOutput: 'Test output'
            }, []);
            
            expect(intent.metadata.status).toBe('in-progress');
            
            // 2. Editar intent
            await editIntent(intent, { objective: 'Updated objective' });
            const updated = await loadIntent(intent.metadata.name);
            expect(updated.metadata.objective).toBe('Updated objective');
            
            // 3. Cambiar estado
            await changeStatus(intent, 'completed');
            const completed = await loadIntent(intent.metadata.name);
            expect(completed.metadata.status).toBe('completed');
            
            // 4. Duplicar
            const duplicate = await duplicateIntent(intent, 'e2e-test-copy');
            expect(duplicate.metadata.name).toBe('e2e-test-copy');
            expect(duplicate.metadata.id).not.toBe(intent.metadata.id);
            
            // 5. Eliminar
            await deleteIntent(duplicate);
            const exists = await intentExists('e2e-test-copy');
            expect(exists).toBe(false);
        });
    });

---

## 13. Consideraciones de Performance

### 13.1. Caching de Metadata

Para evitar leer archivos repetidamente:

    class MetadataCache {
        private cache = new Map<string, CachedMetadata>();
        
        async get(intentName: string): Promise<IntentMetadata | null> {
            const cached = this.cache.get(intentName);
            
            if (cached && Date.now() - cached.timestamp < 5000) {
                return cached.metadata;
            }
            
            const metadata = await readMetadata(intentName);
            
            if (metadata) {
                this.cache.set(intentName, {
                    metadata,
                    timestamp: Date.now()
                });
            }
            
            return metadata;
        }
        
        invalidate(intentName: string): void {
            this.cache.delete(intentName);
        }
        
        clear(): void {
            this.cache.clear();
        }
    }
    
    interface CachedMetadata {
        metadata: IntentMetadata;
        timestamp: number;
    }

### 13.2. Lazy Loading del TreeView

Solo cargar intents cuando se expande un grupo:

    async getChildren(element?: IntentTreeItem): Promise<IntentTreeItem[]> {
        if (!element) {
            // Nivel root: solo mostrar grupos (no cargar intents aún)
            const counts = await this.getIntentCountsByStatus();
            
            return [
                new IntentGroupItem('in-progress', `In Progress (${counts['in-progress']})`, this.workspaceFolder),
                new IntentGroupItem('completed', `Completed (${counts['completed']})`, this.workspaceFolder),
                new IntentGroupItem('archived', `Archived (${counts['archived']})`, this.workspaceFolder)
            ];
        }
        
        if (element instanceof IntentGroupItem) {
            // Solo cuando se expande, cargar los intents
            const intents = await this.loadIntentsByStatus(element.status);
            return intents.map(intent => new IntentTreeItem(intent));
        }
        
        return [];
    }

### 13.3. Búsqueda Indexada

Para proyectos con muchos intents:

    class IntentSearchIndex {
        private index = new Map<string, SearchEntry[]>();
        
        async buildIndex(): Promise<void> {
            const allIntents = await loadAllIntents();
            this.index.clear();
            
            for (const intent of allIntents) {
                // Indexar por nombre
                this.addToIndex(intent.metadata.name.toLowerCase(), intent);
                
                // Indexar por tags
                for (const tag of intent.metadata.tags || []) {
                    this.addToIndex(tag.toLowerCase(), intent);
                }
                
                // Indexar por descripción
                if (intent.metadata.description) {
                    const words = intent.metadata.description.toLowerCase().split(/\s+/);
                    for (const word of words) {
                        if (word.length > 3) {
                            this.addToIndex(word, intent);
                        }
                    }
                }
            }
        }
        
        search(query: string): Intent[] {
            const terms = query.toLowerCase().split(/\s+/);
            const results = new Map<string, { intent: Intent, score: number }>();
            
            for (const term of terms) {
                const entries = this.index.get(term) || [];
                
                for (const entry of entries) {
                    const existing = results.get(entry.intent.metadata.id);
                    if (existing) {
                        existing.score += entry.score;
                    } else {
                        results.set(entry.intent.metadata.id, {
                            intent: entry.intent,
                            score: entry.score
                        });
                    }
                }
            }
            
            return Array.from(results.values())
                .sort((a, b) => b.score - a.score)
                .map(r => r.intent);
        }
        
        private addToIndex(key: string, intent: Intent): void {
            if (!this.index.has(key)) {
                this.index.set(key, []);
            }
            
            this.index.get(key)!.push({
                intent,
                score: 1
            });
        }
    }
    
    interface SearchEntry {
        intent: Intent;
        score: number;
    }

---

## 14. Manejo de Errores

### 14.1. Errores Comunes

    Error: No se encontró carpeta .bloom
    Solución: Crear estructura base al activar el plugin
    
    Error: Metadata corrupta o inválida
    Solución: Intentar recuperar desde intent.bl, crear metadata nueva
    
    Error: Intent sin codebase
    Solución: Marcar como corrupto, ofrecer regenerar
    
    Error: Contexto piramidal no encontrado
    Solución: Continuar sin contexto global, usar solo local

### 14.2. Recuperación Automática

    async function safeLoadIntent(intentName: string): Promise<Intent | null> {
        try {
            const metadata = await readMetadata(intentName);
            
            if (!metadata) {
                // Intentar recuperar desde intent.bl
                logger.warn(`Metadata no encontrada para ${intentName}, intentando recuperar`);
                return await recoverIntentFromFiles(intentName);
            }
            
            // Validar metadata
            if (!isValidMetadata(metadata)) {
                logger.warn(`Metadata inválida para ${intentName}, regenerando`);
                return await regenerateMetadata(intentName);
            }
            
            return {
                metadata,
                folderUri: getIntentFolder(intentName)
            };
            
        } catch (error) {
            logger.error(`Error al cargar intent ${intentName}`, error);
            return null;
        }
    }
    
    function isValidMetadata(metadata: any): metadata is IntentMetadata {
        return (
            typeof metadata.id === 'string' &&
            typeof metadata.name === 'string' &&
            typeof metadata.created === 'string' &&
            typeof metadata.status === 'string' &&
            ['draft', 'in-progress', 'completed', 'archived'].includes(metadata.status)
        );
    }

### 14.3. Logs y Debugging

    // Niveles de log
    logger.debug('Detalles técnicos para debugging');
    logger.info('Eventos normales del flujo');
    logger.warn('Situaciones inusuales pero manejables');
    logger.error('Errores que requieren atención', error);
    
    // Output channel
    const outputChannel = vscode.window.createOutputChannel('Bloom Intent Manager');
    outputChannel.appendLine('[INFO] Intent creado: auth-feature');
    outputChannel.appendLine('[WARN] Metadata no encontrada, recuperando...');
    outputChannel.appendLine('[ERROR] Error al copiar contexto: file not found');

---

## 15. Extensibilidad Futura

### 15.1. Hooks para Extensiones

    // Permitir extensiones de terceros
    export interface IntentHook {
        onIntentCreated?(intent: Intent): Promise<void>;
        onIntentUpdated?(intent: Intent): Promise<void>;
        onIntentDeleted?(intentName: string): Promise<void>;
        beforeCopyContext?(context: string): Promise<string>;
    }
    
    class IntentHookRegistry {
        private hooks: IntentHook[] = [];
        
        register(hook: IntentHook): void {
            this.hooks.push(hook);
        }
        
        async triggerCreated(intent: Intent): Promise<void> {
            for (const hook of this.hooks) {
                if (hook.onIntentCreated) {
                    await hook.onIntentCreated(intent);
                }
            }
        }
    }

### 15.2. Custom Intent Templates

    // Permitir templates personalizados
    interface IntentTemplate {
        id: string;
        name: string;
        description: string;
        fields: TemplateField[];
    }
    
    interface TemplateField {
        name: string;
        label: string;
        type: 'text' | 'textarea' | 'list';
        required: boolean;
        default?: string;
    }
    
    // Ejemplo: Template para Bug Fix
    const bugFixTemplate: IntentTemplate = {
        id: 'bug-fix',
        name: 'Bug Fix',
        description: 'Template para reportar y solucionar bugs',
        fields: [
            {
                name: 'bugDescription',
                label: 'Descripción del Bug',
                type: 'textarea',
                required: true
            },
            {
                name: 'stepsToReproduce',
                label: 'Pasos para Reproducir',
                type: 'list',
                required: true
            },
            {
                name: 'expectedBehavior',
                label: 'Comportamiento Esperado',
                type: 'textarea',
                required: true
            }
        ]
    };

### 15.3. Exportación e Importación

    // Exportar intent como bundle portable
    async function exportIntent(intent: Intent): Promise<void> {
        const exportPath = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`${intent.metadata.name}.bloom-intent`),
            filters: {
                'Bloom Intent Bundle': ['bloom-intent']
            }
        });
        
        if (!exportPath) return;
        
        // Crear ZIP con todos los archivos
        const bundle = await createIntentBundle(intent);
        await vscode.workspace.fs.writeFile(exportPath, bundle);
        
        vscode.window.showInformationMessage(
            `✅ Intent exportado a ${exportPath.fsPath}`
        );
    }
    
    // Importar intent desde bundle
    async function importIntent(): Promise<void> {
        const bundlePath = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: {
                'Bloom Intent Bundle': ['bloom-intent']
            }
        });
        
        if (!bundlePath || bundlePath.length === 0) return;
        
        const intent = await extractIntentBundle(bundlePath[0]);
        
        // Validar que no existe
        if (await intentExists(intent.metadata.name)) {
            const newName = await vscode.window.showInputBox({
                prompt: 'El intent ya existe. Ingresa un nuevo nombre:',
                value: `${intent.metadata.name}-imported`
            });
            
            if (!newName) return;
            intent.metadata.name = newName;
        }
        
        // Guardar intent
        await saveIntent(intent);
        intentTreeProvider.refresh();
        
        vscode.window.showInformationMessage(
            `✅ Intent '${intent.metadata.name}' importado exitosamente`
        );
    }

---

## 16. Documentación para Usuarios

### 16.1. Quickstart Guide

Al activar el plugin por primera vez, mostrar guía:

    ┌─────────────────────────────────────────────┐
    │  🌸 Bienvenido a Bloom Intent Manager      │
    ├─────────────────────────────────────────────┤
    │                                             │
    │  Pasos rápidos para empezar:               │
    │                                             │
    │  1. Selecciona archivos en el Explorer     │
    │  2. Click derecho → Bloom: Generate Intent │
    │  3. Completa el formulario                 │
    │  4. Usa "Copy Context" para Claude.ai      │
    │                                             │
    │  [Ver Tutorial Completo]  [No mostrar más] │
    └─────────────────────────────────────────────┘

### 16.2. Tooltips Contextuales

En el formulario de intent:

    Campo "Problema": 
    💡 Describe qué está fallando o qué necesita mejorarse.
       Sé específico: "El login falla con credenciales válidas"
       en lugar de "El login no funciona"
    
    Campo "Comportamiento Actual":
    💡 Lista punto por punto lo que pasa ahora.
       Ejemplo: "1. Usuario ingresa email y password
                 2. Click en Login
                 3. Spinner infinito sin respuesta"

### 16.3. Ejemplos Integrados

Incluir intents de ejemplo en el plugin:

    .bloom/
    └── examples/
        ├── bug-fix-example/
        │   ├── intent.bl
        │   └── codebase.md
        ├── new-feature-example/
        │   ├── intent.bl
        │   └── codebase.md
        └── refactor-example/
            ├── intent.bl
            └── codebase.md

Comando: Bloom: Open Example Intent

---

## 17. Métricas y Analytics (Opcional)

### 17.1. Estadísticas Locales

Panel de estadísticas del workspace:

    📊 Bloom Intent Statistics
    
    Total Intents: 42
    ├── In Progress: 15
    ├── Completed: 20
    └── Archived: 7
    
    Most Used Tags:
    1. authentication (8)
    2. backend (12)
    3. ui (7)
    
    Total Context Copies: 156
    Avg. Intent Size: 8,500 tokens
    Estimated Total Cost (if API): $12.50

### 17.2. Intent Health Check

Validar integridad de todos los intents:

    async function healthCheck(): Promise<HealthReport> {
        const report: HealthReport = {
            total: 0,
            healthy: 0,
            warnings: [],
            errors: []
        };
        
        const allIntents = await loadAllIntents();
        report.total = allIntents.length;
        
        for (const intent of allIntents) {
            // Validar archivos existen
            const intentFileExists = await fileExists(
                vscode.Uri.joinPath(intent.folderUri, 'intent.bl')
            );
            
            const codebaseFileExists = await fileExists(
                vscode.Uri.joinPath(intent.folderUri, intent.metadata.files.codebaseFile)
            );
            
            if (!intentFileExists) {
                report.errors.push(`${intent.metadata.name}: intent.bl faltante`);
                continue;
            }
            
            if (!codebaseFileExists) {
                report.warnings.push(`${intent.metadata.name}: codebase faltante`);
            }
            
            // Validar metadata
            if (!intent.metadata.id || intent.metadata.id.length === 0) {
                report.warnings.push(`${intent.metadata.name}: metadata sin ID`);
            }
            
            if (report.errors.length === 0) {
                report.healthy++;
            }
        }
        
        return report;
    }
    
    interface HealthReport {
        total: number;
        healthy: number;
        warnings: string[];
        errors: string[];
    }

---

## 18. Resultado Esperado

Un sistema completo de gestión de intents que:

1. ✅ Permite visualizar todos los intents en un TreeView jerárquico
2. ✅ Organiza intents por estado (In Progress, Completed, Archived)
3. ✅ Almacena metadata en archivos JSON sin necesidad de SQLite
4. ✅ Implementa búsqueda piramidal de contexto (padre → hijo)
5. ✅ Proporciona operaciones CRUD completas (Create, Read, Update, Delete)
6. ✅ Incluye funcionalidad "Copy Context" para versión gratis
7. ✅ Permite búsqueda y filtrado de intents
8. ✅ Soporta tags y categorización
9. ✅ Registra estadísticas de uso
10. ✅ Es extensible para futuras funcionalidades (API, conversations)
11. ✅ Funciona completamente offline sin dependencias externas
12. ✅ Migra automáticamente intents legacy
13. ✅ Maneja errores de forma robusta con recuperación automática
14. ✅ Incluye caching para performance óptima
15. ✅ Proporciona tooltips y documentación contextual
16. ✅ Es testeable con cobertura completa

---

## 19. Próximos Pasos de Implementación

### Fase 1: Core (Semana 1)

- [ ] Crear interfaces TypeScript (Intent, IntentMetadata, ContextLayer)
- [ ] Implementar MetadataManager (CRUD de .bloom-meta.json)
- [ ] Implementar ContextGatherer (búsqueda piramidal)
- [ ] Unit tests para core components

### Fase 2: TreeView (Semana 2)

- [ ] Crear IntentTreeProvider
- [ ] Implementar IntentTreeItem con íconos y tooltips
- [ ] Registrar TreeView en extension.ts
- [ ] Implementar comandos básicos (Open, Delete)

### Fase 3: CRUD Operations (Semana 3)

- [ ] Refactorizar generateIntent para crear metadata
- [ ] Implementar editIntent con formulario pre-poblado
- [ ] Implementar duplicateIntent
- [ ] Implementar changeIntentStatus
- [ ] Integration tests

### Fase 4: Free Mode (Semana 4)

- [ ] Implementar copyContextToClipboard
- [ ] Crear panel de instrucciones
- [ ] Agregar opción "Open Claude.ai"
- [ ] Testing end-to-end

### Fase 5: Search & Polish (Semana 5)

- [ ] Implementar searchIntents
- [ ] Implementar filtros del TreeView
- [ ] Agregar tooltips y documentación
- [ ] Implementar healthCheck
- [ ] Testing de performance

### Fase 6: Migration & Launch (Semana 6)

- [ ] Implementar migración de intents legacy
- [ ] Documentación completa
- [ ] Tutorial interactivo
- [ ] Release v1.0.0

---

Fin del documento.# BLOOM_BTIP_INTENT_MANAGER.md

## Propósito

Este documento define la especificación técnica completa del Intent Manager para el Bloom VSCode Plugin, describiendo el sistema de gestión de intents mediante TreeView, metadata basada en archivos JSON (sin SQLite), búsqueda piramidal de contexto, y operaciones CRUD completas.

El Intent Manager es el componente central que permite a los desarrolladores crear, organizar, editar y reutilizar intents de forma eficiente dentro del ecosistema Bloom BTIP.

Todos los bloques de código en este documento usan indentación de 4 espacios, sin uso de triple backticks, siguiendo la convención Bloom para compatibilidad con artifacts markdown.

---

## 1. Visión General

### 1.1. Objetivo

El Intent Manager transforma el plugin Bloom de un simple generador de intents en un sistema completo de gestión del ciclo de vida de intenciones técnicas, permitiendo:

- Visualizar todos los intents en una vista jerárquica
- Crear nuevos intents con detección automática de contexto
- Editar intents existentes sin perder historial
- Duplicar intents para reutilización
- Organizar intents por estado (In Progress, Completed, Archived)
- Buscar y filtrar intents por nombre, tags o contenido
- Acceder rápidamente al contexto piramidal completo
- Copiar contexto al clipboard para uso manual (versión gratis)

### 1.2. Arquitectura Base

El Intent Manager opera sobre una arquitectura basada en archivos, sin uso de bases de datos:

    .bloom/
    ├── core/                           # Contexto global compartido
    │   ├── .rules.bl                  # Reglas de código universales
    │   └── .standards.bl              # Estándares del proyecto
    ├── project/
    │   └── .context.bl                # Contexto del proyecto actual
    └── intents/                        # Carpeta de intents
        ├── auth-feature/
        │   ├── .bloom-meta.json       # Metadata del intent
        │   ├── intent.bl              # Definición del intent
        │   └── codebase.md            # Archivos (versión gratis)
        └── payment-module/
            ├── .bloom-meta.json
            ├── intent.bl
            └── codebase.tar.gz        # Archivos (versión paga)

### 1.3. Principios de Diseño

- File-based: Todo se almacena en archivos, no en SQLite
- Stateless: Cada intent es autocontenido y portable
- Piramidal: Herencia automática de contexto padre → hijo
- Auditable: Historial completo visible en archivos
- Extensible: Fácil agregar nuevos campos sin migraciones

---

## 2. Sistema de Metadata

### 2.1. Archivo .bloom-meta.json

Cada intent tiene un archivo de metadata que describe su estado, tags, archivos incluidos y estadísticas.

Ubicación:

    .bloom/intents/[nombre-intent]/.bloom-meta.json

Estructura completa:

    {
      "id": "uuid-v4-generado",
      "name": "auth-feature",
      "displayName": "Authentication Feature",
      "created": "2025-11-15T10:30:00.000Z",
      "updated": "2025-11-15T14:20:00.000Z",
      "status": "in-progress",
      "tags": ["authentication", "security", "backend"],
      "description": "Implementar sistema completo de autenticación JWT",
      "projectType": "android",
      "version": "free",
      "files": {
        "intentFile": "intent.bl",
        "codebaseFile": "codebase.md",
        "filesIncluded": [
          "app/src/main/java/com/example/auth/AuthService.kt",
          "app/src/main/java/com/example/auth/TokenManager.kt"
        ],
        "filesCount": 2,
        "totalSize": 15420
      },
      "stats": {
        "timesOpened": 5,
        "lastOpened": "2025-11-15T14:20:00.000Z",
        "estimatedTokens": 8500
      },
      "bloomVersion": "1.0.0"
    }

### 2.2. Campos Obligatorios

- id: UUID v4 único
- name: Nombre técnico del intent (slug)
- created: Timestamp ISO 8601 de creación
- status: Estado actual (draft, in-progress, completed, archived)
- files.intentFile: Nombre del archivo intent (siempre intent.bl)
- bloomVersion: Versión del formato BTIP

### 2.3. Campos Opcionales

- displayName: Nombre legible para humanos
- tags: Array de strings para categorización
- description: Descripción breve del intent
- projectType: Tipo de proyecto detectado (android, ios, web, etc.)
- version: Versión del plugin (free, pro)
- stats: Estadísticas de uso

### 2.4. Estados del Intent

    draft: Recién creado, no completo
    in-progress: Siendo trabajado activamente
    completed: Finalizado exitosamente
    archived: Completado y archivado para referencia

Transiciones válidas:

    draft → in-progress → completed → archived
    draft → archived (cancelado)
    in-progress → archived (cancelado)
    completed → in-progress (reabrir)

---

## 3. TreeView: Interfaz Principal

### 3.1. Ubicación y Activación

El TreeView se activa mediante:

- Command Palette: Bloom: Show Intents
- Activity Bar: Ícono de Bloom (flor 🌸)
- Atajo de teclado: Ctrl+Shift+B (configurable)

### 3.2. Estructura Jerárquica

    🌸 BLOOM INTENTS
    ├── 📂 In Progress (3)
    │   ├── 📄 auth-feature
    │   │   ├── 🔷 Open Intent
    │   │   ├── ✏️ Edit Intent
    │   │   ├── 📋 Copy Context
    │   │   ├── 📊 View Stats
    │   │   ├── 🏷️ Edit Tags
    │   │   ├── 📁 Open Folder
    │   │   ├── 🔄 Duplicate
    │   │   ├── ✅ Mark Completed
    │   │   └── 🗑️ Delete
    │   ├── 📄 payment-module
    │   └── 📄 notification-system
    ├── 📂 Completed (5)
    │   ├── 📄 user-profile
    │   └── 📄 login-screen
    ├── 📂 Archived (12)
    │   └── 📄 legacy-refactor
    └── ➕ New Intent

### 3.3. Íconos por Tipo de Proyecto

    📱 Android
    🍎 iOS
    🌐 Web
    ⚛️ React
    📄 Genérico

Detección automática basada en projectType en metadata.

### 3.4. Badges y Decoradores

    📄 auth-feature (5 archivos) 🏷️ security
    📄 payment-module (12 archivos) 🏷️ backend, critical
    📄 old-feature (archived 30 días atrás)

---

## 4. Búsqueda Piramidal de Contexto

### 4.1. Concepto

La búsqueda piramidal permite que un intent en un proyecto hijo herede automáticamente el contexto de proyectos padres, creando una biblioteca de contexto compartido.

Ejemplo de jerarquía:

    /mi-startup/
    ├── .bloom/                         # Nivel 1: Contexto global
    │   ├── core/
    │   │   ├── .rules.bl
    │   │   └── .standards.bl
    │   └── project/
    │       └── .context.bl             # "Este directorio tiene 3 proyectos"
    │
    ├── backend-api/
    │   └── .bloom/                     # Nivel 2: Contexto del proyecto API
    │       └── project/
    │           └── .context.bl         # "Soy la API REST"
    │
    └── mobile-app/
        └── .bloom/                     # Nivel 2: Contexto del proyecto móvil
            └── project/
                └── .context.bl         # "Consumo la API en localhost:3000"

Cuando se crea un intent en mobile-app/, el contexto final incluye:

1. /mi-startup/.bloom/core/.rules.bl
2. /mi-startup/.bloom/core/.standards.bl
3. /mi-startup/.bloom/project/.context.bl
4. /mi-startup/mobile-app/.bloom/project/.context.bl

### 4.2. Algoritmo de Búsqueda

    function gatherPyramidalContext(projectRoot: string): ContextLayer[] {
        const layers: ContextLayer[] = [];
        let currentDir = projectRoot;
        const visitedDirs = new Set<string>();
        
        // Subir en el árbol de directorios hasta encontrar .bloom padre
        while (currentDir !== path.parse(currentDir).root) {
            if (visitedDirs.has(currentDir)) break;
            visitedDirs.add(currentDir);
            
            const bloomDir = path.join(currentDir, '.bloom');
            
            if (fs.existsSync(bloomDir)) {
                // Capa 1: Core (solo del padre más alto)
                if (layers.length === 0) {
                    const coreLayer = readCoreFiles(bloomDir);
                    if (coreLayer) layers.push(coreLayer);
                }
                
                // Capa 2: Project context (de todos los niveles)
                const projectLayer = readProjectContext(bloomDir);
                if (projectLayer) layers.push(projectLayer);
            }
            
            currentDir = path.dirname(currentDir);
        }
        
        // Invertir para que el contexto global esté primero
        return layers.reverse();
    }
    
    function readCoreFiles(bloomDir: string): ContextLayer | null {
        const coreDir = path.join(bloomDir, 'core');
        if (!fs.existsSync(coreDir)) return null;
        
        const files: ContextFile[] = [];
        
        const rulesFile = path.join(coreDir, '.rules.bl');
        if (fs.existsSync(rulesFile)) {
            files.push({
                path: rulesFile,
                content: fs.readFileSync(rulesFile, 'utf8'),
                type: 'rules'
            });
        }
        
        const standardsFile = path.join(coreDir, '.standards.bl');
        if (fs.existsSync(standardsFile)) {
            files.push({
                path: standardsFile,
                content: fs.readFileSync(standardsFile, 'utf8'),
                type: 'standards'
            });
        }
        
        return files.length > 0 ? { type: 'core', files } : null;
    }
    
    function readProjectContext(bloomDir: string): ContextLayer | null {
        const contextFile = path.join(bloomDir, 'project', '.context.bl');
        if (!fs.existsSync(contextFile)) return null;
        
        return {
            type: 'project',
            files: [{
                path: contextFile,
                content: fs.readFileSync(contextFile, 'utf8'),
                type: 'context'
            }]
        };
    }

### 4.3. Formato de Contexto Concatenado

Al generar un intent o copiar contexto, se concatena en este orden:

    # CONTEXTO BASE DEL PROYECTO
    
    ## Reglas de Código
    [Contenido de .bloom/core/.rules.bl del nivel más alto]
    
    ---
    
    ## Estándares del Proyecto
    [Contenido de .bloom/core/.standards.bl del nivel más alto]
    
    ---
    
    ## Contexto Global
    [Contenido de .bloom/project/.context.bl del nivel más alto]
    
    ---
    
    ## Contexto del Proyecto Actual
    [Contenido de .bloom/project/.context.bl del nivel actual]
    
    ---
    
    # INTENT - [Nombre del Intent]
    [Contenido de intent.bl]
    
    ---
    
    # CODEBASE
    [Contenido de codebase.md o referencia a codebase.tar.gz]

---

## 5. Operaciones CRUD

### 5.1. CREATE: Crear Intent

Comando: Bloom: Generate Intent

Flujo detallado:

1. Usuario selecciona archivos en File Explorer
2. Click derecho → Bloom: Generate Intent
3. Plugin valida que hay archivos seleccionados
4. Plugin detecta tipo de proyecto (Android, iOS, Web)
5. Plugin recopila contexto piramidal
6. Se abre IntentFormPanel con:
   - Campos pre-poblados con detección inteligente
   - Lista de archivos seleccionados
   - Botones para insertar nombres de archivo
7. Usuario completa formulario
8. Al enviar:
   - Validar datos
   - Generar UUID para el intent
   - Crear carpeta .bloom/intents/[nombre]/
   - Generar intent.bl
   - Generar codebase.md (versión gratis) o codebase.tar.gz (versión paga)
   - Crear .bloom-meta.json con metadata completa
   - Agregar al TreeView
   - Mostrar notificación de éxito

Validaciones:

- Nombre no vacío, sin caracteres especiales
- No existe carpeta con ese nombre
- Campos obligatorios completos
- Al menos 1 archivo seleccionado

Código de referencia:

    async function createIntent(data: IntentFormData, files: vscode.Uri[]): Promise<void> {
        // 1. Validar
        const validator = new Validator();
        const errors = validator.validateIntentForm(data, workspaceFolder);
        if (errors.length > 0) throw new ValidationError(errors);
        
        // 2. Generar UUID
        const intentId = uuidv4();
        
        // 3. Crear carpeta
        const intentFolder = vscode.Uri.joinPath(
            workspaceFolder.uri,
            '.bloom',
            'intents',
            data.name
        );
        await vscode.workspace.fs.createDirectory(intentFolder);
        
        // 4. Recopilar contexto piramidal
        const context = await gatherPyramidalContext(workspaceFolder.uri.fsPath);
        
        // 5. Generar intent.bl
        const intentContent = buildIntentContent(data, context, files);
        const intentPath = vscode.Uri.joinPath(intentFolder, 'intent.bl');
        await writeFile(intentPath, intentContent);
        
        // 6. Generar codebase
        const codebaseFile = config.get('version') === 'free' 
            ? 'codebase.md' 
            : 'codebase.tar.gz';
        
        if (codebaseFile === 'codebase.md') {
            await generateCodebaseMarkdown(files, intentFolder);
        } else {
            await generateCodebaseTarball(files, intentFolder);
        }
        
        // 7. Crear metadata
        const metadata: IntentMetadata = {
            id: intentId,
            name: data.name,
            displayName: data.name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
            status: 'in-progress',
            tags: extractTags(data.problem + data.context),
            description: data.problem.substring(0, 100),
            projectType: detectProjectType(workspaceFolder.uri.fsPath),
            version: config.get('version'),
            files: {
                intentFile: 'intent.bl',
                codebaseFile: codebaseFile,
                filesIncluded: files.map(f => path.relative(workspaceFolder.uri.fsPath, f.fsPath)),
                filesCount: files.length,
                totalSize: await calculateTotalSize(files)
            },
            stats: {
                timesOpened: 0,
                lastOpened: null,
                estimatedTokens: estimateTokens(intentContent)
            },
            bloomVersion: '1.0.0'
        };
        
        const metaPath = vscode.Uri.joinPath(intentFolder, '.bloom-meta.json');
        await writeFile(metaPath, JSON.stringify(metadata, null, 2));
        
        // 8. Refrescar TreeView
        intentTreeProvider.refresh();
        
        // 9. Notificar
        vscode.window.showInformationMessage(
            `✅ Intent '${data.name}' creado exitosamente`
        );
    }

### 5.2. READ: Visualizar Intent

Acción: Open Intent (doble click o menú contextual)

Comportamiento:

1. Abre intent.bl en el editor de VSCode
2. Incrementa stats.timesOpened en metadata
3. Actualiza stats.lastOpened con timestamp actual
4. Guarda metadata actualizada

Código:

    async function openIntent(intent: IntentTreeItem): Promise<void> {
        const intentPath = vscode.Uri.joinPath(
            intent.folderUri,
            'intent.bl'
        );
        
        // Abrir archivo
        const document = await vscode.workspace.openTextDocument(intentPath);
        await vscode.window.showTextDocument(document);
        
        // Actualizar stats
        const metadata = await readMetadata(intent.folderUri);
        metadata.stats.timesOpened += 1;
        metadata.stats.lastOpened = new Date().toISOString();
        await saveMetadata(intent.folderUri, metadata);
        
        // Refrescar TreeView
        intentTreeProvider.refresh();
    }

### 5.3. UPDATE: Editar Intent

Acción: Edit Intent (menú contextual)

Comportamiento:

1. Lee intent.bl y .bloom-meta.json
2. Parsea intent.bl para extraer campos
3. Abre IntentFormPanel con datos pre-poblados
4. Al guardar:
   - Actualiza intent.bl
   - Actualiza metadata.updated
   - Mantiene metadata.created original
   - Preserva codebase existente (no regenera)

Código:

    async function editIntent(intent: IntentTreeItem): Promise<void> {
        // 1. Leer archivos existentes
        const intentPath = vscode.Uri.joinPath(intent.folderUri, 'intent.bl');
        const intentContent = await readFile(intentPath);
        const metadata = await readMetadata(intent.folderUri);
        
        // 2. Parsear intent.bl
        const parsedData = parseIntentFile(intentContent);
        
        // 3. Abrir formulario con datos
        const formPanel = new IntentFormPanel(
            context,
            logger,
            workspaceFolder,
            [], // No files (ya existen)
            []
        );
        
        formPanel.showWithData(parsedData);
        
        // 4. Al guardar, actualizar archivos
        formPanel.onSave(async (newData) => {
            const newIntentContent = buildIntentContent(newData, context, []);
            await writeFile(intentPath, newIntentContent);
            
            metadata.updated = new Date().toISOString();
            metadata.description = newData.problem.substring(0, 100);
            await saveMetadata(intent.folderUri, metadata);
            
            intentTreeProvider.refresh();
            
            vscode.window.showInformationMessage(
                `✅ Intent '${metadata.name}' actualizado`
            );
        });
    }
    
    function parseIntentFile(content: string): IntentFormData {
        const data: Partial<IntentFormData> = {};
        
        // Regex para extraer secciones
        const nameMatch = content.match(/# INTENT - (.+)/);
        if (nameMatch) data.name = nameMatch[1].trim();
        
        const problemMatch = content.match(/## Problema\n([\s\S]+?)\n\n##/);
        if (problemMatch) data.problem = problemMatch[1].trim();
        
        const contextMatch = content.match(/## Contexto\n([\s\S]+?)\n\n##/);
        if (contextMatch) data.context = contextMatch[1].trim();
        
        // Extraer listas numeradas
        const currentBehaviorMatch = content.match(/## Comportamiento Actual\n([\s\S]+?)\n\n##/);
        if (currentBehaviorMatch) {
            data.currentBehavior = currentBehaviorMatch[1]
                .split('\n')
                .filter(line => line.match(/^\d+\./))
                .map(line => line.replace(/^\d+\.\s*/, '').trim());
        }
        
        const desiredBehaviorMatch = content.match(/## Comportamiento Deseado\n([\s\S]+?)\n\n##/);
        if (desiredBehaviorMatch) {
            data.desiredBehavior = desiredBehaviorMatch[1]
                .split('\n')
                .filter(line => line.match(/^\d+\./))
                .map(line => line.replace(/^\d+\.\s*/, '').trim());
        }
        
        return data as IntentFormData;
    }

### 5.4. DELETE: Eliminar Intent

Acción: Delete (menú contextual)

Comportamiento:

1. Muestra confirmación con nombre del intent
2. Si confirma:
   - Elimina carpeta completa .bloom/intents/[nombre]/
   - Remueve del TreeView
   - Muestra notificación

Confirmación:

    ¿Eliminar intent 'auth-feature'?
    Esta acción no se puede deshacer.
    [Eliminar] [Cancelar]

Código:

    async function deleteIntent(intent: IntentTreeItem): Promise<void> {
        const metadata = await readMetadata(intent.folderUri);
        
        const confirm = await vscode.window.showWarningMessage(
            `¿Eliminar intent '${metadata.displayName || metadata.name}'?`,
            { modal: true, detail: 'Esta acción no se puede deshacer.' },
            'Eliminar'
        );
        
        if (confirm !== 'Eliminar') return;
        
        try {
            await vscode.workspace.fs.delete(intent.folderUri, { recursive: true });
            
            intentTreeProvider.refresh();
            
            vscode.window.showInformationMessage(
                `🗑️ Intent '${metadata.name}' eliminado`
            );
        } catch (error) {
            vscode.window.showErrorMessage(
                `Error al eliminar intent: ${error.message}`
            );
        }
    }

### 5.5. Operaciones Adicionales

#### Duplicate: Duplicar Intent

    async function duplicateIntent(intent: IntentTreeItem): Promise<void> {
        const metadata = await readMetadata(intent.folderUri);
        
        // Solicitar nuevo nombre
        const newName = await vscode.window.showInputBox({
            prompt: 'Nombre del intent duplicado',
            value: `${metadata.name}-copy`,
            validateInput: (value) => {
                if (!/^[a-z0-9-]+$/.test(value)) {
                    return 'Solo letras minúsculas, números y guiones';
                }
                return null;
            }
        });
        
        if (!newName) return;
        
        // Copiar carpeta completa
        const newFolder = vscode.Uri.joinPath(
            workspaceFolder.uri,
            '.bloom',
            'intents',
            newName
        );
        
        await copyFolder(intent.folderUri, newFolder);
        
        // Actualizar metadata
        const newMetadata = await readMetadata(newFolder);
        newMetadata.id = uuidv4();
        newMetadata.name = newName;
        newMetadata.created = new Date().toISOString();
        newMetadata.updated = new Date().toISOString();
        await saveMetadata(newFolder, newMetadata);
        
        intentTreeProvider.refresh();
        
        vscode.window.showInformationMessage(
            `✅ Intent duplicado como '${newName}'`
        );
    }

#### Mark Completed: Cambiar Estado

    async function changeStatus(intent: IntentTreeItem, newStatus: IntentStatus): Promise<void> {
        const metadata = await readMetadata(intent.folderUri);
        metadata.status = newStatus;
        metadata.updated = new Date().toISOString();
        await saveMetadata(intent.folderUri, metadata);
        
        intentTreeProvider.refresh();
        
        vscode.window.showInformationMessage(
            `✅ Intent marcado como '${newStatus}'`
        );
    }

#### Edit Tags: Gestionar Tags

    async function editTags(intent: IntentTreeItem): Promise<void> {
        const metadata = await readMetadata(intent.folderUri);
        
        const tagsString = await vscode.window.showInputBox({
            prompt: 'Tags separados por comas',
            value: metadata.tags?.join(', ') || '',
            placeHolder: 'authentication, backend, security'
        });
        
        if (tagsString === undefined) return;
        
        metadata.tags = tagsString
            .split(',')
            .map(t => t.trim().toLowerCase())
            .filter(t => t.length > 0);
        
        metadata.updated = new Date().toISOString();
        await saveMetadata(intent.folderUri, metadata);
        
        intentTreeProvider.refresh();
    }

---

## 6. Funcionalidad Free Mode: Copy Context

### 6.1. Propósito

Para usuarios de la versión gratuita, el comando Copy Context copia al clipboard todo el contexto necesario para pegar manualmente en claude.ai:

1. Contexto piramidal completo
2. Intent.bl
3. Codebase.md

### 6.2. Flujo de Usuario

1. Usuario hace click derecho en intent → Copy Context
2. Plugin recopila todo el contexto
3. Copia al clipboard
4. Muestra notificación con instrucciones
5. Opcionalmente abre claude.ai en el browser

### 6.3. Formato del Contexto Copiado

    # CONTEXTO BASE DEL PROYECTO
    
    ## Reglas de Código
    [Contenido de core/.rules.bl]
    
    ---
    
    ## Estándares
    [Contenido de core/.standards.bl]
    
    ---
    
    ## Contexto Global
    [Contenido de project/.context.bl del nivel superior]
    
    ---
    
    ## Contexto del Proyecto
    [Contenido de project/.context.bl del nivel actual]
    
    ---
    
    # INTENT - [Nombre]
    
    [Contenido completo de intent.bl]
    
    ---
    
    # CODEBASE RELEVANTE
    
    [Contenido completo de codebase.md]
    
    ---
    
    ## INSTRUCCIONES PARA LA IA
    
    - NO escribas guías ni summaries innecesarios
    - Dame SOLO el código completo y funcional
    - NUNCA uses "//rest of your code" o similares
    - Si modificas varios archivos, devuelve TODOS los archivos COMPLETOS
    - Sigue estrictamente las reglas y estándares definidos arriba

### 6.4. Implementación

    async function copyContextToClipboard(intent: IntentTreeItem): Promise<void> {
        try {
            // 1. Recopilar contexto piramidal
            const context = await gatherPyramidalContext(workspaceFolder.uri.fsPath);
            
            // 2. Leer intent.bl
            const intentPath = vscode.Uri.joinPath(intent.folderUri, 'intent.bl');
            const intentContent = await readFile(intentPath);
            
            // 3. Leer codebase.md
            const codebasePath = vscode.Uri.joinPath(intent.folderUri, 'codebase.md');
            const codebaseContent = await readFile(codebasePath);
            
            // 4. Construir contexto completo
            let fullContext = '# CONTEXTO BASE DEL PROYECTO\n\n';
            
            // Agregar core files
            if (context.coreRules) {
                fullContext += '## Reglas de Código\n\n';
                fullContext += context.coreRules;
                fullContext += '\n\n---\n\n';
            }
            
            if (context.coreStandards) {
                fullContext += '## Estándares\n\n';
                fullContext += context.coreStandards;
                fullContext += '\n\n---\n\n';
            }
            
            // Agregar project context
            if (context.globalProjectContext) {
                fullContext += '## Contexto Global\n\n';
                fullContext += context.globalProjectContext;
                fullContext += '\n\n---\n\n';
            }
            
            if (context.localProjectContext) {
                fullContext += '## Contexto del Proyecto\n\n';
                fullContext += context.localProjectContext;
                fullContext += '\n\n---\n\n';
            }
            
            // Agregar intent
            fullContext += intentContent;
            fullContext += '\n\n---\n\n';
            
            // Agregar codebase
            fullContext += '# CODEBASE RELEVANTE\n\n';
            fullContext += codebaseContent;
            fullContext += '\n\n---\n\n';
            
            // Agregar instrucciones
            fullContext += '## INSTRUCCIONES PARA LA IA\n\n';
            fullContext += '- NO escribas guías ni summaries innecesarios\n';
            fullContext += '- Dame SOLO el código completo y funcional\n';
            fullContext += '- NUNCA uses "//rest of your code" o similares\n';
            fullContext += '- Si modificas varios archivos, devuelve TODOS los archivos COMPLETOS\n';
            fullContext += '- Sigue estrictamente las reglas y estándares definidos arriba\n';
            
            // 5. Copiar al clipboard
            await vscode.env.clipboard.writeText(fullContext);
            
            // 6. Calcular estadísticas
            const metadata = await readMetadata(intent.folderUri);
            const tokenCount = estimateTokens(fullContext);
            const charCount = fullContext.length;
            
            // 7. Mostrar notificación con opciones
            const action = await vscode.window.showInformationMessage(
                `📋 Contexto copiado al clipboard\n${charCount.toLocaleString()} caracteres | ~${tokenCount.toLocaleString()} tokens`,
                'Abrir Claude.ai',
                'Ver Instrucciones'
            );
            
            if (action === 'Abrir Claude.ai') {
                await vscode.env.openExternal(vscode.Uri.parse('https://claude.ai/new'));
            } else if (action === 'Ver Instrucciones') {
                await showCopyInstructionsPanel();
            }
            
            // 8. Actualizar stats
            metadata.stats.timesOpened += 1;
            metadata.stats.lastOpened = new Date().toISOString();
            await saveMetadata(intent.folderUri, metadata);
            
            logger.info(`Contexto copiado: ${charCount} chars, ${tokenCount} tokens`);
            
        } catch (error) {
            vscode.window.showErrorMessage(
                `Error al copiar contexto: ${error.message}`
            );
            logger.error('Error en copyContextToClipboard', error);
        }
    }
    
    async function showCopyInstructionsPanel(): Promise<void> {
        const panel = vscode.window.createWebviewPanel(
            'bloomCopyInstructions',
            'Cómo usar el contexto copiado',
            vscode.ViewColumn.Beside,
            { enableScripts: false }
        );
        
        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        padding: 20px;
                        line-height: 1.6;
                    }
                    h1 { color: var(--vscode-textLink-foreground); }
                    .step {
                        background: var(--vscode-editor-inactiveSelectionBackground);
                        padding: 15px;
                        margin: 15px 0;
                        border-left: 4px solid var(--vscode-textLink-foreground);
                        border-radius: 4px;
                    }
                    .step-number {
                        display: inline-block;
                        background: var(--vscode-textLink-foreground);
                        color: var(--vscode-editor-background);
                        width: 30px;
                        height: 30px;
                        line-height: 30px;
                        text-align: center;
                        border-radius: 50%;
                        margin-right: 10px;
                        font-weight: bold;
                    }
                    code {
                        background: var(--vscode-textCodeBlock-background);
                        padding: 2px 6px;
                        border-radius: 3px;
                        font-family: monospace;
                    }
                    .tip {
                        background: #1E3A1E;
                        border-left-color: #4EC9B0;
                        padding: 15px;
                        margin: 15px 0;
                        border-left: 4px solid #4EC9B0;
                        border-radius: 4px;
                    }
                </style>
            </head>
            <body>
                <h1>🌸 Uso del Contexto en Claude.ai (GRATIS)</h1>
                
                <div class="tip">
                    <strong>💰 COSTO: $0.00</strong><br>
                    Estás usando el plan gratuito de Claude.ai (~50-100 mensajes/día)
                </div>
                
                <div class="step">
                    <span class="step-number">1</span>
                    <strong>Abre Claude.ai</strong><br>
                    Ve a <a href="https://claude.ai/new">https://claude.ai/new</a>
                </div>
                
                <div class="step">
                    <span class="step-number">2</span>
                    <strong>Pega el contexto</strong><br>
                    Presiona <code>Ctrl+V</code> (o <code>Cmd+V</code> en Mac) en el cuadro de mensaje
                </div>
                
                <div class="step">
                    <span class="step-number">3</span>
                    <strong>Envía el mensaje</strong><br>
                    Presiona Enter o click en el botón de enviar
                </div>
                
                <div class="step">
                    <span class="step-number">4</span>
                    <strong>Espera la respuesta</strong><br>
                    Claude analizará todo el contexto y generará la solución completa
                </div>
                
                <div class="step">
                    <span class="step-number">5</span>
                    <strong>Copia el código</strong><br>
                    Usa los botones "Copy" en cada bloque de código que Claude genere
                </div>
                
                <h2>💡 Tips para Mejores Resultados</h2>
                <ul>
                    <li><strong>Primera respuesta es la mejor:</strong> Claude rinde mejor en el primer mensaje</li>
                    <li><strong>Sé específico:</strong> Si algo no está claro, pide aclaraciones concretas</li>
                    <li><strong>Pide parar:</strong> Si Claude escribe demasiado, di "Para, dame solo el código"</li>
                    <li><strong>Archivos completos:</strong> Siempre pide archivos completos, no fragmentos</li>
                </ul>
                
                <h2>⚠️ Evita Perder Tokens</h2>
                <ul>
                    <li>No pidas guías ni explicaciones largas</li>
                    <li>No pidas summaries ni documentación extra</li>
                    <li>Si Claude no entiende, crea un nuevo intent con mejor contexto</li>
                </ul>
                
                <div class="tip">
                    <strong>🚀 Cuando tu startup despegue</strong><br>
                    Podrás activar el Modo API para automatización completa desde VSCode
                </div>
            </body>
            </html>
        `;
    }

---

## 7. Búsqueda y Filtrado

### 7.1. Quick Pick de Búsqueda

Comando: Bloom: Search Intents

Atajo: Ctrl+Shift+F (dentro del TreeView)

Funcionalidad:

    [🔍 Buscar intents...]
    
    Resultados:
    ├── 📄 auth-feature (5 archivos) 🏷️ security
    ├── 📄 payment-module (12 archivos) 🏷️ backend
    └── 📄 login-screen (3 archivos) 🏷️ ui

Búsqueda por:

- Nombre del intent
- Tags
- Descripción
- Contenido del intent.bl

Implementación:

    async function searchIntents(): Promise<void> {
        const allIntents = await loadAllIntents();
        
        const quickPick = vscode.window.createQuickPick();
        quickPick.placeholder = 'Buscar intents por nombre, tags o contenido...';
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;
        
        quickPick.items = allIntents.map(intent => ({
            label: `$(file) ${intent.metadata.displayName || intent.metadata.name}`,
            description: intent.metadata.tags?.join(', ') || '',
            detail: `${intent.metadata.files.filesCount} archivos | ${intent.metadata.status}`,
            intent: intent
        }));
        
        quickPick.onDidChangeSelection(async (items) => {
            if (items.length > 0) {
                await openIntent(items[0].intent);
                quickPick.dispose();
            }
        });
        
        quickPick.show();
    }

### 7.2. Filtros del TreeView

Botones en la toolbar del TreeView:

    [🔍 Search] [🏷️ Filter by Tag] [📊 Sort by...]

Filter by Tag:

    Selecciona tags:
    ☑ authentication (3)
    ☑ backend (5)
    ☐ frontend (2)
    ☐ mobile (4)
    ☐ critical (1)

Sort by:

    - Creación (más reciente primero)
    - Actualización (más reciente primero)
    - Nombre (A-Z)
    - Archivos (más archivos primero)

---

## 8. Estructura de Archivos del Plugin

### 8.1. Nuevos Archivos

    src/
    ├── commands/
    │   ├── openMarkdownPreview.ts         (existente)
    │   ├── generateIntent.ts              (existente - refactorizar)
    │   ├── showIntents.ts                 (nuevo)
    │   ├── editIntent.ts                  (nuevo)
    │   ├── deleteIntent.ts                (nuevo)
    │   ├── duplicateIntent.ts             (nuevo)
    │   ├── changeIntentStatus.ts          (nuevo)
    │   ├── copyContextToClipboard.ts      (nuevo)
    │   └── searchIntents.ts               (nuevo)
    │
    ├── providers/
    │   └── intentTreeProvider.ts          (nuevo - TreeView)
    │
    ├── models/
    │   ├── intent.ts                      (nuevo - interfaces)
    │   └── contextLayer.ts                (nuevo - interfaces)
    │
    ├── core/
    │   ├── filePackager.ts                (existente)
    │   ├── intentGenerator.ts             (existente)
    │   ├── validator.ts                   (existente)
    │   ├── metadataManager.ts             (nuevo)
    │   ├── contextGatherer.ts             (nuevo)
    │   └── tokenEstimator.ts              (nuevo)
    │
    ├── ui/
    │   ├── intentFormPanel.ts             (existente - refactorizar)
    │   ├── markdownPreviewPanel.ts        (existente)
    │   └── copyInstructionsPanel.ts       (nuevo)
    │
    └── utils/
        ├── logger.ts                      (existente)
        └── fileSystem.ts                  (nuevo - helpers)

### 8.2. Interfaces TypeScript

    // models/intent.ts
    
    export interface IntentMetadata {
        id: string;
        name: string;
        displayName?: string;
        created: string;
        updated: string;
        status: IntentStatus;
        tags?: string[];
        description?: string;
        projectType?: ProjectType;
        version: 'free' | 'pro';
        files: {
            intentFile: string;
            codebaseFile: string;
            filesIncluded: string[];
            filesCount: number;
            totalSize: number;
        };
        stats: {
            timesOpened: number;
            lastOpened: string | null;
            estimatedTokens: number;
        };
        bloomVersion: string;
    }
    
    export type IntentStatus = 'draft' | 'in-progress' | 'completed' | 'archived';
    
    export type ProjectType = 'android' | 'ios' | 'web' | 'react' | 'flutter' | 'generic';
    
    export interface Intent {
        metadata: IntentMetadata;
        folderUri: vscode.Uri;
    }
    
    // models/contextLayer.ts
    
    export interface ContextLayer {
        type: 'core' | 'project';
        files: ContextFile[];
    }
    
    export interface ContextFile {
        path: string;
        content: string;
        type: 'rules' | 'standards' | 'context';
    }
    
    export interface PyramidalContext {
        coreRules?: string;
        coreStandards?: string;
        globalProjectContext?: string;
        localProjectContext?: string;
    }

### 8.3. IntentTreeProvider

    // providers/intentTreeProvider.ts
    
    export class IntentTreeProvider implements vscode.TreeDataProvider<IntentTreeItem> {
        private _onDidChangeTreeData = new vscode.EventEmitter<IntentTreeItem | undefined>();
        readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
        
        constructor(
            private workspaceFolder: vscode.WorkspaceFolder,
            private logger: Logger
        ) {}
        
        refresh(): void {
            this._onDidChangeTreeData.fire(undefined);
        }
        
        getTreeItem(element: IntentTreeItem): vscode.TreeItem {
            return element;
        }
        
        async getChildren(element?: IntentTreeItem): Promise<IntentTreeItem[]> {
            if (!element) {
                // Root level: mostrar grupos por estado
                return [
                    new IntentGroupItem('in-progress', 'In Progress', this.workspaceFolder),
                    new IntentGroupItem('completed', 'Completed', this.workspaceFolder),
                    new IntentGroupItem('archived', 'Archived', this.workspaceFolder)
                ];
            }
            
            if (element instanceof IntentGroupItem) {
                // Cargar intents del grupo
                const intents = await this.loadIntentsByStatus(element.status);
                return intents.map(intent => new IntentTreeItem(intent));
            }
            
            return [];
        }
        
        private async loadIntentsByStatus(status: IntentStatus): Promise<Intent[]> {
            const intentsDir = vscode.Uri.joinPath(
                this.workspaceFolder.uri,
                '.bloom',
                'intents'
            );
            
            try {
                const entries = await vscode.workspace.fs.readDirectory(intentsDir);
                const intents: Intent[] = [];
                
                for (const [name, type] of entries) {
                    if (type === vscode.FileType.Directory) {
                        const intentFolder = vscode.Uri.joinPath(intentsDir, name);
                        const metadataPath = vscode.Uri.joinPath(intentFolder, '.bloom-meta.json');
                        
                        try {
                            const metadataContent = await vscode.workspace.fs.readFile(metadataPath);
                            const metadata: IntentMetadata = JSON.parse(
                                new TextDecoder().decode(metadataContent)
                            );
                            
                            if (metadata.status === status) {
                                intents.push({
                                    metadata,
                                    folderUri: intentFolder
                                });
                            }
                        } catch (error) {
                            this.logger.warn(`Error al leer metadata de ${name}`, error);
                        }
                    }
                }
                
                // Ordenar por updated desc
                return intents.sort((a, b) => 
                    new Date(b.metadata.updated).getTime() - 
                    new Date(a.metadata.updated).getTime()
                );
                
            } catch (error) {
                this.logger.error('Error al cargar intents', error);
                return [];
            }
        }
    }
    
    class IntentGroupItem extends vscode.TreeItem {
        constructor(
            public readonly status: IntentStatus,
            label: string,
            private workspaceFolder: vscode.WorkspaceFolder
        ) {
            super(label, vscode.TreeItemCollapsibleState.Expanded);
            this.contextValue = 'intentGroup';
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
    
    class IntentTreeItem extends vscode.TreeItem {
        constructor(public readonly intent: Intent) {
            super(
                intent.metadata.displayName || intent.metadata.name,
                vscode.TreeItemCollapsibleState.None
            );
            
            this.contextValue = 'intent';
            this.tooltip = this.buildTooltip();
            this.description = this.buildDescription();
            this.iconPath = this.getIcon();
            
            // Comando al hacer click
            this.command = {
                command: 'bloom.openIntent',
                title: 'Open Intent',
                arguments: [this]
            };
        }
        
        private buildTooltip(): string {
            const meta = this.intent.metadata;
            return `${meta.displayName || meta.name}
${meta.description || 'Sin descripción'}

Archivos: ${meta.files.filesCount}
Creado: ${new Date(meta.created).toLocaleDateString()}
Actualizado: ${new Date(meta.updated).toLocaleDateString()}
Tags: ${meta.tags?.join(', ') || 'ninguno'}`;
        }
        
        private buildDescription(): string {
            const meta = this.intent.metadata;
            const tags = meta.tags && meta.tags.length > 0 
                ? `🏷️ ${meta.tags.slice(0, 2).join(', ')}` 
                : '';
            return `(${meta.files.filesCount} archivos) ${tags}`;
        }
        
        private getIcon(): vscode.ThemeIcon {
            const projectTypeIcons: Record<ProjectType, string> = {
                'android': 'device-mobile',
                'ios': 'device-mobile',
                'web': 'globe',
                'react': 'symbol-property',
                'flutter': 'layers',
                'generic': 'file'
            };
            
            const iconName = projectTypeIcons[this.intent.metadata.projectType || 'generic'];
            return new vscode.ThemeIcon(iconName);
        }
    }

---

## 9. Comandos del Plugin

### 9.1. Comandos Principales

    bloom.showIntents
        - Muestra el TreeView de intents
        - Atajo: Ctrl+Shift+B
    
    bloom.generateIntent
        - Crea un nuevo intent (existente - refactorizar)
        - Atajo: Ctrl+Shift+I
    
    bloom.searchIntents
        - Búsqueda rápida de intents
        - Atajo: Ctrl+Shift+F (en TreeView)
    
    bloom.openIntent
        - Abre un intent en el editor
        - Trigger: Click en TreeView
    
    bloom.editIntent
        - Edita un intent existente
        - Trigger: Menú contextual
    
    bloom.deleteIntent
        - Elimina un intent
        - Trigger: Menú contextual
    
    bloom.duplicateIntent
        - Duplica un intent
        - Trigger: Menú contextual
    
    bloom.changeIntentStatus
        - Cambia el estado del intent
        - Trigger: Menú contextual
    
    bloom.copyContextToClipboard
        - Copia contexto completo (Free Mode)
        - Trigger: Menú contextual
    
    bloom.editTags
        - Edita tags del intent
        - Trigger: Menú contextual
    
    bloom.viewStats
        - Muestra estadísticas del intent
        - Trigger: Menú contextual
    
    bloom.openFolder
        - Abre carpeta del intent en Explorer
        - Trigger: Menú contextual

### 9.2. Menú Contextual del TreeView

    IntentTreeItem:
        - 📝 Open Intent
        - ✏️ Edit Intent
        - 📋 Copy Context (Free Mode)
        - ---
        - 🔄 Duplicate
        - 🏷️ Edit Tags
        - 📊 View Stats
        - ---
        - ✅ Mark as Completed
        - 📦 Mark as Archived
        - 🔄 Mark as In Progress
        - ---
        - 📁 Open Folder
        - 🗑️ Delete

---

## 10. Configuración

### 10.1. Settings de VSCode

    "bloom.intents.defaultStatus": "in-progress",
    "bloom.intents.autoOpenAfterCreate": true,
    "bloom.intents.sortBy": "updated",
    "bloom.intents.showFileCount": true,
    "bloom.intents.showTags": true,
    "bloom.intents.estimateTokens": true,
    "bloom.context.includeGlobalContext": true,
    "bloom.context.includeProjectContext": true,
    "bloom.freeMode.openClaudeAfterCopy": true

### 10.2. Configuración en package.json

    "contributes": {
        "configuration": {
            "title": "Bloom Intents",
            "properties": {
                "bloom.intents.defaultStatus": {
                    "type": "string",
                    "enum": ["draft", "in-progress", "completed", "archived"],
                    "default": "in-progress",
                    "description": "Estado por defecto al crear intents"
                },
                "bloom.intents.autoOpenAfterCreate": {
                    "type": "boolean",
                    "default": true,
                    "description": "Abrir intent.bl automáticamente después de crear"
                }
            }
        },
        "views": {
            "explorer": [
                {
                    "id": "bloomIntents",
                    "name": "Bloom Intents",
                    "icon": "resources/bloom-icon.svg"
                }
            ]
        },
        "commands": [
            {
                "command": "bloom.showIntents",
                "title": "Bloom: Show Intents",
                "icon": "$(list-tree)"
            },
            {
                "command": "bloom.searchIntents",
                "title": "Bloom: Search Intents",
                "icon": "$(search)"
            },
            {
                "command": "bloom.copyContextToClipboard",
                "title": "Copy Context to Clipboard",
                "icon": "$(clippy)"
            }
        ],
        "menus": {
            "view/title": [
                {
                    "command": "bloom.searchIntents",
                    "when": "view == bloomIntents",
                    "group": "navigation"
                }
            ],
            "view/item/context": [
                {
                    "command": "bloom.openIntent",
                    "when": "view == bloomIntents && viewItem == intent",
                    "group": "1_main@1"
                },
                {
                    "command": "bloom.editIntent",
                    "when": "view == bloomIntents && viewItem == intent",
                    "group": "1_main@2"
                },
                {
                    "command": "bloom.copyContextToClipboard",
                    "when": "view == bloomIntents && viewItem == intent",
                    "group": "1_main@3"
                },
                {
                    "command": "bloom.duplicateIntent",
                    "when": "view == bloomIntents && viewItem == intent",
                    "group": "2_actions@1"
                },
                {
                    "command": "bloom.deleteIntent",
                    "when": "view == bloomIntents && viewItem == intent",
                    "group": "3_danger@1"
                }
            ]
        },
        "keybindings": [
            {
                "command": "bloom.showIntents",
                "key": "ctrl+shift+b",
                "mac": "cmd+shift+b"
            },
            {
                "command": "bloom.generateIntent",
                "key": "ctrl+shift+i",
                "mac": "cmd+shift+i"
            }
        ]
    }

---

## 11. Migración de Intents Existentes

Para intents creados antes de implementar el Intent Manager, el plugin debe detectar y migrar automáticamente.

### 11.1. Detección de Intents Legacy

    async function detectLegacyIntents(): Promise<string[]> {
        const intentsDir = vscode.Uri.joinPath(workspaceFolder.uri, '.bloom', 'intents');
        
        try {
            const entries = await vscode.workspace.fs.readDirectory(intentsDir);
            const legacyIntents: string[] = [];
            
            for (const [name, type] of entries) {
                if (type === vscode.FileType.Directory) {
                    const metadataPath = vscode.Uri.joinPath(intentsDir, name, '.bloom-meta.json');
                    const intentPath = vscode.Uri.joinPath(intentsDir, name, 'intent.bl');
                    
                    const hasIntent = await fileExists(intentPath);
                    const hasMetadata = await fileExists(metadataPath);
                    
                    if (hasIntent && !hasMetadata) {
                        legacyIntents.push(name);
                    }
                }
            }
            
            return legacyIntents;
            
        } catch (error) {
            return [];
        }
    }

### 11.2. Migración Automática

    async function migrateLegacyIntents(): Promise<void> {
        const legacyIntents = await detectLegacyIntents();
        
        if (legacyIntents.length === 0) return;
        
        const migrate = await vscode.window.showInformationMessage(
            `Se encontraron ${legacyIntents.length} intents sin metadata. ¿Migrar ahora?`,
            'Migrar', 'Más tarde'
        );
        
        if (migrate !== 'Migrar') return;
        
        for (const intentName of legacyIntents) {
            try {
                await migrateIntent(intentName);
                logger.info(`Intent migrado: ${intentName}`);
            } catch (error) {
                logger.error(`Error al migrar ${intentName}`, error);
            }
        }
        
        vscode.window.showInformationMessage(
            `✅ ${legacyIntents.length} intents migrados exitosamente`
        );
        
        intentTreeProvider.refresh();
    }
    
    async function migrateIntent(intentName: string): Promise<void> {
        const intentFolder = vscode.Uri.joinPath(
            workspaceFolder.uri,
            '.bloom',
            'intents',
            intentName
        );
        
        // Leer intent.bl para extraer info
        const intentPath = vscode.Uri.joinPath(intentFolder, 'intent.bl');
        const intentContent = await readFile(intentPath);
        
        // Detectar archivos
        const files = await vscode.workspace.fs.readDirectory(intentFolder);
        const codebaseFile = files.some(([name]) => name === 'codebase.tar.gz')
            ? 'codebase.tar.gz'
            : files.some(([name]) => name === 'codebase.md')
            ? 'codebase.md'
            : 'unknown';
        
        // Extraer archivos incluidos del intent.bl
        const filesIncludedMatch = intentContent.match(
            /## Archivos incluidos en codebase\.(tar\.gz|md)\n([\s\S]+?)\n\n##/
        );
        const filesIncluded = filesIncludedMatch
            ? filesIncludedMatch[2].split('\n').map(line => line.replace(/^-\s*/, '').trim())
            : [];
        
        // Crear metadata
        const stat = await vscode.workspace.fs.stat(intentPath);
        const metadata: IntentMetadata = {
            id: uuidv4(),
            name: intentName,
            created: new Date(stat.ctime).toISOString(),
            updated: new Date(stat.mtime).toISOString(),
            status: 'in-progress',
            version: codebaseFile === 'codebase.md' ? 'free' : 'pro',
            files: {
                intentFile: 'intent.bl',
                codebaseFile: codebaseFile,
                filesIncluded: filesIncluded,
                filesCount: filesIncluded.length,
                totalSize: stat.size
            },
            stats: {
                timesOpened: 0,
                lastOpened: null,
                estimatedTokens: estimateTokens(intentContent)
            },
            bloomVersion: '1.0.0'
        };
        
        // Guardar metadata
        const metadataPath = vscode.Uri.joinPath(intentFolder, '.bloom-meta.json');
        await writeFile(metadataPath, JSON.stringify(metadata, null, 2));
    }

---

## 12. Testing y Validación

### 12.1. Unit Tests

    // tests/metadataManager.test.ts
    
    describe('MetadataManager', () => {
        it('should create valid metadata', async () => {
            const metadata = await createMetadata({
                name: 'test-intent',
                files: [],
                projectType: 'android'
            });
            
            expect(metadata.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
            expect(metadata.name).toBe('test-intent');
            expect(metadata.status).toBe('in-progress');
        });
        
        it('should update metadata without changing id', async () => {
            const original = await createMetadata({ name: 'test' });
            const updated = await updateMetadata(original, { status: 'completed' });
            
            expect(updated.id).toBe(original.id);
            expect(updated.status).toBe('completed');
            expect(new Date(updated.updated).getTime()).toBeGreaterThan(
                new Date(original.updated).getTime()
            );
        });
    });

### 12.2. Integration Tests

    // tests/intentTreeProvider.test.ts
    
    describe('IntentTreeProvider', () => {
        it('should load all intents from workspace', async () => {
            const provider = new IntentTreeProvider(workspaceFolder, logger);
            const children = await provider.getChildren();
            
            expect(children).toHaveLength(3); // 3 grupos
            expect(children[0]).toBeInstanceOf(IntentGroupItem);
        });
        
        it('should filter intents by status', async () => {
            const provider = new IntentTreeProvider(workspaceFolder, logger);
            const inProgress = await provider.getChildren(
                new IntentGroupItem('in-progress', 'In Progress', workspaceFolder)
            );
            
            expect(inProgress.every(item => item.intent.metadata.status === 'in-progress')).toBe(true);
        });
    });

### 12.3. End-to-End Tests

    // tests/e2e/intentWorkflow.test.ts
    
    describe('Intent Workflow E2E', () => {
        it('should complete full lifecycle', async () => {
            // 1. Crear intent
            const intent = await createIntent({
                name: 'e2e-test',
                problem: 'Test problem',
                context: 'Test context',
                currentBehavior: ['Item 1'],
                desiredBehavior: ['Item 1'],
                objective: 'Test objective',
                expectedOutput: 'Test output'
            }, []);
            
            expect(intent.metadata.status).toBe('in-progress');
            
            // 2. Editar intent
            await editIntent(intent, { objective: 'Updated objective' });
            const updated = await loadIntent(intent.metadata.name);
            expect(updated.metadata.objective).toBe('Updated objective');
            
            // 3. Cambiar estado
            await changeStatus(intent, 'completed');
            const completed = await loadIntent(intent.metadata.name);
            expect(completed.metadata.status).toBe('completed');
            
            // 4. Duplicar
            const duplicate = await duplicateIntent(intent, 'e2e-test-copy');
            expect(duplicate.metadata.name).toBe('e2e-test-copy');
            expect(duplicate.metadata.id).not.toBe(intent.metadata.id);
            
            // 5. Eliminar
            await deleteIntent(duplicate);
            const exists = await intentExists('e2e-test-copy');
            expect(exists).toBe(false);
        });
    });

---

## 13. Consideraciones de Performance

### 13.1. Caching de Metadata

Para evitar leer archivos repetidamente:

    class MetadataCache {
        private cache = new Map<string, CachedMetadata>();
        
        async get(intentName: string): Promise<IntentMetadata | null> {
            const cached = this.cache.get(intentName);
            
            if (cached && Date.now() - cached.timestamp < 5000) {
                return cached.metadata;
            }
            
            const metadata = await readMetadata(intentName);
            
            if (metadata) {
                this.cache.set(intentName, {
                    metadata,
                    timestamp: Date.now()
                });
            }
            
            return metadata;
        }
        
        invalidate(intentName: string): void {
            this.cache.delete(intentName);
        }
        
        clear(): void {
            this.cache.clear();
        }
    }
    
    interface CachedMetadata {
        metadata: IntentMetadata;
        timestamp: number;
    }

### 13.2. Lazy Loading del TreeView

Solo cargar intents cuando se expande un grupo:

    async getChildren(element?: IntentTreeItem): Promise<IntentTreeItem[]> {
        if (!element) {
            // Nivel root: solo mostrar grupos (no cargar intents aún)
            const counts = await this.getIntentCountsByStatus();
            
            return [
                new IntentGroupItem('in-progress', `In Progress (${counts['in-progress']})`, this.workspaceFolder),
                new IntentGroupItem('completed', `Completed (${counts['completed']})`, this.workspaceFolder),
                new IntentGroupItem('archived', `Archived (${counts['archived']})`, this.workspaceFolder)
            ];
        }
        
        if (element instanceof IntentGroupItem) {
            // Solo cuando se expande, cargar los intents
            const intents = await this.loadIntentsByStatus(element.status);
            return intents.map(intent => new IntentTreeItem(intent));
        }
        
        return [];
    }

### 13.3. Búsqueda Indexada

Para proyectos con muchos intents:

    class IntentSearchIndex {
        private index = new Map<string, SearchEntry[]>();
        
        async buildIndex(): Promise<void> {
            const allIntents = await loadAllIntents();
            this.index.clear();
            
            for (const intent of allIntents) {
                // Indexar por nombre
                this.addToIndex(intent.metadata.name.toLowerCase(), intent);
                
                // Indexar por tags
                for (const tag of intent.metadata.tags || []) {
                    this.addToIndex(tag.toLowerCase(), intent);
                }
                
                // Indexar por descripción
                if (intent.metadata.description) {
                    const words = intent.metadata.description.toLowerCase().split(/\s+/);
                    for (const word of words) {
                        if (word.length > 3) {
                            this.addToIndex(word, intent);
                        }
                    }
                }
            }
        }
        
        search(query: string): Intent[] {
            const terms = query.toLowerCase().split(/\s+/);
            const results = new Map<string, { intent: Intent, score: number }>();
            
            for (const term of terms) {
                const entries = this.index.get(term) || [];
                
                for (const entry of entries) {
                    const existing = results.get(entry.intent.metadata.id);
                    if (existing) {
                        existing.score += entry.score;
                    } else {
                        results.set(entry.intent.metadata.id, {
                            intent: entry.intent,
                            score: entry.score
                        });
                    }
                }
            }
            
            return Array.from(results.values())
                .sort((a, b) => b.score - a.score)
                .map(r => r.intent);
        }
        
        private addToIndex(key: string, intent: Intent): void {
            if (!this.index.has(key)) {
                this.index.set(key, []);
            }
            
            this.index.get(key)!.push({
                intent,
                score: 1
            });
        }
    }
    
    interface SearchEntry {
        intent: Intent;
        score: number;
    }

---

## 14. Manejo de Errores

### 14.1. Errores Comunes

    Error: No se encontró carpeta .bloom
    Solución: Crear estructura base al activar el plugin
    
    Error: Metadata corrupta o inválida
    Solución: Intentar recuperar desde intent.bl, crear metadata nueva
    
    Error: Intent sin codebase
    Solución: Marcar como corrupto, ofrecer regenerar
    
    Error: Contexto piramidal no encontrado
    Solución: Continuar sin contexto global, usar solo local

### 14.2. Recuperación Automática

    async function safeLoadIntent(intentName: string): Promise<Intent | null> {
        try {
            const metadata = await readMetadata(intentName);
            
            if (!metadata) {
                // Intentar recuperar desde intent.bl
                logger.warn(`Metadata no encontrada para ${intentName}, intentando recuperar`);
                return await recoverIntentFromFiles(intentName);
            }
            
            // Validar metadata
            if (!isValidMetadata(metadata)) {
                logger.warn(`Metadata inválida para ${intentName}, regenerando`);
                return await regenerateMetadata(intentName);
            }
            
            return {
                metadata,
                folderUri: getIntentFolder(intentName)
            };
            
        } catch (error) {
            logger.error(`Error al cargar intent ${intentName}`, error);
            return null;
        }
    }
    
    function isValidMetadata(metadata: any): metadata is IntentMetadata {
        return (
            typeof metadata.id === 'string' &&
            typeof metadata.name === 'string' &&
            typeof metadata.created === 'string' &&
            typeof metadata.status === 'string' &&
            ['draft', 'in-progress', 'completed', 'archived'].includes(metadata.status)
        );
    }

### 14.3. Logs y Debugging

    // Niveles de log
    logger.debug('Detalles técnicos para debugging');
    logger.info('Eventos normales del flujo');
    logger.warn('Situaciones inusuales pero manejables');
    logger.error('Errores que requieren atención', error);
    
    // Output channel
    const outputChannel = vscode.window.createOutputChannel('Bloom Intent Manager');
    outputChannel.appendLine('[INFO] Intent creado: auth-feature');
    outputChannel.appendLine('[WARN] Metadata no encontrada, recuperando...');
    outputChannel.appendLine('[ERROR] Error al copiar contexto: file not found');

---

## 15. Extensibilidad Futura

### 15.1. Hooks para Extensiones

    // Permitir extensiones de terceros
    export interface IntentHook {
        onIntentCreated?(intent: Intent): Promise<void>;
        onIntentUpdated?(intent: Intent): Promise<void>;
        onIntentDeleted?(intentName: string): Promise<void>;
        beforeCopyContext?(context: string): Promise<string>;
    }
    
    class IntentHookRegistry {
        private hooks: IntentHook[] = [];
        
        register(hook: IntentHook): void {
            this.hooks.push(hook);
        }
        
        async triggerCreated(intent: Intent): Promise<void> {
            for (const hook of this.hooks) {
                if (hook.onIntentCreated) {
                    await hook.onIntentCreated(intent);
                }
            }
        }
    }

### 15.2. Custom Intent Templates

    // Permitir templates personalizados
    interface IntentTemplate {
        id: string;
        name: string;
        description: string;
        fields: TemplateField[];
    }
    
    interface TemplateField {
        name: string;
        label: string;
        type: 'text' | 'textarea' | 'list';
        required: boolean;
        default?: string;
    }
    
    // Ejemplo: Template para Bug Fix
    const bugFixTemplate: IntentTemplate = {
        id: 'bug-fix',
        name: 'Bug Fix',
        description: 'Template para reportar y solucionar bugs',
        fields: [
            {
                name: 'bugDescription',
                label: 'Descripción del Bug',
                type: 'textarea',
                required: true
            },
            {
                name: 'stepsToReproduce',
                label: 'Pasos para Reproducir',
                type: 'list',
                required: true
            },
            {
                name: 'expectedBehavior',
                label: 'Comportamiento Esperado',
                type: 'textarea',
                required: true
            }
        ]
    };

### 15.3. Exportación e Importación

    // Exportar intent como bundle portable
    async function exportIntent(intent: Intent): Promise<void> {
        const exportPath = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`${intent.metadata.name}.bloom-intent`),
            filters: {
                'Bloom Intent Bundle': ['bloom-intent']
            }
        });
        
        if (!exportPath) return;
        
        // Crear ZIP con todos los archivos
        const bundle = await createIntentBundle(intent);
        await vscode.workspace.fs.writeFile(exportPath, bundle);
        
        vscode.window.showInformationMessage(
            `✅ Intent exportado a ${exportPath.fsPath}`
        );
    }
    
    // Importar intent desde bundle
    async function importIntent(): Promise<void> {
        const bundlePath = await vscode.window.showOpenDialog({
            canSelectMany: false,
            filters: {
                'Bloom Intent Bundle': ['bloom-intent']
            }
        });
        
        if (!bundlePath || bundlePath.length === 0) return;
        
        const intent = await extractIntentBundle(bundlePath[0]);
        
        // Validar que no existe
        if (await intentExists(intent.metadata.name)) {
            const newName = await vscode.window.showInputBox({
                prompt: 'El intent ya existe. Ingresa un nuevo nombre:',
                value: `${intent.metadata.name}-imported`
            });
            
            if (!newName) return;
            intent.metadata.name = newName;
        }
        
        // Guardar intent
        await saveIntent(intent);
        intentTreeProvider.refresh();
        
        vscode.window.showInformationMessage(
            `✅ Intent '${intent.metadata.name}' importado exitosamente`
        );
    }

---

## 16. Documentación para Usuarios

### 16.1. Quickstart Guide

Al activar el plugin por primera vez, mostrar guía:

    ┌─────────────────────────────────────────────┐
    │  🌸 Bienvenido a Bloom Intent Manager      │
    ├─────────────────────────────────────────────┤
    │                                             │
    │  Pasos rápidos para empezar:               │
    │                                             │
    │  1. Selecciona archivos en el Explorer     │
    │  2. Click derecho → Bloom: Generate Intent │
    │  3. Completa el formulario                 │
    │  4. Usa "Copy Context" para Claude.ai      │
    │                                             │
    │  [Ver Tutorial Completo]  [No mostrar más] │
    └─────────────────────────────────────────────┘

### 16.2. Tooltips Contextuales

En el formulario de intent:

    Campo "Problema": 
    💡 Describe qué está fallando o qué necesita mejorarse.
       Sé específico: "El login falla con credenciales válidas"
       en lugar de "El login no funciona"
    
    Campo "Comportamiento Actual":
    💡 Lista punto por punto lo que pasa ahora.
       Ejemplo: "1. Usuario ingresa email y password
                 2. Click en Login
                 3. Spinner infinito sin respuesta"

### 16.3. Ejemplos Integrados

Incluir intents de ejemplo en el plugin:

    .bloom/
    └── examples/
        ├── bug-fix-example/
        │   ├── intent.bl
        │   └── codebase.md
        ├── new-feature-example/
        │   ├── intent.bl
        │   └── codebase.md
        └── refactor-example/
            ├── intent.bl
            └── codebase.md

Comando: Bloom: Open Example Intent

---

## 17. Métricas y Analytics (Opcional)

### 17.1. Estadísticas Locales

Panel de estadísticas del workspace:

    📊 Bloom Intent Statistics
    
    Total Intents: 42
    ├── In Progress: 15
    ├── Completed: 20
    └── Archived: 7
    
    Most Used Tags:
    1. authentication (8)
    2. backend (12)
    3. ui (7)
    
    Total Context Copies: 156
    Avg. Intent Size: 8,500 tokens
    Estimated Total Cost (if API): $12.50

### 17.2. Intent Health Check

Validar integridad de todos los intents:

    async function healthCheck(): Promise<HealthReport> {
        const report: HealthReport = {
            total: 0,
            healthy: 0,
            warnings: [],
            errors: []
        };
        
        const allIntents = await loadAllIntents();
        report.total = allIntents.length;
        
        for (const intent of allIntents) {
            // Validar archivos existen
            const intentFileExists = await fileExists(
                vscode.Uri.joinPath(intent.folderUri, 'intent.bl')
            );
            
            const codebaseFileExists = await fileExists(
                vscode.Uri.joinPath(intent.folderUri, intent.metadata.files.codebaseFile)
            );
            
            if (!intentFileExists) {
                report.errors.push(`${intent.metadata.name}: intent.bl faltante`);
                continue;
            }
            
            if (!codebaseFileExists) {
                report.warnings.push(`${intent.metadata.name}: codebase faltante`);
            }
            
            // Validar metadata
            if (!intent.metadata.id || intent.metadata.id.length === 0) {
                report.warnings.push(`${intent.metadata.name}: metadata sin ID`);
            }
            
            if (report.errors.length === 0) {
                report.healthy++;
            }
        }
        
        return report;
    }
    
    interface HealthReport {
        total: number;
        healthy: number;
        warnings: string[];
        errors: string[];
    }

---

## 18. Resultado Esperado

Un sistema completo de gestión de intents que:

1. ✅ Permite visualizar todos los intents en un TreeView jerárquico
2. ✅ Organiza intents por estado (In Progress, Completed, Archived)
3. ✅ Almacena metadata en archivos JSON sin necesidad de SQLite
4. ✅ Implementa búsqueda piramidal de contexto (padre → hijo)
5. ✅ Proporciona operaciones CRUD completas (Create, Read, Update, Delete)
6. ✅ Incluye funcionalidad "Copy Context" para versión gratis
7. ✅ Permite búsqueda y filtrado de intents
8. ✅ Soporta tags y categorización
9. ✅ Registra estadísticas de uso
10. ✅ Es extensible para futuras funcionalidades (API, conversations)
11. ✅ Funciona completamente offline sin dependencias externas
12. ✅ Migra automáticamente intents legacy
13. ✅ Maneja errores de forma robusta con recuperación automática
14. ✅ Incluye caching para performance óptima
15. ✅ Proporciona tooltips y documentación contextual
16. ✅ Es testeable con cobertura completa

---

## 19. Próximos Pasos de Implementación

### Fase 1: Core (Semana 1)

- [ ] Crear interfaces TypeScript (Intent, IntentMetadata, ContextLayer)
- [ ] Implementar MetadataManager (CRUD de .bloom-meta.json)
- [ ] Implementar ContextGatherer (búsqueda piramidal)
- [ ] Unit tests para core components

### Fase 2: TreeView (Semana 2)

- [ ] Crear IntentTreeProvider
- [ ] Implementar IntentTreeItem con íconos y tooltips
- [ ] Registrar TreeView en extension.ts
- [ ] Implementar comandos básicos (Open, Delete)

### Fase 3: CRUD Operations (Semana 3)

- [ ] Refactorizar generateIntent para crear metadata
- [ ] Implementar editIntent con formulario pre-poblado
- [ ] Implementar duplicateIntent
- [ ] Implementar changeIntentStatus
- [ ] Integration tests

### Fase 4: Free Mode (Semana 4)

- [ ] Implementar copyContextToClipboard
- [ ] Crear panel de instrucciones
- [ ] Agregar opción "Open Claude.ai"
- [ ] Testing end-to-end

### Fase 5: Search & Polish (Semana 5)

- [ ] Implementar searchIntents
- [ ] Implementar filtros del TreeView
- [ ] Agregar tooltips y documentación
- [ ] Implementar healthCheck
- [ ] Testing de performance

### Fase 6: Migration & Launch (Semana 6)

- [ ] Implementar migración de intents legacy
- [ ] Documentación completa
- [ ] Tutorial interactivo
- [ ] Release v1.0.0

---

Fin del documento.