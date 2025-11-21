// src/strategies/AndroidStrategy.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileDescriptor, FileCategory } from '../models/codebaseStrategy';
import { ProjectType } from '../models/intent.js';
import { CodebaseStrategy } from '../models/codebaseStrategy';

export class AndroidStrategy implements CodebaseStrategy {
    name = 'Android';
    projectType: ProjectType = 'android';

    /**
     * Detects if the workspace is an Android project
     */
    async detect(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
        const projectRoot = workspaceFolder.uri.fsPath;
        
        // Check for build.gradle in app/
        const appBuildGradle = path.join(projectRoot, 'app', 'build.gradle');
        const appBuildGradleKts = path.join(projectRoot, 'app', 'build.gradle.kts');
        
        if (fs.existsSync(appBuildGradle) || fs.existsSync(appBuildGradleKts)) {
            return true;
        }
        
        // Check for AndroidManifest.xml
        const manifest = path.join(projectRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
        if (fs.existsSync(manifest)) {
            return true;
        }
        
        // Check for settings.gradle
        const settingsGradle = path.join(projectRoot, 'settings.gradle');
        if (fs.existsSync(settingsGradle)) {
            return true;
        }
        
        return false;
    }

    /**
     * Categorizes files for Android projects
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
            
            let category: FileCategory = 'code';
            let priority = 5;
            
            // Android-specific categorization
            if (extension === '.kt' || extension === '.java') {
                category = 'code';
                priority = 10;
                
                // Boost priority for key Android files
                if (relativePath.includes('MainActivity') || relativePath.includes('Application')) {
                    priority = 12;
                } else if (relativePath.includes('ViewModel') || relativePath.includes('Repository')) {
                    priority = 11;
                }
            } else if (extension === '.xml') {
                if (relativePath.includes('/layout/')) {
                    category = 'asset';
                    priority = 9;
                } else if (relativePath.includes('/res/values/')) {
                    category = 'config';
                    priority = 7;
                } else if (relativePath.includes('AndroidManifest.xml')) {
                    category = 'config';
                    priority = 12;
                } else if (relativePath.includes('/res/')) {
                    category = 'asset';
                    priority = 6;
                }
            } else if (extension === '.gradle' || extension === '.kts') {
                category = 'config';
                priority = 11;
            } else if (extension === '.json' || extension === '.properties') {
                category = 'config';
                priority = 8;
            } else if (relativePath.includes('/test/') || relativePath.includes('/androidTest/')) {
                category = 'test';
                priority = 6;
            } else if (extension === '.png' || extension === '.jpg' || extension === '.webp' || 
                       relativePath.includes('/drawable/') || relativePath.includes('/mipmap/')) {
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
     * Prioritizes files for Android projects
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
        if (selectedFiles) {
            return this.processSelectedFiles(workspaceRoot, selectedFiles);
        }
        
        return this.discoverFiles(workspaceRoot);
    }

    private async processSelectedFiles(workspaceRoot: string, files: vscode.Uri[]): Promise<FileDescriptor[]> {
        const descriptors: FileDescriptor[] = [];

        for (const file of files) {
            const stat = await vscode.workspace.fs.stat(file);
            const relativePath = path.relative(workspaceRoot, file.fsPath);
            const category = this.categorizeFile(relativePath);

            descriptors.push({
                relativePath,
                absolutePath: file.fsPath,
                category,
                priority: 0,
                size: stat.size,
                extension: path.extname(relativePath),
                metadata: {
                    size: stat.size,
                    type: path.extname(relativePath),
                    lastModified: stat.mtime
                }
            });
        }

        return this.prioritize(descriptors);
    }

    private async discoverFiles(workspaceRoot: string): Promise<FileDescriptor[]> {
        return [];
    }

    categorizeFile(relativePath: string): FileCategory {
        const fileName = path.basename(relativePath);
        const lowerPath = relativePath.toLowerCase();

        if (fileName === 'AndroidManifest.xml') return 'config';
        if (fileName === 'build.gradle' || fileName === 'settings.gradle') return 'config';
        if (lowerPath.includes('/res/layout/')) return 'asset';
        if (lowerPath.includes('/res/navigation/')) return 'asset';
        if (lowerPath.includes('/res/values/') || lowerPath.includes('/res/drawable/')) return 'asset';
        
        if (lowerPath.endsWith('.kt') || lowerPath.endsWith('.java')) {
            if (lowerPath.includes('viewmodel')) return 'code';
            if (lowerPath.includes('repository') || lowerPath.includes('service')) return 'code';
            if (lowerPath.includes('activity') || lowerPath.includes('fragment')) return 'code';
            return 'code';
        }

        if (lowerPath.includes('/test/') || lowerPath.includes('/androidtest/')) return 'test';

        return 'other';
    }

    assignPriority(file: FileDescriptor): number {
        const priorityMap: Partial<Record<FileCategory, number>> = {
            'config': 1,
            'code': 2,
            'test': 3,
            'docs': 4,
            'asset': 5,
            'other': 6
        };
        
        return priorityMap[file.category] || 9;
    }

    generateIndex(files: FileDescriptor[]): string {
        const grouped = new Map<FileCategory, FileDescriptor[]>();

        for (const file of files) {
            if (!grouped.has(file.category)) {
                grouped.set(file.category, []);
            }
            grouped.get(file.category)!.push(file);
        }

        let index = '# Android Project Structure\n\n';

        const categoryIcons: Partial<Record<FileCategory, string>> = {
            'config': '⚙️',
            'code': '📱',
            'test': '🧪',
            'docs': '📚',
            'asset': '🖼️',
            'other': '📄'
        };

        for (const [category, categoryFiles] of grouped) {
            const icon = categoryIcons[category] || '📄';
            index += `\n## ${icon} ${category}\n\n`;
            for (const file of categoryFiles) {
                index += `- ${file.relativePath}\n`;
            }
        }

        return index;
    }
}