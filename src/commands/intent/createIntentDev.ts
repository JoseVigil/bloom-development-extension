import * as vscode from 'vscode';
import { IntentFormPanel } from '../../ui/intent/intentFormPanel';
import { Logger } from '../../utils/logger';

// === UTILIDADES PARA INTENT DEV ===
export function generateUID(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 3; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export async function ensureUniqueUID(baseName: string, workspaceUri: vscode.Uri): Promise<string> {
    const devFolder = vscode.Uri.joinPath(workspaceUri, '.bloom', 'intents', 'dev');

    let uid: string;
    let attempts = 0;
    const maxAttempts = 100; // seguridad

    do {
        if (attempts++ > maxAttempts) throw new Error('No se pudo generar UID único');
        uid = generateUID();
        const folderName = `${baseName}-${uid}`;
        const fullPath = vscode.Uri.joinPath(devFolder, folderName);

        try {
            await vscode.workspace.fs.stat(fullPath);
            // Si existe → colisión, seguimos intentando
        } catch (error: any) {
            if (error.code === 'FileSystemError' || error.name === 'EntryNotFoundError') {
                // No existe → ¡perfecto! podemos usarlo
                return uid;
            }
            throw error; // otro error real
        }
    } while (true);
}

// === COMANDO PRINCIPAL ===
export async function createIntentDevCommand(
    context: vscode.ExtensionContext,
    logger: Logger
): Promise<void> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const nucleusPath = vscode.Uri.joinPath(workspaceFolder.uri, '.bloom', 'core');
    try {
        await vscode.workspace.fs.stat(nucleusPath);
    } catch {
        const action = await vscode.window.showErrorMessage(
            'No Bloom nucleus found. Create one first.',
            'Create Nucleus'
        );
        if (action === 'Create Nucleus') {
            await vscode.commands.executeCommand('bloom.createNucleus');
        }
        return;
    }

    const selectedUris = await vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFiles: true,
        canSelectFolders: false,
        openLabel: 'Select Files for Intent DEV',
        title: 'Select files to include in Intent DEV'
    });

    if (!selectedUris || selectedUris.length === 0) {
        vscode.window.showWarningMessage('At least 1 file required for Intent DEV');
        return;
    }

    const relativePaths = selectedUris.map(uri =>
        vscode.workspace.asRelativePath(uri, false)
    );

    logger.info(`Creating Intent DEV with ${selectedUris.length} files`);

    const panel = new IntentFormPanel(
        context,
        logger,
        workspaceFolder,
        selectedUris,
        relativePaths
    );

    await panel.show();
}