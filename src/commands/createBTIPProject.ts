import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ProjectStrategy, createDefaultConfig, BloomConfig } from '../models/bloomConfig';
import * as path from 'path';
import { joinPath } from '../utils/uriHelper';
import { PythonExecutor } from '../utils/pythonExecutor';

export function registerCreateBTIPProject(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.createBTIPProject',
        async (uri?: vscode.Uri) => {
            logger.info('Ejecutando comando: Create BTIP Project');

            const workspaceFolder = await getProjectRoot(uri);
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No hay workspace abierto');
                return;
            }

            const bloomPath = path.join(workspaceFolder.uri.fsPath, '.bloom');

            // Verificar si ya existe
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(bloomPath));

                const overwrite = await vscode.window.showWarningMessage(
                    'Ya existe una estructura .bloom/. ¿Deseas sobrescribirla?',
                    'Sobrescribir',
                    'Cancelar'
                );

                if (overwrite !== 'Sobrescribir') {
                    return;
                }
            } catch {
                // No existe, continuar
            }

            // Verificar Python disponible
            const pythonExecutor = new PythonExecutor(logger);
            const pythonAvailable = await pythonExecutor.checkPythonAvailable();

            if (!pythonAvailable) {
                const configure = await vscode.window.showErrorMessage(
                    'Python no está disponible. El script generate_context.py requiere Python 3.',
                    'Configurar Python Path',
                    'Cancelar'
                );

                if (configure === 'Configurar Python Path') {
                    await vscode.commands.executeCommand('workbench.action.openSettings', 'bloom.pythonPath');
                }
                return;
            }

            // Seleccionar estrategia
            const strategy = await promptStrategy();
            if (!strategy) return;

            // Configuración específica de estrategia
            const strategyConfig = await promptStrategyConfig(strategy);
            if (!strategyConfig) return;

            // Mostrar progreso
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Generando proyecto BTIP',
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ message: 'Ejecutando generate_context.py...' });

                    // Ejecutar script Python
                    const result = await pythonExecutor.generateContext(
                        workspaceFolder.uri.fsPath,
                        strategy,
                        '.bloom'
                    );

                    if (!result.success) {
                        throw new Error(`Error al generar contexto: ${result.stderr}`);
                    }

                    logger.info(`Script ejecutado exitosamente: ${result.stdout}`);

                    progress.report({ message: 'Generando tree.txt inicial...' });

                    // Generar tree.txt
                    const treeOutputPath = path.join(bloomPath, 'project', 'tree.txt');
                    await pythonExecutor.generateTree(
                        treeOutputPath,
                        [workspaceFolder.uri.fsPath]
                    );

                    progress.report({ message: 'Creando config.json...' });

                    // Crear config.json
                    const config = createDefaultConfig(
                        workspaceFolder.name,
                        strategy,
                        workspaceFolder
                    );
                    config.strategyConfig = strategyConfig;

                    const configPath = joinPath(vscode.Uri.file(bloomPath), 'config.json');
                    await vscode.workspace.fs.writeFile(
                        configPath,
                        Buffer.from(JSON.stringify(config, null, 2), 'utf-8')
                    );

                    logger.info('Estructura BTIP creada exitosamente');
                }
            );

            // Mostrar mensaje de éxito
            const openContext = await vscode.window.showInformationMessage(
                `✅ Proyecto BTIP creado con estrategia: ${strategy}`,
                'Abrir .context.bl',
                'Abrir .app-context.bl'
            );

            if (openContext === 'Abrir .context.bl') {
                const contextPath = vscode.Uri.file(
                    path.join(bloomPath, 'project', '.context.bl')
                );
                await vscode.window.showTextDocument(contextPath);
            } else if (openContext === 'Abrir .app-context.bl') {
                const appContextPath = vscode.Uri.file(
                    path.join(bloomPath, 'project', '.app-context.bl')
                );
                await vscode.window.showTextDocument(appContextPath);
            }

            // Refrescar tree view
            vscode.commands.executeCommand('bloom.refreshIntentTree');
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.createBTIPProject" registrado');
}

// ✅ Agregar tipo de retorno
async function getProjectRoot(uri?: vscode.Uri): Promise<vscode.WorkspaceFolder | undefined> {
    if (uri) {
        return vscode.workspace.getWorkspaceFolder(uri);
    }
    return vscode.workspace.workspaceFolders?.[0];
}

// ✅ Agregar tipo de retorno
async function promptStrategy(): Promise<ProjectStrategy | undefined> {
    const strategies: { label: string; value: ProjectStrategy }[] = [
        { label: '🤖 Android (Kotlin/Java)', value: 'android' },
        { label: '🍎 iOS (Swift/Objective-C)', value: 'ios' },
        { label: '⚛️ React Web', value: 'react-web' },
        { label: '🟢 Node.js', value: 'node' },
        { label: '🐍 Python Flask + SQLite', value: 'python-flask' },
        { label: '🐘 PHP Laravel + MySQL', value: 'php-laravel' },
        { label: '📦 Generic Project', value: 'generic' }
    ];

    const selected = await vscode.window.showQuickPick(
        strategies.map(s => s.label),
        {
            placeHolder: 'Selecciona la estrategia del proyecto'
        }
    );

    if (!selected) return undefined;

    return strategies.find(s => s.label === selected)?.value;
}

// ✅ Agregar tipo de retorno
async function promptStrategyConfig(strategy: ProjectStrategy): Promise<any> {
    switch (strategy) {
        case 'android':
            const minSdk = await vscode.window.showInputBox({
                prompt: 'Minimum SDK',
                value: '24',
                validateInput: (value) => {
                    const num = parseInt(value);
                    return num >= 21 && num <= 35 ? null : 'SDK debe estar entre 21 y 35';
                }
            });

            const useCompose = await vscode.window.showQuickPick(
                ['Sí', 'No'],
                { placeHolder: '¿Usa Jetpack Compose?' }
            );

            return {
                minSdk: parseInt(minSdk || '24'),
                targetSdk: 34,
                kotlinVersion: '1.9.0',
                useCompose: useCompose === 'Sí'
            };

        case 'python-flask':
            const databaseType = await vscode.window.showQuickPick(
                ['sqlite', 'postgresql', 'mysql'],
                { placeHolder: 'Tipo de base de datos' }
            );

            return {
                pythonVersion: '3.11',
                flaskVersion: '3.0.0',
                databaseType: databaseType || 'sqlite',
                useAlembic: true
            };

        case 'php-laravel':
            const databaseDriver = await vscode.window.showQuickPick(
                ['mysql', 'pgsql', 'sqlite'],
                { placeHolder: 'Database driver' }
            );

            return {
                phpVersion: '8.2',
                laravelVersion: '10.0',
                databaseDriver: databaseDriver || 'mysql',
                usePest: true
            };

        default:
            return {};
    }
}