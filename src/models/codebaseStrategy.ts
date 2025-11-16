// src/models/codebaseStrategy.ts

import * as vscode from 'vscode';
import { ProjectType } from './intent';

/**
 * Descriptor completo de un archivo
 */
export interface FileDescriptor {
    absolutePath: string;
    relativePath: string;
    category: FileCategory;
    priority: number;
    size: number;
    extension: string;
    metadata?: FileMetadata; // AGREGADO para línea 101
}

/**
 * Metadata adicional de archivos
 */
export interface FileMetadata {
    createdAt?: Date;
    modifiedAt?: Date;
    author?: string;
    lines?: number;
    [key: string]: any; // Permite propiedades adicionales
}

/**
 * Categorías de archivos
 */
export enum FileCategory {
    MANIFEST = 'Manifest',
    BUILD_CONFIG = 'Build Configuration',
    GRADLE = 'Gradle',
    PACKAGE_JSON = 'Package Configuration',
    SOURCE_CODE = 'Source Code',
    COMPONENT = 'Component',
    SERVICE = 'Service',
    MODEL = 'Model',
    CONTROLLER = 'Controller',
    RESOURCE = 'Resource',
    LAYOUT = 'Layout',
    STYLE = 'Style',
    NAVIGATION = 'Navigation',
    DEPENDENCY = 'Dependency',
    TEST = 'Test',
    ASSET = 'Asset',
    DOCUMENTATION = 'Documentation',
    CONFIGURATION = 'Configuration',
    OTHER = 'Other'
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
 * Opciones para generar codebase
 */
export interface CodebaseGeneratorOptions {
    format: 'markdown' | 'tarball';
    projectType?: ProjectType;
    strategy?: ICodebaseStrategy;
    workspaceFolder: vscode.WorkspaceFolder;
    includeTests?: boolean;
    maxFileSize?: number;
    includeMetadata?: boolean;        // Línea 38, 101
    addTableOfContents?: boolean;     // Línea 52
    categorizeByType?: boolean;       // Línea 58
}

/**
 * Item de Quick Pick para selección de archivos
 */
export interface FileQuickPickItem extends vscode.QuickPickItem {
    fileDescriptor: FileDescriptor;
    manuallySelected?: boolean;
}