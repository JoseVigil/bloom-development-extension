// src/commands/profile/profileCommands.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../utils/logger';
import { Managers } from '../../initialization/managersInitializer';
import { ProfileManagerPanel } from '../../ui/profile/profileManagerPanel';
import { ProfileTreeProvider } from '../../providers/profileTreeProvider';
import { Intent } from '../../models/intent';
import { openIntentInBrowser, openProviderInBrowser } from '../openIntentInBrowser';
import {
    configureIntentProfile,
    changeIntentProfile,
    removeIntentProfile
} from '../configureIntentProfile';

/**
 * Registra todos los comandos relacionados con Chrome Profiles
 */
export function registerProfileCommands(
    context: vscode.ExtensionContext,
    logger: Logger,
    managers: Managers
): void {
    // ========================================
    // COMANDO: Manage Profiles
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.manageProfiles', () => {
            try {
                ProfileManagerPanel.createOrShow(context.extensionUri, logger, context);
                logger.info('Profile manager opened');
            } catch (error: any) {
                logger.error('Error opening profile manager', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Refresh Profiles
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.refreshProfiles', () => {
            try {
                const provider = ProfileTreeProvider.getInstance();
                if (provider) {
                    provider.refresh();
                    vscode.window.showInformationMessage('✅ Perfiles actualizados');
                    logger.info('Chrome profiles refreshed');
                } else {
                    throw new Error('ProfileTreeProvider not initialized');
                }
            } catch (error: any) {
                logger.error('Error refreshing profiles', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Configure Intent Profile
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.configureIntentProfile', (intent: Intent) => {
            try {
                if (intent) {
                    configureIntentProfile(intent, context, logger);
                } else {
                    vscode.window.showWarningMessage('No intent selected');
                }
            } catch (error: any) {
                logger.error('Error configuring profile', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Change Intent Profile
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.changeIntentProfile', (intent: Intent) => {
            try {
                if (intent) {
                    changeIntentProfile(intent, context, logger);
                } else {
                    vscode.window.showWarningMessage('No intent selected');
                }
            } catch (error: any) {
                logger.error('Error changing profile', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Remove Intent Profile
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.removeIntentProfile', (intent: Intent) => {
            try {
                if (intent) {
                    removeIntentProfile(intent, context, logger);
                } else {
                    vscode.window.showWarningMessage('No intent selected');
                }
            } catch (error: any) {
                logger.error('Error removing profile', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Open Intent in Browser
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openIntentInBrowser', async (intent?: Intent) => {
            try {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                
                if (!workspaceFolder) {
                    vscode.window.showWarningMessage('No workspace folder open');
                    return;
                }

                if (!intent) {
                    const intents = await getAvailableIntents(workspaceFolder);
                    if (intents.length === 0) {
                        vscode.window.showInformationMessage('No hay intents disponibles');
                        return;
                    }
                    const selected = await vscode.window.showQuickPick(
                        intents.map(i => ({ label: i.metadata.name, intent: i })),
                        { placeHolder: 'Selecciona un intent' }
                    );
                    intent = selected?.intent;
                }
                
                if (intent) {
                    await openIntentInBrowser(intent, context, logger);
                }
            } catch (error: any) {
                logger.error('Error opening intent in browser', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Open Claude in Browser
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openClaudeInBrowser', () => {
            try {
                openProviderInBrowser('claude', context, logger);
            } catch (error: any) {
                logger.error('Error opening Claude', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Open ChatGPT in Browser
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openChatGPTInBrowser', () => {
            try {
                openProviderInBrowser('chatgpt', context, logger);
            } catch (error: any) {
                logger.error('Error opening ChatGPT', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Open Grok in Browser
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openGrokInBrowser', () => {
            try {
                openProviderInBrowser('grok', context, logger);
            } catch (error: any) {
                logger.error('Error opening Grok', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );
}

/**
 * Helper: Obtiene intents disponibles
 */
async function getAvailableIntents(workspaceFolder: vscode.WorkspaceFolder): Promise<Intent[]> {
    const intentsPath = path.join(workspaceFolder.uri.fsPath, '.bloom', 'intents');
    
    if (!fs.existsSync(intentsPath)) {
        return [];
    }

    const files = fs.readdirSync(intentsPath).filter(f => f.endsWith('.json'));
    const intents: Intent[] = [];

    for (const file of files) {
        try {
            const filePath = path.join(intentsPath, file);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Intent;
            
            if (data?.metadata?.name) {
                intents.push(data);
            }
        } catch {
            // Skip invalid files
        }
    }
    
    return intents;
}