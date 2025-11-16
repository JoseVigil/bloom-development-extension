import { PayloadAnalysis, ModelLimit, Recommendation } from '../models/intent';

export class TokenEstimator {
    private readonly CHARS_PER_TOKEN = 4;
    private readonly LIMITS = {
        'claude-sonnet-4': { tokens: 200000, reserve: 8000 },
        'claude-opus-4': { tokens: 200000, reserve: 8000 },
        'gpt-4-turbo': { tokens: 128000, reserve: 4000 },
        'gpt-4o': { tokens: 128000, reserve: 4000 },
        'grok-2': { tokens: 131072, reserve: 4096 }
    };

    estimateTokens(text: string): number {
        return Math.ceil(text.length / this.CHARS_PER_TOKEN);
    }

    analyzePayload(content: string): PayloadAnalysis {
        const tokens = this.estimateTokens(content);
        const chars = content.length;
        
        const analysis: PayloadAnalysis = {
            totalChars: chars,
            estimatedTokens: tokens,
            limits: {},
            recommendations: []
        };

        for (const [model, limit] of Object.entries(this.LIMITS)) {
            const available = limit.tokens - limit.reserve;
            const usage = (tokens / available) * 100;
            
            analysis.limits[model] = {
                modelName: model,
                contextWindow: limit.tokens,
                reserved: limit.reserve,
                available: available,
                used: tokens,
                remaining: available - tokens,
                usagePercent: usage,
                status: this.getStatus(usage)
            };

            if (usage > 90) {
                analysis.recommendations.push({
                    severity: 'critical',
                    model: model,
                    message: `❌ Excede el 90% del contexto. Reduce archivos.`
                });
            } else if (usage > 75) {
                analysis.recommendations.push({
                    severity: 'warning',
                    model: model,
                    message: `⚠️ Usa ${usage.toFixed(0)}% del contexto.`
                });
            } else {
                analysis.recommendations.push({
                    severity: 'ok',
                    model: model,
                    message: `✅ Usa ${usage.toFixed(0)}% del contexto. Margen: ${available - tokens} tokens.`
                });
            }
        }

        return analysis;
    }

    private getStatus(usage: number): 'safe' | 'warning' | 'critical' {
        if (usage > 90) return 'critical';
        if (usage > 75) return 'warning';
        return 'safe';
    }
}