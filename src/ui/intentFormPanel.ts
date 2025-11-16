import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { Validator } from '../core/validator';
import { IntentGenerator } from '../core/intentGenerator';
import { FilePackager } from '../core/filePackager';
const fs = require('fs');
const path = require('path');

export interface IntentFormData {
    name: string;
    problem: string;
    context: string;
    currentBehavior: string[];
    desiredBehavior: string[];
    objective: string;
    scope: string[];
    considerations: string;
    tests: string[];
    expectedOutput: string;
}

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

        this.logger.info('Formulario de intent abierto');
    }

    private setupMessageListener(): void {
        if (!this.panel) {
            return;
        }

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'submit') {
                    await this.handleSubmit(message.data);
                } else if (message.command === 'cancel') {
                    this.panel?.dispose();
                }
            },
            undefined,
            this.context.subscriptions
        );
    }

    private async handleSubmit(data: IntentFormData): Promise<void> {
        this.logger.info('Procesando formulario de intent');

        const validator = new Validator();
        const validationErrors = validator.validateIntentForm(data, this.workspaceFolder);

        if (validationErrors.length > 0) {
            this.panel?.webview.postMessage({
                command: 'validationErrors',
                errors: validationErrors
            });
            this.logger.warn(`Errores de validación: ${validationErrors.join(', ')}`);
            return;
        }

        try {
            const intentFolderPath = vscode.Uri.joinPath(
                this.workspaceFolder.uri,
                '.bloom',
                'intents',
                data.name
            );

            await vscode.workspace.fs.createDirectory(intentFolderPath);
            this.logger.info(`Carpeta creada: ${intentFolderPath.fsPath}`);

            const packager = new FilePackager(this.logger);
            const tarballPath = vscode.Uri.joinPath(intentFolderPath, 'codebase.tar.gz');
            await packager.createTarball(this.selectedFiles, tarballPath, this.workspaceFolder);

            const generator = new IntentGenerator(this.logger);
            const intentPath = vscode.Uri.joinPath(intentFolderPath, 'intent.bl');
            await generator.generateIntent(data, this.relativePaths, intentPath);

            this.panel?.dispose();

            vscode.window.showInformationMessage(
                `✅ Intent '${data.name}' creado exitosamente en .bloom/intents/${data.name}/`
            );

            this.logger.info('Intent generado exitosamente');
            this.logger.info(`Carpeta: .bloom/intents/${data.name}/`);
            this.logger.info('Archivos: intent.bl, codebase.tar.gz');

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

    private getHtmlContent(): string {
        // Cargar archivos separados (refactor para robustez)
        const htmlPath = path.join(this.context.extensionPath, 'src', 'ui', 'intentForm.html');
        const cssPath = path.join(this.context.extensionPath, 'src', 'ui', 'intentForm.css');
        const jsPath = path.join(this.context.extensionPath, 'src', 'ui', 'intentForm.js');

        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        const jsContent = fs.readFileSync(jsPath, 'utf8');

        // Generar botones de archivos (solo nombre, dinámico)
        const fileButtonsHtml = this.relativePaths.length > 0
            ? this.relativePaths.map(relPath => {
                const filename = path.basename(relPath);
                return `<button type="button" class="btn-file" onclick="insertFileName('${filename}')">${filename}</button>`;
              }).join('')
            : '<span style="color: var(--vscode-descriptionForeground); font-style: italic;">Ningún archivo seleccionado</span>';

        // Inyectar en HTML
        htmlContent = htmlContent.replace('<!-- FILE_BUTTONS_PLACEHOLDER -->', fileButtonsHtml);

        // Inyectar CSS y JS en el template HTML
        htmlContent = htmlContent.replace('<!-- CSS_PLACEHOLDER -->', `<style>${cssContent}</style>`);
        htmlContent = htmlContent.replace('<!-- JS_PLACEHOLDER -->', `<script>${jsContent}</script>`);

        return htmlContent;
    }
}