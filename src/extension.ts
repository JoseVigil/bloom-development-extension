import * as vscode from 'vscode';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
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

    // Create a new independent editor group to the right
    await vscode.commands.executeCommand('workbench.action.newGroupRight');
    await vscode.commands.executeCommand('workbench.action.focusRightGroup');

    // Create the webview panel in the new group
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

    // Render Markdown to HTML with marked
    const htmlContent = marked(document.getText());

    // HTML for the webview with JS to handle link clicks
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

    // Handle messages from the webview (clicks on .md links)
    panel.webview.onDidReceiveMessage(
      async (message) => {
        if (message.command === 'openLink') {
          const linkUri = vscode.Uri.file(path.resolve(path.dirname(document.fileName), message.href));
          try {
            // Open the linked document (but only to read its content, not to show it)
            const linkedDocument = await vscode.workspace.openTextDocument(linkUri);

            // Create a new group for the preview of the linked document
            await vscode.commands.executeCommand('workbench.action.newGroupRight');
            await vscode.commands.executeCommand('workbench.action.focusRightGroup');

            // Create a new webview for the linked document
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

            // Handle link clicks in the new webview
            newPanel.webview.onDidReceiveMessage(
              async (newMessage) => {
                if (newMessage.command === 'openLink') {
                  const newLinkUri = vscode.Uri.file(path.resolve(path.dirname(linkUri.fsPath), newMessage.href));
                  const newLinkedDocument = await vscode.workspace.openTextDocument(newLinkUri);
                  // Create a new group for the preview of the new linked document
                  await vscode.commands.executeCommand('workbench.action.newGroupRight');
                  await vscode.commands.executeCommand('workbench.action.focusRightGroup');
                  // Create a new webview for the new linked document
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
                  // Handle further link clicks
                  newerPanel.webview.onDidReceiveMessage(
                    async (newerMessage) => {
                      if (newerMessage.command === 'openLink') {
                        const newerLinkUri = vscode.Uri.file(path.resolve(path.dirname(newLinkUri.fsPath), newerMessage.href));
                        const newerLinkedDocument = await vscode.workspace.openTextDocument(newerLinkUri);
                        await vscode.commands.executeCommand('bloom.openMarkdownPreview');
                      }
                    },
                    undefined,
                    context.subscriptions
                  );
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
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}