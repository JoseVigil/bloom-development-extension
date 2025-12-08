// src/commands/profile/addAiAccount.ts
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { ProfileTreeProvider } from '../../providers/profileTreeProvider';

const SUPPORTED_PROVIDERS = [
    { label: '🤖 Claude (Anthropic)', value: 'claude' },
    { label: '💬 ChatGPT (OpenAI)', value: 'chatgpt' },
    { label: '🚀 Grok (xAI)', value: 'grok' },
    { label: '✨ Gemini (Google)', value: 'gemini' }
];

export async function addAiAccount(
    context: vscode.ExtensionContext,
    logger: Logger,
    profileName?: string
): Promise<void> {
    try {
        // 1. Seleccionar perfil si no se proporcionó
        if (!profileName) {
            const profiles = await getAvailableProfiles(context);
            if (profiles.length === 0) {
                vscode.window.showWarningMessage('No Chrome profiles found. Scan profiles first.');
                return;
            }

            const selectedProfile = await vscode.window.showQuickPick(
                profiles.map(p => ({ label: p, value: p })),
                { placeHolder: 'Select a Chrome profile' }
            );

            if (!selectedProfile) {
                return;
            }

            profileName = selectedProfile.value;
        }

        // 2. Seleccionar proveedor
        const provider = await vscode.window.showQuickPick(SUPPORTED_PROVIDERS, {
            placeHolder: 'Select AI provider'
        });

        if (!provider) {
            return;
        }

        // 3. Solicitar Account ID (opcional, puede ser email o username)
        const accountId = await vscode.window.showInputBox({
            prompt: `Enter account identifier for ${provider.label} (optional)`,
            placeHolder: 'e.g., your-email@example.com or account-name',
            value: 'default'
        });

        if (!accountId) {
            return;
        }

        // 4. Solicitar API Key
        const apiKey = await vscode.window.showInputBox({
            prompt: `Enter API Key for ${provider.label}`,
            placeHolder: 'Paste your API key here',
            password: true,
            validateInput: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'API Key cannot be empty';
                }
                if (value.trim().length < 10) {
                    return 'API Key seems too short';
                }
                return null;
            }
        });

        if (!apiKey) {
            return;
        }

        // 5. Guardar en SecretStorage
        const secretKey = getSecretKey(profileName, provider.value, accountId);
        await context.secrets.store(secretKey, apiKey.trim());

        // 6. Guardar metadata en globalState
        await saveAccountMetadata(context, profileName, provider.value, accountId);

        logger.info(`AI account added: ${provider.value} for profile ${profileName}`);

        // 7. Refrescar UI
        const treeProvider = ProfileTreeProvider.getInstance();
        if (treeProvider) {
            await treeProvider.loadProfiles();
        }

        vscode.window.showInformationMessage(
            `✅ ${provider.label} account configured for ${profileName}`
        );

    } catch (error: any) {
        logger.error('Error adding AI account', error);
        vscode.window.showErrorMessage(`Error: ${error.message}`);
    }
}

/**
 * Genera la clave secreta para almacenar API keys
 */
function getSecretKey(profileName: string, provider: string, accountId: string): string {
    return `bloom.ai.${profileName}.${provider}.${accountId}`;
}

/**
 * Guarda metadata de la cuenta en globalState
 */
async function saveAccountMetadata(
    context: vscode.ExtensionContext,
    profileName: string,
    provider: string,
    accountId: string
): Promise<void> {
    const key = 'bloom.ai.accounts';
    const existing = context.globalState.get<any[]>(key, []);

    // Verificar si ya existe
    const index = existing.findIndex(
        acc => acc.profileName === profileName && 
               acc.provider === provider && 
               acc.accountId === accountId
    );

    const metadata = {
        profileName,
        provider,
        accountId,
        addedAt: Date.now()
    };

    if (index >= 0) {
        existing[index] = metadata;
    } else {
        existing.push(metadata);
    }

    await context.globalState.update(key, existing);
}

/**
 * Obtiene perfiles disponibles
 */
async function getAvailableProfiles(context: vscode.ExtensionContext): Promise<string[]> {
    // Leer desde globalState o ChromeProfileManager
    const profiles = context.globalState.get<any[]>('bloom.chrome.profiles', []);
    return profiles.map(p => p.name);
}