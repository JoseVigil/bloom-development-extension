import * as vscode from 'vscode';
import * as path from 'path';
import { spawn } from 'child_process';

export interface BridgeResult {
    success: boolean;
    conversationId?: string;
    outputPath?: string;
    questions?: string[];
    error?: string;
}

export class BridgeExecutor {
    private config = vscode.workspace.getConfiguration('claudeBridge');
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Claude Bridge');
    }

    async sendMessage(prompt: string, contextFiles: string[]): Promise<BridgeResult> {
        this.outputChannel.show();
        this.outputChannel.appendLine('🚀 Enviando mensaje a Claude...');

        const scriptPath = this.getScriptPath();
        const pythonPath = this.config.get<string>('pythonPath', 'python3');

        // Crear archivo temporal con prompt
        const tempDir = this.getTempDir();
        const promptFile = path.join(tempDir, 'prompt.txt');
        const contextFile = path.join(tempDir, 'context.json');

        await vscode.workspace.fs.writeFile(
            vscode.Uri.file(promptFile),
            Buffer.from(prompt, 'utf-8')
        );

        await vscode.workspace.fs.writeFile(
            vscode.Uri.file(contextFile),
            Buffer.from(JSON.stringify({ files: contextFiles }), 'utf-8')
        );

        // Ejecutar script
        const args = [
            scriptPath,
            'send',
            '--prompt', promptFile,
            '--context', contextFile
        ];

        if (this.config.get<boolean>('headlessMode')) {
            args.push('--headless');
        }

        return new Promise((resolve) => {
            const process = spawn(pythonPath, args);

            let stdout = '';
            let stderr = '';

            process.stdout.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                this.outputChannel.append(text);
            });

            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            process.on('close', (code) => {
                if (code === 0) {
                    // Extraer conversation ID del stdout
                    const match = stdout.match(/Conversation ID: ([a-f0-9-]+)/);
                    const conversationId = match ? match[1] : undefined;

                    resolve({
                        success: true,
                        conversationId
                    });
                } else {
                    resolve({
                        success: false,
                        error: stderr
                    });
                }
            });
        });
    }

    async fetchArtifact(conversationId: string): Promise<BridgeResult> {
        this.outputChannel.show();
        this.outputChannel.appendLine(`📥 Descargando artifact: ${conversationId}`);

        const scriptPath = this.getScriptPath();
        const pythonPath = this.config.get<string>('pythonPath', 'python3');

        const tempDir = this.getTempDir();
        const outputPath = path.join(tempDir, `artifact_${conversationId}.md`);

        const args = [
            scriptPath,
            'fetch',
            conversationId,
            '--output', outputPath
        ];

        if (this.config.get<boolean>('headlessMode')) {
            args.push('--headless');
        }

        return new Promise((resolve) => {
            const process = spawn(pythonPath, args);

            let stdout = '';

            process.stdout.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                this.outputChannel.append(text);
            });

            process.on('close', (code) => {
                if (code === 0) {
                    resolve({
                        success: true,
                        outputPath
                    });
                } else {
                    resolve({
                        success: false,
                        error: 'Failed to fetch artifact'
                    });
                }
            });
        });
    }

    async parseQuestions(conversationId: string): Promise<BridgeResult> {
        this.outputChannel.show();
        this.outputChannel.appendLine(`❓ Parseando preguntas: ${conversationId}`);

        const scriptPath = this.getScriptPath();
        const pythonPath = this.config.get<string>('pythonPath', 'python3');

        const args = [
            scriptPath,
            'parse-questions',
            conversationId
        ];

        if (this.config.get<boolean>('headlessMode')) {
            args.push('--headless');
        }

        return new Promise((resolve) => {
            const process = spawn(pythonPath, args);

            let stdout = '';

            process.stdout.on('data', (data) => {
                const text = data.toString();
                stdout += text;
                this.outputChannel.append(text);
            });

            process.on('close', async (code) => {
                if (code === 0) {
                    // Leer archivo JSON generado
                    const tempDir = this.getTempDir();
                    const jsonPath = path.join(
                        tempDir, 
                        'claude_bridge_data',
                        `questions_${conversationId}.json`
                    );

                    try {
                        const content = await vscode.workspace.fs.readFile(
                            vscode.Uri.file(jsonPath)
                        );
                        const data = JSON.parse(content.toString());

                        resolve({
                            success: true,
                            questions: data.questions
                        });
                    } catch (error) {
                        resolve({
                            success: false,
                            error: 'Failed to read questions file'
                        });
                    }
                } else {
                    resolve({
                        success: false,
                        error: 'Failed to parse questions'
                    });
                }
            });
        });
    }

    private getScriptPath(): string {
        const configured = this.config.get<string>('bridgeScriptPath', '');
        if (configured) {
            return configured;
        }

        // Buscar en directorio de la extensión
        const extensionPath = vscode.extensions.getExtension('your-publisher-name.claude-vscode-bridge')?.extensionPath;
        if (extensionPath) {
            return path.join(extensionPath, 'scripts', 'claude_bridge.py');
        }

        throw new Error('Bridge script path not configured');
    }

    private getTempDir(): string {
        if (vscode.workspace.workspaceFolders) {
            return path.join(
                vscode.workspace.workspaceFolders[0].uri.fsPath,
                '.claude-bridge'
            );
        }
        return path.join(require('os').tmpdir(), 'claude-bridge');
    }
}