import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';
import { Validator } from '../core/validator';
import { IntentGenerator } from '../core/intentGenerator';
import { FilePackager } from '../core/filePackager';
import { MetadataManager } from '../core/metadataManager';
import { ProjectDetector } from '../strategies/ProjectDetector';
import { IntentFormData, formDataToContent } from '../models/intent';

export class IntentFormPanel {
    private panel: vscode.WebviewPanel | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private workspaceFolder: vscode.WorkspaceFolder,
        private selectedFiles: vscode.Uri[],
        private relativePaths: string[]
    ) {}

    show(): void {
        this.panel = vscode.window.createWebviewPanel(
            'bloomIntentForm',
            'Bloom: Generate Intent',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        this.panel.webview.html = this.getHtmlContent();
        this.setupMessageListener();

        // ✅ NUEVO: Enviar lista de archivos al webview
        this.panel.webview.postMessage({
            command: 'setFiles',
            files: this.relativePaths
        });

        this.logger.info('Formulario de intent abierto');
    }

    private setupMessageListener(): void {
        if (!this.panel) {
            return;
        }

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'submit':
                        await this.handleSubmit(message.data);
                        break;
                    case 'cancel':
                        this.panel?.dispose();
                        break;
                    // ✅ NUEVO: Manejo de preview de archivos
                    case 'getFileContent':
                        await this.handleGetFileContent(message.filename);
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
    }

    // ✅ NUEVO: Handler para obtener contenido de archivos
    private async handleGetFileContent(filename: string): Promise<void> {
        try {
            // Buscar el archivo por nombre
            const fileUri = this.selectedFiles.find(uri => {
                const relPath = this.relativePaths[this.selectedFiles.indexOf(uri)];
                return path.basename(relPath) === filename || relPath === filename;
            });

            if (!fileUri) {
                this.panel?.webview.postMessage({
                    command: 'showFileContent',
                    content: `Error: Archivo '${filename}' no encontrado`
                });
                return;
            }

            const fileContent = await vscode.workspace.fs.readFile(fileUri);
            const text = new TextDecoder().decode(fileContent);

            this.panel?.webview.postMessage({
                command: 'showFileContent',
                content: text
            });
        } catch (error) {
            this.panel?.webview.postMessage({
                command: 'showFileContent',
                content: `Error al leer archivo: ${error}`
            });
        }
    }

    private async handleSubmit(data: IntentFormData): Promise<void> {
        this.logger.info('Procesando formulario de intent');

        // ✅ ACTUALIZADO: Validación simplificada para V2
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

        try {
            // Crear estructura de carpetas
            const bloomPath = path.join(this.workspaceFolder.uri.fsPath, '.bloom');
            const intentsPath = path.join(bloomPath, 'intents');
            const intentFolderPath = vscode.Uri.file(path.join(intentsPath, data.name));

            // Crear carpetas si no existen
            await this.ensureDirectory(vscode.Uri.file(bloomPath));
            await this.ensureDirectory(vscode.Uri.file(intentsPath));
            await this.ensureDirectory(intentFolderPath);
            
            this.logger.info(`Carpeta creada: ${intentFolderPath.fsPath}`);

            // Detectar tipo de proyecto
            const detector = new ProjectDetector();
            const strategy = await detector.detectStrategy(this.workspaceFolder.uri.fsPath);
            const projectType = strategy?.projectType || 'generic';

            // Determinar versión (free o pro)
            const config = vscode.workspace.getConfiguration('bloom');
            const version = config.get<string>('version', 'free');

            // Generar codebase según versión
            if (version === 'free') {
                const codebaseContent = await this.generateCodebaseMarkdown();
                const codebasePath = vscode.Uri.file(path.join(intentFolderPath.fsPath, 'codebase.md'));
                await vscode.workspace.fs.writeFile(
                    codebasePath,
                    Buffer.from(codebaseContent, 'utf8')
                );
                this.logger.info('Codebase.md generado');
            } else {
                const packager = new FilePackager(this.logger);
                const tarballPath = vscode.Uri.file(path.join(intentFolderPath.fsPath, 'codebase.tar.gz'));
                await packager.createTarball(this.selectedFiles, tarballPath, this.workspaceFolder);
                this.logger.info('Codebase.tar.gz generado');
            }

            // ✅ ACTUALIZADO: Generar intent.bl con estructura V2
            const generator = new IntentGenerator(this.logger);
            const intentPath = vscode.Uri.file(path.join(intentFolderPath.fsPath, 'intent.bl'));
            await generator.generateIntent(data, this.relativePaths, intentPath);
            this.logger.info('Intent.bl generado');

            // ✅ CORREGIDO: Crear metadata con content
            const metadataManager = new MetadataManager(this.logger);
            await metadataManager.create(intentFolderPath, {
                name: data.name,
                projectType: projectType,
                version: version as 'free' | 'pro',
                files: this.selectedFiles,
                filesCount: this.selectedFiles.length,
                estimatedTokens: 0,
                content: formDataToContent(data)  // ← AGREGADO
            });
            this.logger.info('Metadata creada');

            // Cerrar panel y notificar éxito
            this.panel?.dispose();
            vscode.window.showInformationMessage(
                `✅ Intent '${data.name}' creado exitosamente en .bloom/intents/${data.name}/`
            );

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

    /**
     * Asegura que un directorio exista, creándolo si es necesario
     */
    private async ensureDirectory(uri: vscode.Uri): Promise<void> {
        try {
            await vscode.workspace.fs.stat(uri);
        } catch {
            await vscode.workspace.fs.createDirectory(uri);
        }
    }

    private async generateCodebaseMarkdown(): Promise<string> {
        let content = '# Bloom Codebase\n\n';
        content += `> Generated on ${new Date().toISOString()}\n`;
        content += `> Total Files: ${this.selectedFiles.length}\n\n`;
        
        content += '## 📋 File Index\n\n';
        for (const relPath of this.relativePaths) {
            content += `- ${relPath}\n`;
        }
        content += '\n---\n\n';

        // Agregar contenido de cada archivo
        for (let i = 0; i < this.selectedFiles.length; i++) {
            const fileUri = this.selectedFiles[i];
            const relPath = this.relativePaths[i];
            
            content += `## File: ${relPath}\n\n`;
            
            try {
                const fileContent = await vscode.workspace.fs.readFile(fileUri);
                const text = new TextDecoder().decode(fileContent);
                
                // Indentar con 4 espacios
                const indented = text.split('\n').map(line => `    ${line}`).join('\n');
                content += indented + '\n\n';
            } catch (error) {
                content += `    [Error reading file: ${error}]\n\n`;
            }
        }

        return content;
    }

    // ✅ ACTUALIZADO: Método simplificado sin placeholders
    private getHtmlContent(): string {
        // Leer archivos separados
        const htmlPath = path.join(this.context.extensionPath, 'src', 'ui', 'intentForm.html');
        const cssPath = path.join(this.context.extensionPath, 'src', 'ui', 'intentForm.css');
        const jsPath = path.join(this.context.extensionPath, 'src', 'ui', 'intentForm.js');

        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        const jsContent = fs.readFileSync(jsPath, 'utf8');

        // ✅ SIMPLIFICADO: Solo reemplazar CSS y JS
        htmlContent = htmlContent.replace('<!-- CSS_PLACEHOLDER -->', `<style>${cssContent}</style>`);
        htmlContent = htmlContent.replace('<!-- JS_PLACEHOLDER -->', `<script>${jsContent}</script>`);

        return htmlContent;
    }
}