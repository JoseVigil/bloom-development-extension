import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Helper para unir paths en URIs (compatibilidad con VS Code 1.80.0)
 */
export function joinPath(base: vscode.Uri, ...pathSegments: string[]): vscode.Uri {
    const joinedPath = path.join(base.fsPath, ...pathSegments);
    return vscode.Uri.file(joinedPath);
}