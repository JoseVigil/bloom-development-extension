import * as vscode from 'vscode';
import { MetadataManager } from './metadataManager';
import { CodebaseGenerator } from './codebaseGenerator';
import { Logger } from '../utils/logger';
import { joinPath } from '../utils/uriHelper';
import * as path from 'path';

export class IntentAutoSaver {
    private queue: Map<string, any> = new Map();
    private timer: NodeJS.Timeout | null = null;
    private readonly DEBOUNCE_MS = 2000;

    constructor(
        private intentFolder: vscode.Uri,
        private workspaceFolder: vscode.WorkspaceFolder,
        private metadataManager: MetadataManager,
        private codebaseGenerator: CodebaseGenerator,
        private logger: Logger
    ) {}

    queue(updates: Partial<any>): void {
        for (const [key, value] of Object.entries(updates)) {
            this.queue.set(key, value);
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
        if (this.queue.size === 0) {
            return;
        }

        this.logger.info('Flushing auto-save queue');

        const updates = Object.fromEntries(this.queue);
        this.queue.clear();

        try {
            const existing = await this.metadataManager.read(this.intentFolder);
            if (!existing) {
                this.logger.warn('Intent not found, skipping auto-save');
                return;
            }

            const mergedContent = {
                ...existing.content,
                ...updates,
                lastSaved: new Date().toISOString()
            };

            const updatedMetadata = {
                ...existing,
                content: mergedContent,
                updatedAt: new Date().toISOString()
            };

            await this.metadataManager.save(this.intentFolder, updatedMetadata);

            const files = existing.files || [];
            if (files.length > 0) {
                const fileUris = files.map((relativePath: string) =>
                    vscode.Uri.file(path.join(this.workspaceFolder.uri.fsPath, relativePath))
                );

                const codebasePath = joinPath(this.intentFolder, 'codebase.md');

                await this.codebaseGenerator.generate(
                    fileUris.map((uri: vscode.Uri, index: number) => ({
                        relativePath: files[index],
                        absolutePath: uri.fsPath,
                        metadata: {
                            size: 0,
                            type: path.extname(uri.fsPath).slice(1),
                            lastModified: Date.now()
                        }
                    })),
                    codebasePath,
                    {
                        format: 'markdown',
                        includeMetadata: true,
                        addTableOfContents: true,
                        categorizeByType: false
                    }
                );
            }

            this.logger.info('Auto-save completed');
        } catch (error) {
            this.logger.error('Auto-save error', error as Error);
            throw error;
        }
    }

    dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.queue.clear();
    }
}