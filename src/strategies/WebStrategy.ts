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

export class WebStrategy implements CodebaseStrategy {
    name = 'Web';
    projectType: ProjectType = 'web';
    
    /**
     * Detects if the workspace is a Web project
     */
    async detect(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
        const projectRoot = workspaceFolder.uri.fsPath;
        
        // Check for package.json
        const packageJsonPath = path.join(projectRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            // Make sure it's not React (React has its own strategy)
            try {
                const content = fs.readFileSync(packageJsonPath, 'utf-8');
                const packageJson = JSON.parse(content);
                const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
                
                // If it has React, it's not a Web project (it's React)
                if (deps['react'] || deps['react-dom']) {
                    return false;
                }
                
                return true;
            } catch (error) {
                return true;
            }
        }
        
        // Check for index.html
        const indexHtml = path.join(projectRoot, 'index.html');
        if (fs.existsSync(indexHtml)) {
            return true;
        }
        
        // Check for index.htm
        const indexHtm = path.join(projectRoot, 'index.htm');
        if (fs.existsSync(indexHtm)) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Categorizes files for Web projects
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
            const lowerPath = relativePath.toLowerCase();
            
            let category: FileCategory = 'code';
            let priority = 5;
            
            // Web-specific categorization
            if (extension === '.html' || extension === '.htm') {
                category = 'asset';
                
                // Boost priority for main HTML files
                if (fileName === 'index.html' || fileName === 'index.htm') {
                    priority = 12;
                } else {
                    priority = 10;
                }
            } else if (extension === '.css') {
                category = 'asset';
                priority = 9;
                
                // Boost priority for main CSS files
                if (fileName === 'style.css' || fileName === 'main.css' || fileName === 'styles.css') {
                    priority = 10;
                }
            } else if (extension === '.scss' || extension === '.sass' || extension === '.less') {
                category = 'asset';
                priority = 8;
            } else if (extension === '.js') {
                category = 'code';
                priority = 10;
                
                // Boost priority for main JS files
                if (fileName === 'main.js' || fileName === 'app.js' || fileName === 'index.js') {
                    priority = 11;
                } else if (lowerPath.includes('/utils/') || lowerPath.includes('/helpers/')) {
                    priority = 9;
                }
            } else if (extension === '.ts') {
                category = 'code';
                priority = 10;
            } else if (extension === '.json') {
                category = 'config';
                
                if (fileName === 'package.json') {
                    priority = 11;
                } else {
                    priority = 8;
                }
            } else if (extension === '.yaml' || extension === '.yml' || extension === '.toml') {
                category = 'config';
                priority = 8;
            } else if (lowerPath.includes('.test.') || lowerPath.includes('.spec.') || 
                       lowerPath.includes('/tests/')) {
                category = 'test';
                priority = 6;
            } else if (extension === '.md' || extension === '.txt') {
                category = 'docs';
                priority = 3;
            } else if (extension === '.png' || extension === '.jpg' || extension === '.jpeg' || 
                       extension === '.gif' || extension === '.svg' || extension === '.webp' || 
                       extension === '.ico') {
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
     * Prioritizes files for Web projects
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
        
        if (extension === '.html') return 'asset';
        if (['.css', '.scss', '.sass'].includes(extension)) return 'asset';
        if (['.js', '.ts'].includes(extension)) return 'code';
        
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