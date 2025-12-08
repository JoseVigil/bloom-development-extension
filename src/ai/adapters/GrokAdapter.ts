// src/ai/adapters/GrokAdapter.ts
import type { AiAdapter, AiAccountStatus } from '../index';

/**
 * GrokAdapter - Verificación de cuenta Grok (X.AI)
 * 
 * NOTA: Grok no tiene API pública oficial.
 * Esta es una implementación MOCK que simula el comportamiento.
 * 
 * En producción, esto se haría mediante:
 * - Playwright verificando sesión en x.com/i/grok
 * - O usando token de X/Twitter API si está disponible
 */
export class GrokAdapter implements AiAdapter {
    private token: string;
    
    constructor(config: { token: string }) {
        this.token = config.token;
    }
    
    /**
     * Obtiene uso actual
     * MOCK: Simula respuesta
     */
    async getUsage(): Promise<{ used: number; unit: string }> {
        // Simular delay de red
        await this.delay(300);
        
        if (!this.token) {
            throw new Error('Grok token not configured');
        }
        
        // Mock data - en producción vendría de API
        return {
            used: 42,
            unit: 'queries'
        };
    }
    
    /**
     * Obtiene quota/límite
     * MOCK: Simula respuesta
     */
    async getQuota(): Promise<{ used: number; total: number }> {
        await this.delay(300);
        
        if (!this.token) {
            throw new Error('Grok token not configured');
        }
        
        // Mock: 100 queries por día para free tier
        return {
            used: 42,
            total: 100
        };
    }
    
    /**
     * Obtiene estado completo
     * MOCK: Simula verificación
     */
    async getStatus(): Promise<AiAccountStatus> {
        try {
            const [usage, quota] = await Promise.all([
                this.getUsage(),
                this.getQuota()
            ]);
            
            const percentage = (quota.used / quota.total) * 100;
            const remaining = quota.total - quota.used;
            
            return {
                ok: true,
                usageRemaining: remaining,
                quota: {
                    used: quota.used,
                    total: quota.total,
                    percentage: Math.round(percentage * 100) / 100
                },
                lastChecked: new Date()
            };
            
        } catch (error: any) {
            return {
                ok: false,
                error: error.message || 'Failed to check Grok status',
                lastChecked: new Date()
            };
        }
    }
    
    /**
     * Helper: simula delay de red
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Método adicional: verificar si el token es válido
     * MOCK: Verifica formato básico
     */
    async validateToken(): Promise<boolean> {
        if (!this.token) {
            return false;
        }
        
        // En producción, haría una llamada real a la API
        // Por ahora, solo verificamos que no esté vacío
        return this.token.length > 10;
    }
}