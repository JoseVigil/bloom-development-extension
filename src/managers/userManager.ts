// src/managers/userManager.ts
import * as vscode from 'vscode';

export interface BloomUser {
    githubUsername: string;
    githubOrg: string;          
    allOrgs: string[];         
    registeredAt: number;
}

/**
 * UserManager - Singleton para gestionar usuario y registro
 * Version: v3 (usa bloom.user.v3 en globalState)
 */
export class UserManager {
    private static instance: UserManager;
    private context: vscode.ExtensionContext;

    // Secret storage keys
    private readonly GITHUB_TOKEN_KEY = 'bloom.github.token';
    private readonly GEMINI_API_KEY = 'bloom.gemini.apiKey';

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Inicializa o retorna instancia singleton
     */
    static init(context: vscode.ExtensionContext): UserManager {
        if (!UserManager.instance) {
            UserManager.instance = new UserManager(context);
        }
        return UserManager.instance;
    }

    /**
     * Obtiene usuario actual (v3)
     */
    getUser(): BloomUser | null {
        const user = this.context.globalState.get<BloomUser>('bloom.user.v3');
        return user ?? null;
    }

    /**
     * Guarda usuario (v3)
     */
    async saveUser(data: {
        githubUsername: string;
        githubOrg?: string;
        allOrgs?: string[];
    }): Promise<void> {
        const finalUser: BloomUser = {
            githubUsername: data.githubUsername.trim().replace('@', ''),
            githubOrg: (data.githubOrg?.trim() || data.githubUsername.trim().replace('@', '')),
            allOrgs: data.allOrgs || [data.githubUsername.trim().replace('@', '')],
            registeredAt: Date.now()
        };

        await this.context.globalState.update('bloom.user.v3', finalUser);
        await vscode.commands.executeCommand('setContext', 'bloom.isRegistered', true);
    }

    /**
     * Verifica si el usuario está registrado
     */
    isRegistered(): boolean {
        const user = this.getUser();
        return !!user?.githubUsername && !!user?.allOrgs?.length;
    }

    /**
     * Limpia registro (para debug/reset)
     */
    async clear(): Promise<void> {
        await this.context.globalState.update('bloom.user.v3', undefined);
        await this.context.secrets.delete(this.GITHUB_TOKEN_KEY);
        await this.context.secrets.delete(this.GEMINI_API_KEY);
        await vscode.commands.executeCommand('setContext', 'bloom.isRegistered', false);
    }

    /**
     * Método estático para obtener datos (usado por comandos)
     */
    static async getUserData(): Promise<BloomUser | null> {
        const context = this.instance?.context;
        if (!context) return null;
        
        const user = context.globalState.get<BloomUser>('bloom.user.v3');
        return user ?? null;
    }

    // ========================================
    // GITHUB OAUTH METHODS
    // ========================================

    /**
     * Almacena el token de GitHub en SecretStorage
     */
    async setGithubToken(token: string): Promise<void> {
        await this.context.secrets.store(this.GITHUB_TOKEN_KEY, token);
    }

    /**
     * Obtiene el token de GitHub desde SecretStorage
     */
    async getGithubToken(): Promise<string | undefined> {
        return await this.context.secrets.get(this.GITHUB_TOKEN_KEY);
    }

    /**
     * Establece el usuario y organizaciones de GitHub
     */
    async setGithubUser(username: string, orgs: string[]): Promise<void> {
        await this.saveUser({
            githubUsername: username,
            githubOrg: orgs[0] || username,
            allOrgs: orgs
        });
    }

    /**
     * Obtiene el username de GitHub
     */
    async getGithubUsername(): Promise<string | undefined> {
        const user = this.getUser();
        return user?.githubUsername;
    }

    /**
     * Obtiene las organizaciones de GitHub
     */
    async getGithubOrgs(): Promise<string[]> {
        const user = this.getUser();
        return user?.allOrgs || [];
    }

    /**
     * Verifica si el usuario está autenticado en GitHub
     */
    async isGithubAuthenticated(): Promise<boolean> {
        const token = await this.getGithubToken();
        const user = this.getUser();
        return !!token && !!user?.githubUsername;
    }

    // ========================================
    // GEMINI API METHODS
    // ========================================

    /**
     * Almacena la API Key de Gemini
     */
    async setGeminiApiKey(apiKey: string): Promise<void> {
        await this.context.secrets.store(this.GEMINI_API_KEY, apiKey);
    }

    /**
     * Obtiene la API Key de Gemini
     */
    async getGeminiApiKey(): Promise<string | undefined> {
        return await this.context.secrets.get(this.GEMINI_API_KEY);
    }

    /**
     * Verifica si Gemini está configurado
     */
    async isGeminiConfigured(): Promise<boolean> {
        const apiKey = await this.getGeminiApiKey();
        return !!apiKey;
    }

    // ========================================
    // LEGACY SUPPORT (para migración desde v1)
    // ========================================

    /**
     * Migra usuario de v1 (bloom.user.email) a v3
     * Se ejecuta automáticamente en primera carga
     */
    async migrateFromV1(): Promise<boolean> {
        // Si ya hay usuario v3, no migrar
        if (this.getUser()) {
            return false;
        }

        // Intentar leer datos v1
        const email = this.context.globalState.get<string>('bloom.user.email');

        if (!email) {
            return false; // No hay nada que migrar
        }

        // Convertir a v3 format
        const username = email.split('@')[0]; // username aproximado

        await this.saveUser({
            githubUsername: username,
            githubOrg: username,
            allOrgs: [username]
        });

        // Limpiar datos v1
        await this.context.globalState.update('bloom.user.email', undefined);
        await this.context.globalState.update('bloom.user.name', undefined);
        await this.context.globalState.update('bloom.user.registeredAt', undefined);
        await this.context.globalState.update('bloom.user.acceptedTerms', undefined);

        console.log('[UserManager] Migrated user from v1 to v3');
        return true;
    }

    /**
     * Obtiene datos legacy (v1) si existen
     * Solo para debug/troubleshooting
     */
    getLegacyUser(): any {
        return {
            email: this.context.globalState.get<string>('bloom.user.email'),
            name: this.context.globalState.get<string>('bloom.user.name'),
            registeredAt: this.context.globalState.get<string>('bloom.user.registeredAt'),
            acceptedTerms: this.context.globalState.get<boolean>('bloom.user.acceptedTerms')
        };
    }

    // ========================================
    // GLOBAL STATE ACCESS
    // ========================================

    /**
     * Proporciona acceso al globalState para compatibilidad
     */
    get globalState(): vscode.Memento {
        return this.context.globalState;
    }
}