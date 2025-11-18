import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { MetadataManager } from './metadataManager';
import { CodebaseGenerator } from './codebaseGenerator';
import { IntentGenerator } from './intentGenerator';
import { IntentAutoSaver } from './intentAutoSaver';
import { Logger } from '../utils/logger';
import { IntentFormData } from '../models/intent';
import { joinPath } from '../utils/uriHelper';
import * as path from 'path';

export interface IntentState {
    id: string;
    name: string;
    status: 'draft' | 'generated';
    files: string[];
    content: {
        problem: string;
        notes: string;
        currentBehavior: string[];
        desiredBehavior: string[];
    };
    tokens: {
        estimated: number;
        limit: number;
        percentage: number;
    };
}

export class IntentSession extends EventEmitter {
    private autoSaver: IntentAutoSaver;
    private state: IntentState;
    
    private constructor(
        private intentFolder: vscode.Uri,
        private workspaceFolder: vscode.WorkspaceFolder,
        private metadataManager: MetadataManager,
        private codebaseGenerator: CodebaseGenerator,
        private intentGenerator: IntentGenerator,
        private logger: Logger,
        initialState: IntentState
    ) {
        super();
        this.state = initialState;
        this.autoSaver = new IntentAutoSaver(
            intentFolder,
            workspaceFolder,
            metadataManager,
            codebaseGenerator,
            logger
        );
    }

    static async create(
        intentFolder: vscode.Uri,
        workspaceFolder: vscode.WorkspaceFolder,
        selectedFiles: vscode.Uri[],
        relativePaths: string[],
        metadataManager: MetadataManager,
        codebaseGenerator: CodebaseGenerator,
        intentGenerator: IntentGenerator,
        logger: Logger
    ): Promise<IntentSession> {
        const initialState: IntentState = {
            id: '',
            name: '',
            status: 'draft',
            files: relativePaths,
            content: {
                problem: '',
                notes: '',
                currentBehavior: [],
                desiredBehavior: []
            },
            tokens: {
                estimated: 0,
                limit: 100000,
                percentage: 0
            }
        };

        const session = new IntentSession(
            intentFolder,
            workspaceFolder,
            metadataManager,
            codebaseGenerator,
            intentGenerator,
            logger,
            initialState
        );

        await session.calculateTokens();
        
        return session;
    }

    static async forIntent(
        intentName: string,
        workspaceFolder: vscode.WorkspaceFolder,
        metadataManager: MetadataManager,
        codebaseGenerator: CodebaseGenerator,
        intentGenerator: IntentGenerator,
        logger: Logger
    ): Promise<IntentSession> {
        const intentFolder = vscode.Uri.file(
            path.join(workspaceFolder.uri.fsPath, '.bloom', 'intents', intentName)
        );

        const metadata = await metadataManager.read(intentFolder);
        if (!metadata) {
            throw new Error(`Intent '${intentName}' not found`);
        }

        const state: IntentState = {
            id: metadata.id,
            name: metadata.name,
            status: metadata.status as 'draft' | 'generated',
            files: metadata.files || [],
            content: metadata.content || {
                problem: '',
                notes: '',
                currentBehavior: [],
                desiredBehavior: []
            },
            tokens: metadata.tokens || {
                estimated: 0,
                limit: 100000,
                percentage: 0
            }
        };

        return new IntentSession(
            intentFolder,
            workspaceFolder,
            metadataManager,
            codebaseGenerator,
            intentGenerator,
            logger,
            state
        );
    }

    async addFiles(files: vscode.Uri[]): Promise<void> {
        this.logger.info(`Adding ${files.length} files to intent`);

        const newRelativePaths = files.map(file =>
            path.relative(this.workspaceFolder.uri.fsPath, file.fsPath)
        );

        this.state.files = [...new Set([...this.state.files, ...newRelativePaths])];

        await this.metadataManager.update(this.intentFolder, {
            files: this.state.files,
            updatedAt: new Date().toISOString()
        });

        await this.regenerateCodebase();
        await this.calculateTokens();

        this.emit('filesChanged', this.state.files);
        this.logger.info(`Files added successfully`);
    }

    async removeFile(filePath: string): Promise<void> {
        this.logger.info(`Removing file: ${filePath}`);

        this.state.files = this.state.files.filter(f => f !== filePath);

        await this.metadataManager.update(this.intentFolder, {
            files: this.state.files,
            updatedAt: new Date().toISOString()
        });

        await this.regenerateCodebase();
        await this.calculateTokens();

        this.emit('filesChanged', this.state.files);
        this.logger.info(`File removed successfully`);
    }

    async generateIntent(formData: IntentFormData): Promise<void> {
        this.logger.info('Generating intent.bl');

        this.state.name = formData.name;
        this.state.content = {
            problem: formData.problem,
            notes: formData.notes || '',
            currentBehavior: formData.currentBehavior || [],
            desiredBehavior: formData.desiredBehavior || []
        };

        const intentPath = joinPath(this.intentFolder, 'intent.bl');
        await this.intentGenerator.generateIntent(
            formData,
            this.state.files,
            intentPath
        );

        await this.regenerateCodebase();

        await this.changeStatus('generated');

        this.logger.info('Intent generated successfully');
    }

    async regenerateIntent(formData: IntentFormData): Promise<void> {
        this.logger.info('Regenerating intent.bl');

        this.state.content = {
            problem: formData.problem,
            notes: formData.notes || '',
            currentBehavior: formData.currentBehavior || [],
            desiredBehavior: formData.desiredBehavior || []
        };

        const intentPath = joinPath(this.intentFolder, 'intent.bl');
        await this.intentGenerator.generateIntent(
            formData,
            this.state.files,
            intentPath
        );

        await this.regenerateCodebase();

        await this.metadataManager.update(this.intentFolder, {
            content: this.state.content,
            updatedAt: new Date().toISOString()
        });

        this.logger.info('Intent regenerated successfully');
    }

    queueAutoSave(updates: Partial<IntentState['content']>): void {
        Object.assign(this.state.content, updates);
        this.autoSaver.queue(updates);
        this.emit('stateChanged', this.state);
    }

    async changeStatus(status: 'draft' | 'generated'): Promise<void> {
        this.state.status = status;
        await this.metadataManager.update(this.intentFolder, {
            status,
            updatedAt: new Date().toISOString()
        });
        this.emit('stateChanged', this.state);
    }

    async deleteIntent(): Promise<void> {
        this.logger.info(`Deleting intent: ${this.state.name}`);
        
        await vscode.workspace.fs.delete(this.intentFolder, { recursive: true });
        
        this.dispose();
        this.logger.info('Intent deleted successfully');
    }

    getState(): IntentState {
        return { ...this.state };
    }

    private async regenerateCodebase(): Promise<void> {
        this.logger.info('Regenerating codebase.md');

        const fileUris = this.state.files.map(relativePath =>
            vscode.Uri.file(path.join(this.workspaceFolder.uri.fsPath, relativePath))
        );

        const codebasePath = joinPath(this.intentFolder, 'codebase.md');

        await this.codebaseGenerator.generate(
            fileUris.map((uri, index) => ({
                relativePath: this.state.files[index],
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

        this.logger.info('Codebase regenerated');
    }

    private async calculateTokens(): Promise<void> {
        let totalChars = 0;

        for (const relativePath of this.state.files) {
            const fileUri = vscode.Uri.file(
                path.join(this.workspaceFolder.uri.fsPath, relativePath)
            );
            try {
                const content = await vscode.workspace.fs.readFile(fileUri);
                totalChars += content.length;
            } catch (error) {
                this.logger.warn(`Error reading file ${relativePath}: ${error}`);
            }
        }

        totalChars += this.state.content.problem.length;
        totalChars += this.state.content.notes.length;

        const estimated = Math.ceil(totalChars / 4);
        const percentage = (estimated / this.state.tokens.limit) * 100;

        this.state.tokens = {
            estimated,
            limit: 100000,
            percentage: Math.round(percentage * 100) / 100
        };

        await this.metadataManager.update(this.intentFolder, {
            tokens: this.state.tokens
        });

        this.emit('tokensChanged', this.state.tokens);
    }

    dispose(): void {
        this.autoSaver.dispose();
        this.removeAllListeners();
    }
}