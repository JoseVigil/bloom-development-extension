// src/providers/nucleusTreeProvider.ts
// Tree view provider for Nucleus organizational structure

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { NucleusConfig, LinkedProject, loadNucleusConfig } from '../models/bloomConfig';
import { ProjectDetector } from '../strategies/ProjectDetector';

export class NucleusTreeProvider implements vscode.TreeDataProvider<NucleusTreeItem> {
    
    private _onDidChangeTreeData: vscode.EventEmitter<NucleusTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<NucleusTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<NucleusTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;
    
    private nucleusPath: string | null = null;
    private config: NucleusConfig | null = null;
    
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
                        return;
                    }
                }
            } catch (error) {
                console.error('Error reading nucleus link:', error);
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
                    return;
                }
            }
        } catch (error) {
            // Ignore
        }
    }
    
    getTreeItem(element: NucleusTreeItem): vscode.TreeItem {
        return element;
    }
    
    getChildren(element?: NucleusTreeItem): Thenable<NucleusTreeItem[]> {
        if (!this.config || !this.nucleusPath) {
            return Promise.resolve([
                new NucleusTreeItem(
                    'No Nucleus Project Detected',
                    vscode.TreeItemCollapsibleState.None,
                    'info',
                    undefined,
                    'Click "Create Nucleus Project" to start'
                )
            ]);
        }
        
        if (!element) {
            // Root level - show Nucleus info
            return Promise.resolve([
                new NucleusTreeItem(
                    this.config.organization.displayName,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'nucleus',
                    this.nucleusPath,
                    this.config.nucleus.name
                )
            ]);
        }
        
        if (element.type === 'nucleus') {
            // Show categories
            return Promise.resolve([
                new NucleusTreeItem(
                    `📱 Mobile (${this.countByCategory('mobile')})`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'category',
                    'mobile'
                ),
                new NucleusTreeItem(
                    `⚙️ Backend (${this.countByCategory('backend')})`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'category',
                    'backend'
                ),
                new NucleusTreeItem(
                    `🌐 Web (${this.countByCategory('web')})`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'category',
                    'web'
                ),
                new NucleusTreeItem(
                    `🔧 Other (${this.countByCategory('other')})`,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    'category',
                    'other'
                )
            ]);
        }
        
        if (element.type === 'category') {
            // Show projects in category
            const projects = this.getProjectsByCategory(element.data as string);
            
            return Promise.resolve(
                projects.map(project => 
                    new NucleusTreeItem(
                        project.displayName,
                        vscode.TreeItemCollapsibleState.None,
                        'nucleusProject',
                        project,
                        `${project.name} - ${project.status}`
                    )
                )
            );
        }
        
        return Promise.resolve([]);
    }
    
    private countByCategory(category: string): number {
        if (!this.config) {
            return 0;
        }
        
        return this.getProjectsByCategory(category).length;
    }
    
    private getProjectsByCategory(category: string): LinkedProject[] {
        if (!this.config) {
            return [];
        }
        
        return this.config.projects.filter(project => {
            switch (category) {
                case 'mobile':
                    return project.strategy === 'android' || project.strategy === 'ios';
                case 'backend':
                    return project.strategy === 'node' || 
                           project.strategy === 'python-flask' || 
                           project.strategy === 'php-laravel';
                case 'web':
                    return project.strategy === 'react-web';
                case 'other':
                    return project.strategy !== 'android' && 
                           project.strategy !== 'ios' &&
                           project.strategy !== 'node' &&
                           project.strategy !== 'python-flask' &&
                           project.strategy !== 'php-laravel' &&
                           project.strategy !== 'react-web';
                default:
                    return false;
            }
        });
    }
    
    getNucleusPath(): string | null {
        return this.nucleusPath;
    }
    
    getConfig(): NucleusConfig | null {
        return this.config;
    }
}

export class NucleusTreeItem extends vscode.TreeItem {
    
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'nucleus' | 'category' | 'nucleusProject' | 'info',
        public readonly data?: any,
        public readonly tooltip?: string
    ) {
        super(label, collapsibleState);
        
        this.contextValue = type;
        
        // Set icons based on type
        switch (type) {
            case 'nucleus':
                this.iconPath = new vscode.ThemeIcon('organization');
                break;
            case 'nucleusProject':
                this.iconPath = this.getProjectIcon(data);
                this.command = {
                    command: 'bloom.openNucleusProject',
                    title: 'Open Project',
                    arguments: [data]
                };
                break;
            case 'info':
                this.iconPath = new vscode.ThemeIcon('info');
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

// Command to open nucleus project
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