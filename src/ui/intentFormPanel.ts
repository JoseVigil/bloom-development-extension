import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { Validator } from '../core/validator';
import { IntentGenerator } from '../core/intentGenerator';
import { FilePackager } from '../core/filePackager';

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
            // CAMBIO AQUÍ: Guardar en /.bloom/intents/[nombre]/
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
                `Intent '${data.name}' creado en .bloom/intents/${data.name}/`
            );

            this.logger.info('Intent generado exitosamente');
            this.logger.info(`Carpeta: .bloom/intents/${data.name}/`);

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
        // Generamos los botones con los nombres de archivo
        const fileButtons = this.relativePaths.length > 0
            ? this.relativePaths.map(path => {
                const filename = path.split('/').pop() || path;
                return `<button type="button" class="btn-file" onclick="insertFileName('${filename}')">${filename}</button>`;
              }).join('')
            : '<em style="color: var(--vscode-descriptionForeground);">Ningún archivo seleccionado</em>';

        return `
            <!DOCTYPE html>
            <html lang="es">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Generate Intent</title>
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; }
                    body {
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 20px;
                    }
                    h1 { margin-bottom: 24px; font-size: 24px; }
                    .form-section { margin-bottom: 24px; }
                    label { display: block; margin-bottom: 8px; font-weight: 600; }
                    .required { color: var(--vscode-errorForeground); }
                    input[type="text"], textarea {
                        width: 100%; padding: 8px; background-color: var(--vscode-input-background);
                        color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border);
                        border-radius: 2px; font-family: var(--vscode-font-family); font-size: var(--vscode-font-size);
                    }
                    input[type="text"]:focus, textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
                    textarea { min-height: 80px; resize: vertical; }
                    .list-container {
                        border: 1px solid var(--vscode-input-border); border-radius: 2px;
                        padding: 12px; background-color: var(--vscode-input-background);
                    }
                    .list-item { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
                    .list-item input { flex: 1; }
                    .btn-remove, .btn-add, .btn-file {
                        padding: 4px 12px; background-color: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground); border: none; border-radius: 2px;
                        cursor: pointer; font-size: 12px;
                    }
                    .btn-remove:hover, .btn-add:hover, .btn-file:hover {
                        background-color: var(--vscode-button-secondaryHoverBackground);
                    }
                    .btn-add { margin-top: 8px; padding: 6px 12px; }
                    .btn-primary, .btn-secondary {
                        padding: 10px 20px; border: none; border-radius: 2px; cursor: pointer;
                    }
                    .btn-primary {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground); font-weight: 600;
                    }
                    .btn-primary:hover { background-color: var(--vscode-button-hoverBackground); }
                    .btn-secondary {
                        background-color: var(--vscode-button-secondaryBackground);
                        color: var(--vscode-button-secondaryForeground);
                    }
                    .btn-secondary:hover { background-color: var(--vscode-button-secondaryHoverBackground); }
                    .button-group { display: flex; gap: 12px; margin-top: 32px; padding-top: 20px;
                                    border-top: 1px solid var(--vscode-panel-border); }
                    .error-message { color: var(--vscode-errorForeground); font-size: 12px; margin-top: 4px; display: none; }
                    .error-message.visible { display: block; }
                    .help-text { font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 4px; }
                    .error-banner {
                        background-color: var(--vscode-inputValidation-errorBackground);
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
                        color: var(--vscode-errorForeground); padding: 12px; margin-bottom: 20px;
                        border-radius: 2px; display: none;
                    }
                    .error-banner.visible { display: block; }

                    /* NUEVO: Sección de archivos seleccionados */
                    .file-section {
                        margin: 20px 0;
                        padding: 16px;
                        background-color: var(--vscode-editorWidget-background);
                        border: 1px solid var(--vscode-editorWidget-border);
                        border-radius: 6px;
                    }
                    .file-section label {
                        display: block;
                        margin-bottom: 12px;
                        font-weight: bold;
                        color: var(--vscode-foreground);
                    }
                    .file-buttons {
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                    }
                    .btn-file {
                        background-color: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        font-size: 13px;
                        padding: 6px 12px;
                    }
                    .btn-file:hover {
                        background-color: var(--vscode-button-hoverBackground);
                    }
                </style>
            </head>
            <body>
                <h1>Generar Bloom Intent</h1>

                <div id="errorBanner" class="error-banner"></div>

                <!-- AQUÍ ESTÁN LOS BOTONES DE ARCHIVOS -->
                <div class="file-section">
                    <label>Archivos seleccionados (clic para insertar nombre):</label>
                    <div class="file-buttons">
                        ${fileButtons}
                    </div>
                </div>

                <form id="intentForm">
                    <div class="form-section">
                        <label for="name">Nombre del Intent <span class="required">*</span></label>
                        <input type="text" id="name" name="name" required>
                        <div class="help-text">Nombre corto sin espacios (ej: fix-authentication)</div>
                        <div class="error-message" id="name-error"></div>
                    </div>

                    <div class="form-section">
                        <label for="problem">Problema <span class="required">*</span></label>
                        <textarea id="problem" name="problem" required></textarea>
                        <div class="help-text">Describe el problema que se busca resolver (mínimo 10 caracteres)</div>
                        <div class="error-message" id="problem-error"></div>
                    </div>

                    <div class="form-section">
                        <label for="context">Contexto <span class="required">*</span></label>
                        <textarea id="context" name="context" required></textarea>
                        <div class="help-text">Proporciona contexto relevante del proyecto (mínimo 10 caracteres)</div>
                        <div class="error-message" id="context-error"></div>
                    </div>

                    <div class="form-section">
                        <label>Comportamiento Actual <span class="required">*</span></label>
                        <div class="list-container" id="currentBehavior">
                            <div class="list-item">
                                <input type="text" placeholder="Describe el comportamiento actual">
                                <button type="button" class="btn-remove" onclick="removeItem(this)">×</button>
                            </div>
                        </div>
                        <button type="button" class="btn-add" onclick="addCurrentBehavior()">+ Agregar item</button>
                        <div class="error-message" id="currentBehavior-error"></div>
                    </div>

                    <div class="form-section">
                        <label>Comportamiento Deseado <span class="required">*</span></label>
                        <div class="list-container" id="desiredBehavior">
                            <div class="list-item">
                                <input type="text" placeholder="Describe el comportamiento deseado">
                                <button type="button" class="btn-remove" onclick="removeItem(this)">×</button>
                            </div>
                        </div>
                        <button type="button" class="btn-add" onclick="addDesiredBehavior()">+ Agregar item</button>
                        <div class="error-message" id="desiredBehavior-error"></div>
                    </div>

                    <div class="form-section">
                        <label for="objective">Objetivo <span class="required">*</span></label>
                        <textarea id="objective" name="objective" required></textarea>
                        <div class="help-text">Define el objetivo específico (mínimo 10 caracteres)</div>
                        <div class="error-message" id="objective-error"></div>
                    </div>

                    <div class="form-section">
                        <label>Alcance y Restricciones</label>
                        <div class="list-container" id="scope">
                            <div class="list-item">
                                <input type="text" placeholder="Define restricciones o límites">
                                <button type="button" class="btn-remove" onclick="removeItem(this)">×</button>
                            </div>
                        </div>
                        <button type="button" class="btn-add" onclick="addScope()">+ Agregar restricción</button>
                    </div>

                    <div class="form-section">
                        <label for="considerations">Hipótesis / Consideraciones</label>
                        <textarea id="considerations" name="considerations"></textarea>
                        <div class="help-text">Opcional: consideraciones adicionales</div>
                    </div>

                    <div class="form-section">
                        <label>Tests / Validación Necesaria</label>
                        <div class="list-container" id="tests">
                            <div class="list-item">
                                <input type="text" placeholder="Criterio de validación">
                                <button type="button" class="btn-remove" onclick="removeItem(this)">×</button>
                            </div>
                        </div>
                        <button type="button" class="btn-add" onclick="addTest()">+ Agregar test</button>
                    </div>

                    <div class="form-section">
                        <label for="expectedOutput">Salida Esperada del Modelo <span class="required">*</span></label>
                        <textarea id="expectedOutput" name="expectedOutput" required></textarea>
                        <div class="help-text">Describe qué esperas que genere el modelo (mínimo 10 caracteres)</div>
                        <div class="error-message" id="expectedOutput-error"></div>
                    </div>

                    <div class="button-group">
                        <button type="submit" class="btn-primary">Generar Intent</button>
                        <button type="button" class="btn-secondary" onclick="cancel()">Cancelar</button>
                    </div>
                </form>

                <script>
                    const vscode = acquireVsCodeApi();

                    function addCurrentBehavior() { addListItem('currentBehavior', 'Describe el comportamiento actual'); }
                    function addDesiredBehavior() { addListItem('desiredBehavior', 'Describe el comportamiento deseado'); }
                    function addScope() { addListItem('scope', 'Define restricciones o límites'); }
                    function addTest() { addListItem('tests', 'Criterio de validación'); }

                    function addListItem(containerId, placeholder) {
                        const container = document.getElementById(containerId);
                        const div = document.createElement('div');
                        div.className = 'list-item';

                        const input = document.createElement('input');
                        input.type = 'text';
                        input.placeholder = placeholder;

                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = 'btn-remove';
                        button.textContent = '×';
                        button.onclick = function() { removeItem(button); };

                        div.appendChild(input);
                        div.appendChild(button);
                        container.appendChild(div);
                    }
                    function removeItem(button) {
                        const container = button.closest('.list-container');
                        const items = container.querySelectorAll('.list-item');
                        if (items.length > 1) {
                            button.closest('.list-item').remove();
                        }
                    }

                    function getListValues(containerId) {
                        const container = document.getElementById(containerId);
                        const inputs = container.querySelectorAll('input');
                        return Array.from(inputs).map(i => i.value.trim()).filter(v => v.length > 0);
                    }

                    function cancel() {
                        vscode.postMessage({ command: 'cancel' });
                    }

                    // FUNCIÓN PARA INSERTAR NOMBRE DE ARCHIVO
                    function insertFileName(filename) {
                        const active = document.activeElement;
                        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
                            const start = active.selectionStart || 0;
                            const end = active.selectionEnd || 0;
                            active.value = active.value.substring(0, start) + filename + active.value.substring(end);
                            active.selectionStart = active.selectionEnd = start + filename.length;
                            active.focus();
                        } else {
                            const banner = document.getElementById('errorBanner');
                            banner.textContent = 'Primero haz clic en un campo de texto';
                            banner.classList.add('visible');
                            setTimeout(() => banner.classList.remove('visible'), 3000);
                        }
                    }

                    document.getElementById('intentForm').addEventListener('submit', (e) => {
                        e.preventDefault();
                        document.querySelectorAll('.error-message').forEach(el => {
                            el.classList.remove('visible'); el.textContent = '';
                        });
                        document.getElementById('errorBanner').classList.remove('visible');

                        const formData = {
                            name: document.getElementById('name').value.trim(),
                            problem: document.getElementById('problem').value.trim(),
                            context: document.getElementById('context').value.trim(),
                            currentBehavior: getListValues('currentBehavior'),
                            desiredBehavior: getListValues('desiredBehavior'),
                            objective: document.getElementById('objective').value.trim(),
                            scope: getListValues('scope'),
                            considerations: document.getElementById('considerations').value.trim(),
                            tests: getListValues('tests'),
                            expectedOutput: document.getElementById('expectedOutput').value.trim()
                        };

                        vscode.postMessage({ command: 'submit', data: formData });
                    });

                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'validationErrors') {
                            const banner = document.getElementById('errorBanner');
                            banner.innerHTML = '<strong>Corrije los siguientes errores:</strong><ul>' +
                                message.errors.map(err => '<li>' + err + '</li>').join('') + '</ul>';
                            banner.classList.add('visible');
                            window.scrollTo(0, 0);
                        } else if (message.command === 'error') {
                            document.getElementById('errorBanner').textContent = message.message;
                            document.getElementById('errorBanner').classList.add('visible');
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }
}