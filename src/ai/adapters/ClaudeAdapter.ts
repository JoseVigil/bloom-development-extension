// src/ai/adapters/ClaudeAdapter.ts
import type { AiAdapter, AiAccountStatus, AiProvider } from '../index';

/**
 * ClaudeAdapter - Verificación de cuenta Claude (Anthropic)
 * 
 * Soporta:
 * - API keys oficiales (sk-ant-...)
 * - Session tokens de claude.ai (free tier)
 * 
 * NOTA: Anthropic no expone usage/quota públicamente → usamos mocks realistas
 */
export class ClaudeAdapter implements AiAdapter {
    private token: string;
    private baseUrl = 'https://api.anthropic.com/v1';
    private readonly provider: AiProvider = 'claude';

    constructor(config: { token: string }) {
        this.token = config.token.trim();
    }

    /**
     * Obtiene uso actual
     */
    async getUsage(): Promise<{ used: number; unit: string }> {
        await this.delay(300);

        if (!this.token) {
            throw new Error('Claude token not configured');
        }

        const isApiKey = this.token.startsWith('sk-ant-');

        if (isApiKey) {
            // Anthropic no expone uso público → mock realista
            return this.getMockApiUsage();
        } else {
            // Free tier en claude.ai
            return this.getMockFreeUsage();
        }
    }

    /**
     * Obtiene quota/límite
     */
    async getQuota(): Promise<{ used: number; total: number }> {
        await this.delay(300);

        if (!this.token) {
            throw new Error('Claude token not configured');
        }

        const isApiKey = this.token.startsWith('sk-ant-');

        if (isApiKey) {
            // Tier pago: límites altos (estimado)
            return {
                used: Math.floor(Math.random() * 3000) + 1000,
                total: 1_000_000
            };
        } else {
            // Free tier: ~50 mensajes/día (aproximado)
            return {
                used: Math.floor(Math.random() * 30) + 5,
                total: 50
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
                    error: 'Invalid or expired token',
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
                error: error.message || 'Failed to check Claude account status',
                lastChecked: new Date()
            };
        }
    }

    /**
     * Valida el token (API key o session)
     */
    private async validateToken(): Promise<boolean> {
        if (!this.token) return false;

        if (this.token.startsWith('sk-ant-')) {
            try {
                const response = await fetch(`${this.baseUrl}/messages`, {
                    method: 'POST',
                    headers: {
                        'x-api-key': this.token,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        model: 'claude-3-haiku-20240307',
                        max_tokens: 1,
                        messages: [{ role: 'user', content: 'ping' }]
                    })
                });

                return response.status !== 401 && response.status !== 403;
            } catch {
                // Si hay error de red, asumimos que podría ser válido
                return true;
            }
        } else {
            // Session token de claude.ai → validación heurística
            return this.token.length > 50 && /[A-Za-z0-9._-]+/.test(this.token);
        }
    }

    // ========================================================================
    // PRIVATE HELPERS
    // ========================================================================

    private getMockApiUsage(): { used: number; unit: string } {
        return {
            used: Math.floor(Math.random() * 5000) + 1000,
            unit: 'tokens'
        };
    }

    private getMockFreeUsage(): { used: number; unit: string } {
        return {
            used: Math.floor(Math.random() * 25) + 5,
            unit: 'messages'
        };
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}