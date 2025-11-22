// src/ui/profile/profileManagerPanel.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../../utils/logger';
import { ChromeProfileManager } from '../../core/chromeProfileManager';
import { joinPath } from '../../utils/uriHelper';

export class ProfileManagerPanel {
    public static currentPanel: ProfileManagerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private chromeProfileManager: ChromeProfileManager;
    private logger: Logger;
    private context: vscode.ExtensionContext;

    public static readonly viewType = 'bloomProfileManager';

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        logger: Logger,
        context: vscode.ExtensionContext
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.logger = logger;
        this.context = context;
        this.chromeProfileManager = new ChromeProfileManager(context, logger);

        this._update();

        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'scanProfiles':
                        await this.handleScanProfiles();
                        break;
                    case 'saveIntentMapping':
                        await this.handleSaveIntentMapping(message.data);
                        break;
                    case 'deleteMapping':
                        await this.handleDeleteMapping(message.intentId);
                        break;
                    case 'testConnection':
                        await this.handleTestConnection(message.profile, message.account);
                        break;
                    case 'loadIntents':
                        await this.handleLoadIntents();
                        break;
                    case 'loadMappings':
                        await this.handleLoadMappings();
                        break;
                    case 'verifyAccount':
                        await this.handleVerifyAccount(message.profileName, message.provider);
                        break;
                    case 'openProfile':
                        await this.handleOpenProfile(message.profileName, message.provider);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    // MÉTODO QUE USÁS EN extension.ts
    public static createOrShow(extensionUri: vscode.Uri, logger: Logger, context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

        if (ProfileManagerPanel.currentPanel) {
            ProfileManagerPanel.currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            ProfileManagerPanel.viewType,
            'Chrome Profile Manager',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    joinPath(extensionUri, 'out'),
                    joinPath(extensionUri, 'src', 'ui'),
                    joinPath(extensionUri, 'media')
                ]
            }
        );

        ProfileManagerPanel.currentPanel = new ProfileManagerPanel(panel, extensionUri, logger, context);
    }

    public dispose() {
        ProfileManagerPanel.currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const d = this._disposables.pop();
            if (d) d.dispose();
        }
    }

    private _update() {
        this._panel.title = 'Bloom AI Bridge - Profile Manager';
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'ui', 'profile', 'profileManager.html');
        const cssPath = path.join(this._extensionUri.fsPath, 'src', 'ui', 'profile', 'profileManager.css');
        const jsPath = path.join(this._extensionUri.fsPath, 'src', 'ui', 'profile', 'profileManager.js');

        const htmlUri = webview.asWebviewUri(vscode.Uri.file(htmlPath));
        const cssUri = webview.asWebviewUri(vscode.Uri.file(cssPath));
        const jsUri = webview.asWebviewUri(vscode.Uri.file(jsPath));

        const nonce = this.getNonce();

        return fs.readFileSync(htmlPath, 'utf8')
            .replace(/<link[^>]*href="profileManager\.css"[^>]*>/g, `<link href="${cssUri}" rel="stylesheet">`)
            .replace(/<script[^>]*src="profileManager\.js"[^>]*>/g, `<script nonce="${nonce}" src="${jsUri}"></script>`);
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    // ==================== HANDLERS (todos los que usás en JS) ====================

    private async handleScanProfiles() {
        try {
            const profiles = await this.chromeProfileManager.detectProfiles();
            this._panel.webview.postMessage({
                command: 'profilesDetected',
                profiles
            });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Error scanning profiles: ${err.message}`);
        }
    }

    private async handleSaveIntentMapping(data: any) {
        try {
            await this.chromeProfileManager.saveIntentMapping(data);
            this._panel.webview.postMessage({ command: 'mappingSaved' });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Error saving mapping: ${err.message}`);
        }
    }

    private async handleDeleteMapping(intentId: string) {
        try {
            await this.chromeProfileManager.deleteIntentMapping(intentId);
            this._panel.webview.postMessage({ command: 'mappingDeleted' });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Error deleting mapping: ${err.message}`);
        }
    }

    private async handleTestConnection(profile: string, account: string) {
        // Implementación básica (puede mejorarse)
        this._panel.webview.postMessage({
            command: 'connectionTested',
            success: true,
            message: `Connection test for ${account} in ${profile}`
        });
    }

    private async handleLoadIntents() {
        try {
            const intents = await this.chromeProfileManager.getAllIntents();
            this._panel.webview.postMessage({
                command: 'intentsLoaded',
                intents
            });
        } catch (err: any) {
            console.error(err);
        }
    }

    private async handleLoadMappings() {
        try {
            const mappings = await this.chromeProfileManager.getAllMappings();
            this._panel.webview.postMessage({
                command: 'mappingsLoaded',
                mappings
            });
        } catch (err: any) {
            console.error(err);
        }
    }

    private async handleVerifyAccount(profileName: string, provider: string) {
        // Placeholder — se puede implementar con puppeteer o login check
        this.logger.info(`Verify account requested: ${provider} in ${profileName}`);
    }

    private async handleOpenProfile(profileName: string, provider: string) {
        // Placeholder — abrir Chrome con el perfil
        this.logger.info(`Open profile requested: ${profileName} - ${provider}`);
    }
}