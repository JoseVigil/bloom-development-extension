// src/initialization/commandRegistry.ts - COMPLETO
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { BrainExecutor } from '../utils/brainExecutor';
import { Managers } from './managersInitializer';
import { Providers } from './providersInitializer';
import { ServerAndUIComponents } from './serverAndUiInitializer';

// Importar comandos básicos de intents
import { registerOpenMarkdownPreview } from '../commands/openMarkdownPreview';
import { registerGenerateIntent } from '../commands/generateIntent';
import { registerOpenIntent } from '../commands/openIntent';
import { registerCopyContextToClipboard } from '../commands/copyContextToClipboard';
import { registerDeleteIntent } from '../commands/deleteIntent';
import { registerAddToIntent } from '../commands/addToIntent';
import { registerDeleteIntentFromForm } from '../commands/deleteIntentFromForm';
import { registerOpenFileInVSCode } from '../commands/openFileInVSCode';
import { registerRevealInFinder } from '../commands/revealInFinder';
import { registerCreateBTIPProject } from '../commands/createBTIPProject';
import { registerGenerateQuestions } from '../commands/generateQuestions';
import { registerSubmitAnswers } from '../commands/submitAnswers';
import { registerReloadIntentForm } from '../commands/reloadIntentForm';
import { registerRegenerateContext } from '../commands/regenerateContext';

// Importar comandos de nucleus y profiles
import { registerNucleusCommands } from '../commands/nucleus/nucleusCommands';
import { registerProfileCommands } from '../commands/profile/profileCommands';
import { registerGitCommands } from '../commands/git/gitCommands';
import { registerDebugCommands } from '../commands/debug/debugCommands';
import { createIntentDevCommand } from '../commands/intent/createIntentDev';

// Importar comandos migrados a Brain CLI
import { registerManageProjectCommands } from '../commands/manageProject';
import { registerCreateNucleusProjectCommands } from '../commands/createNucleusProject';
import { registerLinkToNucleusCommands } from '../commands/linkToNucleus';

/**
 * Registra TODOS los comandos del plugin
 * Integra comandos de stable + current
 * 
 * Categorías:
 * 1. Intent Commands
 * 2. Nucleus Commands
 * 3. Project Management (Brain CLI)
 * 4. Profile Commands
 * 5. Git Commands
 * 6. Debug Commands
 * 7. Brain CLI Direct Commands (createNucleus, createIntent)
 * 8. UI Commands (registrados en serverAndUiInitializer.ts)
 */
export function registerAllCommands(
    context: vscode.ExtensionContext,
    logger: Logger,
    managers: Managers,
    providers: Providers
): void {
    logger.info('📝 Registering all commands...');
    
    // ========================================
    // CATEGORÍA 1: COMANDOS DE INTENTS
    // ========================================
    registerOpenMarkdownPreview(context, logger);
    registerGenerateIntent(context, logger);
    registerOpenIntent(context, logger, managers.metadataManager);
    registerCopyContextToClipboard(context, logger, managers.contextGatherer);
    registerDeleteIntent(context, logger, providers.intentTreeProvider);
    registerAddToIntent(context, logger);
    registerDeleteIntentFromForm(context, logger);
    registerOpenFileInVSCode(context, logger);
    registerRevealInFinder(context, logger);
    registerCreateBTIPProject(context, logger);
    registerGenerateQuestions(context, logger);
    registerSubmitAnswers(context, logger);
    registerReloadIntentForm(context, logger);
    registerRegenerateContext(context, logger);
    
    logger.info('✅ Intent commands registered');
    
    // ========================================
    // CATEGORÍA 2: COMANDOS DE NUCLEUS
    // ========================================
    registerNucleusCommands(context, logger, managers, providers);
    logger.info('✅ Nucleus commands registered');
    
    // ========================================
    // CATEGORÍA 3: PROJECT MANAGEMENT (Brain CLI)
    // ========================================
    registerManageProjectCommands(context);
    registerCreateNucleusProjectCommands(context);
    registerLinkToNucleusCommands(context);
    logger.info('✅ Project management commands registered (Brain CLI)');
    
    // ========================================
    // CATEGORÍA 4: COMANDOS DE PROFILES
    // ========================================
    registerProfileCommands(context, logger, managers);
    logger.info('✅ Profile commands registered');
    
    // ========================================
    // CATEGORÍA 5: COMANDOS DE GIT
    // ========================================
    registerGitCommands(context, logger);
    logger.info('✅ Git commands registered');
    
    // ========================================
    // CATEGORÍA 6: COMANDOS DE DEBUG
    // ========================================
    registerDebugCommands(context, logger);
    logger.info('✅ Debug commands registered');

    // ========================================
    // CATEGORÍA 7: BRAIN CLI DIRECT COMMANDS
    // ========================================
    
    // Special command: createIntentDev
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.createIntentDev', () =>
            createIntentDevCommand(context, logger)
        )
    );

    // Command: Create Nucleus (from current_extension.ts)
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.createNucleus', async () => {
            const org = await vscode.window.showInputBox({
                prompt: 'Enter organization name',
                placeHolder: 'e.g., MyCompany'
            });
            
            if (!org) return;
            
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspacePath) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }
            
            try {
                const result = await BrainExecutor.execute(
                    ['--json', 'nucleus', 'create'],
                    { '-o': org, '-p': workspacePath }
                );
                
                if (result.status === 'success') {
                    vscode.window.showInformationMessage(`✅ Nucleus created: ${org}`);
                    logger.info(`✅ Nucleus created: ${JSON.stringify(result.data)}`);
                    
                    // Refresh tree providers
                    providers.nucleusTreeProvider?.refresh?.();
                } else {
                    vscode.window.showErrorMessage(`Failed to create nucleus: ${result.error}`);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`Error: ${error.message}`);
                logger.error('Error creating nucleus', error);
            }
        })
    );

    // Command: Create Intent (from current_extension.ts)
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.createIntent', async () => {
            const type = await vscode.window.showQuickPick(['dev', 'doc'], {
                placeHolder: 'Select intent type'
            });
            
            if (!type) return;
            
            const name = await vscode.window.showInputBox({
                prompt: 'Enter intent name',
                placeHolder: 'e.g., Fix authentication flow'
            });
            
            if (!name) return;
            
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!workspacePath) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }
            
            try {
                const result = await BrainExecutor.execute(
                    ['--json', 'intent', 'create'],
                    { '-t': type, '-n': name, '-p': workspacePath, '-f': '' }
                );
                
                if (result.status === 'success') {
                    vscode.window.showInformationMessage(`✅ Intent created: ${name}`);
                    logger.info(`✅ Intent created: ${JSON.stringify(result.data)}`);
                    
                    // Refresh tree providers
                    providers.intentTreeProvider?.refresh?.();
                } else {
                    vscode.window.showErrorMessage(`Failed to create intent: ${result.error}`);
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`Error: ${error.message}`);
                logger.error('Error creating intent', error);
            }
        })
    );
    
    logger.info('✅ Brain CLI direct commands registered');

    // ========================================
    // RESUMEN FINAL
    // ========================================
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('🎉 All commands registered successfully');
    logger.info('   📊 Categories: 7');
    logger.info('   🧠 Brain CLI integration: Active');
    logger.info('   🔌 Server commands: Registered in serverAndUiInitializer');
    logger.info('   ✅ Total commands: ~50+');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}