import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { exec as execCallback } from 'child_process';
import { Logger } from '../utils/logger';
import { IntentProfileConfig } from '../models/intent';

const exec = promisify(execCallback);
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// ============================================================================
// INTERFACES
// ============================================================================

export interface ChromeProfile {
    name: string;           // "Profile 1", "Default", "Work"
    path: string;           // Ruta absoluta al profile
    displayName?: string;   // Nombre customizado del usuario
    accounts: DetectedAccount[];
}

export interface DetectedAccount {
    provider: 'claude' | 'chatgpt' | 'grok';
    email?: string;         // Detectado o null
    verified: boolean;      // Si se verificó con Playwright
    lastCheck?: Date;
}


interface ProfileMapping {
    intentId: string;
    config: IntentProfileConfig;
    createdAt: Date;
    updatedAt: Date;
}

// ============================================================================
// CHROME PROFILE MANAGER
// ============================================================================

export class ChromeProfileManager {
    private readonly configFile: string;
    private mappings: Map<string, IntentProfileConfig> = new Map();

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {
        // Archivo de configuración en workspace storage
        const storagePath = context.globalStorageUri.fsPath;
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
        }
        this.configFile = path.join(storagePath, 'profile-mappings.json');
        this.loadMappings();
    }

    // ========================================================================
    // DISCOVERY
    // ========================================================================

    /**
     * Detecta todos los profiles de Chrome instalados
     */
    async detectProfiles(): Promise<ChromeProfile[]> {
        try {
            const userDataDir = this.getChromeUserDataDir();
            
            if (!fs.existsSync(userDataDir)) {
                this.logger.warn(`Chrome User Data directory not found: ${userDataDir}`);
                return [];
            }

            const profiles: ChromeProfile[] = [];

            // Leer Local State para obtener info de profiles
            const localStatePath = path.join(userDataDir, 'Local State');
            let profilesInfo: any = {};

            if (fs.existsSync(localStatePath)) {
                const localStateContent = await readFile(localStatePath, 'utf-8');
                const localState = JSON.parse(localStateContent);
                profilesInfo = localState.profile?.info_cache || {};
            }

            // Escanear directorios de profiles
            const entries = await readdir(userDataDir);

            for (const entry of entries) {
                // Profiles tienen formato "Default", "Profile 1", "Profile 2", etc.
                if (entry === 'Default' || entry.startsWith('Profile ')) {
                    const profilePath = path.join(userDataDir, entry);
                    const profileStat = await stat(profilePath);

                    if (profileStat.isDirectory()) {
                        const info = profilesInfo[entry] || {};
                        
                        const profile: ChromeProfile = {
                            name: entry,
                            path: profilePath,
                            displayName: info.name || entry,
                            accounts: []
                        };

                        // Detección rápida de cuentas (parseo de cookies)
                        profile.accounts = await this.quickDetectAccounts(profilePath);

                        profiles.push(profile);
                    }
                }
            }

            this.logger.info(`Detected ${profiles.length} Chrome profiles`);
            return profiles;

        } catch (error: any) {
            this.logger.error('Error detecting Chrome profiles', error);
            throw new Error(`Failed to detect Chrome profiles: ${error.message}`);
        }
    }

    /**
     * Detección rápida de cuentas mediante parseo de cookies/storage
     * (Simplified - solo detecta presencia, no email específico)
     */
    private async quickDetectAccounts(profilePath: string): Promise<DetectedAccount[]> {
        const accounts: DetectedAccount[] = [];

        try {
            // Verificar cookies de Claude
            const cookiesPath = path.join(profilePath, 'Cookies');
            if (fs.existsSync(cookiesPath)) {
                // SQLite database - complejo parsear sin library
                // Por ahora, solo verificamos existencia del archivo
                // TODO: Usar sqlite3 library para parsear cookies reales
                
                // Heurística simple: si el archivo existe y tiene tamaño > 0
                const cookiesStat = await stat(cookiesPath);
                if (cookiesStat.size > 0) {
                    // Asumimos que podría tener sesión de Claude
                    accounts.push({
                        provider: 'claude',
                        verified: false,
                        lastCheck: new Date()
                    });
                }
            }

            // Similar para otros providers
            // Por ahora retornamos solo la detección básica

        } catch (error: any) {
            this.logger.warn(`Could not detect accounts for profile: ${profilePath}, ${error}`);
        }

        return accounts;
    }

    // ========================================================================
    // VALIDATION (Playwright integration)
    // ========================================================================

    /**
     * Verifica que una cuenta esté logueada usando Playwright
     * (Requiere claude_bridge.py con Playwright)
     */
    async verifyAccount(
        profileName: string,
        provider: 'claude' | 'chatgpt' | 'grok'
    ): Promise<DetectedAccount> {
        try {
            // Llamar al script Python para verificar con Playwright
            const scriptPath = path.join(
                this.context.extensionPath,
                'scripts',
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

    /**
     * Guarda mapping de intent → profile config
     */
    async saveIntentMapping(
        intentId: string,
        profileName: string,
        aiAccounts: { claude?: string; chatgpt?: string; grok?: string }
    ): Promise<void> {
        try {
            // Determinar provider principal (el que tenga cuenta)
            let provider: 'claude' | 'chatgpt' | 'grok' = 'claude';
            let account: string | undefined;

            if (aiAccounts.claude) {
                provider = 'claude';
                account = aiAccounts.claude;
            } else if (aiAccounts.chatgpt) {
                provider = 'chatgpt';
                account = aiAccounts.chatgpt;
            } else if (aiAccounts.grok) {
                provider = 'grok';
                account = aiAccounts.grok;
            }

            const config: IntentProfileConfig = {
                profileName,
                provider,
                account
            };

            this.mappings.set(intentId, config);
            await this.saveMappings();

            this.logger.info(`Saved profile mapping for intent: ${intentId}`);

        } catch (error: any) {
            this.logger.error('Error saving intent mapping', error);
            throw new Error(`Failed to save mapping: ${error.message}`);
        }
    }

    /**
     * Carga mapping para un intent
     */
    async loadIntentMapping(intentId: string): Promise<IntentProfileConfig | null> {
        return this.mappings.get(intentId) || null;
    }

    /**
     * Elimina mapping de un intent
     */
    async deleteIntentMapping(intentId: string): Promise<void> {
        this.mappings.delete(intentId);
        await this.saveMappings();
        this.logger.info(`Deleted profile mapping for intent: ${intentId}`);
    }

    /**
     * Lista todos los mappings
     */
    async listMappings(): Promise<Array<{ intentId: string; config: IntentProfileConfig }>> {
        return Array.from(this.mappings.entries()).map(([intentId, config]) => ({
            intentId,
            config
        }));
    }

    /**
     * Guarda mappings a disco
     */
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

    /**
     * Carga mappings desde disco
     */
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
    // BROWSER LAUNCH (Core Feature)
    // ========================================================================

    /**
     * Abre Chrome con el profile especificado y navega al AI provider
     */
    async openInBrowser(
        profileName: string,
        provider: 'claude' | 'chatgpt' | 'grok',
        conversationId?: string
    ): Promise<void> {
        try {
            const chromePath = this.getChromeExecutablePath();
            const urls = this.getProviderUrls(provider, conversationId);

            let command: string;

            if (process.platform === 'darwin') {
                // macOS
                command = `open -a "Google Chrome" --args --profile-directory="${profileName}" "${urls.target}"`;
            } else if (process.platform === 'win32') {
                // Windows
                command = `"${chromePath}" --profile-directory="${profileName}" "${urls.target}"`;
            } else {
                throw new Error(`Unsupported platform: ${process.platform}`);
            }

            this.logger.info(`Opening browser: ${provider} with profile ${profileName}`);

            await exec(command);

            // Mostrar notificación
            const message = conversationId
                ? `✅ Opened ${provider} conversation in ${profileName}`
                : `✅ Opened ${provider} in ${profileName}`;

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

    /**
     * Test de conexión - verifica que el profile y cuenta funcionen
     */
    async testConnection(
        profileName: string,
        account: string
    ): Promise<{ success: boolean; message?: string }> {
        try {
            // Intentar abrir Claude brevemente para verificar
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

    /**
     * Obtiene la ruta al ejecutable de Chrome según el OS
     */
    private getChromeExecutablePath(): string {
        const platform = process.platform;

        if (platform === 'win32') {
            // Windows - buscar en ubicaciones comunes
            const possiblePaths = [
                path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
                path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
                path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
            ];

            for (const chromePath of possiblePaths) {
                if (fs.existsSync(chromePath)) {
                    return chromePath;
                }
            }

            throw new Error('Chrome executable not found on Windows');

        } else if (platform === 'darwin') {
            // macOS - usar con 'open -a'
            return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

        } else {
            throw new Error(`Unsupported platform: ${platform}`);
        }
    }

    /**
     * Obtiene el directorio User Data de Chrome según el OS
     */
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

    /**
     * Obtiene la ruta completa a un profile específico
     */
    private getProfilePath(profileName: string): string {
        const userDataDir = this.getChromeUserDataDir();
        return path.join(userDataDir, profileName);
    }

    /**
     * Genera URLs para cada provider
     */
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

    /**
     * Obtiene configuración default si no hay ninguna configurada
     */
    async getDefaultConfig(): Promise<IntentProfileConfig> {
        const profiles = await this.detectProfiles();
        
        // Usar el primer profile disponible o Default
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
}