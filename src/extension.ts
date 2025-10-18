import * as vscode from 'vscode';
import * as path from 'path';
import 'punycode/punycode'; 

export function activate(context: vscode.ExtensionContext) {
  const previewPanels = new Map<vscode.TextDocument, vscode.WebviewPanel>();

  let disposable = vscode.commands.registerCommand('bloom.openMarkdownPreview', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showErrorMessage('Please open a Markdown (.md) file first.');
      return;
    }
    const document = editor.document;
    if (document.languageId !== 'markdown' || !document.fileName.endsWith('.md')) {
      vscode.window.showErrorMessage('Please open a Markdown (.md) file first.');
      return;
    }
    await document.save();

    await vscode.commands.executeCommand('workbench.action.newGroupRight');
    await vscode.commands.executeCommand('workbench.action.focusRightGroup');

    const panel = vscode.window.createWebviewPanel(
      'bloomMarkdownPreview',
      'Bloom Preview: ' + path.basename(document.fileName),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.dirname(document.fileName)),
          context.extensionUri // Incluye toda la raíz de la extensión
        ]
      }
    );

    previewPanels.set(document, panel);

    const codiconUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
    );
    const markdownStylesUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'src', 'styles', 'markdown.css')
    );
    const highlightStylesUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, 'src', 'styles', 'highlight.css')
    );

    // Depuración
    vscode.window.showInformationMessage(`Codicon URI: ${codiconUri.toString()}`);
    vscode.window.showInformationMessage(`Markdown Styles URI: ${markdownStylesUri.toString()}`);

    const updateWebview = async () => {
      try {
        const result = await vscode.commands.executeCommand<string>('markdown.api.render', document.getText());
        if (!result) {
          throw new Error('Markdown rendering returned empty result');
        }
        panel.webview.html = `
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; font-src ${panel.webview.cspSource}; script-src ${panel.webview.cspSource} 'unsafe-inline'; img-src ${panel.webview.cspSource} data:;">
            <title>Bloom Markdown Preview</title>
            <link href="${codiconUri}" rel="stylesheet" onerror="console.error('Failed to load codicon.css')">            
            <link href="${markdownStylesUri}" rel="stylesheet" onerror="console.error('Failed to load markdown.css')">
            <link href="${highlightStylesUri}" rel="stylesheet" onerror="console.error('Failed to load highlight.css')">
          </head>
          <body class="markdown-body">
            ${result}
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
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Failed to render Markdown: ${errorMessage}`);
      }
    };

    await updateWebview();

    const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === document && previewPanels.get(document) === panel) {
        updateWebview();
      }
    });

    panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.command === 'openLink') {
          const linkUri = vscode.Uri.file(path.resolve(path.dirname(document.fileName), message.href));
          try {
            const linkedDocument = await vscode.workspace.openTextDocument(linkUri);
            await vscode.commands.executeCommand('workbench.action.newGroupRight');
            await vscode.commands.executeCommand('workbench.action.focusRightGroup');

            const newPanel = vscode.window.createWebviewPanel(
              'bloomMarkdownPreview',
              'Bloom Preview: ' + path.basename(linkUri.fsPath),
              vscode.ViewColumn.Active,
              {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                  vscode.Uri.file(path.dirname(linkUri.fsPath)),
                  context.extensionUri
                ]
              }
            );

            previewPanels.set(linkedDocument, newPanel);

            const newCodiconUri = newPanel.webview.asWebviewUri(
              vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css')
            );
            const newMarkdownStylesUri = newPanel.webview.asWebviewUri(
              vscode.Uri.joinPath(context.extensionUri, 'src', 'styles', 'markdown.css')
            );

            vscode.window.showInformationMessage(`New Codicon URI: ${newCodiconUri.toString()}`);
            vscode.window.showInformationMessage(`New Markdown Styles URI: ${newMarkdownStylesUri.toString()}`);

            const updateNewWebview = async () => {
              try {
                const newHtmlContent = await vscode.commands.executeCommand<string>('markdown.api.render', linkedDocument.getText());
                if (!newHtmlContent) {
                  throw new Error('Markdown rendering returned empty result');
                }
                newPanel.webview.html = `
                  <!DOCTYPE html>
                  <html lang="en">
                  <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${newPanel.webview.cspSource} 'unsafe-inline'; font-src ${newPanel.webview.cspSource}; script-src ${newPanel.webview.cspSource} 'unsafe-inline';">
                    <title>Bloom Markdown Preview</title>
                    <link href="${newCodiconUri}" rel="stylesheet" onerror="console.error('Failed to load codicon.css')">
                    <link href="${newMarkdownStylesUri}" rel="stylesheet" onerror="console.error('Failed to load markdown.css')">
                  </head>
                  <body class="markdown-body">
                    ${newHtmlContent}
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
              } catch (error: unknown) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Failed to render Markdown: ${errorMessage}`);
              }
            };

            await updateNewWebview();

            const newChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
              if (event.document === linkedDocument && previewPanels.get(linkedDocument) === newPanel) {
                updateNewWebview();
              }
            });

            newPanel.onDidDispose(() => {
              previewPanels.delete(linkedDocument);
              newChangeListener.dispose();
            }, undefined, context.subscriptions);
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to open document: ${message.href}: ${errorMessage}`);
          }
        }
      },
      undefined,
      context.subscriptions
    );

    panel.onDidDispose(() => {
      previewPanels.delete(document);
      changeListener.dispose();
    }, undefined, context.subscriptions);
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}