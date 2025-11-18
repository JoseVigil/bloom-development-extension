import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ICodebaseStrategy, FileDescriptor, FileCategory } from '../models/codebaseStrategy';
import { ProjectType } from '../models/intent.js';

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

export class ReactStrategy implements ICodebaseStrategy {
    name = 'React';
    projectType: ProjectType = 'react';
    
    async detect(workspaceRoot: string): Promise<boolean> {
        const packageJsonPath = path.join(workspaceRoot, 'package.json');
        
        if (await fileExists(packageJsonPath)) {
            const content = await fs.promises.readFile(packageJsonPath, 'utf8');
            const packageJson = JSON.parse(content);
            
            return !!(
                packageJson.dependencies?.react ||
                packageJson.dependencies?.['react-dom'] ||
                packageJson.devDependencies?.react
            );
        }
        
        return false;
    }
    
    async getRelevantFiles(workspaceRoot: string, selectedFiles?: vscode.Uri[]): Promise<FileDescriptor[]> {
        const patterns = [
            'package.json',
            'tsconfig.json',
            'src/**/*.tsx',
            'src/**/*.jsx',
            'src/**/*.ts',
            'src/**/*.css'
        ];
        
        const excludePatterns = [
            '**/node_modules/**',
            '**/build/**',
            '**/dist/**'
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
        const lowerPath = relativePath.toLowerCase();
        
        if (relativePath === 'package.json' || relativePath === 'tsconfig.json') return 'config';
        if (lowerPath.includes('/components/')) return 'code';
        if (lowerPath.includes('/hooks/')) return 'code';
        if (lowerPath.includes('/services/') || lowerPath.includes('/api/')) return 'code';
        if (relativePath.match(/\.(css|scss)$/)) return 'asset';
        if (relativePath.match(/\.(tsx|jsx|ts|js)$/)) return 'code';
        
        return 'other';
    }
    
    assignPriority(file: FileDescriptor): number {
        const priorityMap: Partial<Record<FileCategory, number>> = {
                    'config': 1,
                    'code': 2,
                    'asset': 3,
                    'test': 4,
                    'docs': 5,
                    'other': 6
                };
        
        return priorityMap[file.category] || 9;
    }
    
    generateIndex(files: FileDescriptor[]): string {
        let index = '## 📋 React Project Structure\n\n';
        
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