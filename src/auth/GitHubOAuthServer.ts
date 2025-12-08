// src/auth/GitHubOAuthServer.ts
import * as http from 'http';
import * as crypto from 'crypto';
import * as vscode from 'vscode';
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

    async startOAuthFlow(): Promise<void> {
        try {
            // Get config
            const config = this.getOAuthConfig();

            // Generate state for CSRF protection
            this.state = crypto.randomBytes(16).toString('hex');

            // Find free port
            this.port = await this.findFreePort();

            // Start callback server
            await this.startCallbackServer();

            // Build OAuth URL
            const redirectUri = `http://localhost:${this.port}/btip/oauth/callback`;
            const oauthUrl = `https://github.com/login/oauth/authorize?client_id=${config.clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(config.scope)}&state=${this.state}`;

            this.log(`Starting OAuth flow on port ${this.port}`);
            this.log(`State: ${this.state}`);

            // Open browser
            await vscode.env.openExternal(vscode.Uri.parse(oauthUrl));

            // Set timeout (5 minutes)
            this.timeout = setTimeout(() => {
                this.log('OAuth flow timeout - no callback received');
                this.cleanup();
                if (this.wsManager) {
                    this.wsManager.broadcast('auth:error', {
                        message: 'OAuth timeout - authentication window closed or expired'
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
        const url = new URL(req.url || '', `http://localhost:${this.port}`);

        if (url.pathname !== '/btip/oauth/callback') {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not Found');
            return;
        }

        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        // Handle OAuth errors
        if (error) {
            this.log(`OAuth error: ${error} - ${errorDescription}`);
            this.sendCallbackResponse(res, false, errorDescription || error);
            this.cleanup();
            if (this.wsManager) {
                this.wsManager.broadcast('auth:error', {
                    message: errorDescription || error
                });
            }
            return;
        }

        // Validate parameters
        if (!code || !state) {
            this.log('Missing code or state in callback');
            this.sendCallbackResponse(res, false, 'Missing code or state');
            this.cleanup();
            return;
        }

        // Validate state (CSRF)
        if (state !== this.state) {
            this.log(`State mismatch: expected ${this.state}, got ${state}`);
            this.sendCallbackResponse(res, false, 'Invalid state - possible CSRF attack');
            this.cleanup();
            return;
        }

        // Exchange code for token
        try {
            const token = await this.exchangeCodeForToken(code);
            const { username, orgs } = await this.fetchUserAndOrgs(token);

            // Store token and user data
            await this.storeToken(token);
            await this.userManager.setGithubUser(username, orgs);

            this.log(`Authentication successful for user: ${username}`);
            this.log(`Organizations: ${orgs.join(', ')}`);

            // Notify via WebSocket
            if (this.wsManager) {
                this.wsManager.broadcast('auth:updated', {
                    githubAuthenticated: true,
                    githubUsername: username,
                    allOrgs: orgs
                });
            }

            // Send success response
            this.sendCallbackResponse(res, true);

            // Open Home web with success parameter
            const homeUrl = `http://localhost:${this.pluginApiPort}/home?oauth=success`;
            await vscode.env.openExternal(vscode.Uri.parse(homeUrl));

            // Cleanup after short delay
            setTimeout(() => this.cleanup(), 1000);

        } catch (error: any) {
            this.log(`Error during token exchange: ${error.message}`);
            this.sendCallbackResponse(res, false, error.message);
            this.cleanup();
            if (this.wsManager) {
                this.wsManager.broadcast('auth:error', {
                    message: error.message
                });
            }
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

    private async storeToken(token: string): Promise<void> {
        await this.userManager.setGithubToken(token);
    }

    private sendCallbackResponse(res: http.ServerResponse, success: boolean, error?: string): void {
        const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Bloom - GitHub Authentication</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            text-align: center;
            max-width: 400px;
        }
        .icon {
            font-size: 64px;
            margin-bottom: 20px;
        }
        h1 {
            margin: 0 0 10px 0;
            color: #333;
        }
        p {
            color: #666;
            margin: 0 0 20px 0;
        }
        .error {
            color: #d73a49;
            background: #ffeef0;
            padding: 10px;
            border-radius: 6px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">${success ? '✅' : '❌'}</div>
        <h1>${success ? 'Authentication Complete!' : 'Authentication Failed'}</h1>
        <p>${success ? 'You can close this window and return to VS Code.' : 'Please try again.'}</p>
        ${error ? `<div class="error">${error}</div>` : ''}
    </div>
    <script>
        setTimeout(() => window.close(), 3000);
    </script>
</body>
</html>
        `;

        res.writeHead(200, { 'Content-Type': 'text/html' });
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