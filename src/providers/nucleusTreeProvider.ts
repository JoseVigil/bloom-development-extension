// src/providers/nucleusTreeProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { NucleusConfig, LinkedProject, loadNucleusConfig } from '../models/bloomConfig';
import { Logger } from '../utils/logger';
import { UserManager } from '../managers/userManager';

export class NucleusTreeProvider implements vscode.TreeDataProvider<NucleusTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<NucleusTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private configs: Map<string, NucleusConfig> = new Map();
    private logger = new Logger();

    constructor(
        private workspaceRoot: string | undefined,
        private context: vscode.ExtensionContext
    ) {
        this.refresh();
    }

    refresh(): void {
        this.detectAllNucleus();
        this._onDidChangeTreeData.fire(undefined);  // ← CORREGIDO
    }

    private detectAllNucleus(): void {
        this.configs.clear();
        const user = UserManager.init(this.context).getUser();
        if (!user) return;

        const orgs = user.allOrgs || [user.githubUsername];

        for (const org of orgs) {
            const config = this.detectNucleusForOrg(org);
            if (config) {
                this.configs.set(org, config);
            }
        }
    }

    private detectNucleusForOrg(org: string): NucleusConfig | null {
        if (!this.workspaceRoot) return null;

        const bloomPath = path.join(this.workspaceRoot, '.bloom');
        const configPath = path.join(bloomPath, 'core', 'nucleus-config.json');

        if (fs.existsSync(configPath)) {
            const config = loadNucleusConfig(bloomPath);
            if (config?.organization?.name === org) {
                return config;
            }
        }

        const linkPath = path.join(bloomPath, 'nucleus.json');
        if (fs.existsSync(linkPath)) {
            try {
                const link = JSON.parse(fs.readFileSync(linkPath, 'utf-8'));
                if (link.organization === org && link.nucleusPath) {
                    const fullPath = path.resolve(this.workspaceRoot, link.nucleusPath);
                    if (fs.existsSync(fullPath)) {
                        return loadNucleusConfig(path.join(fullPath, '.bloom'));
                    }
                }
            } catch {}
        }

        return null;
    }

    getTreeItem(element: NucleusTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: NucleusTreeItem): Promise<NucleusTreeItem[]> {
        if (!element) {
            const items: NucleusTreeItem[] = [];

            for (const org of this.configs.keys()) {
                items.push(new NucleusTreeItem(
                    `${org}`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'org',
                    org
                ));
            }

            items.push(new NucleusTreeItem(
                'Agregar otro Nucleus',
                vscode.TreeItemCollapsibleState.None,
                'add'
            ));

            if (items.length === 1) {
                items.unshift(new NucleusTreeItem(
                    'No hay Nucleus configurado',
                    vscode.TreeItemCollapsibleState.None,
                    'empty'
                ));
            }

            return items;
        }

        if (element.type === 'org') {
            const config = this.configs.get(element.data as string);
            if (!config?.projects) return [];
            return config.projects.map(p =>
                new NucleusTreeItem(
                    `${p.displayName || p.name}`,
                    vscode.TreeItemCollapsibleState.None,
                    'project',
                    p,
                    {
                        command: 'bloom.openNucleusProject',
                        title: 'Abrir proyecto',
                        arguments: [p]
                    }
                )
            );
        }

        if (element.type === 'add') {
            vscode.commands.executeCommand('bloom.createNewNucleus');
            return [];
        }

        return [];
    }
}

class NucleusTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'org' | 'project' | 'add' | 'empty',
        public readonly data?: any,
        command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.command = command;

        switch (type) {
            case 'org':
                this.iconPath = new vscode.ThemeIcon('organization');
                break;
            case 'project':
                this.iconPath = new vscode.ThemeIcon('folder');
                break;
            case 'add':
                this.iconPath = new vscode.ThemeIcon('add');
                break;
            case 'empty':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
        }
    }
}

// ←←← LA FUNCIÓN QUE FALTABA EXPORTAR
export async function openNucleusProject(project: LinkedProject): Promise<void> {
    try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        let projectPath: string | null = null;
        const relativePath = path.join(workspaceRoot, project.localPath);
        if (fs.existsSync(relativePath)) {
            projectPath = relativePath;
        } else {
            const parentDir = path.dirname(workspaceRoot);
            const parentRelativePath = path.join(parentDir, project.localPath);
            if (fs.existsSync(parentRelativePath)) {
                projectPath = parentRelativePath;
            }
        }

        if (!projectPath) {
            const browse = await vscode.window.showWarningMessage(
                `Project path not found: ${project.localPath}`,
                'Browse for Project', 'Cancel'
            );

            if (browse === 'Browse for Project') {
                const selected = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: `Select ${project.name} folder`,
                    title: `Locate ${project.displayName}`
                });

                if (selected && selected.length > 0) {
                    projectPath = selected[0].fsPath;
                }
            }

            if (!projectPath) return;
        }

        await vscode.commands.executeCommand(
            'vscode.openFolder',
            vscode.Uri.file(projectPath),
            true
        );
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error opening project: ${error.message}`);
    }
}