// src/initialization/commandRegistry.ts
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { Managers } from './managersInitializer';
import { Providers } from './providersInitializer';

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

// ============================================================================
// MIGRATED COMMANDS - Using Brain CLI
// ============================================================================
import { registerManageProjectCommands } from '../commands/manageProject';
import { registerCreateNucleusProjectCommands } from '../commands/createNucleusProject';
import { registerLinkToNucleusCommands } from '../commands/linkToNucleus';

/**
 * Registra TODOS los comandos del plugin
 * Organizado por categorías
 * 
 * UPDATED: Removed integrateSnapshot (migrated to Brain CLI workflow)
 * UPDATED: All commands now use BrainExecutor for Python operations
 */
export function registerAllCommands(
    context: vscode.ExtensionContext,
    logger: Logger,
    managers: Managers,
    providers: any
): void {
    logger.info('📝 Registrando comandos...');
    
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
    // ❌ REMOVED: registerIntegrateSnapshot - Now handled by Brain CLI intent merge workflow
    registerReloadIntentForm(context, logger);
    registerRegenerateContext(context, logger);
    
    logger.info('✅ Intent commands registered');
    
    // ========================================
    // CATEGORÍA 2: COMANDOS DE NUCLEUS
    // (Incluye comandos migrados a Brain CLI)
    // ========================================
    registerNucleusCommands(context, logger, managers, providers);
    logger.info('✅ Nucleus commands registered');
    
    // ========================================
    // CATEGORÍA 3: COMANDOS DE PROJECT MANAGEMENT
    // ✅ MIGRATED: Using Brain CLI
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
    // CATEGORÍA 7: COMANDOS ESPECIALES
    // ✅ MIGRATED: Uses BrainExecutor.createIntentDev
    // ========================================
    const createIntentDevDisposable = vscode.commands.registerCommand(
        'bloom.createIntentDev',
        () => createIntentDevCommand(context, logger)
    );
    context.subscriptions.push(createIntentDevDisposable);
    
    logger.info('✅ All commands registered successfully');
    logger.info('   📊 Total categories: 7');
    logger.info('   🧠 Brain CLI integration: Active');
    logger.info('   ✅ Legacy Python scripts: Removed');
}