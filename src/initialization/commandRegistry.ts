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
import { registerIntegrateSnapshot } from '../commands/integrateSnapshot';
import { registerReloadIntentForm } from '../commands/reloadIntentForm';
import { registerRegenerateContext } from '../commands/regenerateContext';

// Importar comandos de nucleus y profiles
import { registerNucleusCommands } from '../commands/nucleus/nucleusCommands';
import { registerProfileCommands } from '../commands/profile/profileCommands';
import { registerGitCommands } from '../commands/git/gitCommands';
import { registerDebugCommands } from '../commands/debug/debugCommands';

/**
 * Registra TODOS los comandos del plugin
 * Organizado por categorías
 */
export function registerAllCommands(
    context: vscode.ExtensionContext,
    logger: Logger,
    managers: Managers,
    providers: Providers
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
    registerIntegrateSnapshot(context, logger);
    registerReloadIntentForm(context, logger);
    registerRegenerateContext(context, logger);
    
    logger.info('✅ Intent commands registered');
    
    // ========================================
    // CATEGORÍA 2: COMANDOS DE NUCLEUS
    // ========================================
    registerNucleusCommands(context, logger, managers, providers);
    logger.info('✅ Nucleus commands registered');
    
    // ========================================
    // CATEGORÍA 3: COMANDOS DE PROFILES
    // ========================================
    registerProfileCommands(context, logger, managers);
    logger.info('✅ Profile commands registered');
    
    // ========================================
    // CATEGORÍA 4: COMANDOS DE GIT
    // ========================================
    registerGitCommands(context, logger);
    logger.info('✅ Git commands registered');
    
    // ========================================
    // CATEGORÍA 5: COMANDOS DE DEBUG
    // ========================================
    registerDebugCommands(context, logger);
    logger.info('✅ Debug commands registered');
    
    logger.info('✅ All commands registered successfully');
}