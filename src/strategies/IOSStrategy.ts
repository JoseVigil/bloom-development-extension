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

export class IOSStrategy implements ICodebaseStrategy {
    name = 'iOS';
    projectType: ProjectType = 'ios';
    
    async detect(workspaceRoot: string): Promise<boolean> {
        const indicators = [
            'Podfile',
            'Package.swift'
        ];
        
        for (const indicator of indicators) {
            if (await fileExists(path.join(workspaceRoot, indicator))) {
                return true;
            }
        }
        
        const found = await vscode.workspace.findFiles(
            new vscode.RelativePattern(workspaceRoot, '**/*.xcodeproj'),
            null,
            1
        );
        
        return found.length > 0;
    }
    
    async getRelevantFiles(workspaceRoot: string, selectedFiles?: vscode.Uri[]): Promise<FileDescriptor[]> {
        const patterns = [
            'Podfile',
            'Package.swift',
            '**/Info.plist',
            '**/*.swift',
            '**/*.storyboard'
        ];
        
        const excludePatterns = [
            '**/Pods/**',
            '**/build/**',
            '**/.build/**'
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
        const fileName = path.basename(relativePath);
        const lowerPath = relativePath.toLowerCase();
        
        if (fileName === 'Podfile' || fileName === 'Package.swift') return FileCategory.DEPENDENCY;
        if (fileName === 'Info.plist') return FileCategory.MANIFEST;
        if (fileName.endsWith('.storyboard')) return FileCategory.LAYOUT;
        if (relativePath.match(/\.swift$/)) {
            if (lowerPath.includes('viewmodel') || lowerPath.includes('model')) return FileCategory.MODEL;
            if (lowerPath.includes('service')) return FileCategory.SERVICE;
            return FileCategory.COMPONENT;
        }
        
        return FileCategory.OTHER;
    }
    
    assignPriority(file: FileDescriptor): number {
        const priorityMap: Partial<Record<FileCategory, number>> = {
            [FileCategory.DEPENDENCY]: 1,
            [FileCategory.MANIFEST]: 1,
            [FileCategory.COMPONENT]: 3,
            [FileCategory.MODEL]: 3,
            [FileCategory.SERVICE]: 3,
            [FileCategory.LAYOUT]: 4
        };
        
        return priorityMap[file.category] || 9;
    }
    
    generateIndex(files: FileDescriptor[]): string {
        let index = '## 📋 iOS Project Structure\n\n';
        
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