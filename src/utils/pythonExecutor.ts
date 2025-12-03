import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import { Logger } from './logger';

const execPromise = promisify(exec);

export interface PythonExecutionResult {
    stdout: string;
    stderr: string;
    success: boolean;
    error?: Error;
}

export class PythonExecutor {
    private pythonPath: string;
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
        this.pythonPath = vscode.workspace.getConfiguration('bloom').get('pythonPath', 'python3');
    }

    /**
     * Ejecuta un script Python y retorna el resultado
     */
    async executeScript(
        scriptPath: string,
        args: string[] = [],
        cwd?: string
    ): Promise<PythonExecutionResult> {  // ← Agregar <PythonExecutionResult>
        try {
            const command = `"${this.pythonPath}" "${scriptPath}" ${args.join(' ')}`;
            
            this.logger.info(`Ejecutando Python: ${command}`);
            
            const options = cwd ? { cwd } : {};
            const { stdout, stderr } = await execPromise(command, options);

            this.logger.info(`Python stdout: ${stdout}`);
            if (stderr) {
                this.logger.warn(`Python stderr: ${stderr}`);
            }

            return {
                stdout: stdout.trim(),
                stderr: stderr.trim(),
                success: true
            };

        } catch (error: any) {
            this.logger.error(`Error ejecutando Python: ${error.message}`);
            
            return {
                stdout: error.stdout || '',
                stderr: error.stderr || error.message,
                success: false,
                error: error
            };
        }
    }

    /**
     * Ejecuta generate_project_context.py
     */
    async generateContext(
        projectRoot: string,
        strategy: string,
        outputPath?: string
    ): Promise<PythonExecutionResult> {  // ← Agregar <PythonExecutionResult>
        const scriptsPath = path.join(
            vscode.extensions.getExtension('bloom.bloom-btip-plugin')?.extensionPath || '',
            'scripts'
        );
        
        const scriptPath = path.join(scriptsPath, 'generate_project_context.py');
        
        const args = [
            `--strategy=${strategy}`,
            `--root=${projectRoot}`
        ];
        
        if (outputPath) {
            args.push(`--output=${outputPath}`);
        }

        return this.executeScript(scriptPath, args);
    }

    /**
     * Ejecuta tree_custom.py
     */
    async generateTree(
        outputFile: string,
        paths: string[]
    ): Promise<PythonExecutionResult> {  // ← Agregar <PythonExecutionResult>
        const scriptsPath = path.join(
            vscode.extensions.getExtension('bloom.bloom-btip-plugin')?.extensionPath || '',
            'scripts'
        );
        
        const scriptPath = path.join(scriptsPath, 'tree_custom.py');
        const args = [outputFile, ...paths];

        return this.executeScript(scriptPath, args);
    }

    /**
     * Ejecuta codebase_generation.py
     */
    async generateCodebase(
        intentPath: string,
        files: string[]
    ): Promise<PythonExecutionResult> {  // ← Agregar <PythonExecutionResult>
        const useCustom = vscode.workspace.getConfiguration('bloom')
            .get('useCustomCodebaseGenerator', false);

        if (!useCustom) {
            return {
                stdout: '',
                stderr: 'Custom codebase generator not enabled',
                success: false
            };
        }

        const scriptsPath = path.join(
            vscode.extensions.getExtension('bloom.bloom-btip-plugin')?.extensionPath || '',
            'scripts'
        );
        
        const scriptPath = path.join(scriptsPath, 'codebase_generation.py');
        const args = [`--intent=${intentPath}`, ...files];

        return this.executeScript(scriptPath, args);
    }

    /**
     * Verifica si Python está disponible
     */
    async checkPythonAvailable(): Promise<boolean> {  // ← Agregar <boolean>
        try {
            const result = await this.executeScript(
                '-c',
                ['print("OK")']
            );
            return result.success && result.stdout === 'OK';
        } catch {
            return false;
        }
    }
}