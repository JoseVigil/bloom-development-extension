import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileDescriptor, FileCategory } from '../models/codebaseStrategy';
import { ProjectType } from '../models/intent.js';
import { CodebaseStrategy } from '../models/codebaseStrategy';

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath);
        return true;
    } catch {
        return false;
    }
}

export class ReactStrategy implements CodebaseStrategy {
    name = 'React';
    projectType: ProjectType = 'react-web';
    
    /**
     * Detects if the workspace is a React project
     */
    async detect(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
        const projectRoot = workspaceFolder.uri.fsPath;
        const packageJsonPath = path.join(projectRoot, 'package.json');
        
        if (!fs.existsSync(packageJsonPath)) {
            return false;
        }
        
        try {
            const content = fs.readFileSync(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(content);
            
            const deps = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };
            
            // Check for React
            if (deps['react'] || deps['react-dom']) {
                return true;
            }
        } catch (error) {
            return false;
        }
        
        return false;
    }
    
    /**
     * Categorizes files for React projects
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
            
            // React-specific categorization
            if (extension === '.jsx' || extension === '.tsx') {
                category = 'code';
                priority = 10;
                
                // Boost priority for key React files
                if (lowerPath.includes('/components/')) {
                    priority = 12;
                } else if (lowerPath.includes('app.tsx') || lowerPath.includes('app.jsx')) {
                    priority = 13;
                }
            } else if (extension === '.js' || extension === '.ts') {
                category = 'code';
                priority = 9;
                
                // Boost priority for hooks and services
                if (lowerPath.includes('/hooks/')) {
                    priority = 11;
                } else if (lowerPath.includes('/services/') || lowerPath.includes('/api/')) {
                    priority = 10;
                } else if (lowerPath.includes('/utils/') || lowerPath.includes('/helpers/')) {
                    priority = 8;
                }
            } else if (extension === '.css' || extension === '.scss' || extension === '.sass') {
                category = 'asset';
                priority = 6;
            } else if (extension === '.module.css' || extension === '.module.scss') {
                category = 'asset';
                priority = 7;
            } else if (relativePath === 'package.json') {
                category = 'config';
                priority = 12;
            } else if (relativePath === 'tsconfig.json' || relativePath === 'jsconfig.json') {
                category = 'config';
                priority = 11;
            } else if (extension === '.json' || extension === '.yaml' || extension === '.yml') {
                category = 'config';
                priority = 8;
            } else if (lowerPath.includes('.test.') || lowerPath.includes('.spec.') || 
                       lowerPath.includes('/tests/') || lowerPath.includes('/__tests__/')) {
                category = 'test';
                priority = 6;
            } else if (extension === '.md' || extension === '.txt') {
                category = 'docs';
                priority = 3;
            } else if (extension === '.png' || extension === '.jpg' || extension === '.svg' || 
                       extension === '.gif' || extension === '.ico') {
                category = 'asset';
                priority = 2;
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
     * Prioritizes files for React projects
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