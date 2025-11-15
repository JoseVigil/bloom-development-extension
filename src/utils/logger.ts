import * as vscode from 'vscode';

export class Logger {
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Bloom');
    }

    info(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] INFO: ${message}`);
    }

    error(message: string, error?: Error): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ERROR: ${message}`);
        if (error) {
            this.outputChannel.appendLine(`[${timestamp}] ERROR Details: ${error.message}`);
            if (error.stack) {
                this.outputChannel.appendLine(`[${timestamp}] Stack: ${error.stack}`);
            }
        }
    }

    warn(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] WARN: ${message}`);
    }

    show(): void {
        this.outputChannel.show();
    }

    dispose(): void {
        this.outputChannel.dispose();
    }
}