/**
 * BrainExecutor - Universal interface to Brain CLI
 * 
 * ✅ UPDATED: Compatible with Sentinel-injected executable (Go binary or Python)
 * ❌ OLD: Fixed runtime Python + brain/__main__.py
 * ✅ NEW: Uses BLOOM_BRAIN_EXE env var (priority) or VS Code setting
 */

import { spawn } from 'child_process';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

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

    private static executablePath: string | null = null;
    private static isBinaryMode: boolean = false;

    /**
     * ✅ NEW: Initialize Brain executor using Sentinel-injected path or VS Code config
     * Called once during extension activation
     */
    static async initialize(): Promise<void> {
        const config = vscode.workspace.getConfiguration('bloom');
        // Sentinel escribió esto en settings.json antes de lanzar VS Code
        const brainPath = config.get<string>('brain.executable');
        const pythonPath = config.get<string>('pythonPath');

        if (brainPath) {
            this.executablePath = brainPath;
            console.log(`[Sentinel-First] Usando Brain detectado por Sentinel: ${brainPath}`);
        } else {
            // Fallback si no hay Sentinel
            this.executablePath = pythonPath || "python"; 
        }
    }

    /**
     * ✅ REFACTORED: Execute Brain CLI command and parse JSON output
     * Compatible with both binary and python -m brain modes
     */
    public static async execute<T = any>(
        commands: string[],
        args: Record<string, any> = {},
        options: { cwd?: string; timeout?: number; onProgress?: (line: string) => void; } = {}
    ): Promise<BrainResult<T>> {
        return new Promise((resolve, reject) => {
            if (!this.executablePath) {
                return reject(new Error('BrainExecutor no inicializado. Llama a initialize() primero.'));
            }

            // Base arguments depending on mode
            const baseArgs = this.isBinaryMode 
                ? ['--json']
                : ['-m', 'brain', '--json'];

            const fullArgs = [...baseArgs, ...commands];

            // Inject key-value and flag arguments
            Object.entries(args).forEach(([key, value]) => {
                if (typeof value === 'boolean' && value) {
                    fullArgs.push(key);
                } else if (value !== undefined && value !== null) {
                    fullArgs.push(key, value.toString());
                }
            });

            console.log(`[BrainExecutor] Ejecutando: ${this.executablePath} ${fullArgs.join(' ')}`);
            if (options.cwd) console.log(`[BrainExecutor] CWD: ${options.cwd}`);

            const proc = spawn(this.executablePath, fullArgs, {
                cwd: options.cwd,
                env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
            });

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => {
                stdout += data.toString();
            });

            proc.stderr.on('data', (data) => {
                const line = data.toString().trim();
                stderr += line + '\n';
                if (options.onProgress && line) {
                    options.onProgress(line);
                }
            });

            const timeoutId = setTimeout(() => {
                proc.kill();
                reject(new Error(`Timeout after ${options.timeout || 60000}ms`));
            }, options.timeout || 60000);

            proc.on('close', (code) => {
                clearTimeout(timeoutId);

                try {
                    const result = JSON.parse(stdout.trim()) as BrainResult<T>;

                    if (result.status === 'success') {
                        console.log(`[BrainExecutor] ✅ Éxito: ${result.operation || commands[0]}`);
                    } else {
                        console.warn(`[BrainExecutor] ⚠️ Estado no success:`, result);
                    }

                    resolve(result);
                } catch (parseErr) {
                    reject(new Error(
                        `No se pudo parsear salida JSON de Brain:\n${stdout.slice(0, 400)}...\n\nStderr:\n${stderr}`
                    ));
                }
            });

            proc.on('error', (err) => {
                clearTimeout(timeoutId);
                reject(err);
            });
        });
    }

    // ============================================================================
    // GITHUB AUTHENTICATION
    // ============================================================================

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

    // ============================================================================
    // GITHUB ORGANIZATIONS
    // ============================================================================

    static async githubOrgsList(): Promise<BrainResult<{ organizations: GitHubOrganization[] }>> {
        return this.execute(['github', 'orgs-list']);
    }

    // ============================================================================
    // GITHUB REPOSITORIES
    // ============================================================================

    static async githubReposList(org?: string): Promise<BrainResult<{ repositories: GitHubRepository[] }>> {
        const args = ['github', 'repos-list'];
        if (org) args.push('--org', org);
        return this.execute(args);
    }

    static async githubReposCreate(options: {
        name: string;
        org?: string;
        description?: string;
        private?: boolean;
    }): Promise<BrainResult<{ repo: GitHubRepository }>> {
        const args = ['github', 'repos', 'create', options.name];
        if (options.org) args.push('--org', options.org);
        if (options.description) args.push('--description', options.description);
        if (options.private) args.push('--private');
        return this.execute(args);
    }

    static async githubReposGet(fullName: string): Promise<BrainResult<{ repo: GitHubRepository }>> {
        return this.execute(['github', 'repos', 'get', fullName]);
    }

    // ============================================================================
    // GITHUB CLONE
    // ============================================================================

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

    // ============================================================================
    // NUCLEUS PROJECTS
    // ============================================================================

    static async nucleusCreate(options: {
        org: string;
        path?: string;
        private?: boolean;
        force?: boolean;
        onProgress?: (line: string) => void;
    }): Promise<BrainResult<NucleusProject>> {
        const args = ['nucleus', 'create', '-o', options.org];
        if (options.path) args.push('-p', options.path);
        if (options.private) args.push('--private');
        if (options.force) args.push('-f');

        return this.execute<NucleusProject>(args, {}, {
            onProgress: options.onProgress
        });
    }

    static async nucleusLink(
        path: string,
        force?: boolean
    ): Promise<BrainResult<NucleusProject>> {
        const args = ['nucleus', 'link', path];
        if (force) args.push('--force');
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
        if (path) args.push('-p', path);
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
        if (options?.nucleusPath) args.push('-p', options.nucleusPath);
        if (options?.strategy) args.push('-s', options.strategy);
        if (options?.activeOnly) args.push('--active-only');
        return this.execute(args, {}, { cwd: options?.nucleusPath });
    }

    // ============================================================================
    // PROJECT COMMANDS
    // ============================================================================

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
        if (options.maxDepth !== undefined) args.push('-d', options.maxDepth.toString());
        if (options.strategy) args.push('-s', options.strategy);
        if (options.minConfidence) args.push('-c', options.minConfidence);
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
        const args = ['project', 'add', options.projectPath, '-n', options.nucleusPath];
        if (options.name) args.push('--name', options.name);
        if (options.strategy) args.push('--strategy', options.strategy);
        if (options.description) args.push('--description', options.description);
        if (options.repoUrl) args.push('--repo-url', options.repoUrl);
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
        if (options.destination) args.push('-d', options.destination);
        if (options.name) args.push('--name', options.name);
        if (options.strategy) args.push('--strategy', options.strategy);
        if (options.description) args.push('--description', options.description);

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

    // ============================================================================
    // CONTEXT GENERATION
    // ============================================================================

    static async contextGenerate(options: {
        path?: string;
        output?: string;
        strategy?: string;
    } = {}): Promise<BrainResult<any>> {
        const args = ['context', 'generate'];
        if (options.path) args.push('-p', options.path);
        if (options.output) args.push('-o', options.output);
        if (options.strategy) args.push('-s', options.strategy);
        return this.execute(args, {}, { cwd: options.path });
    }

    // ============================================================================
    // FILESYSTEM OPERATIONS
    // ============================================================================

    static async filesystemTree(options: {
        targets: string[];
        output?: string;
        hash?: boolean;
        exportJson?: boolean;
    }): Promise<BrainResult<{ outputFile?: string }>> {
        const args = ['filesystem', 'tree', ...options.targets];
        if (options.output) args.push('-o', options.output);
        if (options.hash) args.push('--hash');
        if (options.exportJson) args.push('--export-json');
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
        if (options.output) args.push('-o', options.output);
        if (options.exclude) {
            options.exclude.forEach(p => args.push('-e', p));
        }
        if (options.noComments) args.push('--no-comments');
        return this.execute(args);
    }

    static async filesystemExtract(options: {
        jsonFile: string;
        output?: string;
        verifyHashes?: boolean;
    }): Promise<BrainResult<{ extracted_path: string }>> {
        const args = ['filesystem', 'extract', options.jsonFile];
        if (options.output) args.push('-o', options.output);
        if (options.verifyHashes !== undefined) {
            args.push(options.verifyHashes ? '--verify-hashes' : '--no-verify-hashes');
        }
        return this.execute(args);
    }

    // ============================================================================
    // HEALTH OPERATIONS
    // ============================================================================

    static async healthOnboardingStatus(): Promise<BrainResult<OnboardingStatusResponse>> {
        return this.execute<OnboardingStatusResponse>(['health', 'onboarding-status']);
    }

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

    static async healthWebSocketStatus(): Promise<BrainResult<{
        status: 'running' | 'stopped';
        connections: number;
        port?: number;
    }>> {
        return this.execute(['health', 'websocket-status']);
    }

    static async healthDevCheck(): Promise<BrainResult<{
        is_dev_mode: boolean;
        reason: string;
        services: {
            dev_server: { available: boolean; host: string | null; port: number };
            api: { available: boolean; host: string | null; port: number };
            websocket: { available: boolean; host: string | null; port: number };
        };
        timestamp: string;
    }>> {
        return this.execute(['health', 'dev-check']);
    }

    // ============================================================================
    // UTILITIES
    // ============================================================================

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
            return this.isBinaryMode ? 'Brain CLI (native binary)' : 'Brain CLI v2.0 (Python)';
        } catch {
            return 'Unknown';
        }
    }

    static reset(): void {
        this.executablePath = null;
        this.isBinaryMode = false;
    }

    // ============================================================================
    // MÉTODOS MIGRADOS / COMPATIBILIDAD HACIA ATRÁS
    // ============================================================================

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
            strategy
        });
    }

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
                error: 'Se requiere intentId o intentFolder'
            };
        }

        try {
            options.onProgress?.('Parseando snapshot...');
            const parseResult = await this.execute(['intent', 'parse', '-i', intentId], {}, {
                cwd: projectRoot,
                onProgress: options.onProgress
            });

            if (parseResult.status !== 'success') {
                return { status: 'error', error: `Parse falló: ${parseResult.error || parseResult.message}` };
            }

            options.onProgress?.('Staging archivos...');
            const stageArgs = ['intent', 'stage', '-i', intentId];
            if (options.stage) stageArgs.push('-s', options.stage);
            if (options.dryRun) stageArgs.push('--dry-run');

            const stageResult = await this.execute(stageArgs, {}, {
                cwd: projectRoot,
                onProgress: options.onProgress
            });

            if (stageResult.status !== 'success') {
                return { status: 'error', error: `Stage falló: ${stageResult.error || stageResult.message}` };
            }

            let validated = true;
            if (!options.autoApprove && !options.dryRun) {
                options.onProgress?.('Validando cambios...');
                const validateArgs = ['intent', 'validate', '-i', intentId];
                if (options.stage) validateArgs.push('-s', options.stage);

                const validateResult = await this.execute(validateArgs, {}, {
                    cwd: projectRoot,
                    onProgress: options.onProgress
                });

                if (validateResult.status !== 'success') {
                    validated = false;
                    console.warn('[BrainExecutor] Validación falló, continuando...');
                }
            }

            if (options.dryRun) {
                return {
                    status: 'success',
                    operation: 'integrate_snapshot_dry_run',
                    message: 'Dry-run completado',
                    data: { parsed: true, staged: true, validated, merged: false }
                };
            }

            options.onProgress?.('Mergeando cambios...');
            const mergeArgs = ['intent', 'merge', '-i', intentId];
            if (options.stage) mergeArgs.push('-s', options.stage);
            if (options.force) mergeArgs.push('--force');
            if (options.noBackup) mergeArgs.push('--no-backup');

            const mergeResult = await this.execute(mergeArgs, {}, {
                cwd: projectRoot,
                onProgress: options.onProgress
            });

            if (mergeResult.status !== 'success') {
                return { status: 'error', error: `Merge falló: ${mergeResult.error || mergeResult.message}` };
            }

            return {
                status: 'success',
                operation: 'integrate_snapshot',
                message: 'Snapshot integrado correctamente',
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
        } catch (err: any) {
            return {
                status: 'error',
                operation: 'integrate_snapshot',
                error: err.message
            };
        }
    }

    static async createIntentDev(
        intentName: string,
        options: {
            nucleusPath?: string;
            files?: string[];
            onProgress?: (line: string) => void;
        } = {}
    ): Promise<BrainResult<any>> {
        const args = ['intent', 'create', '-t', 'dev', '-n', intentName];
        if (options.nucleusPath) args.push('-p', options.nucleusPath);
        if (options.files && options.files.length > 0) {
            args.push('-f', options.files.join(','));
        }
        return this.execute(args, {}, {
            cwd: options.nucleusPath,
            onProgress: options.onProgress
        });
    }
}