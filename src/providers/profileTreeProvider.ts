// src/providers/profileTreeProvider.ts
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ChromeProfileManager, ChromeProfile } from '../core/chromeProfileManager';

export class ProfileTreeProvider implements vscode.TreeDataProvider<ProfileTreeItem> {
    private static instance: ProfileTreeProvider | undefined;

    private _onDidChangeTreeData = new vscode.EventEmitter<ProfileTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private profiles: ChromeProfile[] = [];

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private chromeManager: ChromeProfileManager
    ) {}

    public static getInstance(): ProfileTreeProvider {
        if (!ProfileTreeProvider.instance) {
            throw new Error('ProfileTreeProvider no fue inicializado. Llamá a initialize() primero.');
        }
        return ProfileTreeProvider.instance;
    }

    public static initialize(context: vscode.ExtensionContext, logger: Logger, chromeManager: ChromeProfileManager) {
        ProfileTreeProvider.instance = new ProfileTreeProvider(context, logger, chromeManager);
        // Registrar el tree provider
        const provider = ProfileTreeProvider.instance;
        vscode.window.registerTreeDataProvider('bloomProfiles', provider);
    }

    refresh(): void {
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
            return element.profile.accounts.map(account =>
                new ProfileTreeItem(
                    `${account.provider}: ${account.email || 'Unknown'}`,
                    undefined,
                    vscode.TreeItemCollapsibleState.None,
                    account.verified ? 'check' : 'question'
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
            this.iconPath = new vscode.ThemeIcon('account');
        } else {
            this.contextValue = 'account';
            this.iconPath = new vscode.ThemeIcon(status === 'check' ? 'check' : 'question');
        }
    }
}