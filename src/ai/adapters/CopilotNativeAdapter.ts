import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export class CopilotNativeAdapter {
    
    // Instrucción para definir la personalidad de "Voz de BTIPS"
    private static readonly SYSTEM_INSTRUCTION = `
    Eres "BTIPS Voice", el asistente de control inteligente de la arquitectura BTIPS.
    
    TU CONTEXTO:
    Trabajas dentro de un entorno de desarrollo estructurado donde los "Intents" (intenciones técnicas) son gestionados por un orquestador.
    Tú NO ejecutas los cambios de código masivos (eso lo hace el orquestador), tú ayudas al usuario a entender el estado, los errores y el plan.

    TUS REGLAS:
    1. Responde de manera concisa, técnica y profesional.
    2. Basa tus respuestas EXCLUSIVAMENTE en el contexto JSON proporcionado (Estado del Intent, Reportes).
    3. Si el usuario pide una acción que requiere modificar muchos archivos, sugiérele crear un nuevo Intent o refinar el actual.
    4. Usa formato Markdown para que sea legible en el chat.
    `;

    /**
     * Construye el contexto leyendo los archivos JSON específicos del Intent
     * Esto evita alucinaciones y carga solo lo necesario en memoria.
     */
    private async buildContext(intentId: string, projectRoot: string): Promise<string> {
        try {
            // Rutas basadas en tu estructura bloom_tree.txt
            const intentPath = path.join(projectRoot, '.bloom', '.intents', '.dev', intentId);
            
            // Archivos críticos de estado
            const statePath = path.join(intentPath, '.dev_state.json');
            const reportPath = path.join(intentPath, '.execution', '.report.json');
            const briefingPath = path.join(intentPath, '.briefing', '.briefing.json');

            let contextData = "### CONTEXTO DEL SISTEMA BTIPS ###\n\n";

            // Leemos de forma segura (si existen)
            if (await this.fileExists(statePath)) {
                contextData += `[ESTADO ACTUAL (dev_state.json)]:\n${await fs.readFile(statePath, 'utf-8')}\n\n`;
            }
            if (await this.fileExists(reportPath)) {
                contextData += `[ÚLTIMO REPORTE DE EJECUCIÓN]:\n${await fs.readFile(reportPath, 'utf-8')}\n\n`;
            }
            if (await this.fileExists(briefingPath)) {
                contextData += `[BRIEFING ORIGINAL]:\n${await fs.readFile(briefingPath, 'utf-8')}\n\n`;
            }

            return contextData;
        } catch (error) {
            console.error("[CopilotAdapter] Error leyendo contexto BTIPS:", error);
            return "Advertencia: No se pudo leer el contexto completo del intent desde el disco. Responde con precaución.";
        }
    }

    private async fileExists(path: string): Promise<boolean> {
        try {
            await fs.access(path);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Función principal para generar respuesta vía Streaming
     */
    async streamResponse(
        userPrompt: string, 
        intentId: string, 
        projectRoot: string, 
        onChunk: (chunk: string) => void
    ): Promise<void> {

        // 1. Verificar disponibilidad de Copilot (u otro modelo compatible)
        // Buscamos preferentemente GPT-4 o similar
        let models = await vscode.lm.selectChatModels({ family: 'gpt-4' });
        
        // Fallback a cualquier modelo GPT si no hay GPT-4 específico
        if (models.length === 0) {
            models = await vscode.lm.selectChatModels({ family: 'gpt-3.5' });
        }
        
        // Fallback general (ej. Copilot standard)
        if (models.length === 0) {
            models = await vscode.lm.selectChatModels();
        }

        if (models.length === 0) {
            onChunk("\n⚠️ **Error:** No detecto GitHub Copilot (o modelo compatible) activo en VS Code.\n\nPor favor, instala la extensión 'GitHub Copilot Chat' y asegúrate de haber iniciado sesión.");
            return;
        }

        const model = models[0];

        // 2. Preparar el Contexto Quirúrgico
        const btipContext = await this.buildContext(intentId, projectRoot);

        // 3. Construir Mensajes para la API
        const messages = [
            vscode.LanguageModelChatMessage.User(CopilotNativeAdapter.SYSTEM_INSTRUCTION),
            vscode.LanguageModelChatMessage.User(btipContext),
            vscode.LanguageModelChatMessage.User(userPrompt)
        ];

        // 4. Token de cancelación
        const cancellationToken = new vscode.CancellationTokenSource().token;
        
        try {
            // 5. Enviar solicitud a VS Code
            const response = await model.sendRequest(messages, {}, cancellationToken);
            
            // 6. Streaming de respuesta
            for await (const fragment of response.text) {
                onChunk(fragment);
            }
        } catch (err: any) {
            console.error("[CopilotAdapter] Error en API:", err);
            onChunk(`\n❌ **Error de comunicación con Copilot:** ${err.message || err}`);
        }
    }
}