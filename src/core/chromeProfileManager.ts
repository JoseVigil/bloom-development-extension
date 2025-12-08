import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { Logger } from '../utils/logger';
import { IntentProfileConfig } from '../models/intent';
import { ChromeProfileHelper, resolveProfileName } from '../helpers/chromeProfileHelper';

const exec = promisify(execCallback);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// ============================================================================
// INTERFACES
// ============================================================================

export interface ChromeProfile {
    name: string;
    path: string;
    displayName?: string;
    accounts: DetectedAccount[];
}

export interface DetectedAccount {
    provider: 'claude' | 'chatgpt' | 'grok';
    email?: string;
    verified: boolean;
    lastCheck?: Date;
}

interface ProfileMapping {
    intentId: string;
    config: IntentProfileConfig;
    createdAt: Date;
    updatedAt: Date;
}

interface ActiveProfileState {
    profileName: string;
    displayName?: string;
    lastUsed: string;
}

// ============================================================================
// CHROME PROFILE MANAGER
// ============================================================================

export class ChromeProfileManager {
    private readonly configFile: string;
    private readonly activeProfileFile: string;
    private mappings: Map<string, IntentProfileConfig> = new Map();
    private profileHelper: ChromeProfileHelper;
    private activeProfile: ActiveProfileState | null = null;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {
        const storagePath = context.globalStorageUri.fsPath;
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
        this.configFile = path.join(storagePath, 'profile-mappings.json');
        this.activeProfileFile = path.join(storagePath, 'active-profile.json');
        this.loadMappings();
        this.loadActiveProfile();
        this.profileHelper = new ChromeProfileHelper(logger);
    }

    // ========================================================================
    // MÉTODOS CRÍTICOS - NUEVOS
    // ========================================================================

    /**
     * Permite al usuario seleccionar un perfil de Chrome de forma interactiva
     */
    async selectProfileInteractive(): Promise<void> {
        try {
            const profiles = await this.detectProfiles();

            if (profiles.length === 0) {
                vscode.window.showWarningMessage('No Chrome profiles found');
                return;
            }

            const items = profiles.map(profile => ({
                label: profile.displayName || profile.name,
                description: profile.name !== profile.displayName ? profile.name : undefined,
                detail: `Path: ${profile.path}`,
                profile: profile
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a Chrome profile',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (!selected) {
                return;
            }

            await this.setActiveProfile(
                selected.profile.name,
                selected.profile.displayName
            );

            vscode.window.showInformationMessage(
                `✅ Active profile set to: ${selected.label}`
            );

            this.logger.info(`Active profile changed to: ${selected.label} (${selected.profile.name})`);

        } catch (error: any) {
            this.logger.error('Error selecting profile interactively', error);
            vscode.window.showErrorMessage(
                `Failed to select profile: ${error.message}`
            );
        }
    }

    /**
     * Abre Chrome con el perfil actualmente seleccionado
     */
    async launchChromeWithActiveProfile(): Promise<void> {
        try {
            if (!this.activeProfile) {
                const shouldSelect = await vscode.window.showInformationMessage(
                    'No active Chrome profile selected',
                    'Select Profile',
                    'Cancel'
                );

                if (shouldSelect === 'Select Profile') {
                    await this.selectProfileInteractive();
                    if (!this.activeProfile) {
                        return;
                    }
                } else {
                    return;
                }
            }

            await this.openInBrowser(
                this.activeProfile.profileName,
                'claude'
            );

            this.logger.info(`Launched Chrome with active profile: ${this.activeProfile.displayName || this.activeProfile.profileName}`);

        } catch (error: any) {
            this.logger.error('Error launching Chrome with active profile', error);
            vscode.window.showErrorMessage(
                `Failed to launch Chrome: ${error.message}`
            );
        }
    }

    /**
     * Establece el perfil activo
     */
    private async setActiveProfile(profileName: string, displayName?: string): Promise<void> {
        this.activeProfile = {
            profileName,
            displayName,
            lastUsed: new Date().toISOString()
        };

        await this.saveActiveProfile();
    }

    /**
     * Obtiene el perfil activo actual
     */
    getActiveProfile(): ActiveProfileState | null {
        return this.activeProfile;
    }

    /**
     * Guarda el perfil activo a disco
     */
    private async saveActiveProfile(): Promise<void> {
        try {
            await writeFile(
                this.activeProfileFile,
                JSON.stringify(this.activeProfile, null, 2),
                'utf-8'
            );
        } catch (error: any) {
            this.logger.error('Error saving active profile', error);
        }
    }

    /**
     * Carga el perfil activo desde disco
     */
    private loadActiveProfile(): void {
        try {
            if (fs.existsSync(this.activeProfileFile)) {
                const content = fs.readFileSync(this.activeProfileFile, 'utf-8');
                this.activeProfile = JSON.parse(content);
                this.logger.info(`Loaded active profile: ${this.activeProfile?.displayName || this.activeProfile?.profileName}`);
            }
        } catch (error: any) {
            this.logger.warn(`Could not load active profile: ${error}`);
            this.activeProfile = null;
        }
    }

    /**
     * Abre Chrome con el perfil activo en un provider específico
     */
    async launchChromeWithProvider(
        provider: 'claude' | 'chatgpt' | 'grok',
        conversationId?: string
    ): Promise<void> {
        try {
            if (!this.activeProfile) {
                await this.selectProfileInteractive();
                if (!this.activeProfile) {
                    return;
                }
            }

            await this.openInBrowser(
                this.activeProfile.profileName,
                provider,
                conversationId
            );

        } catch (error: any) {
            this.logger.error('Error launching Chrome with provider', error);
            vscode.window.showErrorMessage(
                `Failed to launch ${provider}: ${error.message}`
            );
        }
    }

    // ========================================================================
    // MÉTODOS SECUNDARIOS - DELEGADOS A CHROME
    // ========================================================================

    /**
     * Delega la creación de perfil a Chrome
     */
    async createNewProfile(): Promise<void> {
        const action = await vscode.window.showInformationMessage(
            'To create a new Chrome profile, please use Chrome directly',
            'Open Chrome Settings',
            'Cancel'
        );

        if (action === 'Open Chrome Settings') {
            try {
                const chromePath = this.profileHelper.getChromeExecutablePath();
                let command: string;

                if (process.platform === 'darwin') {
                    command = `open -a "Google Chrome" --args --new-window "chrome://settings/manageProfile"`;
                } else if (process.platform === 'win32') {
                    command = `"${chromePath}" --new-window "chrome://settings/manageProfile"`;
                } else {
                    command = `google-chrome --new-window "chrome://settings/manageProfile"`;
                }

                await exec(command);
                this.logger.info('Opened Chrome profile settings');

            } catch (error: any) {
                this.logger.error('Error opening Chrome settings', error);
                vscode.window.showErrorMessage('Failed to open Chrome settings');
            }
        }
    }

    /**
     * Delega la edición de perfil a Chrome
     */
    async editProfile(item?: any): Promise<void> {
        let profileName: string | undefined;

        if (item?.profile) {
            profileName = item.profile.name;
        } else if (this.activeProfile) {
            profileName = this.activeProfile.profileName;
        }

        const action = await vscode.window.showInformationMessage(
            'To edit Chrome profile settings, please use Chrome directly',
            'Open Chrome Settings',
            'Cancel'
        );

        if (action === 'Open Chrome Settings') {
            try {
                const chromePath = this.profileHelper.getChromeExecutablePath();
                let command: string;

                if (profileName) {
                    const resolved = await this.resolveProfileName(profileName);
                    if (process.platform === 'darwin') {
                        command = `open -a "Google Chrome" --args --profile-directory="${resolved.directory}" --new-window "chrome://settings/manageProfile"`;
                    } else if (process.platform === 'win32') {
                        command = `"${chromePath}" --profile-directory="${resolved.directory}" --new-window "chrome://settings/manageProfile"`;
                    } else {
                        command = `google-chrome --profile-directory="${resolved.directory}" --new-window "chrome://settings/manageProfile"`;
                    }
                } else {
                    if (process.platform === 'darwin') {
                        command = `open -a "Google Chrome" --args --new-window "chrome://settings/manageProfile"`;
                    } else if (process.platform === 'win32') {
                        command = `"${chromePath}" --new-window "chrome://settings/manageProfile"`;
                    } else {
                        command = `google-chrome --new-window "chrome://settings/manageProfile"`;
                    }
                }

                await exec(command);
                this.logger.info('Opened Chrome profile settings for editing');

            } catch (error: any) {
                this.logger.error('Error opening Chrome settings', error);
                vscode.window.showErrorMessage('Failed to open Chrome settings');
            }
        }
    }

    /**
     * Delega la eliminación de perfil a Chrome
     */
    async deleteProfile(item?: any): Promise<void> {
        const warning = await vscode.window.showWarningMessage(
            'To delete a Chrome profile, please use Chrome directly to avoid data loss',
            'Open Chrome Settings',
            'Cancel'
        );

        if (warning === 'Open Chrome Settings') {
            try {
                const chromePath = this.profileHelper.getChromeExecutablePath();
                let command: string;

                if (process.platform === 'darwin') {
                    command = `open -a "Google Chrome" --args --new-window "chrome://settings/manageProfile"`;
                } else if (process.platform === 'win32') {
                    command = `"${chromePath}" --new-window "chrome://settings/manageProfile"`;
                } else {
                    command = `google-chrome --new-window "chrome://settings/manageProfile"`;
                }

                await exec(command);
                this.logger.info('Opened Chrome profile settings for deletion');

            } catch (error: any) {
                this.logger.error('Error opening Chrome settings', error);
                vscode.window.showErrorMessage('Failed to open Chrome settings');
            }
        }
    }

    // ========================================================================
    // DISCOVERY
    // ========================================================================

    async detectProfiles(): Promise<ChromeProfile[]> {
        try {
            const profileInfos = await this.profileHelper.getAllProfiles();
            const profiles: ChromeProfile[] = [];

            for (const info of profileInfos) {
                const profile: ChromeProfile = {
                    name: info.directoryName,
                    path: info.path,
                    displayName: info.displayName,
                    accounts: []
                };
                profile.accounts = await this.quickDetectAccounts(info.path);
                profiles.push(profile);
            }

            this.logger.info(`Detected ${profiles.length} Chrome profiles`);
            return profiles;
        } catch (error: any) {
            this.logger.error('Error detecting Chrome profiles', error);
            throw new Error(`Failed to detect Chrome profiles: ${error.message}`);
        }
    }

    private async quickDetectAccounts(profilePath: string): Promise<DetectedAccount[]> {
        const accounts: DetectedAccount[] = [];

        try {
            const cookiesPath = path.join(profilePath, 'Cookies');
            if (fs.existsSync(cookiesPath)) {
                const cookiesStat = await stat(cookiesPath);
                if (cookiesStat.size > 0) {
                    accounts.push({
                        provider: 'claude',
                        verified: false,
                        lastCheck: new Date()
                    });
                }
            }
        } catch (error: any) {
            this.logger.warn(`Could not detect accounts for profile: ${profilePath}, ${error}`);
        }

        return accounts;
    }

    // ========================================================================
    // VALIDATION
    // ========================================================================

    async verifyAccount(
        profileName: string,
        provider: 'claude' | 'chatgpt' | 'grok'
    ): Promise<DetectedAccount> {
        try {
            const scriptPath = path.join(
                this.context.extensionPath,
                'scripts',
                'web-bridge',
                'verify_account.py'
            );

            const profilePath = this.getProfilePath(profileName);
            const command = `python "${scriptPath}" --profile "${profilePath}" --provider ${provider}`;

            const { stdout } = await exec(command, { 
                timeout: 30000,
                env: { ...process.env }
            });

            const result = JSON.parse(stdout);

            const account: DetectedAccount = {
                provider,
                email: result.email || undefined,
                verified: result.logged_in || false,
                lastCheck: new Date()
            };

            this.logger.info(`Account verification: ${provider} - ${account.email || 'not logged in'}`);
            
            return account;

        } catch (error: any) {
            this.logger.error(`Error verifying account for ${provider}`, error);
            
            return {
                provider,
                verified: false,
                lastCheck: new Date()
            };
        }
    }

    // ========================================================================
    // PERSISTENCE
    // ========================================================================

    public async saveIntentMapping(data: {
        intentId: string;
        profileName: string;
        aiAccounts?: { claude?: string; chatgpt?: string; grok?: string };
    }) {
        try {
            const mappingsPath = path.join(this.context.globalStorageUri.fsPath, 'profile-mappings.json');
            
            let mappings: any[] = [];
            if (fs.existsSync(mappingsPath)) {
                const content = await readFile(mappingsPath, 'utf-8');
                mappings = JSON.parse(content);
            }

            mappings = mappings.filter(m => m.intentId !== data.intentId);

            mappings.push({
                intentId: data.intentId,
                profileName: data.profileName,
                aiAccounts: data.aiAccounts || {},
                updatedAt: new Date().toISOString()
            });

            await writeFile(mappingsPath, JSON.stringify(mappings, null, 2));
            this.logger.info(`Mapping guardado para intent ${data.intentId}`);
        } catch (err: any) {
            this.logger.error('Error guardando mapping', err);
            throw err;
        }
    }

    async loadIntentMapping(intentId: string): Promise<IntentProfileConfig | null> {
        return this.mappings.get(intentId) || null;
    }

    async deleteIntentMapping(intentId: string): Promise<void> {
        this.mappings.delete(intentId);
        await this.saveMappings();
        this.logger.info(`Deleted profile mapping for intent: ${intentId}`);
    }

    async listMappings(): Promise<Array<{ intentId: string; config: IntentProfileConfig }>> {
        return Array.from(this.mappings.entries()).map(([intentId, config]) => ({
            intentId,
            config
        }));
    }

    private async saveMappings(): Promise<void> {
        try {
            const data = Array.from(this.mappings.entries()).map(([intentId, config]) => ({
                intentId,
                config,
                updatedAt: new Date().toISOString()
            }));

            await writeFile(this.configFile, JSON.stringify(data, null, 2), 'utf-8');

        } catch (error: any) {
            this.logger.error('Error saving mappings to disk', error);
        }
    }

    private loadMappings(): void {
        try {
            if (fs.existsSync(this.configFile)) {
                const content = fs.readFileSync(this.configFile, 'utf-8');
                const data = JSON.parse(content);

                this.mappings.clear();
                for (const item of data) {
                    this.mappings.set(item.intentId, item.config);
                }

                this.logger.info(`Loaded ${this.mappings.size} profile mappings`);
            }
        } catch (error: any) {
            this.logger.warn(`Could not load mappings from disk: ${error}`);
        }
    }

    // ========================================================================
    // PROFILE RESOLUTION
    // ========================================================================

    async resolveProfileName(profileName: string): Promise<{
        directory: string;
        display: string;
        path: string;
    }> {
        try {
            const resolved = await resolveProfileName(profileName, this.logger);
            const info = await this.profileHelper.getProfileInfo(resolved.directory);
            if (!info) {
                throw new Error(`Could not get profile info for: ${profileName}`);
            }
            return {
                directory: resolved.directory,
                display: resolved.display,
                path: info.path
            };
        } catch (error: any) {
            this.logger.error(`Error resolving profile name: ${profileName}`, error);
            throw error;
        }
    }

    async getProfileByName(name: string): Promise<ChromeProfile | null> {
        try {
            const resolved = await this.resolveProfileName(name);
            const profiles = await this.detectProfiles();
           
            return profiles.find(p => p.name === resolved.directory) || null;
        } catch (error) {
            return null;
        }
    }

    // ========================================================================
    // BROWSER LAUNCH
    // ========================================================================

    async openInBrowser(
        profileName: string,
        provider: 'claude' | 'chatgpt' | 'grok',
        conversationId?: string
    ): Promise<void> {
        try {
            const resolved = await this.resolveProfileName(profileName);
            const chromePath = this.profileHelper.getChromeExecutablePath();
            const urls = this.getProviderUrls(provider, conversationId);
            let command: string;

            if (process.platform === 'darwin') {
                command = `open -a "Google Chrome" --args --profile-directory="${resolved.directory}" "${urls.target}"`;
            } else if (process.platform === 'win32') {
                command = `"${chromePath}" --profile-directory="${resolved.directory}" "${urls.target}"`;
            } else {
                throw new Error(`Unsupported platform: ${process.platform}`);
            }

            this.logger.info(`Opening browser: ${provider} with profile ${resolved.display} (${resolved.directory})`);
            await exec(command);

            const message = conversationId
                ? `✅ Opened ${provider} conversation in ${resolved.display}`
                : `✅ Opened ${provider} in ${resolved.display}`;

            vscode.window.showInformationMessage(message, 'OK');

        } catch (error: any) {
            this.logger.error('Error opening browser', error);
           
            vscode.window.showErrorMessage(
                `Failed to open Chrome: ${error.message}`,
                'Retry'
            ).then(selection => {
                if (selection === 'Retry') {
                    this.openInBrowser(profileName, provider, conversationId);
                }
            });
        }
    }

    async testConnection(
        profileName: string,
        account: string
    ): Promise<{ success: boolean; message?: string }> {
        try {
            await this.openInBrowser(profileName, 'claude');
            
            return {
                success: true,
                message: `Connection test successful for ${profileName}`
            };

        } catch (error: any) {
            return {
                success: false,
                message: error.message
            };
        }
    }

    // ========================================================================
    // HELPERS
    // ========================================================================

    private getChromeExecutablePath(): string {
        return this.profileHelper.getChromeExecutablePath();
    }

    private getChromeUserDataDir(): string {
        const platform = process.platform;
        const home = process.env.HOME || process.env.USERPROFILE || '';

        if (platform === 'win32') {
            return path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
        } else if (platform === 'darwin') {
            return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome');
        } else {
            throw new Error(`Unsupported platform: ${platform}`);
        }
    }

    private getProfilePath(profileName: string): string {
        const userDataDir = this.getChromeUserDataDir();
        return path.join(userDataDir, profileName);
    }

    private getProviderUrls(
        provider: 'claude' | 'chatgpt' | 'grok',
        conversationId?: string
    ): { target: string; base: string } {
        const urls = {
            claude: {
                base: 'https://claude.ai/chat',
                target: conversationId
                    ? `https://claude.ai/chat/${conversationId}`
                    : 'https://claude.ai/chat'
            },
            chatgpt: {
                base: 'https://chat.openai.com',
                target: conversationId
                    ? `https://chat.openai.com/c/${conversationId}`
                    : 'https://chat.openai.com'
            },
            grok: {
                base: 'https://x.com/i/grok',
                target: 'https://x.com/i/grok'
            }
        };

        return urls[provider];
    }

    async getDefaultConfig(): Promise<IntentProfileConfig> {
        const profiles = await this.detectProfiles();
        
        const defaultProfile = profiles.find(p => p.name === 'Default') || profiles[0];

        if (!defaultProfile) {
            throw new Error('No Chrome profiles found');
        }

        return {
            profileName: defaultProfile.name,
            provider: 'claude',
            account: undefined
        };
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    async listAllProfiles(): Promise<void> {
        const summary = await this.profileHelper.listProfilesSummary();
       
        vscode.window.showQuickPick(summary, {
            placeHolder: 'Chrome Profiles Found',
            canPickMany: false
        });
    }

    async searchProfile(query: string): Promise<ChromeProfile | null> {
        let profile = await this.profileHelper.findProfileByDisplayName(query);
       
        if (!profile) {
            profile = await this.profileHelper.getProfileInfo(query);
        }

        if (!profile) {
            profile = await this.profileHelper.findProfileByUserName(query);
        }

        if (!profile) {
            return null;
        }

        return {
            name: profile.directoryName,
            path: profile.path,
            displayName: profile.displayName,
            accounts: await this.quickDetectAccounts(profile.path)
        };
    }

    public async getAllIntents(): Promise<any[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return [];

        const intentsPath = path.join(workspaceFolder.uri.fsPath, '.bloom', 'intents');
        if (!fs.existsSync(intentsPath)) return [];

        const files = fs.readdirSync(intentsPath).filter(f => f.endsWith('.json'));
        const intents = [];

        for (const file of files) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(intentsPath, file), 'utf-8'));
                if (data.metadata?.name) {
                    intents.push({
                        id: data.metadata.id,
                        name: data.metadata.name
                    });
                }
            } catch {}
        }
        return intents;
    }

    public async getAllMappings(): Promise<any[]> {
        return [];
    }
}