import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';

export class BridgeExecutor {
    private process: ChildProcess | null = null;
    private extensionPath: string;

    constructor(context: vscode.ExtensionContext) {
        this.extensionPath = context.extensionPath;
    }

    /**
     * Obtiene la ruta del binario según la plataforma
     */
    private getBinaryPath(): string {
        const platform = process.platform;
        
        // Mapeo de plataformas
        const platformMap: { [key: string]: string } = {
            'win32': 'win32',
            'darwin': 'darwin',
            'linux': 'linux'
        };
        
        const platformDir = platformMap[platform];
        if (!platformDir) {
            throw new Error(`Plataforma no soportada: ${platform}`);
        }
        
        // Ruta al binario en el instalador
        const binDir = path.join(
            this.extensionPath, 
            'installer', 
            'native', 
            'bin', 
            platformDir
        );
        
        const binaryName = platform === 'win32' ? 'native_bridge.exe' : 'native_bridge';
        const binaryPath = path.join(binDir, binaryName);

        // Verificar que existe
        if (!fs.existsSync(binaryPath)) {
            throw new Error(
                `Binario no encontrado: ${binaryPath}\n` +
                `Ejecuta: npm run build:bridge para compilar los binarios`
            );
        }

        // En Unix, verificar permisos de ejecución
        if (platform !== 'win32') {
            try {
                fs.accessSync(binaryPath, fs.constants.X_OK);
            } catch {
                // Intentar dar permisos
                fs.chmodSync(binaryPath, 0o755);
            }
        }

        return binaryPath;
    }

    /**
     * Inicia el bridge nativo
     */
    public async start(): Promise<void> {
        if (this.process) {
            throw new Error('Bridge ya está en ejecución');
        }

        const binaryPath = this.getBinaryPath();

        return new Promise((resolve, reject) => {
            try {
                this.process = spawn(binaryPath, [], {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    windowsHide: true // Ocultar ventana en Windows
                });

                // Manejar stderr
                this.process.stderr?.on('data', (data) => {
                    console.error(`[Bridge Error]: ${data.toString()}`);
                });

                // Manejar cierre inesperado
                this.process.on('exit', (code, signal) => {
                    console.log(`[Bridge] Proceso terminado. Código: ${code}, Señal: ${signal}`);
                    this.process = null;
                });

                this.process.on('error', (error) => {
                    console.error(`[Bridge] Error al iniciar: ${error.message}`);
                    reject(error);
                });

                // Dar tiempo para que se inicie el servidor TCP
                setTimeout(() => {
                    if (this.process && !this.process.killed) {
                        console.log('[Bridge] Iniciado correctamente');
                        resolve();
                    } else {
                        reject(new Error('El bridge falló al iniciar'));
                    }
                }, 1000);

            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Detiene el bridge nativo
     */
    public stop(): void {
        if (this.process && !this.process.killed) {
            this.process.kill();
            this.process = null;
            console.log('[Bridge] Detenido');
        }
    }

    /**
     * Envía un mensaje al bridge a través de stdin
     */
    public sendMessage(message: any): boolean {
        if (!this.process || this.process.killed) {
            console.error('[Bridge] No está en ejecución');
            return false;
        }

        try {
            const json = JSON.stringify(message);
            const buffer = Buffer.alloc(4 + json.length);
            
            // Escribir longitud (4 bytes, little-endian)
            buffer.writeUInt32LE(json.length, 0);
            // Escribir mensaje
            buffer.write(json, 4);

            return this.process.stdin?.write(buffer) ?? false;
        } catch (error) {
            console.error(`[Bridge] Error al enviar mensaje: ${error}`);
            return false;
        }
    }

    /**
     * Lee mensajes del bridge desde stdout
     */
    public onMessage(callback: (message: any) => void): void {
        if (!this.process) {
            throw new Error('Bridge no está en ejecución');
        }

        let buffer = Buffer.alloc(0);

        this.process.stdout?.on('data', (chunk: Buffer) => {
            buffer = Buffer.concat([buffer, chunk]);

            while (buffer.length >= 4) {
                // Leer longitud del mensaje
                const messageLength = buffer.readUInt32LE(0);

                if (buffer.length >= 4 + messageLength) {
                    // Extraer mensaje completo
                    const messageBuffer = buffer.slice(4, 4 + messageLength);
                    buffer = buffer.slice(4 + messageLength);

                    try {
                        const message = JSON.parse(messageBuffer.toString());
                        callback(message);
                    } catch (error) {
                        console.error('[Bridge] Error al parsear mensaje:', error);
                    }
                } else {
                    // Mensaje incompleto, esperar más datos
                    break;
                }
            }
        });
    }

    /**
     * Verifica si el bridge está en ejecución
     */
    public isRunning(): boolean {
        return this.process !== null && !this.process.killed;
    }
}

// Ejemplo de uso en extension.ts:
/*
import { BridgeExecutor } from './bridge/BridgeExecutor';

export async function activate(context: vscode.ExtensionContext) {
    const bridge = new BridgeExecutor(context);
    
    try {
        await bridge.start();
        
        // Escuchar mensajes
        bridge.onMessage((message) => {
            console.log('Mensaje recibido:', message);
        });
        
        // Enviar mensaje
        bridge.sendMessage({ action: 'test', data: 'hello' });
        
    } catch (error) {
        vscode.window.showErrorMessage(`Error al iniciar bridge: ${error}`);
    }
    
    // Limpiar al desactivar
    context.subscriptions.push({
        dispose: () => bridge.stop()
    });
}
*/