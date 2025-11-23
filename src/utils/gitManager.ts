// src/utils/gitManager.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface GitChange {
    file: string;
    status: 'added' | 'modified' | 'deleted';
}

export interface PendingCommit {
    repoPath: string;
    repoName: string;
    message: string;
    changes: GitChange[];
    timestamp: number;
}

export class GitManager {
    private static pendingCommits: PendingCommit[] = [];
    private static statusBarItem: vscode.StatusBarItem;

    static initialize(context: vscode.ExtensionContext) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'bloom.reviewPendingCommits';
        context.subscriptions.push(this.statusBarItem);
        this.updateStatusBar();
    }

    /**
     * Registra un commit pendiente SIN ejecutarlo
     */
    static async queueCommit(
        repoPath: string,
        message: string,
        files?: string[]
    ): Promise<void> {
        const repoName = path.basename(repoPath);
        
        // Detectar cambios
        const changes = await this.getChanges(repoPath, files);
        
        if (changes.length === 0) {
            return; // No hay nada que commitear
        }

        // Agregar a la cola
        this.pendingCommits.push({
            repoPath,
            repoName,
            message,
            changes,
            timestamp: Date.now()
        });

        this.updateStatusBar();
        this.showNotification(repoName, changes.length);
    }

    /**
     * Obtiene cambios en el repositorio
     */
    private static async getChanges(
        repoPath: string,
        files?: string[]
    ): Promise<GitChange[]> {
        try {
            const { stdout } = await execAsync('git status --porcelain', {
                cwd: repoPath
            });

            if (!stdout.trim()) {
                return [];
            }

            const lines = stdout.trim().split('\n');
            const changes: GitChange[] = [];

            for (const line of lines) {
                const status = line.substring(0, 2).trim();
                const file = line.substring(3);

                // Si se especificaron archivos, filtrar
                if (files && files.length > 0) {
                    if (!files.some(f => file.includes(f))) {
                        continue;
                    }
                }

                let changeStatus: 'added' | 'modified' | 'deleted';
                if (status.includes('A')) changeStatus = 'added';
                else if (status.includes('D')) changeStatus = 'deleted';
                else changeStatus = 'modified';

                changes.push({ file, status: changeStatus });
            }

            return changes;
        } catch (error) {
            console.error('Error getting git changes:', error);
            return [];
        }
    }

    /**
     * Muestra notificación de cambios pendientes
     */
    private static showNotification(repoName: string, changeCount: number) {
        const message = `💾 ${changeCount} cambio(s) guardado(s) en ${repoName}`;
        
        vscode.window.showInformationMessage(
            message,
            'Ver Cambios',
            'Más Tarde'
        ).then(selection => {
            if (selection === 'Ver Cambios') {
                vscode.commands.executeCommand('bloom.reviewPendingCommits');
            }
        });
    }

    /**
     * Actualiza status bar con contador
     */
    private static updateStatusBar() {
        if (this.pendingCommits.length === 0) {
            this.statusBarItem.hide();
            return;
        }

        const total = this.pendingCommits.reduce((sum, c) => sum + c.changes.length, 0);
        const repos = [...new Set(this.pendingCommits.map(c => c.repoName))].length;

        this.statusBarItem.text = `$(git-commit) ${total} cambios en ${repos} repo(s)`;
        this.statusBarItem.tooltip = 'Click para revisar y commitear';
        this.statusBarItem.show();
    }

    /**
     * Muestra panel de revisión de commits
     */
    static async reviewAndCommit(): Promise<void> {
        if (this.pendingCommits.length === 0) {
            vscode.window.showInformationMessage('No hay cambios pendientes');
            return;
        }

        // Crear panel webview
        const panel = vscode.window.createWebviewPanel(
            'bloomGitReview',
            'Revisar Commits Pendientes',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = this.getReviewHtml();

        // Enviar datos
        panel.webview.postMessage({
            command: 'loadCommits',
            commits: this.pendingCommits
        });

        // Escuchar acciones
        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'editMessage':
                    await this.editCommitMessage(message.index, message.newMessage);
                    panel.webview.postMessage({
                        command: 'loadCommits',
                        commits: this.pendingCommits
                    });
                    break;

                case 'commitAndPush':
                    await this.executeCommit(message.index, true);
                    this.pendingCommits.splice(message.index, 1);
                    
                    if (this.pendingCommits.length === 0) {
                        panel.dispose();
                    } else {
                        panel.webview.postMessage({
                            command: 'loadCommits',
                            commits: this.pendingCommits
                        });
                    }
                    this.updateStatusBar();
                    break;

                case 'commitOnly':
                    await this.executeCommit(message.index, false);
                    this.pendingCommits.splice(message.index, 1);
                    
                    if (this.pendingCommits.length === 0) {
                        panel.dispose();
                    } else {
                        panel.webview.postMessage({
                            command: 'loadCommits',
                            commits: this.pendingCommits
                        });
                    }
                    this.updateStatusBar();
                    break;

                case 'discard':
                    this.pendingCommits.splice(message.index, 1);
                    
                    if (this.pendingCommits.length === 0) {
                        panel.dispose();
                    } else {
                        panel.webview.postMessage({
                            command: 'loadCommits',
                            commits: this.pendingCommits
                        });
                    }
                    this.updateStatusBar();
                    break;

                case 'commitAll':
                    await this.commitAll(message.withPush);
                    panel.dispose();
                    break;
            }
        });
    }

    /**
     * Edita mensaje de commit
     */
    private static async editCommitMessage(index: number, newMessage: string) {
        if (this.pendingCommits[index]) {
            this.pendingCommits[index].message = newMessage;
        }
    }

    /**
     * Ejecuta un commit específico
     */
    private static async executeCommit(index: number, withPush: boolean): Promise<void> {
        const commit = this.pendingCommits[index];
        
        try {
            // Stage cambios
            await execAsync('git add .', { cwd: commit.repoPath });

            // Commit
            const escapedMessage = commit.message.replace(/"/g, '\\"');
            await execAsync(`git commit -m "${escapedMessage}"`, {
                cwd: commit.repoPath
            });

            // Push si se solicita
            if (withPush) {
                await execAsync('git push', { cwd: commit.repoPath });
                vscode.window.showInformationMessage(
                    `✅ Commit + Push exitoso en ${commit.repoName}`
                );
            } else {
                vscode.window.showInformationMessage(
                    `✅ Commit exitoso en ${commit.repoName} (sin push)`
                );
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(
                `Error en ${commit.repoName}: ${error.message}`
            );
        }
    }

    /**
     * Commitea todos los cambios pendientes
     */
    private static async commitAll(withPush: boolean): Promise<void> {
        let successful = 0;
        let failed = 0;

        for (const commit of this.pendingCommits) {
            try {
                await execAsync('git add .', { cwd: commit.repoPath });
                const escapedMessage = commit.message.replace(/"/g, '\\"');
                await execAsync(`git commit -m "${escapedMessage}"`, {
                    cwd: commit.repoPath
                });

                if (withPush) {
                    await execAsync('git push', { cwd: commit.repoPath });
                }
                
                successful++;
            } catch (error) {
                failed++;
            }
        }

        this.pendingCommits = [];
        this.updateStatusBar();

        const action = withPush ? 'Commit + Push' : 'Commit';
        vscode.window.showInformationMessage(
            `${action}: ${successful} exitosos, ${failed} fallidos`
        );
    }

    /**
     * HTML del panel de revisión
     */
    private static getReviewHtml(): string {
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
            padding: 20px;
        }
        h1 { margin-bottom: 20px; }
        .commit-card {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 16px;
            margin-bottom: 16px;
        }
        .commit-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .repo-name {
            font-weight: 600;
            font-size: 16px;
        }
        .timestamp {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .commit-message {
            width: 100%;
            padding: 8px;
            margin-bottom: 12px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-family: monospace;
        }
        .changes-list {
            margin-bottom: 12px;
            padding: 8px;
            background: rgba(0,0,0,0.2);
            border-radius: 4px;
            max-height: 150px;
            overflow-y: auto;
        }
        .change-item {
            font-family: monospace;
            font-size: 12px;
            padding: 2px 0;
        }
        .added { color: #4ec9b0; }
        .modified { color: #ce9178; }
        .deleted { color: #f48771; }
        .actions {
            display: flex;
            gap: 8px;
        }
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-danger {
            background: transparent;
            color: var(--vscode-errorForeground);
            border: 1px solid var(--vscode-errorForeground);
        }
        .bulk-actions {
            position: sticky;
            top: 0;
            background: var(--vscode-editor-background);
            padding: 16px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 20px;
            display: flex;
            gap: 8px;
        }
    </style>
</head>
<body>
    <h1>📋 Revisar Commits Pendientes</h1>
    
    <div class="bulk-actions">
        <button class="btn-primary" onclick="commitAll(true)">✅ Commit + Push Todos</button>
        <button class="btn-secondary" onclick="commitAll(false)">💾 Commit Todos (sin push)</button>
    </div>

    <div id="commits"></div>

    <script>
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', e => {
            if (e.data.command === 'loadCommits') {
                renderCommits(e.data.commits);
            }
        });

        function renderCommits(commits) {
            const container = document.getElementById('commits');
            container.innerHTML = commits.map((commit, i) => \`
                <div class="commit-card">
                    <div class="commit-header">
                        <span class="repo-name">📦 \${commit.repoName}</span>
                        <span class="timestamp">\${new Date(commit.timestamp).toLocaleString()}</span>
                    </div>
                    
                    <textarea class="commit-message" id="msg-\${i}">\${commit.message}</textarea>
                    
                    <div class="changes-list">
                        \${commit.changes.map(c => \`
                            <div class="change-item \${c.status}">
                                \${c.status === 'added' ? '+' : c.status === 'deleted' ? '-' : 'M'} \${c.file}
                            </div>
                        \`).join('')}
                    </div>
                    
                    <div class="actions">
                        <button class="btn-primary" onclick="commitAndPush(\${i})">
                            ✅ Commit + Push
                        </button>
                        <button class="btn-secondary" onclick="commitOnly(\${i})">
                            💾 Solo Commit
                        </button>
                        <button class="btn-secondary" onclick="editMessage(\${i})">
                            ✏️ Editar
                        </button>
                        <button class="btn-danger" onclick="discard(\${i})">
                            🗑️ Descartar
                        </button>
                    </div>
                </div>
            \`).join('');
        }

        function editMessage(index) {
            const newMessage = document.getElementById('msg-' + index).value;
            vscode.postMessage({
                command: 'editMessage',
                index: index,
                newMessage: newMessage
            });
        }

        function commitAndPush(index) {
            vscode.postMessage({
                command: 'commitAndPush',
                index: index
            });
        }

        function commitOnly(index) {
            vscode.postMessage({
                command: 'commitOnly',
                index: index
            });
        }

        function discard(index) {
            if (confirm('¿Descartar estos cambios?')) {
                vscode.postMessage({
                    command: 'discard',
                    index: index
                });
            }
        }

        function commitAll(withPush) {
            vscode.postMessage({
                command: 'commitAll',
                withPush: withPush
            });
        }
    </script>
</body>
</html>
        `;
    }

    /**
     * Obtiene conteo de commits pendientes
     */
    static getPendingCount(): number {
        return this.pendingCommits.length;
    }

    /**
     * Limpia commits pendientes
     */
    static clearPending(): void {
        this.pendingCommits = [];
        this.updateStatusBar();
    }
}