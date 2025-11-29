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
import { manageProject } from './commands/manageProject';
import { GitManager } from './utils/gitManager';

import {
    configureIntentProfile,
    changeIntentProfile,
    removeIntentProfile
} from './commands/configureIntentProfile';

export function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    logger.info('Bloom BTIP + Nucleus Premium activado');

    // Inicializar UserManager
    UserManager.init(context);

    // Inicializar GitManager
    GitManager.initialize(context);

    const metadataManager = new MetadataManager(logger);
    const contextGatherer = new ContextGatherer(logger);
    const tokenEstimator = new TokenEstimator();

    const welcomeWebview = new WelcomeView(context);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        logger.warn('No workspace folder detected - Limited functionality');
        // Aún así registrar comandos críticos
        registerCriticalCommands(context, logger, welcomeWebview);
        return;
    }

    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) {
        logger.error('VSCode Git extension not available');
    }

    // ========================================
    // TREE PROVIDERS
    // ========================================
    
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
    
    try {
        ProfileTreeProvider.initialize(context, logger, chromeProfileManager);
        logger.info('ProfileTreeProvider initialized successfully');
    } catch (error: any) {
        logger.error('Error initializing ProfileTreeProvider', error);
    }

    // ========================================
    // COMANDOS BÁSICOS DE INTENTS
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
    // COMANDOS: Chrome Profiles & Browser
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.manageProfiles', () => {
            try {
                ProfileManagerPanel.createOrShow(context.extensionUri, logger, context);
            } catch (error: any) {
                logger.error('Error opening profile manager', error);
                vscode.window.showErrorMessage(`Error abriendo gestor de perfiles: ${error.message}`);
            }
        })
    );

    

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.refreshProfiles', () => {
            try {
                const provider = ProfileTreeProvider.getInstance();
                if (provider) {
                    provider.refresh();
                    vscode.window.showInformationMessage('✅ Perfiles actualizados');
                    logger.info('Chrome profiles refreshed');
                } else {
                    throw new Error('ProfileTreeProvider not initialized');
                }
            } catch (error: any) {
                logger.error('Error refreshing profiles', error);
                vscode.window.showErrorMessage(`Error refrescando perfiles: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.configureIntentProfile', (intent: Intent) => {
            if (intent) {
                configureIntentProfile(intent, context, logger);
            } else {
                vscode.window.showWarningMessage('No intent selected');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.changeIntentProfile', (intent: Intent) => {
            if (intent) {
                changeIntentProfile(intent, context, logger);
            } else {
                vscode.window.showWarningMessage('No intent selected');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.removeIntentProfile', (intent: Intent) => {
            if (intent) {
                removeIntentProfile(intent, context, logger);
            } else {
                vscode.window.showWarningMessage('No intent selected');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openIntentInBrowser', async (intent?: Intent) => {
            try {
                if (!intent) {
                    const intents = await getAvailableIntents(workspaceFolder);
                    if (intents.length === 0) {
                        vscode.window.showInformationMessage('No hay intents disponibles');
                        return;
                    }
                    const selected = await vscode.window.showQuickPick(
                        intents.map(i => ({ label: i.metadata.name, intent: i })),
                        { placeHolder: 'Selecciona un intent' }
                    );
                    intent = selected?.intent;
                }
                if (intent) {
                    await openIntentInBrowser(intent, context, logger);
                }
            } catch (error: any) {
                logger.error('Error opening intent in browser', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openClaudeInBrowser', () => {
            openProviderInBrowser('claude', context, logger);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openChatGPTInBrowser', () => {
            openProviderInBrowser('chatgpt', context, logger);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openGrokInBrowser', () => {
            openProviderInBrowser('grok', context, logger);
        })
    );

    // ========================================
    // COMANDOS: Nucleus Management
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.showWelcome', () => {
            try {
                welcomeWebview.show();
                logger.info('Welcome view shown');
            } catch (error: any) {
                logger.error('Error showing welcome', error);
                vscode.window.showErrorMessage(`Error mostrando bienvenida: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.createNucleusProject', async () => {
            try {
                welcomeWebview.show();
                logger.info('Create Nucleus flow initiated');
            } catch (error: any) {
                logger.error('Error creating nucleus', error);
                vscode.window.showErrorMessage(`Error creando Nucleus: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.addProjectToNucleus', async (treeItem: any) => {
            try {
                if (!treeItem || !treeItem.data) {
                    vscode.window.showErrorMessage('Error: No se pudo obtener información del Nucleus');
                    return;
                }

                const orgName = treeItem.data.orgName;
                const nucleusPath = treeItem.data.nucleusPath;

                if (!nucleusPath) {
                    vscode.window.showErrorMessage(`No se encontró el Nucleus para ${orgName}`);
                    return;
                }

                await manageProject(nucleusPath, orgName);
            } catch (error: any) {
                logger.error('Error adding project to nucleus', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.linkToNucleus', async (uri?: vscode.Uri) => {
            try {
                await linkToNucleus(uri);
            } catch (error: any) {
                logger.error('Error linking to nucleus', error);
                vscode.window.showErrorMessage(`Error vinculando a Nucleus: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.syncNucleusProjects', () => {
            try {
                nucleusTreeProvider.refresh();
                vscode.window.showInformationMessage('🔄 Nucleus tree actualizado');
                logger.info('Nucleus tree refreshed');
            } catch (error: any) {
                logger.error('Error syncing nucleus projects', error);
                vscode.window.showErrorMessage(`Error sincronizando: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openNucleusProject', (project: any) => {
            try {
                if (project) {
                    openNucleusProject(project);
                } else {
                    vscode.window.showWarningMessage('No project selected');
                }
            } catch (error: any) {
                logger.error('Error opening nucleus project', error);
                vscode.window.showErrorMessage(`Error abriendo proyecto: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.createNewNucleus', () => {
            try {
                new NucleusSetupPanel(context).show();
                logger.info('Nucleus setup panel opened');
            } catch (error: any) {
                logger.error('Error opening nucleus setup', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.focusRealNucleusView', () => {
            vscode.commands.executeCommand('workbench.view.extension.bloomAiBridge');
        })
    );

    // ========================================
    // COMANDOS: Git Management
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.reviewPendingCommits', async () => {
            try {
                await GitManager.reviewAndCommit();
            } catch (error: any) {
                logger.error('Error reviewing commits', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

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
                    
                    logger.info('Registration reset - Reloading window');
                    
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
    // ⛓️‍💥 DESVINCULAR NUCLEUS (Botón oficial) – VERSIÓN 100% CORREGIDA
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.unlinkNucleus', async () => {
            const userData = await UserManager.getUserData() as {
                githubOrg: string | null;
                allOrgs: string[];
            } | null;

            if (!userData?.githubOrg) {
                vscode.window.showWarningMessage('Ningún Nucleus vinculado actualmente');
                return;
            }

            const org: string = userData.githubOrg;

            const choice = await vscode.window.showWarningMessage(
                `⛓️‍💥 Desvincular Nucleus de ${org}`,
                { 
                    modal: true, 
                    detail: "El repositorio local y remoto NO se borrarán.\nSolo se quitará del plugin. Podrás volver a levantarlo cuando quieras." 
                },
                'Sí, desvincular',
                'Cancelar'
            );

            if (choice !== 'Sí, desvincular') return;

            // Remover de la lista de organizaciones
            userData.allOrgs = userData.allOrgs.filter((o: string) => o !== org);

            // Si era el activo, pasar al siguiente (o null)
            if (userData.githubOrg === org) {
                userData.githubOrg = userData.allOrgs[0] || null;
            }

            // Guardar cambios
            await context.globalState.update('bloom.user', userData);

            // Actualizar contexto global de VSCode
            await vscode.commands.executeCommand('setContext', 'bloom.isRegistered', userData.githubOrg !== null);

            // Cerrar solo las carpetas relacionadas con este nucleus (corregido 100%)
            const foldersToRemove = vscode.workspace.workspaceFolders?.filter(folder =>
                folder.name.includes(`nucleus-${org}`) || 
                folder.uri.fsPath.includes(`nucleus-${org}`)
            ) ?? [];

            if (foldersToRemove.length > 0) {
                const indices = foldersToRemove.map(f => vscode.workspace.workspaceFolders!.indexOf(f));
                // Borrar de atrás hacia adelante para no romper índices
                for (let i = indices.length - 1; i >= 0; i--) {
                    await vscode.workspace.updateWorkspaceFolders(indices[i], 1);
                }
            }

            // Refresh del árbol
            nucleusTreeProvider.refresh();

            vscode.window.showInformationMessage(`✅ Nucleus ${org} desvinculado correctamente`);
        })
    );

    // ========================================
    // VERIFICACIÓN: Mostrar Welcome en primera instalación
    // ========================================
    const isRegistered = UserManager.init(context).isRegistered();
    
    logger.info(`Estado de registro: ${isRegistered ? 'REGISTRADO' : 'NO REGISTRADO'}`);
    
    if (!isRegistered) {
        logger.info('Primera instalación detectada - Mostrando Welcome en 1 segundo');
        setTimeout(() => {
            try {
                welcomeWebview.show();
            } catch (error: any) {
                logger.error('Error showing welcome on first run', error);
            }
        }, 1000);
    }

    // Actualizar contexto de VSCode
    vscode.commands.executeCommand('setContext', 'bloom.isRegistered', isRegistered);

    logger.info('✅ Bloom BTIP activation complete - All commands registered');
}

/**
 * Registra comandos críticos incluso sin workspace
 */
function registerCriticalCommands(
    context: vscode.ExtensionContext,
    logger: Logger,
    welcomeWebview: WelcomeView
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.showWelcome', () => {
            welcomeWebview.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.createNucleusProject', () => {
            welcomeWebview.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.resetRegistration', async () => {
            await UserManager.init(context).clear();
            vscode.window.showInformationMessage('Registro reseteado');
        })
    );

    logger.info('Critical commands registered (no workspace mode)');
}

/**
 * Obtiene intents disponibles en el workspace
 */
async function getAvailableIntents(workspaceFolder: vscode.WorkspaceFolder): Promise<Intent[]> {
    const intentsPath = path.join(workspaceFolder.uri.fsPath, '.bloom', 'intents');
    
    if (!fs.existsSync(intentsPath)) {
        return [];
    }

    const files = fs.readdirSync(intentsPath).filter(f => f.endsWith('.json'));
    const intents: Intent[] = [];

    for (const file of files) {
        try {
            const filePath = path.join(intentsPath, file);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Intent;
            
            if (data?.metadata?.name) {
                intents.push(data);
            }
        } catch (error) {
            // Skip invalid intent files
            console.warn(`Skipping invalid intent file: ${file}`);
        }
    }
    
    return intents;
}

export function deactivate() {
    // VS Code limpia todo automáticamente
}