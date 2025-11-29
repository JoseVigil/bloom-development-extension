// src/commands/debug/debugCommands.ts
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { UserManager } from '../../managers/userManager';

/**
 * Registra comandos de debug y desarrollo
 */
export function registerDebugCommands(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    // ========================================
    // COMANDO: Reset Registration
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.resetRegistration', async () => {
            const confirm = await vscode.window.showWarningMessage(
                '⚠️ ¿Estás seguro de que querés resetear el registro?\n\n' +
                'Esto borrará:\n' +
                '- Datos de GitHub guardados\n' +
                '- Configuración de organizaciones\n' +
                '- Estado de registro',
                { modal: true },
                'Sí, Resetear',
                'Cancelar'
            );

            if (confirm !== 'Sí, Resetear') return;

            try {
                await UserManager.init(context).clear();
                
                vscode.window.showInformationMessage(
                    '✅ Registro reseteado exitosamente. La ventana se recargará...'
                );
                
                logger.info('Registration reset - Reloading window');
                
                // Recargar ventana después de 1 segundo
                setTimeout(async () => {
                    await vscode.commands.executeCommand('workbench.action.reloadWindow');
                }, 1000);
                
            } catch (error: any) {
                vscode.window.showErrorMessage(`Error reseteando registro: ${error.message}`);
                logger.error('Error en resetRegistration', error);
            }
        })
    );
}