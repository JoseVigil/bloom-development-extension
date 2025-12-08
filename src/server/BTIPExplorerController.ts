import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

export class BTIPExplorerController {
  private static panel: vscode.WebviewPanel | undefined;
  private static context: vscode.ExtensionContext;

  public static async open(context: vscode.ExtensionContext): Promise<void> {
    this.context = context;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
      vscode.window.showErrorMessage('No workspace folder found');
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'btipExplorer',
      'BTIP Explorer',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'btip-explorer', 'dist'))
        ]
      }
    );

    this.panel.webview.html = await this.getWebviewContent();

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        await this.handleMessage(message);
      },
      undefined,
      context.subscriptions
    );

    this.panel.onDidDispose(
      () => {
        this.panel = undefined;
      },
      undefined,
      context.subscriptions
    );

    setTimeout(() => {
      this.panel?.webview.postMessage({
        type: 'config',
        baseUrl: 'http://localhost:48215',
        currentProjectPath: workspacePath
      });
    }, 500);
  }

  private static async handleMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'ready':
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        this.panel?.webview.postMessage({
          type: 'config',
          baseUrl: 'http://localhost:48215',
          currentProjectPath: workspacePath
        });
        break;
      case 'openFile':
        if (message.path) {
          const uri = vscode.Uri.file(message.path);
          await vscode.window.showTextDocument(uri);
        }
        break;
    }
  }

  private static async getWebviewContent(): Promise<string> {
    const distPath = path.join(this.context.extensionPath, 'btip-explorer', 'dist');
    const indexPath = path.join(distPath, 'index.html');

    try {
      let html = await fs.readFile(indexPath, 'utf-8');
      
      const webview = this.panel!.webview;
      const distUri = webview.asWebviewUri(vscode.Uri.file(distPath));

      html = html.replace(
        /(<script[^>]*src=["'])([^"']+)(["'][^>]*>)/g,
        `$1${distUri}/$2$3`
      );
      html = html.replace(
        /(<link[^>]*href=["'])([^"']+)(["'][^>]*>)/g,
        `$1${distUri}/$2$3`
      );

      return html;
    } catch (error) {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>BTIP Explorer</title>
          </head>
          <body>
            <h1>BTIP Explorer not found</h1>
            <p>Please build the btip-explorer project first.</p>
            <pre>${error}</pre>
          </body>
        </html>
      `;
    }
  }

  public static notifyUpdate(filePath: string): void {
    if (this.panel) {
      this.panel.webview.postMessage({
        type: 'btip:updated',
        path: filePath
      });
    }
  }
}