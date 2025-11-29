// src/initialization/contextInitializer.ts
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { UserManager } from '../managers/userManager';

/**
 * Inicializa el contexto global de VSCode
 * Retorna true si el usuario está registrado
 */
export function initializeContext(
    context: vscode.ExtensionContext,
    logger: Logger
): boolean {
    // Inicializar UserManager
    UserManager.init(context);
    
    // Verificar estado de registro
    const isRegistered = UserManager.init(context).isRegistered();
    
    // Setear contexto global para las condiciones 'when' del package.json
    vscode.commands.executeCommand('setContext', 'bloom.isRegistered', isRegistered);
    
    logger.info(`📊 Estado de registro: ${isRegistered ? 'REGISTRADO' : 'NO REGISTRADO'}`);
    
    return isRegistered;
}