// src/providers/nucleusWelcomeProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { UserManager } from '../managers/userManager';

export class NucleusWelcomeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {
        vscode.commands.executeCommand('setContext', 'bloom.isRegistered', UserManager.init(context).isRegistered());
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        const userManager = UserManager.init(this.context);
        if (userManager.isRegistered()) {
            // Ya registrado → delegar al NucleusTreeProvider real
            vscode.commands.executeCommand('bloom.focusRealNucleusView');
            return Promise.resolve([]);
        }

        // Mostrar pantalla de bienvenida
        const item = new vscode.TreeItem('Bienvenido a Bloom Nucleus', vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('flame');
        item.command = {
            command: 'bloom.showWelcome',
            title: 'Mostrar bienvenida'
        };
        return Promise.resolve([item]);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}