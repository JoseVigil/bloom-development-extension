import * as vscode from 'vscode';
import { registerOpenMarkdownPreview } from './commands/openMarkdownPreview';
import { registerGenerateIntent } from './commands/generateIntent';
import { Logger } from './utils/logger';

export function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    logger.info('Bloom plugin activado');

    // Registrar comando existente: Preview de Markdown
    registerOpenMarkdownPreview(context, logger);

    // Registrar nuevo comando: Generate Intent
    registerGenerateIntent(context, logger);

    logger.info('Todos los comandos registrados exitosamente');
}

export function deactivate() {
    // Cleanup si es necesario
}