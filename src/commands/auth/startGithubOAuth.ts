// src/commands/auth/startGithubOAuth.ts
import * as vscode from 'vscode';
import { GitHubOAuthServer } from '../../auth/GitHubOAuthServer';
import { UserManager } from '../../managers/userManager';
import { WebSocketManager } from '../../server/WebSocketManager';

let oauthServer: GitHubOAuthServer | null = null;

export function registerStartGithubOAuthCommand(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel,
    userManager: UserManager,
    wsManager: WebSocketManager,
    pluginApiPort: number
): void {
    const disposable = vscode.commands.registerCommand('bloom.startGitHubOAuth', async () => {
        try {
            // Check if already authenticated
            const isAuthenticated = await userManager.isGithubAuthenticated();
            if (isAuthenticated) {
                const choice = await vscode.window.showInformationMessage(
                    'GitHub is already authenticated. Do you want to re-authenticate?',
                    'Yes',
                    'No'
                );

                if (choice !== 'Yes') {
                    return;
                }
            }

            // Create OAuth server instance
            if (!oauthServer) {
                oauthServer = new GitHubOAuthServer(
                    outputChannel,
                    userManager,
                    pluginApiPort
                );
                oauthServer.setWebSocketManager(wsManager);
            }

            // Show progress
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Starting GitHub authentication...',
                    cancellable: false
                },
                async () => {
                    await oauthServer!.startOAuthFlow();
                }
            );

            vscode.window.showInformationMessage(
                'GitHub authentication started. Please complete the flow in your browser.'
            );

        } catch (error: any) {
            vscode.window.showErrorMessage(
                `GitHub authentication failed: ${error.message}`
            );
            outputChannel.appendLine(`[GitHubOAuth] Error: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);
}

export function stopGithubOAuthServer(): void {
    if (oauthServer) {
        oauthServer.stop();
        oauthServer = null;
    }
}