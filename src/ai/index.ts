// src/ai/index.ts
export { AiAccountChecker } from './AiAccountChecker';
export { GrokAdapter } from './adapters/GrokAdapter';
export { ClaudeAdapter } from './adapters/ClaudeAdapter';
export { ChatGPTAdapter } from './adapters/ChatGPTAdapter';
export { GeminiAdapter } from './adapters/GeminiAdapter';

export interface AiAccountStatus {
    provider: AiProvider;  
    accountId?: string;    
    ok: boolean;
    usageRemaining?: number;
    quota?: {
        used: number;
        total: number;
        percentage: number;
    };
    error?: string;
    lastChecked: Date;
}

export interface AiAdapter {
    getUsage(): Promise<{ used: number; unit: string }>;
    getQuota(): Promise<{ used: number; total: number }>;
    getStatus(): Promise<AiAccountStatus>;
}

export type AiProvider = 'grok' | 'claude' | 'chatgpt' | 'gemini';