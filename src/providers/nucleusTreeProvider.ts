// src/providers/nucleusTreeProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { NucleusConfig, LinkedProject, loadNucleusConfig } from '../models/bloomConfig';
import { Logger } from '../utils/logger';
import { UserManager } from '../managers/userManager';
import { WorkspaceManager } from '../managers/workspaceManager';

export class NucleusTreeProvider implements vscode.TreeDataProvider<NucleusTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<NucleusTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private configs: Map<string, NucleusConfig> = new Map();
    private logger = new Logger();

    constructor(
        private workspaceRoot: string | undefined,
        private context: vscode.ExtensionContext
    ) {
        // Registrar comandos
        vscode.commands.registerCommand('bloom.unlinkNucleus', async (item: NucleusTreeItem) => {
            if (item && item.type === 'org' && item.data?.orgName) {
                await this.unlinkNucleus(item.data.orgName);
            }
        });
        
        vscode.commands.registerCommand('bloom.refreshNucleus', () => this.refresh());
        
        // Refresh automático cuando cambia la configuración
        vscode.workspace.onDidChangeConfiguration(() => this.refresh());
        
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

    // Nueva función para unlink Nucleus
    async unlinkNucleus(org: string): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            `⛓️‍💥 Desvincular Nucleus de ${org}\n\nEl repositorio local y remoto NO se borrarán.\nSolo se quitará del plugin.`,
            { modal: true },
            'Desvincular'
        );
        
        if (confirm !== 'Desvincular') return;

        const userManager = UserManager.init(this.context);
        const userData = userManager.getUser();
        if (!userData) return;

        // Remover org de allOrgs
        userData.allOrgs = (userData.allOrgs || []).filter(o => o !== org);
        userData.githubOrg = userData.allOrgs[0] || userData.githubUsername;

        await userManager.saveUser(userData);
        await vscode.commands.executeCommand('setContext', 'bloom.isRegistered', !!userData.githubOrg);

        // Cerrar folders relacionadas con este Nucleus
        const wsFolders = vscode.workspace.workspaceFolders || [];
        const nucleusPath = this.findNucleusPath(org);
        
        if (nucleusPath) {
            // Encontrar índices de folders a remover
            const indicesToRemove: number[] = [];
            wsFolders.forEach((folder, idx) => {
                if (folder.uri.fsPath.includes(`nucleus-${org}`) || 
                    folder.uri.fsPath.startsWith(nucleusPath)) {
                    indicesToRemove.push(idx);
                }
            });

            // Remover folders en orden inverso para mantener índices válidos
            for (let i = indicesToRemove.length - 1; i >= 0; i--) {
                vscode.workspace.updateWorkspaceFolders(indicesToRemove[i], 1);
            }
        }

        this.refresh();
        vscode.window.showInformationMessage(`✅ Nucleus ${org} desvinculado correctamente`);
    }

    getTreeItem(element: NucleusTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: NucleusTreeItem): Promise<NucleusTreeItem[]> {
        console.log('[NucleusTree] getChildren called, element:', element?.type);
        
        if (!element) {
            const items: NucleusTreeItem[] = [];

            console.log('[NucleusTree] Configs detected:', this.configs.size);

            // Mostrar organizaciones con Nucleus
            for (const [org, config] of this.configs.entries()) {
                console.log('[NucleusTree] Processing org:', org, 'projects:', config.projects.length);
                
                // Encontrar el path del Nucleus
                const nucleusPath = this.findNucleusPath(org);
                
                console.log('[NucleusTree] Nucleus path for', org, ':', nucleusPath);
                
                const orgItem = new NucleusTreeItem(
                    `${org} (${config.projects.length} proyecto${config.projects.length !== 1 ? 's' : ''})`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'org',
                    { orgName: org, nucleusPath: nucleusPath, config: config }
                );
                
                // IMPORTANTE: Agregar tooltip para que el usuario sepa que puede agregar
                orgItem.tooltip = `Click derecho o en el ícono + para agregar proyectos`;
                
                console.log('[NucleusTree] orgItem contextValue:', orgItem.contextValue);
                
                items.push(orgItem);
            }

            // Solo mostrar si no hay Nucleus detectados
            if (items.length === 0) {
                console.log('[NucleusTree] No configs found, showing info message');
                items.push(new NucleusTreeItem(
                    'No hay Nucleus en este workspace',
                    vscode.TreeItemCollapsibleState.None,
                    'info'
                ));
            }

            console.log('[NucleusTree] Returning', items.length, 'items');
            return items;
        }

        if (element.type === 'org') {
            const org = element.data.orgName;
            const config = this.configs.get(org);
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

    private findNucleusPath(org: string): string | undefined {
        if (!this.workspaceRoot) return undefined;

        // Intentar workspace actual
        const localBloom = path.join(this.workspaceRoot, '.bloom', 'core', 'nucleus-config.json');
        if (fs.existsSync(localBloom)) {
            return this.workspaceRoot;
        }

        // Intentar parent directory
        const parentDir = path.dirname(this.workspaceRoot);
        const nucleusPath = path.join(parentDir, `nucleus-${org}`);
        if (fs.existsSync(nucleusPath)) {
            return nucleusPath;
        }

        return undefined;
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

    // Método público para obtener nucleusPath
    public getNucleusPath(org: string): string | undefined {
        return this.findNucleusPath(org);
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

        // Agregar al workspace en lugar de abrir nueva ventana
        await WorkspaceManager.addProjectToWorkspace(projectPath, project.displayName);

    } catch (error: any) {
        vscode.window.showErrorMessage(`Error abriendo proyecto: ${error.message}`);
    }
}