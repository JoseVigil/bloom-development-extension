// src/strategies/AndroidStrategy.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { ICodebaseStrategy, FileDescriptor } from '../models/codebaseStrategy';
import { ProjectType, FileCategory } from '../models/intent';

export class AndroidStrategy implements ICodebaseStrategy {
    name = 'Android';
    projectType: ProjectType = 'android';

    async detect(workspaceRoot: string): Promise<boolean> {
        const buildGradle = path.join(workspaceRoot, 'build.gradle');
        const settingsGradle = path.join(workspaceRoot, 'settings.gradle');
        const androidManifest = path.join(workspaceRoot, 'app', 'src', 'main', 'AndroidManifest.xml');

        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(buildGradle));
            return true;
        } catch {}

        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(androidManifest));
            return true;
        } catch {}

        return false;
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

        // ✅ CORREGIDO: Usar string literals en lugar de enum
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
        // ✅ CORREGIDO: Usar string literals
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

    prioritize(files: FileDescriptor[]): FileDescriptor[] {
        return files
            .map(file => ({
                ...file,
                priority: this.assignPriority(file)
            }))
            .sort((a, b) => {
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }
                return a.relativePath.localeCompare(b.relativePath);
            });
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

        // ✅ CORREGIDO: Mapeo simplificado
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