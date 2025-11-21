import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileDescriptor, FileCategory } from '../models/codebaseStrategy';
import { ProjectType } from '../models/intent.js';
import { CodebaseStrategy } from '../models/codebaseStrategy';

export class GenericStrategy implements CodebaseStrategy {
    name = 'Generic';
    projectType: ProjectType = 'generic';
    
    /**
     * Detects if the workspace is a generic project
     * Always returns true as this is the fallback strategy
     */
    async detect(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
        return true;
    }
    
    /**
     * Categorizes files for generic projects
     */
    async categorize(files: vscode.Uri[]): Promise<FileDescriptor[]> {
        const descriptors: FileDescriptor[] = [];
        
        for (const fileUri of files) {
            const absolutePath = fileUri.fsPath;
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
            
            if (!workspaceFolder) {
                continue;
            }
            
            const relativePath = path.relative(workspaceFolder.uri.fsPath, absolutePath);
            const extension = path.extname(absolutePath);
            const lowerPath = relativePath.toLowerCase();
            
            let category: FileCategory = 'code';
            let priority = 5;
            
            // Generic categorization based on file extensions and patterns
            if (extension === '.md' || extension === '.txt' || extension === '.doc' || 
                extension === '.docx' || extension === '.pdf') {
                category = 'docs';
                priority = 6;
            } else if (extension === '.json' || extension === '.yaml' || extension === '.yml' || 
                       extension === '.toml' || extension === '.ini' || extension === '.conf' || 
                       extension === '.config') {
                category = 'config';
                priority = 8;
            } else if (lowerPath.includes('.test.') || lowerPath.includes('.spec.') || 
                       lowerPath.includes('/test/') || lowerPath.includes('/tests/') || 
                       lowerPath.includes('/__tests__/')) {
                category = 'test';
                priority = 6;
            } else if (extension === '.png' || extension === '.jpg' || extension === '.jpeg' || 
                       extension === '.gif' || extension === '.svg' || extension === '.webp' || 
                       extension === '.ico' || extension === '.bmp') {
                category = 'asset';
                priority = 3;
            } else if (extension === '.css' || extension === '.scss' || extension === '.sass' || 
                       extension === '.less' || extension === '.styl') {
                category = 'asset';
                priority = 5;
            } else if (extension === '.mp4' || extension === '.mp3' || extension === '.wav' || 
                       extension === '.avi' || extension === '.mov') {
                category = 'asset';
                priority = 2;
            } else if (extension === '.js' || extension === '.ts' || extension === '.jsx' || 
                       extension === '.tsx' || extension === '.py' || extension === '.java' || 
                       extension === '.cpp' || extension === '.c' || extension === '.h' || 
                       extension === '.cs' || extension === '.go' || extension === '.rs' || 
                       extension === '.rb' || extension === '.php' || extension === '.swift' || 
                       extension === '.kt' || extension === '.m') {
                category = 'code';
                priority = 7;
            } else {
                category = 'other';
                priority = 4;
            }
            
            const stats = fs.statSync(absolutePath);
            
            descriptors.push({
                relativePath,
                absolutePath,
                category,
                priority,
                size: stats.size,
                extension,
                metadata: {
                    size: stats.size,
                    type: extension,
                    lastModified: stats.mtimeMs
                }
            });
        }
        
        return descriptors;
    }
    
    /**
     * Prioritizes files for generic projects
     */
    prioritize(files: FileDescriptor[]): FileDescriptor[] {
        return files.sort((a, b) => {
            // Sort by priority (higher first)
            if (b.priority !== a.priority) {
                return b.priority - a.priority;
            }
            
            // Then by path depth (shallower first)
            const depthA = a.relativePath.split(path.sep).length;
            const depthB = b.relativePath.split(path.sep).length;
            
            if (depthA !== depthB) {
                return depthA - depthB;
            }
            
            // Finally alphabetically
            return a.relativePath.localeCompare(b.relativePath);
        });
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