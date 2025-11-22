import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { NucleusConfig, LinkedProject, loadNucleusConfig } from '../models/bloomConfig';
import { IntentTreeProvider } from './intentTreeProvider';
import { MetadataManager } from '../core/metadataManager';
import { Logger } from '../utils/logger';

export class NucleusTreeProvider implements vscode.TreeDataProvider<NucleusTreeItem> {
    
    private _onDidChangeTreeData: vscode.EventEmitter<NucleusTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<NucleusTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<NucleusTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;
    
    private nucleusPath: string | null = null;
    private config: NucleusConfig | null = null;
    
    private logger: Logger = new Logger();
    private metadataManager: MetadataManager = new MetadataManager(this.logger);
    
    constructor(private workspaceRoot: string | undefined) {
        this.detectNucleus();
    }
    
    refresh(): void {
        this.detectNucleus();
        this._onDidChangeTreeData.fire();
    }
    
    private detectNucleus(): void {
        if (!this.workspaceRoot) {
            return;
        }
        
        // Check if current project is a Nucleus
        const bloomPath = path.join(this.workspaceRoot, '.bloom');
        const configPath = path.join(bloomPath, 'core', 'nucleus-config.json');
        
        if (fs.existsSync(configPath)) {
            this.nucleusPath = this.workspaceRoot;
            this.config = loadNucleusConfig(bloomPath);
            this.logger.info(`✅ Nucleus detected at: ${this.nucleusPath}`);
            return;
        }
        
        // Check if current project is linked to a Nucleus
        const nucleusLinkPath = path.join(bloomPath, 'nucleus.json');
        if (fs.existsSync(nucleusLinkPath)) {
            try {
                const linkContent = fs.readFileSync(nucleusLinkPath, 'utf-8');
                const link = JSON.parse(linkContent);
                
                if (link.nucleusPath) {
                    const linkedNucleusPath = path.resolve(this.workspaceRoot, link.nucleusPath);
                    
                    if (fs.existsSync(linkedNucleusPath)) {
                        this.nucleusPath = linkedNucleusPath;
                        const linkedBloomPath = path.join(linkedNucleusPath, '.bloom');
                        this.config = loadNucleusConfig(linkedBloomPath);
                        this.logger.info(`✅ Linked Nucleus detected at: ${this.nucleusPath}`);
                        return;
                    }
                }
            } catch (error) {
                this.logger.error('Error reading nucleus link', error as Error);
            }
        }
        
        // Check parent directory for Nucleus projects
        const parentDir = path.dirname(this.workspaceRoot);
        
        try {
            const items = fs.readdirSync(parentDir, { withFileTypes: true });
            
            for (const item of items) {
                if (!item.isDirectory() || !item.name.startsWith('nucleus-')) {
                    continue;
                }
                
                const itemPath = path.join(parentDir, item.name);
                const itemBloomPath = path.join(itemPath, '.bloom');
                const itemConfigPath = path.join(itemBloomPath, 'core', 'nucleus-config.json');
                
                if (fs.existsSync(itemConfigPath)) {
                    this.nucleusPath = itemPath;
                    this.config = loadNucleusConfig(itemBloomPath);
                    this.logger.info(`✅ Parent Nucleus detected at: ${this.nucleusPath}`);
                    return;
                }
            }
        } catch (error) {
            this.logger.warn('Could not scan parent directory for Nucleus');
        }
        
        this.logger.info('ℹ️ No Nucleus detected');
    }
    
    getTreeItem(element: NucleusTreeItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: NucleusTreeItem): Promise<NucleusTreeItem[]> {
        // ========================================================================
        // ROOT LEVEL: MOSTRAR ESTADO
        // ========================================================================
        if (!element) {
            // ✅ CASO 1: No hay Nucleus detectado
            if (!this.config || !this.nucleusPath) {
                return [
                    new NucleusTreeItem(
                        'Crear un nuevo Nucleus Project',
                        vscode.TreeItemCollapsibleState.None,
                        'create-nucleus',  // ← nuevo tipo para darle icono bonito
                        undefined,
                        'Haz clic aquí para convertir este workspace en un Nucleus',
                        {
                            command: 'bloom.createNucleusProject',
                            title: 'Crear Nucleus Project',
                            arguments: []
                        }
                    )
                ];
            }
            
            // ✅ CASO 2: Nucleus detectado - Mostrar header
            return [
                new NucleusTreeItem(
                    `🏢 ${this.config.organization.displayName || this.config.organization.name}`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'nucleus',
                    this.config.organization,
                    `${this.config.nucleus.name}\n${this.config.projects.length} projects`
                )
            ];
        }
        
        // ========================================================================
        // NUCLEUS LEVEL: MOSTRAR CATEGORÍAS
        // ========================================================================
        if (element.type === 'nucleus') {
            const categories = {
                mobile: [],
                backend: [],
                web: [],
                other: []
            } as Record<string, LinkedProject[]>;
            
            this.config!.projects.forEach(project => {
                if (project.strategy === 'android' || project.strategy === 'ios') {
                    categories.mobile.push(project);
                } else if (project.strategy === 'node' || project.strategy === 'python-flask' || project.strategy === 'php-laravel') {
                    categories.backend.push(project);
                } else if (project.strategy === 'react-web') {
                    categories.web.push(project);
                } else {
                    categories.other.push(project);
                }
            });
            
            const categoryItems: NucleusTreeItem[] = [];
            
            if (categories.mobile.length > 0) {
                categoryItems.push(
                    new NucleusTreeItem(
                        `📱 Mobile (${categories.mobile.length})`,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'category',
                        categories.mobile
                    )
                );
            }
            
            if (categories.backend.length > 0) {
                categoryItems.push(
                    new NucleusTreeItem(
                        `⚙️ Backend (${categories.backend.length})`,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'category',
                        categories.backend
                    )
                );
            }
            
            if (categories.web.length > 0) {
                categoryItems.push(
                    new NucleusTreeItem(
                        `🌐 Web (${categories.web.length})`,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'category',
                        categories.web
                    )
                );
            }
            
            if (categories.other.length > 0) {
                categoryItems.push(
                    new NucleusTreeItem(
                        `🔧 Other (${categories.other.length})`,
                        vscode.TreeItemCollapsibleState.Collapsed,
                        'category',
                        categories.other
                    )
                );
            }
            
            // ✅ Si no hay proyectos, mostrar mensaje
            if (categoryItems.length === 0) {
                return [
                    new NucleusTreeItem(
                        'No projects linked yet',
                        vscode.TreeItemCollapsibleState.None,
                        'info',
                        undefined,
                        'Right-click on a BTIP project folder and select "Link to Nucleus"'
                    )
                ];
            }
            
            return categoryItems;
        }
        
        // ========================================================================
        // CATEGORY LEVEL: MOSTRAR PROYECTOS
        // ========================================================================
        if (element.type === 'category') {
            const projects = element.data as LinkedProject[];
            return projects.map(project => 
                new NucleusTreeItem(
                    project.displayName || project.name,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'nucleusProject',
                    project,
                    `${project.description || 'No description'}\nStrategy: ${project.strategy}\nStatus: ${project.status}`
                )
            );
        }
        
        // ========================================================================
        // PROJECT LEVEL: MOSTRAR INTENTS (NESTED)
        // ========================================================================
        if (element.type === 'nucleusProject') {
            const project = element.data as LinkedProject;
            const projectPath = path.resolve(this.nucleusPath!, project.localPath);
            
            if (!fs.existsSync(projectPath)) {
                return [
                    new NucleusTreeItem(
                        '⚠️ Project Path Not Found',
                        vscode.TreeItemCollapsibleState.None,
                        'error',
                        undefined,
                        `Expected path: ${projectPath}`
                    )
                ];
            }
            
            // ✅ Crear IntentTreeProvider para este proyecto
            try {
                const intentProvider = new IntentTreeProvider(
                    { uri: vscode.Uri.file(projectPath) } as vscode.WorkspaceFolder,
                    this.logger,
                    this.metadataManager
                );
                
                const intents = await intentProvider.getIntents();
                
                if (intents.length === 0) {
                    return [
                        new NucleusTreeItem(
                            'No Intents',
                            vscode.TreeItemCollapsibleState.None,
                            'info',
                            undefined,
                            'Open this project and create intents'
                        )
                    ];
                }
                
                // ✅ Convertir IntentTreeItems a NucleusTreeItems
                return intents.map(intentItem => {
                    // Fix: Convertir tooltip a string si es MarkdownString
                    const tooltipText = typeof intentItem.tooltip === 'string' 
                        ? intentItem.tooltip 
                        : intentItem.tooltip instanceof vscode.MarkdownString
                        ? intentItem.tooltip.value
                        : undefined;
                    
                    const treeItem = new NucleusTreeItem(
                        intentItem.label as string,
                        vscode.TreeItemCollapsibleState.None,
                        'intent',
                        intentItem.intent,
                        tooltipText
                    );
                    
                    // ✅ Preservar comando de Intent
                    treeItem.command = intentItem.command;
                    treeItem.iconPath = new vscode.ThemeIcon('file');
                    treeItem.description = intentItem.description;
                    
                    return treeItem;
                });
                
            } catch (error) {
                this.logger.error('Error loading intents for project', error as Error);
                return [
                    new NucleusTreeItem(
                        '⚠️ Error Loading Intents',
                        vscode.TreeItemCollapsibleState.None,
                        'error'
                    )
                ];
            }
        }
        
        return [];
    }
}

export class NucleusTreeItem extends vscode.TreeItem {
    public type: string;
    
    constructor(
        public readonly label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        type: string,
        public readonly data?: any,
        tooltip?: string,
        command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.tooltip = tooltip || label;
        this.contextValue = type;
        this.type = type;
        
        if (command) {
            this.command = command;
        }
        
        // Set icons based on type
        switch (type) {
            case 'create-nucleus':
                this.iconPath = new vscode.ThemeIcon('add', new vscode.ThemeColor('charts.green'));
                this.description = 'Click para crear';
                this.contextValue = 'create-nucleus';
                break;
            case 'nucleus':
                this.iconPath = new vscode.ThemeIcon('organization');
                break;
            case 'category':
                this.iconPath = new vscode.ThemeIcon('folder');
                break;
            case 'nucleusProject':
                this.iconPath = this.getProjectIcon(data);
                this.command = {
                    command: 'bloom.openNucleusProject',
                    title: 'Open Project',
                    arguments: [data]
                };
                break;
            case 'intent':
                this.iconPath = new vscode.ThemeIcon('file');
                break;
            case 'no-nucleus':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
            case 'info':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
            case 'error':
                this.iconPath = new vscode.ThemeIcon('error');
                break;
        }
        
        // Set description for projects
        if (type === 'nucleusProject' && data) {
            this.description = this.getStatusBadge(data.status);
        }
    }
    
    private getProjectIcon(project: LinkedProject): vscode.ThemeIcon {
        switch (project.strategy) {
            case 'android':
                return new vscode.ThemeIcon('device-mobile');
            case 'ios':
                return new vscode.ThemeIcon('device-mobile');
            case 'node':
                return new vscode.ThemeIcon('server');
            case 'python-flask':
                return new vscode.ThemeIcon('server');
            case 'php-laravel':
                return new vscode.ThemeIcon('server');
            case 'react-web':
                return new vscode.ThemeIcon('globe');
            default:
                return new vscode.ThemeIcon('file-code');
        }
    }
    
    private getStatusBadge(status: string): string {
        switch (status) {
            case 'active':
                return '✅';
            case 'development':
                return '🚧';
            case 'archived':
                return '📦';
            case 'planned':
                return '📋';
            default:
                return '❓';
        }
    }
}

// ============================================================================
// COMMAND: Open Nucleus Project
// ============================================================================
export async function openNucleusProject(project: LinkedProject): Promise<void> {
    try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }
        
        // Try to resolve project path
        let projectPath: string | null = null;
        
        // Check if project.localPath is relative to current workspace
        const relativePath = path.join(workspaceRoot, project.localPath);
        if (fs.existsSync(relativePath)) {
            projectPath = relativePath;
        } else {
            // Try parent directory
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
            
            if (!projectPath) {
                return;
            }
        }
        
        // Open project in new window
        await vscode.commands.executeCommand(
            'vscode.openFolder',
            vscode.Uri.file(projectPath),
            true  // Open in new window
        );
        
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error opening project: ${error.message}`);
        console.error('Open nucleus project error:', error);
    }
}