import * as vscode from 'vscode';
import * as fs from 'fs'; // Agregado para fs.existsSync
import { Intent, IntentMetadata, IntentStatus } from '../models/intent';
import { Logger } from '../utils/logger';
import { MetadataManager } from '../core/metadataManager';
import { joinPath } from '../utils/uriHelper';

export class IntentTreeProvider implements vscode.TreeDataProvider<IntentTreeItem | IntentGroupItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<IntentTreeItem | IntentGroupItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    constructor(
        private workspaceFolder: vscode.WorkspaceFolder,
        private logger: Logger,
        private metadataManager: MetadataManager
    ) {}
    
    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
    
     getTreeItem(element: IntentTreeItem | IntentGroupItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: IntentTreeItem | IntentGroupItem): Promise<Array<IntentTreeItem | IntentGroupItem>> {
        if (!element) {
            return [
                new IntentGroupItem('in-progress', 'In Progress', this.workspaceFolder),
                new IntentGroupItem('completed', 'Completed', this.workspaceFolder),
                new IntentGroupItem('archived', 'Archived', this.workspaceFolder)
            ];
        }
        
        if (element instanceof IntentGroupItem) {
            const intents = await this.loadIntentsByStatus(element.status);
            return intents.map(intent => new IntentTreeItem(intent));
        }
        
        return [];
    }
    
    private async loadIntentsByStatus(status: IntentStatus): Promise<Intent[]> {
        const intentsDir = joinPath(
            this.workspaceFolder.uri,
            '.bloom',
            'intents'
        );
        
        // Nuevo: Check si el directorio existe para evitar ENOENT
        const intentsPath = intentsDir.fsPath;
        if (!fs.existsSync(intentsPath)) {
            this.logger.info(`Intents directory not found: ${intentsPath} - Returning empty list.`);
            return [];
        }
        
        try {
            const entries = await vscode.workspace.fs.readDirectory(intentsDir);
            const intents: Intent[] = [];
            
            for (const [name, type] of entries) {
                if (type === vscode.FileType.Directory) {
                    const intentFolder = joinPath(intentsDir, name);
                    const metadata = await this.metadataManager.read(intentFolder);
                    
                    if (metadata && metadata.status === status) {
                        intents.push({ metadata, folderUri: intentFolder });
                    }
                }
            }
            
            return intents.sort(
                (a, b) => new Date(b.metadata.updatedAt).getTime() - new Date(a.metadata.updatedAt).getTime()
            );
        } catch (error) {
            this.logger.error('Error al cargar intents', error as Error);
            return [];
        }
    }

    // Nuevo método para nesting en Nucleus
    public async getIntents(): Promise<IntentTreeItem[]> {
        const allIntents: Intent[] = [];
        const statuses: IntentStatus[] = ['in-progress', 'completed', 'archived'];
        for (const status of statuses) {
            const intents = await this.loadIntentsByStatus(status);
            allIntents.push(...intents);
        }
        return allIntents.map(intent => new IntentTreeItem(intent));
    }
}

export class IntentGroupItem extends vscode.TreeItem {
    constructor(
        public readonly status: IntentStatus,
        label: string,
        private workspaceFolder: vscode.WorkspaceFolder
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'intentGroup';
        this.iconPath = vscode.ThemeIcon.Folder;
    }
}

export class IntentTreeItem extends vscode.TreeItem {
    constructor(public readonly intent: Intent) {
        super(
            intent.metadata.displayName || intent.metadata.name,
            vscode.TreeItemCollapsibleState.None
        );
        
        this.contextValue = 'intent';
        this.tooltip = this.buildTooltip();
        this.description = `(${intent.metadata.files.filesCount} archivos)`;
        this.iconPath = vscode.ThemeIcon.File;
        
        this.command = {
            command: 'bloom.openIntent',
            title: 'Open Intent',
            arguments: [this]
        };
    }
    
    private buildTooltip(): string {
        const meta = this.intent.metadata;
        return `${meta.displayName || meta.name}\nArchivos: ${meta.files.filesCount}\nCreado: ${new Date(meta.createdAt).toLocaleDateString()}\nTags: ${meta.tags?.join(', ') || 'ninguno'}`;
    }
}