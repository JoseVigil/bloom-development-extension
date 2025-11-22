# Bloom Intent Lifecycle - Implementación Completa

Este documento contiene todos los cambios necesarios para implementar el ciclo de vida completo de intents según bloom_intent_lifecycle.md.

## Archivo 1: package.json (MODIFICAR)

    {
        "name": "bloom-btip-plugin",
        "displayName": "Bloom BTIP",
        "description": "Plugin para preview de Markdown y generación de Technical Intent Packages",
        "version": "1.0.0",
        "publisher": "bloom",
        "engines": {
            "vscode": "^1.80.0"
        },
        "categories": [
            "Other"
        ],
        "activationEvents": [
            "onCommand:bloom.openMarkdownPreview",
            "onCommand:bloom.generateIntent"
        ],
        "main": "./out/extension.js",
        "contributes": {
            "views": {
                "explorer": [
                    {
                        "id": "bloomIntents",
                        "name": "Bloom Intents"
                    }
                ]
            },
            "commands": [
                {
                    "command": "bloom.openMarkdownPreview",
                    "title": "Bloom: Open Markdown Preview"
                },
                {
                    "command": "bloom.generateIntent",
                    "title": "Bloom: Generate New Intent"
                },
                {
                    "command": "bloom.openIntent",
                    "title": "Open Intent"
                },
                {
                    "command": "bloom.copyContextToClipboard",
                    "title": "Copy Context to Clipboard",
                    "icon": "$(clippy)"
                },
                {
                    "command": "bloom.deleteIntent",
                    "title": "Delete Intent"
                },
                {
                    "command": "bloom.addToIntent",
                    "title": "Bloom: Add to Intent"
                },
                {
                    "command": "bloom.deleteIntentFromForm",
                    "title": "Delete Current Intent"
                },
                {
                    "command": "bloom.openFileInVSCode",
                    "title": "Open File in VSCode"
                },
                {
                    "command": "bloom.revealInFinder",
                    "title": "Reveal in Finder/Explorer"
                },
                {
                    "command": "bloom.copyFilePath",
                    "title": "Copy File Path"
                }
            ],
            "menus": {
                "explorer/context": [
                    {
                        "command": "bloom.generateIntent",
                        "when": "explorerResourceIsFolder || resourceScheme == file",
                        "group": "bloom@1"
                    },
                    {
                        "command": "bloom.addToIntent",
                        "when": "explorerResourceIsFolder || resourceScheme == file",
                        "group": "bloom@2"
                    }
                ],
                "view/item/context": [
                    {
                        "command": "bloom.openIntent",
                        "when": "view == bloomIntents && viewItem == intent",
                        "group": "1_main@1"
                    },
                    {
                        "command": "bloom.copyContextToClipboard",
                        "when": "view == bloomIntents && viewItem == intent",
                        "group": "1_main@2"
                    },
                    {
                        "command": "bloom.deleteIntent",
                        "when": "view == bloomIntents && viewItem == intent",
                        "group": "3_danger@1"
                    }
                ]
            },
            "configuration": {
                "title": "Bloom",
                "properties": {
                    "bloom.version": {
                        "type": "string",
                        "enum": ["free", "pro"],
                        "default": "free",
                        "description": "Versión del plugin"
                    },
                    "bloom.pythonPath": {
                        "type": "string",
                        "default": "python",
                        "description": "Path al ejecutable de Python para regeneración de codebase"
                    },
                    "bloom.useCustomCodebaseGenerator": {
                        "type": "boolean",
                        "default": false,
                        "description": "Usar script Python personalizado para generar codebase.md"
                    }
                }
            }
        },
        "scripts": {
            "vscode:prepublish": "npm run compile",
            "compile": "tsc -p ./",
            "watch": "tsc -watch -p ./",
            "pretest": "npm run compile && npm run lint",
            "lint": "eslint src --ext ts",
            "test": "node ./out/test/runTest.js"
        },
        "devDependencies": {
            "@types/node": "^18.19.130",
            "@types/uuid": "^10.0.0",
            "@types/vscode": "^1.80.0",
            "@typescript-eslint/eslint-plugin": "^5.59.0",
            "@typescript-eslint/parser": "^5.59.0",
            "eslint": "^8.41.0",
            "typescript": "^5.0.4",
            "vscode": "^1.1.37"
        },
        "dependencies": {
            "@vscode/codicons": "^0.0.33",
            "punycode": "^2.3.0",
            "uuid": "^13.0.0"
        }
    }

## Archivo 2: src/extension.ts (MODIFICAR)

    import * as vscode from 'vscode';
    import { registerOpenMarkdownPreview } from './commands/openMarkdownPreview';
    import { registerGenerateIntent } from './commands/generateIntent';
    import { registerOpenIntent } from './commands/openIntent';
    import { registerCopyContextToClipboard } from './commands/copyContextToClipboard';
    import { registerDeleteIntent } from './commands/deleteIntent';
    import { registerAddToIntent } from './commands/addToIntent';
    import { registerDeleteIntentFromForm } from './commands/deleteIntentFromForm';
    import { registerOpenFileInVSCode } from './commands/openFileInVSCode';
    import { registerRevealInFinder } from './commands/revealInFinder';
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
            registerAddToIntent(context, logger);
            registerDeleteIntentFromForm(context, logger);
            registerOpenFileInVSCode(context, logger);
            registerRevealInFinder(context, logger);
            
            // Registrar comando para copiar path de archivo
            const copyFilePathDisposable = vscode.commands.registerCommand(
                'bloom.copyFilePath',
                async (filePath: string) => {
                    await vscode.env.clipboard.writeText(filePath);
                    vscode.window.showInformationMessage(`Path copiado: ${filePath}`);
                }
            );
            context.subscriptions.push(copyFilePathDisposable);
        }
        
        registerOpenMarkdownPreview(context, logger);
        registerGenerateIntent(context, logger);
        
        logger.info('Todos los comandos registrados exitosamente');
    }
    
    export function deactivate() {}

## Archivo 3: src/ui/intentFormPanel.ts (MODIFICAR)

    import * as vscode from 'vscode';
    import * as path from 'path';
    import * as fs from 'fs';
    import { Logger } from '../utils/logger';
    import { Validator } from '../core/validator';
    import { IntentGenerator } from '../core/intentGenerator';
    import { MetadataManager } from '../core/metadataManager';
    import { CodebaseGenerator } from '../core/codebaseGenerator';
    import { IntentSession } from '../core/intentSession';
    import { IntentFormData, TokenStats } from '../models/intent';
    
    export class IntentFormPanel {
        private panel: vscode.WebviewPanel | undefined;
        private session: IntentSession | undefined;
        private isEditMode: boolean = false;
        private intentName: string | undefined;
    
        constructor(
            private context: vscode.ExtensionContext,
            private logger: Logger,
            private workspaceFolder: vscode.WorkspaceFolder,
            private selectedFiles: vscode.Uri[],
            private relativePaths: string[],
            existingIntentName?: string
        ) {
            this.intentName = existingIntentName;
            this.isEditMode = !!existingIntentName;
        }
    
        async show(): Promise<void> {
            this.panel = vscode.window.createWebviewPanel(
                'bloomIntentForm',
                this.isEditMode ? 'Bloom: Edit Intent' : 'Bloom: Generate Intent',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );
    
            this.panel.webview.html = this.getHtmlContent();
            
            // Inicializar sesión
            if (this.isEditMode && this.intentName) {
                await this.loadExistingIntent(this.intentName);
            } else {
                await this.createNewSession();
            }
    
            this.setupMessageListener();
            this.setupSessionListeners();
    
            // Enviar archivos iniciales
            this.sendFilesToWebview();
            
            this.logger.info('Formulario de intent abierto');
        }
    
        private async createNewSession(): Promise<void> {
            const metadataManager = new MetadataManager(this.logger);
            const codebaseGenerator = new CodebaseGenerator();
            const intentGenerator = new IntentGenerator(this.logger);
    
            const intentFolder = vscode.Uri.file(
                path.join(this.workspaceFolder.uri.fsPath, '.bloom', 'intents', 'temp_' + Date.now())
            );
    
            this.session = await IntentSession.create(
                intentFolder,
                this.workspaceFolder,
                this.selectedFiles,
                this.relativePaths,
                metadataManager,
                codebaseGenerator,
                intentGenerator,
                this.logger
            );
        }
    
        private async loadExistingIntent(intentName: string): Promise<void> {
            const metadataManager = new MetadataManager(this.logger);
            const codebaseGenerator = new CodebaseGenerator();
            const intentGenerator = new IntentGenerator(this.logger);
    
            this.session = await IntentSession.forIntent(
                intentName,
                this.workspaceFolder,
                metadataManager,
                codebaseGenerator,
                intentGenerator,
                this.logger
            );
    
            const state = this.session.getState();
            
            // Cargar datos existentes en el formulario
            this.panel?.webview.postMessage({
                command: 'loadExistingIntent',
                data: {
                    name: state.name,
                    content: state.content,
                    status: state.status
                }
            });
        }
    
        private setupSessionListeners(): void {
            if (!this.session) return;
    
            this.session.on('filesChanged', (files: string[]) => {
                this.relativePaths = files;
                this.sendFilesToWebview();
                this.logger.info(`Archivos actualizados: ${files.length}`);
            });
    
            this.session.on('tokensChanged', (tokens: TokenStats) => {
                this.panel?.webview.postMessage({
                    command: 'updateTokens',
                    tokens
                });
            });
    
            this.session.on('stateChanged', (state: any) => {
                this.logger.info(`Estado del intent actualizado: ${state.status}`);
            });
        }
    
        private sendFilesToWebview(): void {
            if (!this.panel) return;
    
            const filesData = this.relativePaths.map(filePath => ({
                filename: path.basename(filePath),
                fullPath: filePath,
                relativePath: filePath
            }));
    
            this.panel.webview.postMessage({
                command: 'setFiles',
                files: filesData
            });
        }
    
        private setupMessageListener(): void {
            if (!this.panel) return;
    
            this.panel.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.command) {
                        case 'submit':
                            await this.handleSubmit(message.data);
                            break;
                        case 'cancel':
                            this.panel?.dispose();
                            break;
                        case 'openFileInVSCode':
                            await this.handleOpenFileInVSCode(message.filePath);
                            break;
                        case 'copyFilePath':
                            await vscode.commands.executeCommand('bloom.copyFilePath', message.filePath);
                            break;
                        case 'revealInFinder':
                            await this.handleRevealInFinder(message.filePath);
                            break;
                        case 'removeFile':
                            await this.handleRemoveFile(message.filePath);
                            break;
                        case 'autoSave':
                            await this.handleAutoSave(message.updates);
                            break;
                        case 'deleteIntent':
                            await this.handleDeleteIntent();
                            break;
                    }
                },
                undefined,
                this.context.subscriptions
            );
        }
    
        private async handleOpenFileInVSCode(filePath: string): Promise<void> {
            const fullPath = path.join(this.workspaceFolder.uri.fsPath, filePath);
            const fileUri = vscode.Uri.file(fullPath);
            
            await vscode.commands.executeCommand('bloom.openFileInVSCode', fileUri);
        }
    
        private async handleRevealInFinder(filePath: string): Promise<void> {
            const fullPath = path.join(this.workspaceFolder.uri.fsPath, filePath);
            const fileUri = vscode.Uri.file(fullPath);
            
            await vscode.commands.executeCommand('bloom.revealInFinder', fileUri);
        }
    
        private async handleRemoveFile(filePath: string): Promise<void> {
            if (!this.session) return;
    
            const confirm = await vscode.window.showWarningMessage(
                `¿Remover ${path.basename(filePath)}?`,
                'Remover',
                'Cancelar'
            );
    
            if (confirm === 'Remover') {
                await this.session.removeFile(filePath);
                vscode.window.showInformationMessage(`Archivo removido: ${path.basename(filePath)}`);
            }
        }
    
        private async handleAutoSave(updates: any): Promise<void> {
            if (!this.session) return;
    
            this.session.queueAutoSave(updates);
        }
    
        private async handleDeleteIntent(): Promise<void> {
            if (!this.session) return;
    
            const state = this.session.getState();
            
            const confirm = await vscode.window.showWarningMessage(
                `¿Eliminar intent '${state.name}'?`,
                {
                    modal: true,
                    detail: `Esto borrará la carpeta .bloom/intents/${state.name}/ permanentemente.`
                },
                'Eliminar'
            );
    
            if (confirm === 'Eliminar') {
                await this.session.deleteIntent();
                this.panel?.dispose();
                vscode.window.showInformationMessage(`Intent '${state.name}' eliminado`);
                
                // Refrescar tree view
                vscode.commands.executeCommand('workbench.view.extension.bloomIntents');
            }
        }
    
        private async handleSubmit(data: IntentFormData): Promise<void> {
            this.logger.info('Procesando formulario de intent');
    
            const validator = new Validator();
            const validation = validator.validate(data);
    
            if (!validation.isValid) {
                this.panel?.webview.postMessage({
                    command: 'validationErrors',
                    errors: validation.errors
                });
                this.logger.warn(`Errores de validación: ${validation.errors.join(', ')}`);
                return;
            }
    
            if (!this.session) {
                vscode.window.showErrorMessage('Error: Sesión no inicializada');
                return;
            }
    
            try {
                // Crear carpeta definitiva si es nuevo intent
                if (!this.isEditMode) {
                    const intentFolder = vscode.Uri.file(
                        path.join(this.workspaceFolder.uri.fsPath, '.bloom', 'intents', data.name)
                    );
                    
                    await this.ensureDirectory(vscode.Uri.file(path.join(this.workspaceFolder.uri.fsPath, '.bloom')));
                    await this.ensureDirectory(vscode.Uri.file(path.join(this.workspaceFolder.uri.fsPath, '.bloom', 'intents')));
                    await this.ensureDirectory(intentFolder);
                    
                    // Actualizar sesión con carpeta definitiva
                    const metadataManager = new MetadataManager(this.logger);
                    const codebaseGenerator = new CodebaseGenerator();
                    const intentGenerator = new IntentGenerator(this.logger);
                    
                    this.session = await IntentSession.create(
                        intentFolder,
                        this.workspaceFolder,
                        this.selectedFiles,
                        this.relativePaths,
                        metadataManager,
                        codebaseGenerator,
                        intentGenerator,
                        this.logger
                    );
                }
    
                // Generar o regenerar intent
                if (this.isEditMode) {
                    await this.session.regenerateIntent(data);
                    vscode.window.showInformationMessage(`✅ Intent '${data.name}' regenerado exitosamente`);
                } else {
                    await this.session.generateIntent(data);
                    vscode.window.showInformationMessage(`✅ Intent '${data.name}' creado exitosamente`);
                }
    
                this.panel?.dispose();
                
                // Refrescar tree view
                vscode.commands.executeCommand('workbench.view.extension.bloomIntents');
    
                this.logger.info('Intent generado exitosamente');
    
            } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Error al generar intent: ${errorMessage}`);
                this.logger.error('Error al generar intent', error as Error);
    
                this.panel?.webview.postMessage({
                    command: 'error',
                    message: errorMessage
                });
            }
        }
    
        private async ensureDirectory(uri: vscode.Uri): Promise<void> {
            try {
                await vscode.workspace.fs.stat(uri);
            } catch {
                await vscode.workspace.fs.createDirectory(uri);
            }
        }
    
        private getHtmlContent(): string {
            const htmlPath = path.join(this.context.extensionPath, 'src', 'ui', 'intentForm.html');
            const cssPath = path.join(this.context.extensionPath, 'src', 'ui', 'intentForm.css');
            const jsPath = path.join(this.context.extensionPath, 'src', 'ui', 'intentForm.js');
    
            let htmlContent = fs.readFileSync(htmlPath, 'utf8');
            const cssContent = fs.readFileSync(cssPath, 'utf8');
            const jsContent = fs.readFileSync(jsPath, 'utf8');
    
            htmlContent = htmlContent.replace('<!-- CSS_PLACEHOLDER -->', `<style>${cssContent}</style>`);
            htmlContent = htmlContent.replace('<!-- JS_PLACEHOLDER -->', `<script>${jsContent}</script>`);
    
            return htmlContent;
        }
    }

## Archivo 4: src/ui/intentForm.html (MODIFICAR)

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
            <h1>🌸 Crear Bloom Intent</h1>
    
            <div class="auto-save-indicator" id="autoSaveIndicator">
                💾 Draft guardado automáticamente
            </div>
    
            <div id="errorMessage" class="error-message">
                <strong>⚠️ Errores de validación:</strong>
                <ul id="errorList"></ul>
            </div>
    
            <form id="intentForm">
                <div class="form-section">
                    <label for="name">Nombre del Intent <span class="required">*</span></label>
                    <input type="text" id="name" name="name" placeholder="fix-login-crash" required>
                    <p class="help-text">Solo letras minúsculas, números y guiones</p>
                </div>
    
                <div class="form-section">
                    <label>📁 Archivos relevantes</label>
                    <div class="file-pills" id="filePills">
                        <!-- Generado dinámicamente -->
                    </div>
                    <div class="token-counter" id="tokenCounter">
                        <div class="token-bar">
                            <div class="token-fill" id="tokenFill"></div>
                        </div>
                        <div class="token-text" id="tokenText">
                            📊 Token estimate: 0 / 100,000 (0%)
                        </div>
                    </div>
                </div>
    
                <div class="form-section">
                    <label for="problem">¿Qué problema quieres resolver? <span class="required">*</span></label>
                    
                    <div class="editor-toolbar">
                        <button type="button" class="toolbar-btn" onclick="formatText('bold')" title="Negrita">B</button>
                        <button type="button" class="toolbar-btn" onclick="formatText('italic')" title="Cursiva">I</button>
                        <button type="button" class="toolbar-btn" onclick="formatText('code')" title="Código">```</button>
                        <button type="button" class="toolbar-btn" onclick="formatText('list')" title="Lista">• -</button>
                    </div>
                    
                    <textarea id="problem" name="problem" placeholder="Describe el problema en detalle..." required></textarea>
                </div>
    
                <div class="form-section">
                    <label for="expectedOutput">Output Esperado <span class="required">*</span></label>
                    <textarea id="expectedOutput" name="expectedOutput" placeholder="Describe el resultado esperado..." required></textarea>
                </div>
    
                <div class="form-section">
                    <label>Comportamiento Actual</label>
                    <div class="list-container" id="currentBehaviorList"></div>
                    <button type="button" class="btn-add" onclick="addListItem('currentBehavior')">
                        + Agregar paso
                    </button>
                </div>
    
                <div class="form-section">
                    <label>Comportamiento Deseado</label>
                    <div class="list-container" id="desiredBehaviorList"></div>
                    <button type="button" class="btn-add" onclick="addListItem('desiredBehavior')">
                        + Agregar paso
                    </button>
                </div>
    
                <div class="form-section">
                    <label for="considerations">💬 Consideraciones adicionales (opcional)</label>
                    <textarea id="considerations" name="considerations" rows="3" placeholder="Ej: Usar Retrofit, mantener estilo actual"></textarea>
                </div>
    
                <div class="button-group">
                    <button type="submit" class="btn-primary" id="generateBtn">✨ Generar Intent</button>
                    <button type="button" class="btn-secondary" onclick="cancel()">Cancelar</button>
                    <div class="button-spacer"></div>
                    <button type="button" class="btn-danger" id="deleteBtn" onclick="deleteIntent()">🗑️ Delete Intent</button>
                </div>
            </form>
        </div>
        
        <!-- JS_PLACEHOLDER -->
    </body>
    </html>

## Archivo 5: src/ui/intentForm.js (MODIFICAR)

    const vscode = acquireVsCodeApi();
    let lastFocusedField = null;
    let autoSaveTimer = null;
    let isEditMode = false;
    
    let listCounters = {
        currentBehavior: 0,
        desiredBehavior: 0
    };
    
    document.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
            lastFocusedField = e.target;
        }
    });
    
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
    
        triggerAutoSave();
    }
    
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
        target.focus();
    
        triggerAutoSave();
    }
    
    function openFileInVSCode(filePath) {
        vscode.postMessage({
            command: 'openFileInVSCode',
            filePath: filePath
        });
    }
    
    function copyFilePath(filePath) {
        vscode.postMessage({
            command: 'copyFilePath',
            filePath: filePath
        });
    }
    
    function revealInFinder(filePath) {
        vscode.postMessage({
            command: 'revealInFinder',
            filePath: filePath
        });
    }
    
    function removeFile(filePath) {
        vscode.postMessage({
            command: 'removeFile',
            filePath: filePath
        });
    }
    
    function addListItem(listName) {
        const listContainer = document.getElementById(listName + 'List');
        const itemId = listName + '_' + listCounters[listName]++;
        
        const itemDiv = document.createElement('div');
        itemDiv.className = 'list-item';
        itemDiv.id = itemId;
        itemDiv.innerHTML = `
            <input type="text" placeholder="Escribir aquí..." />
            <button type="button" class="btn-remove" onclick="removeListItem('${itemId}')" title="Eliminar">×</button>
        `;
        
        listContainer.appendChild(itemDiv);
        
        const newInput = itemDiv.querySelector('input');
        if (newInput) {
            newInput.focus();
            newInput.addEventListener('input', triggerAutoSave);
        }
    
        triggerAutoSave();
    }
    
    function removeListItem(itemId) {
        const item = document.getElementById(itemId);
        if (item) {
            item.remove();
            triggerAutoSave();
        }
    }
    
    function getListValues(listName) {
        const listContainer = document.getElementById(listName + 'List');
        const inputs = listContainer.querySelectorAll('input');
        return Array.from(inputs)
            .map(input => input.value.trim())
            .filter(v => v.length > 0);
    }
    
    function triggerAutoSave() {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = setTimeout(() => {
            const updates = {
                problem: document.getElementById('problem').value,
                expectedOutput: document.getElementById('expectedOutput').value,
                currentBehavior: getListValues('currentBehavior'),
                desiredBehavior: getListValues('desiredBehavior'),
                considerations: document.getElementById('considerations').value
            };
            
            vscode.postMessage({
                command: 'autoSave',
                updates: updates
            });
            
            showAutoSaveIndicator();
        }, 2000);
    }
    
    function showAutoSaveIndicator() {
        const indicator = document.getElementById('autoSaveIndicator');
        indicator.textContent = '💾 Guardado ' + new Date().toLocaleTimeString();
        indicator.style.opacity = '1';
    
        setTimeout(() => {
            indicator.style.opacity = '0.6';
        }, 2000);
    }
    
    function showValidationErrors(errors) {
        const errorDiv = document.getElementById('errorMessage');
        const errorList = document.getElementById('errorList');
        
        errorList.innerHTML = errors.map(err => `<li>${err}</li>`).join('');
        errorDiv.style.display = 'block';
        
        errorDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    
    function hideValidationErrors() {
        const errorDiv = document.getElementById('errorMessage');
        errorDiv.style.display = 'none';
    }
    
    function updateTokenDisplay(tokens) {
        const tokenText = document.getElementById('tokenText');
        const tokenFill = document.getElementById('tokenFill');
        const tokenCounter = document.getElementById('tokenCounter');
        
        const percentage = tokens.percentage;
        const estimated = tokens.estimated.toLocaleString();
        const limit = tokens.limit.toLocaleString();
        
        tokenFill.style.width = Math.min(percentage, 100) + '%';
        
        if (percentage < 80) {
            tokenCounter.className = 'token-counter token-safe';
            tokenText.textContent = `📊 Token estimate: ${estimated} / ${limit} (${percentage.toFixed(1)}%)`;
        } else if (percentage < 100) {
            tokenCounter.className = 'token-counter token-warning';
            tokenText.textContent = `⚠️ Warning: ${estimated} / ${limit} (${percentage.toFixed(1)}%) - Consider removing files`;
        } else {
            tokenCounter.className = 'token-counter token-error';
            tokenText.textContent = `❌ Error: ${estimated} / ${limit} (${percentage.toFixed(1)}%) - Cannot generate, remove files`;
            document.getElementById('generateBtn').disabled = true;
        }
    }
    
    document.getElementById('intentForm').addEventListener('submit', (e) => {
        e.preventDefault();
        
        hideValidationErrors();
    
        const formData = {
            name: document.getElementById('name').value.trim(),
            problem: document.getElementById('problem').value.trim(),
            expectedOutput: document.getElementById('expectedOutput').value.trim(),
            currentBehavior: getListValues('currentBehavior'),
            desiredBehavior: getListValues('desiredBehavior'),
            considerations: document.getElementById('considerations').value.trim(),
            selectedFiles: []
        };
    
        vscode.postMessage({
            command: 'submit',
            data: formData
        });
    });
    
    function cancel() {
        if (confirm('¿Estás seguro de que quieres cancelar? Se perderán todos los cambios.')) {
            vscode.postMessage({ command: 'cancel' });
        }
    }
    
    function deleteIntent() {
        vscode.postMessage({ command: 'deleteIntent' });
    }
    
    function updateGenerateButton() {
        const hasName = document.getElementById('name').value.length > 0;
        const hasProblem = document.getElementById('problem').value.length > 20;
        const hasOutput = document.getElementById('expectedOutput').value.length > 10;
        
        document.getElementById('generateBtn').disabled = !(hasName && hasProblem && hasOutput);
    }
    
    document.getElementById('problem').addEventListener('input', () => {
        triggerAutoSave();
        updateGenerateButton();
    });
    
    document.getElementById('name').addEventListener('input', () => {
        triggerAutoSave();
        updateGenerateButton();
    });
    
    document.getElementById('expectedOutput').addEventListener('input', () => {
        triggerAutoSave();
        updateGenerateButton();
    });
    
    document.getElementById('considerations').addEventListener('input', triggerAutoSave);
    
    window.addEventListener('message', event => {
        const message = event.data;
        
        switch (message.command) {
            case 'setFiles':
                renderFilePills(message.files);
                break;
                
            case 'updateTokens':
                updateTokenDisplay(message.tokens);
                break;
                
            case 'loadExistingIntent':
                loadExistingIntentData(message.data);
                break;
                
            case 'validationErrors':
                showValidationErrors(message.errors);
                break;
                
            case 'error':
                alert('Error: ' + message.message);
                break;
        }
    });
    
    function renderFilePills(files) {
        const container = document.getElementById('filePills');
        
        if (!files || files.length === 0) {
            container.innerHTML = '<p class="help-text">No hay archivos seleccionados</p>';
            return;
        }
        
        container.innerHTML = files.map(file => `
            <div class="file-pill">
                <button type="button" class="file-btn file-name" onclick="insertFileName('${file.filename}')" title="Insertar nombre">
                    📄 ${file.filename}
                </button>
                <button type="button" class="file-btn" onclick="openFileInVSCode('${file.relativePath}')" title="Abrir en VSCode">
                    🔗
                </button>
                <button type="button" class="file-btn" onclick="copyFilePath('${file.relativePath}')" title="Copiar path">
                    📋
                </button>
                <button type="button" class="file-btn" onclick="revealInFinder('${file.relativePath}')" title="Mostrar en Finder/Explorer">
                    📂
                </button>
                <button type="button" class="file-btn file-remove" onclick="removeFile('${file.relativePath}')" title="Remover">
                    ❌
                </button>
            </div>
        `).join('');
    }
    
    function loadExistingIntentData(data) {
        isEditMode = true;
        
        document.getElementById('name').value = data.name || '';
        document.getElementById('name').disabled = true;
        
        document.getElementById('problem').value = data.content.problem || '';
        document.getElementById('expectedOutput').value = data.content.expectedOutput || '';
        document.getElementById('considerations').value = data.content.considerations || '';
        
        if (data.content.currentBehavior && Array.isArray(data.content.currentBehavior)) {
            data.content.currentBehavior.forEach(value => {
                addListItem('currentBehavior');
                const items = document.getElementById('currentBehaviorList').querySelectorAll('.list-item');
                const lastItem = items[items.length - 1];
                if (lastItem) {
                    lastItem.querySelector('input').value = value;
                }
            });
        }
    
        if (data.content.desiredBehavior && Array.isArray(data.content.desiredBehavior)) {
            data.content.desiredBehavior.forEach(value => {
                addListItem('desiredBehavior');
                const items = document.getElementById('desiredBehaviorList').querySelectorAll('.list-item');
                const lastItem = items[items.length - 1];
                if (lastItem) {
                    lastItem.querySelector('input').value = value;
                }
            });
        }
        
        const generateBtn = document.getElementById('generateBtn');
        if (data.status === 'completed') {
            generateBtn.textContent = '🔄 Regenerar Intent';
        }
        
        const deleteBtn = document.getElementById('deleteBtn');
        deleteBtn.style.display = 'block';
    }
    
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('intentForm').dispatchEvent(new Event('submit'));
        }
        
        if (e.key === 'Escape') {
            cancel();
        }
    });
    
    addListItem('currentBehavior');
    addListItem('desiredBehavior');
    updateGenerateButton();
    
    const deleteBtn = document.getElementById('deleteBtn');
    deleteBtn.style.display = 'none';

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
        line-height: 1.6;
    }
    
    .container {
        max-width: 1200px;
        margin: 0 auto;
    }
    
    h1 {
        margin-bottom: 24px;
        font-size: 24px;
        color: var(--vscode-textLink-foreground);
    }
    
    .form-section {
        margin-bottom: 24px;
    }
    
    label {
        display: block;
        margin-bottom: 8px;
        font-weight: 600;
        font-size: 14px;
    }
    
    .required {
        color: var(--vscode-errorForeground);
    }
    
    .help-text {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        margin-top: 4px;
        font-style: italic;
    }
    
    input[type="text"],
    textarea {
        width: 100%;
        padding: 10px;
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        transition: border-color 0.2s ease;
    }
    
    input[type="text"]:focus,
    textarea:focus {
        outline: 1px solid var(--vscode-focusBorder);
        border-color: var(--vscode-focusBorder);
    }
    
    textarea {
        min-height: 120px;
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
        font-size: 13px;
        transition: background-color 0.2s ease;
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
        padding: 12px;
        background-color: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        min-height: 52px;
    }
    
    .file-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 8px;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border-radius: 16px;
        transition: all 0.2s;
    }
    
    .file-pill:hover {
        background: var(--vscode-button-hoverBackground);
        transform: translateY(-1px);
    }
    
    .file-btn {
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 2px 4px;
        color: inherit;
        font-size: 14px;
        transition: opacity 0.2s;
    }
    
    .file-btn:hover {
        opacity: 0.7;
    }
    
    .file-btn.file-name {
        font-weight: 500;
        font-size: 13px;
    }
    
    .file-btn.file-remove {
        color: var(--vscode-errorForeground);
        font-weight: bold;
    }
    
    .token-counter {
        margin-top: 12px;
        padding: 12px;
        background: var(--vscode-editor-inactiveSelectionBackground);
        border-radius: 4px;
        border: 1px solid var(--vscode-input-border);
    }
    
    .token-bar {
        width: 100%;
        height: 8px;
        background: var(--vscode-input-background);
        border-radius: 4px;
        overflow: hidden;
        margin-bottom: 8px;
    }
    
    .token-fill {
        height: 100%;
        transition: width 0.3s ease, background-color 0.3s ease;
        border-radius: 4px;
    }
    
    .token-counter.token-safe .token-fill {
        background: #4ec9b0;
    }
    
    .token-counter.token-warning .token-fill {
        background: #ce9178;
    }
    
    .token-counter.token-error .token-fill {
        background: var(--vscode-errorForeground);
    }
    
    .token-text {
        font-size: 13px;
        font-weight: 500;
    }
    
    .token-counter.token-safe .token-text {
        color: #4ec9b0;
    }
    
    .token-counter.token-warning .token-text {
        color: #ce9178;
    }
    
    .token-counter.token-error .token-text {
        color: var(--vscode-errorForeground);
    }
    
    .list-container {
        background-color: var(--vscode-input-background);
        border: 1px solid var(--vscode-input-border);
        border-radius: 4px;
        padding: 10px;
        min-height: 60px;
    }
    
    .list-item {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
        padding: 8px;
        background-color: var(--vscode-editor-background);
        border-radius: 3px;
    }
    
    .list-item:last-child {
        margin-bottom: 0;
    }
    
    .list-item input {
        flex: 1;
        margin-right: 10px;
        background-color: transparent;
        border: none;
        color: var(--vscode-foreground);
        padding: 6px;
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
    }
    
    .list-item input:focus {
        outline: 1px solid var(--vscode-focusBorder);
        border-radius: 2px;
    }
    
    .btn-remove {
        background: none;
        border: none;
        color: var(--vscode-errorForeground);
        cursor: pointer;
        padding: 0;
        font-size: 20px;
        line-height: 1;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 3px;
        transition: background-color 0.2s ease;
    }
    
    .btn-remove:hover {
        background-color: rgba(244, 135, 113, 0.2);
    }
    
    .btn-add {
        background-color: var(--vscode-button-secondaryBackground);
        color: var(--vscode-button-secondaryForeground);
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        margin-top: 8px;
        transition: background-color 0.2s ease;
    }
    
    .btn-add:hover {
        background-color: var(--vscode-button-secondaryHoverBackground);
    }
    
    .button-group {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 32px;
        padding-top: 20px;
        border-top: 1px solid var(--vscode-panel-border);
    }
    
    .button-spacer {
        flex: 1;
    }
    
    .btn-primary {
        padding: 10px 24px;
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 600;
        font-size: 14px;
        transition: background-color 0.2s ease;
    }
    
    .btn-primary:hover {
        background-color: var(--vscode-button-hoverBackground);
    }
    
    .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .btn-secondary {
        padding: 10px 24px;
        background-color: transparent;
        color: var(--vscode-foreground);
        border: 1px solid var(--vscode-panel-border);
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s ease;
    }
    
    .btn-secondary:hover {
        background-color: var(--vscode-list-hoverBackground);
    }
    
    .btn-danger {
        padding: 10px 24px;
        background-color: transparent;
        color: var(--vscode-errorForeground);
        border: 1px solid var(--vscode-errorForeground);
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        transition: all 0.2s ease;
    }
    
    .btn-danger:hover {
        background-color: var(--vscode-errorForeground);
        color: var(--vscode-editor-background);
    }
    
    .auto-save-indicator {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
        margin-bottom: 16px;
        padding: 8px;
        background: var(--vscode-editor-inactiveSelectionBackground);
        border-radius: 4px;
        transition: opacity 0.3s ease;
    }
    
    .error-message {
        background-color: rgba(244, 135, 113, 0.2);
        border-left: 3px solid var(--vscode-errorForeground);
        padding: 12px;
        margin-bottom: 20px;
        border-radius: 4px;
        display: none;
        animation: fadeIn 0.3s ease;
    }
    
    .error-message strong {
        display: block;
        margin-bottom: 8px;
        color: var(--vscode-errorForeground);
    }
    
    .error-message ul {
        margin: 0;
        padding-left: 20px;
    }
    
    .error-message li {
        margin-bottom: 4px;
    }
    
    @keyframes fadeIn {
        from {
            opacity: 0;
            transform: translateY(-10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

## Archivo 7: src/core/codebaseGenerator.ts (MODIFICAR)

    import * as vscode from 'vscode';
    import { FileDescriptor, CodebaseGeneratorOptions } from '../models/codebaseStrategy';
    import { promises as fs } from 'fs';
    import * as path from 'path';
    import { exec } from 'child_process';
    import { promisify } from 'util';
    
    const execAsync = promisify(exec);
    
    export class CodebaseGenerator {
        async generate(
            files: FileDescriptor[],
            outputPath: vscode.Uri,
            options: CodebaseGeneratorOptions
        ): Promise<void> {
            const config = vscode.workspace.getConfiguration('bloom');
            const useCustomGenerator = config.get<boolean>('useCustomCodebaseGenerator', false);
            
            if (useCustomGenerator && options.format === 'markdown') {
                const success = await this.tryPythonGeneration(files, outputPath, options);
                if (success) {
                    return;
                }
                
                vscode.window.showWarningMessage(
                    'Script Python no disponible, usando generador nativo'
                );
            }
            
            if (options.format === 'markdown') {
                await this.generateMarkdown(files, outputPath, options);
            } else {
                await this.generateTarball(files, outputPath, options);
            }
        }
        
        private async tryPythonGeneration(
            files: FileDescriptor[],
            outputPath: vscode.Uri,
            options: CodebaseGeneratorOptions
        ): Promise<boolean> {
            try {
                const workspacePath = options.workspaceFolder.uri.fsPath;
                const scriptPath = path.join(workspacePath, '.bloom', 'scripts', 'generate_codebase.py');
                
                try {
                    await fs.access(scriptPath);
                } catch {
                    return false;
                }
                
                const config = vscode.workspace.getConfiguration('bloom');
                const pythonPath = config.get<string>('pythonPath', 'python');
                
                const filesListPath = path.join(path.dirname(outputPath.fsPath), 'files_list.json');
                await fs.writeFile(
                    filesListPath,
                    JSON.stringify({
                        files: files.map(f => ({
                            relativePath: f.relativePath,
                            absolutePath: f.absolutePath
                        })),
                        workspacePath: workspacePath,
                        outputPath: outputPath.fsPath
                    }),
                    'utf-8'
                );
                
                const command = `"${pythonPath}" "${scriptPath}" "${filesListPath}"`;
                const { stdout, stderr } = await execAsync(command, {
                    cwd: workspacePath,
                    timeout: 60000
                });
                
                if (stderr) {
                    console.warn('Python script warnings:', stderr);
                }
                
                console.log('Python script output:', stdout);
                
                try {
                    await fs.access(outputPath.fsPath);
                    vscode.window.showInformationMessage('✅ Codebase regenerado (Python)');
                    return true;
                } catch {
                    return false;
                }
                
            } catch (error) {
                console.error('Error ejecutando script Python:', error);
                return false;
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
            let header = `# Snapshot de Codebase\n`;
            header += `Este archivo consolida todo el código del proyecto para indexación rápida por IA. `;
            header += `Primero el índice jerárquico, luego cada archivo con su path como título y código en bloque Markdown.\n\n`;
            
            if (options.includeMetadata) {
                header += `**Generado:** ${timestamp}\n`;
                header += `**Total de archivos:** ${files.length}\n\n`;
            }
            
            return header;
        }
        
        private generateIndex(
            files: FileDescriptor[],
            options: CodebaseGeneratorOptions
        ): string {
            if (!options.addTableOfContents) {
                return '';
            }
            
            let index = `## Índice de Archivos\n\n`;
            index += `Lista de archivos incluidos en este snapshot:\n\n`;
            
            const filesByDir: Record<string, string[]> = {};
            
            for (const file of files) {
                const dir = path.dirname(file.relativePath);
                if (!filesByDir[dir]) {
                    filesByDir[dir] = [];
                }
                filesByDir[dir].push(file.relativePath);
            }
            
            const sortedDirs = Object.keys(filesByDir).sort();
            
            for (const dir of sortedDirs) {
                index += `- **${dir}/**\n`;
                for (const filePath of filesByDir[dir].sort()) {
                    index += `  - ${filePath}\n`;
                }
            }
            
            index += `\n`;
            return index;
        }
        
        private async generateContent(
            files: FileDescriptor[],
            options: CodebaseGeneratorOptions
        ): Promise<string> {
            let content = `## Contenidos de Archivos\n`;
            
            for (const file of files) {
                content += await this.generateFileSection(file, options);
            }
            
            return content;
        }
        
        private async generateFileSection(
            file: FileDescriptor,
            options: CodebaseGeneratorOptions
        ): Promise<string> {
            let section = `### ${file.relativePath}\n`;
            
            if (options.includeMetadata && file.metadata) {
                section += `Metadatos: `;
                section += `Lenguaje: ${file.metadata.type}, `;
                section += `Tamaño: ${this.formatBytes(file.metadata.size)}\n\n`;
            }
            
            try {
                const fileContent = await fs.readFile(file.absolutePath, 'utf-8');
                const language = this.getLanguageFromExtension(file.relativePath);
                
                section += `\`\`\`${language}\n`;
                section += fileContent;
                section += `\n\`\`\`\n\n`;
            } catch (error) {
                section += `*Error leyendo archivo: ${error}*\n\n`;
            }
            
            return section;
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
                '.kt': 'kotlin',
                '.swift': 'swift',
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

## Resumen de Cambios

### ARCHIVOS MODIFICADOS: 7

1. **package.json**
   - Agregados comandos: `bloom.addToIntent`, `bloom.copyFilePath`
   - Agregado menú contextual en Explorer para "Generate New Intent" y "Add to Intent"
   - Agregadas configuraciones: `pythonPath`, `useCustomCodebaseGenerator`

2. **extension.ts**
   - Registrados todos los comandos faltantes
   - Agregado comando inline para `bloom.copyFilePath`

3. **intentFormPanel.ts**
   - Refactorización completa para usar IntentSession como fachada
   - Eliminada lógica de preview interno
   - Implementados listeners para eventos de IntentSession
   - Agregados handlers para los 5 botones de file pills
   - Implementado soporte para modo edición vs creación

4. **intentForm.html**
   - Eliminado panel lateral (.form-right) completamente
   - Agregado token counter con barra de progreso
   - Agregado botón Delete Intent separado visualmente
   - Modificada estructura de file pills para 5 botones

5. **intentForm.js**
   - Eliminada toda lógica de preview
   - Implementados 5 handlers para botones de file pills
   - Agregada función renderFilePills() con 5 botones por archivo
   - Implementado updateTokenDisplay() con colores según porcentaje
   - Conectado auto-save con IntentSession vía postMessage
   - Agregado soporte para cargar intents existentes

6. **intentForm.css**
   - Eliminados estilos de .form-right y preview
   - Agregados estilos para token counter (safe/warning/error)
   - Agregados estilos para 5 botones en file-pill
   - Agregados estilos para btn-danger (Delete Intent)
   - Cambiado layout a columna única (100% width)

7. **codebaseGenerator.ts**
   - Agregado método tryPythonGeneration() para scripts externos
   - Implementada detección automática de script en .bloom/scripts/
   - Agregado fallback a generación nativa si Python falla
   - Mejorado formato de codebase.md con índice jerárquico

### ARCHIVOS NUEVOS: 0

### REGLAS CRÍTICAS APLICADAS

✅ IntentSession como fachada única para operaciones
✅ Eliminación completa del panel de preview interno
✅ 5 botones funcionales en cada file pill
✅ Token counter reactivo con colores (verde/amarillo/rojo)
✅ Botón Delete Intent separado con confirmación modal
✅ Auto-save conectado a IntentSession
✅ Comandos de menú contextual registrados
✅ Integración opcional con scripts Python para codebase
✅ Soporte para modo edición (regenerar) vs creación
✅ File pills muestran solo nombre + extensión (no path completo)