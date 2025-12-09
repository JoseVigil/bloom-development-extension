import * as http from 'http';
import * as url from 'url';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { WebSocketManager } from './WebSocketManager';
import { spawn } from 'child_process';
import { ChromeProfileManager } from '../core/chromeProfileManager';
import { AiAccountChecker } from '../ai/AiAccountChecker';
import { v4 as uuid4 } from 'uuid';

interface NucleusManager {
  create(data: any): Promise<any>;
  clone(data: any): Promise<any>;
  list(): Promise<any[]>;
}

interface ProjectManager {
  create(data: any): Promise<any>;
  list(): Promise<any[]>;
}

interface IntentManager {
  list(): Promise<any[]>;
  get(id: string): Promise<any>;
  run(data: any): Promise<any>;
}

interface GeminiClient {
  generate(data: any): Promise<any>;
  refine(data: any): Promise<any>;
  summarize(data: any): Promise<any>;
}

interface HostClient {
  getStatus(): Promise<any>;
}

interface UserManager {
  globalState: vscode.Memento;
  getGithubUsername(): Promise<string | undefined>;
  getGithubOrgs(): Promise<string[]>;
  setGithubUser(username: string, orgs: string[]): Promise<void>;
  isGithubAuthenticated(): Promise<boolean>;
  getGeminiApiKey(): Promise<string | undefined>;
  setGeminiApiKey(apiKey: string): Promise<void>;
  isGeminiConfigured(): Promise<boolean>;
}

interface BTIPNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: BTIPNode[];
}

interface PluginApiServerConfig {
  context: vscode.ExtensionContext;
  wsManager: WebSocketManager;
  nucleusManager: NucleusManager;
  projectManager: ProjectManager;
  intentManager: IntentManager;
  geminiClient: GeminiClient;
  hostClient: HostClient;
  userManager: UserManager;
  outputChannel: vscode.OutputChannel;
  pluginVersion: string;
  chromeProfileManager: ChromeProfileManager;
  aiAccountChecker: AiAccountChecker;
}

interface ScriptResult {
  code: number;
  stdout: string;
  stderr: string;
  summary?: string;
  filesCreated?: string[];
}

export class PluginApiServer {
  private server: http.Server | null = null;
  private port: number = 48215;
  private running: boolean = false;

  private context: vscode.ExtensionContext;
  private wsManager: WebSocketManager;
  private nucleusManager: NucleusManager;
  private projectManager: ProjectManager;
  private intentManager: IntentManager;
  private geminiClient: GeminiClient;
  private hostClient: HostClient;
  private userManager: UserManager;
  private outputChannel: vscode.OutputChannel;
  private pluginVersion: string;
  private chromeProfileManager: ChromeProfileManager;
  private aiAccountChecker: AiAccountChecker;

  constructor(config: PluginApiServerConfig) {
    this.context = config.context;
    this.wsManager = config.wsManager;
    this.nucleusManager = config.nucleusManager;
    this.projectManager = config.projectManager;
    this.intentManager = config.intentManager;
    this.geminiClient = config.geminiClient;
    this.hostClient = config.hostClient;
    this.userManager = config.userManager;
    this.outputChannel = config.outputChannel;
    this.pluginVersion = config.pluginVersion;
    this.chromeProfileManager = config.chromeProfileManager;
    this.aiAccountChecker = config.aiAccountChecker;
  }

  public getPort(): number {
    return this.port;
  }

  public async start(): Promise<void> {
    if (this.running) {
      this.log('Server already running');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      this.server.on('error', (err) => {
        this.log(`Server error: ${err.message}`);
        reject(err);
      });

      this.server.listen(this.port, () => {
        this.running = true;
        this.log(`PluginApiServer started on http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.server || !this.running) {
      this.log('Server not running');
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.running = false;
        this.server = null;
        this.log('PluginApiServer stopped');
        resolve();
      });
    });
  }

  public isRunning(): boolean {
    return this.running;
  }

  private isLocalRequest(req: http.IncomingMessage): boolean {
    const host = req.headers.host || '';
    return host.startsWith('localhost') || host.startsWith('127.0.0.1');
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (!this.isLocalRequest(req)) {
      this.sendJson(res, 403, { error: 'Forbidden: Only localhost access allowed' });
      return;
    }

    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '';
    const method = req.method || 'GET';

    this.log(`${method} ${pathname}`);

    try {
      // Health & Info
      if (method === 'GET' && pathname === '/health') {
        this.sendJson(res, 200, { status: 'ok' });
        return;
      }
      if (method === 'GET' && pathname === '/home') {
        await this.handleHome(req, res);
        return;
      }
      if (method === 'GET' && pathname === '/handshake') {
        await this.handleHandshake(req, res);
        return;
      }

      // Host
      if (method === 'GET' && pathname === '/host/status') {
        await this.handleHostStatus(req, res);
        return;
      }

      // Nucleus
      if (method === 'POST' && pathname === '/nucleus/create') {
        await this.handleNucleusCreate(req, res);
        return;
      }
      if (method === 'POST' && pathname === '/nucleus/clone') {
        await this.handleNucleusClone(req, res);
        return;
      }
      if (method === 'GET' && pathname === '/nucleus/list') {
        await this.handleNucleusList(req, res);
        return;
      }

      // Project
      if (method === 'POST' && pathname === '/project/create') {
        await this.handleProjectCreate(req, res);
        return;
      }
      if (method === 'GET' && pathname === '/project/list') {
        await this.handleProjectList(req, res);
        return;
      }

      // Intents
      if (method === 'GET' && pathname === '/intents/list') {
        await this.handleIntentsList(req, res);
        return;
      }
      if (method === 'GET' && pathname === '/intents/get') {
        await this.handleIntentsGet(req, res, parsedUrl.query);
        return;
      }
      if (method === 'POST' && pathname === '/intents/run') {
        await this.handleIntentsRun(req, res);
        return;
      }

      // Doc
      if (method === 'POST' && pathname === '/doc/generate') {
        await this.handleDocGenerate(req, res);
        return;
      }
      if (method === 'POST' && pathname === '/doc/refine') {
        await this.handleDocRefine(req, res);
        return;
      }
      if (method === 'POST' && pathname === '/doc/summarize') {
        await this.handleDocSummarize(req, res);
        return;
      }

      // BTIP Auth
      if (method === 'GET' && pathname === '/btip/auth/status') {
        await this.handleAuthStatus(req, res);
        return;
      }
      if (method === 'GET' && pathname === '/btip/auth/github/start') {
        await this.handleGithubAuthStart(req, res);
        return;
      }
      if (method === 'POST' && pathname === '/btip/auth/github/complete') {
        await this.handleGithubAuthComplete(req, res);
        return;
      }
      if (method === 'POST' && pathname === '/btip/auth/gemini') {
        await this.handleGeminiAuth(req, res);
        return;
      }

      // BTIP Explorer (with auth)
      if (method === 'GET' && pathname === '/btip/explorer/tree') {
        if (!(await this.checkAuth(res))) return;
        await this.handleGetTree(new URL(req.url || '/', `http://localhost:${this.port}`), res);
        return;
      }
      if (method === 'GET' && pathname === '/btip/explorer/file') {
        if (!(await this.checkAuth(res))) return;
        await this.handleGetFile(new URL(req.url || '/', `http://localhost:${this.port}`), res);
        return;
      }
      if (method === 'POST' && pathname === '/btip/explorer/refresh') {
        if (!(await this.checkAuth(res))) return;
        await this.handleRefresh(res);
        return;
      }

      // BTIP Nucleus & Projects (with auth)
      if (method === 'POST' && pathname === '/btip/nucleus/create') {
        if (!(await this.checkAuth(res))) return;
        await this.handleBtipNucleusCreate(req, res);
        return;
      }
      if (method === 'POST' && pathname === '/btip/projects/create') {
        if (!(await this.checkAuth(res))) return;
        await this.handleBtipProjectsCreate(req, res);
        return;
      }

      // NEW: Profiles API v1
      if (method === 'GET' && pathname === '/api/v1/profiles') {
        await this.handleGetProfiles(req, res);
        return;
      }
      if (method === 'GET' && pathname.match(/^\/api\/v1\/profiles\/[^/]+$/)) {
        await this.handleGetProfileById(req, res, pathname);
        return;
      }
      if (method === 'POST' && pathname.match(/^\/api\/v1\/profiles\/[^/]+\/refresh-accounts$/)) {
        await this.handleRefreshAccounts(req, res, pathname);
        return;
      }
      if (method === 'POST' && pathname === '/api/v1/intents/dev/create') {
          await this.handleIntentDevCreate(req, res);
          return;
      }

      // 404
      this.sendJson(res, 404, { error: 'Endpoint not found' });
    } catch (error: any) {
      this.log(`Error handling ${method} ${pathname}: ${error.message}`);
      this.sendJson(res, 500, { error: error.message || 'Internal server error' });
    }
  }

  // ============================================================================
  // NEW: PROFILES API v1
  // ============================================================================

  private async handleGetProfiles(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const profiles = await this.chromeProfileManager.detectProfiles();
      
      const profilesWithAccounts = await Promise.all(
        profiles.map(async (profile) => {
          const aiAccounts = await this.aiAccountChecker.checkAllForProfile(profile.name);
          
          return {
            id: profile.name,
            name: profile.displayName || profile.name,
            path: profile.path,
            aiAccounts: aiAccounts.map(account => ({
              provider: account.provider,
              accountId: account.accountId || `${account.provider}-default`,
              status: account.ok ? 'active' : 'inactive',
              usageRemaining: account.usageRemaining,
              quota: account.quota,
              error: account.error,
              lastChecked: account.lastChecked
            }))
          };
        })
      );

      this.sendJson(res, 200, { profiles: profilesWithAccounts });
    } catch (error: any) {
      this.log(`Error getting profiles: ${error.message}`);
      this.sendJson(res, 500, { error: error.message });
    }
  }

  private async handleGetProfileById(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
    try {
      const parts = pathname.split('/');
      const profileId = parts[parts.length - 1];
      
      if (!profileId) {
        this.sendJson(res, 400, { error: 'Missing profile ID' });
        return;
      }

      const profile = await this.chromeProfileManager.getProfileByName(profileId);
      if (!profile) {
        this.sendJson(res, 404, { error: 'Profile not found' });
        return;
      }

      const aiAccounts = await this.aiAccountChecker.checkAllForProfile(profile.name);

      const profileWithAccounts = {
        id: profile.name,
        name: profile.displayName || profile.name,
        path: profile.path,
        aiAccounts: aiAccounts.map(account => ({
          provider: account.provider,
          accountId: account.accountId || `${account.provider}-default`,
          status: account.ok ? 'active' : 'inactive',
          usageRemaining: account.usageRemaining,
          quota: account.quota,
          error: account.error,
          lastChecked: account.lastChecked
        }))
      };

      this.sendJson(res, 200, profileWithAccounts);
    } catch (error: any) {
      this.log(`Error getting profile by ID: ${error.message}`);
      this.sendJson(res, 500, { error: error.message });
    }
  }

  private async handleRefreshAccounts(req: http.IncomingMessage, res: http.ServerResponse, pathname: string): Promise<void> {
    try {
      const parts = pathname.split('/');
      const profileId = parts[parts.length - 2];
      
      if (!profileId) {
        this.sendJson(res, 400, { error: 'Missing profile ID' });
        return;
      }

      const profile = await this.chromeProfileManager.getProfileByName(profileId);
      if (!profile) {
        this.sendJson(res, 404, { error: 'Profile not found' });
        return;
      }

      this.aiAccountChecker.clearCache(profileId);
      const aiAccounts = await this.aiAccountChecker.checkAllForProfile(profileId);

      const accountsFormatted = aiAccounts.map(account => ({
        provider: account.provider,
        accountId: account.accountId || `${account.provider}-default`,
        status: account.ok ? 'active' : 'inactive',
        usageRemaining: account.usageRemaining,
        quota: account.quota,
        error: account.error,
        lastChecked: account.lastChecked
      }));

      this.wsManager.broadcast('profile:update', {
        profileId,
        aiAccounts: accountsFormatted,
        timestamp: Date.now()
      });

      this.sendJson(res, 200, { ok: true });
    } catch (error: any) {
      this.log(`Error refreshing accounts: ${error.message}`);
      this.sendJson(res, 500, { error: error.message });
    }
  }

  private async handleIntentDevCreate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const { name, uid, profileId, aiProvider, aiAccountId, files, problem, expectedOutput } = body;

    if (!name || !uid || !profileId || !aiProvider || !aiAccountId || !files) {
      this.sendJson(res, 400, { error: 'Missing required fields' });
      return;
    } const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
      this.sendJson(res, 400, { error: 'No workspace folder open' });
      return;
    }
    try {
      const args = [
        '--name', name,
        '--uid', uid,
        '--profile', profileId,
        '--provider', aiProvider,
        '--account', aiAccountId,
        '--files', JSON.stringify(files),
        '--workspace', workspacePath
      ];

      if (problem) args.push('--problem', problem);
      if (expectedOutput) args.push('--expected-output', expectedOutput);

      const result = await this.runPythonScript('create_intent.py', args);

      if (result.code === 0) {
        this.wsManager.broadcast('intents:created', {
          id: uuid4(), 
          name,
          uid,
          profileId,
          aiProvider,
          url: `/intents/${name}-${uid}`
        });

        this.sendJson(res, 201, {
          ok: true,
          name,
          uid,
          path: path.join(workspacePath, '.bloom', 'intents', 'dev', `${name}-${uid}`),
          url: `/intents/${name}-${uid}`,
          summary: result.summary || 'Intent DEV created'
        });
      } else {
        this.sendJson(res, 500, {
          ok: false,
          error: 'Script failed',
          stderr: result.stderr
        });
      }
    } catch (error: any) {
      this.log(`Error in handleIntentDevCreate: ${error.message}`);
      this.sendJson(res, 500, { error: error.message });
    }
  }

  // ============================================================================
  // AUTH
  // ============================================================================

  private async checkAuth(res: http.ServerResponse): Promise<boolean> {
    const githubAuth = await this.userManager.isGithubAuthenticated();
    const geminiAuth = await this.userManager.isGeminiConfigured();
    
    if (!githubAuth || !geminiAuth) {
      this.sendJson(res, 403, { 
        error: 'Authentication required',
        githubAuthenticated: githubAuth,
        geminiConfigured: geminiAuth
      });
      return false;
    }
    return true;
  }

  private async handleAuthStatus(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const githubAuthenticated = await this.userManager.isGithubAuthenticated();
    const geminiConfigured = await this.userManager.isGeminiConfigured();
    const githubUsername = await this.userManager.getGithubUsername();
    const allOrgs = await this.userManager.getGithubOrgs();

    this.sendJson(res, 200, {
      githubAuthenticated,
      geminiConfigured,
      githubUsername: githubUsername || null,
      allOrgs: allOrgs || []
    });
  }

  private async handleGithubAuthStart(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      await vscode.commands.executeCommand('bloom.openWelcomeGithub');
      this.sendJson(res, 200, { ok: true });
    } catch (error: any) {
      this.sendJson(res, 500, { error: error.message });
    }
  }

  private async handleGithubAuthComplete(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const { code, state, username, orgs } = body;

    if (!code || !state) {
      this.sendJson(res, 400, { error: 'Missing code or state' });
      return;
    }

    if (!username) {
      this.sendJson(res, 400, { error: 'Missing username' });
      return;
    }

    try {
      await this.userManager.setGithubUser(username, orgs || []);
      
      this.wsManager.broadcast('auth:updated', {
        githubAuthenticated: true,
        username,
        allOrgs: orgs || []
      });

      this.sendJson(res, 200, {
        ok: true,
        username,
        allOrgs: orgs || []
      });
    } catch (error: any) {
      this.sendJson(res, 500, { error: error.message });
    }
  }

  private async handleGeminiAuth(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const { apiKey } = body;

    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      this.sendJson(res, 400, { error: 'Invalid API key' });
      return;
    }

    try {
      await this.userManager.setGeminiApiKey(apiKey);
      
      this.wsManager.broadcast('auth:updated', {
        geminiConfigured: true
      });

      this.sendJson(res, 200, { ok: true });
    } catch (error: any) {
      this.sendJson(res, 500, { error: error.message });
    }
  }

  // ============================================================================
  // BASIC HANDLERS
  // ============================================================================

  private async handleHome(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.sendJson(res, 200, { 
      message: 'Bloom Plugin API',
      version: this.pluginVersion,
      endpoints: [
        '/health', 
        '/home', 
        '/handshake', 
        '/host/status', 
        '/nucleus/*', 
        '/project/*', 
        '/intents/*', 
        '/doc/*', 
        '/btip/auth/*', 
        '/btip/explorer/*', 
        '/btip/nucleus/*', 
        '/btip/projects/*',
        '/api/v1/profiles',
        '/api/v1/profiles/:id',
        '/api/v1/profiles/:id/refresh-accounts'
      ]
    });
  }

  private async handleHandshake(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const platform = process.platform === 'win32' ? 'windows' : 
                     process.platform === 'darwin' ? 'mac' : 'linux';
    
    this.sendJson(res, 200, {
      status: 'ok',
      pluginVersion: this.pluginVersion,
      platform: platform
    });
  }

  private async handleHostStatus(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const status = await this.hostClient.getStatus();
    this.sendJson(res, 200, status);
  }

  // ============================================================================
  // NUCLEUS
  // ============================================================================

  private async handleNucleusCreate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const result = await this.nucleusManager.create(body);
    this.sendJson(res, 201, result);
  }

  private async handleNucleusClone(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const result = await this.nucleusManager.clone(body);
    this.sendJson(res, 201, result);
  }

  private async handleNucleusList(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const list = await this.nucleusManager.list();
    this.sendJson(res, 200, { nuclei: list });
  }

  // ============================================================================
  // PROJECT
  // ============================================================================

  private async handleProjectCreate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const result = await this.projectManager.create(body);
    this.sendJson(res, 201, result);
  }

  private async handleProjectList(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const list = await this.projectManager.list();
    this.sendJson(res, 200, { projects: list });
  }

  // ============================================================================
  // INTENTS
  // ============================================================================

  private async handleIntentsList(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const list = await this.intentManager.list();
    this.sendJson(res, 200, { intents: list });
  }

  private async handleIntentsGet(req: http.IncomingMessage, res: http.ServerResponse, query: any): Promise<void> {
    const id = query.id as string;
    if (!id) {
      this.sendJson(res, 400, { error: 'Missing id parameter' });
      return;
    }
    const intent = await this.intentManager.get(id);
    this.sendJson(res, 200, intent);
  }

  private async handleIntentsRun(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const result = await this.intentManager.run(body);
    this.sendJson(res, 200, result);
  }

  // ============================================================================
  // DOC
  // ============================================================================

  private async handleDocGenerate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const result = await this.geminiClient.generate(body);
    this.sendJson(res, 200, result);
  }

  private async handleDocRefine(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const result = await this.geminiClient.refine(body);
    this.sendJson(res, 200, result);
  }

  private async handleDocSummarize(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const result = await this.geminiClient.summarize(body);
    this.sendJson(res, 200, result);
  }

  // ============================================================================
  // BTIP NUCLEUS & PROJECTS
  // ============================================================================

  private async handleBtipNucleusCreate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const { name, org, repoUrl } = body;

    if (!name) {
      this.sendJson(res, 400, { error: 'Missing required field: name' });
      return;
    }

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
      this.sendJson(res, 400, { error: 'No workspace folder open' });
      return;
    }

    const sanitizedPath = this.sanitizePath(workspacePath);
    if (!sanitizedPath) {
      this.sendJson(res, 400, { error: 'Invalid workspace path' });
      return;
    }

    try {
      const args = [
        '--name', name,
        '--root', sanitizedPath,
        '--output', '.bloom'
      ];

      if (org) {
        args.push('--org', org);
      }

      if (repoUrl) {
        args.push('--url', repoUrl);
      }

      const result = await this.runPythonScript('generate_nucleus.py', args);

      if (result.code === 0) {
        this.wsManager.broadcast('nucleus:created', {
          name,
          org,
          path: path.join(sanitizedPath, '.bloom')
        });

        this.sendJson(res, 201, {
          ok: true,
          summary: result.summary || 'Nucleus created successfully',
          filesCreated: result.filesCreated || [],
          stdout: result.stdout,
          stderr: result.stderr
        });
      } else {
        this.sendJson(res, 500, {
          ok: false,
          error: 'Script execution failed',
          stdout: result.stdout,
          stderr: result.stderr
        });
      }
    } catch (error: any) {
      this.log(`Error in handleBtipNucleusCreate: ${error.message}`);
      this.sendJson(res, 500, { error: error.message });
    }
  }

  private async handleBtipProjectsCreate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const { strategy, rootPath, output } = body;

    if (!strategy || !rootPath) {
      this.sendJson(res, 400, { error: 'Missing required fields: strategy, rootPath' });
      return;
    }

    const sanitizedRootPath = this.sanitizePath(rootPath);
    if (!sanitizedRootPath) {
      this.sendJson(res, 400, { error: 'Invalid root path' });
      return;
    }

    const sanitizedOutput = output ? this.sanitizePath(output) : '.bloom/project';

    try {
      const args = [
        '--strategy', strategy,
        '--root', sanitizedRootPath,
        '--output', sanitizedOutput
      ];

      const result = await this.runPythonScript('generate_project_context.py', args);

      if (result.code === 0) {
        this.wsManager.broadcast('project:created', {
          strategy,
          rootPath: sanitizedRootPath,
          output: sanitizedOutput
        });

        this.sendJson(res, 201, {
          ok: true,
          summary: result.summary || 'Project context created successfully',
          filesCreated: result.filesCreated || [],
          stdout: result.stdout,
          stderr: result.stderr
        });
      } else {
        this.sendJson(res, 500, {
          ok: false,
          error: 'Script execution failed',
          stdout: result.stdout,
          stderr: result.stderr
        });
      }
    } catch (error: any) {
      this.log(`Error in handleBtipProjectsCreate: ${error.message}`);
      this.sendJson(res, 500, { error: error.message });
    }
  }

  // ============================================================================
  // BTIP EXPLORER
  // ============================================================================

  private async handleGetTree(url: URL, res: http.ServerResponse): Promise<void> {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No workspace found' }));
      return;
    }
    const requestedPath = url.searchParams.get('path') || '';
    const fullPath = path.join(workspacePath, '.bloom', requestedPath);
    try {
      const tree = await this.buildTree(fullPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(tree));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(error) }));
    }
  }

  private async buildTree(dirPath: string): Promise<BTIPNode[]> {
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const nodes: BTIPNode[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const node: BTIPNode = {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'directory' : 'file'
        };
        if (entry.isDirectory()) {
          node.children = await this.buildTree(fullPath);
        }
        nodes.push(node);
      }
      return nodes.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'directory' ? -1 : 1;
      });
    } catch (error) {
      return [];
    }
  }

  private async handleGetFile(url: URL, res: http.ServerResponse): Promise<void> {
    const filePath = url.searchParams.get('path');
    if (!filePath) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Path parameter required' }));
      return;
    }
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const ext = path.extname(filePath).toLowerCase();
     
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        path: filePath,
        content,
        extension: ext
      }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(error) }));
    }
  }

  private async handleRefresh(res: http.ServerResponse): Promise<void> {
    this.wsManager.broadcast('btip:updated', { path: null });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  private async runPythonScript(scriptName: string, args: string[]): Promise<ScriptResult> {
    const extensionPath = this.context.extensionPath;
    const scriptsPath = path.join(extensionPath, 'scripts');
    const scriptPath = path.join(scriptsPath, scriptName);

    return new Promise((resolve, reject) => {
      const timeout = 300000;
      const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';

      this.log(`Executing: ${pythonCommand} ${scriptPath} ${args.join(' ')}`);

      const child = spawn(pythonCommand, [scriptPath, ...args], {
        cwd: scriptsPath,
        timeout: timeout
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        const output = data.toString();
        stdout += output;
        this.log(`[STDOUT] ${output}`);
      });

      child.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        this.log(`[STDERR] ${output}`);
      });

      child.on('error', (error) => {
        this.log(`Process error: ${error.message}`);
        reject(error);
      });

      child.on('close', (code) => {
        this.log(`Process exited with code: ${code}`);

        const filesCreated = this.extractFilesFromOutput(stdout, 'CREATED:');
        const summary = this.extractSummaryFromOutput(stdout);

        resolve({
          code: code || 0,
          stdout,
          stderr,
          summary,
          filesCreated
        });
      });

      setTimeout(() => {
        if (!child.killed) {
          child.kill();
          reject(new Error('Script execution timeout'));
        }
      }, timeout);
    });
  }

  private sanitizePath(inputPath: string): string | null {
    try {
      const normalized = path.normalize(inputPath);
      
      if (normalized.includes('..')) {
        return null;
      }

      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (workspacePath && !normalized.startsWith(workspacePath)) {
        return null;
      }

      return normalized;
    } catch {
      return null;
    }
  }

  private extractFilesFromOutput(output: string, marker: string): string[] {
    const lines = output.split('\n');
    const files: string[] = [];

    for (const line of lines) {
      if (line.includes(marker)) {
        const filePath = line.split(marker)[1]?.trim();
        if (filePath) {
          files.push(filePath);
        }
      }
    }

    return files;
  }

  private extractSummaryFromOutput(output: string): string | undefined {
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('SUMMARY:')) {
        return line.split('SUMMARY:')[1]?.trim();
      }
    }
    return undefined;
  }

  private sendJson(res: http.ServerResponse, status: number, payload: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  }

  private parseBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve(parsed);
        } catch (err) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    this.outputChannel.appendLine(logMessage);
    console.log(logMessage);
  }
}