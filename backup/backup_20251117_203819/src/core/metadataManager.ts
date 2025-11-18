// src/core/metadataManager.ts
    
    import * as vscode from 'vscode';
    import { IntentMetadata, Intent } from '../models/intent';
    import { Logger } from '../utils/logger';
    import { v4 as uuidv4 } from 'uuid';
    import { joinPath } from '../utils/uriHelper';
    
    export class MetadataManager {
        constructor(private logger: Logger) {}
    
        /**
         * Crea metadata para un nuevo intent
         */
        async create(
            intentFolder: vscode.Uri,
            options: {
                name: string;
                projectType?: string;
                version: 'free' | 'pro';
                files: vscode.Uri[];
                filesCount: number;
                estimatedTokens?: number;
            }
        ): Promise<IntentMetadata> {
            const now = new Date().toISOString();
            
            const metadata: IntentMetadata = {
                id: uuidv4(),
                name: options.name,
                displayName: this.generateDisplayName(options.name),
                created: now,
                updated: now,
                status: 'in-progress',
                projectType: options.projectType as any,
                version: options.version,
                files: {
                    intentFile: 'intent.bl',
                    codebaseFile: options.version === 'free' ? 'codebase.md' : 'codebase.tar.gz',
                    filesIncluded: options.files.map(f => f.fsPath),
                    filesCount: options.filesCount,
                    totalSize: await this.calculateTotalSize(options.files)
                },
                stats: {
                    timesOpened: 0,
                    lastOpened: null,
                    estimatedTokens: options.estimatedTokens || 0
                },
                bloomVersion: '1.0.0'
            };
    
            await this.save(intentFolder, metadata);
            this.logger.info(`Metadata creada para intent: ${options.name}`);
            
            return metadata;
        }
    
        /**
         * Lee metadata de un intent
         */
        async read(intentFolder: vscode.Uri): Promise<IntentMetadata | null> {
            try {
                const metadataPath = joinPath(intentFolder, '.bloom-meta.json');
                const content = await vscode.workspace.fs.readFile(metadataPath);
                const metadata: IntentMetadata = JSON.parse(new TextDecoder().decode(content));
                
                return metadata;
            } catch (error) {
                this.logger.warn(`Error al leer metadata de ${intentFolder.fsPath}: ${error}`);
                return null;
            }
        }
    
        /**
         * Actualiza metadata existente
         */
        async update(
            intentFolder: vscode.Uri,
            updates: Partial<IntentMetadata>
        ): Promise<IntentMetadata | null> {
            const existing = await this.read(intentFolder);
            if (!existing) return null;
    
            const updated: IntentMetadata = {
                ...existing,
                ...updates,
                updated: new Date().toISOString()
            };
    
            await this.save(intentFolder, updated);
            this.logger.info(`Metadata actualizada para intent: ${existing.name}`);
            
            return updated;
        }
    
        /**
         * Guarda metadata en archivo
         */
        async save(intentFolder: vscode.Uri, metadata: IntentMetadata): Promise<void> {
            const metadataPath = joinPath(intentFolder, '.bloom-meta.json');
            const content = JSON.stringify(metadata, null, 2);
            await vscode.workspace.fs.writeFile(metadataPath, new TextEncoder().encode(content));
        }
    
        /**
         * Incrementa contador de opens
         */
        async incrementOpens(intentFolder: vscode.Uri): Promise<void> {
            const metadata = await this.read(intentFolder);
            if (!metadata) return;
    
            metadata.stats.timesOpened += 1;
            metadata.stats.lastOpened = new Date().toISOString();
    
            await this.save(intentFolder, metadata);
        }
    
        /**
         * Cambia el estado de un intent
         */
        async changeStatus(
            intentFolder: vscode.Uri,
            newStatus: IntentMetadata['status']
        ): Promise<void> {
            await this.update(intentFolder, { status: newStatus });
        }
    
        /**
         * Actualiza tags
         */
        async updateTags(intentFolder: vscode.Uri, tags: string[]): Promise<void> {
            await this.update(intentFolder, { tags });
        }
    
        /**
         * Valida que la metadata sea válida
         */
        isValid(metadata: any): metadata is IntentMetadata {
            return (
                typeof metadata.id === 'string' &&
                typeof metadata.name === 'string' &&
                typeof metadata.created === 'string' &&
                typeof metadata.status === 'string' &&
                ['draft', 'in-progress', 'completed', 'archived'].includes(metadata.status)
            );
        }
    
        // Helpers privados
    
        private generateDisplayName(name: string): string {
            return name
                .replace(/-/g, ' ')
                .replace(/\b\w/g, l => l.toUpperCase());
        }
    
        private async calculateTotalSize(files: vscode.Uri[]): Promise<number> {
            let total = 0;
            for (const file of files) {
                try {
                    const stat = await vscode.workspace.fs.stat(file);
                    total += stat.size;
                } catch (error) {
                    this.logger.warn(`Error al calcular tamaño de ${file.fsPath}`);
                }
            }
            return total;
        }
    }