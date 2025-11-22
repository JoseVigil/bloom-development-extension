// src/ui/welcome/welcomeView.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { UserManager } from '../../managers/userManager';
import { getUserOrgs } from '../../utils/githubApi';
import { getCurrentGitHubUser } from '../../utils/githubOAuth';

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
            'Bienvenido a Bloom',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'ui', 'welcome'))]
            }
        );

        this.panel.webview.html = this.getHtml();
        this.panel.onDidDispose(() => { this.panel = undefined; });

        this.panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'authenticate':
                    await this.authenticateAndFillForm();
                    break;
                case 'createNucleus':
                    await this.createNucleus(msg.githubOrg);
                    break;
            }
        });
    }

    private async authenticateAndFillForm() {
        try {
            vscode.window.showInformationMessage('Conectando con GitHub...');

            const user = await getCurrentGitHubUser();
            const orgs = await getUserOrgs();

            this.panel?.webview.postMessage({
                command: 'userAuthenticated',
                name: user.name || user.login,
                email: user.email || 'email@privado.com',
                username: user.login,
                orgs: orgs
            });

        } catch (err: any) {
            this.panel?.webview.postMessage({
                command: 'error',
                text: err.message || 'No se pudo conectar con GitHub'
            });
        }
    }

    private async createNucleus(githubOrg?: string) {
        try {
            vscode.window.showInformationMessage('Creando tu Nucleus...');

            const user = await getCurrentGitHubUser();
            const orgs = await getUserOrgs();

            // GUARDAR TODAS LAS ORGS
            await UserManager.init(this.context).saveUser({
                githubUsername: user.login,
                githubOrg: githubOrg || user.login,
                allOrgs: [user.login, ...orgs.map(o => o.login)]
            });

            this.panel?.webview.postMessage({ 
                command: 'nucleusCreated', 
                message: '¡Listo! Ya podés usar Bloom.' 
            });

            setTimeout(() => {
                this.panel?.dispose();
                vscode.commands.executeCommand('bloom.focusRealNucleusView');
            }, 2000);

        } catch (err: any) {
            this.panel?.webview.postMessage({
                command: 'error',
                text: err.message || 'Error creando Nucleus'
            });
        }
    }

    private getHtml(): string {
        const htmlPath = path.join(this.context.extensionPath, 'src', 'ui', 'welcome', 'welcomeView.html');
        return require('fs').readFileSync(htmlPath, 'utf-8');
    }
}