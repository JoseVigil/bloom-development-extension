import * as vscode from 'vscode';
import { registerOpenMarkdownPreview } from './commands/openMarkdownPreview';
import { registerGenerateIntent } from './commands/generateIntent';
import { registerOpenIntent } from './commands/openIntent';
import { registerCopyContextToClipboard } from './commands/copyContextToClipboard';
import { registerDeleteIntent } from './commands/deleteIntent';
import { registerAddToIntent } from './commands/addToIntent';
import { registerDeleteIntentFromForm } from './commands/deleteIntentFromForm';
import { registerOpenFileInVSCode } from './commands/openFileInVSCode';
import { registerRevealInFinder } from './commands/revealInFinder';
import { registerCreateBTIPProject } from './commands/createBTIPProject';
import { registerGenerateQuestions } from './commands/generateQuestions';
import { registerSubmitAnswers } from './commands/submitAnswers';
import { registerIntegrateSnapshot } from './commands/integrateSnapshot';
import { registerReloadIntentForm } from './commands/reloadIntentForm';
import { Logger } from './utils/logger';
import { MetadataManager } from './core/metadataManager';
import { ContextGatherer } from './core/contextGatherer';
import { TokenEstimator } from './utils/tokenEstimator';
import { IntentTreeProvider } from './providers/intentTreeProvider';
import { registerRegenerateContext } from './commands/regenerateContext';

export function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    logger.info('Bloom plugin v2.0 activado');

    const metadataManager = new MetadataManager(logger);
    const contextGatherer = new ContextGatherer(logger);
    const tokenEstimator = new TokenEstimator();

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
        const intentTreeProvider = new IntentTreeProvider(
            workspaceFolder,
            logger,
            metadataManager
        );

        vscode.window.registerTreeDataProvider('bloomIntents', intentTreeProvider);

        registerOpenIntent(context, logger, metadataManager);
        registerCopyContextToClipboard(context, logger, contextGatherer);
        registerDeleteIntent(context, logger, intentTreeProvider);
        registerAddToIntent(context, logger);
        registerDeleteIntentFromForm(context, logger);
        registerOpenFileInVSCode(context, logger);
        registerRevealInFinder(context, logger);

        registerCreateBTIPProject(context, logger);
        registerRegenerateContext(context, logger);
        registerGenerateQuestions(context, logger);
        registerSubmitAnswers(context, logger);
        registerIntegrateSnapshot(context, logger);
        registerReloadIntentForm(context, logger);

        const copyFilePathDisposable = vscode.commands.registerCommand(
            'bloom.copyFilePath',
            async (filePath: string) => {
                await vscode.env.clipboard.writeText(filePath);
                vscode.window.showInformationMessage(`Path copiado: ${filePath}`);
            }
        );
        context.subscriptions.push(copyFilePathDisposable);
    }

    registerOpenMarkdownPreview(context, logger);
    registerGenerateIntent(context, logger);

    logger.info('Todos los comandos registrados exitosamente');
}

export function deactivate() {}