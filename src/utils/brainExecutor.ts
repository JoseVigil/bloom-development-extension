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

import { spawn } from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';

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

export interface DetectedProject {
    path: string;
    name: string;
    strategy: string;
    confidence: 'high' | 'medium' | 'low';
    indicators_found: string[];
}

export interface LinkedProject {
    name: string;
    path: string;
    strategy: string;
    nucleus_path: string;
    repo_url?: string;
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
    public static async execute<T = any>(
    commands: string[],
    args: Record<string, any> = {},
    options: {
        cwd?: string;
        timeout?: number;
        onProgress?: (line: string) => void;
    } = {}
    ): Promise<BrainResult<T>> {
    return new Promise((resolve, reject) => {
        if (!this.pythonPath || !this.brainModulePath) {
        reject(new Error('BrainExecutor not initialized. Call initialize() first.'));
        return;
        }

        // Build args: python -m brain <commands> [args] --json
        const fullArgs = ['-m', 'brain', ...commands];
        
        // Add arguments
        Object.entries(args).forEach(([key, value]) => {
        if (typeof value === 'boolean' && value) {
            fullArgs.push(key);
        } else if (value !== undefined && value !== null) {
            fullArgs.push(key, value.toString());
        }
        });
        
        // Always add --json for structured output
        fullArgs.push('--json');
        
        console.log(`[BrainExecutor] ${this.pythonPath} ${fullArgs.join(' ')}`);
        console.log(`[BrainExecutor] CWD: ${options.cwd || this.brainModulePath}`);

        const proc = spawn(this.pythonPath, fullArgs, {
        cwd: options.cwd || this.brainModulePath,
        env: {
            ...process.env,
            PYTHONPATH: this.brainModulePath
        }
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
        stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
        const line = data.toString().trim();
        stderr += line + '\n';
        
        // Send progress updates to callback
        if (options.onProgress && line) {
            options.onProgress(line);
        }
        });

        // Timeout handling
        const timeoutId = setTimeout(() => {
        proc.kill();
        reject(new Error(`Command timeout after ${options.timeout || 60000}ms`));
        }, options.timeout || 60000);

        proc.on('close', (code) => {
        clearTimeout(timeoutId);

        try {
            // Parse JSON output
            const result = JSON.parse(stdout.trim()) as BrainResult<T>;
            
            if (result.status === 'success') {
            console.log(`[BrainExecutor] âœ… Success:`, result.operation || commands[0]);
            } else {
            console.warn(`[BrainExecutor] âš ï¸ Non-success status:`, result);
            }
            
            resolve(result);
        } catch (error) {
            // JSON parse failed - return error result
            reject(new Error(
            `Failed to parse Brain output:\n${stdout}\n\nStderr: ${stderr}`
            ));
        }
        });

        proc.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(error);
        });
    });
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

    static async githubReposList(org?: string): Promise<BrainResult<{ repositories: GitHubRepository[] }>> {
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

    static async nucleusListProjects(options?: {
        nucleusPath?: string;
        strategy?: string;
        activeOnly?: boolean;
    }): Promise<BrainResult<{
        nucleus_path: string;
        projects_count: number;
        projects: Array<LinkedProject>;
    }>> {
        const args = ['nucleus', 'list-projects'];
        
        if (options?.nucleusPath) {
            args.push('-p', options.nucleusPath);
        }
        if (options?.strategy) {
            args.push('-s', options.strategy);
        }
        if (options?.activeOnly) {
            args.push('--active-only');
        }
        
        return this.execute(args, { cwd: options?.nucleusPath });
    }

    // ========================================================================
    // PROJECT COMMANDS (NEW - Migration Phase 1)
    // ========================================================================

    /**
     * Detect projects in a parent directory
     * Maps to: brain project detect <PARENT_PATH> [OPTIONS]
     */
    static async projectDetect(options: {
        parentPath: string;
        maxDepth?: number;
        strategy?: string;
        minConfidence?: 'high' | 'medium' | 'low';
    }): Promise<BrainResult<{
        parent_path: string;
        projects_found: number;
        projects: DetectedProject[];
    }>> {
        const args = ['project', 'detect', options.parentPath];
        
        if (options.maxDepth !== undefined) {
            args.push('-d', options.maxDepth.toString());
        }
        if (options.strategy) {
            args.push('-s', options.strategy);
        }
        if (options.minConfidence) {
            args.push('-c', options.minConfidence);
        }
        
        return this.execute(args);
    }

    /**
     * Link existing project to Nucleus
     * Maps to: brain project add <PROJECT_PATH> [OPTIONS]
     */
    static async projectAdd(options: {
        projectPath: string;
        nucleusPath: string;
        name?: string;
        strategy?: string;
        description?: string;
        repoUrl?: string;
    }): Promise<BrainResult<{
        project: LinkedProject;
    }>> {
        const args = ['project', 'add', options.projectPath];
        
        // Required: nucleus path
        args.push('-n', options.nucleusPath);
        
        // Optional metadata
        if (options.name) {
            args.push('--name', options.name);
        }
        if (options.strategy) {
            args.push('--strategy', options.strategy);
        }
        if (options.description) {
            args.push('--description', options.description);
        }
        if (options.repoUrl) {
            args.push('--repo-url', options.repoUrl);
        }
        
        return this.execute(args);
    }

    /**
     * Clone Git repo and auto-link to Nucleus
     * Maps to: brain project clone-and-add <REPO_URL> [OPTIONS]
     * 
     * IMPORTANT: Nucleus is auto-detected from cwd, so we pass nucleusPath as cwd
     */
    static async projectCloneAndAdd(options: {
        repo: string;
        nucleusPath: string;
        destination?: string;
        name?: string;
        strategy?: string;
        description?: string;
        onProgress?: (line: string) => void;
    }): Promise<BrainResult<{
        cloned_path: string;
        repo_url: string;
        project: {
            name: string;
            strategy: string;
            nucleus_path: string;
        };
    }>> {
        const args = ['project', 'clone-and-add', options.repo];
        
        if (options.destination) {
            args.push('-d', options.destination);
        }
        if (options.name) {
            args.push('--name', options.name);
        }
        if (options.strategy) {
            args.push('--strategy', options.strategy);
        }
        if (options.description) {
            args.push('--description', options.description);
        }
        
        // CRITICAL: Execute from Nucleus directory so Brain can auto-detect it
        return this.execute(args, {
            cwd: options.nucleusPath,
            onProgress: options.onProgress,
            timeout: 180000 // 3 minutes for cloning
        });
    }

    /**
     * Load project metadata
     * Maps to: brain project load [OPTIONS]
     */
    static async projectLoad(options: {
        projectPath: string;
    }): Promise<BrainResult<{
        strategy: string;
        indicators_found: string[];
        file_count: number;
        size_mb: number;
        [key: string]: any;
    }>> {
        return this.execute(['project', 'load', '-p', options.projectPath]);
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

    static async filesystemCompress(options: {
        paths: string[];
        mode: 'codebase' | 'docbase';
        output?: string;
        exclude?: string[];
        noComments?: boolean;
    }): Promise<BrainResult<{ compressed_file: string }>> {
        const args = ['filesystem', 'compress', ...options.paths];
        
        args.push('-m', options.mode);
        
        if (options.output) {
            args.push('-o', options.output);
        }
        if (options.exclude) {
            options.exclude.forEach(pattern => {
                args.push('-e', pattern);
            });
        }
        if (options.noComments) {
            args.push('--no-comments');
        }

        return this.execute(args);
    }

    static async filesystemExtract(options: {
        jsonFile: string;
        output?: string;
        verifyHashes?: boolean;
    }): Promise<BrainResult<{ extracted_path: string }>> {
        const args = ['filesystem', 'extract', options.jsonFile];
        
        if (options.output) {
            args.push('-o', options.output);
        }
        if (options.verifyHashes !== undefined) {
            args.push(options.verifyHashes ? '--verify-hashes' : '--no-verify-hashes');
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
            await this.execute(['--help']);
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