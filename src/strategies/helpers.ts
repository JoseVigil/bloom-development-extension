// src/strategies/helpers.ts
// ✅ Helper para que las estrategias categoricen archivos correctamente

import { FileCategory } from '../models/intent';
import * as path from 'path';

/**
 * Categoriza un archivo basándose en su extensión y path
 */
export function categorizeFileByPath(relativePath: string): FileCategory {
    const ext = path.extname(relativePath).toLowerCase();
    const fileName = path.basename(relativePath).toLowerCase();
    const dirName = path.dirname(relativePath).toLowerCase();

    // Config files
    if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env', '.properties'].includes(ext)) {
        return 'config';
    }
    
    if (['package.json', 'tsconfig.json', 'webpack.config.js', 'vite.config.ts'].includes(fileName)) {
        return 'config';
    }

    // Test files
    if (dirName.includes('test') || dirName.includes('spec') || dirName.includes('__tests__')) {
        return 'test';
    }
    
    if (fileName.includes('.test.') || fileName.includes('.spec.')) {
        return 'test';
    }

    // Documentation
    if (['.md', '.txt', '.rst', '.adoc'].includes(ext)) {
        return 'docs';
    }

    // Assets
    if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'].includes(ext)) {
        return 'asset';
    }

    // Code files
    if (['.ts', '.tsx', '.js', '.jsx', '.java', '.kt', '.swift', '.py', '.rb', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.cs', '.php'].includes(ext)) {
        return 'code';
    }

    // Default
    return 'other';
}

/**
 * Asigna prioridad basándose en la categoría
 */
export function assignPriorityByCategory(category: FileCategory): number {
    const priorityMap: Record<FileCategory, number> = {
        'code': 1,
        'config': 2,
        'test': 3,
        'docs': 4,
        'asset': 5,
        'other': 6
    };
    
    return priorityMap[category] || 9;
}