// src/commands/profile/checkAiAccounts.ts
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { AiAccountChecker } from '../../ai/AiAccountChecker';
import { ProfileTreeProvider } from '../../providers/profileTreeProvider';

export async function checkAiAccounts(
    context: vscode.ExtensionContext,
    logger: Logger,
    accountChecker: AiAccountChecker,
    profileName?: string
): Promise<void> {
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Checking AI Accounts',
            cancellable: false
        }, async (progress) => {
            if (profileName) {
                progress.report({ message: `Checking ${profileName}...` });
                await checkProfileAccounts(profileName, accountChecker, logger);
            } else {
                const profiles = await getAllProfiles(context);
                
                for (let i = 0; i < profiles.length; i++) {
                    const profile = profiles[i];
                    progress.report({ 
                        message: `Checking ${profile} (${i + 1}/${profiles.length})...`,
                        increment: (100 / profiles.length)
                    });
                    
                    await checkProfileAccounts(profile, accountChecker, logger);
                }
            }
        });

        const treeProvider = ProfileTreeProvider.getInstance();
        if (treeProvider) {
            await treeProvider.loadProfiles();
        }

        vscode.window.showInformationMessage('AI accounts check completed');

    } catch (error: any) {
        logger.error('Error checking AI accounts', error);
        vscode.window.showErrorMessage(`Error: ${error.message}`);
    }
}

async function checkProfileAccounts(
    profileName: string,
    checker: AiAccountChecker,
    logger: Logger
): Promise<void> {
    try {
        const accounts = await checker.checkAllForProfile(profileName);
        
        logger.info(`Checked ${accounts.length} AI accounts for profile "${profileName}"`);
        
        accounts.forEach((account) => {
            const { provider, accountId, ok, error, quota } = account;
            const state = ok ? 'OK' : 'ERROR';
            const usage = quota ? `${quota.used}/${quota.total} (${quota.percentage.toFixed(1)}%)` : 'unknown';
            const message = `${provider} (${accountId || 'default'}): ${state} – ${usage}`;
            
            if (!ok && error) {
                logger.error(message, new Error(error));
            } else {
                logger.info(message);
            }
        });

    } catch (error: any) {
        logger.error(`Failed to check accounts for profile "${profileName}"`, error);
    }
}

async function getAllProfiles(context: vscode.ExtensionContext): Promise<string[]> {
    const profiles = context.globalState.get<any[]>('bloom.chrome.profiles', []);
    return profiles.map(p => p.name);
}

export async function checkSpecificAccount(
    profileName: string,
    provider: string,
    accountId: string,
    checker: AiAccountChecker,
    logger: Logger
): Promise<void> {
    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Checking ${provider} account...`,
            cancellable: false
        }, async () => {
            const status = await checker.checkAccount(profileName, provider as any, accountId);
            
            if (status.ok) {
                vscode.window.showInformationMessage(
                    `${provider} account is working correctly`
                );
            } else if (status.error) {
                vscode.window.showErrorMessage(
                    `${provider} account error: ${status.error}`
                );
            }

            logger.info(`Account check: ${provider}/${accountId} - ${status.ok ? 'ok' : 'failed'}`);
        });

        const treeProvider = ProfileTreeProvider.getInstance();
        if (treeProvider) {
            await treeProvider.loadProfiles();
        }

    } catch (error: any) {
        logger.error('Error checking specific account', error);
        vscode.window.showErrorMessage(`Error: ${error.message}`);
    }
}