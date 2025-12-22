/**
 * Link to Nucleus - Migrated to Brain CLI v2.0
 * 
 * BEFORE: 300+ lines with manual validation + metadata creation + config updates
 * AFTER:  ~50 lines - everything delegated to Brain CLI
 * 
 * Changes:
 * - ALL linking logic → BrainExecutor.projectAdd()
 * - Removed: validateProject(), detectType(), createMetadata(), updateNucleusConfig()
 * - Kept: VSCode UI feedback only
 */

import * as vscode from 'vscode';
import { BrainExecutor } from '../utils/brainExecutor';

// ============================================================================
// MAIN FUNCTION: Link Project to Nucleus
// ============================================================================

/**
 * Link an existing project to the Nucleus
 * 
 * This is the core linking function used by multiple commands:
 * - Right-click on project folder → "Link to Nucleus"
 * - Command Palette → "Bloom: Link Current Project to Nucleus"
 * - Called programmatically after project creation
 * 
 * @param projectPath - Absolute path to project to link
 * @param nucleusPath - Absolute path to Nucleus (optional, will prompt if not provided)
 * @returns true if successful, false otherwise
 */
export async function linkProjectToNucleus(
    projectPath: string,
    nucleusPath?: string
): Promise<boolean> {
    try {
        // 1. Get Nucleus path if not provided
        if (!nucleusPath) {
            nucleusPath = await getNucleusPath();
            if (!nucleusPath) {
                return false;
            }
        }
        
        // 2. Show progress
        const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        statusBar.text = '$(sync~spin) Linking project to Nucleus...';
        statusBar.show();
        
        // 3. Link using Brain CLI (handles everything!)
        const result = await BrainExecutor.projectAdd({
            projectPath,
            nucleusPath
            // Brain CLI will auto-detect strategy, name, etc.
        });
        
        statusBar.dispose();
        
        // 4. Handle result
        if (result.status === 'error') {
            vscode.window.showErrorMessage(
                `Failed to link project: ${result.message || 'Unknown error'}`
            );
            return false;
        }
        
        // 5. Success
        if (result.data) {
            vscode.window.showInformationMessage(
                `✅ Project '${result.data.project.name}' linked to Nucleus`
            );
        }
        
        // 6. Refresh UI
        await vscode.commands.executeCommand('bloom.projectExplorer.refresh');
        
        return true;
        
    } catch (error) {
        console.error('[linkProjectToNucleus] Error:', error);
        vscode.window.showErrorMessage(
            `Error linking project: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        return false;
    }
}

// ============================================================================
// COMMAND: Link Current Project
// ============================================================================

/**
 * Command: Bloom: Link Current Project to Nucleus
 * 
 * Links the currently open workspace folder to the Nucleus
 */
export async function linkCurrentProjectCommand(): Promise<void> {
    try {
        // Get current workspace folder
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        if (!workspaceFolders || workspaceFolders.length === 0) {
            vscode.window.showWarningMessage(
                'No folder is currently open in workspace. Please open a project folder first.'
            );
            return;
        }
        
        let projectPath: string;
        
        // If multiple folders, ask which one to link
        if (workspaceFolders.length > 1) {
            const items = workspaceFolders.map(folder => ({
                label: folder.name,
                description: folder.uri.fsPath,
                path: folder.uri.fsPath
            }));
            
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select project to link to Nucleus'
            });
            
            if (!selected) {
                return;
            }
            
            projectPath = selected.path;
        } else {
            projectPath = workspaceFolders[0].uri.fsPath;
        }
        
        // Link it
        await linkProjectToNucleus(projectPath);
        
    } catch (error) {
        console.error('[linkCurrentProject] Error:', error);
        vscode.window.showErrorMessage(
            `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

// ============================================================================
// COMMAND: Link from Context Menu
// ============================================================================

/**
 * Command: Link to Nucleus (from right-click context menu)
 * 
 * @param uri - URI of the folder clicked in explorer
 */
export async function linkFromContextMenuCommand(uri: vscode.Uri): Promise<void> {
    if (!uri) {
        vscode.window.showWarningMessage('No folder selected');
        return;
    }
    
    await linkProjectToNucleus(uri.fsPath);
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get Nucleus path from config or prompt user
 */
async function getNucleusPath(): Promise<string | undefined> {
    const config = vscode.workspace.getConfiguration('bloom');
    let nucleusPath = config.get<string>('nucleusPath');
    
    // Validate existing path
    if (nucleusPath) {
        try {
            const status = await BrainExecutor.nucleusStatus(nucleusPath);
            if (status.status === 'success' && status.data?.is_nucleus) {
                return nucleusPath;
            }
        } catch (error) {
            console.warn('[getNucleusPath] Invalid configured path:', error);
        }
    }
    
    // Prompt for Nucleus
    const action = await vscode.window.showInformationMessage(
        'No Nucleus project configured. Please select your Nucleus folder.',
        'Select Nucleus', 'Create New Nucleus', 'Cancel'
    );
    
    if (action === 'Create New Nucleus') {
        await vscode.commands.executeCommand('bloom.nucleus.create');
        return undefined;
    }
    
    if (action !== 'Select Nucleus') {
        return undefined;
    }
    
    const selected = await vscode.window.showOpenDialog({
        canSelectFolders: true,
        canSelectFiles: false,
        openLabel: 'Select Nucleus Project',
        title: 'Select your Nucleus project folder'
    });
    
    if (!selected || selected.length === 0) {
        vscode.window.showWarningMessage('Nucleus path is required to link projects');
        return undefined;
    }
    
    nucleusPath = selected[0].fsPath;
    
    // Verify it's a Nucleus
    const status = await BrainExecutor.nucleusStatus(nucleusPath);
    if (status.status === 'error' || !status.data?.is_nucleus) {
        vscode.window.showErrorMessage(
            'Selected folder is not a valid Nucleus project. Please create a Nucleus first.'
        );
        return undefined;
    }
    
    // Save to config
    await config.update(
        'nucleusPath',
        nucleusPath,
        vscode.ConfigurationTarget.Workspace
    );
    
    return nucleusPath;
}

// ============================================================================
// COMMAND REGISTRATION
// ============================================================================

/**
 * Register all link commands
 */
export function registerLinkToNucleusCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.project.linkCurrent', linkCurrentProjectCommand),
        vscode.commands.registerCommand('bloom.project.linkFromMenu', linkFromContextMenuCommand)
    );
}

// ============================================================================
// EXPORT FOR PROGRAMMATIC USE
// ============================================================================

/**
 * Export the core linking function for use by other commands
 * 
 * Example usage:
 * ```typescript
 * import { linkProjectToNucleus } from './linkToNucleus';
 * 
 * // After cloning a repo
 * const success = await linkProjectToNucleus(clonedPath, nucleusPath);
 * ```
 */
export { linkProjectToNucleus as default };