// src/commands/git/gitCommands.ts
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { GitManager } from '../../utils/gitManager';

/**
 * Registra todos los comandos relacionados con Git
 */
export function registerGitCommands(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    // ========================================
    // COMANDO: Review Pending Commits
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.reviewPendingCommits', async () => {
            try {
                await GitManager.reviewAndCommit();
                logger.info('Git review completed');
            } catch (error: any) {
                logger.error('Error reviewing commits', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );
}