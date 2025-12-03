// src/commands/integrateSnapshot.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { IntentSession } from '../core/intentSession';
import { PythonScriptRunner } from '../core/pythonScriptRunner';

export function registerIntegrateSnapshot(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.integrateSnapshot',
        async (session: IntentSession) => {
            logger.info('Integrando snapshot al proyecto');

            const state = session.getState();
            
            if (state.workflow?.stage !== 'snapshot-downloaded') {
                vscode.window.showErrorMessage(
                    'Debes descargar el snapshot primero'
                );
                return;
            }

            const snapshotPath = state.workflow.snapshotPath;
            
            if (!snapshotPath) {
                vscode.window.showErrorMessage('No hay snapshot descargado');
                return;
            }

            const snapshotUri = vscode.Uri.file(snapshotPath);
            try {
                await vscode.workspace.fs.stat(snapshotUri);
            } catch {
                vscode.window.showErrorMessage('Archivo snapshot.md no encontrado');
                return;
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No hay workspace abierto');
                return;
            }

            const treePath = path.join(
                workspaceFolder.uri.fsPath,
                '.bloom',
                'project',
                'tree.txt'
            );

            const backupDir = path.join(
                workspaceFolder.uri.fsPath,
                '.bloom',
                'backups'
            );

            // ❌ ANTES: const pythonRunner = new PythonScriptRunner();
            // ✅ AHORA: Métodos estáticos - no necesita instancia

            const confirm = await vscode.window.showWarningMessage(
                '¿Integrar snapshot al proyecto? Esto modificará archivos.',
                { modal: true },
                'Ver Preview',
                'Integrar'
            );

            if (!confirm) return;

            if (confirm === 'Ver Preview') {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Generando preview...',
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 0 });

                    // ✅ Llamada estática
                    const dryRunResult = await PythonScriptRunner.integrateSnapshot(
                        snapshotPath,
                        workspaceFolder.uri.fsPath,
                        treePath,
                        backupDir,
                        true // dry-run
                    );

                    progress.report({ increment: 100 });

                    if (!dryRunResult.success) {
                        vscode.window.showErrorMessage(
                            `Error en preview: ${dryRunResult.stderr}`
                        );
                        return;
                    }

                    const previewPanel = vscode.window.createWebviewPanel(
                        'snapshotPreview',
                        'Snapshot Preview',
                        vscode.ViewColumn.Beside,
                        { enableScripts: true }
                    );

                    previewPanel.webview.html = getPreviewHtml(
                        dryRunResult.filesCreated || [],
                        dryRunResult.filesModified || [],
                        dryRunResult.conflicts || []
                    );

                    // Escuchar mensaje del webview para integrar
                    previewPanel.webview.onDidReceiveMessage(async (message) => {
                        if (message.command === 'integrate') {
                            previewPanel.dispose();
                            await executeIntegration(
                                snapshotPath,
                                workspaceFolder.uri.fsPath,
                                treePath,
                                backupDir,
                                session
                            );
                        }
                    });
                });

                return;
            }

            // Integración directa (sin preview)
            await executeIntegration(
                snapshotPath,
                workspaceFolder.uri.fsPath,
                treePath,
                backupDir,
                session
            );
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.integrateSnapshot" registrado');
}

/**
 * Ejecuta la integración del snapshot
 */
async function executeIntegration(
    snapshotPath: string,
    projectRoot: string,
    treePath: string,
    backupDir: string,
    session: IntentSession
): Promise<void> {
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Integrando snapshot...',
        cancellable: false
    }, async (progress) => {
        progress.report({ increment: 0, message: 'Creando backup...' });

        // ✅ Llamada estática
        const result = await PythonScriptRunner.integrateSnapshot(
            snapshotPath,
            projectRoot,
            treePath,
            backupDir,
            false // no dry-run
        );

        progress.report({ increment: 50, message: 'Aplicando cambios...' });

        if (!result.success) {
            vscode.window.showErrorMessage(
                `Error integrando snapshot: ${result.stderr}`
            );
            return;
        }

        progress.report({ increment: 80, message: 'Regenerando tree...' });

        // ✅ Llamada estática
        await PythonScriptRunner.generateTree(
            treePath,
            [projectRoot]
        );

        progress.report({ increment: 100 });

        await session.updateWorkflow({
            stage: 'integrated',
            integrationStatus: 'success'
        });

        // Mostrar resumen de cambios
        const summary = buildChangeSummary(
            result.filesCreated || [],
            result.filesModified || [],
            result.conflicts || []
        );

        vscode.window.showInformationMessage(
            '✅ Snapshot integrado exitosamente',
            'Ver Detalles'
        ).then(selection => {
            if (selection === 'Ver Detalles') {
                const detailsPanel = vscode.window.createWebviewPanel(
                    'integrationDetails',
                    'Detalles de Integración',
                    vscode.ViewColumn.Beside,
                    {}
                );
                detailsPanel.webview.html = getDetailsHtml(summary);
            }
        });
    });
}

/**
 * Genera HTML para preview de cambios
 */
function getPreviewHtml(
    filesCreated: string[],
    filesModified: string[],
    conflicts: string[]
): string {
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
        .section {
            margin-bottom: 24px;
        }
        .section h2 {
            font-size: 16px;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .file-list {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 12px;
            max-height: 300px;
            overflow-y: auto;
        }
        .file-item {
            font-family: monospace;
            font-size: 12px;
            padding: 4px 0;
        }
        .created { color: #4ec9b0; }
        .modified { color: #ce9178; }
        .conflict { color: #f48771; }
        .actions {
            position: sticky;
            top: 0;
            background: var(--vscode-editor-background);
            padding: 16px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 20px;
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
        .warning {
            background: rgba(255, 193, 7, 0.1);
            border: 1px solid rgba(255, 193, 7, 0.5);
            padding: 12px;
            border-radius: 4px;
            margin-bottom: 16px;
        }
    </style>
</head>
<body>
    <h1>📋 Preview de Integración</h1>
    
    <div class="actions">
        <button class="btn-primary" onclick="integrate()">✅ Integrar Ahora</button>
        <button class="btn-secondary" onclick="cancel()">❌ Cancelar</button>
    </div>

    ${conflicts.length > 0 ? `
        <div class="warning">
            ⚠️ <strong>Atención:</strong> Se detectaron ${conflicts.length} conflicto(s) potenciales.
            Revisa los archivos antes de integrar.
        </div>
    ` : ''}

    <div class="section">
        <h2>
            <span style="color: #4ec9b0;">+</span>
            Archivos Nuevos (${filesCreated.length})
        </h2>
        <div class="file-list">
            ${filesCreated.length > 0 
                ? filesCreated.map(f => `<div class="file-item created">+ ${f}</div>`).join('')
                : '<div class="file-item">Ninguno</div>'
            }
        </div>
    </div>

    <div class="section">
        <h2>
            <span style="color: #ce9178;">M</span>
            Archivos Modificados (${filesModified.length})
        </h2>
        <div class="file-list">
            ${filesModified.length > 0
                ? filesModified.map(f => `<div class="file-item modified">M ${f}</div>`).join('')
                : '<div class="file-item">Ninguno</div>'
            }
        </div>
    </div>

    ${conflicts.length > 0 ? `
        <div class="section">
            <h2>
                <span style="color: #f48771;">⚠️</span>
                Conflictos Potenciales (${conflicts.length})
            </h2>
            <div class="file-list">
                ${conflicts.map(f => `<div class="file-item conflict">⚠️ ${f}</div>`).join('')}
            </div>
        </div>
    ` : ''}

    <script>
        const vscode = acquireVsCodeApi();

        function integrate() {
            vscode.postMessage({ command: 'integrate' });
        }

        function cancel() {
            // VSCode cerrará el panel automáticamente
        }
    </script>
</body>
</html>
    `;
}

/**
 * Genera HTML para detalles de integración
 */
function getDetailsHtml(summary: string): string {
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
        pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 4px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <h1>✅ Integración Completada</h1>
    <pre>${summary}</pre>
</body>
</html>
    `;
}

/**
 * Construye resumen de cambios
 */
function buildChangeSummary(
    filesCreated: string[],
    filesModified: string[],
    conflicts: string[]
): string {
    let summary = 'RESUMEN DE INTEGRACIÓN\n';
    summary += '=====================\n\n';
    
    summary += `✅ Archivos creados: ${filesCreated.length}\n`;
    summary += `📝 Archivos modificados: ${filesModified.length}\n`;
    summary += `⚠️ Conflictos: ${conflicts.length}\n\n`;

    if (filesCreated.length > 0) {
        summary += 'ARCHIVOS CREADOS:\n';
        filesCreated.forEach(f => summary += `  + ${f}\n`);
        summary += '\n';
    }

    if (filesModified.length > 0) {
        summary += 'ARCHIVOS MODIFICADOS:\n';
        filesModified.forEach(f => summary += `  M ${f}\n`);
        summary += '\n';
    }

    if (conflicts.length > 0) {
        summary += 'CONFLICTOS:\n';
        conflicts.forEach(f => summary += `  ⚠️ ${f}\n`);
        summary += '\n';
    }

    return summary;
}