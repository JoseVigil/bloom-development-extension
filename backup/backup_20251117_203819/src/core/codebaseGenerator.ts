import * as vscode from 'vscode';
    import { FileDescriptor, CodebaseGeneratorOptions } from '../models/codebaseStrategy';
    import { promises as fs } from 'fs';
    import * as path from 'path';
    
    export class CodebaseGenerator {
        async generate(
            files: FileDescriptor[],
            outputPath: vscode.Uri,
            options: CodebaseGeneratorOptions
        ): Promise<void> {
            if (options.format === 'markdown') {
                await this.generateMarkdown(files, outputPath, options);
            } else {
                await this.generateTarball(files, outputPath, options);
            }
        }
        
        private async generateMarkdown(
            files: FileDescriptor[],
            outputPath: vscode.Uri,
            options: CodebaseGeneratorOptions
        ): Promise<void> {
            let content = this.generateHeader(files, options);
            content += this.generateIndex(files, options);
            content += await this.generateContent(files, options);
            
            await fs.writeFile(outputPath.fsPath, content, 'utf-8');
        }
        
        private generateHeader(
            files: FileDescriptor[],
            options: CodebaseGeneratorOptions
        ): string {
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
        
        private generateIndex(
            files: FileDescriptor[],
            options: CodebaseGeneratorOptions
        ): string {
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
            } else {
                for (const file of files) {
                    const anchor = this.createAnchor(file.relativePath);
                    index += `- [${file.relativePath}](#${anchor})\n`;
                }
                index += `\n`;
            }
            
            index += `---\n\n`;
            return index;
        }
        
        private async generateContent(
            files: FileDescriptor[],
            options: CodebaseGeneratorOptions
        ): Promise<string> {
            let content = `## Files\n\n`;
            
            for (const file of files) {
                content += await this.generateFileSection(file, options);
            }
            
            return content;
        }
        
        private async generateFileSection(
            file: FileDescriptor,
            options: CodebaseGeneratorOptions
        ): Promise<string> {
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
                const fileContent = await fs.readFile(file.absolutePath, 'utf-8');
                const language = this.getLanguageFromExtension(file.relativePath);
                
                section += `\`\`\`${language}\n`;
                section += fileContent;
                section += `\n\`\`\`\n\n`;
            } catch (error) {
                section += `*Error reading file: ${error}*\n\n`;
            }
            
            section += `---\n\n`;
            return section;
        }
        
        private categorizeFiles(files: FileDescriptor[]): Record<string, FileDescriptor[]> {
            const categories: Record<string, FileDescriptor[]> = {};
            
            for (const file of files) {
                const ext = path.extname(file.relativePath).toLowerCase();
                let category = 'Other';
                
                if (['.ts', '.tsx', '.js', '.jsx'].includes(ext)) {
                    category = 'TypeScript/JavaScript';
                } else if (['.json', '.jsonc'].includes(ext)) {
                    category = 'Configuration';
                } else if (['.md', '.txt'].includes(ext)) {
                    category = 'Documentation';
                } else if (['.css', '.scss', '.sass', '.less'].includes(ext)) {
                    category = 'Styles';
                } else if (['.html', '.htm'].includes(ext)) {
                    category = 'HTML';
                }
                
                if (!categories[category]) {
                    categories[category] = [];
                }
                categories[category].push(file);
            }
            
            return categories;
        }
        
        private createAnchor(filePath: string): string {
            return filePath
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-|-$/g, '');
        }
        
        private getLanguageFromExtension(filePath: string): string {
            const ext = path.extname(filePath).toLowerCase();
            const languageMap: Record<string, string> = {
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
        
        private formatBytes(bytes: number): string {
            if (bytes === 0) return '0 Bytes';
            
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            
            return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
        }
        
        private async generateTarball(
            files: FileDescriptor[],
            outputPath: vscode.Uri,
            options: CodebaseGeneratorOptions
        ): Promise<void> {
            throw new Error('Tarball generation not yet implemented');
        }
    }