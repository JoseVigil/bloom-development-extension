/**
 * BrainExecutor - Universal interface to Brain CLI
 * 
 * Replaces:
 * - PythonScriptRunner (old scripts)
 * - Direct Python exec calls
 * - GitExecutor (migrated to Brain)
 * - GitHubAPI calls (migrated to Brain)
 * 
 * ALL communication with Brain goes through this class.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import * as path from 'path';

const execAsync = promisify(exec);

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface BrainResult<T = any> {
    status: 'success' | 'error' | 'not_authenticated' | 'not_nucleus';
    operation?: string;
    message?: string;
    error?: string;
    data?: T;
    [key: string]: any; // Allow additional fields from Brain
}

export interface GitHubAuthStatus {
    authenticated: boolean;
    user?: {
        login: string;
        id: number;
        name?: string;
        email?: string;
        avatar_url?: string;
    };
    organizations?: Array<{
        login: string;
        id: number;
    }>;
}

export interface GitHubRepository {
    id: number;
    name: string;
    full_name: string;
    description?: string;
    clone_url: string;
    html_url: string;
    private: boolean;
    language?: string;
    stars: number;
    updated_at: string;
}

export interface GitHubOrganization {
    id: number;
    login: string;
    avatar_url: string;
    description?: string;
}

export interface NucleusProject {
    organization: string;
    repo_name: string;
    local_path: string;
    repo_url: string;
    clone_url: string;
    private?: boolean;
    initialized?: boolean;
    created_at?: string;
    linked_at?: string;
}

export interface CloneResult {
    repository: string;
    local_path: string;
    clone_url: string;
}

// ============================================================================
// BRAIN EXECUTOR CLASS
// ============================================================================

export class BrainExecutor {
    private static pythonPath: string | null = null;
    private static brainModulePath: string | null = null;

    /**
     * Initialize Brain executor
     * Called once during extension activation
     */
    static async initialize(extensionPath: string): Promise<void> {
        // Detect Python
        const config = vscode.workspace.getConfiguration('bloom');
        this.pythonPath = config.get<string>('pythonPath', 'python');

        // Set brain module path
        this.brainModulePath = path.join(extensionPath, 'brain');

        // Verify Brain is accessible
        try {
            const result = await this.execute(['--help']);
            console.log('[BrainExecutor] Initialized successfully');
        } catch (error: any) {
            console.error('[BrainExecutor] Initialization failed:', error);
            throw new Error(
                `Brain CLI not accessible: ${error.message}\n` +
                `Make sure Python is installed and Brain module exists at: ${this.brainModulePath}`
            );
        }
    }

    /**
     * Execute Brain CLI command and parse JSON output
     */
    private static async execute<T = any>(
        args: string[],
        options: {
            cwd?: string;
            timeout?: number;
            onProgress?: (line: string) => void;
        } = {}
    ): Promise<BrainResult<T>> {
        try {
            if (!this.pythonPath || !this.brainModulePath) {
                throw new Error('BrainExecutor not initialized. Call initialize() first.');
            }

            // Build command: python -m brain <args> --json
            const fullArgs = [...args, '--json'];
            const command = `"${this.pythonPath}" -m brain ${fullArgs.join(' ')}`;

            console.log(`[BrainExecutor] Executing: ${command}`);
            console.log(`[BrainExecutor] CWD: ${options.cwd || 'current'}`);

            // Execute with proper environment
            const { stdout, stderr } = await execAsync(command, {
                cwd: options.cwd || this.brainModulePath,
                timeout: options.timeout || 60000,
                env: {
                    ...process.env,
                    PYTHONPATH: this.brainModulePath
                }
            });

            // Log stderr if present (warnings, progress)
            if (stderr && options.onProgress) {
                stderr.split('\n').forEach(line => {
                    if (line.trim()) {
                        options.onProgress!(line.trim());
                    }
                });
            }

            // Parse JSON output
            const result = JSON.parse(stdout.trim()) as BrainResult<T>;

            // Log result
            if (result.status === 'success') {
                console.log(`[BrainExecutor] ✅ Success:`, result.operation || args[0]);
            } else {
                console.warn(`[BrainExecutor] ⚠️ Non-success status:`, result);
            }

            return result;

        } catch (error: any) {
            // Handle execution errors
            console.error('[BrainExecutor] Execution error:', error);

            // Try to parse JSON from error output
            if (error.stdout) {
                try {
                    const result = JSON.parse(error.stdout.trim());
                    return result;
                } catch {
                    // Not JSON, continue with error handling
                }
            }

            // Return error in standard format
            return {
                status: 'error',
                operation: args[0],
                error: error.message,
                message: `Brain CLI execution failed: ${error.message}`
            };
        }
    }

    // ========================================================================
    // GITHUB AUTHENTICATION
    // ========================================================================

    static async githubAuthLogin(token: string, validate: boolean = true): Promise<BrainResult<GitHubAuthStatus>> {
        return this.execute<GitHubAuthStatus>(
            ['github', 'auth-login', '-t', token, validate ? '' : '--no-validate'].filter(Boolean)
        );
    }

    static async githubAuthStatus(): Promise<BrainResult<GitHubAuthStatus>> {
        return this.execute<GitHubAuthStatus>(['github', 'auth-status']);
    }

    static async githubAuthLogout(): Promise<BrainResult<void>> {
        return this.execute(['github', 'auth-logout']);
    }

    // ========================================================================
    // GITHUB ORGANIZATIONS
    // ========================================================================

    static async githubOrgsList(): Promise<BrainResult<{ organizations: GitHubOrganization[] }>> {
        return this.execute(['github', 'orgs-list']);
    }

    // ========================================================================
    // GITHUB REPOSITORIES
    // ========================================================================

    static async githubReposList(org?: string): Promise<BrainResult<{ repos: GitHubRepository[] }>> {
        const args = ['github', 'repos-list'];
        if (org) {
            args.push('--org', org);
        }
        return this.execute(args);
    }

    static async githubReposCreate(options: {
        name: string;
        org?: string;
        description?: string;
        private?: boolean;
    }): Promise<BrainResult<{ repo: GitHubRepository }>> {
        const args = ['github', 'repos', 'create', options.name];
        
        if (options.org) {
            args.push('--org', options.org);
        }
        if (options.description) {
            args.push('--description', options.description);
        }
        if (options.private) {
            args.push('--private');
        }

        return this.execute(args);
    }

    static async githubReposGet(fullName: string): Promise<BrainResult<{ repo: GitHubRepository }>> {
        return this.execute(['github', 'repos', 'get', fullName]);
    }

    // ========================================================================
    // GITHUB CLONE
    // ========================================================================

    static async githubClone(
        repo: string,
        targetPath: string,
        onProgress?: (line: string) => void
    ): Promise<BrainResult<CloneResult>> {
        return this.execute<CloneResult>(
            ['github', 'clone', repo, '-p', targetPath],
            { onProgress }
        );
    }

    // ========================================================================
    // NUCLEUS PROJECTS
    // ========================================================================

    static async nucleusCreate(options: {
        org: string;
        path?: string;
        private?: boolean;
        force?: boolean;
        onProgress?: (line: string) => void;
    }): Promise<BrainResult<NucleusProject>> {
        const args = ['nucleus', 'create', '-o', options.org];
        
        if (options.path) {
            args.push('-p', options.path);
        }
        if (options.private) {
            args.push('--private');
        }
        if (options.force) {
            args.push('-f');
        }

        return this.execute<NucleusProject>(args, {
            onProgress: options.onProgress
        });
    }

    static async nucleusLink(
        path: string,
        force?: boolean
    ): Promise<BrainResult<NucleusProject>> {
        const args = ['nucleus', 'link', path];
        if (force) {
            args.push('--force');
        }
        return this.execute<NucleusProject>(args);
    }

    static async nucleusStatus(path?: string): Promise<BrainResult<{
        path: string;
        organization: string;
        is_nucleus: boolean;
        is_git_repo: boolean;
        has_remote: boolean;
        remote_url?: string;
    }>> {
        const args = ['nucleus', 'status'];
        if (path) {
            args.push('-p', path);
        }
        return this.execute(args, { cwd: path });
    }

    // ========================================================================
    // CONTEXT GENERATION
    // ========================================================================

    static async contextGenerate(options: {
        path?: string;
        output?: string;
        strategy?: string;
    } = {}): Promise<BrainResult<any>> {
        const args = ['context', 'generate'];
        
        if (options.path) {
            args.push('-p', options.path);
        }
        if (options.output) {
            args.push('-o', options.output);
        }
        if (options.strategy) {
            args.push('-s', options.strategy);
        }

        return this.execute(args, { cwd: options.path });
    }

    // ========================================================================
    // FILESYSTEM OPERATIONS
    // ========================================================================

    static async filesystemTree(options: {
        targets: string[];
        output?: string;
        hash?: boolean;
        exportJson?: boolean;
    }): Promise<BrainResult<{ outputFile?: string }>> {
        const args = ['filesystem', 'tree', ...options.targets];
        
        if (options.output) {
            args.push('-o', options.output);
        }
        if (options.hash) {
            args.push('--hash');
        }
        if (options.exportJson) {
            args.push('--export-json');
        }

        return this.execute(args);
    }

    // ========================================================================
    // UTILITIES
    // ========================================================================

    /**
     * Check if Brain CLI is accessible
     */
    static async checkAvailable(): Promise<boolean> {
        try {
            await this.execute(['--help']);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Get Brain CLI version info
     */
    static async getVersion(): Promise<string> {
        try {
            const result = await this.execute(['--help']);
            return 'Brain CLI v2.0';
        } catch {
            return 'Unknown';
        }
    }

    /**
     * Reset cached paths (useful for testing)
     */
    static reset(): void {
        this.pythonPath = null;
        this.brainModulePath = null;
    }
}