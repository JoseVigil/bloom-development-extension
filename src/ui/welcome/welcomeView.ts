// src/ui/welcome/welcomeView.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { UserManager } from '../../managers/userManager';
import { getUserOrgs } from '../../utils/githubApi';
import { getCurrentGitHubUser, getGitHubTokenFromSession } from '../../utils/githubOAuth';
import { GitOrchestrator, NucleusResult } from '../../core/gitOrchestrator';
import { Logger } from '../../utils/logger';

export class WelcomeView {
    private panel: vscode.WebviewPanel | undefined;
    private logger: Logger;

    constructor(private context: vscode.ExtensionContext) {
        this.logger = new Logger();
    }

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
                retainContextWhenHidden: true
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

    private async createNucleus(githubOrg?: string | null) {
        try {
            const user = await getCurrentGitHubUser();
            const orgs = await getUserOrgs();
            const selectedOrg = githubOrg || user.login;

            await UserManager.init(this.context).saveUser({
                githubUsername: user.login,
                githubOrg: selectedOrg,
                allOrgs: [user.login, ...orgs.map(o => o.login)]
            });

            const token = await getGitHubTokenFromSession();
            if (!token) throw new Error('No GitHub token');

            const defaultPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath 
                ? path.dirname(vscode.workspace.workspaceFolders[0].uri.fsPath)
                : os.homedir();

            const status = await GitOrchestrator.detectNucleusStatus(selectedOrg, defaultPath);
            let result: NucleusResult;

            if (status.location === 'none') {
                const folder = await vscode.window.showOpenDialog({
                    canSelectFolders: true,
                    canSelectFiles: false,
                    canSelectMany: false,
                    defaultUri: vscode.Uri.file(defaultPath)
                });
                if (!folder) throw new Error('Cancelado');
                result = await GitOrchestrator.createNucleus(selectedOrg, folder[0].fsPath, token, this.context, this.logger);
            } else if (status.location === 'remote') {
                const folder = await vscode.window.showOpenDialog({
                    canSelectFolders: true,
                    canSelectFiles: false,
                    canSelectMany: false,
                    defaultUri: vscode.Uri.file(defaultPath)
                });
                if (!folder) throw new Error('Cancelado');
                result = await GitOrchestrator.cloneNucleus(selectedOrg, folder[0].fsPath);
            } else {
                result = await GitOrchestrator.linkNucleus(status.localPath!, selectedOrg);
            }

            if (result.success) {
                this.panel?.webview.postMessage({ command: 'nucleusCreated' });
                setTimeout(() => {
                    this.panel?.dispose();
                    vscode.commands.executeCommand('bloom.syncNucleusProjects');
                }, 2000);
            } else {
                throw new Error(result.error || 'Error');
            }
        } catch (err: any) {
            this.panel?.webview.postMessage({ command: 'error', text: err.message });
            vscode.window.showErrorMessage(err.message);
        }
    }

    private getHtml(): string {
        const htmlPath = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'ui', 'welcome', 'welcomeView.html').fsPath;
        return fs.readFileSync(htmlPath, 'utf8');
    }
}