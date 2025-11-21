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
import { registerCreateNucleusProject, registerAppendProject } from './commands/createNucleusProject';
import { openIntentInBrowser, openProviderInBrowser } from './commands/openIntentInBrowser';

// ✅ NUEVO: Import Nucleus Provider
import { NucleusTreeProvider, openNucleusProject } from './providers/nucleusTreeProvider';

import {
    configureIntentProfile,
    changeIntentProfile,
    removeIntentProfile,
    getProfileConfigDescription
} from './commands/configureIntentProfile';

export function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    logger.info('Bloom plugin v2.0 activado');

    const metadataManager = new MetadataManager(logger);
    const contextGatherer = new ContextGatherer(logger);
    const tokenEstimator = new TokenEstimator();

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {

        // ========================================================================
        // INTENT TREE PROVIDER
        // ========================================================================
        const intentTreeProvider = new IntentTreeProvider(
            workspaceFolder,
            logger,
            metadataManager
        );

        vscode.window.registerTreeDataProvider('bloomIntents', intentTreeProvider);

        // ========================================================================
        // NUCLEUS TREE PROVIDER (FIXED)
        // ========================================================================
        const nucleusTreeProvider = new NucleusTreeProvider(
            workspaceFolder.uri.fsPath
        );

        // ✅ Registrar el tree view correctamente
        const nucleusTreeView = vscode.window.createTreeView('bloomNucleus', {
            treeDataProvider: nucleusTreeProvider,
            showCollapseAll: true
        });

        context.subscriptions.push(nucleusTreeView);

        // ✅ Registrar comando de sync que faltaba
        const syncNucleusCommand = vscode.commands.registerCommand(
            'bloom.syncNucleusProjects',
            async () => {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Syncing Nucleus projects...",
                    cancellable: false
                }, async () => {
                    nucleusTreeProvider.refresh();
                    vscode.window.showInformationMessage('✅ Nucleus projects synced');
                });
            }
        );

        // ✅ Registrar comando de open project
        const openNucleusProjectCommand = vscode.commands.registerCommand(
            'bloom.openNucleusProject',
            async (project: any) => {
                if (!project) {
                    vscode.window.showWarningMessage('No project selected');
                    return;
                }
                await openNucleusProject(project);
            }
        );

        context.subscriptions.push(syncNucleusCommand, openNucleusProjectCommand);

        // ========================================================================
        // INTENT COMMANDS
        // ========================================================================
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

        // ========================================================================
        // NUCLEUS COMMANDS
        // ========================================================================
        registerCreateNucleusProject(context, logger);
        registerAppendProject(context, logger);

        const copyFilePathDisposable = vscode.commands.registerCommand(
            'bloom.copyFilePath',
            async (filePath: string) => {
                await vscode.env.clipboard.writeText(filePath);
                vscode.window.showInformationMessage(`Path copiado: ${filePath}`);
            }
        );
        context.subscriptions.push(copyFilePathDisposable);

        // Registrar comandos de Chrome Profile Manager
        registerProfileCommands(context, logger, workspaceFolder);
    }

    registerOpenMarkdownPreview(context, logger);
    registerGenerateIntent(context, logger);

    logger.info('Todos los comandos registrados exitosamente');
}

export function deactivate() {}

/**
 * Registrar comandos de Chrome Profile Manager
 */
function registerProfileCommands(
    context: vscode.ExtensionContext,
    logger: Logger,
    workspaceFolder: vscode.WorkspaceFolder
) {
    // ========================================================================
    // TREE VIEW PROVIDER
    // ========================================================================
    
    const chromeManager = new ChromeProfileManager(context, logger);

    const profileTreeProvider = new ProfileTreeProvider(
        context,
        logger,
        chromeManager
    );

    const profilesTreeView = vscode.window.createTreeView('bloomProfiles', {
        treeDataProvider: profileTreeProvider,
        showCollapseAll: true
    });

    context.subscriptions.push(profilesTreeView);

    // ========================================================================
    // PROFILE MANAGER PANEL
    // ========================================================================

    const manageProfilesCommand = vscode.commands.registerCommand(
        'bloom.manageProfiles',
        async () => {
            await ProfileManagerPanel.render(
                context.extensionUri,
                logger,
                context
            );
        }
    );

    const refreshProfilesCommand = vscode.commands.registerCommand(
        'bloom.refreshProfiles',
        async () => {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "Refreshing Chrome profiles...",
                cancellable: false
            }, async () => {
                await profileTreeProvider.loadProfiles();
                vscode.window.showInformationMessage('✅ Profiles refreshed');
            });
        }
    );

    // ========================================================================
    // INTENT PROFILE CONFIGURATION
    // ========================================================================

    const configureIntentProfileCommand = vscode.commands.registerCommand(
        'bloom.configureIntentProfile',
        async (intent: Intent) => {
            if (!intent) {
                vscode.window.showWarningMessage('No intent selected');
                return;
            }
            
            await configureIntentProfile(intent, context, logger);
        }
    );

    const changeIntentProfileCommand = vscode.commands.registerCommand(
        'bloom.changeIntentProfile',
        async (intent: Intent) => {
            if (!intent) {
                vscode.window.showWarningMessage('No intent selected');
                return;
            }
            
            await changeIntentProfile(intent, context, logger);
        }
    );

    const removeIntentProfileCommand = vscode.commands.registerCommand(
        'bloom.removeIntentProfile',
        async (intent: Intent) => {
            if (!intent) {
                vscode.window.showWarningMessage('No intent selected');
                return;
            }
            
            await removeIntentProfile(intent, context, logger);
        }
    );

    // ========================================================================
    // BROWSER LAUNCH COMMANDS
    // ========================================================================

    const openIntentInBrowserCommand = vscode.commands.registerCommand(
        'bloom.openIntentInBrowser',
        async (intent?: Intent) => {
            if (!intent) {
                const intents = await getAvailableIntents(workspaceFolder);
                
                if (intents.length === 0) {
                    vscode.window.showInformationMessage('No intents found. Create one first.');
                    return;
                }

                const items = intents.map((i: Intent) => ({
                    label: i.metadata.name,
                    description: i.profileConfig 
                        ? getProfileConfigDescription(i.profileConfig)
                        : 'No profile configured',
                    intent: i
                }));

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select intent to open in browser'
                });

                if (!selected) {
                    return;
                }

                intent = selected.intent;
            }

            await openIntentInBrowser(intent, context, logger);
        }
    );

    const openClaudeCommand = vscode.commands.registerCommand(
        'bloom.openClaudeInBrowser',
        async () => {
            await openProviderInBrowser('claude', context, logger);
        }
    );

    const openChatGPTCommand = vscode.commands.registerCommand(
        'bloom.openChatGPTInBrowser',
        async () => {
            await openProviderInBrowser('chatgpt', context, logger);
        }
    );

    const openGrokCommand = vscode.commands.registerCommand(
        'bloom.openGrokInBrowser',
        async () => {
            await openProviderInBrowser('grok', context, logger);
        }
    );

    // ========================================================================
    // REGISTER ALL COMMANDS
    // ========================================================================

    context.subscriptions.push(
        manageProfilesCommand,
        refreshProfilesCommand,
        configureIntentProfileCommand,
        changeIntentProfileCommand,
        removeIntentProfileCommand,
        openIntentInBrowserCommand,
        openClaudeCommand,
        openChatGPTCommand,
        openGrokCommand
    );

    logger.info('Chrome Profile Manager commands registered');
}

/**
 * Helper: Obtener intents disponibles del workspace (SAFE VERSION)
 */
async function getAvailableIntents(workspaceFolder: vscode.WorkspaceFolder): Promise<Intent[]> {
    try {
        const intentsPath = path.join(
            workspaceFolder.uri.fsPath,
            '.bloom',
            'intents'
        );

        if (!fs.existsSync(intentsPath)) {
            return [];
        }

        const intentFiles = fs.readdirSync(intentsPath)
            .filter((f: string) => {
                const fullPath = path.join(intentsPath, f);
                const stat = fs.statSync(fullPath);
                return stat.isFile() && f.endsWith('.json');
            });

        const intents: Intent[] = [];

        for (const file of intentFiles) {
            try {
                const filePath = path.join(intentsPath, file);
                const content = fs.readFileSync(filePath, 'utf-8');
                
                const intent = JSON.parse(content) as Intent;
                
                if (!intent || !intent.metadata || !intent.metadata.name || !intent.metadata.id) {
                    console.warn(`[Bloom] Invalid intent: ${file}`);
                    continue;
                }

                intents.push(intent);

            } catch (parseError: any) {
                console.error(`[Bloom] Error parsing intent file ${file}:`, parseError.message);
            }
        }

        console.log(`[Bloom] Loaded ${intents.length} valid intents`);
        return intents;

    } catch (error: any) {
        console.error('[Bloom] Error loading intents:', error);
        return [];
    }
}