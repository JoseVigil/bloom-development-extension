import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  // Mapa para asociar documentos con sus paneles de vista previa
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

    // Dynamically import marked to avoid ESM issues
    let marked;
    try {
      const markedModule = await import('marked');
      marked = markedModule.marked;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      vscode.window.showErrorMessage(`Failed to load marked module: ${errorMessage}`);
      return;
    }

    // Crear un nuevo grupo de editores a la derecha
    await vscode.commands.executeCommand('workbench.action.newGroupRight');
    await vscode.commands.executeCommand('workbench.action.focusRightGroup');

    // Crear el panel de vista previa
    const panel = vscode.window.createWebviewPanel(
      'bloomMarkdownPreview',
      'Bloom Preview: ' + path.basename(document.fileName),
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(path.dirname(document.fileName))]
      }
    );

    // Guardar el panel en el mapa
    previewPanels.set(document, panel);

    // Función para actualizar el contenido del webview
    const updateWebview = () => {
      const htmlContent = marked(document.getText());
      panel.webview.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Bloom Markdown Preview</title>
          <style>
            body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; }
            a { color: var(--vscode-textLink-foreground); }
          </style>
        </head>
        <body>
          ${htmlContent}
          <script>
            const vscode = acquireVsCodeApi();
            document.addEventListener('click', (event) => {
              if (event.target.tagName === 'A') {
                const href = event.target.getAttribute('href');
                if (href && !href.startsWith('#') && href.endsWith('.md')) {
                  vscode.postMessage({ command: 'openLink', href: href });
                  event.preventDefault();
                }
              }
            });
          </script>
        </body>
        </html>
      `;
    };

    // Actualizar la vista previa inicialmente
    updateWebview();

    // Escuchar cambios en el documento y actualizar la vista previa
    const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document === document && previewPanels.get(document) === panel) {
        updateWebview();
      }
    });

    // Manejar mensajes del webview (clics en enlaces .md)
    panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.command === 'openLink') {
          const linkUri = vscode.Uri.file(path.resolve(path.dirname(document.fileName), message.href));
          try {
            // Abrir el documento linkeado solo para leer su contenido
            const linkedDocument = await vscode.workspace.openTextDocument(linkUri);

            // Crear un nuevo grupo para la vista previa del documento linkeado
            await vscode.commands.executeCommand('workbench.action.newGroupRight');
            await vscode.commands.executeCommand('workbench.action.focusRightGroup');

            // Crear un nuevo webview para el documento linkeado
            const newPanel = vscode.window.createWebviewPanel(
              'bloomMarkdownPreview',
              'Bloom Preview: ' + path.basename(linkUri.fsPath),
              vscode.ViewColumn.Active,
              {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(path.dirname(linkUri.fsPath))]
              }
            );

            // Guardar el nuevo panel en el mapa
            previewPanels.set(linkedDocument, newPanel);

            // Actualizar el contenido del nuevo webview
            const updateNewWebview = () => {
              const newHtmlContent = marked(linkedDocument.getText());
              newPanel.webview.html = `
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Bloom Markdown Preview</title>
                  <style>
                    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; }
                    a { color: var(--vscode-textLink-foreground); }
                  </style>
                </head>
                <body>
                  ${newHtmlContent}
                  <script>
                    const vscode = acquireVsCodeApi();
                    document.addEventListener('click', (event) => {
                      if (event.target.tagName === 'A') {
                        const href = event.target.getAttribute('href');
                        if (href && !href.startsWith('#') && href.endsWith('.md')) {
                          vscode.postMessage({ command: 'openLink', href: href });
                          event.preventDefault();
                        }
                      }
                    });
                  </script>
                </body>
                </html>
              `;
            };

            // Actualizar la vista previa del nuevo documento
            updateNewWebview();

            // Escuchar cambios en el documento linkeado
            const newChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
              if (event.document === linkedDocument && previewPanels.get(linkedDocument) === newPanel) {
                updateNewWebview();
              }
            });

            // Limpiar el listener cuando el panel se cierre
            newPanel.onDidDispose(() => {
              previewPanels.delete(linkedDocument);
              newChangeListener.dispose();
            }, undefined, context.subscriptions);

            // Manejar clics en enlaces del nuevo webview
            newPanel.webview.onDidReceiveMessage(
              async (newMessage) => {
                if (newMessage.command === 'openLink') {
                  const newLinkUri = vscode.Uri.file(path.resolve(path.dirname(linkUri.fsPath), newMessage.href));
                  const newLinkedDocument = await vscode.workspace.openTextDocument(newLinkUri);
                  // Crear un nuevo grupo para la vista previa del nuevo documento linkeado
                  await vscode.commands.executeCommand('workbench.action.newGroupRight');
                  await vscode.commands.executeCommand('workbench.action.focusRightGroup');
                  // Crear un nuevo webview
                  const newerPanel = vscode.window.createWebviewPanel(
                    'bloomMarkdownPreview',
                    'Bloom Preview: ' + path.basename(newLinkUri.fsPath),
                    vscode.ViewColumn.Active,
                    {
                      enableScripts: true,
                      retainContextWhenHidden: true,
                      localResourceRoots: [vscode.Uri.file(path.dirname(newLinkUri.fsPath))]
                    }
                  );
                  // Guardar el nuevo panel
                  previewPanels.set(newLinkedDocument, newerPanel);
                  // Actualizar el contenido
                  const newerHtmlContent = marked(newLinkedDocument.getText());
                  newerPanel.webview.html = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                      <meta charset="UTF-8">
                      <meta name="viewport" content="width=device-width, initial-scale=1.0">
                      <title>Bloom Markdown Preview</title>
                      <style>
                        body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; }
                        a { color: var(--vscode-textLink-foreground); }
                      </style>
                    </head>
                    <body>
                      ${newerHtmlContent}
                      <script>
                        const vscode = acquireVsCodeApi();
                        document.addEventListener('click', (event) => {
                          if (event.target.tagName === 'A') {
                            const href = event.target.getAttribute('href');
                            if (href && !href.startsWith('#') && href.endsWith('.md')) {
                              vscode.postMessage({ command: 'openLink', href: href });
                              event.preventDefault();
                            }
                          }
                        });
                      </script>
                    </body>
                    </html>
                  `;
                  // Escuchar cambios en el nuevo documento
                  const newerChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
                    if (event.document === newLinkedDocument && previewPanels.get(newLinkedDocument) === newerPanel) {
                      const newerContent = marked(newLinkedDocument.getText());
                      newerPanel.webview.html = `
                        <!DOCTYPE html>
                        <html lang="en">
                        <head>
                          <meta charset="UTF-8">
                          <meta name="viewport" content="width=device-width, initial-scale=1.0">
                          <title>Bloom Markdown Preview</title>
                          <style>
                            body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; }
                            a { color: var(--vscode-textLink-foreground); }
                          </style>
                        </head>
                        <body>
                          ${newerContent}
                          <script>
                            const vscode = acquireVsCodeApi();
                            document.addEventListener('click', (event) => {
                              if (event.target.tagName === 'A') {
                                const href = event.target.getAttribute('href');
                                if (href && !href.startsWith('#') && href.endsWith('.md')) {
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
                  });
                  // Limpiar el listener cuando el panel se cierre
                  newerPanel.onDidDispose(() => {
                    previewPanels.delete(newLinkedDocument);
                    newerChangeListener.dispose();
                  }, undefined, context.subscriptions);
                }
              },
              undefined,
              context.subscriptions
            );
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to open document: ${message.href}: ${errorMessage}`);
          }
        }
      },
      undefined,
      context.subscriptions
    );

    // Limpiar el panel y el listener cuando se cierre
    panel.onDidDispose(() => {
      previewPanels.delete(document);
      changeListener.dispose();
    }, undefined, context.subscriptions);
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {
  // Limpiar todos los paneles al desactivar la extensión
}