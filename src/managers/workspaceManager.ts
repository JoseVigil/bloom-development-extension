// src/managers/workspaceManager.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * WorkspaceManager: Gestiona archivos .code-workspace
 * 
 * DECISIÓN CRÍTICA DE DISEÑO:
 * El archivo workspace se guarda DENTRO del Nucleus, no en el parent folder
 * 
 * Razón:
 * - El Nucleus es responsable de la estructura organizacional
 * - El workspace es parte de la configuración del Nucleus
 * - Permite versionarlo en Git junto con el resto del Nucleus
 * - Facilita compartir configuración entre desarrolladores
 * 
 * Estructura:
 * nucleus-JoseVigil/
 *   ├── .bloom/
 *   ├── .workspace/
 *   │   └── JoseVigil.code-workspace  ← AQUÍ se guarda
 *   └── README.md
 */
export class WorkspaceManager {
    /**
     * Inicializa un workspace para un Nucleus
     * Crea el archivo .code-workspace DENTRO del Nucleus
     */
    static async initializeWorkspace(
        nucleusPath: string,
        orgName: string
    ): Promise<string> {
        try {
            const nucleusName = path.basename(nucleusPath);
            
            // Crear carpeta .workspace dentro del Nucleus
            const workspaceDir = path.join(nucleusPath, '.workspace');
            if (!fs.existsSync(workspaceDir)) {
                fs.mkdirSync(workspaceDir, { recursive: true });
            }

            // Path del archivo workspace (DENTRO del Nucleus)
            const workspaceFileName = `${orgName}.code-workspace`;
            const workspaceFilePath = path.join(workspaceDir, workspaceFileName);

            console.log(`[WorkspaceManager] Creating workspace file at: ${workspaceFilePath}`);

            // Configuración inicial del workspace
            const workspaceConfig = {
                folders: [
                    {
                        name: `🏢 ${nucleusName}`,
                        path: '..'  // Relativo a .workspace/
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
                    recommendations: [
                        'bloom.bloom-btip-plugin'
                    ]
                }
            };

            // Escribir archivo
            fs.writeFileSync(
                workspaceFilePath,
                JSON.stringify(workspaceConfig, null, 2),
                'utf-8'
            );

            console.log(`[WorkspaceManager] Workspace file created successfully`);
            return workspaceFilePath;

        } catch (error: any) {
            console.error('[WorkspaceManager] Error creating workspace:', error);
            throw new Error(`Failed to create workspace: ${error.message}`);
        }
    }

    /**
     * Obtiene el path del archivo workspace de un Nucleus
     */
    static getWorkspaceFilePath(nucleusPath: string, orgName: string): string {
        const workspaceDir = path.join(nucleusPath, '.workspace');
        const workspaceFileName = `${orgName}.code-workspace`;
        return path.join(workspaceDir, workspaceFileName);
    }

    /**
     * Verifica si existe un archivo workspace para un Nucleus
     */
    static hasWorkspaceFile(nucleusPath: string, orgName: string): boolean {
        const workspaceFilePath = this.getWorkspaceFilePath(nucleusPath, orgName);
        return fs.existsSync(workspaceFilePath);
    }

    /**
     * Agrega un proyecto al workspace actual
     * AHORA actualiza el archivo dentro del Nucleus
     */
    static async addProjectToWorkspace(
        nucleusPath: string,
        orgName: string,
        projectPath: string,
        projectName: string,
        strategy: string
    ): Promise<void> {
        try {
            const workspaceFilePath = this.getWorkspaceFilePath(nucleusPath, orgName);

            // Verificar que el workspace file existe
            if (!fs.existsSync(workspaceFilePath)) {
                throw new Error(`Workspace file not found: ${workspaceFilePath}`);
            }

            // Leer configuración actual
            const currentConfig = JSON.parse(
                fs.readFileSync(workspaceFilePath, 'utf-8')
            );

            // Calcular path relativo desde .workspace/ al proyecto
            const workspaceDir = path.dirname(workspaceFilePath);
            const relativePath = path.relative(workspaceDir, projectPath);

            // Verificar si ya existe
            const existingFolder = currentConfig.folders.find(
                (f: any) => f.path === relativePath
            );

            if (existingFolder) {
                console.log(`[WorkspaceManager] Project already in workspace: ${projectName}`);
                return;
            }

            // Agregar nuevo proyecto
            const icon = this.getProjectIcon(strategy);
            currentConfig.folders.push({
                name: `${icon} ${projectName}`,
                path: relativePath
            });

            // Escribir archivo actualizado
            fs.writeFileSync(
                workspaceFilePath,
                JSON.stringify(currentConfig, null, 2),
                'utf-8'
            );

            console.log(`[WorkspaceManager] Project added to workspace: ${projectName}`);

            // Si el workspace actual NO es este archivo, ofrecer abrirlo
            const currentWorkspace = vscode.workspace.workspaceFile;
            if (!currentWorkspace || currentWorkspace.fsPath !== workspaceFilePath) {
                await this.promptToOpenWorkspace(workspaceFilePath, orgName);
            } else {
                // Si ya estamos en este workspace, recargar
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
            }

        } catch (error: any) {
            console.error('[WorkspaceManager] Error adding project to workspace:', error);
            throw error;
        }
    }

    /**
     * Remueve un proyecto del workspace
     */
    static async removeProjectFromWorkspace(
        nucleusPath: string,
        orgName: string,
        projectPath: string
    ): Promise<void> {
        try {
            const workspaceFilePath = this.getWorkspaceFilePath(nucleusPath, orgName);

            if (!fs.existsSync(workspaceFilePath)) {
                return; // No hay workspace file
            }

            // Leer configuración actual
            const currentConfig = JSON.parse(
                fs.readFileSync(workspaceFilePath, 'utf-8')
            );

            // Calcular path relativo
            const workspaceDir = path.dirname(workspaceFilePath);
            const relativePath = path.relative(workspaceDir, projectPath);

            // Filtrar el proyecto
            currentConfig.folders = currentConfig.folders.filter(
                (f: any) => f.path !== relativePath
            );

            // Escribir archivo actualizado
            fs.writeFileSync(
                workspaceFilePath,
                JSON.stringify(currentConfig, null, 2),
                'utf-8'
            );

            console.log(`[WorkspaceManager] Project removed from workspace`);

        } catch (error: any) {
            console.error('[WorkspaceManager] Error removing project:', error);
            throw error;
        }
    }

    /**
     * Ofrece abrir el workspace file
     */
    private static async promptToOpenWorkspace(
        workspaceFilePath: string,
        orgName: string
    ): Promise<void> {
        const action = await vscode.window.showInformationMessage(
            `✅ Proyecto agregado al workspace de ${orgName}`,
            {
                modal: false,
                detail: 'El workspace se actualizó. ¿Querés abrirlo ahora?'
            },
            'Abrir Workspace',
            'Más Tarde'
        );

        if (action === 'Abrir Workspace') {
            const workspaceUri = vscode.Uri.file(workspaceFilePath);
            await vscode.commands.executeCommand('vscode.openFolder', workspaceUri, {
                forceNewWindow: false
            });
        }
    }

    /**
     * Sincroniza el workspace file con el estado actual de VSCode
     * Útil cuando el usuario agrega/remueve carpetas manualmente
     */
    static async syncWorkspaceFile(
        nucleusPath: string,
        orgName: string
    ): Promise<void> {
        try {
            const workspaceFilePath = this.getWorkspaceFilePath(nucleusPath, orgName);

            if (!fs.existsSync(workspaceFilePath)) {
                return; // No hay nada que sincronizar
            }

            // Obtener folders actuales de VSCode
            const currentFolders = vscode.workspace.workspaceFolders || [];
            
            if (currentFolders.length === 0) {
                return;
            }

            // Leer configuración del archivo
            const fileConfig = JSON.parse(
                fs.readFileSync(workspaceFilePath, 'utf-8')
            );

            // Actualizar folders en la configuración
            const workspaceDir = path.dirname(workspaceFilePath);
            fileConfig.folders = currentFolders.map(folder => {
                const relativePath = path.relative(workspaceDir, folder.uri.fsPath);
                return {
                    name: folder.name,
                    path: relativePath
                };
            });

            // Escribir archivo actualizado
            fs.writeFileSync(
                workspaceFilePath,
                JSON.stringify(fileConfig, null, 2),
                'utf-8'
            );

            console.log(`[WorkspaceManager] Workspace file synced`);

        } catch (error: any) {
            console.error('[WorkspaceManager] Error syncing workspace:', error);
        }
    }

    /**
     * Verifica si VSCode está en un multi-root workspace
     */
    static isMultiRootWorkspace(): boolean {
        return (vscode.workspace.workspaceFolders?.length || 0) > 1;
    }

    /**
     * Obtiene el path del Nucleus actual (si existe)
     */
    static getCurrentNucleusPath(): string | null {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) return null;

        // Buscar la carpeta que contenga nucleus-config.json
        for (const folder of folders) {
            const configPath = path.join(
                folder.uri.fsPath,
                '.bloom',
                'core',
                'nucleus-config.json'
            );
            if (fs.existsSync(configPath)) {
                return folder.uri.fsPath;
            }
        }

        return null;
    }

    /**
     * Retorna el icono apropiado para cada estrategia
     */
    static getProjectIcon(strategy: string): string {
        const icons: Record<string, string> = {
            'nucleus': '🏢',
            'android': '🤖',
            'ios': '🍎',
            'react-web': '⚛️',
            'web': '🌐',
            'node': '⚙️',
            'python-flask': '🐍',
            'generic': '📦'
        };

        return icons[strategy] || '📦';
    }

    /**
     * Abre un workspace file
     */
    static async openWorkspace(workspaceFilePath: string): Promise<void> {
        const workspaceUri = vscode.Uri.file(workspaceFilePath);
        await vscode.commands.executeCommand('vscode.openFolder', workspaceUri, {
            forceNewWindow: false
        });
    }

    /**
     * Crea archivo .gitignore para la carpeta .workspace/
     * Opcional: si NO querés versionar el workspace file
     */
    static async createWorkspaceGitignore(nucleusPath: string): Promise<void> {
        const workspaceDir = path.join(nucleusPath, '.workspace');
        const gitignorePath = path.join(workspaceDir, '.gitignore');

        if (fs.existsSync(gitignorePath)) {
            return; // Ya existe
        }

        const gitignoreContent = `# Ignorar workspace files (opcional)
# Descomentar si NO querés versionar la configuración del workspace
# *.code-workspace

# Pero SÍ versionar templates
!template.code-workspace
`;

        fs.writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
        console.log('[WorkspaceManager] .gitignore created in .workspace/');
    }
}