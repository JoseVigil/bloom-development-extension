import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { MetadataManager } from './metadataManager';
import { CodebaseGenerator } from './codebaseGenerator';
import { IntentGenerator } from './intentGenerator';
import { IntentAutoSaver } from './intentAutoSaver';
import { Logger } from '../utils/logger';
import { IntentFormData, IntentContent, TokenStats, formDataToContent, IntentWorkflow, IntentWorkflowStage } from '../models/intent';
import { FileDescriptor, FileCategory } from '../models/codebaseStrategy';
import { joinPath } from '../utils/uriHelper';
import * as path from 'path';

export interface IntentState {
    id: string;
    name: string;
    status: 'draft' | 'in-progress' | 'completed' | 'archived';
    files: string[];
    content: IntentContent;
    tokens: TokenStats;
    workflow: IntentWorkflow;
    projectType?: string;
    intentFolder: vscode.Uri;
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
                expectedOutput: '',
                currentBehavior: [],
                desiredBehavior: [],
                considerations: ''
            },
            tokens: {
                estimated: 0,
                limit: 100000,
                percentage: 0
            },
            workflow: {
                stage: 'draft',
                questions: [],
                integrationStatus: 'pending'
            },
            intentFolder: intentFolder
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
            status: metadata.status,
            files: metadata.files.filesIncluded || [],
            content: metadata.content,
            tokens: metadata.tokens,
            workflow: metadata.workflow || {
                stage: 'draft',
                questions: [],
                integrationStatus: 'pending'
            },
            projectType: metadata.projectType,
            intentFolder: intentFolder
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

    async updateWorkflow(updates: Partial<IntentWorkflow>): Promise<void> {
        this.state.workflow = {
            ...this.state.workflow,
            ...updates
        };

        await this.metadataManager.update(this.intentFolder, {
            workflow: this.state.workflow
        });

        this.emit('workflowChanged', this.state.workflow);
    }

    async readIntentFile(): Promise<string> {
        const intentPath = joinPath(this.intentFolder, 'intent.bl');
        const content = await vscode.workspace.fs.readFile(intentPath);
        return new TextDecoder().decode(content);
    }

    async readCodebaseFile(): Promise<string> {
        const codebasePath = joinPath(this.intentFolder, 'codebase.md');
        const content = await vscode.workspace.fs.readFile(codebasePath);
        return new TextDecoder().decode(content);
    }

    async readSnapshotFile(): Promise<string> {
        if (!this.state.workflow.snapshotPath) {
            throw new Error('No snapshot path available');
        }
        const snapshotPath = vscode.Uri.file(this.state.workflow.snapshotPath);
        const content = await vscode.workspace.fs.readFile(snapshotPath);
        return new TextDecoder().decode(content);
    }

    getWorkflowStage(): IntentWorkflowStage {
        return this.state.workflow?.stage || 'draft';
    }

    getIntentFolder(): vscode.Uri {
        return this.intentFolder;
    }

    getWorkspaceFolder(): vscode.WorkspaceFolder {
        return this.workspaceFolder;
    }

    async addFiles(files: vscode.Uri[]): Promise<void> {
        this.logger.info(`Adding ${files.length} files to intent`);

        const newRelativePaths = files.map(file =>
            path.relative(this.workspaceFolder.uri.fsPath, file.fsPath)
        );

        this.state.files = [...new Set([...this.state.files, ...newRelativePaths])];

        await this.metadataManager.update(this.intentFolder, {
            files: {
                intentFile: 'intent.bl',
                codebaseFile: 'codebase.md',
                filesIncluded: this.state.files,
                filesCount: this.state.files.length,
                totalSize: await this.calculateTotalSize()
            }
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
            files: {
                intentFile: 'intent.bl',
                codebaseFile: 'codebase.md',
                filesIncluded: this.state.files,
                filesCount: this.state.files.length,
                totalSize: await this.calculateTotalSize()
            }
        });

        await this.regenerateCodebase();
        await this.calculateTokens();

        this.emit('filesChanged', this.state.files);
        this.logger.info(`File removed successfully`);
    }

    async generateIntent(formData: IntentFormData): Promise<void> {
        this.logger.info('Generating intent.bl');

        this.state.name = formData.name;
        this.state.content = formDataToContent(formData);

        const intentPath = joinPath(this.intentFolder, 'intent.bl');
        await this.intentGenerator.generateIntent(
            formData,
            this.state.files,
            intentPath
        );

        await this.regenerateCodebase();

        await this.updateWorkflow({
            stage: 'intent-generated'
        });

        await this.changeStatus('completed');

        this.logger.info('Intent generated successfully');
    }

    async regenerateIntent(formData: IntentFormData): Promise<void> {
        this.logger.info('Regenerating intent.bl');

        this.state.content = formDataToContent(formData);

        const intentPath = joinPath(this.intentFolder, 'intent.bl');
        await this.intentGenerator.generateIntent(
            formData,
            this.state.files,
            intentPath
        );

        await this.regenerateCodebase();

        await this.metadataManager.update(this.intentFolder, {
            content: this.state.content
        });

        this.logger.info('Intent regenerated successfully');
    }

    queueAutoSave(updates: Partial<IntentContent>): void {
        Object.assign(this.state.content, updates);
        this.autoSaver.enqueue(updates);
        this.emit('stateChanged', this.state);
    }

    async changeStatus(status: 'draft' | 'in-progress' | 'completed' | 'archived'): Promise<void> {
        this.state.status = status;
        await this.metadataManager.update(this.intentFolder, {
            status
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

        await vscode.workspace.fs.createDirectory(this.intentFolder);

        try {
            await vscode.workspace.fs.stat(this.intentFolder);
        } catch {
            // Crear carpeta si no existe
            await vscode.workspace.fs.createDirectory(this.intentFolder);
            this.logger.info(`Created intent folder: ${this.intentFolder.fsPath}`);
        }

        const fileDescriptors: FileDescriptor[] = this.state.files.map(relativePath => {
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

        this.logger.info('Codebase regenerated');
    }

    private categorizeFile(filePath: string): FileCategory {
        const ext = path.extname(filePath).toLowerCase();

        if (['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.kt', '.swift'].includes(ext)) {
            return 'code';
        }
        if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext)) {
            return 'config';
        }
        if (['.md', '.txt', '.rst'].includes(ext)) {
            return 'docs';
        }
        if (filePath.includes('.test.') || filePath.includes('.spec.')) {
            return 'test';
        }
        if (['.png', '.jpg', '.svg', '.ico'].includes(ext)) {
            return 'asset';
        }
        return 'other';
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
        totalChars += this.state.content.expectedOutput.length;
        totalChars += this.state.content.considerations.length;

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

    private async calculateTotalSize(): Promise<number> {
        let total = 0;
        for (const relativePath of this.state.files) {
            const fileUri = vscode.Uri.file(
                path.join(this.workspaceFolder.uri.fsPath, relativePath)
            );
            try {
                const stat = await vscode.workspace.fs.stat(fileUri);
                total += stat.size;
            } catch (error) {
                this.logger.warn(`Error calculating size for ${relativePath}`);
            }
        }
        return total;
    }

    dispose(): void {
        this.autoSaver.dispose();
        this.removeAllListeners();
    }
}