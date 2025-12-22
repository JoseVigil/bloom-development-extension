/**
 * Create Nucleus Project - Migrated to Brain CLI v2.0
 * 
 * BEFORE: 450+ lines with manual git clone + detection + linking
 * AFTER:  ~120 lines using BrainExecutor.projectCloneAndAdd()
 * 
 * Changes:
 * - GitHub API calls → BrainExecutor.githubOrgsList() / githubReposList()
 * - Git clone → Handled by Brain CLI
 * - Project detection → Handled by Brain CLI
 * - Nucleus linking → Handled by Brain CLI
 * - Kept: VSCode UI/UX logic only
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { BrainExecutor } from '../utils/brainExecutor';

// ============================================================================
// MAIN COMMAND: Create Nucleus Project (Clone from GitHub)
// ============================================================================

/**
 * Command: Bloom: Create Nucleus Project
 * 
 * Clones a GitHub repository and automatically links it to the Nucleus.
 * 
 * Flow:
 * 1. Check GitHub authentication
 * 2. List user's organizations
 * 3. List repositories in selected org
 * 4. Get destination path
 * 5. Clone + link in one Brain CLI command
 * 6. Open in VSCode workspace
 */
export async function createNucleusProjectCommand(): Promise<void> {
    try {
        // 1. Check GitHub authentication
        const authStatus = await BrainExecutor.githubAuthStatus();
        
        if (authStatus.status === 'error' || !authStatus.data?.authenticated) {
            const action = await vscode.window.showWarningMessage(
                'GitHub authentication required. Please authenticate first.',
                'Authenticate', 'Cancel'
            );
            
            if (action === 'Authenticate') {
                await vscode.commands.executeCommand('bloom.github.authenticate');
            }
            return;
        }
        
        // 2. List organizations
        const orgsResult = await BrainExecutor.githubOrgsList();
        
        if (orgsResult.status === 'error' || !orgsResult.data?.organizations) {
            vscode.window.showErrorMessage(
                `Failed to load organizations: ${orgsResult.message || 'Unknown error'}`
            );
            return;
        }
        
        if (orgsResult.data.organizations.length === 0) {
            vscode.window.showInformationMessage(
                'No organizations found. You need to be part of at least one GitHub organization.'
            );
            return;
        }
        
        // 3. User selects organization
        const orgItems = orgsResult.data.organizations.map(org => ({
            label: `$(organization) ${org.login}`,
            description: org.description || '',
            org: org
        }));
        
        const selectedOrg = await vscode.window.showQuickPick(orgItems, {
            placeHolder: 'Select GitHub organization',
            matchOnDescription: true
        });
        
        if (!selectedOrg) {
            return;
        }
        
        // 4. List repositories in organization
        const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        statusBar.text = '$(sync~spin) Loading repositories...';
        statusBar.show();
        
        const reposResult = await BrainExecutor.githubReposList(selectedOrg.org.login);
        statusBar.dispose();
        
        if (reposResult.status === 'error' || !reposResult.data?.repositories) {
            vscode.window.showErrorMessage(
                `Failed to load repositories: ${reposResult.message || 'Unknown error'}`
            );
            return;
        }
        
        if (reposResult.data.repositories.length === 0) {
            vscode.window.showInformationMessage(
                `No repositories found in organization "${selectedOrg.org.login}".`
            );
            return;
        }
        
        // 5. User selects repository
        const repoItems = reposResult.data.repositories.map(repo => ({
            label: `$(repo) ${repo.name}`,
            description: repo.description || '',
            detail: `${repo.language || 'Unknown'} · ⭐ ${repo.stars} · Updated ${formatDate(repo.updated_at)}`,
            repo: repo
        }));
        
        // Sort by update date (most recent first)
        repoItems.sort((a, b) => 
            new Date(b.repo.updated_at).getTime() - new Date(a.repo.updated_at).getTime()
        );
        
        const selectedRepo = await vscode.window.showQuickPick(repoItems, {
            placeHolder: `Select repository from ${selectedOrg.org.login} (${repoItems.length} found)`,
            matchOnDescription: true,
            matchOnDetail: true
        });
        
        if (!selectedRepo) {
            return;
        }
        
        // 6. Get Nucleus path
        const nucleusPath = await getNucleusPath();
        if (!nucleusPath) {
            return;
        }
        
        // 7. Ask for custom destination (optional)
        const useCustomPath = await vscode.window.showQuickPick(
            [
                { label: 'Clone to Nucleus root', value: false },
                { label: 'Choose custom location', value: true }
            ],
            { placeHolder: 'Where should the project be cloned?' }
        );
        
        if (!useCustomPath) {
            return;
        }
        
        let customPath: string | undefined;
        if (useCustomPath.value) {
            const pathInput = await vscode.window.showInputBox({
                prompt: 'Enter destination path (absolute or relative to Nucleus)',
                placeHolder: '/path/to/project or ./projects/myapp',
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return 'Path cannot be empty';
                    }
                    return null;
                }
            });
            
            if (!pathInput) {
                return;
            }
            
            customPath = pathInput.trim();
        }
        
        // 8. Clone + Link using Brain CLI (single command!)
        statusBar.text = `$(sync~spin) Cloning ${selectedRepo.repo.name}...`;
        statusBar.show();
        
        const result = await BrainExecutor.projectCloneAndAdd({
            repo: selectedRepo.repo.full_name,
            nucleusPath: nucleusPath,
            destination: customPath,
            onProgress: (line) => {
                // Update status bar with progress
                if (line.includes('Cloning') || line.includes('Receiving') || line.includes('Resolving')) {
                    statusBar.text = `$(sync~spin) ${line}`;
                }
            }
        });
        
        statusBar.dispose();
        
        // 9. Handle errors
        if (result.status === 'error') {
            vscode.window.showErrorMessage(
                `Failed to clone and link project: ${result.message || 'Unknown error'}`
            );
            return;
        }
        
        // 10. Success - Open in workspace
        if (result.data) {
            await addProjectToWorkspace(result.data.cloned_path);
            
            // 11. Notify user
            const openFolder = await vscode.window.showInformationMessage(
                `✅ Project '${result.data.project.name}' cloned and linked to Nucleus`,
                'Open Project Folder'
            );
            
            if (openFolder === 'Open Project Folder') {
                await vscode.commands.executeCommand(
                    'revealFileInOS',
                    vscode.Uri.file(result.data.cloned_path)
                );
            }
        }
        
        // 12. Refresh UI
        await vscode.commands.executeCommand('bloom.projectExplorer.refresh');
        
    } catch (error) {
        console.error('[createNucleusProject] Error:', error);
        vscode.window.showErrorMessage(
            `Error creating project: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
    }
}

// ============================================================================
// COMMAND: Clone from URL (Quick)
// ============================================================================

/**
 * Command: Bloom: Quick Clone Project
 * 
 * Quick version that accepts a direct GitHub URL
 */
export async function quickCloneProjectCommand(): Promise<void> {
    try {
        // 1. Get repository URL
        const repoUrl = await vscode.window.showInputBox({
            prompt: 'Enter GitHub repository URL or owner/repo',
            placeHolder: 'https://github.com/owner/repo or owner/repo',
            validateInput: (value) => {
                if (!value || value.trim() === '') {
                    return 'Repository URL cannot be empty';
                }
                // Basic validation
                if (!value.includes('/')) {
                    return 'Must be in format owner/repo or full URL';
                }
                return null;
            }
        });
        
        if (!repoUrl) {
            return;
        }
        
        // Extract owner/repo from URL if needed
        let repoFullName = repoUrl.trim();
        if (repoFullName.startsWith('http')) {
            // Extract from URL: https://github.com/owner/repo -> owner/repo
            const match = repoFullName.match(/github\.com\/([^\/]+\/[^\/]+)/);
            if (match) {
                repoFullName = match[1].replace('.git', '');
            }
        }
        
        // 2. Get Nucleus path
        const nucleusPath = await getNucleusPath();
        if (!nucleusPath) {
            return;
        }
        
        // 3. Clone + Link
        const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        statusBar.text = `$(sync~spin) Cloning ${repoFullName}...`;
        statusBar.show();
        
        const result = await BrainExecutor.projectCloneAndAdd({
            repo: repoFullName,
            nucleusPath: nucleusPath,
            onProgress: (line) => {
                statusBar.text = `$(sync~spin) ${line}`;
            }
        });
        
        statusBar.dispose();
        
        if (result.status === 'error') {
            vscode.window.showErrorMessage(
                `Failed to clone: ${result.message || 'Unknown error'}`
            );
            return;
        }
        
        // 4. Success
        if (result.data) {
            await addProjectToWorkspace(result.data.cloned_path);
            
            vscode.window.showInformationMessage(
                `✅ Project '${result.data.project.name}' cloned and linked`
            );
        }
        
        await vscode.commands.executeCommand('bloom.projectExplorer.refresh');
        
    } catch (error) {
        console.error('[quickCloneProject] Error:', error);
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
        vscode.window.showWarningMessage('Nucleus path is required');
        return undefined;
    }
    
    nucleusPath = selected[0].fsPath;
    
    // Verify it's a Nucleus
    const status = await BrainExecutor.nucleusStatus(nucleusPath);
    if (status.status === 'error' || !status.data?.is_nucleus) {
        vscode.window.showErrorMessage(
            'Selected folder is not a valid Nucleus project.'
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

/**
 * Add project to VSCode workspace
 */
async function addProjectToWorkspace(projectPath: string): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    
    const alreadyOpen = workspaceFolders.some(
        folder => folder.uri.fsPath === projectPath
    );
    
    if (alreadyOpen) {
        return;
    }
    
    vscode.workspace.updateWorkspaceFolders(
        workspaceFolders.length,
        0,
        { uri: vscode.Uri.file(projectPath) }
    );
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        return 'today';
    } else if (diffDays === 1) {
        return 'yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        return `${months} month${months > 1 ? 's' : ''} ago`;
    } else {
        return date.toLocaleDateString();
    }
}

/**
 * Register all create nucleus project commands
 */
export function registerCreateNucleusProjectCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.nucleus.createProject', createNucleusProjectCommand),
        vscode.commands.registerCommand('bloom.project.quickClone', quickCloneProjectCommand)
    );
}