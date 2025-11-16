// src/models/contextLayer.ts

/**
 * Capa de contexto en la jerarquía piramidal
 */
export interface ContextLayer {
    type: 'core' | 'project';
    files: ContextFile[];
}

/**
 * Archivo individual de contexto
 */
export interface ContextFile {
    path: string;
    content: string;
    type: 'rules' | 'standards' | 'context';
}

/**
 * Contexto piramidal completo (todos los niveles)
 */
export interface PyramidalContext {
    coreRules?: string;
    coreStandards?: string;
    globalProjectContext?: string;
    localProjectContext?: string;
}

/**
 * Opciones para recopilar contexto
 */
export interface GatherContextOptions {
    includeCore?: boolean;
    includeGlobal?: boolean;
    includeLocal?: boolean;
    maxDepth?: number;
}