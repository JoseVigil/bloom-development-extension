import * as http from 'http';
import * as url from 'url';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { WebSocketManager } from './WebSocketManager';

// Interfaces for service dependencies
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
  outputChannel: vscode.OutputChannel;
  pluginVersion: string;
}

export class PluginApiServer {
  private server: http.Server | null = null;
  private port: number = 48215; // Using the port from the current class; adjust if needed
  private running: boolean = false;

  private context: vscode.ExtensionContext;
  private wsManager: WebSocketManager;
  private nucleusManager: NucleusManager;
  private projectManager: ProjectManager;
  private intentManager: IntentManager;
  private geminiClient: GeminiClient;
  private hostClient: HostClient;
  private outputChannel: vscode.OutputChannel;
  private pluginVersion: string;

  constructor(config: PluginApiServerConfig) {
    this.context = config.context;
    this.wsManager = config.wsManager;
    this.nucleusManager = config.nucleusManager;
    this.projectManager = config.projectManager;
    this.intentManager = config.intentManager;
    this.geminiClient = config.geminiClient;
    this.hostClient = config.hostClient;
    this.outputChannel = config.outputChannel;
    this.pluginVersion = config.pluginVersion;
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

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    // CORS headers (merged: using '*' from current, but can adjust to 'https://b.tips' if specific)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '';
    const method = req.method || 'GET';

    this.log(`${method} ${pathname}`);

    try {
      // Merged route handling: includes all from both versions
      if (method === 'GET' && pathname === '/health') {
        this.sendJson(res, 200, { status: 'ok' });
      } else if (method === 'GET' && pathname === '/home') {
        await this.handleHome(req, res);
      } else if (method === 'GET' && pathname === '/handshake') {
        await this.handleHandshake(req, res);
      } else if (method === 'GET' && pathname === '/host/status') {
        await this.handleHostStatus(req, res);
      } else if (method === 'POST' && pathname === '/nucleus/create') {
        await this.handleNucleusCreate(req, res);
      } else if (method === 'POST' && pathname === '/nucleus/clone') {
        await this.handleNucleusClone(req, res);
      } else if (method === 'GET' && pathname === '/nucleus/list') {
        await this.handleNucleusList(req, res);
      } else if (method === 'POST' && pathname === '/project/create') {
        await this.handleProjectCreate(req, res);
      } else if (method === 'GET' && pathname === '/project/list') {
        await this.handleProjectList(req, res);
      } else if (method === 'GET' && pathname === '/intents/list') {
        await this.handleIntentsList(req, res);
      } else if (method === 'GET' && pathname === '/intents/get') {
        await this.handleIntentsGet(req, res, parsedUrl.query);
      } else if (method === 'POST' && pathname === '/intents/run') {
        await this.handleIntentsRun(req, res);
      } else if (method === 'POST' && pathname === '/doc/generate') {
        await this.handleDocGenerate(req, res);
      } else if (method === 'POST' && pathname === '/doc/refine') {
        await this.handleDocRefine(req, res);
      } else if (method === 'POST' && pathname === '/doc/summarize') {
        await this.handleDocSummarize(req, res);
      } else if (method === 'GET' && pathname === '/btip/explorer/tree') {
        await this.handleGetTree(new URL(req.url || '/', `http://localhost:${this.port}`), res);
      } else if (method === 'GET' && pathname === '/btip/explorer/file') {
        await this.handleGetFile(new URL(req.url || '/', `http://localhost:${this.port}`), res);
      } else if (method === 'POST' && pathname === '/btip/explorer/refresh') {
        await this.handleRefresh(res);
      } else {
        this.sendJson(res, 404, { error: 'Endpoint not found' });
      }
    } catch (error: any) {
      this.log(`Error handling ${method} ${pathname}: ${error.message}`);
      this.sendJson(res, 500, { error: error.message || 'Internal server error' });
    }
  }

  // System endpoints from latest
  private async handleHome(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    this.sendJson(res, 200, { 
      message: 'Bloom Plugin API',
      version: this.pluginVersion,
      endpoints: ['/health', '/home', '/handshake', '/host/status', '/nucleus/*', '/project/*', '/intents/*', '/doc/*', '/btip/explorer/*']
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

  // Nucleus endpoints from latest
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

  // Project endpoints from latest
  private async handleProjectCreate(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.parseBody(req);
    const result = await this.projectManager.create(body);
    this.sendJson(res, 201, result);
  }

  private async handleProjectList(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const list = await this.projectManager.list();
    this.sendJson(res, 200, { projects: list });
  }

  // Intent Navigator endpoints from latest
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

  // Documentation endpoints (Gemini) from latest
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

  // BTIP endpoints from current
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

  // Utility methods (merged from both, prioritizing latest's parseBody and log)
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