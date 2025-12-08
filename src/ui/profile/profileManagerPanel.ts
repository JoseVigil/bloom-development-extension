// src/ui/profile/profileManagerPanel.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../../utils/logger';
import { ChromeProfileManager } from '../../core/chromeProfileManager';
import { AiAccountChecker } from '../../ai/AiAccountChecker';
import { joinPath } from '../../utils/uriHelper';

export class ProfileManagerPanel {
    public static currentPanel: ProfileManagerPanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private chromeProfileManager: ChromeProfileManager;
    private accountChecker: AiAccountChecker;
    private logger: Logger;
    private context: vscode.ExtensionContext;

    public static readonly viewType = 'bloomProfileManager';

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        logger: Logger,
        context: vscode.ExtensionContext,
        accountChecker: AiAccountChecker
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this.logger = logger;
        this.context = context;
        this.chromeProfileManager = new ChromeProfileManager(context, logger);
        this.accountChecker = accountChecker;

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
                    case 'addAiAccount':
                        await this.handleAddAiAccount(message.profileName);
                        break;
                    case 'checkAiAccounts':
                        await this.handleCheckAiAccounts(message.profileName);
                        break;
                    case 'loadAiAccounts':
                        await this.handleLoadAiAccounts(message.profileName);
                        break;
                    case 'removeAiAccount':
                        await this.handleRemoveAiAccount(message.profileName, message.provider, message.accountId);
                        break;
                }
            },
            null,
            this._disposables
        );
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        logger: Logger,
        context: vscode.ExtensionContext,
        accountChecker: AiAccountChecker
    ) {
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

        ProfileManagerPanel.currentPanel = new ProfileManagerPanel(
            panel,
            extensionUri,
            logger,
            context,
            accountChecker
        );
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

    // ==================== HANDLERS ====================

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
        this.logger.info(`Verify account requested: ${provider} in ${profileName}`);
    }

    private async handleOpenProfile(profileName: string, provider: string) {
        this.logger.info(`Open profile requested: ${profileName} - ${provider}`);
    }

    // ==================== AI ACCOUNTS HANDLERS ====================

    private async handleAddAiAccount(profileName: string) {
        try {
            // Delegar al comando existente
            await vscode.commands.executeCommand('bloom.addAiAccount', profileName);
            
            // Recargar cuentas después de agregar
            await this.handleLoadAiAccounts(profileName);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Error adding AI account: ${err.message}`);
        }
    }

    private async handleCheckAiAccounts(profileName: string) {
        try {
            const statuses = await this.accountChecker.checkAllForProfile(profileName);
            
            this._panel.webview.postMessage({
                command: 'aiAccountsChecked',
                profileName,
                statuses
            });

            this.logger.info(`Checked ${statuses.length} AI accounts for ${profileName}`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Error checking accounts: ${err.message}`);
        }
    }

    private async handleLoadAiAccounts(profileName: string) {
        try {
            const accounts = this.context.globalState.get<any[]>('bloom.ai.accounts', []);
            const profileAccounts = accounts.filter(acc => acc.profileName === profileName);

            // Obtener estados actuales
            const statuses = await this.accountChecker.checkAllForProfile(profileName);

            this._panel.webview.postMessage({
                command: 'aiAccountsLoaded',
                profileName,
                accounts: profileAccounts,
                statuses
            });
        } catch (err: any) {
            this.logger.error('Error loading AI accounts', err);
        }
    }

    private async handleRemoveAiAccount(profileName: string, provider: string, accountId: string) {
        try {
            // Remover de globalState
            const key = 'bloom.ai.accounts';
            const existing = this.context.globalState.get<any[]>(key, []);
            const filtered = existing.filter(
                acc => !(acc.profileName === profileName && 
                        acc.provider === provider && 
                        acc.accountId === accountId)
            );
            await this.context.globalState.update(key, filtered);

            // Remover API key de secrets
            const secretKey = `bloom.ai.${profileName}.${provider}.${accountId}`;
            await this.context.secrets.delete(secretKey);

            this._panel.webview.postMessage({
                command: 'aiAccountRemoved',
                profileName,
                provider,
                accountId
            });

            this.logger.info(`Removed AI account: ${provider}/${accountId} from ${profileName}`);
        } catch (err: any) {
            vscode.window.showErrorMessage(`Error removing account: ${err.message}`);
        }
    }
}