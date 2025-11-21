import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileDescriptor, FileCategory } from '../models/codebaseStrategy';
import { ProjectType } from '../models/intent';
import { CodebaseStrategy } from '../models/codebaseStrategy';

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

export class IOSStrategy implements CodebaseStrategy {
    name = 'iOS';
    projectType: ProjectType = 'ios';
    
    /**
     * Detects if the workspace is an iOS project
     */
    async detect(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
        const projectRoot = workspaceFolder.uri.fsPath;
        
        try {
            const items = fs.readdirSync(projectRoot);
            
            // Check for .xcodeproj or .xcworkspace
            for (const item of items) {
                if (item.endsWith('.xcodeproj') || item.endsWith('.xcworkspace')) {
                    return true;
                }
            }
            
            // Check for Podfile
            const podfile = path.join(projectRoot, 'Podfile');
            if (fs.existsSync(podfile)) {
                return true;
            }
            
            // Check for Package.swift (Swift Package Manager)
            const packageSwift = path.join(projectRoot, 'Package.swift');
            if (fs.existsSync(packageSwift)) {
                return true;
            }
        } catch (error) {
            return false;
        }
        
        return false;
    }
    
    /**
     * Categorizes files for iOS projects
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
            const fileName = path.basename(absolutePath);
            
            let category: FileCategory = 'code';
            let priority = 5;
            
            // iOS-specific categorization
            if (extension === '.swift') {
                category = 'code';
                priority = 10;
                
                // Boost priority for key iOS files
                if (relativePath.includes('ViewController') || relativePath.includes('AppDelegate')) {
                    priority = 12;
                } else if (relativePath.includes('ViewModel') || relativePath.includes('Model')) {
                    priority = 11;
                } else if (relativePath.includes('Service') || relativePath.includes('Manager')) {
                    priority = 11;
                }
            } else if (extension === '.m' || extension === '.h') {
                category = 'code';
                priority = 10;
            } else if (extension === '.storyboard' || extension === '.xib') {
                category = 'asset';
                priority = 8;
            } else if (relativePath.includes('.xcassets')) {
                category = 'asset';
                priority = 5;
            } else if (extension === '.plist') {
                category = 'config';
                if (fileName === 'Info.plist') {
                    priority = 12;
                } else {
                    priority = 9;
                }
            } else if (fileName === 'Podfile' || fileName === 'Package.swift') {
                category = 'config';
                priority = 11;
            } else if (extension === '.json' || extension === '.yaml') {
                category = 'config';
                priority = 7;
            } else if (relativePath.includes('/Tests/') || relativePath.includes('Test.swift')) {
                category = 'test';
                priority = 6;
            } else if (extension === '.md' || extension === '.txt') {
                category = 'docs';
                priority = 3;
            } else if (extension === '.png' || extension === '.jpg' || extension === '.pdf') {
                category = 'asset';
                priority = 3;
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
     * Prioritizes files for iOS projects
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
        
        if (fileName === 'Podfile' || fileName === 'Package.swift') return 'config';
        if (fileName === 'Info.plist') return 'config';
        if (fileName.endsWith('.storyboard')) return 'asset';
        if (relativePath.match(/\.swift$/)) {
            if (lowerPath.includes('viewmodel') || lowerPath.includes('model')) return 'code';
            if (lowerPath.includes('service')) return 'code';
            return 'code';
        }
        
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