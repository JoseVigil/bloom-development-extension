// src/utils/gitExecutor.ts
import * as vscode from 'vscode';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const execAsync = promisify(exec);

/**
 * GitExecutor: Abstracción robusta para ejecutar comandos Git
 * Soporta Windows, Linux y macOS con detección automática
 */
export class GitExecutor {
    private static gitPath: string | null = null;
    private static detectionAttempted = false;

    /**
     * Detecta la ubicación de Git en el sistema
     * CRÍTICO para Windows donde git puede no estar en PATH
     */
    private static async detectGitPath(): Promise<string> {
        if (this.detectionAttempted && this.gitPath) {
            return this.gitPath;
        }

        this.detectionAttempted = true;

        // 1. Intentar usar 'git' directo (funciona si está en PATH)
        try {
            await execAsync('git --version');
            this.gitPath = 'git';
            console.log('[GitExecutor] Git found in PATH');
            return 'git';
        } catch (error) {
            console.log('[GitExecutor] Git not in PATH, searching...');
        }

        // 2. Rutas comunes por plataforma
        const platform = os.platform();
        let searchPaths: string[] = [];

        if (platform === 'win32') {
            // Windows: rutas típicas de instalación
            searchPaths = [
                'C:\\Program Files\\Git\\cmd\\git.exe',
                'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
                'C:\\Program Files\\Git\\bin\\git.exe',
                path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Git', 'cmd', 'git.exe'),
                path.join(os.homedir(), 'scoop', 'apps', 'git', 'current', 'bin', 'git.exe')
            ];

            // Buscar en Program Files
            try {
                const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
                const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
                
                searchPaths.push(
                    path.join(programFiles, 'Git', 'cmd', 'git.exe'),
                    path.join(programFilesX86, 'Git', 'cmd', 'git.exe')
                );
            } catch (error) {
                // Ignorar errores de variables de entorno
            }

        } else if (platform === 'darwin') {
            // macOS: ubicaciones típicas
            searchPaths = [
                '/usr/bin/git',
                '/usr/local/bin/git',
                '/opt/homebrew/bin/git',
                '/opt/local/bin/git'
            ];

        } else {
            // Linux: ubicaciones estándar
            searchPaths = [
                '/usr/bin/git',
                '/usr/local/bin/git',
                '/bin/git'
            ];
        }

        // 3. Buscar en las rutas conocidas
        for (const gitPath of searchPaths) {
            if (fs.existsSync(gitPath)) {
                try {
                    // Verificar que funciona
                    await execAsync(`"${gitPath}" --version`);
                    this.gitPath = gitPath;
                    console.log(`[GitExecutor] Git found at: ${gitPath}`);
                    return gitPath;
                } catch (error) {
                    continue;
                }
            }
        }

        // 4. Usar VSCode Git Extension como fallback
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (gitExtension) {
                const gitApi = gitExtension.exports.getAPI(1);
                if (gitApi?.git?.path) {
                    this.gitPath = gitApi.git.path;
                    console.log(`[GitExecutor] Git found via VSCode API: ${this.gitPath}`);
                    return this.gitPath ?? 'git';
                }
            }
        } catch (error) {
            console.warn('[GitExecutor] Could not get git from VSCode API:', error);
        }

        // 5. Último intento: preguntar al usuario
        const userPath = await this.promptUserForGitPath();
        if (userPath) {
            this.gitPath = userPath;
            return userPath;
        }

        throw new Error(
            'Git no encontrado. Por favor instala Git desde https://git-scm.com/downloads ' +
            'o configura "bloom.gitPath" en settings.'
        );
    }

    /**
     * Pregunta al usuario por la ruta de Git
     */
    private static async promptUserForGitPath(): Promise<string | null> {
        const action = await vscode.window.showErrorMessage(
            '⚠️ Git no encontrado en tu sistema',
            {
                modal: true,
                detail: 'Bloom necesita Git para funcionar. Opciones:\n\n' +
                       '1. Instalar Git (recomendado)\n' +
                       '2. Especificar ubicación manualmente'
            },
            'Descargar Git',
            'Buscar en mi PC'
        );

        if (action === 'Descargar Git') {
            vscode.env.openExternal(vscode.Uri.parse('https://git-scm.com/downloads'));
            return null;
        }

        if (action === 'Buscar en mi PC') {
            const uris = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                title: 'Selecciona el ejecutable de Git',
                filters: os.platform() === 'win32' 
                    ? { 'Ejecutables': ['exe'] }
                    : undefined
            });

            if (uris && uris[0]) {
                const gitPath = uris[0].fsPath;
                try {
                    await execAsync(`"${gitPath}" --version`);
                    // Guardar en settings
                    await vscode.workspace.getConfiguration('bloom')
                        .update('gitPath', gitPath, vscode.ConfigurationTarget.Global);
                    return gitPath;
                } catch (error) {
                    vscode.window.showErrorMessage('El archivo seleccionado no es un ejecutable válido de Git');
                }
            }
        }

        return null;
    }

    /**
     * Ejecuta un comando Git con detección automática de ruta
     */
    static async exec(
        command: string,
        options: { cwd: string; timeout?: number } = { cwd: process.cwd() }
    ): Promise<{ stdout: string; stderr: string }> {
        try {
            // Detectar Git path si no se ha hecho
            const gitPath = await this.detectGitPath();

            // Construir comando completo
            const fullCommand = command.startsWith('git ')
                ? command.replace('git ', `"${gitPath}" `)
                : `"${gitPath}" ${command}`;

            console.log(`[GitExecutor] Executing: ${fullCommand}`);
            console.log(`[GitExecutor] Working directory: ${options.cwd}`);

            // Ejecutar con timeout
            const timeout = options.timeout || 30000; // 30 segundos default
            const result = await execAsync(fullCommand, {
                cwd: options.cwd,
                timeout,
                maxBuffer: 10 * 1024 * 1024, // 10MB buffer
                windowsHide: true
            });

            return result;

        } catch (error: any) {
            console.error('[GitExecutor] Error executing git command:', error);
            
            // Mejorar mensajes de error
            if (error.code === 'ENOENT') {
                throw new Error('Git no encontrado. Por favor instala Git.');
            }
            
            if (error.killed && error.signal === 'SIGTERM') {
                throw new Error('Comando Git cancelado (timeout)');
            }

            throw error;
        }
    }

    /**
     * Ejecuta comando Git con streaming de output (para operaciones largas)
     */
    static spawn(
        args: string[],
        options: { cwd: string; onData?: (data: string) => void } = { cwd: process.cwd() }
    ): Promise<void> {
        return new Promise(async (resolve, reject) => {
            try {
                const gitPath = await this.detectGitPath();

                console.log(`[GitExecutor] Spawning: ${gitPath} ${args.join(' ')}`);

                const process = spawn(gitPath, args, {
                    cwd: options.cwd,
                    windowsHide: true,
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                let stdout = '';
                let stderr = '';

                process.stdout?.on('data', (data) => {
                    const str = data.toString();
                    stdout += str;
                    if (options.onData) {
                        options.onData(str);
                    }
                });

                process.stderr?.on('data', (data) => {
                    stderr += data.toString();
                });

                process.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Git command failed with code ${code}\n${stderr}`));
                    }
                });

                process.on('error', (error) => {
                    reject(error);
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Verifica si un directorio es un repositorio Git válido
     */
    static async isGitRepository(dirPath: string): Promise<boolean> {
        try {
            const gitDir = path.join(dirPath, '.git');
            if (!fs.existsSync(gitDir)) {
                return false;
            }

            // Verificar con comando git
            await this.exec('rev-parse --git-dir', { cwd: dirPath });
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Inicializa un nuevo repositorio Git
     */
    static async init(dirPath: string): Promise<void> {
        console.log(`[GitExecutor] Initializing git repo at: ${dirPath}`);
        await this.exec('init', { cwd: dirPath });
    }

    /**
     * Clona un repositorio
     */
    static async clone(
        repoUrl: string,
        targetPath: string,
        onProgress?: (data: string) => void
    ): Promise<void> {
        console.log(`[GitExecutor] Cloning ${repoUrl} to ${targetPath}`);
        
        const parentDir = path.dirname(targetPath);
        const repoName = path.basename(targetPath);

        await this.spawn(['clone', repoUrl, repoName], {
            cwd: parentDir,
            onData: onProgress
        });
    }

    /**
     * Agrega remote origin
     */
    static async addRemote(repoPath: string, remoteUrl: string): Promise<void> {
        await this.exec(`remote add origin ${remoteUrl}`, { cwd: repoPath });
    }

    /**
     * Verifica si remote origin existe
     */
    static async hasRemote(repoPath: string, remoteName: string = 'origin'): Promise<boolean> {
        try {
            const { stdout } = await this.exec('remote', { cwd: repoPath });
            return stdout.split('\n').includes(remoteName);
        } catch (error) {
            return false;
        }
    }

    /**
     * Obtiene URL del remote origin
     */
    static async getRemoteUrl(repoPath: string, remoteName: string = 'origin'): Promise<string | null> {
        try {
            const { stdout } = await this.exec(`remote get-url ${remoteName}`, { cwd: repoPath });
            return stdout.trim();
        } catch (error) {
            return null;
        }
    }

    /**
     * Resetea caché de detección (útil para testing)
     */
    static resetCache(): void {
        this.gitPath = null;
        this.detectionAttempted = false;
    }
}