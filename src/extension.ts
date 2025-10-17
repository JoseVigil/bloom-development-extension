import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
  console.log('Bloom Development Extension is now active!');

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

    // Guarda el archivo actual
    await document.save();

    // Ejecuta el comando interno de VS Code para abrir preview a la derecha (split view)
    await vscode.commands.executeCommand('markdown.showPreviewToSide');
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}