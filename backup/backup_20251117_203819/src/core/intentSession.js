"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntentSession = void 0;
const vscode = __importStar(require("vscode"));
const events_1 = require("events");
const intentAutoSaver_1 = require("./intentAutoSaver");
const uriHelper_1 = require("../utils/uriHelper");
const path = __importStar(require("path"));
class IntentSession extends events_1.EventEmitter {
    constructor(intentFolder, workspaceFolder, metadataManager, codebaseGenerator, intentGenerator, logger, initialState) {
        super();
        this.intentFolder = intentFolder;
        this.workspaceFolder = workspaceFolder;
        this.metadataManager = metadataManager;
        this.codebaseGenerator = codebaseGenerator;
        this.intentGenerator = intentGenerator;
        this.logger = logger;
        this.state = initialState;
        this.autoSaver = new intentAutoSaver_1.IntentAutoSaver(intentFolder, workspaceFolder, metadataManager, codebaseGenerator, logger);
    }
    static async create(intentFolder, workspaceFolder, selectedFiles, relativePaths, metadataManager, codebaseGenerator, intentGenerator, logger) {
        const initialState = {
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
        const session = new IntentSession(intentFolder, workspaceFolder, metadataManager, codebaseGenerator, intentGenerator, logger, initialState);
        await session.calculateTokens();
        return session;
    }
    static async forIntent(intentName, workspaceFolder, metadataManager, codebaseGenerator, intentGenerator, logger) {
        const intentFolder = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, '.bloom', 'intents', intentName));
        const metadata = await metadataManager.read(intentFolder);
        if (!metadata) {
            throw new Error(`Intent '${intentName}' not found`);
        }
        const state = {
            id: metadata.id,
            name: metadata.name,
            status: metadata.status,
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
        return new IntentSession(intentFolder, workspaceFolder, metadataManager, codebaseGenerator, intentGenerator, logger, state);
    }
    async addFiles(files) {
        this.logger.info(`Adding ${files.length} files to intent`);
        const newRelativePaths = files.map(file => path.relative(this.workspaceFolder.uri.fsPath, file.fsPath));
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
    async removeFile(filePath) {
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
    async generateIntent(formData) {
        this.logger.info('Generating intent.bl');
        this.state.name = formData.name;
        this.state.content = {
            problem: formData.problem,
            notes: formData.notes || '',
            currentBehavior: formData.currentBehavior || [],
            desiredBehavior: formData.desiredBehavior || []
        };
        const intentPath = (0, uriHelper_1.joinPath)(this.intentFolder, 'intent.bl');
        await this.intentGenerator.generateIntent(formData, this.state.files, intentPath);
        await this.regenerateCodebase();
        await this.changeStatus('generated');
        this.logger.info('Intent generated successfully');
    }
    async regenerateIntent(formData) {
        this.logger.info('Regenerating intent.bl');
        this.state.content = {
            problem: formData.problem,
            notes: formData.notes || '',
            currentBehavior: formData.currentBehavior || [],
            desiredBehavior: formData.desiredBehavior || []
        };
        const intentPath = (0, uriHelper_1.joinPath)(this.intentFolder, 'intent.bl');
        await this.intentGenerator.generateIntent(formData, this.state.files, intentPath);
        await this.regenerateCodebase();
        await this.metadataManager.update(this.intentFolder, {
            content: this.state.content,
            updatedAt: new Date().toISOString()
        });
        this.logger.info('Intent regenerated successfully');
    }
    queueAutoSave(updates) {
        Object.assign(this.state.content, updates);
        this.autoSaver.queue(updates);
        this.emit('stateChanged', this.state);
    }
    async changeStatus(status) {
        this.state.status = status;
        await this.metadataManager.update(this.intentFolder, {
            status,
            updatedAt: new Date().toISOString()
        });
        this.emit('stateChanged', this.state);
    }
    async deleteIntent() {
        this.logger.info(`Deleting intent: ${this.state.name}`);
        await vscode.workspace.fs.delete(this.intentFolder, { recursive: true });
        this.dispose();
        this.logger.info('Intent deleted successfully');
    }
    getState() {
        return { ...this.state };
    }
    async regenerateCodebase() {
        this.logger.info('Regenerating codebase.md');
        const fileUris = this.state.files.map(relativePath => vscode.Uri.file(path.join(this.workspaceFolder.uri.fsPath, relativePath)));
        const codebasePath = (0, uriHelper_1.joinPath)(this.intentFolder, 'codebase.md');
        await this.codebaseGenerator.generate(fileUris.map((uri, index) => ({
            relativePath: this.state.files[index],
            absolutePath: uri.fsPath,
            metadata: {
                size: 0,
                type: path.extname(uri.fsPath).slice(1),
                lastModified: Date.now()
            }
        })), codebasePath, {
            format: 'markdown',
            includeMetadata: true,
            addTableOfContents: true,
            categorizeByType: false
        });
        this.logger.info('Codebase regenerated');
    }
    async calculateTokens() {
        let totalChars = 0;
        for (const relativePath of this.state.files) {
            const fileUri = vscode.Uri.file(path.join(this.workspaceFolder.uri.fsPath, relativePath));
            try {
                const content = await vscode.workspace.fs.readFile(fileUri);
                totalChars += content.length;
            }
            catch (error) {
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
    dispose() {
        this.autoSaver.dispose();
        this.removeAllListeners();
    }
}
exports.IntentSession = IntentSession;
//# sourceMappingURL=intentSession.js.map