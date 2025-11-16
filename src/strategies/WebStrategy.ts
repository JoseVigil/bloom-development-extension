import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ICodebaseStrategy, FileDescriptor, FileCategory } from '../models/codebaseStrategy';
import { ProjectType } from '../models/intent';

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

export class WebStrategy implements ICodebaseStrategy {
    name = 'Web';
    projectType: ProjectType = 'web';
    
    async detect(workspaceRoot: string): Promise<boolean> {
        const indicators = [
            'index.html',
            'index.htm'
        ];
        
        for (const indicator of indicators) {
            if (await fileExists(path.join(workspaceRoot, indicator))) {
                const packageJsonPath = path.join(workspaceRoot, 'package.json');
                if (await fileExists(packageJsonPath)) {
                    const content = await fs.promises.readFile(packageJsonPath, 'utf8');
                    const packageJson = JSON.parse(content);
                    
                    if (packageJson.dependencies?.react || packageJson.dependencies?.['react-dom']) {
                        return false;
                    }
                }
                
                return true;
            }
        }
        
        return false;
    }
    
    async getRelevantFiles(workspaceRoot: string, selectedFiles?: vscode.Uri[]): Promise<FileDescriptor[]> {
        const patterns = [
            '*.html',
            '*.css',
            '*.js',
            'src/**/*.html',
            'src/**/*.css',
            'src/**/*.js'
        ];
        
        const excludePatterns = [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**'
        ];
        
        const files: FileDescriptor[] = [];
        
        for (const pattern of patterns) {
            const found = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceRoot, pattern),
                `{${excludePatterns.join(',')}}`
            );
            
            for (const fileUri of found) {
                const descriptor = await this.createFileDescriptor(fileUri, workspaceRoot);
                files.push(descriptor);
            }
        }
        
        if (selectedFiles && selectedFiles.length > 0) {
            for (const fileUri of selectedFiles) {
                const descriptor = await this.createFileDescriptor(fileUri, workspaceRoot);
                if (!files.some(f => f.absolutePath === descriptor.absolutePath)) {
                    files.push(descriptor);
                }
            }
        }
        
        return files.sort((a, b) => a.priority - b.priority);
    }
    
    categorizeFile(relativePath: string): FileCategory {
        const extension = path.extname(relativePath).toLowerCase();
        
        if (extension === '.html') return FileCategory.LAYOUT;
        if (['.css', '.scss', '.sass'].includes(extension)) return FileCategory.STYLE;
        if (['.js', '.ts'].includes(extension)) return FileCategory.SOURCE_CODE;
        
        return FileCategory.OTHER;
    }
    
    assignPriority(file: FileDescriptor): number {
        const priorityMap: Partial<Record<FileCategory, number>> = {
            [FileCategory.LAYOUT]: 1,
            [FileCategory.STYLE]: 2,
            [FileCategory.SOURCE_CODE]: 3
        };
        
        return priorityMap[file.category] || 9;
    }
    
    generateIndex(files: FileDescriptor[]): string {
        let index = '## 📋 Web Project Structure\n\n';
        
        for (const file of files) {
            index += `- ${file.relativePath}\n`;
        }
        
        return index + '\n';
    }
    
    private async createFileDescriptor(fileUri: vscode.Uri, workspaceRoot: string): Promise<FileDescriptor> {
        const relativePath = path.relative(workspaceRoot, fileUri.fsPath);
        const stat = await vscode.workspace.fs.stat(fileUri);
        const category = this.categorizeFile(relativePath);
        
        const descriptor: FileDescriptor = {
            absolutePath: fileUri.fsPath,
            relativePath: relativePath,
            category: category,
            priority: 0,
            size: stat.size,
            extension: path.extname(fileUri.fsPath)
        };
        
        descriptor.priority = this.assignPriority(descriptor);
        return descriptor;
    }
}