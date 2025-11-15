import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/logger';

export class MarkdownPreviewPanel {
    private panel: vscode.WebviewPanel | undefined;
    private changeListener: vscode.Disposable | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private document: vscode.TextDocument,
        private logger: Logger,
        private previewPanels: Map<vscode.TextDocument, vscode.WebviewPanel>
    ) {}

    async createPanel(): Promise<void> {
        this.panel = vscode.window.createWebviewPanel(
            'bloomMarkdownPreview',
            'Bloom Preview: ' + path.basename(this.document.fileName),
            vscode.ViewColumn.Active,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.file(path.dirname(this.document.fileName)),
                    this.context.extensionUri
                ]
            }
        );

        this.previewPanels.set(this.document, this.panel);

        await this.updateWebview();
        this.setupListeners();
    }

    private async updateWebview(): Promise<void> {
        if (!this.panel) {
            return;
        }

        try {
            const result = await vscode.commands.executeCommand<string>(
                'markdown.api.render',
                this.document.getText()
            );

            if (!result) {
                throw new Error('Markdown rendering returned empty result');
            }

            const codiconUri = this.panel.webview.asWebviewUri(
                vscode.Uri.joinPath(
                    this.context.extensionUri,
                    'node_modules',
                    '@vscode',
                    'codicons',
                    'dist',
                    'codicon.css'
                )
            );

            const markdownStylesUri = this.panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this.context.extensionUri, 'src', 'styles', 'markdown.css')
            );

            const highlightStylesUri = this.panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this.context.extensionUri, 'src', 'styles', 'highlight.css')
            );

            this.panel.webview.html = this.getHtmlContent(
                result,
                codiconUri,
                markdownStylesUri,
                highlightStylesUri
            );

            this.logger.info('Preview actualizado exitosamente');
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to render Markdown: ${errorMessage}`);
            this.logger.error('Error al renderizar Markdown', error as Error);
        }
    }

    private getHtmlContent(
        content: string,
        codiconUri: vscode.Uri,
        markdownStylesUri: vscode.Uri,
        highlightStylesUri: vscode.Uri
    ): string {
        if (!this.panel) {
            return '';
        }

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; font-src ${this.panel.webview.cspSource}; script-src ${this.panel.webview.cspSource} 'unsafe-inline'; img-src ${this.panel.webview.cspSource} data:;">
                <title>Bloom Markdown Preview</title>
                <link href="${codiconUri}" rel="stylesheet">
                <link href="${markdownStylesUri}" rel="stylesheet">
                <link href="${highlightStylesUri}" rel="stylesheet">
            </head>
            <body class="markdown-body">
                ${content}
                <script>
                    const vscode = acquireVsCodeApi();
                    document.addEventListener('click', (event) => {
                        if (event.target.tagName === 'A') {
                            const href = event.target.getAttribute('href');
                            if (href && href.startsWith('#')) {
                                const anchor = href.substring(1);
                                const element = document.getElementById(anchor) || document.querySelector(\`[name="\${anchor}"]\`);
                                if (element) {
                                    element.scrollIntoView({ behavior: 'smooth' });
                                    event.preventDefault();
                                }
                            } else if (href && !href.startsWith('#') && href.endsWith('.md')) {
                                vscode.postMessage({ command: 'openLink', href: href });
                                event.preventDefault();
                            }
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    private setupListeners(): void {
        if (!this.panel) {
            return;
        }

        // Listener para cambios en el documento
        this.changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
            if (event.document === this.document && this.previewPanels.get(this.document) === this.panel) {
                this.updateWebview();
            }
        });

        // Listener para mensajes del webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                if (message.command === 'openLink') {
                    await this.handleLinkClick(message.href);
                }
            },
            undefined,
            this.context.subscriptions
        );

        // Listener para cierre del panel
        this.panel.onDidDispose(() => {
            this.previewPanels.delete(this.document);
            if (this.changeListener) {
                this.changeListener.dispose();
            }
            this.logger.info('Preview panel cerrado');
        }, undefined, this.context.subscriptions);
    }

    private async handleLinkClick(href: string): Promise<void> {
        const linkUri = vscode.Uri.file(
            path.resolve(path.dirname(this.document.fileName), href)
        );

        try {
            const linkedDocument = await vscode.workspace.openTextDocument(linkUri);
            await vscode.commands.executeCommand('workbench.action.newGroupRight');
            await vscode.commands.executeCommand('workbench.action.focusRightGroup');

            const newPanel = new MarkdownPreviewPanel(
                this.context,
                linkedDocument,
                this.logger,
                this.previewPanels
            );
            await newPanel.createPanel();

            this.logger.info(`Abriendo documento enlazado: ${href}`);
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to open document: ${href}: ${errorMessage}`);
            this.logger.error(`Error al abrir documento: ${href}`, error as Error);
        }
    }
}