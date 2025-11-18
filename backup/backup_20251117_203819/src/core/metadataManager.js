"use strict";
// src/core/metadataManager.ts
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
exports.MetadataManager = void 0;
const vscode = __importStar(require("vscode"));
const uuid_1 = require("uuid");
const uriHelper_1 = require("../utils/uriHelper");
class MetadataManager {
    constructor(logger) {
        this.logger = logger;
    }
    /**
     * Crea metadata para un nuevo intent
     */
    async create(intentFolder, options) {
        const now = new Date().toISOString();
        const metadata = {
            id: (0, uuid_1.v4)(),
            name: options.name,
            displayName: this.generateDisplayName(options.name),
            created: now,
            updated: now,
            status: 'in-progress',
            projectType: options.projectType,
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
    async read(intentFolder) {
        try {
            const metadataPath = (0, uriHelper_1.joinPath)(intentFolder, '.bloom-meta.json');
            const content = await vscode.workspace.fs.readFile(metadataPath);
            const metadata = JSON.parse(new TextDecoder().decode(content));
            return metadata;
        }
        catch (error) {
            this.logger.warn(`Error al leer metadata de ${intentFolder.fsPath}: ${error}`);
            return null;
        }
    }
    /**
     * Actualiza metadata existente
     */
    async update(intentFolder, updates) {
        const existing = await this.read(intentFolder);
        if (!existing)
            return null;
        const updated = {
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
    async save(intentFolder, metadata) {
        const metadataPath = (0, uriHelper_1.joinPath)(intentFolder, '.bloom-meta.json');
        const content = JSON.stringify(metadata, null, 2);
        await vscode.workspace.fs.writeFile(metadataPath, new TextEncoder().encode(content));
    }
    /**
     * Incrementa contador de opens
     */
    async incrementOpens(intentFolder) {
        const metadata = await this.read(intentFolder);
        if (!metadata)
            return;
        metadata.stats.timesOpened += 1;
        metadata.stats.lastOpened = new Date().toISOString();
        await this.save(intentFolder, metadata);
    }
    /**
     * Cambia el estado de un intent
     */
    async changeStatus(intentFolder, newStatus) {
        await this.update(intentFolder, { status: newStatus });
    }
    /**
     * Actualiza tags
     */
    async updateTags(intentFolder, tags) {
        await this.update(intentFolder, { tags });
    }
    /**
     * Valida que la metadata sea válida
     */
    isValid(metadata) {
        return (typeof metadata.id === 'string' &&
            typeof metadata.name === 'string' &&
            typeof metadata.created === 'string' &&
            typeof metadata.status === 'string' &&
            ['draft', 'in-progress', 'completed', 'archived'].includes(metadata.status));
    }
    // Helpers privados
    generateDisplayName(name) {
        return name
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }
    async calculateTotalSize(files) {
        let total = 0;
        for (const file of files) {
            try {
                const stat = await vscode.workspace.fs.stat(file);
                total += stat.size;
            }
            catch (error) {
                this.logger.warn(`Error al calcular tamaño de ${file.fsPath}`);
            }
        }
        return total;
    }
}
exports.MetadataManager = MetadataManager;
//# sourceMappingURL=metadataManager.js.map