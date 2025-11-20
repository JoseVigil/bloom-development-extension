import * as vscode from 'vscode';

export class ClaudeBridgePanel {
    public static currentPanel: ClaudeBridgePanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;

        this._panel.webview.html = this._getWebviewContent();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'sendPrompt':
                        await vscode.commands.executeCommand('claudeBridge.sendPrompt');
                        break;
                    case 'fetchArtifact':
                        await vscode.commands.executeCommand('claudeBridge.fetchArtifact');
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public static render(extensionUri: vscode.Uri, dependencies: any) {
        if (ClaudeBridgePanel.currentPanel) {
            ClaudeBridgePanel.currentPanel._panel.reveal(vscode.ViewColumn.One);
        } else {
            const panel = vscode.window.createWebviewPanel(
                'claudeBridge',
                'Claude Bridge',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            ClaudeBridgePanel.currentPanel = new ClaudeBridgePanel(panel, extensionUri);
        }
    }

    public dispose() {
        ClaudeBridgePanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private _getWebviewContent(): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Claude Bridge</title>
                <style>
                    * {
                        box-sizing: border-box;
                        margin: 0;
                        padding: 0;
                    }
                    body {
                        font-family: var(--vscode-font-family);
                        color: var(--vscode-foreground);
                        background: var(--vscode-editor-background);
                        padding: 20px;
                    }
                    .container {
                        max-width: 800px;
                        margin: 0 auto;
                    }
                    h1 {
                        color: var(--vscode-titleBar-activeForeground);
                        margin-bottom: 20px;
                        font-size: 24px;
                    }
                    .section {
                        background: var(--vscode-sideBar-background);
                        border: 1px solid var(--vscode-panel-border);
                        border-radius: 4px;
                        padding: 20px;
                        margin-bottom: 20px;
                    }
                    .section h2 {
                        font-size: 18px;
                        margin-bottom: 15px;
                        color: var(--vscode-textLink-foreground);
                    }
                    button {
                        background: var(--vscode-button-background);
                        color: var(--vscode-button-foreground);
                        border: none;
                        padding: 10px 20px;
                        border-radius: 4px;
                        cursor: pointer;
                        font-size: 14px;
                        margin-right: 10px;
                        margin-bottom: 10px;
                    }
                    button:hover {
                        background: var(--vscode-button-hoverBackground);
                    }
                    .workflow {
                        display: flex;
                        flex-direction: column;
                        gap: 10px;
                    }
                    .step {
                        display: flex;
                        align-items: center;
                        padding: 10px;
                        background: var(--vscode-editor-background);
                        border-radius: 4px;
                    }
                    .step-number {
                        background: var(--vscode-activityBarBadge-background);
                        color: var(--vscode-activityBarBadge-foreground);
                        width: 30px;
                        height: 30px;
                        border-radius: 50%;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin-right: 15px;
                        font-weight: bold;
                    }
                    .info {
                        background: var(--vscode-inputValidation-infoBackground);
                        border-left: 3px solid var(--vscode-inputValidation-infoBorder);
                        padding: 10px;
                        margin-top: 10px;
                        font-size: 13px;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🌸 Claude Bridge Control Panel</h1>
                    
                    <div class="section">
                        <h2>Quick Actions</h2>
                        <button onclick="sendPrompt()">📤 Send Prompt</button>
                        <button onclick="fetchArtifact()">📥 Fetch Artifact</button>
                        <button onclick="parseQuestions()">❓ Parse Questions</button>
                    </div>

                    <div class="section">
                        <h2>Workflow Automatizado</h2>
                        <div class="workflow">
                            <div class="step">
                                <div class="step-number">1</div>
                                <div>Completar formulario → Generar contexto del proyecto</div>
                            </div>
                            <div class="step">
                                <div class="step-number">2</div>
                                <div>Enviar prompt a Claude.ai → Esperar respuesta</div>
                            </div>
                            <div class="step">
                                <div class="step-number">3</div>
                                <div>Extraer preguntas → Responder en panel</div>
                            </div>
                            <div class="step">
                                <div class="step-number">4</div>
                                <div>Enviar respuestas → Claude genera artifact</div>
                            </div>
                            <div class="step">
                                <div class="step-number">5</div>
                                <div>Descargar artifact → Procesar automáticamente</div>
                            </div>
                        </div>
                        <div class="info">
                            ℹ️ Todo el proceso es automático. Solo necesitás aprobar acciones críticas.
                        </div>
                    </div>

                    <div class="section">
                        <h2>Estado del Sistema</h2>
                        <p>✅ Bridge script: Configurado</p>
                        <p>✅ Python: Disponible</p>
                        <p>✅ Sesión Claude: Activa</p>
                    </div>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();

                    function sendPrompt() {
                        vscode.postMessage({ command: 'sendPrompt' });
                    }

                    function fetchArtifact() {
                        vscode.postMessage({ command: 'fetchArtifact' });
                    }

                    function parseQuestions() {
                        vscode.postMessage({ command: 'parseQuestions' });
                    }
                </script>
            </body>
            </html>
        `;
    }
}