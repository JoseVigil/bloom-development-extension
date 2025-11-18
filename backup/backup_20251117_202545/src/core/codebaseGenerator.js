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
exports.CodebaseGenerator = void 0;
const fs_1 = require("fs");
const path = __importStar(require("path"));
class CodebaseGenerator {
    async generate(files, outputPath, options) {
        if (options.format === 'markdown') {
            await this.generateMarkdown(files, outputPath, options);
        }
        else {
            await this.generateTarball(files, outputPath, options);
        }
    }
    async generateMarkdown(files, outputPath, options) {
        let content = this.generateHeader(files, options);
        content += this.generateIndex(files, options);
        content += await this.generateContent(files, options);
        await fs_1.promises.writeFile(outputPath.fsPath, content, 'utf-8');
    }
    generateHeader(files, options) {
        const timestamp = new Date().toISOString();
        let header = `# Codebase Export\n\n`;
        if (options.includeMetadata) {
            header += `**Generated:** ${timestamp}\n`;
            header += `**Total Files:** ${files.length}\n`;
            header += `**Format:** ${options.format}\n\n`;
        }
        header += `---\n\n`;
        return header;
    }
    generateIndex(files, options) {
        if (!options.addTableOfContents) {
            return '';
        }
        let index = `## Table of Contents\n\n`;
        if (options.categorizeByType) {
            const categorized = this.categorizeFiles(files);
            for (const [category, categoryFiles] of Object.entries(categorized)) {
                index += `### ${category}\n\n`;
                for (const file of categoryFiles) {
                    const anchor = this.createAnchor(file.relativePath);
                    index += `- [${file.relativePath}](#${anchor})\n`;
                }
                index += `\n`;
            }
        }
        else {
            for (const file of files) {
                const anchor = this.createAnchor(file.relativePath);
                index += `- [${file.relativePath}](#${anchor})\n`;
            }
            index += `\n`;
        }
        index += `---\n\n`;
        return index;
    }
    async generateContent(files, options) {
        let content = `## Files\n\n`;
        for (const file of files) {
            content += await this.generateFileSection(file, options);
        }
        return content;
    }
    async generateFileSection(file, options) {
        const anchor = this.createAnchor(file.relativePath);
        let section = `### ${file.relativePath} {#${anchor}}\n\n`;
        if (options.includeMetadata && file.metadata) {
            section += `**Size:** ${this.formatBytes(file.metadata.size)}\n`;
            section += `**Type:** ${file.metadata.type}\n`;
            if (file.metadata.lastModified) {
                section += `**Modified:** ${new Date(file.metadata.lastModified).toLocaleString()}\n`;
            }
            section += `\n`;
        }
        try {
            const fileContent = await fs_1.promises.readFile(file.absolutePath, 'utf-8');
            const language = this.getLanguageFromExtension(file.relativePath);
            section += `\`\`\`${language}\n`;
            section += fileContent;
            section += `\n\`\`\`\n\n`;
        }
        catch (error) {
            section += `*Error reading file: ${error}*\n\n`;
        }
        section += `---\n\n`;
        return section;
    }
    categorizeFiles(files) {
        const categories = {};
        for (const file of files) {
            const ext = path.extname(file.relativePath).toLowerCase();
            let category = 'Other';
            if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
                category = 'TypeScript/JavaScript';
            }
            else if (['.json', '.jsonc'].includes(ext)) {
                category = 'Configuration';
            }
            else if (['.md', '.txt'].includes(ext)) {
                category = 'Documentation';
            }
            else if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
                category = 'Styles';
            }
            else if (['.html', '.htm'].includes(ext)) {
                category = 'HTML';
            }
            if (!categories[category]) {
                categories[category] = [];
            }
            categories[category].push(file);
        }
        return categories;
    }
    createAnchor(filePath) {
        return filePath
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }
    getLanguageFromExtension(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap = {
            '.ts': 'typescript',
            '.tsx': 'tsx',
            '.js': 'javascript',
            '.jsx': 'jsx',
            '.json': 'json',
            '.md': 'markdown',
            '.css': 'css',
            '.scss': 'scss',
            '.html': 'html',
            '.py': 'python',
            '.java': 'java',
        };
        return languageMap[ext] || 'text';
    }
    formatBytes(bytes) {
        if (bytes === 0)
            return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    async generateTarball(files, outputPath, options) {
        throw new Error('Tarball generation not yet implemented');
    }
}
exports.CodebaseGenerator = CodebaseGenerator;
//# sourceMappingURL=codebaseGenerator.js.map