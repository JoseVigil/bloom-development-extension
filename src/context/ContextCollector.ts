import * as vscode from 'vscode';
import * as path from 'path';

export class ContextCollector {
    async collectContext(): Promise<string[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return [];
        }

        // Permitir selección de archivos
        const selection = await vscode.window.showQuickPick(
            ['Current File', 'Open Files', 'Select Files', 'Entire Project'],
            { placeHolder: 'Selecciona contexto a enviar' }
        );

        switch (selection) {
            case 'Current File':
                return this.getCurrentFile();
            case 'Open Files':
                return this.getOpenFiles();
            case 'Select Files':
                return this.selectFiles();
            case 'Entire Project':
                return this.getProjectFiles();
            default:
                return [];
        }
    }

    private async getCurrentFile(): Promise<string[]> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return [];
        return [editor.document.uri.fsPath];
    }

    private async getOpenFiles(): Promise<string[]> {
        return vscode.workspace.textDocuments
            .filter(doc => doc.uri.scheme === 'file')
            .map(doc => doc.uri.fsPath);
    }

    private async selectFiles(): Promise<string[]> {
        const uris = await vscode.window.showOpenDialog({
            canSelectMany: true,
            canSelectFiles: true,
            canSelectFolders: false,
            filters: {
                'Source Files': ['ts', 'js', 'py', 'jsx', 'tsx'],
                'All Files': ['*']
            }
        });

        return uris?.map(uri => uri.fsPath) || [];
    }

    private async getProjectFiles(): Promise<string[]> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return [];

        const files = await vscode.workspace.findFiles(
            '**/*.{ts,js,py,jsx,tsx,md}',
            '**/node_modules/**'
        );

        return files.map(uri => uri.fsPath);
    }
}