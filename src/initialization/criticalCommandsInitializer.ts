// src/initialization/criticalCommandsInitializer.ts
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { UserManager } from '../managers/userManager';

/**
 * Registra comandos críticos cuando NO hay workspace abierto
 * 
 * Estos comandos permiten al usuario:
 * - Resetear configuración si algo falla
 * 
 * Se ejecutan en "modo degradado" para garantizar funcionalidad mínima
 */
export function registerCriticalCommands(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    logger.info('⚡ Registering critical commands (no workspace mode)');

    // ========================================
    // COMANDO: Reset Registration
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.resetRegistration', async () => {
            const confirm = await vscode.window.showWarningMessage(
                '⚠️ ¿Resetear configuración?',
                { modal: true },
                'Sí, Resetear',
                'Cancelar'
            );

            if (confirm !== 'Sí, Resetear') return;

            try {
                await UserManager.init(context).clear();
                
                vscode.window.showInformationMessage(
                    '✅ Registro reseteado. Recargando ventana...'
                );
                
                logger.info('Registration reset (critical mode)');
                
                setTimeout(async () => {
                    await vscode.commands.executeCommand('workbench.action.reloadWindow');
                }, 1000);
                
            } catch (error: any) {
                logger.error('Error resetting registration', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    logger.info('✅ Critical commands registered successfully');
}