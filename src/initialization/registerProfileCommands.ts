// src/initialization/registerProfileCommands.ts
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ChromeProfileManager } from '../core/chromeProfileManager';
import { ProfileTreeProvider } from '../providers/profileTreeProvider';
import { WebSocketManager } from '../server/WebSocketManager';
import { AiAccountChecker } from '../ai/AiAccountChecker';

interface ProfileCommandDeps {
    chromeManager: ChromeProfileManager;
    profileTree: ProfileTreeProvider;
    wsManager: WebSocketManager;
    accountChecker: AiAccountChecker;
}

/**
 * Registra todos los comandos relacionados con perfiles de Chrome y cuentas AI
 * Sigue exactamente el mismo patrón que registerAllCommands y registerCriticalCommands
 */
export function registerProfileCommands(
    context: vscode.ExtensionContext,
    logger: Logger,
    deps: ProfileCommandDeps
) {
    const { chromeManager, profileTree, wsManager, accountChecker } = deps;

    // 1. Refrescar árbol de perfiles
    const refreshProfiles = vscode.commands.registerCommand(
        'bloom.profiles.refresh',
        () => {
            logger.info('Comando: Refresh perfiles Chrome');
            profileTree.refresh();
        }
    );

    // 2. Seleccionar perfil activo de Chrome
    const selectProfile = vscode.commands.registerCommand(
        'bloom.profiles.select',
        async () => {
            logger.info('Comando: Seleccionar perfil Chrome');
            await chromeManager.selectProfileInteractive();
            profileTree.refresh();
        }
    );

    // 3. Abrir Chrome con perfil seleccionado
    const openChrome = vscode.commands.registerCommand(
        'bloom.profiles.openChrome',
        async () => {
            logger.info('Comando: Abrir Chrome con perfil activo');
            await chromeManager.launchChromeWithActiveProfile();
        }
    );

    // 4. Crear nuevo perfil de Chrome
    const createProfile = vscode.commands.registerCommand(
        'bloom.profiles.create',
        async () => {
            logger.info('Comando: Crear nuevo perfil Chrome');
            await chromeManager.createNewProfile();
            profileTree.refresh();
        }
    );

    // 5. Editar perfil (nombre / color)
    const editProfile = vscode.commands.registerCommand(
        'bloom.profiles.edit',
        async (item?: any) => {
            logger.info('Comando: Editar perfil');
            await chromeManager.editProfile(item);
            profileTree.refresh();
        }
    );

    // 6. Eliminar perfil
    const deleteProfile = vscode.commands.registerCommand(
        'bloom.profiles.delete',
        async (item?: any) => {
            logger.info('Comando: Eliminar perfil');
            await chromeManager.deleteProfile(item);
            profileTree.refresh();
        }
    );

    // 7. Forzar chequeo manual de cuentas AI (Claude, OpenAI, Gemini, etc.)
    const checkAiAccounts = vscode.commands.registerCommand(
        'bloom.aiAccounts.checkNow',
        async () => {
            logger.info('Comando: Chequeo manual de cuentas AI');
            vscode.window.showInformationMessage('Bloom: Chequeando cuentas AI...');
            await accountChecker.checkAllAccountsNow();
            profileTree.refresh(); // actualiza estado de sesión en el árbol
        }
    );

    // 8. Abrir panel de configuración de cuentas AI
    const openAiSettings = vscode.commands.registerCommand(
        'bloom.aiAccounts.openSettings',
        () => {
            logger.info('Comando: Abrir configuración de cuentas AI');
            vscode.commands.executeCommand('workbench.action.openSettings', 'bloom.aiAccounts');
        }
    );

    // 9. Limpiar caché de sesiones AI (útil cuando hay login loops)
    const clearAiCache = vscode.commands.registerCommand(
        'bloom.aiAccounts.clearCache',
        async () => {
            logger.info('Comando: Limpiar caché de sesiones AI');
            await accountChecker.clearAllSessionCache();
            vscode.window.showInformationMessage('Bloom: Caché de cuentas AI limpiado');
            profileTree.refresh();
        }
    );

    // Registrar todos los comandos en las suscripciones
    context.subscriptions.push(
        refreshProfiles,
        selectProfile,
        openChrome,
        createProfile,
        editProfile,
        deleteProfile,
        checkAiAccounts,
        openAiSettings,
        clearAiCache
    );

    logger.info('Todos los comandos de perfiles y cuentas AI registrados correctamente');
}