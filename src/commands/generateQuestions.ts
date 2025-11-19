import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { IntentSession } from '../core/intentSession';
import { ClaudeApiClient } from '../core/claudeApiClient';
import * as path from 'path';

export function registerGenerateQuestions(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.generateQuestions',
        async (session: IntentSession) => {
            logger.info('Ejecutando comando: Generate Questions');

            const state = session.getState();

            if (state.workflow.stage !== 'intent-generated') {
                vscode.window.showWarningMessage(
                    'Primero debes generar el intent antes de solicitar preguntas'
                );
                return;
            }

            if (state.files.length === 0) {
                vscode.window.showErrorMessage('El intent debe tener al menos un archivo');
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Generando preguntas con Claude AI',
                    cancellable: false
                },
                async (progress) => {
                    try {
                        progress.report({ increment: 10, message: 'Leyendo archivos...' });

                        const intentContent = await session.readIntentFile();
                        const codebaseContent = await session.readCodebaseFile();

                        progress.report({ increment: 30, message: 'Consultando a Claude...' });

                        const claudeClient = new ClaudeApiClient(logger);
                        const response = await claudeClient.requestQuestions({
                            intentContent,
                            codebaseContent,
                            projectType: state.projectType
                        });

                        progress.report({ increment: 40, message: 'Procesando preguntas...' });

                        const questions = await claudeClient.parseQuestionsArtifact(
                            response.artifactUrl
                        );

                        await session.updateWorkflow({
                            stage: 'questions-ready',
                            questions,
                            questionsArtifactUrl: response.artifactUrl
                        });

                        progress.report({ increment: 20, message: 'Listo!' });

                        vscode.window.showInformationMessage(
                            `✅ ${questions.length} preguntas generadas. Respóndelas en el formulario.`
                        );

                        await vscode.commands.executeCommand('bloom.reloadIntentForm', session);

                    } catch (error: any) {
                        logger.error('Error generando preguntas', error);
                        vscode.window.showErrorMessage(
                            `Error: ${error.message || 'No se pudieron generar preguntas'}`
                        );
                    }
                }
            );
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.generateQuestions" registrado');
}