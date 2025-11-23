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
        this._onDidChangeTreeData.fire(undefined);
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

        // Caso 1: Workspace actual ES un Nucleus
        const bloomPath = path.join(this.workspaceRoot, '.bloom');
        const configPath = path.join(bloomPath, 'core', 'nucleus-config.json');

        if (fs.existsSync(configPath)) {
            const config = loadNucleusConfig(bloomPath);
            if (config?.organization?.name === org) {
                return config;
            }
        }

        // Caso 2: Workspace tiene link a Nucleus
        const linkPath = path.join(bloomPath, 'nucleus.json');
        if (fs.existsSync(linkPath)) {
            try {
                const link = JSON.parse(fs.readFileSync(linkPath, 'utf-8'));
                if (link.organizationName === org && link.nucleusPath) {
                    const fullPath = path.resolve(this.workspaceRoot, link.nucleusPath);
                    if (fs.existsSync(fullPath)) {
                        return loadNucleusConfig(path.join(fullPath, '.bloom'));
                    }
                }
            } catch {}
        }

        // Caso 3: Buscar en parent directory
        const parentDir = path.dirname(this.workspaceRoot);
        const nucleusName = `nucleus-${org}`;
        const nucleusPath = path.join(parentDir, nucleusName);
        
        if (fs.existsSync(nucleusPath)) {
            const nucleusBloomPath = path.join(nucleusPath, '.bloom');
            if (fs.existsSync(nucleusBloomPath)) {
                return loadNucleusConfig(nucleusBloomPath);
            }
        }

        return null;
    }

    getTreeItem(element: NucleusTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: NucleusTreeItem): Promise<NucleusTreeItem[]> {
        if (!element) {
            const items: NucleusTreeItem[] = [];

            // Mostrar organizaciones con Nucleus
            for (const [org, config] of this.configs.entries()) {
                items.push(new NucleusTreeItem(
                    `${org} (${config.projects.length} proyectos)`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'org',
                    org
                ));
            }

            // Solo mostrar si no hay Nucleus detectados
            if (items.length === 0) {
                items.push(new NucleusTreeItem(
                    'No hay Nucleus en este workspace',
                    vscode.TreeItemCollapsibleState.None,
                    'info'
                ));
            }

            return items;
        }

        if (element.type === 'org') {
            const config = this.configs.get(element.data as string);
            if (!config?.projects) return [];
            
            return config.projects.map(p =>
                new NucleusTreeItem(
                    `${this.getProjectIcon(p.strategy)} ${p.displayName || p.name}`,
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

        return [];
    }

    private getProjectIcon(strategy: string): string {
        const icons: Record<string, string> = {
            'android': '📱',
            'ios': '🍎',
            'react-web': '🌐',
            'web': '🌐',
            'node': '⚙️',
            'python-flask': '🐍',
            'php-laravel': '🐘',
            'generic': '📦'
        };
        return icons[strategy] || '📦';
    }
}

class NucleusTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'org' | 'project' | 'info',
        public readonly data?: any,
        command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.command = command;

        switch (type) {
            case 'org':
                this.iconPath = new vscode.ThemeIcon('organization');
                this.contextValue = 'nucleusOrg';
                break;
            case 'project':
                this.iconPath = new vscode.ThemeIcon('folder');
                this.contextValue = 'nucleusProject';
                this.tooltip = `${data.name} - ${data.strategy}`;
                break;
            case 'info':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
        }
    }
}

export async function openNucleusProject(project: LinkedProject): Promise<void> {
    try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        // Intentar encontrar el proyecto
        let projectPath: string | null = null;
        
        // 1. Relativo al workspace actual
        const relativePath = path.join(workspaceRoot, project.localPath);
        if (fs.existsSync(relativePath)) {
            projectPath = relativePath;
        } else {
            // 2. Relativo al parent directory
            const parentDir = path.dirname(workspaceRoot);
            const parentRelativePath = path.join(parentDir, project.localPath);
            if (fs.existsSync(parentRelativePath)) {
                projectPath = parentRelativePath;
            }
        }

        if (!projectPath) {
            const browse = await vscode.window.showWarningMessage(
                `No se encontró el proyecto en: ${project.localPath}`,
                'Buscar Manualmente',
                'Cancelar'
            );

            if (browse === 'Buscar Manualmente') {
                const selected = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: `Seleccionar carpeta de ${project.name}`,
                    title: `Localizar ${project.displayName}`
                });

                if (selected && selected.length > 0) {
                    projectPath = selected[0].fsPath;
                }
            }

            if (!projectPath) return;
        }

        // Abrir en nueva ventana
        await vscode.commands.executeCommand(
            'vscode.openFolder',
            vscode.Uri.file(projectPath),
            true // Nueva ventana
        );
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error abriendo proyecto: ${error.message}`);
    }
}