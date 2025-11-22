import * as vscode from 'vscode';
import { Intent } from '../models/intent';
import { IntentProfileConfig } from '../models/intent';
import { ChromeProfileManager, ChromeProfile } from '../core/chromeProfileManager';
import { Logger } from '../utils/logger';

/**
 * Comando: Configurar profile y AI provider para un intent
 */
export async function configureIntentProfile(
    intent: Intent,
    context: vscode.ExtensionContext,
    logger: Logger
): Promise<void> {
    try {
        const chromeManager = new ChromeProfileManager(context, logger);

        // PASO 1: Detectar profiles de Chrome
        vscode.window.showInformationMessage('🔍 Scanning Chrome profiles...');
        
        const profiles = await chromeManager.detectProfiles();

        if (profiles.length === 0) {
            vscode.window.showErrorMessage(
                'No Chrome profiles found. Please install Chrome and create at least one profile.'
            );
            return;
        }

        logger.info(`Found ${profiles.length} Chrome profiles`);

        // PASO 2: Usuario selecciona profile
        const profileItems = profiles.map(p => ({
            label: `👤 ${p.displayName || p.name}`,
            description: p.accounts.length > 0
                ? p.accounts.map(a => `${a.provider}${a.email ? `: ${a.email}` : ''}`).join(', ')
                : 'No accounts detected yet',
            detail: p.path,
            profile: p
        }));

        const selectedProfile = await vscode.window.showQuickPick(profileItems, {
            placeHolder: 'Select Chrome profile for this intent',
            title: `Configure Profile for: ${intent.metadata.name}`
        });

        if (!selectedProfile) {
            return; // Cancelled
        }

        // PASO 3: Usuario selecciona AI Provider
        const providerItems = [
            {
                label: '🤖 Claude',
                description: 'Claude.ai by Anthropic',
                provider: 'claude' as const
            },
            {
                label: '💬 ChatGPT',
                description: 'ChatGPT by OpenAI',
                provider: 'chatgpt' as const
            },
            {
                label: '🚀 Grok',
                description: 'Grok by xAI (X.com)',
                provider: 'grok' as const
            }
        ];

        const selectedProvider = await vscode.window.showQuickPick(providerItems, {
            placeHolder: 'Select AI provider',
            title: `Profile: ${selectedProfile.profile.name}`
        });

        if (!selectedProvider) {
            return; // Cancelled
        }

        // PASO 4: Verificar cuenta (opcional pero recomendado)
        const verifyNow = await vscode.window.showInformationMessage(
            `Verify that you're logged into ${selectedProvider.label} in this profile?`,
            { modal: false },
            'Verify Now',
            'Skip Verification'
        );

        let accountEmail: string | undefined;
        let verified = false;

        if (verifyNow === 'Verify Now') {
            // Mostrar progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Verifying ${selectedProvider.label} login...`,
                cancellable: false
            }, async (progress) => {
                try {
                    const account = await chromeManager.verifyAccount(
                        selectedProfile.profile.name,
                        selectedProvider.provider
                    );

                    accountEmail = account.email;
                    verified = account.verified;

                    if (verified) {
                        vscode.window.showInformationMessage(
                            `✅ Verified: ${accountEmail || 'Logged in'}`
                        );
                    } else {
                        vscode.window.showWarningMessage(
                            `⚠️ Could not verify login for ${selectedProvider.label}`
                        );
                    }

                } catch (error: any) {
                    logger.error('Verification error', error);
                    vscode.window.showWarningMessage(
                        `Verification failed: ${error.message}`
                    );
                }
            });
        }

        // PASO 5: Guardar configuración
        const config: IntentProfileConfig = {
            profileName: selectedProfile.profile.name,
            provider: selectedProvider.provider,
            account: accountEmail
        };

        // Actualizar intent
        intent.profileConfig = config;

        // Guardar en ChromeProfileManager (mapping centralizado)
        await chromeManager.saveIntentMapping({
            intentId: intent.metadata.id,
            profileName: config.profileName,
            aiAccounts: config.account ? { [config.provider]: config.account } : undefined
        });

        // Guardar intent
        await vscode.commands.executeCommand('bloom.saveIntent', intent);

        // Confirmación
        const message = verified
            ? `✅ Profile configured: ${config.profileName} (${config.provider}: ${accountEmail})`
            : `✅ Profile configured: ${config.profileName} (${config.provider})`;

        const action = await vscode.window.showInformationMessage(
            message,
            'Open Now',
            'OK'
        );

        if (action === 'Open Now') {
            await vscode.commands.executeCommand('bloom.openIntentInBrowser', intent);
        }

        logger.info(`Profile configured for intent "${intent.metadata.name}": ${config.profileName} (${config.provider})`);


    } catch (error: any) {
        logger.error('Error configuring intent profile', error);
        vscode.window.showErrorMessage(`Failed to configure profile: ${error.message}`);
    }
}

/**
 * Comando: Cambiar profile de un intent existente
 */
export async function changeIntentProfile(
    intent: Intent,
    context: vscode.ExtensionContext,
    logger: Logger
): Promise<void> {
    const currentConfig = intent.profileConfig;

    if (!currentConfig) {
        // Si no hay configuración, usar el comando normal
        await configureIntentProfile(intent, context, logger);
        return;
    }

    // Mostrar configuración actual
    const change = await vscode.window.showWarningMessage(
        `Current configuration:\n` +
        `Profile: ${currentConfig.profileName}\n` +
        `Provider: ${currentConfig.provider}\n` +
        `Account: ${currentConfig.account || 'Not specified'}\n\n` +
        `Do you want to change it?`,
        { modal: true },
        'Change Profile',
        'Keep Current'
    );

    if (change === 'Change Profile') {
        await configureIntentProfile(intent, context, logger);
    }
}

/**
 * Comando: Remover configuración de profile de un intent
 */
export async function removeIntentProfile(
    intent: Intent,
    context: vscode.ExtensionContext,
    logger: Logger
): Promise<void> {
    if (!intent.profileConfig) {
        vscode.window.showInformationMessage('This intent has no profile configured');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Remove profile configuration from "${intent.metadata.name}"?`,
        { modal: true },
        'Remove',
        'Cancel'
    );

    if (confirm !== 'Remove') {
        return;
    }

    try {
        const chromeManager = new ChromeProfileManager(context, logger);

        // Eliminar del manager
        await chromeManager.deleteIntentMapping(intent.metadata.id);

        // Eliminar del intent
        delete intent.profileConfig;

        // Guardar intent
        await vscode.commands.executeCommand('bloom.saveIntent', intent);

        vscode.window.showInformationMessage(
            `✅ Profile configuration removed from "${intent.metadata.name}"`
        );

        logger.info(`Profile configuration removed from intent: ${intent.metadata.name}`);

    } catch (error: any) {
        logger.error('Error removing profile configuration', error);
        vscode.window.showErrorMessage(`Failed to remove configuration: ${error.message}`);
    }
}

/**
 * Helper: Obtener texto descriptivo del profile config
 */
export function getProfileConfigDescription(config?: IntentProfileConfig): string {
    if (!config) {
        return 'No profile configured';
    }

    const parts = [
        `Profile: ${config.profileName}`,
        `Provider: ${config.provider}`
    ];

    if (config.account) {
        parts.push(`Account: ${config.account}`);
    }

    return parts.join(' | ');
}