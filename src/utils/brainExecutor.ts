/**
 * BrainExecutor - Universal interface to Brain CLI
 * 
 * ✅ MIGRATED: Uses direct execution with runtime Python
 * ❌ OLD: python -m brain (required PYTHONPATH)
 * ✅ NEW: python path/to/brain/__main__.py (no PYTHONPATH needed)
 */

import { spawn } from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { resolveBloomPython } from './runtimeResolver';


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
// UPDATED TYPE DEFINITIONS FOR ONBOARDING STATUS
// ============================================================================

export interface OnboardingStatusDetails {
    github: {
        authenticated: boolean;
        username?: string;
        error?: string;
        checked_at?: string;
    };
    gemini: {
        configured: boolean;
        profile_count?: number;
        key_count?: number;
        error?: string;
        checked_at?: string;
    };
    nucleus: {
        exists: boolean;
        path?: string;
        organization?: string;
        nucleus_count?: number;
        error?: string;
        checked_at?: string;
    };
    projects: {
        added: boolean;
        count?: number;
        project_count?: number;
        error?: string;
        checked_at?: string;
    };
}

export interface OnboardingStatusResponse {
    ready: boolean;
    current_step: string;
    completed: boolean;
    completion_percentage?: number;
    details: OnboardingStatusDetails;
    timestamp?: string;
}

// ============================================================================
// BRAIN EXECUTOR CLASS
// ============================================================================

export class BrainExecutor {

    private static pythonPath: string | null = null;
    private static brainMainPy: string | null = null;

    /**
     * Get the Brain runtime path for the current OS
     * Windows: C:\Users\<user>\AppData\Local\BloomNucleus\engine\runtime\Lib\site-packages\brain
     * macOS: ~/Library/Application Support/BloomNucleus/engine/runtime/lib/python3.11/site-packages/brain
     * Linux: ~/.local/share/BloomNucleus/engine/runtime/lib/python3.11/site-packages/brain
     */
    private static getRuntimePath(): string {
        const platform = os.platform();
        const homeDir = os.homedir();

        if (platform === 'win32') {
            return path.join(
                homeDir,
                'AppData',
                'Local',
                'BloomNucleus',
                'engine',
                'runtime',
                'Lib',
                'site-packages',
                'brain'
            );
        } else if (platform === 'darwin') {
            return path.join(
                homeDir,
                'Library',
                'Application Support',
                'BloomNucleus',
                'engine',
                'runtime',
                'lib',
                'python3.11',
                'site-packages',
                'brain'
            );
        } else {
            // Linux
            return path.join(
                homeDir,
                '.local',
                'share',
                'BloomNucleus',
                'engine',
                'runtime',
                'lib',
                'python3.11',
                'site-packages',
                'brain'
            );
        }
    }

    /**
     * Initialize Brain executor
     * Called once during extension activation
     */
    static async initialize(extensionPath: string): Promise<void> {

        // Python Path
        this.pythonPath = resolveBloomPython();

        // Detect Python
        const config = vscode.workspace.getConfiguration('bloom');        

        // ✅ CRITICAL: Set brain __main__.py path using runtime resolver
        const runtimePath = this.getRuntimePath();
        this.brainMainPy = path.join(runtimePath, '__main__.py');

        // Verify Brain is accessible via direct execution
        try {
            await new Promise<void>((resolve, reject) => {
                const proc = spawn(
                    this.pythonPath!,
                    [this.brainMainPy!, '--help'],
                    {
                        cwd: runtimePath
                        // ✅ NO PYTHONPATH needed - brain injects it internally
                    }
                );

                proc.on('error', reject);

                proc.on('close', (code) => {
                    if (code === 0) resolve();
                    else reject(new Error(`Brain exited with code ${code}`));
                });
            });

            console.log('[BrainExecutor] ✅ Initialized with direct execution mode');
            console.log(`[BrainExecutor]   Python: ${this.pythonPath}`);
            console.log(`[BrainExecutor]   Brain: ${this.brainMainPy}`);
        } catch (error: any) {
            throw new Error(
                `Brain CLI not accessible: ${error.message}\n` +
                `Make sure Brain __main__.py exists at: ${this.brainMainPy}`
            );
        }
    }
    

    /**
     * Execute Brain CLI command and parse JSON output
     * 
     * ✅ MIGRATION: Now uses direct execution without -m brain
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
        if (!this.pythonPath || !this.brainMainPy) {
        reject(new Error('BrainExecutor not initialized. Call initialize() first.'));
        return;
        }

        // ✅ NEW: Direct execution - python brain/__main__.py <commands> [args] --json
        const fullArgs = [this.brainMainPy, '--json', ...commands];
        
        // Add arguments
        Object.entries(args).forEach(([key, value]) => {
        if (typeof value === 'boolean' && value) {
            fullArgs.push(key);
        } else if (value !== undefined && value !== null) {
            fullArgs.push(key, value.toString());
        }
        });       
        
        console.log(`[BrainExecutor] ${this.pythonPath} ${fullArgs.join(' ')}`);
        console.log(`[BrainExecutor] CWD: ${options.cwd || 'default'}`);

        const proc = spawn(this.pythonPath, fullArgs, {
        cwd: options.cwd
        // ✅ NO env modifications needed - brain handles sys.path internally
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
            console.log(`[BrainExecutor] ✅ Success:`, result.operation || commands[0]);
            } else {
            console.warn(`[BrainExecutor] ⚠️ Non-success status:`, result);
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
            {},
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

        return this.execute<NucleusProject>(args, {}, {
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
        return this.execute(args, {}, { cwd: path });
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
        
        return this.execute(args, {}, { cwd: options?.nucleusPath });
    }

    // ========================================================================
    // PROJECT COMMANDS
    // ========================================================================

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
        
        args.push('-n', options.nucleusPath);
        
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
        
        return this.execute(args, {}, {
            cwd: options.nucleusPath,
            onProgress: options.onProgress,
            timeout: 180000
        });
    }

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

        return this.execute(args, {}, { cwd: options.path });
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
    // HEALTH OPERATIONS
    // ========================================================================
   

    /**
     * Execute onboarding-specific status check.
     * Maps to: python brain\__main__.py --json health onboarding-status
     * Returns: { ready, current_step, completed, completion_percentage?, details, timestamp? }
     */
    static async healthOnboardingStatus(): Promise<BrainResult<OnboardingStatusResponse>> {
        return this.execute<OnboardingStatusResponse>(['health', 'onboarding-status']);
    }

    /**
     * Execute full-stack health check.
     * Maps to: python brain\__main__.py --json health full-stack
     * Returns: { ok, brain_available, authenticated, is_nucleus, nucleus?, timestamp }
     */
    static async healthFullStack(): Promise<BrainResult<{
        ok: boolean;
        brain_available: boolean;
        authenticated: boolean;
        is_nucleus: boolean;
        nucleus?: {
            id: string;
            organization: string;
            path: string;
        };
    }>> {
        return this.execute(['health', 'full-stack']);
    }

    /**
     * Execute WebSocket status check.
     * Maps to: python brain\__main__.py --json health websocket-status
     * Returns: { status: 'running' | 'stopped', connections: number }
     */
    static async healthWebSocketStatus(): Promise<BrainResult<{
        status: 'running' | 'stopped';
        connections: number;
        port?: number;
    }>> {
        return this.execute(['health', 'websocket-status']);
    }

    /**
     * Execute development environment check.
     * Maps to: python brain\__main__.py --json health dev-check
     * Returns: { is_dev_mode, reason, services: { dev_server, api, websocket } }
     */
    static async healthDevCheck(): Promise<BrainResult<{
        is_dev_mode: boolean;
        reason: string;
        services: {
            dev_server: {
                available: boolean;
                host: string | null;
                port: number;
            };
            api: {
                available: boolean;
                host: string | null;
                port: number;
            };
            websocket: {
                available: boolean;
                host: string | null;
                port: number;
            };
        };
        timestamp: string;
    }>> {
        return this.execute(['health', 'dev-check']);
    }

    // ========================================================================
    // UTILITIES
    // ========================================================================

    static async checkAvailable(): Promise<boolean> {
        try {
            await this.execute(['--help']);
            return true;
        } catch {
            return false;
        }
    }

    static async getVersion(): Promise<string> {
        try {
            await this.execute(['--help']);
            return 'Brain CLI v2.0 (Direct Execution)';
        } catch {
            return 'Unknown';
        }
    }

    static reset(): void {
        this.pythonPath = null;
        this.brainMainPy = null;
    }

    // ========================================================================
    // MÉTODOS MIGRADOS DESDE pythonScriptRunner.ts y pythonExecutor.ts
    // ========================================================================

    /**
     * Generate complete Nucleus structure
     * Migrated from: pythonScriptRunner.generateNucleusStructure()
     * Brain equivalent: nucleus create
     */
    static async generateNucleusStructure(
        nucleusPath: string,
        orgName: string,
        options: {
            skipExisting?: boolean;
            url?: string;
            force?: boolean;
            onProgress?: (line: string) => void;
        } = {}
    ): Promise<BrainResult<NucleusProject>> {
        return this.nucleusCreate({
            org: orgName,
            path: nucleusPath,
            private: false,
            force: options.force,
            onProgress: options.onProgress
        });
    }

    /**
     * Generate project context (Bloom Context)
     * Migrated from: pythonScriptRunner.generateProjectContext() & pythonExecutor.generateContext()
     * Brain equivalent: context generate
     */
    static async generateProjectContext(
        projectPath: string,
        strategy: string,
        options: {
            outputPath?: string;
            skipExisting?: boolean;
        } = {}
    ): Promise<BrainResult<any>> {
        return this.contextGenerate({
            path: projectPath,
            output: options.outputPath,
            strategy: strategy
        });
    }

    /**
     * Generate directory tree
     * Migrated from: pythonScriptRunner.generateTree() & pythonExecutor.generateTree()
     * Brain equivalent: filesystem tree
     */
    static async generateTree(
        outputFile: string,
        targetPaths: string[],
        options: {
            hash?: boolean;
            exportJson?: boolean;
        } = {}
    ): Promise<BrainResult<{ outputFile?: string }>> {
        return this.filesystemTree({
            targets: targetPaths,
            output: outputFile,
            hash: options.hash ?? false,
            exportJson: options.exportJson ?? true
        });
    }

    /**
     * Generate compressed codebase
     * Migrated from: pythonScriptRunner.generateCodebase() & pythonExecutor.generateCodebase()
     * Brain equivalent: filesystem compress
     */
    static async generateCodebase(
        outputFile: string,
        files: string[],
        options: {
            mode?: 'codebase' | 'docbase';
            exclude?: string[];
            noComments?: boolean;
        } = {}
    ): Promise<BrainResult<{ compressed_file: string }>> {
        return this.filesystemCompress({
            paths: files,
            mode: options.mode || 'codebase',
            output: outputFile,
            exclude: options.exclude,
            noComments: options.noComments
        });
    }

    /**
     * Integrate snapshot into codebase
     * Migrated from: pythonScriptRunner.integrateSnapshot()
     * Brain equivalent: intent merge (with staging workflow)
     * 
     * NOTE: This is a multi-step process in Brain:
     * 1. Parse the snapshot (intent parse)
     * 2. Stage the files (intent stage)
     * 3. Validate (intent validate - optional)
     * 4. Merge (intent merge)
     */
    static async integrateSnapshot(
        snapshotFile: string,
        projectRoot: string,
        options: {
            intentId?: string;
            intentFolder?: string;
            stage?: string;
            dryRun?: boolean;
            force?: boolean;
            noBackup?: boolean;
            autoApprove?: boolean;
            onProgress?: (line: string) => void;
        } = {}
    ): Promise<BrainResult<{
        parsed: boolean;
        staged: boolean;
        validated: boolean;
        merged: boolean;
        filesCreated?: string[];
        filesModified?: string[];
        conflicts?: string[];
    }>> {
        const intentId = options.intentId || options.intentFolder;
        
        if (!intentId) {
            return {
                status: 'error',
                error: 'Either intentId or intentFolder must be provided'
            };
        }

        try {
            // Step 1: Parse (if not already parsed)
            options.onProgress?.('Parsing snapshot...');
            const parseResult = await this.execute(['intent', 'parse', '-i', intentId], {}, {
                cwd: projectRoot,
                onProgress: options.onProgress
            });

            if (parseResult.status !== 'success') {
                return {
                    status: 'error',
                    error: `Parse failed: ${parseResult.error || parseResult.message}`
                };
            }

            // Step 2: Stage
            options.onProgress?.('Staging files...');
            const stageArgs = ['intent', 'stage', '-i', intentId];
            if (options.stage) stageArgs.push('-s', options.stage);
            if (options.dryRun) stageArgs.push('--dry-run');

            const stageResult = await this.execute(stageArgs, {}, {
                cwd: projectRoot,
                onProgress: options.onProgress
            });

            if (stageResult.status !== 'success') {
                return {
                    status: 'error',
                    error: `Stage failed: ${stageResult.error || stageResult.message}`
                };
            }

            // Step 3: Validate (optional, unless autoApprove is false)
            let validated = true;
            if (!options.autoApprove && !options.dryRun) {
                options.onProgress?.('Validating changes...');
                const validateArgs = ['intent', 'validate', '-i', intentId];
                if (options.stage) validateArgs.push('-s', options.stage);
                
                const validateResult = await this.execute(validateArgs, {}, {
                    cwd: projectRoot,
                    onProgress: options.onProgress
                });

                if (validateResult.status !== 'success') {
                    validated = false;
                    console.warn('Validation failed, but continuing...');
                }
            }

            // Step 4: Merge (if not dry-run)
            if (options.dryRun) {
                return {
                    status: 'success',
                    operation: 'integrate_snapshot',
                    message: 'Dry-run completed successfully',
                    data: {
                        parsed: true,
                        staged: true,
                        validated,
                        merged: false
                    }
                };
            }

            options.onProgress?.('Merging changes...');
            const mergeArgs = ['intent', 'merge', '-i', intentId];
            if (options.stage) mergeArgs.push('-s', options.stage);
            if (options.force) mergeArgs.push('--force');
            if (options.noBackup) mergeArgs.push('--no-backup');

            const mergeResult = await this.execute(mergeArgs, {}, {
                cwd: projectRoot,
                onProgress: options.onProgress
            });

            if (mergeResult.status !== 'success') {
                return {
                    status: 'error',
                    error: `Merge failed: ${mergeResult.error || mergeResult.message}`
                };
            }

            return {
                status: 'success',
                operation: 'integrate_snapshot',
                message: 'Snapshot integrated successfully',
                data: {
                    parsed: true,
                    staged: true,
                    validated,
                    merged: true,
                    filesCreated: mergeResult.data?.files_created,
                    filesModified: mergeResult.data?.files_modified,
                    conflicts: mergeResult.data?.conflicts
                }
            };

        } catch (error: any) {
            return {
                status: 'error',
                operation: 'integrate_snapshot',
                error: error.message
            };
        }
    }

    /**
     * Create development intent
     * Migrated from: pythonExecutor.createIntentDev()
     * Brain equivalent: intent create -t dev
     */
    static async createIntentDev(
        intentName: string,
        options: {
            nucleusPath?: string;
            files?: string[];
            onProgress?: (line: string) => void;
        } = {}
    ): Promise<BrainResult<any>> {
        const args = ['intent', 'create', '-t', 'dev', '-n', intentName];
        
        if (options.nucleusPath) {
            args.push('-p', options.nucleusPath);
        }
        
        if (options.files && options.files.length > 0) {
            args.push('-f', options.files.join(','));
        }

        return this.execute(args, {}, {
            cwd: options.nucleusPath,
            onProgress: options.onProgress
        });
    }

}