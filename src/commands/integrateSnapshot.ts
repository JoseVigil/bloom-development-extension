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
    
                const pythonRunner = new PythonScriptRunner(context, logger);
    
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
    
                        const dryRunResult = await pythonRunner.integrateSnapshot(
                            snapshotPath,
                            workspaceFolder.uri.fsPath,
                            treePath,
                            backupDir,
                            true
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
                            {}
                        );
    
                        previewPanel.webview.html = `
                            <html>
                            <body>
                                <h1>Preview de Cambios</h1>
                                <pre>${dryRunResult.stdout}</pre>
                                <button onclick="integrate()">Integrar Ahora</button>
                            </body>
                            </html>
                        `;
                    });
    
                    return;
                }
    
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Integrando snapshot...',
                    cancellable: false
                }, async (progress) => {
                    progress.report({ increment: 0, message: 'Creando backup...' });
    
                    const result = await pythonRunner.integrateSnapshot(
                        snapshotPath,
                        workspaceFolder.uri.fsPath,
                        treePath,
                        backupDir,
                        false
                    );
    
                    progress.report({ increment: 50, message: 'Aplicando cambios...' });
    
                    if (!result.success) {
                        vscode.window.showErrorMessage(
                            `Error integrando snapshot: ${result.stderr}`
                        );
                        return;
                    }
    
                    progress.report({ increment: 80, message: 'Regenerando tree...' });
    
                    await pythonRunner.generateTree(
                        treePath,
                        [workspaceFolder.uri.fsPath]
                    );
    
                    progress.report({ increment: 100 });
    
                    await session.updateWorkflow({
                        stage: 'integrated',
                        integrationStatus: 'success'
                    });
    
                    vscode.window.showInformationMessage(
                        '✅ Snapshot integrado exitosamente'
                    );
                });
            }
        );
    
        context.subscriptions.push(disposable);
        logger.info('Comando "bloom.integrateSnapshot" registrado');
    }