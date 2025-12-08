// src/ai/adapters/GrokAdapter.ts
import type { AiAdapter, AiAccountStatus, AiProvider } from '../index';

/**
 * GrokAdapter - Verificación de cuenta Grok (xAI)
 * 
 * IMPORTANTE: Grok no tiene API pública oficial (a diciembre 2025).
 * Esta implementación es un MOCK realista que simula el comportamiento real.
 * 
 * En una versión futura podría usar:
 * - Playwright para verificar sesión en x.com/grok
 * - O autenticación vía X/Twitter Premium si xAI lo expone
 */
export class GrokAdapter implements AiAdapter {
    private token: string;
    private readonly provider: AiProvider = 'grok';

    constructor(config: { token: string }) {
        this.token = config.token.trim();
    }

    /**
     * Obtiene uso actual - MOCK realista
     */
    async getUsage(): Promise<{ used: number; unit: string }> {
        await this.delay(300);

        if (!this.token) {
            throw new Error('Grok token not configured');
        }

        // Simulación realista: entre 5 y 90 consultas usadas
        const used = Math.floor(Math.random() * 85) + 5;

        return {
            used,
            unit: 'queries'
        };
    }

    /**
     * Obtiene quota/límite - MOCK según tiers conocidos
     */
    async getQuota(): Promise<{ used: number; total: number }> {
        await this.delay(300);

        if (!this.token) {
            throw new Error('Grok token not configured');
        }

        // Simulamos diferentes tiers según longitud/formato del token (mock)
        const isPremiumPlus = this.token.length > 50; // ejemplo arbitrario

        if (isPremiumPlus) {
            // X Premium+ o SuperGrok: límite mucho más alto o ilimitado
            return {
                used: Math.floor(Math.random() * 500) + 100,
                total: 10_000 // prácticamente ilimitado
            };
        } else {
            // Grok gratuito o Premium básico: ~100-200 consultas/día
            return {
                used: Math.floor(Math.random() * 90) + 10,
                total: 150
            };
        }
    }

    /**
     * Obtiene estado completo - ahora incluye provider y accountId
     */
    async getStatus(accountId?: string): Promise<AiAccountStatus> {
        try {
            const isValid = await this.validateToken();

            if (!isValid) {
                return {
                    provider: this.provider,
                    accountId,
                    ok: false,
                    error: 'Invalid or missing Grok access token',
                    lastChecked: new Date()
                };
            }

            const [usage, quota] = await Promise.all([
                this.getUsage(),
                this.getQuota()
            ]);

            const percentage = quota.total > 0 ? (quota.used / quota.total) * 100 : 0;
            const remaining = quota.total - quota.used;

            return {
                provider: this.provider,
                accountId,
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
                provider: this.provider,
                accountId,
                ok: false,
                error: error.message || 'Failed to check Grok account status',
                lastChecked: new Date()
            };
        }
    }

    /**
     * Valida el token - MOCK mejorado
     */
    private async validateToken(): Promise<boolean> {
        if (!this.token) {
            return false;
        }

        // En producción: verificar sesión en x.com o con API interna de xAI
        // Por ahora: validación heurística básica
        return this.token.length > 10 && /[A-Za-z0-9_-]+/.test(this.token);
    }

    /**
     * Helper: simula delay de red
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}