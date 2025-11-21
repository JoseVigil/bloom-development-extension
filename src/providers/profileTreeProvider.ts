import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ChromeProfileManager, ChromeProfile } from '../core/chromeProfileManager';

export class ProfileTreeProvider implements vscode.TreeDataProvider<ProfileTreeItem> {    
    // ✅ FIX 1: Especificar el tipo correcto sin 'void'
    private _onDidChangeTreeData = new vscode.EventEmitter<ProfileTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private profiles: ChromeProfile[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private chromeManager: ChromeProfileManager
    ) {}

    refresh(): void {
        // ✅ FIX 2: Pasar undefined explícitamente en lugar de void
        this._onDidChangeTreeData.fire(undefined);
    }

    async loadProfiles(): Promise<void> {
        try {
            this.profiles = await this.chromeManager.detectProfiles();
            this.refresh();
        } catch (error: any) {
            this.logger.error('Error loading profiles', error);
            vscode.window.showErrorMessage(`Failed to load profiles: ${error.message}`);
        }
    }

    getTreeItem(element: ProfileTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ProfileTreeItem): Promise<ProfileTreeItem[]> {
        if (!element) {
            // Root level: show profiles
            if (this.profiles.length === 0) {
                await this.loadProfiles();
            }

            return this.profiles.map(profile => 
                new ProfileTreeItem(
                    profile.displayName || profile.name,
                    profile,
                    vscode.TreeItemCollapsibleState.Collapsed
                )
            );
        } else if (element.profile) {
            // Child level: show accounts
            return element.profile.accounts.map(account =>
                new ProfileTreeItem(
                    `${account.provider}: ${account.email || 'Unknown'}`,
                    undefined,
                    vscode.TreeItemCollapsibleState.None,
                    account.verified ? '✓' : '?'
                )
            );
        }

        return [];
    }
}

class ProfileTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly profile?: ChromeProfile,
        public readonly collapsibleState?: vscode.TreeItemCollapsibleState,
        public readonly status?: string
    ) {
        super(label, collapsibleState || vscode.TreeItemCollapsibleState.None);

        if (profile) {
            this.tooltip = `${profile.name}\nPath: ${profile.path}`;
            this.contextValue = 'profile';
            // Fix: Usa constructor correcto de ThemeIcon sin cast
            this.iconPath = new vscode.ThemeIcon('account');
        } else {
            this.contextValue = 'account';
            // Fix: Usa constructor correcto para status
            this.iconPath = new vscode.ThemeIcon(status === '✓' ? 'check' : 'question');
        }
    }
}