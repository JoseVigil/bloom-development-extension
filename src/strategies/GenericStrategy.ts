import * as vscode from 'vscode';
import * as path from 'path';
import { ICodebaseStrategy, FileDescriptor, FileCategory } from '../models/codebaseStrategy';
import { ProjectType } from '../models/intent';

export class GenericStrategy implements ICodebaseStrategy {
    name = 'Generic';
    projectType: ProjectType = 'generic';
    
    async detect(workspaceRoot: string): Promise<boolean> {
        return true;
    }
    
    async getRelevantFiles(workspaceRoot: string, selectedFiles?: vscode.Uri[]): Promise<FileDescriptor[]> {
        if (!selectedFiles || selectedFiles.length === 0) {
            return [];
        }
        
        const files: FileDescriptor[] = [];
        for (const fileUri of selectedFiles) {
            const descriptor = await this.createFileDescriptor(fileUri, workspaceRoot);
            files.push(descriptor);
        }
        
        return files.sort((a, b) => a.priority - b.priority);
    }
    
    categorizeFile(relativePath: string): FileCategory {
        const extension = path.extname(relativePath).toLowerCase();
        
        if (['.md', '.txt', '.doc'].includes(extension)) return 'docs';
        if (['.json', '.yaml', '.yml', '.toml'].includes(extension)) return 'config';
        if (['.test.', '.spec.'].some(t => relativePath.includes(t))) return 'test';
        
        return 'code';
    }
    
    assignPriority(file: FileDescriptor): number {
        return 5;
    }
    
    generateIndex(files: FileDescriptor[]): string {
        let index = '## 📋 Files\n\n';
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
            priority: this.assignPriority({ category } as FileDescriptor),
            size: stat.size,
            extension: path.extname(fileUri.fsPath)
        };
        
        return descriptor;
    }
}