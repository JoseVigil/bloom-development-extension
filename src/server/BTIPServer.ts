import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { WebSocketManager } from './WebSocketManager';
import { Logger } from '../utils/logger';

export class BTIPServer {
    private server: http.Server | null = null;
    private wsManager: WebSocketManager | null = null;
    private port: number = 0;
    private workspacePath: string;
    private buildPath: string;

    constructor(workspacePath: string) {
        this.workspacePath = workspacePath;
        this.buildPath = path.join(__dirname, '../../webview/btip-explorer/build');
    }

    async start(): Promise<number> {
        if (this.server) {
            return this.port;
        }

        this.port = await this.findAvailablePort(43333);
        
        this.server = http.createServer((req, res) => {
            this.handleRequest(req, res);
        });

        this.wsManager = new WebSocketManager(this.server, this.workspacePath);

        return new Promise((resolve, reject) => {
            this.server!.listen(this.port, 'localhost', () => {
                Logger.info(`BTIP Server started on http://localhost:${this.port}`);
                resolve(this.port);
            });

            this.server!.on('error', (err) => {
                Logger.error('BTIP Server error:', err);
                reject(err);
            });
        });
    }

    stop(): void {
        if (this.wsManager) {
            this.wsManager.dispose();
            this.wsManager = null;
        }

        if (this.server) {
            this.server.close();
            this.server = null;
            Logger.info('BTIP Server stopped');
        }
    }

    getPort(): number {
        return this.port;
    }

    getWebSocketManager(): WebSocketManager | null {
        return this.wsManager;
    }

    private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
        const url = req.url || '/';

        // WebSocket upgrade
        if (url === '/ws') {
            return;
        }

        // API routes
        if (url.startsWith('/api/')) {
            this.handleApiRequest(url, req, res);
            return;
        }

        // Static files
        this.serveStaticFile(url, res);
    }

    private handleApiRequest(url: string, req: http.IncomingMessage, res: http.ServerResponse): void {
        const path = url.replace('/api', '');

        if (path === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', port: this.port }));
            return;
        }

        if (path === '/workspace') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ workspace: this.workspacePath }));
            return;
        }

        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }

    private serveStaticFile(url: string, res: http.ServerResponse): void {
        let filePath = url === '/' ? '/index.html' : url;
        filePath = path.join(this.buildPath, filePath);

        // Security: prevent directory traversal
        if (!filePath.startsWith(this.buildPath)) {
            res.writeHead(403);
            res.end();
            return;
        }

        fs.readFile(filePath, (err, data) => {
            if (err) {
                // SPA fallback
                const indexPath = path.join(this.buildPath, 'index.html');
                fs.readFile(indexPath, (indexErr, indexData) => {
                    if (indexErr) {
                        res.writeHead(404);
                        res.end('Not found');
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(indexData);
                });
                return;
            }

            const ext = path.extname(filePath);
            const contentType = this.getContentType(ext);
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
        });
    }

    private getContentType(ext: string): string {
        const types: Record<string, string> = {
            '.html': 'text/html',
            '.js': 'application/javascript',
            '.css': 'text/css',
            '.json': 'application/json',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon'
        };
        return types[ext] || 'application/octet-stream';
    }

    private async findAvailablePort(startPort: number): Promise<number> {
        let port = startPort;
        const maxAttempts = 100;

        for (let i = 0; i < maxAttempts; i++) {
            if (await this.isPortAvailable(port)) {
                return port;
            }
            port++;
        }

        throw new Error('No available ports found');
    }

    private isPortAvailable(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const server = http.createServer();
            server.once('error', () => resolve(false));
            server.once('listening', () => {
                server.close();
                resolve(true);
            });
            server.listen(port, 'localhost');
        });
    }
}