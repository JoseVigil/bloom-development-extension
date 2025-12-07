import * as http from 'http';
import * as url from 'url';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

/**
 * ARQUITECTURA:
 * - Servidor HTTP interno del plugin VSCode
 * - Expone REST API para Home web (servida por Electron)
 * - Gestiona auth (GitHub + Gemini), Nucleus, Projects, Intents
 * - Puerto dinámico escrito en plugin-server.json
 * - Seguridad: solo localhost, sin CORS abierto
 */

// Managers del plugin (interfaces)
interface UserManager {
  isGithubAuthenticated(): boolean;
  getGithubUser(): any;
}

interface ConfigManager {
  hasGeminiToken(): boolean;
  setGeminiToken(token: string): Promise<void>;
  getGeminiToken(): string | undefined;
}

interface NucleusManager {
  list(): Promise<any[]>;
  create(data: any): Promise<any>;
  clone(data: any): Promise<any>;
  delete(id: string): Promise<void>;
  getSelected(): any;
}

interface ProjectsManager {
  list(): Promise<any[]>;
  create(data: any): Promise<any>;
  delete(id: string): Promise<void>;
}

interface IntentNavigator {
  list(): Promise<any[]>;
  run(data: any): Promise<any>;
}

export class PluginApiServer {
  private server: http.Server | null = null;
  private port: number = 0;
  private running = false;
  private outputChannel: vscode.OutputChannel;

  constructor(
    private context: vscode.ExtensionContext,
    private userManager: UserManager,
    private configManager: ConfigManager,
    private nucleusManager: NucleusManager,
    private projectsManager: ProjectsManager,
    private intentNavigator: IntentNavigator,
    outputChannel?: vscode.OutputChannel
  ) {
    this.outputChannel = outputChannel || vscode.window.createOutputChannel('Bloom Plugin API');
  }

  public isRunning(): boolean {
    return this.running;
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

      // Puerto dinámico
      this.server.listen(0, 'localhost', () => {
        const addr = this.server!.address();
        this.port = typeof addr === 'object' ? addr!.port : 0;
        this.running = true;
        this.log(`Plugin API Server running on http://localhost:${this.port}`);
        
        // Escribir puerto en JSON para Electron
        this.writePortFile();
        resolve();
      });
    });
  }

  public async stop(): Promise<void> {
    if (!this.server || !this.running) {
      return;
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.running = false;
        this.server = null;
        this.log('Plugin API Server stopped');
        resolve();
      });
    });
  }

  private writePortFile(): void {
    try {
      const localAppData = process.env.LOCALAPPDATA || process.env.HOME;
      if (!localAppData) return;

      const bloomDir = path.join(localAppData, 'BloomNucleus');
      if (!fs.existsSync(bloomDir)) {
        fs.mkdirSync(bloomDir, { recursive: true });
      }

      const portFile = path.join(bloomDir, 'plugin-server.json');
      fs.writeFileSync(portFile, JSON.stringify({ port: this.port }, null, 2));
      this.log(`Port file written: ${portFile}`);
    } catch (error) {
      this.log(`Error writing port file: ${error}`);
    }
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // Seguridad: solo localhost
    const host = req.headers.host || '';
    if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '';
    const query = parsedUrl.query;

    this.log(`${req.method} ${pathname}`);

    try {
      // Routing
      if (req.method === 'GET' && pathname === '/handshake') {
        await this.handleGetHandshake(req, res);
      } else if (req.method === 'GET' && pathname === '/auth/status') {
        await this.handleGetAuthStatus(req, res);
      } else if (req.method === 'POST' && pathname === '/auth/github/initiate') {
        await this.handlePostAuthGithubInitiate(req, res);
      } else if (req.method === 'POST' && pathname === '/auth/gemini') {
        await this.handlePostAuthGemini(req, res);
      } else if (req.method === 'GET' && pathname === '/nucleus') {
        await this.handleGetNucleus(req, res);
      } else if (req.method === 'POST' && pathname === '/nucleus/create') {
        await this.handlePostNucleusCreate(req, res);
      } else if (req.method === 'POST' && pathname === '/nucleus/clone') {
        await this.handlePostNucleusClone(req, res);
      } else if (req.method === 'DELETE' && pathname.startsWith('/nucleus/')) {
        await this.handleDeleteNucleus(pathname, req, res);
      } else if (req.method === 'GET' && pathname === '/projects') {
        await this.handleGetProjects(req, res);
      } else if (req.method === 'POST' && pathname === '/projects/create') {
        await this.handlePostProjectsCreate(req, res);
      } else if (req.method === 'DELETE' && pathname.startsWith('/projects/')) {
        await this.handleDeleteProject(pathname, req, res);
      } else if (req.method === 'GET' && pathname === '/intents') {
        await this.handleGetIntents(req, res);
      } else if (req.method === 'POST' && pathname === '/intents/run') {
        await this.handlePostIntentsRun(req, res);
      } else if (req.method === 'GET' && pathname === '/home') {
        await this.handleGetHome(req, res);
      } else {
        this.sendJson(res, 404, { error: 'Endpoint not found' });
      }
    } catch (error) {
      this.log(`Error handling request: ${error}`);
      this.sendJson(res, 500, {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  // ========== HANDLERS ==========

  private async handleGetHandshake(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.sendJson(res, 200, {
      ok: true,
      pluginVersion: this.getPluginVersion()
    });
  }

  private async handleGetAuthStatus(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.sendJson(res, 200, {
      github: this.userManager.isGithubAuthenticated(),
      gemini: this.configManager.hasGeminiToken()
    });
  }

  private async handlePostAuthGithubInitiate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      await vscode.commands.executeCommand('bloom.showWelcomeGithubOAuth');
      this.sendJson(res, 200, { ok: true });
    } catch (error) {
      this.sendJson(res, 500, { error: 'Failed to initiate GitHub OAuth' });
    }
  }

  private async handlePostAuthGemini(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    let data: any;

    try {
      data = JSON.parse(body);
    } catch {
      this.sendJson(res, 400, { error: 'Invalid JSON' });
      return;
    }

    const token = data.token;
    if (!token || typeof token !== 'string') {
      this.sendJson(res, 400, { error: 'Token required' });
      return;
    }

    try {
      await this.configManager.setGeminiToken(token);
      this.sendJson(res, 200, { ok: true });
    } catch (error) {
      this.sendJson(res, 500, { error: 'Failed to save token' });
    }
  }

  private async handleGetNucleus(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.checkAuth(res)) return;

    const list = await this.nucleusManager.list();
    this.sendJson(res, 200, list);
  }

  private async handlePostNucleusCreate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.checkAuth(res)) return;

    const data = await this.readJsonBody(req, res);
    if (!data) return;

    const result = await this.nucleusManager.create(data);
    this.sendJson(res, 200, result);
  }

  private async handlePostNucleusClone(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.checkAuth(res)) return;

    const data = await this.readJsonBody(req, res);
    if (!data) return;

    const result = await this.nucleusManager.clone(data);
    this.sendJson(res, 200, result);
  }

  private async handleDeleteNucleus(pathname: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.checkAuth(res)) return;

    const id = pathname.split('/')[2];
    await this.nucleusManager.delete(id);
    this.sendJson(res, 200, { ok: true });
  }

  private async handleGetProjects(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.checkAuth(res)) return;

    const list = await this.projectsManager.list();
    this.sendJson(res, 200, list);
  }

  private async handlePostProjectsCreate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.checkAuth(res)) return;

    const data = await this.readJsonBody(req, res);
    if (!data) return;

    const result = await this.projectsManager.create(data);
    this.sendJson(res, 200, result);
  }

  private async handleDeleteProject(pathname: string, req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.checkAuth(res)) return;

    const id = pathname.split('/')[2];
    await this.projectsManager.delete(id);
    this.sendJson(res, 200, { ok: true });
  }

  private async handleGetIntents(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.checkAuth(res)) return;

    // Validar nucleus y proyecto activo
    const nucleus = this.nucleusManager.getSelected();
    if (!nucleus) {
      this.sendJson(res, 403, { error: 'No nucleus selected' });
      return;
    }

    const projects = await this.projectsManager.list();
    if (projects.length === 0) {
      this.sendJson(res, 403, { error: 'No projects available' });
      return;
    }

    const list = await this.intentNavigator.list();
    this.sendJson(res, 200, list);
  }

  private async handlePostIntentsRun(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.checkAuth(res)) return;

    const data = await this.readJsonBody(req, res);
    if (!data) return;

    const result = await this.intentNavigator.run(data);
    this.sendJson(res, 200, result);
  }

  private async handleGetHome(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const html = this.getHomeHTML();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
  }

  // ========== HELPERS ==========

  private checkAuth(res: http.ServerResponse): boolean {
    if (!this.userManager.isGithubAuthenticated()) {
      this.sendJson(res, 403, { error: 'GitHub authentication required' });
      return false;
    }
    if (!this.configManager.hasGeminiToken()) {
      this.sendJson(res, 403, { error: 'Gemini token required' });
      return false;
    }
    return true;
  }

  private async readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private async readJsonBody(req: http.IncomingMessage, res: http.ServerResponse): Promise<any | null> {
    const body = await this.readBody(req);
    try {
      return body ? JSON.parse(body) : {};
    } catch {
      this.sendJson(res, 400, { error: 'Invalid JSON' });
      return null;
    }
  }

  private sendJson(res: http.ServerResponse, status: number, payload: any): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  }

  private log(message: string): void {
    const timestamp = new Date().toISOString();
    this.outputChannel.appendLine(`[${timestamp}] ${message}`);
  }

  private getPluginVersion(): string {
    return this.context.extension?.packageJSON?.version || '0.1.0';
  }

  private getHomeHTML(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bloom Nucleus - Home</title>
  <style>
    body { font-family: system-ui; max-width: 900px; margin: 40px auto; padding: 20px; }
    h1 { color: #5865F2; }
    .section { margin: 30px 0; padding: 20px; border: 1px solid #ddd; border-radius: 8px; }
    button { padding: 10px 20px; background: #5865F2; color: white; border: none; border-radius: 4px; cursor: pointer; }
    button:hover { background: #4752C4; }
    input { padding: 8px; width: 300px; margin-right: 10px; }
    .list { margin-top: 10px; }
    .item { padding: 10px; background: #f5f5f5; margin: 5px 0; border-radius: 4px; }
    .error { color: red; }
    .success { color: green; }
  </style>
</head>
<body>
  <h1>🌸 Bloom Nucleus</h1>
  
  <div id="auth-section" class="section">
    <h2>Authentication</h2>
    <div id="auth-content">Loading...</div>
  </div>

  <div id="main-content" style="display:none;">
    <div class="section">
      <h2>Nucleus</h2>
      <button onclick="createNucleus()">Create New</button>
      <div id="nucleus-list" class="list"></div>
    </div>

    <div class="section">
      <h2>Projects</h2>
      <button onclick="createProject()">Create New</button>
      <div id="projects-list" class="list"></div>
    </div>

    <div class="section">
      <h2>Intent Navigator</h2>
      <button onclick="openIntents()">Open Intents</button>
    </div>
  </div>

  <script>
    async function checkAuth() {
      const res = await fetch('/auth/status');
      const data = await res.json();
      
      const authContent = document.getElementById('auth-content');
      const mainContent = document.getElementById('main-content');
      
      if (!data.github) {
        authContent.innerHTML = '<p>GitHub authentication required</p><button onclick="initiateGithub()">Connect GitHub</button>';
      } else if (!data.gemini) {
        authContent.innerHTML = '<p>Gemini token required</p><input id="gemini-token" type="password" placeholder="Gemini API Token"><button onclick="saveGemini()">Save Token</button><div id="gemini-msg"></div>';
      } else {
        authContent.innerHTML = '<p class="success">✓ Authenticated</p>';
        mainContent.style.display = 'block';
        loadNucleus();
        loadProjects();
      }
    }

    async function initiateGithub() {
      await fetch('/auth/github/initiate', { method: 'POST' });
      alert('GitHub OAuth initiated in VSCode. Complete it and refresh this page.');
    }

    async function saveGemini() {
      const token = document.getElementById('gemini-token').value;
      const res = await fetch('/auth/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const msg = document.getElementById('gemini-msg');
      if (res.ok) {
        msg.innerHTML = '<p class="success">Token saved!</p>';
        setTimeout(() => location.reload(), 1000);
      } else {
        msg.innerHTML = '<p class="error">Failed to save token</p>';
      }
    }

    async function loadNucleus() {
      const res = await fetch('/nucleus');
      const data = await res.json();
      const list = document.getElementById('nucleus-list');
      list.innerHTML = data.map(n => \`<div class="item">\${n.name} - \${n.path}</div>\`).join('');
    }

    async function loadProjects() {
      const res = await fetch('/projects');
      const data = await res.json();
      const list = document.getElementById('projects-list');
      list.innerHTML = data.map(p => \`<div class="item">\${p.name}</div>\`).join('');
    }

    function createNucleus() {
      const name = prompt('Nucleus name:');
      if (name) {
        fetch('/nucleus/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        }).then(() => loadNucleus());
      }
    }

    function createProject() {
      const name = prompt('Project name:');
      if (name) {
        fetch('/projects/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        }).then(() => loadProjects());
      }
    }

    function openIntents() {
      window.location.href = '/intents';
    }

    checkAuth();
  </script>
</body>
</html>`;
  }
}