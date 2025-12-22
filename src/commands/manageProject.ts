/**
 * Manage Project Commands - Migrated to Brain CLI v2.0
 * 
 * BEFORE: 600+ lines of duplicate logic
 * AFTER:  ~150 lines using BrainExecutor
 * 
 * Changes:
 * - Project detection → BrainExecutor.projectDetect()
 * - Project linking → BrainExecutor.projectAdd()
 * - Removed: scanDirectory(), detectProjectType(), linkToNucleusInternal()
 * - Kept: VSCode UI/UX logic only
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { BrainExecutor } from '../utils/brainExecutor';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface LinkResult {
    name: string;
    success: boolean;
    message?: string;
}

// ============================================================================
// MAIN COMMAND: Link Local Project
// ============================================================================

/**
 * Command: Bloom: Link Local Project
 * 
 * Allows user to select an existing local project and link it to the configured Nucleus.
 * 
 * Flow:
 * 1. User selects parent folder
 * 2. Brain CLI scans and detects projects
 * 3. User selects project from list
 * 4. Brain CLI links project to Nucleus
 * 5. VSCode adds project to workspace
 */
export async function linkLocalProjectCommand(): Promise<void> {
    try {
        // 1. Get parent folder from user
        const parentFolder = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Select Parent Folder',
            title: 'Select folder containing projects to scan'
        });
        
        if (!parentFolder || parentFolder.length === 0) {
            return;
        }
        
        const parentPath = parentFolder[0].fsPath;
        
        // 2. Detect projects using Brain CLI
        const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        statusBar.text = '$(sync~spin) Scanning for projects...';
        statusBar.show();
        
        let detected;
        try {
            detected = await BrainExecutor.projectDetect({
                parentPath,
                maxDepth: 2
            });
        } finally {
            statusBar.dispose();
        }
        
        // 3. Handle detection errors
        if (detected.status === 'error') {
            vscode.window.showErrorMessage(
                `Project detection failed: ${detected.message || 'Unknown error'}`
            );
            return;
        }
        
        if (!detected.data || detected.data.projects_found === 0) {
            const retry = await vscode.window.showInformationMessage(
                'No projects detected in selected folder.',
                'Try Different Folder'
            );
            
            if (retry) {
                return linkLocalProjectCommand(); // Recurse
            }
            return;
        }
        
        // 4. Show detected projects to user
        const items = detected.data.projects.map(p => ({
            label: `$(folder) ${p.name}`,
            description: `${p.strategy} · ${p.confidence} confidence`,
            detail: p.path,
            project: p
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Select project to link (${detected.data.projects_found} found)`,
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        if (!selected) {
            return;
        }
        
        // 5. Get Nucleus path
        const nucleusPath = await getNucleusPath();
        if (!nucleusPath) {
            return;
        }
        
        // 6. Link project using Brain CLI
        statusBar.text = '$(sync~spin) Linking project to Nucleus...';
        statusBar.show();
        
        let linked;
        try {
            linked = await BrainExecutor.projectAdd({
                projectPath: selected.project.path,
                nucleusPath: nucleusPath,
                strategy: selected.project.strategy // Use detected strategy
            });
        } finally {
            statusBar.dispose();
        }
        
        // 7. Handle linking errors
        if (linked.status === 'error') {
            // Check if already linked
            if (linked.message?.includes('already linked')) {
                const overwrite = await vscode.window.showWarningMessage(
                    `Project "${selected.project.name}" is already linked to this Nucleus. Update configuration?`,
                    'Yes', 'No'
                );
                
                if (overwrite !== 'Yes') {
                    return;
                }
                
                // Retry (Brain CLI should handle force update)
                linked = await BrainExecutor.projectAdd({
                    projectPath: selected.project.path,
                    nucleusPath: nucleusPath,
                    strategy: selected.project.strategy
                });
                
                if (linked.status === 'error') {
                    vscode.window.showErrorMessage(
                        `Failed to update project: ${linked.message || 'Unknown error'}`
                    );
                    return;
                }
            } else {
                vscode.window.showErrorMessage(
                    `Failed to link project: ${linked.message || 'Unknown error'}`
                );
                return;
            }
        }
        
        // 8. Update VSCode workspace
        await addProjectToWorkspace(selected.project.path);
        
        // 9. Success notification
        if (linked.data) {
            vscode.window.showInformationMessage(
                `✅ Project '${linked.data.project.name}' linked to Nucleus`
            );
        }
        
        // 10. Refresh UI
        await vscode.commands.executeCommand('bloom.projectExplorer.refresh');
        
    } catch (error) {
        console.error('[linkLocalProject] Error:', error);
        vscode.window.showErrorMessage(
            `Error linking project: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

// ============================================================================
// COMMAND: Scan and Link Multiple Projects
// ============================================================================

/**
 * Command: Bloom: Scan and Link Multiple Projects
 * 
 * Batch operation to link multiple projects at once.
 */
export async function scanAndLinkMultipleProjectsCommand(): Promise<void> {
    try {
        // 1. Get parent folder
        const parentFolder = await vscode.window.showOpenDialog({
            canSelectFolders: true,
            canSelectFiles: false,
            canSelectMany: false,
            openLabel: 'Select Parent Folder',
            title: 'Select folder containing multiple projects'
        });
        
        if (!parentFolder || parentFolder.length === 0) {
            return;
        }
        
        const parentPath = parentFolder[0].fsPath;
        
        // 2. Get Nucleus path
        const nucleusPath = await getNucleusPath();
        if (!nucleusPath) {
            return;
        }
        
        // 3. Detect projects
        const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        statusBar.text = '$(sync~spin) Scanning for projects...';
        statusBar.show();
        
        const detected = await BrainExecutor.projectDetect({
            parentPath,
            maxDepth: 2,
            minConfidence: 'medium' // Only show medium+ confidence
        });
        
        statusBar.dispose();
        
        if (detected.status === 'error' || !detected.data || detected.data.projects_found === 0) {
            vscode.window.showInformationMessage('No projects detected.');
            return;
        }
        
        // 4. Show multi-select picker
        const items = detected.data.projects.map(p => ({
            label: p.name,
            description: `${p.strategy} · ${p.confidence}`,
            detail: p.path,
            picked: p.confidence === 'high', // Pre-select high confidence
            project: p
        }));
        
        const selected = await vscode.window.showQuickPick(items, {
            canPickMany: true,
            placeHolder: `Select projects to link (${detected.data.projects_found} found)`,
            matchOnDescription: true
        });
        
        if (!selected || selected.length === 0) {
            return;
        }
        
        // 5. Link each project
        const results: LinkResult[] = [];
        for (let i = 0; i < selected.length; i++) {
            const item = selected[i];
            statusBar.text = `$(sync~spin) Linking ${i + 1}/${selected.length}: ${item.label}`;
            statusBar.show();
            
            try {
                const result = await BrainExecutor.projectAdd({
                    projectPath: item.project.path,
                    nucleusPath: nucleusPath,
                    strategy: item.project.strategy
                });
                
                results.push({
                    name: item.label,
                    success: result.status === 'success',
                    message: result.message
                });
                
                if (result.status === 'success') {
                    await addProjectToWorkspace(item.project.path);
                }
            } catch (error) {
                results.push({
                    name: item.label,
                    success: false,
                    message: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        }
        
        statusBar.dispose();
        
        // 6. Show results
        const successful = results.filter(r => r.success).length;
        const failed = results.length - successful;
        
        if (failed === 0) {
            vscode.window.showInformationMessage(
                `✅ Successfully linked ${successful} project${successful !== 1 ? 's' : ''}`
            );
        } else {
            const message = `Linked ${successful} project${successful !== 1 ? 's' : ''}, ${failed} failed`;
            vscode.window.showWarningMessage(message, 'Show Details').then(action => {
                if (action === 'Show Details') {
                    // Show detailed results in output channel
                    const output = vscode.window.createOutputChannel('Bloom: Link Results');
                    output.clear();
                    results.forEach(r => {
                        output.appendLine(`${r.success ? '✅' : '❌'} ${r.name}: ${r.message || 'OK'}`);
                    });
                    output.show();
                }
            });
        }
        
        // Refresh UI
        await vscode.commands.executeCommand('bloom.projectExplorer.refresh');
        
    } catch (error) {
        console.error('[scanAndLinkMultiple] Error:', error);
        vscode.window.showErrorMessage(
            `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
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
            if (fs.existsSync(nucleusPath)) {
                // Verify it's actually a Nucleus
                const status = await BrainExecutor.nucleusStatus(nucleusPath);
                if (status.status === 'success' && status.data?.is_nucleus) {
                    return nucleusPath;
                }
            }
        } catch (error) {
            // Invalid path, ask user
            console.warn('[getNucleusPath] Invalid configured path:', error);
        }
    }
    
    // Prompt for Nucleus path
    const action = await vscode.window.showInformationMessage(
        'No Nucleus project configured. Please select your Nucleus folder.',
        'Select Nucleus', 'Cancel'
    );
    
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
    
    // Save to workspace config
    await config.update(
        'nucleusPath',
        nucleusPath,
        vscode.ConfigurationTarget.Workspace
    );
    
    return nucleusPath;
}

/**
 * Add project to VSCode workspace
 */
async function addProjectToWorkspace(projectPath: string): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    
    // Check if already in workspace
    const alreadyOpen = workspaceFolders.some(
        folder => folder.uri.fsPath === projectPath
    );
    
    if (alreadyOpen) {
        return; // Already in workspace
    }
    
    // Add to workspace
    vscode.workspace.updateWorkspaceFolders(
        workspaceFolders.length,
        0,
        { uri: vscode.Uri.file(projectPath) }
    );
}

/**
 * Register all project management commands
 */
export function registerManageProjectCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.project.linkLocal', linkLocalProjectCommand),
        vscode.commands.registerCommand('bloom.project.linkMultiple', scanAndLinkMultipleProjectsCommand)
    );
}