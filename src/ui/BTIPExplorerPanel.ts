import * as vscode from 'vscode';
import { BTIPServer } from '../server/BTIPServer';
import { Logger } from '../utils/logger';

export class BTIPExplorerPanel {
    private static currentPanel: BTIPExplorerPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private readonly server: BTIPServer;
    private disposables: vscode.Disposable[] = [];

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, workspacePath: string) {
        this.panel = panel;
        this.server = new BTIPServer(workspacePath);

        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
        this.panel.webview.html = this.getLoadingHtml();

        this.initializeServer();
    }

    private async initializeServer(): Promise<void> {
        try {
            const port = await this.server.start();
            Logger.info(`BTIP Server initialized on port ${port}`);
            
            // Wait a bit for server to be ready
            setTimeout(() => {
                this.panel.webview.html = this.getWebviewHtml(port);
            }, 500);
        } catch (error) {
            Logger.error('Failed to start BTIP Server:', error);
            vscode.window.showErrorMessage('Failed to start BTIP Explorer server');
            this.panel.webview.html = this.getErrorHtml();
        }
    }

    public static async createOrShow(extensionUri: vscode.Uri): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open');
            return;
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;

        if (BTIPExplorerPanel.currentPanel) {
            BTIPExplorerPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'btipExplorer',
            'BTIP Explorer',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        BTIPExplorerPanel.currentPanel = new BTIPExplorerPanel(panel, extensionUri, workspacePath);
    }

    private getWebviewHtml(port: number): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BTIP Explorer</title>
    <style>
        body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
        }
        iframe {
            border: none;
            width: 100%;
            height: 100%;
        }
    </style>
</head>
<body>
    <iframe src="http://localhost:${port}" allow=""></iframe>
</body>
</html>`;
    }

    private getLoadingHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BTIP Explorer</title>
    <style>
        body {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
        }
        .loader {
            text-align: center;
        }
        .spinner {
            border: 3px solid var(--vscode-editor-background);
            border-top: 3px solid var(--vscode-button-background);
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 20px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body>
    <div class="loader">
        <div class="spinner"></div>
        <p>Starting BTIP Explorer...</p>
    </div>
</body>
</html>`;
    }

    private getErrorHtml(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BTIP Explorer - Error</title>
    <style>
        body {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: var(--vscode-editor-background);
            color: var(--vscode-errorForeground);
            font-family: var(--vscode-font-family);
            padding: 20px;
            text-align: center;
        }
        .error {
            max-width: 400px;
        }
        h2 {
            margin-top: 0;
        }
    </style>
</head>
<body>
    <div class="error">
        <h2>Failed to Start BTIP Explorer</h2>
        <p>Could not initialize the BTIP server. Please check the logs for more information.</p>
    </div>
</body>
</html>`;
    }

    public dispose(): void {
        BTIPExplorerPanel.currentPanel = undefined;

        this.server.stop();
        this.panel.dispose();

        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
}