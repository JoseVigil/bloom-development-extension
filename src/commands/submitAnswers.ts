import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { IntentSession } from '../core/intentSession';
import { ClaudeApiClient } from '../core/claudeApiClient';
import * as path from 'path';

export function registerSubmitAnswers(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.submitAnswers',
        async (session: IntentSession, answers: { questionId: string; answer: string }[]) => {
            logger.info('Ejecutando comando: Submit Answers');

            const state = session.getState();

            if (state.workflow.stage !== 'questions-ready') {
                vscode.window.showWarningMessage('No hay preguntas pendientes de responder');
                return;
            }

            const unanswered = answers.filter(a => !a.answer || a.answer.trim() === '');
            if (unanswered.length > 0) {
                vscode.window.showErrorMessage(
                    `Faltan ${unanswered.length} respuestas. Por favor completa todas las preguntas.`
                );
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Enviando respuestas a Claude AI',
                    cancellable: false
                },
                async (progress) => {
                    try {
                        progress.report({ increment: 10, message: 'Preparando datos...' });

                        const intentContent = await session.readIntentFile();
                        const codebaseContent = await session.readCodebaseFile();

                        progress.report({ increment: 30, message: 'Solicitando snapshot...' });

                        const claudeClient = new ClaudeApiClient(logger);
                        const response = await claudeClient.requestSnapshot(
                            intentContent,
                            codebaseContent,
                            answers
                        );

                        progress.report({ increment: 40, message: 'Descargando snapshot...' });

                        const snapshotPath = path.join(
                            session.getIntentFolder().fsPath,
                            'snapshot.md'
                        );

                        await claudeClient.downloadSnapshot(
                            response.snapshotUrl,
                            snapshotPath
                        );

                        await session.updateWorkflow({
                            stage: 'snapshot-downloaded',
                            snapshotPath
                        });

                        progress.report({ increment: 20, message: 'Listo!' });

                        vscode.window.showInformationMessage(
                            '✅ Snapshot descargado y listo para integrar'
                        );

                        await vscode.commands.executeCommand('bloom.reloadIntentForm', session);

                    } catch (error: any) {
                        logger.error('Error submitting answers', error);
                        vscode.window.showErrorMessage(
                            `Error: ${error.message || 'No se pudo generar el snapshot'}`
                        );
                    }
                }
            );
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.submitAnswers" registrado');
}