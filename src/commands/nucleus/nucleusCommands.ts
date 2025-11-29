// src/commands/nucleus/nucleusCommands.ts
import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';
import { Managers } from '../../initialization/managersInitializer';
import { Providers } from '../../initialization/providersInitializer';
import { UserManager } from '../../managers/userManager';
import { NucleusSetupPanel } from '../../ui/nucleus/NucleusSetupPanel';
import { openNucleusProject } from '../../providers/nucleusTreeProvider';
import { linkToNucleus } from '../linkToNucleus';
import { manageProject } from '../manageProject';

/**
 * Registra todos los comandos relacionados con Nucleus
 */
export function registerNucleusCommands(
    context: vscode.ExtensionContext,
    logger: Logger,
    managers: Managers,
    providers: Providers
): void {
    // ========================================
    // COMANDO: Show Welcome
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.showWelcome', () => {
            try {
                managers.welcomeView.show();
                logger.info('Welcome view shown');
            } catch (error: any) {
                logger.error('Error showing welcome', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Create Nucleus Project
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.createNucleusProject', async () => {
            try {
                managers.welcomeView.show();
                logger.info('Create Nucleus flow initiated');
            } catch (error: any) {
                logger.error('Error creating nucleus', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Create New Nucleus
    // ========================================
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

    // ========================================
    // COMANDO: Add Project to Nucleus
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.addProjectToNucleus', async (treeItem: any) => {
            try {
                if (!treeItem?.data) {
                    vscode.window.showErrorMessage('Error: No se pudo obtener información del Nucleus');
                    return;
                }

                const { orgName, nucleusPath } = treeItem.data;

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

    // ========================================
    // COMANDO: Link to Nucleus
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.linkToNucleus', async (uri?: vscode.Uri) => {
            try {
                await linkToNucleus(uri);
            } catch (error: any) {
                logger.error('Error linking to nucleus', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Sync Nucleus Projects
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.syncNucleusProjects', () => {
            try {
                providers.nucleusTreeProvider.refresh();
                vscode.window.showInformationMessage('🔄 Nucleus tree actualizado');
                logger.info('Nucleus tree refreshed');
            } catch (error: any) {
                logger.error('Error syncing nucleus projects', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Refresh Nucleus (alias de sync)
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.refreshNucleus', () => {
            try {
                providers.nucleusTreeProvider.refresh();
                vscode.window.showInformationMessage('🔄 Nucleus actualizado');
                logger.info('Nucleus refreshed');
            } catch (error: any) {
                logger.error('Error refreshing nucleus', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Open Nucleus Project
    // ========================================
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
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Focus Real Nucleus View
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.focusRealNucleusView', () => {
            vscode.commands.executeCommand('workbench.view.extension.bloomAiBridge');
        })
    );

    // ========================================
    // COMANDO: Unlink Nucleus (SIN DUPLICAR)
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.unlinkNucleus', async () => {
            try {
                const userManager = UserManager.init(context);
                const user = userManager.getUser();

                if (!user?.githubOrg) {
                    vscode.window.showWarningMessage('Ningún Nucleus vinculado actualmente');
                    return;
                }

                const org = user.githubOrg;

                const choice = await vscode.window.showWarningMessage(
                    `⛓️‍💥 Desvincular Nucleus de ${org}`,
                    { 
                        modal: true, 
                        detail: 'El repositorio local y remoto NO se borrarán.\nSolo se quitará del plugin.'
                    },
                    'Sí, desvincular',
                    'Cancelar'
                );

                if (choice !== 'Sí, desvincular') return;

                // Remover de allOrgs
                const updatedOrgs = user.allOrgs.filter(o => o !== org);
                const newActiveOrg = updatedOrgs[0] || user.githubUsername;

                // Actualizar usuario
                await userManager.saveUser({
                    githubUsername: user.githubUsername,
                    githubOrg: newActiveOrg,
                    allOrgs: updatedOrgs
                });

                // Cerrar carpetas del workspace relacionadas
                const foldersToRemove = vscode.workspace.workspaceFolders?.filter(folder =>
                    folder.name.includes(`nucleus-${org}`) || 
                    folder.uri.fsPath.includes(`nucleus-${org}`)
                ) ?? [];

                if (foldersToRemove.length > 0) {
                    const indices = foldersToRemove.map(f => 
                        vscode.workspace.workspaceFolders!.indexOf(f)
                    );
                    // Remover de atrás hacia adelante
                    for (let i = indices.length - 1; i >= 0; i--) {
                        await vscode.workspace.updateWorkspaceFolders(indices[i], 1);
                    }
                }

                // Refresh tree
                providers.nucleusTreeProvider.refresh();

                vscode.window.showInformationMessage(`✅ Nucleus ${org} desvinculado`);
                logger.info(`Nucleus ${org} unlinked`);

            } catch (error: any) {
                logger.error('Error unlinking nucleus', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );
}