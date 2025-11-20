import * as vscode from 'vscode';
import { ChromeProfileManager } from '../core/chromeProfileManager';
import { Intent, IntentProfileConfig } from '../models/intent'; 
import { Logger } from '../utils/logger';

/**
 * Comando: Abrir intent en el navegador con el profile configurado
 */
export async function openIntentInBrowser(
    intent: Intent,
    context: vscode.ExtensionContext,
    logger: Logger
): Promise<void> {
    try {
        const chromeManager = new ChromeProfileManager(context, logger);

        let config: IntentProfileConfig;

        // Si el intent tiene profile configurado, usarlo
        if (intent.profileConfig) {
            config = intent.profileConfig;
        } else {
            // Si no, usar configuración default
            const useDefault = await vscode.window.showWarningMessage(
                `Intent "${intent.metadata.name}" doesn't have a profile configured. Use default Chrome profile?`,
                'Use Default',
                'Configure First',
                'Cancel'
            );

            if (useDefault === 'Configure First') {
                // Abrir comando de configuración
                await vscode.commands.executeCommand('bloom.configureIntentProfile', intent);
                return;
            } else if (useDefault !== 'Use Default') {
                return; // Cancelled
            }

            config = await chromeManager.getDefaultConfig();
        }

        // Extraer conversationId si existe para este provider
        const activeConv = intent.activeConversations?.[config.provider];
        const conversationId = activeConv?.conversationId;

        // Abrir en el navegador
        await chromeManager.openInBrowser(
            config.profileName,
            config.provider,
            conversationId
        );

        // Actualizar lastAccessed si había conversación activa
        if (activeConv) {
            activeConv.lastAccessed = new Date();
            
            // Guardar intent actualizado
            await vscode.commands.executeCommand('bloom.saveIntent', intent);
        }

        logger.info(`Opened intent "${intent.metadata.name}" in browser: ${config.provider} (${config.profileName})`);

    } catch (error: any) {
        logger.error('Error opening intent in browser', error);
        
        vscode.window.showErrorMessage(
            `Failed to open in browser: ${error.message}`,
            'Retry',
            'Configure Profile'
        ).then(async selection => {
            if (selection === 'Retry') {
                await openIntentInBrowser(intent, context, logger);
            } else if (selection === 'Configure Profile') {
                await vscode.commands.executeCommand('bloom.configureIntentProfile', intent);
            }
        });
    }
}

/**
 * Comando: Abrir provider genérico (sin intent específico)
 */
export async function openProviderInBrowser(
    provider: 'claude' | 'chatgpt' | 'grok',
    context: vscode.ExtensionContext,
    logger: Logger
): Promise<void> {
    try {
        const chromeManager = new ChromeProfileManager(context, logger);

        // Detectar profiles disponibles
        const profiles = await chromeManager.detectProfiles();

        if (profiles.length === 0) {
            vscode.window.showErrorMessage('No Chrome profiles found');
            return;
        }

        // Quick pick de profiles
        const items = profiles.map(p => ({
            label: `👤 ${p.displayName || p.name}`,
            description: p.accounts
                .map(a => `${a.provider}: ${a.email || 'logged in'}`)
                .join(', ') || 'No accounts detected',
            profile: p
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Select Chrome profile to open ${provider}`
        });

        if (!selected) {
            return;
        }

        // Abrir
        await chromeManager.openInBrowser(
            selected.profile.name,
            provider
        );

        logger.info(`Opened ${provider} with profile: ${selected.profile.name}`);

    } catch (error: any) {
        logger.error('Error opening provider in browser', error);
        vscode.window.showErrorMessage(`Failed to open ${provider}: ${error.message}`);
    }
}

/**
 * Registrar conversación activa para un intent
 */
export async function registerActiveConversation(
    intent: Intent,
    provider: 'claude' | 'chatgpt' | 'grok',
    conversationId: string,
    conversationUrl: string
): Promise<void> {
    if (!intent.activeConversations) {
        intent.activeConversations = {};
    }

    intent.activeConversations[provider] = {
        conversationId,
        url: conversationUrl,
        lastAccessed: new Date()
    };

    // Guardar intent actualizado
    await vscode.commands.executeCommand('bloom.saveIntent', intent);
}

/**
 * Limpiar conversaciones antiguas (más de 30 días sin acceso)
 */
export async function cleanupOldConversations(intent: Intent): Promise<void> {
    if (!intent.activeConversations) {
        return;
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let cleaned = false;

    for (const [provider, conv] of Object.entries(intent.activeConversations)) {
        const lastAccessed = new Date(conv.lastAccessed);
        
        if (lastAccessed < thirtyDaysAgo) {
            if (intent.activeConversations) {
                delete intent.activeConversations[provider as keyof typeof intent.activeConversations];
            }
            cleaned = true;
        }
    }

    if (cleaned) {
        await vscode.commands.executeCommand('bloom.saveIntent', intent);
    }
}