// src/ui/welcome/welcomeView.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { UserManager } from '../../managers/userManager';

export class WelcomeView {
    private panel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) {}

    show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'bloomWelcome',
            'Bienvenido a Bloom Nucleus',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.getHtml();
        this.panel.webview.onDidReceiveMessage(async msg => {
            switch (msg.command) {
                case 'register':
                    await UserManager.init(this.context).register(msg.email, msg.name);
                    vscode.window.showInformationMessage(`¡Bienvenido ${msg.name.split(' ')[0]}! Tu Nucleus está listo.`);
                    this.panel?.dispose();
                    vscode.commands.executeCommand('bloom.focusRealNucleusView');
                    break;
                case 'error':
                    vscode.window.showErrorMessage(msg.text);
                    break;
                case 'open':
                    vscode.env.openExternal(vscode.Uri.parse(msg.url));
                    break;
            }
        });

        this.panel.onDidDispose(() => { this.panel = undefined; });
    }

    private getHtml(): string {
        const htmlPath = path.join(this.context.extensionPath, 'src', 'ui', 'welcome', 'welcomeView.html');
        return require('fs').readFileSync(htmlPath, 'utf-8');
    }
}