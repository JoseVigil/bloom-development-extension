import * as vscode from 'vscode';

// ============================================
// TIPOS BASE
// ============================================

export type IntentStatus = 'draft' | 'in-progress' | 'completed' | 'archived';

export type FileCategory = 'code' | 'config' | 'docs' | 'test' | 'asset' | 'other';

// Strategies
export type ProjectType = 
    | 'android' 
    | 'ios' 
    | 'react-web' 
    | 'web'
    | 'node'
    | 'python-flask'
    | 'php-laravel'
    | 'nucleus'        
    | 'generic';

// Workflow stages
export type IntentWorkflowStage =
    | 'draft'
    | 'intent-generated'
    | 'questions-ready'
    | 'answers-submitted'
    | 'snapshot-downloaded'
    | 'integrated';

// Question types
export type QuestionCategory =
    | 'architecture'
    | 'design'
    | 'implementation'
    | 'testing'
    | 'security';

export type QuestionPriority = 'high' | 'medium' | 'low';

export type AnswerType =
    | 'multiple-choice'
    | 'free-text'
    | 'boolean'
    | 'code-snippet';

// ============================================
// NUEVAS INTERFACES: WORKFLOW
// ============================================

export interface Question {
    id: string;
    category: QuestionCategory;
    priority: QuestionPriority;
    text: string;
    answerType: AnswerType;
    options?: string[];
    userAnswer?: string;
    metadata?: {
        rationale?: string;
        impact?: string;
    };
}

export interface IntentWorkflow {
    stage: IntentWorkflowStage;
    questions: Question[];
    questionsArtifactUrl?: string;
    snapshotPath?: string;
    integrationStatus?: 'pending' | 'in-progress' | 'success' | 'failed';
    integrationReport?: {
        filesCreated: string[];
        filesModified: string[];
        conflicts: string[];
    };
}

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
// CONTENT: Contenido del intent
// ============================================

export interface IntentContent {
    problem: string;
    expectedOutput: string;
    currentBehavior: string[];
    desiredBehavior: string[];
    considerations: string;
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

    workflow: IntentWorkflow;

    stats: {
        timesOpened: number;
        lastOpened: string | null;
        estimatedTokens: number;
    };

    bloomVersion: string;
}

// ============================================================================
// CLAUDE BRIDGE AUTOMATION: Gestión de perfiles y automatización de Claude.ai
// ============================================================================

/**
 * Configuración de profile de Chrome para un intent
 */
export interface IntentProfileConfig {
    profileName: string;              // Nombre del profile de Chrome ("Default", "Profile 1", etc.)
    provider: 'claude' | 'chatgpt' | 'grok';  // Provider principal
    account?: string;                  // Email de la cuenta (opcional)
}

/**
 * Información de conversación activa
 */
export interface ActiveConversation {
    conversationId: string;
    url: string;
    lastAccessed: Date;
}

// ============================================
// INTENT: Entidad completa
// ============================================

export interface Intent {
    folderUri: vscode.Uri;
    metadata: IntentMetadata;
    
    // Configuración de profile
    profileConfig?: IntentProfileConfig;
    
    // Conversaciones activas por provider
    activeConversations?: {
        claude?: ActiveConversation;
        chatgpt?: ActiveConversation;
        grok?: ActiveConversation;
    };
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

        workflow: {
            stage: 'draft',
            questions: [],
            integrationStatus: 'pending'
        },

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