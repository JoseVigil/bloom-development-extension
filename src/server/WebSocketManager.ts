import * as http from 'http';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

interface WebSocketFrame {
    fin: boolean;
    opcode: number;
    masked: boolean;
    payload: Buffer;
}

interface BTIPMessage {
    event: string;
    [key: string]: any;
}

export class WebSocketManager {
    private connections: Set<any> = new Set();
    private server: http.Server;
    private workspacePath: string;
    private bloomPath: string;
    private fileWatcher: vscode.FileSystemWatcher | null = null;

    constructor(server: http.Server, workspacePath: string) {
        this.server = server;
        this.workspacePath = workspacePath;
        this.bloomPath = path.join(workspacePath, '.bloom');
        this.setupWebSocketServer();
        this.setupFileWatcher();
    }

    private setupWebSocketServer(): void {
        this.server.on('upgrade', (req, socket, head) => {
            if (req.url !== '/ws') {
                socket.destroy();
                return;
            }

            this.handleUpgrade(req, socket, head);
        });
    }

    private handleUpgrade(req: http.IncomingMessage, socket: any, head: Buffer): void {
        const key = req.headers['sec-websocket-key'];
        if (!key) {
            socket.destroy();
            return;
        }

        const acceptKey = this.generateAcceptKey(key as string);
        
        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
            '\r\n'
        );

        const connection = {
            socket,
            id: crypto.randomUUID()
        };

        this.connections.add(connection);
        Logger.info(`WebSocket client connected: ${connection.id}`);

        socket.on('data', (data: Buffer) => {
            this.handleData(connection, data);
        });

        socket.on('close', () => {
            this.connections.delete(connection);
            Logger.info(`WebSocket client disconnected: ${connection.id}`);
        });

        socket.on('error', (err: Error) => {
            Logger.error('WebSocket error:', err);
            this.connections.delete(connection);
        });

        // Send initial tree snapshot
        this.sendTreeSnapshot(connection);
    }

    private handleData(connection: any, data: Buffer): void {
        try {
            const frame = this.parseFrame(data);
            if (!frame) return;

            if (frame.opcode === 0x8) { // Close frame
                connection.socket.end();
                return;
            }

            if (frame.opcode === 0x9) { // Ping
                this.sendPong(connection);
                return;
            }

            if (frame.opcode === 0x1) { // Text frame
                const message: BTIPMessage = JSON.parse(frame.payload.toString('utf8'));
                this.handleMessage(connection, message);
            }
        } catch (err) {
            Logger.error('Error handling WebSocket data:', err);
        }
    }

    private handleMessage(connection: any, message: BTIPMessage): void {
        Logger.info(`WebSocket message: ${message.event}`);

        switch (message.event) {
            case 'navigate':
                this.handleNavigate(connection, message.path);
                break;
            case 'open_file':
                this.handleOpenFile(connection, message.path);
                break;
            case 'expand_node':
                this.handleExpandNode(connection, message.path);
                break;
            case 'list_directory':
                this.handleListDirectory(connection, message.path);
                break;
            case 'ping':
                this.sendMessage(connection, { event: 'pong' });
                break;
            default:
                Logger.warn(`Unknown WebSocket event: ${message.event}`);
        }
    }

    private handleNavigate(connection: any, targetPath: string): void {
        const fullPath = path.join(this.bloomPath, targetPath);
        
        if (!this.isValidPath(fullPath)) {
            this.sendMessage(connection, {
                event: 'error',
                message: 'Invalid path'
            });
            return;
        }

        this.sendMessage(connection, {
            event: 'navigate_success',
            path: targetPath
        });
    }

    private handleOpenFile(connection: any, filePath: string): void {
        const fullPath = path.join(this.bloomPath, filePath);

        if (!this.isValidPath(fullPath)) {
            this.sendMessage(connection, {
                event: 'error',
                message: 'Invalid path'
            });
            return;
        }

        fs.readFile(fullPath, 'utf8', (err, data) => {
            if (err) {
                this.sendMessage(connection, {
                    event: 'error',
                    message: `Cannot read file: ${err.message}`
                });
                return;
            }

            this.sendMessage(connection, {
                event: 'file_content',
                path: filePath,
                content: data,
                size: data.length,
                ext: path.extname(filePath)
            });
        });
    }

    private handleExpandNode(connection: any, nodePath: string): void {
        const fullPath = path.join(this.bloomPath, nodePath);

        if (!this.isValidPath(fullPath)) {
            this.sendMessage(connection, {
                event: 'error',
                message: 'Invalid path'
            });
            return;
        }

        this.readDirectory(fullPath, (err, structure) => {
            if (err) {
                this.sendMessage(connection, {
                    event: 'error',
                    message: `Cannot read directory: ${err.message}`
                });
                return;
            }

            this.sendMessage(connection, {
                event: 'node_expanded',
                path: nodePath,
                children: structure
            });
        });
    }

    private handleListDirectory(connection: any, dirPath: string): void {
        const fullPath = path.join(this.bloomPath, dirPath || '');

        if (!this.isValidPath(fullPath)) {
            this.sendMessage(connection, {
                event: 'error',
                message: 'Invalid path'
            });
            return;
        }

        this.readDirectory(fullPath, (err, structure) => {
            if (err) {
                this.sendMessage(connection, {
                    event: 'error',
                    message: `Cannot read directory: ${err.message}`
                });
                return;
            }

            this.sendMessage(connection, {
                event: 'directory_list',
                path: dirPath,
                items: structure
            });
        });
    }

    private sendTreeSnapshot(connection: any): void {
        this.readBTIPStructure((err, structure) => {
            if (err) {
                Logger.error('Error reading BTIP structure:', err);
                return;
            }

            this.sendMessage(connection, {
                event: 'tree_snapshot',
                structure
            });
        });
    }

    private readBTIPStructure(callback: (err: Error | null, structure?: any) => void): void {
        if (!fs.existsSync(this.bloomPath)) {
            callback(new Error('.bloom directory not found'));
            return;
        }

        this.readDirectory(this.bloomPath, callback);
    }

    private readDirectory(dirPath: string, callback: (err: Error | null, structure?: any) => void): void {
        fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
            if (err) {
                callback(err);
                return;
            }

            const structure: any[] = [];

            let pending = entries.length;
            if (pending === 0) {
                callback(null, structure);
                return;
            }

            entries.forEach((entry) => {
                const fullPath = path.join(dirPath, entry.name);
                const relativePath = path.relative(this.bloomPath, fullPath);

                if (entry.isDirectory()) {
                    structure.push({
                        name: entry.name,
                        path: relativePath,
                        type: 'directory'
                    });
                    if (--pending === 0) callback(null, structure);
                } else {
                    fs.stat(fullPath, (statErr, stats) => {
                        if (!statErr) {
                            structure.push({
                                name: entry.name,
                                path: relativePath,
                                type: 'file',
                                size: stats.size,
                                ext: path.extname(entry.name)
                            });
                        }
                        if (--pending === 0) callback(null, structure);
                    });
                }
            });
        });
    }

    private setupFileWatcher(): void {
        const pattern = new vscode.RelativePattern(this.workspacePath, '.bloom/**/*');
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

        this.fileWatcher.onDidCreate((uri) => {
            this.broadcast({
                event: 'btip_update',
                change: 'created',
                path: path.relative(this.bloomPath, uri.fsPath)
            });
        });

        this.fileWatcher.onDidChange((uri) => {
            this.broadcast({
                event: 'btip_update',
                change: 'modified',
                path: path.relative(this.bloomPath, uri.fsPath)
            });
        });

        this.fileWatcher.onDidDelete((uri) => {
            this.broadcast({
                event: 'btip_update',
                change: 'deleted',
                path: path.relative(this.bloomPath, uri.fsPath)
            });
        });
    }

    broadcast(message: BTIPMessage): void {
        this.connections.forEach((connection) => {
            this.sendMessage(connection, message);
        });
    }

    private sendMessage(connection: any, message: BTIPMessage): void {
        const data = JSON.stringify(message);
        const frame = this.createFrame(data);
        connection.socket.write(frame);
    }

    private sendPong(connection: any): void {
        const frame = Buffer.alloc(2);
        frame[0] = 0x8A; // FIN + Pong
        frame[1] = 0x00; // No payload
        connection.socket.write(frame);
    }

    private createFrame(data: string): Buffer {
        const payload = Buffer.from(data, 'utf8');
        const payloadLength = payload.length;

        let frame: Buffer;
        let offset = 2;

        if (payloadLength < 126) {
            frame = Buffer.alloc(2 + payloadLength);
            frame[1] = payloadLength;
        } else if (payloadLength < 65536) {
            frame = Buffer.alloc(4 + payloadLength);
            frame[1] = 126;
            frame.writeUInt16BE(payloadLength, 2);
            offset = 4;
        } else {
            frame = Buffer.alloc(10 + payloadLength);
            frame[1] = 127;
            frame.writeBigUInt64BE(BigInt(payloadLength), 2);
            offset = 10;
        }

        frame[0] = 0x81; // FIN + Text
        payload.copy(frame, offset);

        return frame;
    }

    private parseFrame(data: Buffer): WebSocketFrame | null {
        if (data.length < 2) return null;

        const fin = (data[0] & 0x80) !== 0;
        const opcode = data[0] & 0x0F;
        const masked = (data[1] & 0x80) !== 0;
        let payloadLength = data[1] & 0x7F;
        let offset = 2;

        if (payloadLength === 126) {
            if (data.length < 4) return null;
            payloadLength = data.readUInt16BE(2);
            offset = 4;
        } else if (payloadLength === 127) {
            if (data.length < 10) return null;
            payloadLength = Number(data.readBigUInt64BE(2));
            offset = 10;
        }

        if (!masked) return null;

        const maskKey = data.slice(offset, offset + 4);
        offset += 4;

        const payload = Buffer.alloc(payloadLength);
        for (let i = 0; i < payloadLength; i++) {
            payload[i] = data[offset + i] ^ maskKey[i % 4];
        }

        return { fin, opcode, masked, payload };
    }

    private generateAcceptKey(key: string): string {
        const magic = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
        const hash = crypto.createHash('sha1');
        hash.update(key + magic);
        return hash.digest('base64');
    }

    private isValidPath(targetPath: string): boolean {
        const normalized = path.normalize(targetPath);
        return normalized.startsWith(this.bloomPath);
    }

    dispose(): void {
        if (this.fileWatcher) {
            this.fileWatcher.dispose();
            this.fileWatcher = null;
        }

        this.connections.forEach((connection) => {
            connection.socket.end();
        });
        this.connections.clear();
    }
}