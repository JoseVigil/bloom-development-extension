import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { IntentSession } from '../core/intentSession';

export function registerDeleteIntentFromForm(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.deleteIntentFromForm',
        async (session: IntentSession) => {
            logger.info('Ejecutando comando: Delete Intent from Form');

            const state = session.getState();

            const confirm = await vscode.window.showWarningMessage(
                `¿Eliminar intent '${state.name}'?`,
                {
                    modal: true,
                    detail: 'Esto borrará la carpeta .bloom/intents/' + state.name + '/ permanentemente.'
                },
                'Eliminar'
            );

            if (confirm === 'Eliminar') {
                await session.deleteIntent();
                vscode.window.showInformationMessage(`Intent '${state.name}' eliminado`);
            }
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.deleteIntentFromForm" registrado');
}