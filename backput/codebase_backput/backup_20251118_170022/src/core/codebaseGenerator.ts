import * as vscode from 'vscode';
import { FileDescriptor, CodebaseGeneratorOptions } from '../models/codebaseStrategy';
import { promises as fs } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class CodebaseGenerator {
    async generate(
        files: FileDescriptor[],
        outputPath: vscode.Uri,
        options: CodebaseGeneratorOptions
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration('bloom');
        const useCustomGenerator = config.get<boolean>('useCustomCodebaseGenerator', false);
        
        if (useCustomGenerator && options.format === 'markdown') {
            const success = await this.tryPythonGeneration(files, outputPath, options);
            if (success) {
                return;
            }
            
            vscode.window.showWarningMessage(
                'Script Python no disponible, usando generador nativo'
            );
        }
        
        if (options.format === 'markdown') {
            await this.generateMarkdown(files, outputPath, options);
        } else {
            await this.generateTarball(files, outputPath, options);
        }
    }
    
    private async tryPythonGeneration(
        files: FileDescriptor[],
        outputPath: vscode.Uri,
        options: CodebaseGeneratorOptions
    ): Promise<boolean> {
        try {
            const workspacePath = options.workspaceFolder.uri.fsPath;
            const scriptPath = path.join(workspacePath, '.bloom', 'scripts', 'generate_codebase.py');
            
            try {
                await fs.access(scriptPath);
            } catch {
                return false;
            }
            
            const config = vscode.workspace.getConfiguration('bloom');
            const pythonPath = config.get<string>('pythonPath', 'python');
            
            const filesListPath = path.join(path.dirname(outputPath.fsPath), 'files_list.json');
            await fs.writeFile(
                filesListPath,
                JSON.stringify({
                    files: files.map(f => ({
                        relativePath: f.relativePath,
                        absolutePath: f.absolutePath
                    })),
                    workspacePath: workspacePath,
                    outputPath: outputPath.fsPath
                }),
                'utf-8'
            );
            
            const command = `"${pythonPath}" "${scriptPath}" "${filesListPath}"`;
            const { stdout, stderr } = await execAsync(command, {
                cwd: workspacePath,
                timeout: 60000
            });
            
            if (stderr) {
                console.warn('Python script warnings:', stderr);
            }
            
            console.log('Python script output:', stdout);
            
            try {
                await fs.access(outputPath.fsPath);
                vscode.window.showInformationMessage('✅ Codebase regenerado (Python)');
                return true;
            } catch {
                return false;
            }
            
        } catch (error) {
            console.error('Error ejecutando script Python:', error);
            return false;
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
        let header = `# Snapshot de Codebase\n`;
        header += `Este archivo consolida todo el código del proyecto para indexación rápida por IA. `;
        header += `Primero el índice jerárquico, luego cada archivo con su path como título y código en bloque Markdown.\n\n`;
        
        if (options.includeMetadata) {
            header += `**Generado:** ${timestamp}\n`;
            header += `**Total de archivos:** ${files.length}\n\n`;
        }
        
        return header;
    }
    
    private generateIndex(
        files: FileDescriptor[],
        options: CodebaseGeneratorOptions
    ): string {
        if (!options.addTableOfContents) {
            return '';
        }
        
        let index = `## Índice de Archivos\n\n`;
        index += `Lista de archivos incluidos en este snapshot:\n\n`;
        
        const filesByDir: Record<string, string[]> = {};
        
        for (const file of files) {
            const dir = path.dirname(file.relativePath);
            if (!filesByDir[dir]) {
                filesByDir[dir] = [];
            }
            filesByDir[dir].push(file.relativePath);
        }
        
        const sortedDirs = Object.keys(filesByDir).sort();
        
        for (const dir of sortedDirs) {
            index += `- **${dir}/**\n`;
            for (const filePath of filesByDir[dir].sort()) {
                index += `  - ${filePath}\n`;
            }
        }
        
        index += `\n`;
        return index;
    }
    
    private async generateContent(
        files: FileDescriptor[],
        options: CodebaseGeneratorOptions
    ): Promise<string> {
        let content = `## Contenidos de Archivos\n`;
        
        for (const file of files) {
            content += await this.generateFileSection(file, options);
        }
        
        return content;
    }
    
    private async generateFileSection(
        file: FileDescriptor,
        options: CodebaseGeneratorOptions
    ): Promise<string> {
        let section = `### ${file.relativePath}\n`;
        
        if (options.includeMetadata && file.metadata) {
            section += `Metadatos: `;
            section += `Lenguaje: ${file.metadata.type}, `;
            section += `Tamaño: ${this.formatBytes(file.metadata.size)}\n\n`;
        }
        
        try {
            const fileContent = await fs.readFile(file.absolutePath, 'utf-8');
            const language = this.getLanguageFromExtension(file.relativePath);
            
            section += `\`\`\`${language}\n`;
            section += fileContent;
            section += `\n\`\`\`\n\n`;
        } catch (error) {
            section += `*Error leyendo archivo: ${error}*\n\n`;
        }
        
        return section;
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
            '.kt': 'kotlin',
            '.swift': 'swift',
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