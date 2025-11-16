// src/core/contextGatherer.ts

import * as vscode from 'vscode';
import * as path from 'path';
import { PyramidalContext, ContextLayer, ContextFile } from '../models/contextLayer';
import { Logger } from '../utils/logger';
import * as fs from 'fs';

export class ContextGatherer {
    constructor(private logger: Logger) {}

    /**
     * Recopila todo el contexto piramidal desde el proyecto actual hacia arriba
     */
    async gatherPyramidalContext(projectRoot: string): Promise<PyramidalContext> {
        this.logger.info(`Recopilando contexto piramidal desde: ${projectRoot}`);
        
        const layers = await this.traverseHierarchy(projectRoot);
        
        return this.buildPyramidalContext(layers);
    }

    /**
     * Traversa la jerarquía de directorios buscando carpetas .bloom
     */
    private async traverseHierarchy(startDir: string): Promise<ContextLayer[]> {
        const layers: ContextLayer[] = [];
        const visitedDirs = new Set<string>();
        let currentDir = startDir;

        while (currentDir !== path.parse(currentDir).root) {
            if (visitedDirs.has(currentDir)) break;
            visitedDirs.add(currentDir);

            const bloomDir = path.join(currentDir, '.bloom');
            
            if (fs.existsSync(bloomDir)) {
                // Core files (solo del nivel más alto)
                if (layers.length === 0) {
                    const coreLayer = await this.readCoreFiles(bloomDir);
                    if (coreLayer) {
                        layers.push(coreLayer);
                        this.logger.info(`Core context encontrado en: ${bloomDir}`);
                    }
                }

                // Project context (de todos los niveles)
                const projectLayer = await this.readProjectContext(bloomDir);
                if (projectLayer) {
                    layers.push(projectLayer);
                    this.logger.info(`Project context encontrado en: ${bloomDir}`);
                }
            }

            currentDir = path.dirname(currentDir);
        }

        // Invertir para que el contexto global esté primero
        return layers.reverse();
    }

    /**
     * Lee archivos core (.rules.bl, .standards.bl)
     */
    private async readCoreFiles(bloomDir: string): Promise<ContextLayer | null> {
        const coreDir = path.join(bloomDir, 'core');
        if (!fs.existsSync(coreDir)) return null;

        const files: ContextFile[] = [];

        // .rules.bl
        const rulesFile = path.join(coreDir, '.rules.bl');
        if (fs.existsSync(rulesFile)) {
            files.push({
                path: rulesFile,
                content: fs.readFileSync(rulesFile, 'utf8'),
                type: 'rules'
            });
        }

        // .standards.bl
        const standardsFile = path.join(coreDir, '.standards.bl');
        if (fs.existsSync(standardsFile)) {
            files.push({
                path: standardsFile,
                content: fs.readFileSync(standardsFile, 'utf8'),
                type: 'standards'
            });
        }

        return files.length > 0 ? { type: 'core', files } : null;
    }

    /**
     * Lee contexto de proyecto (.context.bl)
     */
    private async readProjectContext(bloomDir: string): Promise<ContextLayer | null> {
        const contextFile = path.join(bloomDir, 'project', '.context.bl');
        if (!fs.existsSync(contextFile)) return null;

        return {
            type: 'project',
            files: [{
                path: contextFile,
                content: fs.readFileSync(contextFile, 'utf8'),
                type: 'context'
            }]
        };
    }

    /**
     * Construye objeto PyramidalContext desde las capas
     */
    private buildPyramidalContext(layers: ContextLayer[]): PyramidalContext {
        const context: PyramidalContext = {};
        const projectContexts: string[] = [];

        for (const layer of layers) {
            if (layer.type === 'core') {
                for (const file of layer.files) {
                    if (file.type === 'rules') {
                        context.coreRules = file.content;
                    } else if (file.type === 'standards') {
                        context.coreStandards = file.content;
                    }
                }
            } else if (layer.type === 'project') {
                projectContexts.push(layer.files[0].content);
            }
        }

        // Primer project context es global, último es local
        if (projectContexts.length > 0) {
            context.globalProjectContext = projectContexts[0];
            if (projectContexts.length > 1) {
                context.localProjectContext = projectContexts[projectContexts.length - 1];
            }
        }

        return context;
    }

    /**
     * Genera markdown concatenado de todo el contexto
     */
    buildContextMarkdown(context: PyramidalContext): string {
        let markdown = '# CONTEXTO BASE DEL PROYECTO\n\n';

        if (context.coreRules) {
            markdown += '## Reglas de Código\n\n';
            markdown += context.coreRules;
            markdown += '\n\n---\n\n';
        }

        if (context.coreStandards) {
            markdown += '## Estándares del Proyecto\n\n';
            markdown += context.coreStandards;
            markdown += '\n\n---\n\n';
        }

        if (context.globalProjectContext) {
            markdown += '## Contexto Global\n\n';
            markdown += context.globalProjectContext;
            markdown += '\n\n---\n\n';
        }

        if (context.localProjectContext) {
            markdown += '## Contexto del Proyecto Actual\n\n';
            markdown += context.localProjectContext;
            markdown += '\n\n---\n\n';
        }

        return markdown;
    }
}