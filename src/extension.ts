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
import { openIntentInBrowser, openProviderInBrowser } from './commands/openIntentInBrowser';
import { NucleusTreeProvider } from './providers/nucleusTreeProvider';
import { NucleusWelcomeProvider } from './providers/nucleusWelcomeProvider';
import { WelcomeView } from './ui/welcome/welcomeView';
import { UserManager } from './managers/userManager';
import { NucleusSetupPanel } from './ui/nucleus/NucleusSetupPanel';
import { openNucleusProject } from './providers/nucleusTreeProvider';
import { linkToNucleus } from './commands/linkToNucleus';

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

    // ========================================
    // COMANDOS BÁSICOS
    // ========================================
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

    // ========================================
    // COMANDO: Reset Registration (DEBUG)
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.resetRegistration', async () => {
            const confirm = await vscode.window.showWarningMessage(
                '⚠️ ¿Estás seguro de que querés resetear el registro?\n\nEsto borrará:\n- Datos de GitHub guardados\n- Configuración de organizaciones\n- Estado de registro',
                { modal: true },
                'Sí, Resetear',
                'Cancelar'
            );

            if (confirm === 'Sí, Resetear') {
                try {
                    await UserManager.init(context).clear();
                    
                    vscode.window.showInformationMessage(
                        '✅ Registro reseteado exitosamente. La ventana se recargará...'
                    );
                    
                    // Recargar ventana después de 1 segundo
                    setTimeout(async () => {
                        await vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }, 1000);
                    
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Error reseteando registro: ${error.message}`);
                    logger.error('Error en resetRegistration', error);
                }
            }
        })
    );

    // ========================================
    // COMANDO: Show Welcome
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.showWelcome', () => {
            welcomeWebview.show();
        })
    );

    // ========================================
    // COMANDO: Create Nucleus Project (ahora abre Welcome)
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.createNucleusProject', async () => {
            // Siempre abrir Welcome, que maneja el flujo completo
            welcomeWebview.show();
        })
    );

    // ========================================
    // COMANDO: Link to Nucleus
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.linkToNucleus', async (uri?: vscode.Uri) => {
            await linkToNucleus(uri);
        })
    );

    // ========================================
    // COMANDOS: Profile & Browser
    // ========================================
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
        vscode.commands.registerCommand('bloom.openGrokInBrowser', () => openProviderInBrowser('grok', context, logger))
    );

    // ========================================
    // COMANDOS: Nucleus Management
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.focusRealNucleusView', () =>
            vscode.commands.executeCommand('workbench.view.extension.bloomAiBridge')
        ),
        vscode.commands.registerCommand('bloom.syncNucleusProjects', () => {
            nucleusTreeProvider.refresh();
            vscode.window.showInformationMessage('🔄 Nucleus tree actualizado');
        }),
        vscode.commands.registerCommand('bloom.openNucleusProject', (project: any) => {
            if (project) {
                openNucleusProject(project);
            }
        }),
        vscode.commands.registerCommand('bloom.createNewNucleus', () => {
            new NucleusSetupPanel(context).show();
        })
    );

    // ========================================
    // VERIFICACIÓN: Mostrar Welcome en primera instalación
    // ========================================
    const isRegistered = UserManager.init(context).isRegistered();
    
    logger.info(`Estado de registro: ${isRegistered ? 'REGISTRADO' : 'NO REGISTRADO'}`);
    
    if (!isRegistered) {
        logger.info('Primera instalación detectada - Mostrando Welcome');
        setTimeout(() => {
            welcomeWebview.show();
        }, 1000);
    }

    // Actualizar contexto de VSCode
    vscode.commands.executeCommand('setContext', 'bloom.isRegistered', isRegistered);
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