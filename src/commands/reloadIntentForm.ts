import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { IntentSession } from '../core/intentSession';

export function registerReloadIntentForm(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.reloadIntentForm',
        async (session: IntentSession) => {
            logger.info('Recargando formulario de intent');

            const state = session.getState();

            const formPanel = getActiveIntentFormPanel();

            if (!formPanel) {
                vscode.window.showWarningMessage('No hay formulario abierto');
                return;
            }

            const data: any = {
                stage: state.workflow.stage
            };

            if (state.workflow.stage === 'questions-ready') {
                data.questions = state.workflow.questions;
            }

            if (state.workflow.stage === 'snapshot-downloaded') {
                const snapshotContent = await session.readSnapshotFile();
                data.snapshotFiles = extractFilesFromSnapshot(snapshotContent);
            }

            formPanel.updateWorkflowStage(state.workflow.stage, data);
        }
    );

    context.subscriptions.push(disposable);
}

function getActiveIntentFormPanel(): any {
    return (global as any).activeIntentFormPanel;
}

function extractFilesFromSnapshot(snapshotContent: string): string[] {
    const files: string[] = [];
    const matches = snapshotContent.matchAll(/## Archivo \d+: (.+?) \(/g);

    for (const match of matches) {
        files.push(match[1]);
    }

    return files;
}