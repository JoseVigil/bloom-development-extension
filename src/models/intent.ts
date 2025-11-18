import * as vscode from 'vscode';

// ============================================
// TIPOS BASE
// ============================================

export type IntentStatus = 'draft' | 'in-progress' | 'completed' | 'archived';

export type FileCategory = 'code' | 'config' | 'docs' | 'test' | 'asset' | 'other';

export type ProjectType = 'android' | 'ios' | 'web' | 'react' | 'node' | 'generic';

// ============================================
// INTERFACE PRINCIPAL: FORMULARIO
// ============================================

export interface IntentFormData {
    name: string;
    problem: string;
    expectedOutput: string;
    currentBehavior: string[];
    desiredBehavior: string[];
    considerations: string;
    selectedFiles: string[];
}

// ============================================
// METADATA: Información de archivos
// ============================================

export interface FilesMetadata {
    intentFile: string;
    codebaseFile: string;
    filesIncluded: string[];
    filesCount: number;
    totalSize: number;
}

// ============================================
// TOKENS: Estadísticas de tokens
// ============================================

export interface TokenStats {
    estimated: number;
    limit: number;
    percentage: number;
}

// ============================================
// METADATA COMPLETA: Persistencia
// ============================================

export interface IntentMetadata {
    id: string;
    name: string;
    displayName: string;
    created: string;
    updated: string;
    status: IntentStatus;
    projectType?: ProjectType;
    version: 'free' | 'pro';
    
    files: FilesMetadata;
    content: IntentContent;
    tokens: TokenStats;
    tags?: string[];
    
    stats: {
        timesOpened: number;
        lastOpened: string | null;
        estimatedTokens: number;
    };
    
    bloomVersion: string;
}

// ============================================
// INTENT: Entidad completa
// ============================================

export interface Intent {
    folderUri: vscode.Uri;
    metadata: IntentMetadata;
}

// ============================================
// HELPERS: Conversión FormData → Content
// ============================================

export function formDataToContent(formData: IntentFormData): IntentContent {
    return {
        problem: formData.problem,
        expectedOutput: formData.expectedOutput,
        currentBehavior: formData.currentBehavior,
        desiredBehavior: formData.desiredBehavior,
        considerations: formData.considerations
    };
}

// ============================================
// HELPERS: Crear metadata inicial
// ============================================

export function createInitialMetadata(
    formData: IntentFormData,
    options: {
        projectType?: ProjectType;
        version: 'free' | 'pro';
        filesCount: number;
        totalSize: number;
        estimatedTokens: number;
    }
): Omit<IntentMetadata, 'id' | 'created' | 'updated'> {
    const now = new Date().toISOString();
    
    return {
        name: formData.name,
        displayName: generateDisplayName(formData.name),
        status: 'draft',
        projectType: options.projectType,
        version: options.version,
        
        files: {
            intentFile: 'intent.bl',
            codebaseFile: options.version === 'free' ? 'codebase.md' : 'codebase.tar.gz',
            filesIncluded: formData.selectedFiles,
            filesCount: options.filesCount,
            totalSize: options.totalSize
        },
        
        content: formDataToContent(formData),
        
        tokens: {
            estimated: options.estimatedTokens,
            limit: 100000,
            percentage: (options.estimatedTokens / 100000) * 100
        },
        
        tags: [],
        
        stats: {
            timesOpened: 0,
            lastOpened: null,
            estimatedTokens: options.estimatedTokens
        },
        
        bloomVersion: '1.0.0'
    };
}

function generateDisplayName(name: string): string {
    return name
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}

// ============================================
// TOKEN ESTIMATOR: Análisis de payload
// ============================================

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

export interface PayloadAnalysis {
    totalChars: number;
    estimatedTokens: number;
    limits: Record<string, ModelLimit>;
    recommendations: Recommendation[];
}