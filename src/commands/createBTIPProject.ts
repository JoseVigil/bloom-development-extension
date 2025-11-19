import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ProjectStrategy, createDefaultConfig, BloomConfig } from '../models/bloomConfig';
import * as path from 'path';
import { joinPath } from '../utils/uriHelper';

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

            const strategy = await promptStrategy();
            if (!strategy) return;

            const strategyConfig = await promptStrategyConfig(strategy);
            if (!strategyConfig) return;

            await createBloomStructure(
                workspaceFolder,
                strategy,
                strategyConfig,
                logger
            );

            vscode.window.showInformationMessage(
                `✅ Proyecto BTIP creado con estrategia: ${strategy}`
            );
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.createBTIPProject" registrado');
}

async function getProjectRoot(uri?: vscode.Uri): Promise<vscode.WorkspaceFolder | undefined> {
    if (uri) {
        return vscode.workspace.getWorkspaceFolder(uri);
    }
    return vscode.workspace.workspaceFolders?.[0];
}

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

async function promptStrategyConfig(strategy: ProjectStrategy): Promise<any> {
    switch (strategy) {
        case 'android':
            return {
                minSdk: parseInt(await vscode.window.showInputBox({
                    prompt: 'Minimum SDK',
                    value: '24'
                }) || '24'),
                targetSdk: 34,
                kotlinVersion: '1.9.0',
                useCompose: true
            };

        case 'python-flask':
            return {
                pythonVersion: '3.11',
                flaskVersion: '3.0.0',
                databaseType: await vscode.window.showQuickPick(
                    ['sqlite', 'postgresql', 'mysql'],
                    { placeHolder: 'Database type' }
                ) || 'sqlite',
                useAlembic: true
            };

        case 'php-laravel':
            return {
                phpVersion: '8.2',
                laravelVersion: '10.0',
                databaseDriver: await vscode.window.showQuickPick(
                    ['mysql', 'pgsql', 'sqlite'],
                    { placeHolder: 'Database driver' }
                ) || 'mysql',
                usePest: true
            };

        default:
            return {};
    }
}

async function createBloomStructure(
    workspaceFolder: vscode.WorkspaceFolder,
    strategy: ProjectStrategy,
    strategyConfig: any,
    logger: Logger
): Promise<void> {
    const bloomPath = vscode.Uri.file(
        path.join(workspaceFolder.uri.fsPath, '.bloom')
    );

    const directories = [
        joinPath(bloomPath, 'core'),
        joinPath(bloomPath, 'intents'),
        joinPath(bloomPath, 'project'),
        joinPath(bloomPath, 'utils')
    ];

    for (const dir of directories) {
        await vscode.workspace.fs.createDirectory(dir);
    }

    const config = createDefaultConfig(
        workspaceFolder.name,
        strategy,
        workspaceFolder
    );
    config.strategyConfig = strategyConfig;

    const configPath = joinPath(bloomPath, 'config.json');
    await vscode.workspace.fs.writeFile(
        configPath,
        Buffer.from(JSON.stringify(config, null, 2), 'utf-8')
    );

    await createBaseBloomFiles(bloomPath, strategy);

    logger.info('Estructura BTIP creada exitosamente');
}

async function createBaseBloomFiles(
    bloomPath: vscode.Uri,
    strategy: ProjectStrategy
): Promise<void> {
    const rulesContent = generateRulesContent(strategy);
    const rulesPath = joinPath(bloomPath, 'core', '.rules.bl');
    await vscode.workspace.fs.writeFile(
        rulesPath,
        Buffer.from(rulesContent, 'utf-8')
    );

    const standardsContent = generateStandardsContent(strategy);
    const standardsPath = joinPath(bloomPath, 'core', '.standards.bl');
    await vscode.workspace.fs.writeFile(
        standardsPath,
        Buffer.from(standardsContent, 'utf-8')
    );

    const contextContent = '# App Context\n\nDescripción del proyecto y contexto general.\n';
    const contextPath = joinPath(bloomPath, 'project', '.context.bl');
    await vscode.workspace.fs.writeFile(
        contextPath,
        Buffer.from(contextContent, 'utf-8')
    );
}

function generateRulesContent(strategy: ProjectStrategy): string {
    let content = '# Bloom Rules\n\n';
    content += '## General Rules\n\n';
    content += '- Mantener código limpio y documentado\n';
    content += '- Seguir principios SOLID\n';
    content += '- Escribir tests para nueva funcionalidad\n\n';

    switch (strategy) {
        case 'android':
            content += '## Android Rules\n\n';
            content += '- Usar Kotlin como lenguaje principal\n';
            content += '- Seguir Material Design guidelines\n';
            content += '- Implementar arquitectura MVVM\n';
            break;

        case 'python-flask':
            content += '## Python Flask Rules\n\n';
            content += '- Seguir PEP 8 style guide\n';
            content += '- Usar blueprints para modularidad\n';
            content += '- Implementar migraciones con Alembic\n';
            break;

        case 'php-laravel':
            content += '## PHP Laravel Rules\n\n';
            content += '- Seguir PSR-12 coding standard\n';
            content += '- Usar Eloquent ORM\n';
            content += '- Implementar Service Pattern\n';
            break;
    }

    return content;
}

function generateStandardsContent(strategy: ProjectStrategy): string {
    let content = '# Development Standards\n\n';
    content += '## Naming Conventions\n\n';

    switch (strategy) {
        case 'android':
            content += '- Classes: PascalCase\n';
            content += '- Functions: camelCase\n';
            content += '- Constants: UPPER_SNAKE_CASE\n';
            break;

        case 'python-flask':
            content += '- Classes: PascalCase\n';
            content += '- Functions: snake_case\n';
            content += '- Constants: UPPER_SNAKE_CASE\n';
            break;

        case 'php-laravel':
            content += '- Classes: PascalCase\n';
            content += '- Methods: camelCase\n';
            content += '- Variables: camelCase\n';
            break;
    }

    return content;
}