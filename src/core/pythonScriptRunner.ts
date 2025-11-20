import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface ScriptResult {
    success: boolean;
    stdout: string;
    stderr: string;
    outputFile?: string;
}

export class PythonScriptRunner {
    private scriptsPath: string;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {
        this.scriptsPath = path.join(context.extensionPath, 'scripts');
    }

    async generateTree(
        outputFile: string,
        targetPaths: string[]
    ): Promise<ScriptResult> {
        this.logger.info('Ejecutando tree_custom.py');

        const config = vscode.workspace.getConfiguration('bloom');
        const pythonPath = config.get<string>('pythonPath', 'python');

        const scriptPath = path.join(this.scriptsPath, 'tree_custom.py');
        const args = [outputFile, ...targetPaths].map(p => `"${p}"`).join(' ');
        const command = `"${pythonPath}" "${scriptPath}" ${args}`;

        try {
            const { stdout, stderr } = await execAsync(command, {
                timeout: 30000
            });

            this.logger.info('tree_custom.py completado');

            return {
                success: true,
                stdout,
                stderr,
                outputFile
            };
        } catch (error: any) {
            this.logger.error('Error ejecutando tree_custom.py', error);
            return {
                success: false,
                stdout: error.stdout || '',
                stderr: error.stderr || error.message
            };
        }
    }

    async generateCodebase(
        outputFile: string,
        files: string[]
    ): Promise<ScriptResult> {
        this.logger.info('Ejecutando codebase_generation.py');

        const config = vscode.workspace.getConfiguration('bloom');
        const pythonPath = config.get<string>('pythonPath', 'python');

        const scriptPath = path.join(this.scriptsPath, 'codebase_generation.py');
        const filesArg = files.map(f => `"${f}"`).join(' ');
        const command = `"${pythonPath}" "${scriptPath}" --output "${outputFile}" --files ${filesArg}`;

        try {
            const { stdout, stderr } = await execAsync(command, {
                timeout: 60000
            });

            this.logger.info('codebase_generation.py completado');

            return {
                success: true,
                stdout,
                stderr,
                outputFile
            };
        } catch (error: any) {
            this.logger.error('Error ejecutando codebase_generation.py', error);
            return {
                success: false,
                stdout: error.stdout || '',
                stderr: error.stderr || error.message
            };
        }
    }

    async integrateSnapshot(
        snapshotFile: string,
        projectRoot: string,
        treeFile: string,
        backupDir: string,
        dryRun: boolean = false
    ): Promise<ScriptResult & {
        filesCreated?: string[];
        filesModified?: string[];
        conflicts?: string[];
    }> {
        this.logger.info('Ejecutando codebase_snapshot_integration.py');

        const config = vscode.workspace.getConfiguration('bloom');
        const pythonPath = config.get<string>('pythonPath', 'python');

        const scriptPath = path.join(this.scriptsPath, 'codebase_snapshot_integration.py');
        const dryRunFlag = dryRun ? '--dry-run' : '';
        const command = `"${pythonPath}" "${scriptPath}" "${snapshotFile}" "${projectRoot}" --tree "${treeFile}" --backup-dir "${backupDir}" ${dryRunFlag}`;

        try {
            const { stdout, stderr } = await execAsync(command, {
                timeout: 120000
            });

            this.logger.info('codebase_snapshot_integration.py completado');

            const filesCreated = this.extractFilesFromOutput(stdout, 'CREATED:');
            const filesModified = this.extractFilesFromOutput(stdout, 'MODIFIED:');
            const conflicts = this.extractFilesFromOutput(stdout, 'CONFLICT:');

            return {
                success: true,
                stdout,
                stderr,
                filesCreated,
                filesModified,
                conflicts
            };
        } catch (error: any) {
            this.logger.error('Error ejecutando codebase_snapshot_integration.py', error);
            return {
                success: false,
                stdout: error.stdout || '',
                stderr: error.stderr || error.message
            };
        }
    }

    private extractFilesFromOutput(output: string, marker: string): string[] {
        const lines = output.split('\n');
        const files: string[] = [];

        for (const line of lines) {
            if (line.includes(marker)) {
                const filePath = line.split(marker)[1]?.trim();
                if (filePath) {
                    files.push(filePath);
                }
            }
        }

        return files;
    }

    async detectChromeProfiles(): Promise<ScriptResult & {
        profiles?: Array<{
            name: string;
            path: string;
            accounts: Array<{provider: string, email: string}>;
        }>;
    }> {

        const config = vscode.workspace.getConfiguration('bloom');
        const pythonPath = config.get<string>('pythonPath', 'python');

        const scriptPath = path.join(this.scriptsPath, 'chrome_profile_detector.py');
        const command = `"${pythonPath}" "${scriptPath}" --json`;
        
        const { stdout } = await execAsync(command);
        const profiles = JSON.parse(stdout);
        
        return { success: true, stdout, stderr: '', profiles };
    }

    async sendClaudeMessage(
    prompt: string,
    profile: string,
    account: string,
    contextFiles: string[]
): Promise<ScriptResult & { conversationId?: string }> {
    this.logger.info('Enviando mensaje a Claude via claude_bridge.py');

    const config = vscode.workspace.getConfiguration('bloom');
    const pythonPath = config.get<string>('pythonPath', 'python3');  // ← FALTABA ESTO

    const scriptPath = path.join(this.scriptsPath, 'claude_bridge.py');
    
    // Crear archivo temporal con el prompt
    const tempPromptFile = path.join(this.scriptsPath, '.temp_prompt.txt');
    await fs.promises.writeFile(tempPromptFile, prompt, 'utf-8');
    
    // Crear archivo temporal con contexto
    const tempContextFile = path.join(this.scriptsPath, '.temp_context.json');
    await fs.promises.writeFile(
        tempContextFile, 
        JSON.stringify({ files: contextFiles }), 
        'utf-8'
    );

    const command = `"${pythonPath}" "${scriptPath}" send --profile "${profile}" --account "${account}" --prompt "${tempPromptFile}" --context "${tempContextFile}"`;

            try {
                const { stdout, stderr } = await execAsync(command, {
                    timeout: 120000
                });

                this.logger.info('claude_bridge.py completado');

                // Extraer conversation ID del output
                const match = stdout.match(/Conversation ID: ([a-f0-9-]+)/);
                const conversationId = match ? match[1] : undefined;

                return {
                    success: true,
                    stdout,
                    stderr,
                    conversationId
                };
            } catch (error: any) {
                this.logger.error('Error ejecutando claude_bridge.py', error);
                return {
                    success: false,
                    stdout: error.stdout || '',
                    stderr: error.stderr || error.message,
                    conversationId: undefined  // ← FALTABA ESTO
                };
            }
        }
    }