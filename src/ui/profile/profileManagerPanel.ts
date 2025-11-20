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

    public static readonly viewType = 'bloomProfileManager';

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        private logger: Logger,
        private context: vscode.ExtensionContext
    ) {
        this._panel = panel;
        this._extensionUri = extensionUri;
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

    public static async render(
        extensionUri: vscode.Uri,
        logger: Logger,
        context: vscode.ExtensionContext
    ) {
        const column = vscode.ViewColumn.One;

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
                    joinPath(extensionUri, 'src', 'ui')
                ]
            }
        );

        ProfileManagerPanel.currentPanel = new ProfileManagerPanel(
            panel,
            extensionUri,
            logger,
            context
        );
    }

    public dispose() {
        ProfileManagerPanel.currentPanel = undefined;

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    private async _update() {
        const webview = this._panel.webview;
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    // ========================================================================
    // MESSAGE HANDLERS
    // ========================================================================

    private async handleScanProfiles() {
        try {
            const profiles = await this.chromeProfileManager.detectProfiles();
            
            this._panel.webview.postMessage({
                command: 'profilesDetected',
                profiles: profiles.map(p => ({
                    name: p.name,
                    path: p.path,
                    displayName: p.displayName || p.name,
                    accounts: p.accounts.map(a => ({
                        provider: a.provider,
                        email: a.email || null,
                        verified: a.verified
                    }))
                }))
            });

            vscode.window.showInformationMessage(
                `✅ ${profiles.length} Chrome profile${profiles.length !== 1 ? 's' : ''} detected`
            );
        } catch (error: any) {
            this.logger.error('Error scanning profiles', error);
            vscode.window.showErrorMessage(
                `Error scanning profiles: ${error.message}`
            );
        }
    }

    private async handleVerifyAccount(profileName: string, provider: string) {
        try {
            this._panel.webview.postMessage({
                command: 'verificationStarted',
                profileName,
                provider
            });

            const account = await this.chromeProfileManager.verifyAccount(
                profileName,
                provider as any
            );

            this._panel.webview.postMessage({
                command: 'accountVerified',
                profileName,
                provider,
                account: {
                    email: account.email,
                    verified: account.verified
                }
            });

            if (account.verified) {
                vscode.window.showInformationMessage(
                    `✅ Verified: ${account.email || 'Logged in'} (${provider})`
                );
            } else {
                vscode.window.showWarningMessage(
                    `⚠️ Could not verify login for ${provider} in ${profileName}`
                );
            }

        } catch (error: any) {
            this.logger.error('Error verifying account', error);
            vscode.window.showErrorMessage(
                `Error verifying account: ${error.message}`
            );
        }
    }

    private async handleOpenProfile(profileName: string, provider: string) {
        try {
            await this.chromeProfileManager.openInBrowser(
                profileName,
                provider as any
            );
        } catch (error: any) {
            this.logger.error('Error opening profile', error);
            vscode.window.showErrorMessage(
                `Error opening profile: ${error.message}`
            );
        }
    }

    private async handleLoadIntents() {
        try {
            // Obtener todos los intents del workspace
            const intentsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!intentsPath) {
                this._panel.webview.postMessage({
                    command: 'intentsLoaded',
                    intents: []
                });
                return;
            }

            const bloomDir = path.join(intentsPath, '.bloom');
            const intentsDir = path.join(bloomDir, 'intents');

            if (!fs.existsSync(intentsDir)) {
                this._panel.webview.postMessage({
                    command: 'intentsLoaded',
                    intents: []
                });
                return;
            }

            const intentFiles = fs.readdirSync(intentsDir)
                .filter(f => f.endsWith('.json'));

            const intents = intentFiles.map(file => {
                const content = fs.readFileSync(
                    path.join(intentsDir, file),
                    'utf-8'
                );
                return JSON.parse(content);
            });

            this._panel.webview.postMessage({
                command: 'intentsLoaded',
                intents: intents.map(i => ({
                    id: i.id,
                    name: i.name,
                    description: i.description
                }))
            });

        } catch (error: any) {
            this.logger.error('Error loading intents', error);
        }
    }

    private async handleLoadMappings() {
        try {
            const mappings = await this.chromeProfileManager.listMappings();

            this._panel.webview.postMessage({
                command: 'mappingsLoaded',
                mappings: mappings.map(m => ({
                    intentId: m.intentId,
                    profileName: m.config.profileName,
                    provider: m.config.provider,
                    aiAccounts: {
                        [m.config.provider]: m.config.account
                    }
                }))
            });

        } catch (error: any) {
            this.logger.error('Error loading mappings', error);
        }
    }

    private async handleSaveIntentMapping(data: any) {
        try {
            await this.chromeProfileManager.saveIntentMapping(
                data.intentId,
                data.profileName,
                data.aiAccounts
            );

            vscode.window.showInformationMessage(
                `✅ Configuration saved for intent`
            );

            this._panel.webview.postMessage({
                command: 'mappingSaved',
                intentId: data.intentId
            });

            // Reload mappings
            await this.handleLoadMappings();

        } catch (error: any) {
            this.logger.error('Error saving mapping', error);
            vscode.window.showErrorMessage(
                `Error saving configuration: ${error.message}`
            );
        }
    }

    private async handleDeleteMapping(intentId: string) {
        try {
            await this.chromeProfileManager.deleteIntentMapping(intentId);
            
            vscode.window.showInformationMessage(
                `✅ Configuration removed`
            );

            this._panel.webview.postMessage({
                command: 'mappingDeleted',
                intentId: intentId
            });

            // Reload mappings
            await this.handleLoadMappings();

        } catch (error: any) {
            this.logger.error('Error deleting mapping', error);
            vscode.window.showErrorMessage(
                `Error deleting configuration: ${error.message}`
            );
        }
    }

    private async handleTestConnection(profile: string, account: string) {
        try {
            const result = await this.chromeProfileManager.testConnection(
                profile,
                account
            );

            if (result.success) {
                vscode.window.showInformationMessage(
                    `✅ Connection successful: ${account}`
                );
            } else {
                vscode.window.showWarningMessage(
                    `⚠️ Could not verify connection: ${result.message}`
                );
            }

            this._panel.webview.postMessage({
                command: 'connectionTested',
                success: result.success,
                profile: profile,
                account: account
            });

        } catch (error: any) {
            this.logger.error('Error testing connection', error);
            vscode.window.showErrorMessage(
                `Error testing connection: ${error.message}`
            );
        }
    }

    // ========================================================================
    // HTML GENERATION
    // ========================================================================

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const cssUri = webview.asWebviewUri(
            joinPath(this._extensionUri, 'src', 'ui', 'profileManager.css')
        );
        const jsUri = webview.asWebviewUri(
            joinPath(this._extensionUri, 'src', 'ui', 'profileManager.js')
        );

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
            <link href="${cssUri}" rel="stylesheet">
            <title>Chrome Profile Manager</title>
        </head>
        <body>
            <div class="container">
                <header class="header">
                    <h1>🌸 Bloom AI Bridge - Profile Manager</h1>
                    <p class="subtitle">Manage Chrome profiles and AI accounts for your intents</p>
                </header>

                <section class="section">
                    <div class="section-header">
                        <h2>👤 Chrome Profiles</h2>
                        <button id="scanButton" class="btn btn-primary">
                            <span class="icon">🔄</span>
                            Scan Profiles
                        </button>
                    </div>

                    <div id="profilesContainer" class="profiles-container">
                        <div class="empty-state">
                            <span class="empty-icon">👤</span>
                            <p>No profiles detected</p>
                            <p class="empty-hint">Click "Scan Profiles" to detect automatically</p>
                        </div>
                    </div>
                </section>

                <section class="section">
                    <div class="section-header">
                        <h2>⚙️ Intent → Profile Mappings</h2>
                        <button id="addMappingButton" class="btn btn-secondary">
                            <span class="icon">➕</span>
                            Add Mapping
                        </button>
                    </div>

                    <div id="mappingsContainer" class="mappings-container">
                        <div class="empty-state">
                            <span class="empty-icon">⚙️</span>
                            <p>No intent configurations</p>
                            <p class="empty-hint">Create an intent first, then assign a profile here</p>
                        </div>
                    </div>
                </section>

                <section class="section info-section">
                    <h3>ℹ️ How it works</h3>
                    <ol class="info-list">
                        <li>
                            <strong>Scan Profiles:</strong> Automatically detects all installed Chrome profiles
                        </li>
                        <li>
                            <strong>Account Verification:</strong> Identifies which AI accounts are logged in each profile
                        </li>
                        <li>
                            <strong>Assignment:</strong> Configure which profile and account to use for each intent
                        </li>
                        <li>
                            <strong>Automatic Execution:</strong> When executing an intent, the configured profile is used automatically
                        </li>
                    </ol>
                </section>
            </div>

            <div id="addMappingModal" class="modal" style="display: none;">
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Add Intent → Profile Mapping</h3>
                        <button id="closeModalButton" class="btn-close">✕</button>
                    </div>
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="intentSelect">Intent</label>
                            <select id="intentSelect" class="form-control">
                                <option value="">Select an intent...</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="profileSelect">Chrome Profile</label>
                            <select id="profileSelect" class="form-control">
                                <option value="">Select a profile...</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="providerSelect">AI Provider</label>
                            <select id="providerSelect" class="form-control">
                                <option value="claude">Claude</option>
                                <option value="chatgpt">ChatGPT</option>
                                <option value="grok">Grok</option>
                            </select>
                        </div>

                        <div class="form-group" id="accountGroup" style="display:none">
                            <label for="accountInput">Account (optional)</label>
                            <input type="text" id="accountInput" class="form-control" placeholder="email@example.com">
                            <button id="verifyAccountBtn" class="btn btn-secondary btn-sm" style="margin-top: 8px;">
                                Verify Login
                            </button>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="cancelMappingButton" class="btn btn-secondary">Cancel</button>
                        <button id="saveMappingButton" class="btn btn-primary">Save Mapping</button>
                    </div>
                </div>
            </div>

            <script nonce="${nonce}" src="${jsUri}"></script>
        </body>
        </html>`;
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}