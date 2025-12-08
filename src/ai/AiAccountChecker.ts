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

interface ProfileAiAccounts {
    [accountId: string]: {
        provider: AiProvider;
        status: AiAccountStatus;
    };
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
            
            // Broadcast update
            this.broadcastProfileUpdate(profileId, {
                [accountId]: { provider, status }
            });
            
            return status;
            
        } catch (error: any) {
            const errorStatus: AiAccountStatus = {
                ok: false,
                error: error.message || 'Unknown error',
                lastChecked: new Date()
            };
            
            // Cachear el error también
            this.cache.set(cacheKey, {
                status: errorStatus,
                timestamp: Date.now()
            });
            
            return errorStatus;
        }
    }
    
    /**
     * Verifica todas las cuentas de un perfil
     */
    async checkAllForProfile(profileId: string): Promise<ProfileAiAccounts> {
        // En una implementación real, obtendríamos las cuentas configuradas
        // desde ChromeProfileManager o similar
        // Por ahora, verificamos las 4 providers con cuentas mock
        
        const providers: AiProvider[] = ['grok', 'claude', 'chatgpt', 'gemini'];
        const results: ProfileAiAccounts = {};
        
        for (const provider of providers) {
            const accountId = `${provider}-account`;
            try {
                const status = await this.checkAccount(profileId, provider, accountId);
                results[accountId] = { provider, status };
            } catch (error: any) {
                console.error(`[AiAccountChecker] Error checking ${provider}:`, error);
                results[accountId] = {
                    provider,
                    status: {
                        ok: false,
                        error: error.message,
                        lastChecked: new Date()
                    }
                };
            }
        }
        
        // Broadcast consolidado
        this.broadcastProfileUpdate(profileId, results);
        
        return results;
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
     * Broadcast vía WebSocket
     */
    private broadcastProfileUpdate(profileId: string, aiAccounts: ProfileAiAccounts): void {
        this.wsManager.broadcast('profile:update', {
            profileId,
            aiAccounts,
            timestamp: Date.now()
        });
    }
}