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

        if (!data.name || data.name.length < 3) {
            vscode.window.showErrorMessage('El nombre del intent debe tener al menos 3 caracteres');
            return;
        }      

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