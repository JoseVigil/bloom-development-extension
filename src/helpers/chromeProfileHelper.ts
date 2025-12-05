import * as path from 'path';
import * as fs from 'fs';
import { promisify } from 'util';
import { Logger } from '../utils/logger';

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// ============================================================================
// INTERFACES
// ============================================================================

/**
 * Información completa de un perfil según el Local State de Chrome
 */
export interface ChromeProfileInfo {
    // Identificadores
    directoryName: string;          // "Profile 9", "Default"
    displayName: string;            // "UiTool", "Work", "Personal"
    userName?: string;              // Email o username del perfil
    
    // Paths
    path: string;                   // Ruta absoluta al directorio del perfil
    
    // Metadata
    avatarIcon?: string;            // "chrome://theme/IDR_PROFILE_AVATAR_26"
    backgroundApps?: boolean;
    isUsingDefaultName?: boolean;   // Si el usuario cambió el nombre o no
    
    // Estado
    createdAt?: Date;
    lastUsed?: Date;
    activeTime?: number;
}

/**
 * Estructura del archivo Local State de Chrome
 */
interface LocalStateStructure {
    profile?: {
        info_cache?: {
            [profileDir: string]: {
                name: string;               // Display name
                user_name?: string;         // Email/username
                is_using_default_name?: boolean;
                avatar_icon?: string;
                background_apps?: boolean;
                is_using_default_avatar?: boolean;
                gaia_name?: string;
                gaia_given_name?: string;
                gaia_id?: string;
            };
        };
        last_used?: string;
        last_active_profiles?: string[];
    };
}

// ============================================================================
// CHROME PROFILE HELPER
// ============================================================================

export class ChromeProfileHelper {
    private userDataDir: string;
    private localState: LocalStateStructure | null = null;

    constructor(private logger: Logger) {
        this.userDataDir = this.getChromeUserDataDir();
    }

    // ========================================================================
    // PROFILE DISCOVERY & PARSING
    // ========================================================================

    /**
     * Obtiene TODOS los perfiles con su información completa
     */
    async getAllProfiles(): Promise<ChromeProfileInfo[]> {
        try {
            // 1. Cargar Local State
            await this.loadLocalState();

            // 2. Escanear directorios físicos
            const profileDirs = await this.scanProfileDirectories();

            // 3. Combinar información
            const profiles: ChromeProfileInfo[] = [];

            for (const dir of profileDirs) {
                const profile = await this.getProfileInfo(dir);
                if (profile) {
                    profiles.push(profile);
                }
            }

            this.logger.info(`Found ${profiles.length} Chrome profiles`);
            return profiles;

        } catch (error: any) {
            this.logger.error('Error getting all profiles', error);
            throw error;
        }
    }

    /**
     * Obtiene información de un perfil por su nombre de directorio
     * @param directoryName "Profile 9", "Default", etc.
     */
    async getProfileInfo(directoryName: string): Promise<ChromeProfileInfo | null> {
        try {
            await this.loadLocalState();

            const profilePath = path.join(this.userDataDir, directoryName);

            // Verificar que el directorio existe
            if (!fs.existsSync(profilePath)) {
                this.logger.warn(`Profile directory not found: ${profilePath}`);
                return null;
            }

            // Obtener info del Local State
            const stateInfo = this.localState?.profile?.info_cache?.[directoryName];

            if (!stateInfo) {
                this.logger.warn(`No info in Local State for: ${directoryName}`);
                return {
                    directoryName,
                    displayName: directoryName, // Fallback al nombre técnico
                    path: profilePath
                };
            }

            // Construir objeto completo
            const profile: ChromeProfileInfo = {
                directoryName,
                displayName: stateInfo.name || directoryName,
                userName: stateInfo.user_name,
                path: profilePath,
                avatarIcon: stateInfo.avatar_icon,
                backgroundApps: stateInfo.background_apps,
                isUsingDefaultName: stateInfo.is_using_default_name
            };

            return profile;

        } catch (error: any) {
            this.logger.error(`Error getting profile info for ${directoryName}`, error);
            return null;
        }
    }

    /**
     * Busca un perfil por su display name (ej: "UiTool")
     * @param displayName El nombre que el usuario ve
     */
    async findProfileByDisplayName(displayName: string): Promise<ChromeProfileInfo | null> {
        await this.loadLocalState();

        const infoCache = this.localState?.profile?.info_cache;
        if (!infoCache) {
            return null;
        }

        // Buscar en el cache
        for (const [directoryName, info] of Object.entries(infoCache)) {
            if (info.name === displayName) {
                return await this.getProfileInfo(directoryName);
            }
        }

        this.logger.warn(`No profile found with display name: ${displayName}`);
        return null;
    }

    /**
     * Busca un perfil por email/username
     */
    async findProfileByUserName(userName: string): Promise<ChromeProfileInfo | null> {
        await this.loadLocalState();

        const infoCache = this.localState?.profile?.info_cache;
        if (!infoCache) {
            return null;
        }

        for (const [directoryName, info] of Object.entries(infoCache)) {
            if (info.user_name === userName) {
                return await this.getProfileInfo(directoryName);
            }
        }

        return null;
    }

    /**
     * Obtiene el nombre de directorio desde el display name
     * Ejemplo: "UiTool" → "Profile 9"
     */
    async getDirectoryNameFromDisplayName(displayName: string): Promise<string | null> {
        const profile = await this.findProfileByDisplayName(displayName);
        return profile?.directoryName || null;
    }

    /**
     * Obtiene el display name desde el nombre de directorio
     * Ejemplo: "Profile 9" → "UiTool"
     */
    async getDisplayNameFromDirectoryName(directoryName: string): Promise<string | null> {
        const profile = await this.getProfileInfo(directoryName);
        return profile?.displayName || null;
    }

    // ========================================================================
    // LOCAL STATE MANAGEMENT
    // ========================================================================

    /**
     * Carga y parsea el archivo Local State de Chrome
     */
    private async loadLocalState(): Promise<void> {
        if (this.localState) {
            return; // Ya está cargado
        }

        try {
            const localStatePath = path.join(this.userDataDir, 'Local State');

            if (!fs.existsSync(localStatePath)) {
                this.logger.warn('Local State file not found');
                this.localState = {};
                return;
            }

            const content = await readFile(localStatePath, 'utf-8');
            this.localState = JSON.parse(content) as LocalStateStructure;

            this.logger.info('Local State loaded successfully');

        } catch (error: any) {
            this.logger.error('Error loading Local State', error);
            this.localState = {};
        }
    }

    /**
     * Refresca el Local State (útil si cambió externamente)
     */
    async refreshLocalState(): Promise<void> {
        this.localState = null;
        await this.loadLocalState();
    }

    /**
     * Obtiene la estructura completa del Local State
     */
    getLocalState(): LocalStateStructure | null {
        return this.localState;
    }

    // ========================================================================
    // DIRECTORY SCANNING
    // ========================================================================

    /**
     * Escanea físicamente los directorios de perfiles
     */
    private async scanProfileDirectories(): Promise<string[]> {
        try {
            if (!fs.existsSync(this.userDataDir)) {
                return [];
            }

            const entries = await readdir(this.userDataDir);
            const profileDirs: string[] = [];

            for (const entry of entries) {
                // Profiles válidos: "Default", "Profile 1", "Profile 2", etc.
                if (entry === 'Default' || /^Profile \d+$/.test(entry)) {
                    const fullPath = path.join(this.userDataDir, entry);
                    const stats = await stat(fullPath);

                    if (stats.isDirectory()) {
                        profileDirs.push(entry);
                    }
                }
            }

            return profileDirs;

        } catch (error: any) {
            this.logger.error('Error scanning profile directories', error);
            return [];
        }
    }

    // ========================================================================
    // SYSTEM PATHS
    // ========================================================================

    /**
     * Obtiene el directorio User Data de Chrome según el OS
     */
    private getChromeUserDataDir(): string {
        const platform = process.platform;
        const home = process.env.HOME || process.env.USERPROFILE || '';

        if (platform === 'win32') {
            return path.join(
                process.env.LOCALAPPDATA || '',
                'Google',
                'Chrome',
                'User Data'
            );
        } else if (platform === 'darwin') {
            return path.join(
                home,
                'Library',
                'Application Support',
                'Google',
                'Chrome'
            );
        } else if (platform === 'linux') {
            return path.join(home, '.config', 'google-chrome');
        } else {
            throw new Error(`Unsupported platform: ${platform}`);
        }
    }

    /**
     * Obtiene la ruta al ejecutable de Chrome
     */
    getChromeExecutablePath(): string {
        const platform = process.platform;

        if (platform === 'win32') {
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

            throw new Error('Chrome executable not found');

        } else if (platform === 'darwin') {
            return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

        } else if (platform === 'linux') {
            return 'google-chrome';

        } else {
            throw new Error(`Unsupported platform: ${platform}`);
        }
    }

    // ========================================================================
    // UTILITY METHODS
    // ========================================================================

    /**
     * Lista todos los perfiles con formato legible
     */
    async listProfilesSummary(): Promise<string[]> {
        const profiles = await this.getAllProfiles();
        
        return profiles.map(p => {
            const userName = p.userName ? ` (${p.userName})` : '';
            return `${p.displayName}${userName} → ${p.directoryName}`;
        });
    }

    /**
     * Valida si un perfil existe
     */
    async profileExists(directoryName: string): Promise<boolean> {
        const profilePath = path.join(this.userDataDir, directoryName);
        return fs.existsSync(profilePath);
    }

    /**
     * Obtiene estadísticas de uso del perfil
     */
    async getProfileStats(directoryName: string): Promise<{
        size: number;
        lastModified: Date;
    } | null> {
        try {
            const profilePath = path.join(this.userDataDir, directoryName);
            const stats = await stat(profilePath);

            return {
                size: stats.size,
                lastModified: stats.mtime
            };

        } catch (error) {
            return null;
        }
    }
}

// ============================================================================
// EXPORT HELPER FUNCTION
// ============================================================================

/**
 * Función helper para uso rápido
 */
export async function resolveProfileName(
    displayOrDirectoryName: string,
    logger: Logger
): Promise<{ directory: string; display: string }> {
    const helper = new ChromeProfileHelper(logger);

    // Intentar primero como display name
    let profile = await helper.findProfileByDisplayName(displayOrDirectoryName);

    // Si no se encontró, intentar como directory name
    if (!profile) {
        profile = await helper.getProfileInfo(displayOrDirectoryName);
    }

    if (!profile) {
        throw new Error(`Profile not found: ${displayOrDirectoryName}`);
    }

    return {
        directory: profile.directoryName,
        display: profile.displayName
    };
}