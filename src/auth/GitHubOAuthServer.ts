// src/auth/GitHubOAuthServer.ts
import * as http from 'http';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import { UserManager } from '../managers/userManager';
import { WebSocketManager } from '../server/WebSocketManager';

interface OAuthConfig {
    clientId: string;
    clientSecret: string;
    scope: string;
}

interface GitHubTokenResponse {
    access_token: string;
    token_type: string;
    scope: string;
}

interface GitHubUser {
    login: string;
    id: number;
    avatar_url: string;
}

interface GitHubOrg {
    login: string;
}

export class GitHubOAuthServer {
    private server: http.Server | null = null;
    private port: number = 0;
    private state: string = '';
    private timeout: NodeJS.Timeout | null = null;
    private outputChannel: vscode.OutputChannel;
    private userManager: UserManager;
    private wsManager: WebSocketManager | null = null;
    private pluginApiPort: number;

    constructor(
        outputChannel: vscode.OutputChannel,
        userManager: UserManager,
        pluginApiPort: number
    ) {
        this.outputChannel = outputChannel;
        this.userManager = userManager;
        this.pluginApiPort = pluginApiPort;
    }

    setWebSocketManager(wsManager: WebSocketManager): void {
        this.wsManager = wsManager;
    }

    private log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[GitHubOAuth] ${timestamp} - ${message}`);
    }

    private getOAuthConfig(): OAuthConfig {
        const config = vscode.workspace.getConfiguration('bloom');
        const clientId = config.get<string>('github.clientId');
        const clientSecret = config.get<string>('github.clientSecret');

        if (!clientId || !clientSecret) {
            throw new Error('GitHub OAuth not configured. Please set bloom.github.clientId and bloom.github.clientSecret');
        }

        return {
            clientId,
            clientSecret,
            scope: 'repo,read:org,user'
        };
    }

    private async findFreePort(): Promise<number> {
        return new Promise((resolve, reject) => {
            const server = http.createServer();
            server.listen(0, () => {
                const addr = server.address();
                if (addr && typeof addr !== 'string') {
                    const port = addr.port;
                    server.close(() => resolve(port));
                } else {
                    server.close(() => reject(new Error('Failed to get port')));
                }
            });
            server.on('error', reject);
        });
    }

    /**
     * Launch Brain Profile Master with OAuth URL
     * Uses the bloom-master profile to navigate to GitHub OAuth
     */
    private async launchBrainProfile(oauthUrl: string): Promise<void> {
        const homeDir = os.homedir();
        const platform = os.platform();
        
        // Resolve Python executable path based on platform
        const pythonExe = platform === 'win32'
            ? path.join(homeDir, 'AppData', 'Local', 'BloomNucleus', 'engine', 'runtime', 'python.exe')
            : platform === 'darwin'
            ? path.join(homeDir, 'Library', 'Application Support', 'BloomNucleus', 'engine', 'runtime', 'bin', 'python3')
            : path.join(homeDir, '.local', 'share', 'BloomNucleus', 'engine', 'runtime', 'bin', 'python3');
        
        // Resolve brain __main__.py path
        const brainMainPy = platform === 'win32'
            ? path.join(homeDir, 'AppData', 'Local', 'BloomNucleus', 'engine', 'runtime', 'Lib', 'site-packages', 'brain', '__main__.py')
            : platform === 'darwin'
            ? path.join(homeDir, 'Library', 'Application Support', 'BloomNucleus', 'engine', 'runtime', 'lib', 'python3.11', 'site-packages', 'brain', '__main__.py')
            : path.join(homeDir, '.local', 'share', 'BloomNucleus', 'engine', 'runtime', 'lib', 'python3.11', 'site-packages', 'brain', '__main__.py');
        
        const profileId = 'bloom-master'; // Master profile for OAuth operations
        
        this.log(`Launching Brain Profile: ${profileId}`);
        this.log(`OAuth URL: ${oauthUrl}`);
        
        return new Promise((resolve, reject) => {
            // Command: python brain/__main__.py profile launch <PROFILE_ID> --url <URL>
            const proc = spawn(pythonExe, [
                brainMainPy,
                'profile', 
                'launch',
                profileId,
                '--url', 
                oauthUrl
            ], {
                detached: true,  // Run independently
                stdio: 'ignore'  // Don't capture output
            });
            
            proc.unref(); // Don't block parent process
            
            // Give it a moment to ensure it started
            setTimeout(() => {
                this.log('Brain Profile launched successfully');
                resolve();
            }, 1500);
            
            proc.on('error', (error) => {
                this.log(`Failed to launch Brain Profile: ${error.message}`);
                reject(new Error(`Failed to launch Brain Profile: ${error.message}`));
            });
        });
    }

    /**
     * Store GitHub token using Brain CLI
     * This makes Brain CLI the source of truth for auth state
     */
    private async storeTokenInBrain(token: string): Promise<void> {
        this.log('Storing token in Brain CLI...');
        
        const homeDir = os.homedir();
        const platform = os.platform();
        
        const pythonExe = platform === 'win32'
            ? path.join(homeDir, 'AppData', 'Local', 'BloomNucleus', 'engine', 'runtime', 'python.exe')
            : platform === 'darwin'
            ? path.join(homeDir, 'Library', 'Application Support', 'BloomNucleus', 'engine', 'runtime', 'bin', 'python3')
            : path.join(homeDir, '.local', 'share', 'BloomNucleus', 'engine', 'runtime', 'bin', 'python3');
        
        const brainMainPy = platform === 'win32'
            ? path.join(homeDir, 'AppData', 'Local', 'BloomNucleus', 'engine', 'runtime', 'Lib', 'site-packages', 'brain', '__main__.py')
            : platform === 'darwin'
            ? path.join(homeDir, 'Library', 'Application Support', 'BloomNucleus', 'engine', 'runtime', 'lib', 'python3.11', 'site-packages', 'brain', '__main__.py')
            : path.join(homeDir, '.local', 'share', 'BloomNucleus', 'engine', 'runtime', 'lib', 'python3.11', 'site-packages', 'brain', '__main__.py');
        
        return new Promise((resolve, reject) => {
            // Command: python brain/__main__.py --json github auth-login -t TOKEN
            const proc = spawn(pythonExe, [
                brainMainPy,
                '--json',
                'github',
                'auth-login',
                '-t',
                token
            ]);
            
            let stdout = '';
            let stderr = '';
            
            proc.stdout?.on('data', (data) => {
                stdout += data.toString();
            });
            
            proc.stderr?.on('data', (data) => {
                stderr += data.toString();
            });
            
            proc.on('close', (code) => {
                if (code === 0) {
                    try {
                        const result = JSON.parse(stdout);
                        if (result.status === 'success') {
                            this.log('Token stored successfully in Brain CLI');
                            resolve();
                        } else {
                            reject(new Error(result.error || 'Failed to store token'));
                        }
                    } catch (e) {
                        reject(new Error('Failed to parse Brain CLI response'));
                    }
                } else {
                    this.log(`Brain CLI error: ${stderr}`);
                    reject(new Error(`Brain CLI exited with code ${code}`));
                }
            });
            
            proc.on('error', (error) => {
                reject(new Error(`Failed to execute Brain CLI: ${error.message}`));
            });
        });
    }

    async startOAuthFlow(): Promise<void> {
        try {
            const config = this.getOAuthConfig();
            this.state = crypto.randomBytes(16).toString('hex');
            this.port = await this.findFreePort();
            
            // Start callback server
            await this.startCallbackServer();
            
            // Build OAuth URL
            const redirectUri = `http://localhost:${this.port}/btip/oauth/callback`;
            const oauthUrl = `https://github.com/login/oauth/authorize?` +
                `client_id=${config.clientId}` +
                `&redirect_uri=${encodeURIComponent(redirectUri)}` +
                `&scope=${encodeURIComponent(config.scope)}` +
                `&state=${this.state}`;
            
            this.log(`Starting OAuth flow on port ${this.port}`);
            
            // CRITICAL CHANGE: Use Brain Profile instead of system browser
            await this.launchBrainProfile(oauthUrl);
            
            // Set timeout (5 minutes for user to complete OAuth)
            this.timeout = setTimeout(() => {
                this.log('OAuth flow timeout - user did not complete authorization');
                this.cleanup();
                
                if (this.wsManager) {
                    this.wsManager.broadcast('auth:error', {
                        message: 'OAuth timeout - please try again'
                    });
                }
            }, 5 * 60 * 1000);
            
        } catch (error: any) {
            this.log(`Error starting OAuth flow: ${error.message}`);
            this.cleanup();
            
            if (this.wsManager) {
                this.wsManager.broadcast('auth:error', {
                    message: error.message
                });
            }
            
            throw error;
        }
    }

    private async startCallbackServer(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server = http.createServer((req, res) => {
                this.handleCallback(req, res);
            });

            this.server.on('error', (err) => {
                this.log(`Server error: ${err.message}`);
                reject(err);
            });

            this.server.listen(this.port, 'localhost', () => {
                this.log(`Callback server listening on http://localhost:${this.port}`);
                resolve();
            });
        });
    }

    private async handleCallback(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            const url = new URL(req.url || '', `http://localhost:${this.port}`);
            
            if (url.pathname !== '/btip/oauth/callback') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Not Found');
                return;
            }
            
            const code = url.searchParams.get('code');
            const state = url.searchParams.get('state');
            
            // Validate state (CSRF protection)
            if (!state || state !== this.state) {
                this.log('Invalid state parameter - possible CSRF attack');
                this.sendCallbackResponse(res, false, 'Invalid state parameter');
                return;
            }
            
            if (!code) {
                this.log('No code parameter in callback');
                this.sendCallbackResponse(res, false, 'No authorization code received');
                return;
            }
            
            this.log('Valid callback received, exchanging code for token...');
            
            // Exchange code for access token
            const token = await this.exchangeCodeForToken(code);
            
            // Fetch user info and organizations
            const { username, orgs } = await this.fetchUserAndOrgs(token);
            
            this.log(`GitHub user authenticated: ${username}`);
            
            // CRITICAL: Store token in Brain CLI (source of truth)
            await this.storeTokenInBrain(token);
            
            // Also store in UserManager for backwards compatibility
            await this.userManager.setGithubToken(token);
            await this.userManager.setGithubUser(username, orgs);
            
            this.log(`Authentication successful for user: ${username}`);
            
            // Notify via WebSocket
            if (this.wsManager) {
                this.wsManager.broadcast('auth:updated', {
                    githubAuthenticated: true,
                    githubUsername: username,
                    allOrgs: orgs
                });
            }
            
            // Send success response to browser
            this.sendCallbackResponse(res, true);
            
            // Cleanup after short delay
            setTimeout(() => this.cleanup(), 1000);
            
        } catch (error: any) {
            this.log(`Callback handler error: ${error.message}`);
            this.sendCallbackResponse(res, false, error.message);
            
            if (this.wsManager) {
                this.wsManager.broadcast('auth:error', {
                    message: error.message
                });
            }
            
            setTimeout(() => this.cleanup(), 1000);
        }
    }

    private async exchangeCodeForToken(code: string): Promise<string> {
        const config = this.getOAuthConfig();
        const redirectUri = `http://localhost:${this.port}/btip/oauth/callback`;

        const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                client_id: config.clientId,
                client_secret: config.clientSecret,
                code: code,
                redirect_uri: redirectUri
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Failed to exchange code for token: ${error}`);
        }

        const data = await response.json() as GitHubTokenResponse;

        if (!data.access_token) {
            throw new Error('No access token in response');
        }

        return data.access_token;
    }

    private async fetchUserAndOrgs(token: string): Promise<{ username: string; orgs: string[] }> {
        // Fetch user
        const userResponse = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!userResponse.ok) {
            const error = await userResponse.text();
            throw new Error(`Failed to fetch user: ${error}`);
        }

        const user = await userResponse.json() as GitHubUser;

        // Fetch organizations
        const orgsResponse = await fetch('https://api.github.com/user/orgs', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        let orgs: string[] = [user.login];

        if (orgsResponse.ok) {
            const orgsData = await orgsResponse.json() as GitHubOrg[];
            const orgLogins = orgsData.map(org => org.login);
            orgs = [user.login, ...orgLogins];
        }

        return {
            username: user.login,
            orgs: orgs
        };
    }

    private sendCallbackResponse(res: http.ServerResponse, success: boolean, error?: string): void {
        const html = success
            ? `
<!DOCTYPE html>
<html>
<head>
    <title>Bloom - Authentication Successful</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
            text-align: center;
            background: white;
            padding: 3rem;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 400px;
        }
        .icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        h1 {
            color: #2d3748;
            margin: 0 0 0.5rem 0;
        }
        p {
            color: #718096;
            margin: 0 0 2rem 0;
        }
        .button {
            background: #667eea;
            color: white;
            padding: 0.75rem 2rem;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">✓</div>
        <h1>Authentication Successful!</h1>
        <p>You can close this window and return to Bloom</p>
        <button class="button" onclick="window.close()">Close Window</button>
    </div>
    <script>
        setTimeout(() => window.close(), 3000);
    </script>
</body>
</html>
            `
            : `
<!DOCTYPE html>
<html>
<head>
    <title>Bloom - Authentication Failed</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }
        .container {
            text-align: center;
            background: white;
            padding: 3rem;
            border-radius: 16px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 400px;
        }
        .icon {
            font-size: 4rem;
            margin-bottom: 1rem;
        }
        h1 {
            color: #2d3748;
            margin: 0 0 0.5rem 0;
        }
        p {
            color: #718096;
            margin: 0 0 1rem 0;
        }
        .error {
            background: #fed7d7;
            color: #c53030;
            padding: 1rem;
            border-radius: 8px;
            margin-bottom: 2rem;
            font-size: 0.875rem;
        }
        .button {
            background: #f5576c;
            color: white;
            padding: 0.75rem 2rem;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            cursor: pointer;
            text-decoration: none;
            display: inline-block;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">✗</div>
        <h1>Authentication Failed</h1>
        <p>There was an error during authentication</p>
        ${error ? `<div class="error">${error}</div>` : ''}
        <button class="button" onclick="window.close()">Close Window</button>
    </div>
</body>
</html>
            `;
        
        res.writeHead(success ? 200 : 400, { 'Content-Type': 'text/html' });
        res.end(html);
    }

    private cleanup(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = null;
        }

        if (this.server) {
            this.server.close(() => {
                this.log('Callback server closed');
            });
            this.server = null;
        }

        this.state = '';
        this.port = 0;
    }

    public stop(): void {
        this.cleanup();
    }


        


}

