// src/core/gitOrchestrator.ts - MIGRATED to BrainExecutor
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GitExecutor } from '../utils/gitExecutor';
import { GitManager } from '../utils/gitManager';
import { WorkspaceManager } from '../managers/workspaceManager';
import { BrainExecutor } from '../utils/brainExecutor';

export interface NucleusStatus {
    exists: boolean;
    location: 'local' | 'remote' | 'both' | 'none';
    localPath?: string;
    remoteUrl?: string;
    hasValidStructure?: boolean;
    conflictDetected?: boolean;
}

export interface NucleusResult {
    success: boolean;
    nucleusPath: string;
    action: 'created' | 'cloned' | 'linked';
    message: string;
    error?: string;
}

export class GitOrchestrator {
    /**
     * Detecta el estado de un Nucleus (local, remoto o ambos)
     * AHORA USA GitExecutor
     */
    static async detectNucleusStatus(
        org: string,
        parentPath: string
    ): Promise<NucleusStatus> {
        const nucleusName = `nucleus-${org}`;
        const localPath = path.join(parentPath, nucleusName);
        const remoteUrl = `https://github.com/${org}/${nucleusName}.git`;

        console.log(`[GitOrchestrator] Detecting status for ${nucleusName}`);

        // 1. Verificar existencia local
        const localExists = fs.existsSync(localPath);
        
        // 2. Verificar existencia remota
        let remoteExists = false;
        try {
            const response = await fetch(`https://api.github.com/repos/${org}/${nucleusName}`);
            remoteExists = response.ok;
        } catch (error) {
            console.warn('[GitOrchestrator] Could not check remote:', error);
        }

        // 3. Determinar ubicación
        let location: 'local' | 'remote' | 'both' | 'none';
        if (localExists && remoteExists) {
            location = 'both';
        } else if (localExists) {
            location = 'local';
        } else if (remoteExists) {
            location = 'remote';
        } else {
            location = 'none';
        }

        // 4. Validar estructura si existe local
        let hasValidStructure = false;
        if (localExists) {
            hasValidStructure = this.validateBloomStructure(localPath);
        }

        console.log(`[GitOrchestrator] Status detected:`, {
            location,
            localExists,
            remoteExists,
            hasValidStructure
        });

        return {
            exists: localExists || remoteExists,
            location,
            localPath: localExists ? localPath : undefined,
            remoteUrl: remoteExists ? remoteUrl : undefined,
            hasValidStructure,
            conflictDetected: false
        };
    }

    /**
     * Crea un nuevo Nucleus desde cero
     * ✅ MIGRATED: Uses BrainExecutor.generateNucleusStructure()
     */
    static async createNucleus(
        org: string,
        parentPath: string,
        githubToken: string,
        context: vscode.ExtensionContext,  
        logger: any                        
    ): Promise<NucleusResult> {
        const nucleusName = `nucleus-${org}`;
        const nucleusPath = path.join(parentPath, nucleusName);
        const repoUrl = `https://github.com/${org}/${nucleusName}.git`;

        try {
            console.log(`[GitOrchestrator] Creating Nucleus: ${nucleusName}`);

            // 1. Crear directorio
            if (!fs.existsSync(nucleusPath)) {
                fs.mkdirSync(nucleusPath, { recursive: true });
            }

            // 2. Inicializar Git usando GitExecutor
            console.log('[GitOrchestrator] Initializing git repository');
            await GitExecutor.init(nucleusPath);

            // 3. Crear repositorio en GitHub
            console.log('[GitOrchestrator] Creating GitHub repository');
            const createResponse = await fetch('https://api.github.com/user/repos', {
                method: 'POST',
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/vnd.github.v3+json'
                },
                body: JSON.stringify({
                    name: nucleusName,
                    description: `Nucleus for ${org} organization`,
                    private: false,
                    auto_init: false
                })
            });

            if (!createResponse.ok) {
                const error = await createResponse.json();
                const errorMsg = typeof error === 'object' && error !== null && 'message' in error 
                    ? String(error.message) 
                    : JSON.stringify(error);
                throw new Error(`GitHub API error: ${errorMsg}`);
            }

            // 4. Agregar remote origin usando GitExecutor
            console.log('[GitOrchestrator] Adding remote origin');
            await GitExecutor.addRemote(nucleusPath, repoUrl);

            // 5. ✅ MIGRATED: Ejecutar Brain CLI para generar estructura
            console.log('[GitOrchestrator] Generating Nucleus structure via Brain CLI');
            const structureResult = await BrainExecutor.generateNucleusStructure(
                nucleusPath,
                org,
                {
                    url: repoUrl,
                    force: false,
                    onProgress: (line) => {
                        console.log(`[Brain] ${line}`);
                        if (logger) {
                            logger.info(line);
                        }
                    }
                }
            );

            if (structureResult.status !== 'success') {
                throw new Error(`Failed to generate Nucleus structure: ${structureResult.error || structureResult.message}`);
            }

            // 6. Inicializar workspace file DENTRO del Nucleus
            console.log('[GitOrchestrator] Creating workspace file');
            const workspaceFilePath = await WorkspaceManager.initializeWorkspace(
                nucleusPath,
                org
            );

            // 7. Stage cambios usando GitManager (universal)
            console.log('[GitOrchestrator] Staging changes');
            await GitManager.stageAndOpenSCM(
                nucleusPath,
                undefined,
                `Initial commit for ${nucleusName}`
            );

            // 8. Ofrecer abrir workspace
            await this.promptOpenWorkspace(workspaceFilePath, org);

            return {
                success: true,
                nucleusPath,
                action: 'created',
                message: `✅ Nucleus creado: ${nucleusName}`
            };

        } catch (error: any) {
            console.error('[GitOrchestrator] Error creating Nucleus:', error);
            return {
                success: false,
                nucleusPath,
                action: 'created',
                message: `❌ Error creando Nucleus`,
                error: error.message
            };
        }
    }

    /**
     * Clona un Nucleus existente desde GitHub
     * ✅ MIGRATED: Uses BrainExecutor.generateNucleusStructure()
     */
    static async cloneNucleus(
        org: string,
        parentPath: string
    ): Promise<NucleusResult> {
        const nucleusName = `nucleus-${org}`;
        const nucleusPath = path.join(parentPath, nucleusName);
        const repoUrl = `https://github.com/${org}/${nucleusName}.git`;

        try {
            console.log(`[GitOrchestrator] Cloning Nucleus: ${nucleusName}`);

            // Progress handler
            const progressHandler = (data: string) => {
                console.log(`[Git Clone] ${data}`);
            };

            // Clonar usando GitExecutor
            await GitExecutor.clone(repoUrl, nucleusPath, progressHandler);

            // Verificar estructura
            const hasValidStructure = this.validateBloomStructure(nucleusPath);

            if (!hasValidStructure) {
                console.log('[GitOrchestrator] Structure incomplete, completing via Brain CLI...');
                
                // ✅ MIGRATED: Completar estructura con Brain CLI
                const structureResult = await BrainExecutor.generateNucleusStructure(
                    nucleusPath,
                    org,
                    {
                        skipExisting: true,
                        onProgress: (line) => console.log(`[Brain] ${line}`)
                    }
                );

                if (structureResult.status !== 'success') {
                    console.warn('[GitOrchestrator] Failed to complete structure:', structureResult.error);
                }

                // Stage cambios si se completó la estructura
                await GitManager.stageAndOpenSCM(
                    nucleusPath,
                    undefined,
                    'Complete Nucleus structure'
                );
            }

            // Verificar workspace file
            if (!WorkspaceManager.hasWorkspaceFile(nucleusPath, org)) {
                console.log('[GitOrchestrator] Creating workspace file');
                await WorkspaceManager.initializeWorkspace(nucleusPath, org);
            }

            const workspaceFilePath = WorkspaceManager.getWorkspaceFilePath(nucleusPath, org);
            await this.promptOpenWorkspace(workspaceFilePath, org);

            return {
                success: true,
                nucleusPath,
                action: 'cloned',
                message: `✅ Nucleus clonado: ${nucleusName}`
            };

        } catch (error: any) {
            console.error('[GitOrchestrator] Error cloning Nucleus:', error);
            return {
                success: false,
                nucleusPath,
                action: 'cloned',
                message: `❌ Error clonando Nucleus`,
                error: error.message
            };
        }
    }

    /**
     * Vincula un Nucleus existente local con GitHub
     * ✅ MIGRATED: Uses BrainExecutor.generateNucleusStructure()
     */
    static async linkNucleus(
        localPath: string,
        org: string
    ): Promise<NucleusResult> {
        try {
            console.log(`[GitOrchestrator] Linking Nucleus at: ${localPath}`);

            const nucleusName = path.basename(localPath);
            const repoUrl = `https://github.com/${org}/${nucleusName}.git`;

            // Verificar que es un repo git
            const isRepo = await GitExecutor.isGitRepository(localPath);
            
            if (!isRepo) {
                console.log('[GitOrchestrator] Not a git repo, initializing...');
                await GitExecutor.init(localPath);
            }

            // Verificar remote origin
            const hasRemote = await GitExecutor.hasRemote(localPath, 'origin');
            
            if (!hasRemote) {
                console.log('[GitOrchestrator] Adding remote origin');
                await GitExecutor.addRemote(localPath, repoUrl);
            } else {
                const currentRemote = await GitExecutor.getRemoteUrl(localPath, 'origin');
                if (currentRemote !== repoUrl) {
                    console.warn('[GitOrchestrator] Remote URL mismatch!');
                    // Aquí podrías ofrecer actualizar el remote
                }
            }

            // Completar estructura si falta
            const hasValidStructure = this.validateBloomStructure(localPath);
            if (!hasValidStructure) {
                console.log('[GitOrchestrator] Completing structure via Brain CLI...');
                
                // ✅ MIGRATED: Completar estructura con Brain CLI
                const structureResult = await BrainExecutor.generateNucleusStructure(
                    localPath,
                    org,
                    {
                        skipExisting: true,
                        onProgress: (line) => console.log(`[Brain] ${line}`)
                    }
                );

                if (structureResult.status !== 'success') {
                    console.warn('[GitOrchestrator] Failed to complete structure:', structureResult.error);
                }
            }

            // Verificar workspace file
            if (!WorkspaceManager.hasWorkspaceFile(localPath, org)) {
                await WorkspaceManager.initializeWorkspace(localPath, org);
            }

            // Stage cambios si los hay
            await GitManager.stageAndOpenSCM(
                localPath,
                undefined,
                'Link Nucleus to GitHub'
            );

            return {
                success: true,
                nucleusPath: localPath,
                action: 'linked',
                message: `✅ Nucleus vinculado: ${nucleusName}`
            };

        } catch (error: any) {
            console.error('[GitOrchestrator] Error linking Nucleus:', error);
            return {
                success: false,
                nucleusPath: localPath,
                action: 'linked',
                message: `❌ Error vinculando Nucleus`,
                error: error.message
            };
        }
    }

    /**
     * Valida estructura .bloom/
     */
    private static validateBloomStructure(nucleusPath: string): boolean {
        const requiredPaths = [
            '.bloom',
            '.bloom/core',
            '.bloom/core/nucleus-config.json',
            '.bloom/organization',
            '.bloom/projects'
        ];

        return requiredPaths.every(p => 
            fs.existsSync(path.join(nucleusPath, p))
        );
    }

    /**
     * Ofrece abrir el workspace
     */
    private static async promptOpenWorkspace(
        workspaceFilePath: string,
        orgName: string
    ): Promise<void> {
        const action = await vscode.window.showInformationMessage(
            `✅ Nucleus listo para ${orgName}`,
            {
                modal: false,
                detail: 'Tu Nucleus está configurado. ¿Querés abrir el workspace?'
            },
            'Abrir Workspace',
            'Más Tarde'
        );

        if (action === 'Abrir Workspace') {
            await WorkspaceManager.openWorkspace(workspaceFilePath);
        }
    }
}