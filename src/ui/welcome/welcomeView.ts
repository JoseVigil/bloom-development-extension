// src/ui/welcome/welcomeView.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { UserManager } from '../../managers/userManager';
import { getUserOrgs } from '../../utils/githubApi';
import { getCurrentGitHubUser, getGitHubTokenFromSession } from '../../utils/githubOAuth';
import { GitOrchestrator, NucleusResult } from '../../core/gitOrchestrator';
import { Logger } from '../../utils/logger';
import { PythonScriptRunner } from '../../core/pythonScriptRunner';

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
            // 1. GUARDAR USUARIO EN GLOBALSTATE
            const user = await getCurrentGitHubUser();
            const orgs = await getUserOrgs();

            await UserManager.init(this.context).saveUser({
                githubUsername: user.login,
                githubOrg: githubOrg || user.login,
                allOrgs: [user.login, ...orgs.map(o => o.login)]
            });

            // 2. OBTENER TOKEN FRESCO DESDE SESIÓN DE VSCODE
            const token = await getGitHubTokenFromSession();
            if (!token) {
                throw new Error('No GitHub token available. Please authenticate again.');
            }

            // 3. CREAR ORCHESTRATOR
            const logger = new Logger();
            const orchestrator = new GitOrchestrator(
                this.context,
                token,
                logger,
                new PythonScriptRunner(this.context, logger)
            );

            // 4. DETECTAR ESTADO
            const status = await orchestrator.detectNucleusStatus(githubOrg || user.login);

            // 5. ELEGIR ACCIÓN SEGÚN ESTADO
            let result: NucleusResult;

            if (status.location === 'none') {
                // Crear nuevo
                const folder = await vscode.window.showOpenDialog({
                    canSelectFolders: true,
                    canSelectFiles: false,
                    canSelectMany: false,
                    title: 'Seleccionar carpeta parent para Nucleus',
                    openLabel: 'Seleccionar'
                });
                
                if (!folder || folder.length === 0) {
                    vscode.window.showWarningMessage('Creación cancelada');
                    return;
                }
                
                result = await orchestrator.createNucleus(
                    githubOrg || user.login,
                    folder[0].fsPath
                );

            } else if (status.location === 'remote') {
                // Clonar
                const folder = await vscode.window.showOpenDialog({
                    canSelectFolders: true,
                    canSelectFiles: false,
                    canSelectMany: false,
                    title: 'Seleccionar carpeta donde clonar',
                    openLabel: 'Seleccionar'
                });
                
                if (!folder || folder.length === 0) {
                    vscode.window.showWarningMessage('Clonación cancelada');
                    return;
                }
                
                result = await orchestrator.cloneNucleus(
                    githubOrg || user.login,
                    folder[0].fsPath
                );

            } else if (status.location === 'both' || status.location === 'local') {
                // Vincular existente
                if (!status.localPath) {
                    throw new Error('Local path not found in status');
                }
                
                result = await orchestrator.linkNucleus(
                    status.localPath,
                    githubOrg || user.login
                );
            } else {
                throw new Error('Unknown nucleus status');
            }

            // 6. MOSTRAR RESULTADO
            if (result.success) {
                this.panel?.webview.postMessage({
                    command: 'nucleusCreated',
                    message: result.message
                });
                
                setTimeout(() => {
                    this.panel?.dispose();
                    vscode.commands.executeCommand('bloom.syncNucleusProjects');
                }, 2000);
            } else {
                throw new Error(result.error || 'Error desconocido');
            }

        } catch (err: any) {
            this.panel?.webview.postMessage({
                command: 'error',
                text: err.message
            });
            
            vscode.window.showErrorMessage(`Error creando Nucleus: ${err.message}`);
        }
    }

    private getHtml(): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { 
            font-family: var(--vscode-font-family); 
            color: var(--vscode-foreground); 
            background: var(--vscode-editor-background); 
            padding: 40px;
            max-width: 600px;
            margin: 0 auto;
        }
        h1 { 
            font-size: 32px; 
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }
        p { 
            margin-bottom: 20px;
            line-height: 1.6;
        }
        select, input { 
            width: 100%; 
            padding: 12px; 
            margin-bottom: 15px; 
            border-radius: 4px; 
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
        }
        button { 
            padding: 12px 24px; 
            border-radius: 4px; 
            background: var(--vscode-button-background); 
            color: var(--vscode-button-foreground); 
            border: none; 
            cursor: pointer; 
            font-weight: 600;
            width: 100%;
            margin: 8px 0;
        }
        button:hover { 
            background: var(--vscode-button-hoverBackground); 
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
        }
        #status {
            padding: 12px;
            border-radius: 4px;
            margin-top: 20px;
            display: none;
        }
        #status.success {
            background: rgba(76, 201, 176, 0.2);
            border-left: 3px solid #4ec9b0;
            display: block;
        }
        #status.error {
            background: rgba(244, 135, 113, 0.2);
            border-left: 3px solid #f48771;
            display: block;
        }
    </style>
</head>
<body>
    <h1>🌸 Bienvenido a Bloom</h1>
    <p>Conectá con GitHub para comenzar a usar Bloom BTIP y gestionar tus proyectos.</p>

    <button id="authBtn">Conectar con GitHub</button>

    <div id="formContainer" style="display:none;">
        <div class="form-group">
            <label>Nombre</label>
            <input type="text" id="name" readonly />
        </div>

        <div class="form-group">
            <label>Email</label>
            <input type="text" id="email" readonly />
        </div>

        <div class="form-group">
            <label>Usuario de GitHub</label>
            <input type="text" id="username" readonly />
        </div>

        <div class="form-group">
            <label>Selecciona Organización</label>
            <select id="org">
                <option value="">Selecciona una organización</option>
            </select>
        </div>

        <button id="createBtn" disabled>Crear Nucleus</button>
    </div>

    <div id="status"></div>

    <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('authBtn').onclick = () => {
            vscode.postMessage({ command: 'authenticate' });
        };

        document.getElementById('org').onchange = () => {
            const org = document.getElementById('org').value;
            document.getElementById('createBtn').disabled = !org;
        };

        document.getElementById('createBtn').onclick = () => {
            const org = document.getElementById('org').value;
            vscode.postMessage({ command: 'createNucleus', githubOrg: org });
        };

        window.addEventListener('message', e => {
            const msg = e.data;
            
            if (msg.command === 'userAuthenticated') {
                document.getElementById('name').value = msg.name;
                document.getElementById('email').value = msg.email;
                document.getElementById('username').value = msg.username;
                
                const select = document.getElementById('org');
                select.innerHTML = '<option value="">Selecciona una organización</option>';
                
                // Agregar usuario personal
                const personalOpt = document.createElement('option');
                personalOpt.value = msg.username;
                personalOpt.textContent = msg.username + ' (Personal)';
                select.appendChild(personalOpt);
                
                // Agregar organizaciones
                msg.orgs.forEach(o => {
                    const opt = document.createElement('option');
                    opt.value = o.login;
                    opt.textContent = o.login;
                    select.appendChild(opt);
                });
                
                document.getElementById('formContainer').style.display = 'block';
                document.getElementById('authBtn').style.display = 'none';
            }
            
            if (msg.command === 'nucleusCreated') {
                const status = document.getElementById('status');
                status.textContent = msg.message;
                status.className = 'success';
            }
            
            if (msg.command === 'error') {
                const status = document.getElementById('status');
                status.textContent = msg.text;
                status.className = 'error';
            }
        });
    </script>
</body>
</html>
        `;
    }
}