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

export class AndroidStrategy implements ICodebaseStrategy {
    name = 'Android';
    projectType: ProjectType = 'android';
    
    async detect(workspaceRoot: string): Promise<boolean> {
        const indicators = [
            'build.gradle',
            'settings.gradle',
            'app/build.gradle',
            'gradlew'
        ];
        
        for (const indicator of indicators) {
            if (await fileExists(path.join(workspaceRoot, indicator))) {
                return true;
            }
        }
        return false;
    }
    
    async getRelevantFiles(workspaceRoot: string, selectedFiles?: vscode.Uri[]): Promise<FileDescriptor[]> {
        const patterns = this.getSearchPatterns();
        const excludePatterns = this.getExcludePatterns();
        
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
        
        if (fileName === 'AndroidManifest.xml') return FileCategory.MANIFEST;
        if (fileName === 'build.gradle' || fileName === 'settings.gradle') return FileCategory.BUILD_CONFIG;
        if (lowerPath.includes('/res/layout/')) return FileCategory.LAYOUT;
        if (lowerPath.includes('/res/navigation/')) return FileCategory.NAVIGATION;
        if (lowerPath.includes('/res/values/') || lowerPath.includes('/res/drawable/')) return FileCategory.RESOURCE;
        
        if (relativePath.match(/\.(kt|java)$/)) {
            if (lowerPath.includes('viewmodel')) return FileCategory.MODEL;
            if (lowerPath.includes('repository') || lowerPath.includes('service')) return FileCategory.SERVICE;
            if (lowerPath.includes('activity') || lowerPath.includes('fragment')) return FileCategory.COMPONENT;
            return FileCategory.SOURCE_CODE;
        }
        
        if (lowerPath.includes('/test/') || lowerPath.includes('/androidtest/')) return FileCategory.TEST;
        
        return FileCategory.OTHER;
    }
    
    assignPriority(file: FileDescriptor): number {
        const priorityMap: Partial<Record<FileCategory, number>> = {
            [FileCategory.MANIFEST]: 1,
            [FileCategory.BUILD_CONFIG]: 1,
            [FileCategory.GRADLE]: 1,
            [FileCategory.RESOURCE]: 2,
            [FileCategory.COMPONENT]: 3,
            [FileCategory.MODEL]: 3,
            [FileCategory.SERVICE]: 3,
            [FileCategory.SOURCE_CODE]: 3,
            [FileCategory.LAYOUT]: 4,
            [FileCategory.NAVIGATION]: 4,
            [FileCategory.STYLE]: 4,
            [FileCategory.TEST]: 5,
            [FileCategory.ASSET]: 6,
            [FileCategory.DOCUMENTATION]: 7
        };
        
        return priorityMap[file.category] || 9;
    }
    
    generateIndex(files: FileDescriptor[]): string {
        const grouped = this.groupByCategory(files);
        let index = '## 📋 Project Structure\n\n';
        
        for (const [category, categoryFiles] of grouped) {
            const icon = this.getCategoryIcon(category);
            index += `### ${icon} ${category} (${categoryFiles.length})\n`;
            
            for (const file of categoryFiles) {
                index += `- ${file.relativePath}\n`;
            }
            index += '\n';
        }
        
        return index;
    }
    
    private groupByCategory(files: FileDescriptor[]): Map<FileCategory, FileDescriptor[]> {
        const grouped = new Map<FileCategory, FileDescriptor[]>();
        
        for (const file of files) {
            if (!grouped.has(file.category)) {
                grouped.set(file.category, []);
            }
            grouped.get(file.category)!.push(file);
        }
        
        return grouped;
    }
    
    private getCategoryIcon(category: FileCategory): string {
        const icons: Partial<Record<FileCategory, string>> = {
            [FileCategory.MANIFEST]: '📋',
            [FileCategory.BUILD_CONFIG]: '🔧',
            [FileCategory.GRADLE]: '⚙️',
            [FileCategory.SOURCE_CODE]: '📱',
            [FileCategory.COMPONENT]: '🧩',
            [FileCategory.SERVICE]: '🔌',
            [FileCategory.MODEL]: '📦',
            [FileCategory.LAYOUT]: '🎨',
            [FileCategory.RESOURCE]: '🖼️',
            [FileCategory.NAVIGATION]: '🧭',
            [FileCategory.TEST]: '🧪',
            [FileCategory.DOCUMENTATION]: '📚'
        };
        
        return icons[category] || '📄';
    }
    
    private getSearchPatterns(): string[] {
        return [
            'build.gradle',
            'settings.gradle',
            'app/build.gradle',
            'app/src/main/AndroidManifest.xml',
            'gradle.properties',
            'app/src/main/res/values/strings.xml',
            'app/src/main/java/**/*.kt',
            'app/src/main/java/**/*.java',
            'app/src/main/res/layout/**/*.xml'
        ];
    }
    
    private getExcludePatterns(): string[] {
        return [
            '**/build/**',
            '**/.gradle/**',
            '**/.idea/**',
            '**/local.properties',
            '**/*.iml'
        ];
    }
    
    private async createFileDescriptor(fileUri: vscode.Uri, workspaceRoot: string): Promise<FileDescriptor> {
        const relativePath = path.relative(workspaceRoot, fileUri.fsPath);
        const stat = await vscode.workspace.fs.stat(fileUri);
        const extension = path.extname(fileUri.fsPath);
        const category = this.categorizeFile(relativePath);
        
        const descriptor: FileDescriptor = {
            absolutePath: fileUri.fsPath,
            relativePath: relativePath,
            category: category,
            priority: 0,
            size: stat.size,
            extension: extension
        };
        
        descriptor.priority = this.assignPriority(descriptor);
        return descriptor;
    }
    
}