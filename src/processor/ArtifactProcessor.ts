import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';

/**
 * @deprecated Desde la versión 1.1.1 - Será eliminada.
 * @see  Para la nueva implementación 
 */
export class ArtifactProcessor {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Artifact Processor');
    }

    async process(snapshotPath: string, projectRoot: string): Promise<boolean> {
        this.outputChannel.show();
        this.outputChannel.appendLine('⚙️ Procesando artifact...');

        const config = vscode.workspace.getConfiguration('claudeBridge');
        const pythonPath = config.get<string>('pythonPath', 'python3');

        // Path al script de procesamiento (tu script mejorado)
        const processorScript = this.getProcessorScriptPath();

        const args = [
            processorScript,
            snapshotPath,
            projectRoot,
            '--backup-dir'  // Siempre crear backup
        ];

        return new Promise((resolve) => {
            const process = spawn(pythonPath, args);

            process.stdout.on('data', (data) => {
                this.outputChannel.append(data.toString());
            });

            process.stderr.on('data', (data) => {
                this.outputChannel.append(data.toString());
            });

            process.on('close', (code) => {
                if (code === 0) {
                    vscode.window.showInformationMessage('✅ Artifact procesado exitosamente');
                    resolve(true);
                } else {
                    vscode.window.showErrorMessage('❌ Error procesando artifact');
                    resolve(false);
                }
            });
        });
    }

    private getProcessorScriptPath(): string {
        const extensionPath = vscode.extensions.getExtension(
            'your-publisher-name.claude-vscode-bridge'
        )?.extensionPath;

        if (extensionPath) {
            return path.join(extensionPath, 'scripts', 'process_snapshot_v2.py');
        }

        throw new Error('Processor script not found');
    }
}