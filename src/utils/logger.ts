// src/utils/logger.ts
//
// Dual sink: Output Channel de VS Code (como antes, para feedback inmediato
// al usuario) + archivo persistente en disco (nuevo — requerido por
// BLOOM_NUCLEUS_LOGGING_SPEC.md, ya que el logging previo era 100% efímero).
//
// Se registra en Nucleus vía `nucleus telemetry register` al instanciarse,
// siguiendo el patrón Core Layer de la spec.

import * as vscode from 'vscode';
import * as fs from 'fs';
import { getDailyLogPathForGroup } from './logPaths';
import { registerLogStream } from './nucleusTelemetry';

// Sin prefijo "brain_": la extensión de VS Code es su propia aplicación,
// independiente del ecosistema brain/nucleus/sentinel — vive en logs/vscode/,
// no en logs/brain/.
const STREAM_ID = 'vscode_extension';

export class Logger {
    private outputChannel: vscode.OutputChannel;
    private fileStream: fs.WriteStream | null = null;
    private logFilePath: string;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Bloom');
        this.logFilePath = getDailyLogPathForGroup('vscode', 'vscode_extension');

        try {
            this.fileStream = fs.createWriteStream(this.logFilePath, { flags: 'a' });
        } catch (err) {
            // Si falla la apertura del archivo, seguimos funcionando solo con el
            // Output Channel — nunca queremos romper la extensión por un problema de logging.
            this.outputChannel.appendLine(
                `[${new Date().toISOString()}] WARN: No se pudo abrir el log file en ${this.logFilePath}: ${(err as Error).message}`
            );
        }

        // Fire-and-forget: no bloquea la construcción del logger ni la activación de la extensión.
        registerLogStream({
            stream: STREAM_ID,
            label: '🧩 VSCODE EXTENSION',
            path: this.logFilePath,
            priority: 2,
            categories: ['vscode'],
            source: 'vscode',
            description: 'Bloom VS Code extension log — captura comandos ejecutados, invocaciones a Brain CLI, y errores del Extension Host',
        }).catch(() => { /* registerLogStream ya maneja sus propios errores internamente */ });
    }

    private write(line: string): void {
        this.outputChannel.appendLine(line);
        this.fileStream?.write(line + '\n');
    }

    info(message: string): void {
        const timestamp = new Date().toISOString();
        this.write(`[${timestamp}] INFO: ${message}`);
    }

    error(message: string, error?: Error): void {
        const timestamp = new Date().toISOString();
        this.write(`[${timestamp}] ERROR: ${message}`);
        if (error) {
            this.write(`[${timestamp}] ERROR Details: ${error.message}`);
            if (error.stack) {
                this.write(`[${timestamp}] Stack: ${error.stack}`);
            }
        }
    }

    warn(message: string): void {
        const timestamp = new Date().toISOString();
        this.write(`[${timestamp}] WARN: ${message}`);
    }

    show(): void {
        this.outputChannel.show();
    }

    dispose(): void {
        this.outputChannel.dispose();
        this.fileStream?.end();
    }
}

// ============================================================================
// SINGLETON
// ============================================================================
//
// La spec requiere UN registro por stream, no uno por instancia creada.
// Antes cada `new Logger()` (en nucleusManager.ts, y potencialmente en otros
// managers) abría su propio Output Channel sin coordinación. El singleton
// asegura un solo file handle y un solo registro en telemetry.json por
// sesión de la extensión.

let sharedInstance: Logger | null = null;

export function getLogger(): Logger {
    if (!sharedInstance) {
        sharedInstance = new Logger();
    }
    return sharedInstance;
}

export function disposeLogger(): void {
    sharedInstance?.dispose();
    sharedInstance = null;
}
