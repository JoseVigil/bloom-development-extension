import * as vscode from 'vscode';
import * as path from 'path';
import { joinPath } from '../utils/uriHelper';


export interface TokenEstimation {
    totalTokens: number;
    fileBreakdown: { [filename: string]: number };
    percentage: number;
    warning: boolean;
    error: boolean;
}

export class TokenEstimator {
    private static readonly CHARS_PER_TOKEN = 4;
    private static readonly TOKEN_LIMIT = 100000;
    private static readonly WARNING_THRESHOLD = 0.8; // 80%
    private static readonly ERROR_THRESHOLD = 1.0;   // 100%

    /**
     * Estima tokens de un texto simple
     */
    static estimateFromText(text: string): number {
        return Math.ceil(text.length / this.CHARS_PER_TOKEN);
    }

    /**
     * Estima tokens de múltiples archivos
     */
    static async estimateFromFiles(
        workspaceRoot: vscode.Uri,
        filePaths: string[]
    ): Promise<TokenEstimation> {
        const fileBreakdown: { [filename: string]: number } = {};
        let totalChars = 0;

        for (const filePath of filePaths) {
            try {
                const fullPath = joinPath(workspaceRoot, filePath);
                const fileContent = await vscode.workspace.fs.readFile(fullPath);
                const text = Buffer.from(fileContent).toString('utf-8');
                
                const tokens = this.estimateFromText(text);
                fileBreakdown[filePath] = tokens;
                totalChars += text.length;

            } catch (error) {
                console.warn(`No se pudo leer archivo: ${filePath}`);
                fileBreakdown[filePath] = 0;
            }
        }

        const totalTokens = Math.ceil(totalChars / this.CHARS_PER_TOKEN);
        const percentage = totalTokens / this.TOKEN_LIMIT;

        return {
            totalTokens,
            fileBreakdown,
            percentage,
            warning: percentage >= this.WARNING_THRESHOLD && percentage < this.ERROR_THRESHOLD,
            error: percentage >= this.ERROR_THRESHOLD
        };
    }

    /**
     * Estima tokens de un intent completo (contenido + archivos)
     */
    static async estimateIntent(
        intentPath: vscode.Uri,
        files: string[]
    ): Promise<TokenEstimation> {
        // Leer contenido del intent.bl
        const intentBlPath = joinPath(intentPath, 'intent.bl');
        let intentContent = '';
        
        try {
            const content = await vscode.workspace.fs.readFile(intentBlPath);
            intentContent = Buffer.from(content).toString('utf-8');
        } catch {
            intentContent = '';
        }

        const intentTokens = this.estimateFromText(intentContent);

        // Obtener workspace root
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceRoot) {
            return {
                totalTokens: intentTokens,
                fileBreakdown: { 'intent.bl': intentTokens },
                percentage: intentTokens / this.TOKEN_LIMIT,
                warning: false,
                error: false
            };
        }

        // Estimar archivos del codebase
        const filesEstimation = await this.estimateFromFiles(workspaceRoot, files);

        // Combinar estimaciones
        const totalTokens = intentTokens + filesEstimation.totalTokens;
        const percentage = totalTokens / this.TOKEN_LIMIT;

        return {
            totalTokens,
            fileBreakdown: {
                'intent.bl': intentTokens,
                ...filesEstimation.fileBreakdown
            },
            percentage,
            warning: percentage >= this.WARNING_THRESHOLD && percentage < this.ERROR_THRESHOLD,
            error: percentage >= this.ERROR_THRESHOLD
        };
    }

    /**
     * Genera mensaje de alerta según el nivel de tokens
     */
    static getAlertMessage(estimation: TokenEstimation): string | null {
        const { totalTokens, percentage, warning, error } = estimation;
        const percentageStr = (percentage * 100).toFixed(1);

        if (error) {
            return `❌ ERROR: ${totalTokens.toLocaleString()} tokens (${percentageStr}%)
El contenido excede el límite de ${this.TOKEN_LIMIT.toLocaleString()} tokens.
Debes remover archivos antes de generar el intent.`;
        }

        if (warning) {
            return `⚠️ ADVERTENCIA: ${totalTokens.toLocaleString()} tokens (${percentageStr}%)
Te estás acercando al límite. Considera remover archivos innecesarios.`;
        }

        return null;
    }

    /**
     * Genera HTML para mostrar el contador de tokens
     */
    static generateCounterHTML(estimation: TokenEstimation): string {
        const { totalTokens, percentage } = estimation;
        const percentageStr = (percentage * 100).toFixed(1);
        
        let className = 'token-counter';
        let emoji = '📊';
        
        if (estimation.error) {
            className += ' token-error';
            emoji = '❌';
        } else if (estimation.warning) {
            className += ' token-warning';
            emoji = '⚠️';
        } else {
            className += ' token-ok';
            emoji = '✅';
        }

        return `
            
                ${emoji}
                
                    Token estimate: ${totalTokens.toLocaleString()} / ${this.TOKEN_LIMIT.toLocaleString()}
                    (${percentageStr}%)
                
            
        `;
    }
}