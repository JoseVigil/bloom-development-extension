// src/managers/workspaceManager.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface WorkspaceFolder {
    name: string;
    path: string;
}

interface WorkspaceConfig {
    folders: WorkspaceFolder[];
    settings: {
        'bloom.activeNucleus'?: string;
        [key: string]: any;
    };
    extensions?: {
        recommendations: string[];
    };
}

export class WorkspaceManager {
    /**
     * Inicializa workspace al crear Nucleus por primera vez
     * Crea archivo .code-workspace en el parent folder
     */
    static async initializeWorkspace(nucleusPath: string): Promise<void> {
        const nucleusName = path.basename(nucleusPath);
        const parentFolder = path.dirname(nucleusPath);
        const orgName = nucleusName.replace('nucleus-', '');
        const workspaceFilePath = path.join(parentFolder, `${orgName}-workspace.code-workspace`);

        // Verificar si ya existe workspace
        if (fs.existsSync(workspaceFilePath)) {
            console.log(`Workspace file already exists: ${workspaceFilePath}`);
            return;
        }

        // Crear configuración inicial del workspace
        const workspaceConfig: WorkspaceConfig = {
            folders: [
                {
                    name: `🏢 ${nucleusName}`,
                    path: `./${nucleusName}`
                }
            ],
            settings: {                
                'bloom.activeNucleus': nucleusName,
                'window.title': `${orgName} Workspace`,
                'files.exclude': {
                    '**/.git': true,
                    '**/.DS_Store': true,
                    '**/node_modules': true
                }
            },
            extensions: {
                recommendations: ['bloom.bloom-btip-plugin']
            }
        };

        // Guardar archivo .code-workspace
        fs.writeFileSync(
            workspaceFilePath,
            JSON.stringify(workspaceConfig, null, 2),
            'utf-8'
        );

        console.log(`✅ Workspace file created: ${workspaceFilePath}`);

        // Ofrecer abrir el workspace
        const openWorkspace = await vscode.window.showInformationMessage(
            `Workspace creado: ${path.basename(workspaceFilePath)}`,
            'Abrir Workspace',
            'Más Tarde'
        );

        if (openWorkspace === 'Abrir Workspace') {
            await vscode.commands.executeCommand(
                'vscode.openFolder',
                vscode.Uri.file(workspaceFilePath),
                false // No nueva ventana - reemplaza actual
            );
        }
    }

    /**
     * Agrega un proyecto al workspace actual
     * Si no hay workspace, crea uno nuevo
     */
    static async addProjectToWorkspace(projectPath: string, projectName?: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const projectUri = vscode.Uri.file(projectPath);

        // Verificar si ya está en el workspace
        const alreadyInWorkspace = workspaceFolders.some(
            folder => folder.uri.fsPath === projectPath
        );

        if (alreadyInWorkspace) {
            console.log(`Project already in workspace: ${projectPath}`);
            
            // Enfocar en el explorador
            await vscode.commands.executeCommand(
                'revealInExplorer',
                projectUri
            );
            return;
        }

        // Detectar estrategia para icono
        const icon = await this.getProjectIcon(projectPath);
        const displayName = projectName || path.basename(projectPath);

        // Agregar al workspace usando API nativa
        const workspaceEdit = vscode.workspace.updateWorkspaceFolders(
            workspaceFolders.length, // Insertar al final
            0, // No eliminar ninguno
            {
                uri: projectUri,
                name: `${icon} ${displayName}`
            }
        );

        if (workspaceEdit) {
            console.log(`✅ Project added to workspace: ${projectPath}`);
            
            // Actualizar archivo .code-workspace si existe
            await this.syncWorkspaceFile();
            
            // Enfocar en el nuevo proyecto
            setTimeout(async () => {
                await vscode.commands.executeCommand(
                    'revealInExplorer',
                    projectUri
                );
            }, 500);
        } else {
            console.error(`❌ Failed to add project to workspace: ${projectPath}`);
            
            // Fallback: ofrecer abrir manualmente
            const openManually = await vscode.window.showWarningMessage(
                `No se pudo agregar "${displayName}" al workspace actual.`,
                'Abrir en Nueva Ventana',
                'Cancelar'
            );

            if (openManually === 'Abrir en Nueva Ventana') {
                await vscode.commands.executeCommand(
                    'vscode.openFolder',
                    projectUri,
                    true
                );
            }
        }
    }

    /**
     * Remueve un proyecto del workspace
     */
    static async removeProjectFromWorkspace(projectPath: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        
        const folderIndex = workspaceFolders.findIndex(
            folder => folder.uri.fsPath === projectPath
        );

        if (folderIndex === -1) {
            console.log(`Project not in workspace: ${projectPath}`);
            return;
        }

        const workspaceEdit = vscode.workspace.updateWorkspaceFolders(
            folderIndex, // Índice a remover
            1 // Cantidad a remover
        );

        if (workspaceEdit) {
            console.log(`✅ Project removed from workspace: ${projectPath}`);
            await this.syncWorkspaceFile();
        }
    }

    /**
     * Lee la configuración del workspace actual
     */
    static getWorkspaceConfig(): WorkspaceConfig | null {
        const workspaceFile = vscode.workspace.workspaceFile;
        
        if (!workspaceFile) {
            return null;
        }

        try {
            const content = fs.readFileSync(workspaceFile.fsPath, 'utf-8');
            return JSON.parse(content) as WorkspaceConfig;
        } catch (error) {
            console.error('Error reading workspace config:', error);
            return null;
        }
    }

    /**
     * Sincroniza el archivo .code-workspace con el estado actual
     */
    private static async syncWorkspaceFile(): Promise<void> {
        const workspaceFile = vscode.workspace.workspaceFile;
        
        if (!workspaceFile) {
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const workspaceRoot = path.dirname(workspaceFile.fsPath);

        try {
            // Leer config existente
            let config: WorkspaceConfig;
            
            if (fs.existsSync(workspaceFile.fsPath)) {
                const content = fs.readFileSync(workspaceFile.fsPath, 'utf-8');
                config = JSON.parse(content);
            } else {
                config = { folders: [], settings: {} };
            }

            // Actualizar folders con estado actual
            config.folders = workspaceFolders.map(folder => {
                const relativePath = path.relative(workspaceRoot, folder.uri.fsPath);
                return {
                    name: folder.name,
                    path: relativePath.startsWith('.') ? relativePath : `./${relativePath}`
                };
            });

            // Guardar
            fs.writeFileSync(
                workspaceFile.fsPath,
                JSON.stringify(config, null, 2),
                'utf-8'
            );

            console.log(`✅ Workspace file synchronized`);
        } catch (error) {
            console.error('Error syncing workspace file:', error);
        }
    }

    /**
     * Detecta el icono apropiado según el tipo de proyecto
     */
    private static async getProjectIcon(projectPath: string): Promise<string> {
        // Importar ProjectDetector dinámicamente para evitar dependencias circulares
        try {
            const { ProjectDetector } = await import('../strategies/ProjectDetector');
            const strategy = await ProjectDetector.getStrategyName(projectPath);
            
            const icons: Record<string, string> = {
                'android': '📱',
                'ios': '🍎',
                'react-web': '🌐',
                'web': '🌐',
                'node': '⚙️',
                'python-flask': '🐍',
                'php-laravel': '🐘',
                'nucleus': '🏢',
                'generic': '📦'
            };
            
            return icons[strategy] || '📦';
        } catch {
            return '📦';
        }
    }

    /**
     * Verifica si estamos en un multi-root workspace
     */
    static isMultiRootWorkspace(): boolean {
        return (vscode.workspace.workspaceFolders?.length || 0) > 1;
    }

    /**
     * Obtiene el path del Nucleus actual en el workspace
     */
    static getCurrentNucleusPath(): string | null {
        const folders = vscode.workspace.workspaceFolders || [];
        
        for (const folder of folders) {
            const nucleusConfigPath = path.join(
                folder.uri.fsPath,
                '.bloom',
                'core',
                'nucleus-config.json'
            );
            
            if (fs.existsSync(nucleusConfigPath)) {
                return folder.uri.fsPath;
            }
        }
        
        return null;
    }
}