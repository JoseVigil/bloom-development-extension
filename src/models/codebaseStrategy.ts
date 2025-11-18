// src/models/codebaseStrategy.ts

import * as vscode from 'vscode';
import { ProjectType, FileCategory } from './intent';

// ✅ Re-exportar FileCategory para que otros módulos puedan importarlo desde aquí
export { FileCategory };

export interface FileMetadata {
    size: number;
    type: string;
    lastModified: number;
}

export interface FileDescriptor {
    relativePath: string;
    absolutePath: string;
    category: FileCategory;
    priority: number;
    size: number;
    extension: string;
    metadata?: FileMetadata;
}

/**
 * Opciones para generar codebase
 */
export interface CodebaseGeneratorOptions {
    workspaceFolder: vscode.WorkspaceFolder;
    format: 'markdown' | 'tarball';
    includeMetadata: boolean;
    addTableOfContents: boolean;
    categorizeByType: boolean;
}

export interface CodebaseStrategy {
    name: string;
    projectType: ProjectType;
    detect(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean>;
    categorize(files: vscode.Uri[]): Promise<FileDescriptor[]>;
    prioritize(files: FileDescriptor[]): FileDescriptor[];
}

/**
 * Interface que todas las estrategias deben implementar
 */
export interface ICodebaseStrategy {
    name: string;
    projectType: ProjectType;
    
    detect(workspaceRoot: string): Promise<boolean>;
    getRelevantFiles(workspaceRoot: string, selectedFiles?: vscode.Uri[]): Promise<FileDescriptor[]>;
    categorizeFile(relativePath: string): FileCategory;
    assignPriority(file: FileDescriptor): number;
    generateIndex(files: FileDescriptor[]): string;
}

/**
 * Item de Quick Pick para selección de archivos
 */
export interface FileQuickPickItem extends vscode.QuickPickItem {
    fileDescriptor: FileDescriptor;
    manuallySelected?: boolean;
}