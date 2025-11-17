// src/models/intent.ts

import * as vscode from 'vscode';

/**
 * Metadata completa de un intent
 * Almacenada en .bloom/intents/[nombre]/.bloom-meta.json
 */
export interface IntentMetadata {
    id: string;
    name: string;
    displayName?: string;
    created: string;
    updated: string;
    status: IntentStatus;
    tags?: string[];
    description?: string;
    projectType?: ProjectType;
    version: 'free' | 'pro';
    files: {
        intentFile: string;
        codebaseFile: string;
        filesIncluded: string[];
        filesCount: number;
        totalSize: number;
    };
    stats: {
        timesOpened: number;
        lastOpened: string | null;
        estimatedTokens: number;
    };
    bloomVersion: string;
}

/**
 * Estados posibles de un intent
 */
export type IntentStatus = 'draft' | 'in-progress' | 'completed' | 'archived';

/**
 * Tipos de proyecto soportados
 */
export type ProjectType = 'android' | 'ios' | 'web' | 'react' | 'react-native' | 'flutter' | 'nodejs' | 'python' | 'generic';

/**
 * Intent completo (metadata + ubicación)
 */
export interface Intent {
    metadata: IntentMetadata;
    folderUri: vscode.Uri;
}

/**
 * Datos del formulario de intent
 */
export interface IntentFormData {
    name: string;
    problem: string;
    context: string;
    currentBehavior: string[];
    desiredBehavior: string[];
    objective: string;
    scope: string[];
    considerations: string;
    tests: string[];
    expectedOutput: string;
}

/**
 * Opciones para crear un intent
 */
export interface CreateIntentOptions {
    workspaceFolder: vscode.WorkspaceFolder;
    selectedFiles: vscode.Uri[];
    relativePaths: string[];
    projectType?: ProjectType;
    strategy?: any; // ICodebaseStrategy (se define en otro archivo)
}

/**
 * Resultado de análisis de payload (para FREE MODE)
 */
export interface PayloadAnalysis {
    totalChars: number;
    estimatedTokens: number;
    limits: Record<string, ModelLimit>;
    recommendations: Recommendation[];
}

export interface ModelLimit {
    modelName: string;
    contextWindow: number;
    reserved: number;
    available: number;
    used: number;
    remaining: number;
    usagePercent: number;
    status: 'safe' | 'warning' | 'critical';
}

export interface Recommendation {
    severity: 'ok' | 'warning' | 'critical';
    model: string;
    message: string;
}