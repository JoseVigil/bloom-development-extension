// src/extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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
import { ProfileManagerPanel } from './ui/profile/profileManagerPanel';
import { ChromeProfileManager } from './core/chromeProfileManager';
import { Intent } from './models/intent';
import { ProfileTreeProvider } from './providers/profileTreeProvider';
import { registerCreateNucleusProject } from './commands/createNucleusProject';
import { openIntentInBrowser, openProviderInBrowser } from './commands/openIntentInBrowser';
import { NucleusTreeProvider } from './providers/nucleusTreeProvider';
import { NucleusWelcomeProvider } from './providers/nucleusWelcomeProvider';
import { WelcomeView } from './ui/welcome/welcomeView';
import { UserManager } from './managers/userManager';
import { NucleusSetupPanel } from './ui/nucleus/NucleusSetupPanel';
import { openNucleusProject } from './providers/nucleusTreeProvider';



import {
    configureIntentProfile,
    changeIntentProfile,
    removeIntentProfile
} from './commands/configureIntentProfile';

export function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    logger.info('Bloom BTIP + Nucleus Premium activado');

    UserManager.init(context);

    const metadataManager = new MetadataManager(logger);
    const contextGatherer = new ContextGatherer(logger);
    const tokenEstimator = new TokenEstimator();

    const welcomeWebview = new WelcomeView(context);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

    // Intent Tree
    const intentTreeProvider = new IntentTreeProvider(workspaceFolder, logger, metadataManager);
    vscode.window.registerTreeDataProvider('bloomIntents', intentTreeProvider);

    // Nucleus Real + Welcome
    const nucleusTreeProvider = new NucleusTreeProvider(workspaceFolder.uri.fsPath, context);
    const nucleusWelcomeProvider = new NucleusWelcomeProvider(context);

    vscode.window.registerTreeDataProvider('bloomNucleus', nucleusTreeProvider);
    vscode.window.registerTreeDataProvider('bloomNucleusWelcome', nucleusWelcomeProvider);

    vscode.window.createTreeView('bloomNucleus', {
        treeDataProvider: nucleusTreeProvider,
        showCollapseAll: true
    });

    // Chrome Profile Manager
    const chromeProfileManager = new ChromeProfileManager(context, logger);
    ProfileTreeProvider.initialize(context, logger, chromeProfileManager);

    // === CORREGIDO: todos los registerCommand con los parámetros correctos ===
    registerOpenMarkdownPreview(context, logger);
    registerGenerateIntent(context, logger);
    registerOpenIntent(context, logger, metadataManager);
    registerCopyContextToClipboard(context, logger, contextGatherer);
    registerDeleteIntent(context, logger, intentTreeProvider);
    registerAddToIntent(context, logger);
    registerDeleteIntentFromForm(context, logger);
    registerOpenFileInVSCode(context, logger);
    registerRevealInFinder(context, logger);
    registerCreateBTIPProject(context, logger);
    registerGenerateQuestions(context, logger);
    registerSubmitAnswers(context, logger);
    registerIntegrateSnapshot(context, logger);
    registerReloadIntentForm(context, logger);
    registerRegenerateContext(context, logger);
    registerCreateNucleusProject(context, logger);

    // Profile & Browser commands
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.manageProfiles', () =>
            ProfileManagerPanel.createOrShow(context.extensionUri, logger, context)
        ),
        vscode.commands.registerCommand('bloom.refreshProfiles', () =>
            ProfileTreeProvider.getInstance().refresh()
        ),
        vscode.commands.registerCommand('bloom.configureIntentProfile', (intent: Intent) =>
            intent && configureIntentProfile(intent, context, logger)
        ),
        vscode.commands.registerCommand('bloom.changeIntentProfile', (intent: Intent) =>
            intent && changeIntentProfile(intent, context, logger)
        ),
        vscode.commands.registerCommand('bloom.removeIntentProfile', (intent: Intent) =>
            intent && removeIntentProfile(intent, context, logger)
        ),
        vscode.commands.registerCommand('bloom.openIntentInBrowser', async (intent?: Intent) => {
            if (!intent) {
                const intents = await getAvailableIntents(workspaceFolder);
                if (intents.length === 0) return vscode.window.showInformationMessage('No intents found');
                const selected = await vscode.window.showQuickPick(
                    intents.map(i => ({ label: i.metadata.name, intent: i })),
                    { placeHolder: 'Select intent' }
                );
                intent = selected?.intent;
            }
            if (intent) await openIntentInBrowser(intent, context, logger);
        }),
        vscode.commands.registerCommand('bloom.openClaudeInBrowser', () => openProviderInBrowser('claude', context, logger)),
        vscode.commands.registerCommand('bloom.openChatGPTInBrowser', () => openProviderInBrowser('chatgpt', context, logger)),
        vscode.commands.registerCommand('bloom.openGrokInBrowser', () => openProviderInBrowser('grok', context, logger)),
        vscode.commands.registerCommand('bloom.showWelcome', () => welcomeWebview.show()),
        vscode.commands.registerCommand('bloom.focusRealNucleusView', () =>
            vscode.commands.executeCommand('workbench.view.extension.bloomNucleus')
        ),
        vscode.commands.registerCommand('bloom.syncNucleusProjects', () => nucleusTreeProvider.refresh()),
        vscode.commands.registerCommand('bloom.openNucleusProject', (project: any) => project && openNucleusProject(project)),
        vscode.commands.registerCommand('bloom.createNewNucleus', () => new NucleusSetupPanel(context).show())
    );

    // Registro premium
    if (!UserManager.init(context).isRegistered()) {
        setTimeout(() => welcomeWebview.show(), 1000);
    }

    vscode.commands.executeCommand('setContext', 'bloom.isRegistered', UserManager.init(context).isRegistered());
}

async function getAvailableIntents(workspaceFolder: vscode.WorkspaceFolder): Promise<Intent[]> {
    const intentsPath = path.join(workspaceFolder.uri.fsPath, '.bloom', 'intents');
    if (!fs.existsSync(intentsPath)) return [];

    const files = fs.readdirSync(intentsPath).filter(f => f.endsWith('.json'));
    const intents: Intent[] = [];

    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(intentsPath, file), 'utf-8')) as Intent;
            if (data?.metadata?.name) intents.push(data);
        } catch { }
    }
    return intents;
}

export function deactivate() {
    // VS Code limpia todo automáticamente
}