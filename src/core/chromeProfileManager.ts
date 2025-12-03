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
    private profileHelper: ChromeProfileHelper; // ← NUEVO
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
       
        // Inicializar helper
        this.profileHelper = new ChromeProfileHelper(logger);
    }

    // ========================================================================
    // DISCOVERY - MEJORADO
    // ========================================================================
    /**
     * Detecta todos los profiles de Chrome instalados
     * MEJORADO: Usa ChromeProfileHelper para obtener nombres reales
     */
    async detectProfiles(): Promise<ChromeProfile[]> {
        try {
            // Usar el helper para obtener toda la info
            const profileInfos = await this.profileHelper.getAllProfiles();
            const profiles: ChromeProfile[] = [];
            for (const info of profileInfos) {
                const profile: ChromeProfile = {
                    name: info.directoryName, // "Profile 9"
                    path: info.path,
                    displayName: info.displayName, // "UiTool" ← EL NOMBRE REAL
                    accounts: []
                };
                // Detección rápida de cuentas
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

        console.log(`Accounts for profile ${profilePath}:`, accounts);
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

    /**
     * Guarda mapping de intent → profile config
     */
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

            // Eliminar si ya existe
            mappings = mappings.filter(m => m.intentId !== data.intentId);

            // Agregar nueva
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
    // PROFILE RESOLUTION - NUEVO
    // ========================================================================
    /**
     * Resuelve un nombre de perfil (puede ser display name o directory name)
     * Ejemplo: "UiTool" → { directory: "Profile 9", display: "UiTool" }
     */
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
    /**
     * Obtiene el perfil completo por display name o directory name
     */
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
    // BROWSER LAUNCH - MEJORADO
    // ========================================================================
    /**
     * Abre Chrome con el profile especificado
     * MEJORADO: Acepta tanto display name ("UiTool") como directory name ("Profile 9")
     */
    async openInBrowser(
        profileName: string, // Puede ser "UiTool" o "Profile 9"
        provider: 'claude' | 'chatgpt' | 'grok',
        conversationId?: string
    ): Promise<void> {
        try {
            // Resolver el nombre a directory name
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
    // HELPERS - ACTUALIZADO
    // ========================================================================
    /**
     * DEPRECADO: Usar profileHelper.getChromeExecutablePath() directamente
     */
    private getChromeExecutablePath(): string {
        return this.profileHelper.getChromeExecutablePath();
    }
    /**
     * DEPRECADO: Usar profileHelper.getChromeUserDataDir() directamente
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

    // ========================================================================
    // UTILITY METHODS - NUEVO
    // ========================================================================
    /**
     * Lista todos los perfiles con información legible
     */
    async listAllProfiles(): Promise<void> {
        const summary = await this.profileHelper.listProfilesSummary();
       
        vscode.window.showQuickPick(summary, {
            placeHolder: 'Chrome Profiles Found',
            canPickMany: false
        });
    }
    /**
     * Busca un perfil de manera flexible
     */
    async searchProfile(query: string): Promise<ChromeProfile | null> {
        // Intentar por display name
        let profile = await this.profileHelper.findProfileByDisplayName(query);
       
        if (!profile) {
            // Intentar por directory name
            profile = await this.profileHelper.getProfileInfo(query);
        }
        if (!profile) {
            // Intentar por email/username
            profile = await this.profileHelper.findProfileByUserName(query);
        }
        if (!profile) {
            return null;
        }
        // Convertir a ChromeProfile
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
        // Implementación básica - podés mejorarla después
        return [];
    }
}