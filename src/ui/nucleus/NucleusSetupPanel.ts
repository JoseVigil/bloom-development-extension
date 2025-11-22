// src/ui/nucleus/NucleusSetupPanel.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { NucleusManager } from '../../core/nucleusManager';
import { getCurrentGitHubUser } from '../../utils/githubOAuth';
import { getUserOrgs } from '../../utils/githubApi';
import { UserManager } from '../../managers/userManager';

export class NucleusSetupPanel {
    private panel: vscode.WebviewPanel | undefined;
    private nucleusManager: NucleusManager;

    constructor(private context: vscode.ExtensionContext) {
        this.nucleusManager = new NucleusManager(context);
    }

    show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'bloomNucleusSetup',
            'Crear Nucleus',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.getHtml();
        this.panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'loadData':
                    await this.loadData();
                    break;
                case 'createNucleus':
                    await this.createNucleus(msg.org, msg.localPath, msg.isNew);
                    break;
            }
        });

        this.panel.onDidDispose(() => { this.panel = undefined; });
    }

    private async loadData() {
        try {
            const user = await getCurrentGitHubUser();
            const orgs = await getUserOrgs();

            this.panel?.webview.postMessage({
                command: 'dataLoaded',
                orgs
            });
        } catch (err: any) {
            this.panel?.webview.postMessage({ command: 'error', text: err.message });
        }
    }

    private async createNucleus(org: string, localPath: string, isNew: boolean) {
        try {
            const nucleusPath = await this.nucleusManager.createOrLinkNucleus(org, localPath, isNew);

            await UserManager.init(this.context).saveUser({
                githubUsername: (await getCurrentGitHubUser()).login,
                githubOrg: org
            });

            this.panel?.webview.postMessage({ command: 'success', path: nucleusPath });
        } catch (err: any) {
            this.panel?.webview.postMessage({ command: 'error', text: err.message });
        }
    }

    private getHtml(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; }
                    h1 { font-size: 24px; margin-bottom: 20px; }
                    p { margin-bottom: 20px; }
                    select, input { width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 4px; border: 1px solid var(--vscode-input-border); }
                    button { padding: 10px; border-radius: 4px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; margin: 5px 0; }
                    button:hover { background: var(--vscode-button-hoverBackground); }
                </style>
            </head>
            <body>
                <h1>Crear un Nuevo Nucleus</h1>
                <p>Selecciona la organización y la ubicación local para tu Nucleus.</p>
                <button id="loadBtn">Cargar Organizaciones</button>

                <select id="org" style="display:none;">
                    <option value="">Selecciona Organización</option>
                </select>

                <button id="newBtn" style="display:none;">Crear Carpeta Nueva</button>
                <button id="existingBtn" style="display:none;">Usar Carpeta Existente</button>

                <input type="text" id="localPath" placeholder="Ruta local" readonly style="display:none;"/>

                <button id="createBtn" disabled style="display:none;">Crear Nucleus</button>

                <div id="status"></div>

                <script>
                    const vscode = acquireVsCodeApi();

                    document.getElementById('loadBtn').onclick = () => {
                        vscode.postMessage({ command: 'loadData' });
                    };

                    document.getElementById('newBtn').onclick = async () => {
                        const folder = await vscode.window.showOpenDialog({ canSelectFolders: true });
                        if (folder) document.getElementById('localPath').value = folder[0].fsPath;
                    };

                    document.getElementById('existingBtn').onclick = async () => {
                        const folder = await vscode.window.showOpenDialog({ canSelectFolders: true });
                        if (folder) document.getElementById('localPath').value = folder[0].fsPath;
                    };

                    document.getElementById('createBtn').onclick = () => {
                        const org = document.getElementById('org').value;
                        const localPath = document.getElementById('localPath').value;
                        const isNew = document.getElementById('newBtn').clicked; // Simplificado
                        vscode.postMessage({ command: 'createNucleus', org, localPath, isNew });
                    };

                    window.addEventListener('message', e => {
                        const msg = e.data;
                        if (msg.command === 'dataLoaded') {
                            const select = document.getElementById('org');
                            msg.orgs.forEach(o => {
                                const opt = document.createElement('option');
                                opt.value = o.login;
                                opt.textContent = o.login;
                                select.appendChild(opt);
                            });
                            select.style.display = 'block';
                            document.getElementById('newBtn').style.display = 'block';
                            document.getElementById('existingBtn').style.display = 'block';
                            document.getElementById('createBtn').style.display = 'block';
                            document.getElementById('createBtn').disabled = false;
                        }
                        if (msg.command === 'success') {
                            document.getElementById('status').textContent = 'Nucleus creado!';
                        }
                        if (msg.command === 'error') {
                            document.getElementById('status').textContent = msg.text;
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }
}