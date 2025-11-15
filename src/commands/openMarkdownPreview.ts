import * as vscode from 'vscode';
import { MarkdownPreviewPanel } from '../ui/markdownPreviewPanel';
import { Logger } from '../utils/logger';

const previewPanels = new Map<vscode.TextDocument, vscode.WebviewPanel>();

export function registerOpenMarkdownPreview(context: vscode.ExtensionContext, logger: Logger): void {
    const disposable = vscode.commands.registerCommand('bloom.openMarkdownPreview', async () => {
        logger.info('Ejecutando comando: Bloom: Open Markdown Preview');

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Please open a Markdown (.md) file first.');
            logger.warn('No hay editor activo');
            return;
        }

        const document = editor.document;
        if (document.languageId !== 'markdown' || !document.fileName.endsWith('.md')) {
            vscode.window.showErrorMessage('Please open a Markdown (.md) file first.');
            logger.warn(`Archivo no es Markdown: ${document.fileName}`);
            return;
        }

        await document.save();
        logger.info(`Abriendo preview para: ${document.fileName}`);

        await vscode.commands.executeCommand('workbench.action.newGroupRight');
        await vscode.commands.executeCommand('workbench.action.focusRightGroup');

        const previewPanel = new MarkdownPreviewPanel(context, document, logger, previewPanels);
        await previewPanel.createPanel();
    });

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.openMarkdownPreview" registrado');
}