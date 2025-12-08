// src/ai/AiAccountChecker.ts
import * as vscode from 'vscode';
import { UserManager } from '../managers/userManager';
import { WebSocketManager } from '../server/WebSocketManager';
import { GrokAdapter } from './adapters/GrokAdapter';
import { ClaudeAdapter } from './adapters/ClaudeAdapter';
import { ChatGPTAdapter } from './adapters/ChatGPTAdapter';
import { GeminiAdapter } from './adapters/GeminiAdapter';
import type { AiAccountStatus, AiProvider, AiAdapter } from './index';

interface CacheEntry {
    status: AiAccountStatus;
    timestamp: number;
}

/**
 * AiAccountChecker - Motor de verificación de cuentas AI
 * - Scheduler interno (5 min default)
 * - Cache por cuenta (5 min TTL)
 * - Broadcast vía WebSocket en cada check
 */
export class AiAccountChecker {
    private static instance: AiAccountChecker;
    
    private scheduler: NodeJS.Timeout | null = null;
    private cache: Map<string, CacheEntry> = new Map();
    private running: boolean = false;
    
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutos
    private readonly CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos
    
    private userManager: UserManager;
    private wsManager: WebSocketManager;
    
    private constructor(context: vscode.ExtensionContext) {
        this.userManager = UserManager.init(context);
        this.wsManager = WebSocketManager.getInstance();
    }
    
    /**
     * Inicializa el singleton
     */
    static init(context: vscode.ExtensionContext): AiAccountChecker {
        if (!AiAccountChecker.instance) {
            AiAccountChecker.instance = new AiAccountChecker(context);
        }
        return AiAccountChecker.instance;
    }
    
    /**
     * Obtiene instancia singleton
     */
    static getInstance(): AiAccountChecker {
        if (!AiAccountChecker.instance) {
            throw new Error('AiAccountChecker not initialized. Call init() first.');
        }
        return AiAccountChecker.instance;
    }
    
    /**
     * Inicia el scheduler automático
     */
    start(intervalMs?: number): void {
        if (this.running) {
            console.log('[AiAccountChecker] Already running');
            return;
        }
        
        const interval = intervalMs || this.CHECK_INTERVAL;
        
        this.scheduler = setInterval(() => {
            this.runScheduledChecks();
        }, interval);
        
        this.running = true;
        console.log(`[AiAccountChecker] Started with ${interval / 1000}s interval`);
        
        // Primera ejecución inmediata
        this.runScheduledChecks();
    }
    
    /**
     * Detiene el scheduler
     */
    stop(): void {
        if (this.scheduler) {
            clearInterval(this.scheduler);
            this.scheduler = null;
        }
        this.running = false;
        console.log('[AiAccountChecker] Stopped');
    }

    // ========================================================================
    // MÉTODOS PÚBLICOS NUEVOS
    // ========================================================================

    /**
     * Fuerza verificación inmediata de todas las cuentas AI en todos los perfiles
     * Limpia el cache antes de verificar para obtener estado fresco
     */
    async checkAllAccountsNow(): Promise<void> {
        console.log('[AiAccountChecker] Starting manual check of all accounts...');
        
        try {
            // Limpiar cache para forzar verificación fresca
            this.clearCache();
            
            // Obtener todos los perfiles (en implementación real vendría de ChromeProfileManager)
            const profileIds = await this.getAllProfileIds();
            
            if (profileIds.length === 0) {
                console.log('[AiAccountChecker] No profiles found to check');
                vscode.window.showInformationMessage('No Chrome profiles found');
                return;
            }

            // Mostrar progreso
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Checking AI accounts',
                cancellable: false
            }, async (progress) => {
                const increment = 100 / profileIds.length;
                
                for (let i = 0; i < profileIds.length; i++) {
                    const profileId = profileIds[i];
                    progress.report({ 
                        increment,
                        message: `Profile ${i + 1}/${profileIds.length}: ${profileId}` 
                    });
                    
                    await this.checkAllForProfile(profileId);
                }
            });

            console.log('[AiAccountChecker] Manual check completed');
            vscode.window.showInformationMessage(
                `✅ Checked AI accounts for ${profileIds.length} profile(s)`
            );

        } catch (error: any) {
            console.error('[AiAccountChecker] Error in manual check:', error);
            vscode.window.showErrorMessage(
                `Failed to check AI accounts: ${error.message}`
            );
        }
    }

    /**
     * Limpia todo el cache de sesiones AI
     * Útil cuando hay problemas de login loops o estados inconsistentes
     */
    async clearAllSessionCache(): Promise<void> {
        console.log('[AiAccountChecker] Clearing all session cache...');
        
        const cacheSize = this.cache.size;
        this.clearCache();
        
        console.log(`[AiAccountChecker] Cleared ${cacheSize} cached entries`);
        
        // Broadcast para notificar a clientes que el cache fue limpiado
        this.wsManager.broadcast('cache:cleared', {
            timestamp: Date.now(),
            entriesCleared: cacheSize
        });
    }
    
    // ========================================================================
    // MÉTODOS PÚBLICOS EXISTENTES
    // ========================================================================
    
    /**
     * Verifica una cuenta específica
     */
    async checkAccount(
        profileId: string,
        provider: AiProvider,
        accountId: string
    ): Promise<AiAccountStatus> {
        const cacheKey = this.getCacheKey(profileId, provider, accountId);
        
        // Verificar cache
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            console.log(`[AiAccountChecker] Cache hit: ${cacheKey}`);
            return cached.status;
        }
        
        // Obtener adapter y verificar
        try {
            const adapter = await this.getAdapter(provider);
            const status = await adapter.getStatus();
            
            // Actualizar cache
            this.cache.set(cacheKey, {
                status,
                timestamp: Date.now()
            });
            
            // Broadcast update (ahora como array de uno)
            this.broadcastProfileUpdate(profileId, [{
                ...status,
                provider,
                accountId
            }]);
            
            return status;
            
        } catch (error: any) {
            const errorStatus: AiAccountStatus = {
                provider,       
                accountId,       
                ok: false,
                error: error.message || 'Unknown error',
                lastChecked: new Date()
            };
            
            // Cachear el error también
            this.cache.set(cacheKey, {
                status: errorStatus,
                timestamp: Date.now()
            });
            
            // Broadcast error como array de uno
            this.broadcastProfileUpdate(profileId, [{
                ...errorStatus,
                provider,
                accountId
            }]);
            
            return errorStatus;
        }
    }
    
    /**
     * Verifica todas las cuentas de un perfil
     * RETORNO CAMBIADO: Ahora retorna AiAccountStatus[] directamente (con provider y accountId incluidos)
     */
    async checkAllForProfile(profileId: string): Promise<AiAccountStatus[]> {
        // En una implementación real, obtendríamos las cuentas configuradas
        // desde ChromeProfileManager o similar
        // Por ahora, verificamos las 4 providers con cuentas mock
        
        const providers: AiProvider[] = ['grok', 'claude', 'chatgpt', 'gemini'];
        const results: { [accountId: string]: { provider: AiProvider; status: AiAccountStatus; } } = {};
        
        for (const provider of providers) {
            const accountId = `${provider}-account`;
            try {
                const status = await this.checkAccount(profileId, provider, accountId);
                results[accountId] = { provider, status };
            } catch (error: any) {
                console.error(`[AiAccountChecker] Error checking ${provider}:`, error);
                const errorStatus: AiAccountStatus = {
                    provider,        
                    accountId,       
                    ok: false,
                    error: error.message,
                    lastChecked: new Date()
                };
                results[accountId] = {
                    provider,
                    status: errorStatus
                };
            }
        }
        
        // Convertir a array plano con provider y accountId en cada status
        const accountsArray: AiAccountStatus[] = Object.entries(results).map(([accountId, { provider, status }]) => ({
            ...status,
            provider,
            accountId
        }));
        
        // Broadcast consolidado (ahora como array y evento 'account:status')
        this.broadcastProfileUpdate(profileId, accountsArray);
        
        return accountsArray;
    }
    
    /**
     * Limpia cache (útil para forzar refresh)
     */
    clearCache(profileId?: string): void {
        if (profileId) {
            // Limpiar solo cache de este perfil
            const prefix = `${profileId}:`;
            for (const key of this.cache.keys()) {
                if (key.startsWith(prefix)) {
                    this.cache.delete(key);
                }
            }
        } else {
            // Limpiar todo
            this.cache.clear();
        }
        console.log(`[AiAccountChecker] Cache cleared${profileId ? ` for ${profileId}` : ''}`);
    }
    
    /**
     * Obtiene estado actual del sistema
     */
    getStatus(): {
        running: boolean;
        cacheSize: number;
        nextCheck?: Date;
    } {
        return {
            running: this.running,
            cacheSize: this.cache.size,
            nextCheck: this.scheduler ? new Date(Date.now() + this.CHECK_INTERVAL) : undefined
        };
    }
    
    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================
    
    /**
     * Ejecuta verificaciones programadas
     */
    private async runScheduledChecks(): Promise<void> {
        console.log('[AiAccountChecker] Running scheduled checks...');
        
        try {
            // En producción, obtendríamos lista de perfiles activos
            // Por ahora, hacemos un check mock del perfil "default"
            const testProfileId = 'default';
            await this.checkAllForProfile(testProfileId);
            
        } catch (error: any) {
            console.error('[AiAccountChecker] Error in scheduled check:', error);
        }
    }
    
    /**
     * Obtiene adapter para un provider específico
     */
    private async getAdapter(provider: AiProvider): Promise<AiAdapter> {
        let token: string | undefined;
        
        switch (provider) {
            case 'grok':
                // Grok usa GitHub token (X/Twitter OAuth)
                token = await this.userManager.getGithubToken();
                return new GrokAdapter({ token: token || '' });
                
            case 'claude':
                // Claude usa su propio token
                token = await this.userManager.getGithubToken(); // Mock - usar token específico
                return new ClaudeAdapter({ token: token || '' });
                
            case 'chatgpt':
                // ChatGPT usa su API key
                token = await this.userManager.getGithubToken(); // Mock - usar token específico
                return new ChatGPTAdapter({ token: token || '' });
                
            case 'gemini':
                // Gemini usa su API key
                token = await this.userManager.getGeminiApiKey();
                return new GeminiAdapter({ token: token || '' });
                
            default:
                throw new Error(`Unknown provider: ${provider}`);
        }
    }
    
    /**
     * Genera cache key
     */
    private getCacheKey(profileId: string, provider: AiProvider, accountId: string): string {
        return `${profileId}:${provider}:${accountId}`;
    }
    
    /**
     * Broadcast vía WebSocket (CAMBIADO: Ahora acepta AiAccountStatus[] y envía 'account:status')
     */
    private broadcastProfileUpdate(profileId: string, accounts: AiAccountStatus[]): void {
        this.wsManager.broadcast('account:status', {
            profileId,
            accounts,
            timestamp: Date.now()
        });
    }

    /**
     * Obtiene lista de todos los profile IDs
     * En implementación real, esto vendría de ChromeProfileManager
     */
    private async getAllProfileIds(): Promise<string[]> {
        // Mock implementation - en producción integrar con ChromeProfileManager
        // const profiles = await chromeProfileManager.detectProfiles();
        // return profiles.map(p => p.name);
        
        return ['default', 'Profile 1', 'Profile 2'];
    }
}