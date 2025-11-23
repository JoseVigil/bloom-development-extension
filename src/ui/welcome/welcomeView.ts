// src/ui/welcome/welcomeView.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
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
            // 1. GUARDAR USUARIO EN GLOBALSTATE
            const user = await getCurrentGitHubUser();
            const orgs = await getUserOrgs();

            await UserManager.init(this.context).saveUser({
                githubUsername: user.login,
                githubOrg: githubOrg || user.login,
                allOrgs: [user.login, ...orgs.map(o => o.login)]
            });

            // 2. ELEGIR CARPETA DONDE CREAR NUCLEUS
            const selectedFolder = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Seleccionar carpeta donde crear Nucleus',
                title: `Crear nucleus-${githubOrg || user.login}`
            });

            if (!selectedFolder || selectedFolder.length === 0) {
                vscode.window.showWarningMessage('Creación cancelada');
                return;
            }

            const parentFolder = selectedFolder[0].fsPath;
            const nucleusName = `nucleus-${githubOrg || user.login}`;
            const nucleusPath = path.join(parentFolder, nucleusName);

            // 3. CREAR ESTRUCTURA FÍSICA DE NUCLEUS
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Creando Nucleus...',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Creando estructura...' });

                // Crear carpeta principal
                if (!fs.existsSync(nucleusPath)) {
                    fs.mkdirSync(nucleusPath, { recursive: true });
                }

                // Crear estructura .bloom/
                await this.createNucleusStructure(nucleusPath, githubOrg || user.login, user);

                progress.report({ message: 'Finalizando...' });
            });

            // 4. MOSTRAR ÉXITO Y CERRAR
            this.panel?.webview.postMessage({ 
                command: 'nucleusCreated', 
                message: `¡Nucleus creado en ${nucleusPath}!` 
            });

            vscode.window.showInformationMessage(
                `✅ Nucleus creado exitosamente en: ${nucleusPath}`,
                'Abrir Carpeta'
            ).then(selection => {
                if (selection === 'Abrir Carpeta') {
                    vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(nucleusPath), false);
                }
            });

            // Cerrar panel después de 2 segundos
            setTimeout(() => {
                this.panel?.dispose();
                vscode.commands.executeCommand('bloom.syncNucleusProjects');
            }, 2000);

        } catch (err: any) {
            this.panel?.webview.postMessage({
                command: 'error',
                text: err.message || 'Error creando Nucleus'
            });
            
            vscode.window.showErrorMessage(`Error creando Nucleus: ${err.message}`);
        }
    }

    /**
     * Crea la estructura completa de Nucleus sin depender de Python
     */
    private async createNucleusStructure(
        nucleusPath: string, 
        orgName: string, 
        user: any
    ): Promise<void> {
        const bloomPath = path.join(nucleusPath, '.bloom');

        // Crear directorios
        const dirs = [
            path.join(bloomPath, 'core'),
            path.join(bloomPath, 'organization'),
            path.join(bloomPath, 'projects')
        ];

        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }

        // 1. Crear nucleus-config.json
        const nucleusConfig = {
            type: 'nucleus',
            version: '1.0.0',
            id: this.generateUUID(),
            organization: {
                name: orgName,
                displayName: orgName,
                url: `https://github.com/${orgName}`,
                description: ''
            },
            nucleus: {
                name: `nucleus-${orgName}`,
                repoUrl: `https://github.com/${orgName}/nucleus-${orgName}.git`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            projects: [],
            settings: {
                autoIndexProjects: true,
                generateWebDocs: false
            }
        };

        fs.writeFileSync(
            path.join(bloomPath, 'core', 'nucleus-config.json'),
            JSON.stringify(nucleusConfig, null, 2),
            'utf-8'
        );

        // 2. Crear .rules.bl
        const rulesContent = `# Reglas del Nucleus - ${orgName}

## Convenciones de Código
- Usar nombres descriptivos
- Documentar funciones públicas
- Mantener consistencia con proyectos existentes

## Proceso de Review
- Todo código debe pasar por PR
- Al menos 1 aprobación requerida

## Testing
- Cobertura mínima: 70%
- Tests unitarios obligatorios para lógica crítica

---
bloom/v1
document_type: "nucleus_rules"
`;

        fs.writeFileSync(
            path.join(bloomPath, 'core', '.rules.bl'),
            rulesContent,
            'utf-8'
        );

        // 3. Crear .prompt.bl
        const promptContent = `# Prompt del Nucleus - ${orgName}

Eres un asistente de IA que ayuda a desarrolladores del equipo ${orgName}.

## Contexto de la Organización
[Completar con información sobre la organización]

## Proyectos Vinculados
[Se actualizará automáticamente con los proyectos linkeados]

## Tone & Style
- Profesional pero amigable
- Respuestas concisas y accionables
- Priorizar buenas prácticas

---
bloom/v1
document_type: "nucleus_prompt"
`;

        fs.writeFileSync(
            path.join(bloomPath, 'core', '.prompt.bl'),
            promptContent,
            'utf-8'
        );

        // 4. Crear .organization.bl
        const organizationContent = `# ${orgName}

## 📋 Información General

**Nombre:** ${orgName}
**GitHub:** https://github.com/${orgName}
**Creado:** ${new Date().toLocaleDateString()}

## 🎯 Misión

[Completar con la misión de la organización]

## 👥 Equipo

[Listar miembros del equipo]

## 📊 Métricas

- Proyectos activos: 0
- Desarrolladores: 1+
- Stack principal: [Definir]

---
bloom/v1
document_type: "organization_overview"
`;

        fs.writeFileSync(
            path.join(bloomPath, 'organization', '.organization.bl'),
            organizationContent,
            'utf-8'
        );

        // 5. Crear archivos de organización vacíos
        const orgFiles = ['about.bl', 'business-model.bl', 'policies.bl', 'protocols.bl'];
        for (const file of orgFiles) {
            const title = file.replace('.bl', '').replace('-', ' ').toUpperCase();
            const content = `# ${title}\n\n[Completar]\n\n---\nbloom/v1\ndocument_type: "organization_${file.replace('.bl', '')}"\n`;
            fs.writeFileSync(
                path.join(bloomPath, 'organization', file),
                content,
                'utf-8'
            );
        }

        // 6. Crear _index.bl
        const indexContent = `# Índice de Proyectos - ${orgName}

## Árbol de Proyectos

\`\`\`
${orgName}/
└── 🏢 nucleus-${orgName}  [Este proyecto - Centro de conocimiento]
\`\`\`

## Proyectos Vinculados

*No hay proyectos vinculados aún. Usa "Link to Nucleus" para agregar proyectos.*

---
bloom/v1
document_type: "projects_index"
auto_generated: true
updated_at: "${new Date().toISOString()}"
`;

        fs.writeFileSync(
            path.join(bloomPath, 'projects', '_index.bl'),
            indexContent,
            'utf-8'
        );

        // 7. Crear README.md
        const readmeContent = `# nucleus-${orgName}

Centro de conocimiento y documentación organizacional para ${orgName}.

## 🌸 Bloom Nucleus

Este repositorio usa Bloom BTIP para gestionar la documentación técnica y organizacional.

### Estructura

- \`.bloom/core/\` - Configuración del Nucleus
- \`.bloom/organization/\` - Documentación de la organización
- \`.bloom/projects/\` - Overviews de proyectos vinculados

### Uso

1. Abre este proyecto en VSCode con el plugin Bloom instalado
2. Usa "Link to Nucleus" en proyectos técnicos para vincularlos
3. Edita los archivos .bl para mantener la documentación actualizada

---

Generado por Bloom BTIP v1.0.0
`;

        fs.writeFileSync(
            path.join(nucleusPath, 'README.md'),
            readmeContent,
            'utf-8'
        );

        // 8. Crear .gitignore
        const gitignoreContent = `# Bloom
.bloom/cache/
.bloom/temp/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db
`;

        fs.writeFileSync(
            path.join(nucleusPath, '.gitignore'),
            gitignoreContent,
            'utf-8'
        );
    }

    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    private getHtml(): string {
        // HTML existente - no cambiar
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