import * as vscode from 'vscode';
import { BTIPExplorerPanel } from '../ui/BTIPExplorerPanel';
import { Logger } from '../utils/logger';

export async function openBTIPExplorer(context: vscode.ExtensionContext): Promise<void> {
    try {
        await BTIPExplorerPanel.createOrShow(context.extensionUri);
    } catch (error) {
        Logger.error('Error opening BTIP Explorer:', error);
        vscode.window.showErrorMessage('Failed to open BTIP Explorer');
    }
}