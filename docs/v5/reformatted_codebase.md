# Codebase Reformateado

## Archivo 1: src/extension.ts (MODIFICAR)

    import * as vscode from 'vscode';
    import { registerOpenMarkdownPreview } from './commands/openMarkdownPreview';
    import { registerGenerateIntent } from './commands/generateIntent';
    import { registerOpenIntent } from './commands/openIntent';
    import { registerCopyContextToClipboard } from './commands/copyContextToClipboard';
    import { registerDeleteIntent } from './commands/deleteIntent';
    import { Logger } from './utils/logger';
    import { MetadataManager } from './core/metadataManager';
    import { ContextGatherer } from './core/contextGatherer';
    import { TokenEstimator } from './core/tokenEstimator';
    import { IntentTreeProvider } from './providers/intentTreeProvider';
    
    export function activate(context: vscode.ExtensionContext) {
        const logger = new Logger();
        logger.info('Bloom plugin v2.0 activado');
        
        const metadataManager = new MetadataManager(logger);
        const contextGatherer = new ContextGatherer(logger);
        const tokenEstimator = new TokenEstimator();
        
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const intentTreeProvider = new IntentTreeProvider(
                workspaceFolder,
                logger,
                metadataManager
            );
            
            vscode.window.registerTreeDataProvider('bloomIntents', intentTreeProvider);
            
            registerOpenIntent(context, logger, metadataManager);
            registerCopyContextToClipboard(context, logger, contextGatherer, tokenEstimator);
            registerDeleteIntent(context, logger, intentTreeProvider);
        }
        
        registerOpenMarkdownPreview(context, logger);
        registerGenerateIntent(context, logger);
        
        logger.info('Todos los comandos registrados exitosamente');
    }
    
    export function deactivate() {}

## Archivo 2: src/commands/generateIntent.ts (MODIFICAR)

    import * as vscode from 'vscode';
    import { IntentFormPanel } from '../ui/intentFormPanel';
    import { Logger } from '../utils/logger';
    import * as path from 'path';
    
    export function registerGenerateIntent(context: vscode.ExtensionContext, logger: Logger): void {
        const disposable = vscode.commands.registerCommand(
            'bloom.generateIntent',
            async (uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
                logger.info('Ejecutando comando: Bloom: Generate Intent');
    
                // Obtener archivos seleccionados
                let files: vscode.Uri[] = [];
    
                if (selectedUris && selectedUris.length > 0) {
                    files = selectedUris;
                } else if (uri) {
                    files = [uri];
                }
    
                // Validar que hay archivos seleccionados
                if (files.length === 0) {
                    vscode.window.showErrorMessage(
                        'Por favor selecciona al menos un archivo antes de generar un intent.'
                    );
                    logger.warn('No hay archivos seleccionados');
                    return;
                }
    
                logger.info(`Archivos seleccionados: ${files.length}`);
                
                // Validar límite de archivos
                if (files.length > 1000) {
                    vscode.window.showErrorMessage(
                        `Has seleccionado ${files.length} archivos. El límite máximo es 1000.`
                    );
                    logger.warn(`Límite de archivos excedido: ${files.length}`);
                    return;
                }
    
                // Obtener workspace folder
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    vscode.window.showErrorMessage('No hay workspace abierto.');
                    logger.error('No hay workspace folder');
                    return;
                }
    
                // Convertir URIs a rutas relativas
                const relativePaths = files.map(file => {
                    return path.relative(workspaceFolder.uri.fsPath, file.fsPath);
                });
    
                logger.info(`Rutas relativas: ${relativePaths.join(', ')}`);
    
                // Abrir formulario de intent
                const formPanel = new IntentFormPanel(
                    context,
                    logger,
                    workspaceFolder,
                    files,
                    relativePaths
                );
    
                formPanel.show();
            }
        );
    
        context.subscriptions.push(disposable);
        logger.info('Comando "bloom.generateIntent" registrado');
    }

## Archivo 3: src/commands/openIntent.ts (MODIFICAR)

    import * as vscode from 'vscode';
    import { Logger } from '../utils/logger';
    import { MetadataManager } from '../core/metadataManager';
    import { IntentTreeItem } from '../providers/intentTreeProvider';
    import { joinPath } from '../utils/uriHelper';
    
    export function registerOpenIntent(
        context: vscode.ExtensionContext,
        logger: Logger,
        metadataManager: MetadataManager
    ): void {
        const disposable = vscode.commands.registerCommand(
            'bloom.openIntent',
            async (treeItem: IntentTreeItem) => {
                logger.info(`Abriendo intent: ${treeItem.intent.metadata.name}`);
                
                const intentPath = joinPath(
                    treeItem.intent.folderUri,
                    'intent.bl'
                );
                
                const document = await vscode.workspace.openTextDocument(intentPath);
                await vscode.window.showTextDocument(document);
                
                await metadataManager.incrementOpens(treeItem.intent.folderUri);
            }
        );
        
        context.subscriptions.push(disposable);
        logger.info('Comando "bloom.openIntent" registrado');
    }

## Archivo 4: src/core/codebaseGenerator.ts (MODIFICAR)

    import * as vscode from 'vscode';
    import { FileDescriptor, CodebaseGeneratorOptions } from '../models/codebaseStrategy';
    import { promises as fs } from 'fs';
    import * as path from 'path';
    
    export class CodebaseGenerator {
        async generate(
            files: FileDescriptor[],
            outputPath: vscode.Uri,
            options: CodebaseGeneratorOptions
        ): Promise<void> {
            if (options.format === 'markdown') {
                await this.generateMarkdown(files, outputPath, options);
            } else {
                await this.generateTarball(files, outputPath, options);
            }
        }
        
        private async generateMarkdown(
            files: FileDescriptor[],
            outputPath: vscode.Uri,
            options: CodebaseGeneratorOptions
        ): Promise<void> {
            let content = this.generateHeader(files, options);
            content += this.generateIndex(files, options);
            content += await this.generateContent(files, options);
            
            await fs.writeFile(outputPath.fsPath, content, 'utf-8');
        }
        
        private generateHeader(
            files: FileDescriptor[],
            options: CodebaseGeneratorOptions
        ): string {
            const timestamp = new Date().toISOString();
            let header = `# Codebase Export\n\n`;
            
            if (options.includeMetadata) {
                header += `**Generated:** ${timestamp}\n`;
                header += `**Total Files:** ${files.length}\n`;
                header += `**Format:** ${options.format}\n\n`;
            }
            
            header += `---\n\n`;
            return header;
        }
        
        private generateIndex(
            files: FileDescriptor[],
            options: CodebaseGeneratorOptions
        ): string {
            if (!options.addTableOfContents) {
                return '';
            }
            
            let index = `## Table of Contents\n\n`;
            
            if (options.categorizeByType) {
                const categorized = this.categorizeFiles(files);
                
                for (const [category, categoryFiles] of Object.entries(categorized)) {
                    index += `### ${category}\n\n`;
                    for (const file of categoryFiles) {
                        const anchor = this.createAnchor(file.relativePath);
                        index += `- [${file.relativePath}](#${anchor})\n`;
                    }
                    index += `\n`;
                }
            } else {
                for (const file of files) {
                    const anchor = this.createAnchor(file.relativePath);
                    index += `- [${file.relativePath}](#${anchor})\n`;
                }
                index += `\n`;
            }
            
            index += `---\n\n`;
            return index;
        }
        
        private async generateContent(
            files: FileDescriptor[],
            options: CodebaseGeneratorOptions
        ): Promise<string> {
            let content = `## Files\n\n`;
            
            for (const file of files) {
                content += await this.generateFileSection(file, options);
            }
            
            return content;
        }
        
        private async generateFileSection(
            file: FileDescriptor,
            options: CodebaseGeneratorOptions
        ): Promise<string> {
            const anchor = this.createAnchor(file.relativePath);
            let section = `### ${file.relativePath} {#${anchor}}\n\n`;
            
            if (options.includeMetadata && file.metadata) {
                section += `**Size:** ${this.formatBytes(file.metadata.size)}\n`;
                section += `**Type:** ${file.metadata.type}\n`;
                if (file.metadata.lastModified) {
                    section += `**Modified:** ${new Date(file.metadata.lastModified).toLocaleString()}\n`;
                }
                section += `\n`;
            }
            
            try {
                const fileContent = await fs.readFile(file.absolutePath, 'utf-8');
                const language = this.getLanguageFromExtension(file.relativePath);
                
                section += `\`\`\`${language}\n`;
                section += fileContent;
                section += `\n\`\`\`\n\n`;
            } catch (error) {
                section += `*Error reading file: ${error}*\n\n`;
            }
            
            section += `---\n\n`;
            return section;
        }
        
        private categorizeFiles(files: FileDescriptor[]): Record<string, FileDescriptor[]> {
            const categories: Record<string, FileDescriptor[]> = {};
            
            for (const file of files) {
                const ext = path.extname(file.relativePath).toLowerCase();
                let category = 'Other';
                
                if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
                    category = 'TypeScript/JavaScript';
                } else if (['.json', '.jsonc'].includes(ext)) {
                    category = 'Configuration';
                } else if (['.md', '.txt'].includes(ext)) {
                    category = 'Documentation';
                } else if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
                    category = 'Styles';
                } else if (['.html', '.htm'].includes(ext)) {
                    category = 'HTML';
                }
                
                if (!categories[category]) {
                    categories[category] = [];
                }
                categories[category].push(file);
            }
            
            return categories;
        }
        
        private createAnchor(filePath: string): string {
            return filePath
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
        }
        
        private getLanguageFromExtension(filePath: string): string {
            const ext = path.extname(filePath).toLowerCase();
            const languageMap: Record<string, string> = {
                '.ts': 'typescript',
                '.tsx': 'tsx',
                '.js': 'javascript',
                '.jsx': 'jsx',
                '.json': 'json',
                '.md': 'markdown',
                '.css': 'css',
                '.scss': 'scss',
                '.html': 'html',
                '.py': 'python',
                '.java': 'java',
            };
            
            return languageMap[ext] || 'text';
        }
        
        private formatBytes(bytes: number): string {
            if (bytes === 0) return '0 Bytes';
            
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        }
        
        private async generateTarball(
            files: FileDescriptor[],
            outputPath: vscode.Uri,
            options: CodebaseGeneratorOptions
        ): Promise<void> {
            throw new Error('Tarball generation not yet implemented');
        }
    }

## Archivo 5: src/core/metadataManager.ts (MODIFICAR)

    // src/core/metadataManager.ts
    
    import * as vscode from 'vscode';
    import { IntentMetadata, Intent } from '../models/intent';
    import { Logger } from '../utils/logger';
    import { v4 as uuidv4 } from 'uuid';
    import { joinPath } from '../utils/uriHelper';
    
    export class MetadataManager {
        constructor(private logger: Logger) {}
    
        /**
         * Crea metadata para un nuevo intent
         */
        async create(
            intentFolder: vscode.Uri,
            options: {
                name: string;
                projectType?: string;
                version: 'free' | 'pro';
                files: vscode.Uri[];
                filesCount: number;
                estimatedTokens?: number;
            }
        ): Promise<IntentMetadata> {
            const now = new Date().toISOString();
            
            const metadata: IntentMetadata = {
                id: uuidv4(),
                name: options.name,
                displayName: this.generateDisplayName(options.name),
                created: now,
                updated: now,
                status: 'in-progress',
                projectType: options.projectType as any,
                version: options.version,
                files: {
                    intentFile: 'intent.bl',
                    codebaseFile: options.version === 'free' ? 'codebase.md' : 'codebase.tar.gz',
                    filesIncluded: options.files.map(f => f.fsPath),
                    filesCount: options.filesCount,
                    totalSize: await this.calculateTotalSize(options.files)
                },
                stats: {
                    timesOpened: 0,
                    lastOpened: null,
                    estimatedTokens: options.estimatedTokens || 0
                },
                bloomVersion: '1.0.0'
            };
    
            await this.save(intentFolder, metadata);
            this.logger.info(`Metadata creada para intent: ${options.name}`);
            
            return metadata;
        }
    
        /**
         * Lee metadata de un intent
         */
        async read(intentFolder: vscode.Uri): Promise<IntentMetadata | null> {
            try {
                const metadataPath = joinPath(intentFolder, '.bloom-meta.json');
                const content = await vscode.workspace.fs.readFile(metadataPath);
                const metadata: IntentMetadata = JSON.parse(new TextDecoder().decode(content));
                
                return metadata;
            } catch (error) {
                this.logger.warn(`Error al leer metadata de ${intentFolder.fsPath}: ${error}`);
                return null;
            }
        }
    
        /**
         * Actualiza metadata existente
         */
        async update(
            intentFolder: vscode.Uri,
            updates: Partial<IntentMetadata>
        ): Promise<IntentMetadata | null> {
            const existing = await this.read(intentFolder);
            if (!existing) return null;
    
            const updated: IntentMetadata = {
                ...existing,
                ...updates,
                updated: new Date().toISOString()
            };
    
            await this.save(intentFolder, updated);
            this.logger.info(`Metadata actualizada para intent: ${existing.name}`);
            
            return updated;
        }
    
        /**
         * Guarda metadata en archivo
         */
        async save(intentFolder: vscode.Uri, metadata: IntentMetadata): Promise<void> {
            const metadataPath = joinPath(intentFolder, '.bloom-meta.json');
            const content = JSON.stringify(metadata, null, 2);
            await vscode.workspace.fs.writeFile(metadataPath, new TextEncoder().encode(content));
        }
    
        /**
         * Incrementa contador de opens
         */
        async incrementOpens(intentFolder: vscode.Uri): Promise<void> {
            const metadata = await this.read(intentFolder);
            if (!metadata) return;
    
            metadata.stats.timesOpened += 1;
            metadata.stats.lastOpened = new Date().toISOString();
    
            await this.save(intentFolder, metadata);
        }
    
        /**
         * Cambia el estado de un intent
         */
        async changeStatus(
            intentFolder: vscode.Uri,
            newStatus: IntentMetadata['status']
        ): Promise<void> {
            await this.update(intentFolder, { status: newStatus });
        }
    
        /**
         * Actualiza tags
         */
        async updateTags(intentFolder: vscode.Uri, tags: string[]): Promise<void> {
            await this.update(intentFolder, { tags });
        }
    
        /**
         * Valida que la metadata sea válida
         */
        isValid(metadata: any): metadata is IntentMetadata {
            return (
                typeof metadata.id === 'string' &&
                typeof metadata.name === 'string' &&
                typeof metadata.created === 'string' &&
                typeof metadata.status === 'string' &&
                ['draft', 'in-progress', 'completed', 'archived'].includes(metadata.status)
            );
        }
    
        // Helpers privados
    
        private generateDisplayName(name: string): string {
            return name
                .replace(/-/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase());
        }
    
        private async calculateTotalSize(files: vscode.Uri[]): Promise<number> {
            let total = 0;
            for (const file of files) {
                try {
                    const stat = await vscode.workspace.fs.stat(file);
                    total += stat.size;
                } catch (error) {
                    this.logger.warn(`Error al calcular tamaño de ${file.fsPath}`);
                }
            }
            return total;
        }
    }

## Archivo 6: src/ui/intentForm.css (MODIFICAR)

    * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
    }
    
    body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-background);
        padding: 20px;
    }
    
    .container {
        display: grid;
        grid-template-columns: 70% 30%;
        gap: 20px;
        height: calc(100vh - 40px);
    }
    
    .form-left {
        overflow-y: auto;
    }
    
    .form-right {
        border-left: 1px solid var(--vscode-panel-border);
        padding-left: 20px;
        overflow-y: auto;
        display: none;
    }
    
    .form-right.visible {
        display: block;
    }
    
    h1 {
        margin-bottom: 24px;
        font-size: 24px;
    }
    
    .form-section {
        margin-bottom: 24px;
    }
    
    label {
        display: block;
        margin-bottom: 8px;
        font-weight: 600;
    }
    
    .required {
        color: var(--vscode-errorForeground);
    }
    
    input[type="text"],
    textarea {
        width: 100%;
        padding: 8px;
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 2px;
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
    }
    
    input[type="text"]:focus,
    textarea:focus {
        outline: 1px solid var(--vscode-focusBorder);
    }
    
    textarea {
        min-height: 200px;
        resize: vertical;
    }
    
    .editor-toolbar {
        display: flex;
        gap: 8px;
        margin-bottom: 8px;
        padding: 4px;
        background: var(--vscode-editor-inactiveSelectionBackground);
        border-radius: 4px;
    }
    
    .toolbar-btn {
        padding: 4px 8px;
        background: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: none;
        border-radius: 2px;
        cursor: pointer;
        font-weight: 600;
    }
    
    .toolbar-btn:hover {
        background: var(--vscode-button-secondaryHoverBackground);
    }
    
    .toolbar-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .file-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 12px;
    }
    
    .file-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        border-radius: 16px;
        cursor: pointer;
        font-size: 13px;
        transition: all 0.2s;
    }
    
    .file-pill:hover {
        background: var(--vscode-button-hoverBackground);
        transform: translateY(-1px);
    }
    
    .file-link {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 2px;
        color: var(--vscode-textLink-foreground);
    }
    
    .file-link:hover {
        color: var(--vscode-textLink-activeForeground);
    }
    
    .button-group {
        display: flex;
        gap: 12px;
        margin-top: 32px;
        padding-top: 20px;
        border-top: 1px solid var(--vscode-panel-border);
    }
    
    .btn-primary {
        padding: 10px 20px;
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        border-radius: 2px;
        cursor: pointer;
        font-weight: 600;
    }
    
    .btn-primary:hover {
        background-color: var(--vscode-button-hoverBackground);
    }
    
    .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .btn-secondary {
        padding: 10px 20px;
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: none;
        border-radius: 2px;
        cursor: pointer;
    }
    
    .btn-secondary:hover {
        background-color: var(--vscode-button-secondaryHoverBackground);
    }
    
    .auto-save-indicator {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        margin-top: 8px;
    }
    
    .preview-content {
        background: var(--vscode-textCodeBlock-background);
        padding: 12px;
        border-radius: 4px;
        font-family: monospace;
        font-size: 12px;
        white-space: pre-wrap;
        max-height: 400px;
        overflow-y: auto;
    }
    
    .close-preview {
        float: right;
        background: transparent;
        border: none;
        color: var(--vscode-foreground);
        cursor: pointer;
        font-size: 20px;
    }

## Archivo 7: src/ui/intentForm.html (MODIFICAR)

    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Generate Intent</title>
        <!-- CSS_PLACEHOLDER -->
    </head>
    <body>
        <div class="container">
            <div class="form-left">
                <h1>🌸 Crear Bloom Intent</h1>
    
                <div class="auto-save-indicator" id="autoSaveIndicator">
                    💾 Draft guardado automáticamente
                </div>
    
                <form id="intentForm">
                    <div class="form-section">
                        <label for="name">Nombre del Intent <span class="required">*</span></label>
                        <input type="text" id="name" name="name" placeholder="fix-login-crash" required>
                    </div>
    
                    <div class="form-section">
                        <label for="problem">¿Qué problema quieres resolver? <span class="required">*</span></label>
                        
                        <div class="editor-toolbar">
                            <button type="button" class="toolbar-btn" onclick="formatText('bold')" title="Negrita">B</button>
                            <button type="button" class="toolbar-btn" onclick="formatText('italic')" title="Cursiva">I</button>
                            <button type="button" class="toolbar-btn" onclick="formatText('code')" title="Código">```</button>
                            <button type="button" class="toolbar-btn" onclick="formatText('list')" title="Lista">• -</button>
                            <button type="button" class="toolbar-btn" disabled title="Próximamente">🎙️</button>
                        </div>
                        
                        <textarea id="problem" name="problem" placeholder="Describe el problema en detalle..." required></textarea>
                    </div>
    
                    <div class="form-section">
                        <label>📎 Archivos relevantes (click=insertar, 🔗=ver)</label>
                        <div class="file-pills" id="filePills">
                            <!-- Generado dinámicamente -->
                        </div>
                    </div>
    
                    <div class="form-section">
                        <label for="notes">💬 Notas adicionales (opcional)</label>
                        <textarea id="notes" name="notes" rows="3" placeholder="Ej: Usar Retrofit, mantener estilo actual"></textarea>
                    </div>
    
                    <div class="button-group">
                        <button type="submit" class="btn-primary" id="generateBtn" disabled>✨ Generar Intent</button>
                        <button type="button" class="btn-secondary" onclick="cancel()">Cancelar</button>
                    </div>
                </form>
            </div>
    
            <div class="form-right" id="previewPanel">
                <button class="close-preview" onclick="closePreview()">×</button>
                <h3 id="previewTitle">Preview</h3>
                <div class="preview-content" id="previewContent"></div>
            </div>
        </div>
        
        <!-- JS_PLACEHOLDER -->
    </body>
    </html>

## Archivo 8: src/ui/intentForm.js (MODIFICAR)

    // VSCode API
    const vscode = acquireVsCodeApi();
    let lastFocusedField = null;
    let autoSaveTimer = null;
    
    // Capturar último campo enfocado
    document.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
            lastFocusedField = e.target;
        }
    });
    
    // Formateo de texto
    function formatText(type) {
        const textarea = lastFocusedField || document.getElementById('problem');
        if (!textarea || textarea.tagName !== 'TEXTAREA') return;
    
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selected = textarea.value.substring(start, end);
        let formatted = selected;
    
        switch(type) {
            case 'bold':
                formatted = `**${selected}**`;
                break;
            case 'italic':
                formatted = `*${selected}*`;
                break;
            case 'code':
                formatted = `\`\`\`\n${selected}\n\`\`\``;
                break;
            case 'list':
                formatted = selected.split('\n').map(line => line ? `- ${line}` : '').join('\n');
                break;
        }
    
        textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
        textarea.selectionStart = start;
        textarea.selectionEnd = start + formatted.length;
        textarea.focus();
    
        saveDraft();
    }
    
    // Insertar nombre de archivo en cursor
    function insertFileName(filename) {
        const target = lastFocusedField || document.getElementById('problem');
        if (!target || (target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT')) {
            alert('Haz click en un campo de texto primero');
            return;
        }
    
        const start = target.selectionStart || 0;
        const end = target.selectionEnd || 0;
        const text = filename + ' ';
    
        target.value = target.value.substring(0, start) + text + target.value.substring(end);
        target.selectionStart = target.selectionEnd = start + text.length;