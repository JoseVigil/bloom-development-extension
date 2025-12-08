// src/providers/profileTreeProvider.ts
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ChromeProfileManager, ChromeProfile } from '../core/chromeProfileManager';
import { WebSocketManager } from '../server/WebSocketManager';
import { AiAccountChecker } from '../ai/AiAccountChecker';
import type { AiAccountStatus } from '../ai/index'; // ← Import correcto

export class ProfileTreeProvider implements vscode.TreeDataProvider<ProfileTreeItem> {
    private static instance: ProfileTreeProvider | undefined;
    private _onDidChangeTreeData = new vscode.EventEmitter<ProfileTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private profiles: ChromeProfile[] = [];
    private accountStatuses: Map<string, Map<string, AiAccountStatus>> = new Map();

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private chromeManager: ChromeProfileManager,
        private wsManager: WebSocketManager,
        private accountChecker: AiAccountChecker
    ) {
        this.setupWebSocketListeners();
    }

    public static getInstance(): ProfileTreeProvider {
        if (!ProfileTreeProvider.instance) {
            throw new Error('ProfileTreeProvider no fue inicializado. Llamá a initialize() primero.');
        }
        return ProfileTreeProvider.instance;
    }

    public static initialize(
        context: vscode.ExtensionContext,
        logger: Logger,
        chromeManager: ChromeProfileManager,
        wsManager: WebSocketManager,
        accountChecker: AiAccountChecker
    ) {
        ProfileTreeProvider.instance = new ProfileTreeProvider(
            context,
            logger,
            chromeManager,
            wsManager,
            accountChecker
        );

        const provider = ProfileTreeProvider.instance;
        vscode.window.registerTreeDataProvider('bloomProfiles', provider);
    }

    private setupWebSocketListeners(): void {
        this.wsManager.on('profile:update', (data: any) => {
            this.logger.info('Profile update received via WebSocket');
            this.loadProfiles();
        });

        this.wsManager.on('account:status', (data: any) => {
            this.logger.info('Account status update received via WebSocket');
            if (data.profileId && data.accounts) {
                this.updateAccountStatuses(data.profileId, data.accounts);
            }
        });
    }

    private updateAccountStatuses(profileId: string, accounts: AiAccountStatus[]): void {
        const statusMap = new Map<string, AiAccountStatus>();
        accounts.forEach(acc => {
            statusMap.set(`${acc.provider}-${acc.accountId || 'unknown'}`, acc);
        });

        this.accountStatuses.set(profileId, statusMap);
        this.refresh();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    async loadProfiles(): Promise<void> {
        try {
            this.profiles = await this.chromeManager.detectProfiles();

            // Cargar estados de cuentas AI para cada perfil
            for (const profile of this.profiles) {
                const statuses = await this.accountChecker.checkAllForProfile(profile.name);
                if (statuses.length > 0) {
                    this.updateAccountStatuses(profile.name, statuses);
                }
            }

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
            // Root: perfiles de Chrome
            if (this.profiles.length === 0) {
                await this.loadProfiles();
            }
            return this.profiles.map(profile =>
                new ProfileTreeItem(
                    profile.displayName || profile.name,
                    profile,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'profile'
                )
            );
        }

        if (element.itemType === 'profile' && element.profile) {
            const children: ProfileTreeItem[] = [];

            // Sección AI Accounts
            children.push(
                new ProfileTreeItem(
                    'AI Accounts',
                    element.profile,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'ai-accounts-section'
                )
            );

            // Sección Browser Accounts (si existen)
            if (element.profile.accounts && element.profile.accounts.length > 0) {
                children.push(
                    new ProfileTreeItem(
                        'Browser Accounts',
                        element.profile,
                        vscode.TreeItemCollapsibleState.Expanded,
                        'browser-accounts-section'
                    )
                );
            }

            return children;
        }

        if (element.itemType === 'ai-accounts-section' && element.profile) {
            const profileId = element.profile.name;
            const statuses = this.accountStatuses.get(profileId);

            if (!statuses || statuses.size === 0) {
                return [
                    new ProfileTreeItem(
                        'No AI accounts configured',
                        undefined,
                        vscode.TreeItemCollapsibleState.None,
                        'no-accounts'
                    )
                ];
            }

            return Array.from(statuses.values()).map(status =>
                new ProfileTreeItem(
                    this.formatAccountLabel(status),
                    undefined,
                    vscode.TreeItemCollapsibleState.None,
                    'ai-account',
                    status
                )
            );
        }

        if (element.itemType === 'browser-accounts-section' && element.profile) {
            return element.profile.accounts.map(account =>
                new ProfileTreeItem(
                    `${account.provider}: ${account.email || 'Unknown'}`,
                    undefined,
                    vscode.TreeItemCollapsibleState.None,
                    'browser-account',
                    undefined,
                    account.verified ? 'check' : 'question'
                )
            );
        }

        return [];
    }

    private formatAccountLabel(status: AiAccountStatus): string {
        const providerName = status.provider.toUpperCase();
        const icon = this.getStateIcon(status);

        let label = `${icon} ${providerName}`;

        if (status.usageRemaining !== undefined) {
            label += ` (${status.usageRemaining} left)`;
        } else if (status.quota) {
            const percent = status.quota.percentage.toFixed(0);
            label += ` (${status.quota.used}/${status.quota.total} - ${percent}%)`;
        }

        if (!status.ok && status.error) {
            label += ` — ${status.error}`;
        }

        return label;
    }

    private getStateIcon(status: AiAccountStatus): string {
        if (!status.ok) {
            return status.error?.includes('key') || status.error?.includes('API') ? 'Key' : 'Cross';
        }
        return 'Checkmark';
    }
}

class ProfileTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly profile?: ChromeProfile,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
        public readonly itemType: string = 'unknown',
        public readonly accountStatus?: AiAccountStatus,
        public readonly status?: string // solo usado en browser-account
    ) {
        super(label, collapsibleState);
        this.contextValue = itemType;

        // Iconos y tooltips
        if (itemType === 'profile') {
            this.tooltip = `${profile?.name}\nPath: ${profile?.path}`;
            this.iconPath = new vscode.ThemeIcon('account');
        } else if (itemType === 'ai-accounts-section') {
            this.iconPath = new vscode.ThemeIcon('gear');
            this.tooltip = 'AI Provider Accounts';
        } else if (itemType === 'browser-accounts-section') {
            this.iconPath = new vscode.ThemeIcon('browser');
            this.tooltip = 'Browser Sessions';
        } else if (itemType === 'ai-account' && accountStatus) {
            this.iconPath = this.getAccountIcon(accountStatus);
            this.tooltip = this.getAccountTooltip(accountStatus);
        } else if (itemType === 'browser-account') {
            this.iconPath = new vscode.ThemeIcon(status === 'check' ? 'check' : 'question');
        } else if (itemType === 'no-accounts') {
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }

    private getAccountIcon(status: AiAccountStatus): vscode.ThemeIcon {
        if (!status.ok) {
            if (status.error?.toLowerCase().includes('key') || status.error?.toLowerCase().includes('api')) {
                return new vscode.ThemeIcon('key', new vscode.ThemeColor('editorWarning.foreground'));
            }
            return new vscode.ThemeIcon('error', new vscode.ThemeColor('editorError.foreground'));
        }
        return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
    }

    private getAccountTooltip(status: AiAccountStatus): string {
        let tooltip = `Provider: ${status.provider}\nAccount: ${status.accountId || 'N/A'}\nStatus: ${status.ok ? 'OK' : 'Error'}`;

        if (status.usageRemaining !== undefined) {
            tooltip += `\nUsage remaining: ${status.usageRemaining}`;
        }

        if (status.quota) {
            tooltip += `\nQuota: ${status.quota.used} / ${status.quota.total} (${status.quota.percentage.toFixed(1)}%)`;
        }

        tooltip += `\nLast checked: ${new Date(status.lastChecked).toLocaleString()}`;

        if (status.error) {
            tooltip += `\nError: ${status.error}`;
        }

        return tooltip;
    }
}