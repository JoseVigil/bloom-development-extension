import * as vscode from 'vscode';
    import { Logger } from '../utils/logger';
    import { Question } from '../models/intent';
    
    interface ClaudeApiResponse {
        id: string;
        content: Array<{
            type: string;
            text: string;
        }>;
    }
    
    export class ClaudeApiClient {
        private apiUrl = 'https://api.anthropic.com/v1/messages';
    
        constructor(private logger: Logger) {}
    
        async requestQuestions(payload: {
            intentContent: string;
            codebaseContent: string;
            projectType?: string;
        }): Promise<{ artifactUrl: string; conversationId: string }> {
            const apiKey = this.getApiKey();
            const model = this.getModel();
    
            const prompt = this.buildQuestionsPrompt(payload);
    
            const requestBody = {
                model: model,
                max_tokens: 4096,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            };
    
            try {
                const response = await fetch(this.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify(requestBody)
                });
    
                if (!response.ok) {
                    throw new Error(`Claude API error: ${response.status} ${response.statusText}`);
                }
    
                const data = await response.json() as ClaudeApiResponse;
                
                const artifactUrl = this.extractArtifactUrl(data);
                
                return {
                    artifactUrl: artifactUrl,
                    conversationId: data.id
                };
    
            } catch (error) {
                this.logger.error('Error requesting questions from Claude', error as Error);
                throw error;
            }
        }
    
        async parseQuestionsArtifact(artifactContent: string): Promise<Question[]> {
            const questions: Question[] = [];
            
            const questionBlocks = artifactContent.split(/## Question \d+:/);
            
            for (let i = 1; i < questionBlocks.length; i++) {
                const block = questionBlocks[i];
                
                const titleMatch = block.match(/^([^\n]+)/);
                const categoryMatch = block.match(/\*\*Category:\*\*\s*(\w+)/);
                const priorityMatch = block.match(/\*\*Priority:\*\*\s*(\w+)/);
                const questionMatch = block.match(/\*\*Question:\*\*\s*([^\n]+)/);
                const answerTypeMatch = block.match(/\*\*Answer_Type:\*\*\s*([^\n]+)/);
                const optionsMatch = block.match(/\*\*Options:\*\*\s*\[([^\]]+)\]/);
                
                if (questionMatch) {
                    const question: Question = {
                        id: `q${i}`,
                        category: (categoryMatch?.[1] || 'implementation') as any,
                        priority: (priorityMatch?.[1] || 'medium') as any,
                        text: questionMatch[1].trim(),
                        answerType: (answerTypeMatch?.[1] || 'free-text') as any
                    };
                    
                    if (optionsMatch) {
                        question.options = optionsMatch[1].split(',').map(o => o.trim());
                    }
                    
                    questions.push(question);
                }
            }
            
            return questions;
        }
    
        async requestSnapshot(
            intentContent: string,
            codebaseContent: string,
            answers: { questionId: string; answer: string }[]
        ): Promise<{ snapshotUrl: string; conversationId: string }> {
            const apiKey = this.getApiKey();
            const model = this.getModel();
    
            const prompt = this.buildSnapshotPrompt(intentContent, codebaseContent, answers);
    
            const requestBody = {
                model: model,
                max_tokens: 8192,
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ]
            };
    
            try {
                const response = await fetch(this.apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify(requestBody)
                });
    
                if (!response.ok) {
                    throw new Error(`Claude API error: ${response.status}`);
                }
    
                const data = await response.json() as ClaudeApiResponse;
                
                const snapshotContent = data.content[0].text;
                
                return {
                    snapshotUrl: snapshotContent,
                    conversationId: data.id
                };
    
            } catch (error) {
                this.logger.error('Error requesting snapshot from Claude', error as Error);
                throw error;
            }
        }
    
        async downloadSnapshot(snapshotContent: string, destinationPath: string): Promise<void> {
            try {
                const uri = vscode.Uri.file(destinationPath);
                await vscode.workspace.fs.writeFile(
                    uri,
                    Buffer.from(snapshotContent, 'utf-8')
                );
                this.logger.info(`Snapshot saved to ${destinationPath}`);
            } catch (error) {
                this.logger.error('Error saving snapshot', error as Error);
                throw error;
            }
        }
    
        private buildQuestionsPrompt(payload: {
            intentContent: string;
            codebaseContent: string;
            projectType?: string;
        }): string {
            return `Eres un asistente experto en desarrollo de software. He creado un intent de desarrollo con el siguiente contexto:
    
    INTENT:
    ${payload.intentContent}
    
    CODEBASE ACTUAL:
    ${payload.codebaseContent}
    
    TIPO DE PROYECTO: ${payload.projectType || 'Generic'}
    
    Por favor, genera un set de 5-10 preguntas críticas que me ayuden a implementar este intent de la mejor manera posible. Las preguntas deben cubrir:
    - Decisiones arquitectónicas
    - Patrones de diseño a usar
    - Casos edge a considerar
    - Testing y validaciones
    - Seguridad
    
    FORMATO REQUERIDO (devuelve SOLO este formato en un artifact):
    
    <!-- BLOOM_QUESTIONS_V1 -->
    ## Question 1: [Título]
    **Category:** [architecture|design|implementation|testing|security]
    **Priority:** [high|medium|low]
    **Question:** [texto de la pregunta]
    **Answer_Type:** [multiple-choice|free-text|boolean|code-snippet]
    **Options:** [opt1, opt2, opt3] (solo si es multiple-choice)
    
    ## Question 2: ...
    (continuar con todas las preguntas)`;
        }
    
        private buildSnapshotPrompt(
            intentContent: string,
            codebaseContent: string,
            answers: { questionId: string; answer: string }[]
        ): string {
            const answersText = answers
                .map(a => `${a.questionId}: ${a.answer}`)
                .join('\n');
    
            return `Basándote en el siguiente intent, codebase y las respuestas del desarrollador, genera el código completo necesario para implementar esta funcionalidad.
    
    INTENT:
    ${intentContent}
    
    CODEBASE ACTUAL:
    ${codebaseContent}
    
    RESPUESTAS A PREGUNTAS CRÍTICAS:
    ${answersText}
    
    FORMATO DE ENTREGA OBLIGATORIO:
    
    1. DEVUÉLVEME UN ÚNICO ARCHIVO MARKDOWN COMO CÓDIGO FUENTE
    2. NO USES TRIPLE BACKTICKS
    3. TODO EL CONTENIDO DEBE ESTAR FORMATEADO CON INDENTACIÓN DE 4 ESPACIOS
    4. ESTRUCTURA:
    
        ## Archivo 1: ruta/del/archivo.ext (CREAR NUEVO | MODIFICAR)
    
            [código indentado con 4 espacios]
    
        ## Archivo 2: ...
    
    5. Al final incluye sección "## Resumen de Cambios" con:
       * Archivos nuevos creados
       * Archivos modificados
       * Puntos críticos de implementación`;
        }
    
        private extractArtifactUrl(apiResponse: ClaudeApiResponse): string {
            return apiResponse.content[0].text;
        }
    
        private getApiKey(): string {
            const config = vscode.workspace.getConfiguration('bloom');
            const apiKey = config.get<string>('claudeApiKey');
            
            if (apiKey) return apiKey;
            
            const envKey = process.env.ANTHROPIC_API_KEY;
            if (envKey) return envKey;
            
            throw new Error(
                'API Key no configurada. Define bloom.claudeApiKey en settings o ANTHROPIC_API_KEY en env'
            );
        }
    
        private getModel(): string {
            const config = vscode.workspace.getConfiguration('bloom');
            return config.get<string>('claudeModel') || 'claude-3-sonnet-20240229';
        }
    }
