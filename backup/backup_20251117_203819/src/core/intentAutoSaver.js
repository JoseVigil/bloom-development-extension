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
exports.IntentAutoSaver = void 0;
const vscode = __importStar(require("vscode"));
const uriHelper_1 = require("../utils/uriHelper");
const path = __importStar(require("path"));
class IntentAutoSaver {
    constructor(intentFolder, workspaceFolder, metadataManager, codebaseGenerator, logger) {
        this.intentFolder = intentFolder;
        this.workspaceFolder = workspaceFolder;
        this.metadataManager = metadataManager;
        this.codebaseGenerator = codebaseGenerator;
        this.logger = logger;
        this.queue = new Map();
        this.timer = null;
        this.DEBOUNCE_MS = 2000;
    }
    queue(updates) {
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
    async flush() {
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
                const fileUris = files.map((relativePath) => vscode.Uri.file(path.join(this.workspaceFolder.uri.fsPath, relativePath)));
                const codebasePath = (0, uriHelper_1.joinPath)(this.intentFolder, 'codebase.md');
                await this.codebaseGenerator.generate(fileUris.map((uri, index) => ({
                    relativePath: files[index],
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
            }
            this.logger.info('Auto-save completed');
        }
        catch (error) {
            this.logger.error('Auto-save error', error);
            throw error;
        }
    }
    dispose() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.queue.clear();
    }
}
exports.IntentAutoSaver = IntentAutoSaver;
//# sourceMappingURL=intentAutoSaver.js.map