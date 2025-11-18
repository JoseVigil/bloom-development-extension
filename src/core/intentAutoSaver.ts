import * as vscode from 'vscode';
import { MetadataManager } from './metadataManager';
import { CodebaseGenerator } from './codebaseGenerator';
import { Logger } from '../utils/logger';
import { joinPath } from '../utils/uriHelper';
import { FileDescriptor, FileCategory } from '../models/codebaseStrategy';
import { IntentContent } from '../models/intent';
import * as path from 'path';

export class IntentAutoSaver {
    private pendingUpdates: Map<string, any> = new Map();
    private timer: NodeJS.Timeout | null = null;
    private readonly DEBOUNCE_MS = 2000;

    constructor(
        private intentFolder: vscode.Uri,
        private workspaceFolder: vscode.WorkspaceFolder,
        private metadataManager: MetadataManager,
        private codebaseGenerator: CodebaseGenerator,
        private logger: Logger
    ) {}

    enqueue(updates: Partial<IntentContent>): void {
        for (const [key, value] of Object.entries(updates)) {
            this.pendingUpdates.set(key, value);
        }

        if (this.timer) {
            clearTimeout(this.timer);
        }

        this.timer = setTimeout(() => {
            this.flush().catch(error => {
                this.logger.error('Auto-save failed', error);
            });
        }, this.DEBOUNCE_MS);
    }

    async flush(): Promise<void> {
        if (this.pendingUpdates.size === 0) {
            return;
        }

        this.logger.info('Flushing auto-save queue');

        const updates = Object.fromEntries(this.pendingUpdates);
        this.pendingUpdates.clear();

        try {
            const existing = await this.metadataManager.read(this.intentFolder);
            if (!existing) {
                this.logger.warn('Intent not found, skipping auto-save');
                return;
            }

            // Merge content con valores por defecto seguros
            const mergedContent: IntentContent = {
                problem: updates.problem ?? existing.content.problem,
                expectedOutput: updates.expectedOutput ?? existing.content.expectedOutput,
                currentBehavior: updates.currentBehavior ?? existing.content.currentBehavior,
                desiredBehavior: updates.desiredBehavior ?? existing.content.desiredBehavior,
                considerations: updates.considerations ?? existing.content.considerations
            };

            const updatedMetadata = {
                ...existing,
                content: mergedContent,
                updated: new Date().toISOString()
            };

            await this.metadataManager.save(this.intentFolder, updatedMetadata);

            // Regenerar codebase si hay archivos
            const filesIncluded = existing.files.filesIncluded || [];
            if (filesIncluded.length > 0) {
                await this.regenerateCodebase(filesIncluded);
            }

            this.logger.info('Auto-save completed');
        } catch (error) {
            this.logger.error('Auto-save error', error as Error);
            throw error;
        }
    }

    private async regenerateCodebase(filesIncluded: string[]): Promise<void> {
        const fileDescriptors: FileDescriptor[] = filesIncluded.map((relativePath: string) => {
            const absolutePath = path.join(this.workspaceFolder.uri.fsPath, relativePath);
            return {
                relativePath,
                absolutePath,
                category: this.categorizeFile(relativePath),
                priority: 1,
                size: 0,
                extension: path.extname(relativePath),
                metadata: {
                    size: 0,
                    type: path.extname(relativePath).slice(1),
                    lastModified: Date.now()
                }
            };
        });

        const codebasePath = joinPath(this.intentFolder, 'codebase.md');

        await this.codebaseGenerator.generate(
            fileDescriptors,
            codebasePath,
            {
                workspaceFolder: this.workspaceFolder,
                format: 'markdown',
                includeMetadata: true,
                addTableOfContents: true,
                categorizeByType: false
            }
        );
    }

    private categorizeFile(filePath: string): FileCategory {
        const ext = path.extname(filePath).toLowerCase();
        
        // Code files
        if (['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.kt', '.swift'].includes(ext)) {
            return 'code';
        }
        
        // Config files
        if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext)) {
            return 'config';
        }
        
        // Documentation
        if (['.md', '.txt', '.rst'].includes(ext)) {
            return 'docs';
        }
        
        // Tests
        if (filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('__tests__')) {
            return 'test';
        }
        
        // Assets
        if (['.png', '.jpg', '.svg', '.ico', '.gif'].includes(ext)) {
            return 'asset';
        }
        
        return 'other';
    }

    dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.pendingUpdates.clear();
    }
}