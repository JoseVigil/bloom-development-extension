import * as vscode from 'vscode';
import * as path from 'path';
import * as zlib from 'zlib';
import { Readable } from 'stream';
import { Logger } from '../utils/logger';

export class FilePackager {
    private readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

    constructor(private logger: Logger) {}

    async createTarball(
        files: vscode.Uri[],
        outputPath: vscode.Uri,
        workspaceFolder: vscode.WorkspaceFolder
    ): Promise<void> {
        this.logger.info(`Empaquetando ${files.length} archivos en ${outputPath.fsPath}`);

        try {
            // Leer todos los archivos
            const fileContents: Array<{ path: string; content: Uint8Array }> = [];
            let totalSize = 0;

            for (const fileUri of files) {
                const relativePath = path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath);
                const content = await vscode.workspace.fs.readFile(fileUri);
                
                totalSize += content.length;
                if (totalSize > this.MAX_FILE_SIZE) {
                    throw new Error(`El tamaño total de los archivos excede el límite de 100MB`);
                }

                fileContents.push({
                    path: relativePath,
                    content: content
                });

                this.logger.info(`Agregado: ${relativePath} (${content.length} bytes)`);
            }

            // Crear tarball
            const tarBuffer = this.createTar(fileContents);
            
            // Comprimir con gzip
            const gzipBuffer = await this.compressGzip(tarBuffer);

            // Escribir archivo
            await vscode.workspace.fs.writeFile(outputPath, gzipBuffer);

            this.logger.info(`Tarball creado exitosamente: ${outputPath.fsPath} (${gzipBuffer.length} bytes)`);
        } catch (error) {
            this.logger.error('Error al crear tarball', error as Error);
            throw error;
        }
    }

    private createTar(files: Array<{ path: string; content: Uint8Array }>): Uint8Array {
        const chunks: Uint8Array[] = [];

        for (const file of files) {
            // Header (512 bytes)
            const header = this.createTarHeader(file.path, file.content.length);
            chunks.push(header);

            // File content
            chunks.push(file.content);

            // Padding to 512 bytes
            const padding = 512 - (file.content.length % 512);
            if (padding < 512) {
                chunks.push(new Uint8Array(padding));
            }
        }

        // End of archive (two 512-byte blocks of zeros)
        chunks.push(new Uint8Array(1024));

        // Concatenate all chunks
        const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }

        return result;
    }

    private createTarHeader(filePath: string, size: number): Uint8Array {
        const header = new Uint8Array(512);

        // File name (0-99)
        const nameBytes = new TextEncoder().encode(filePath);
        header.set(nameBytes.slice(0, 100), 0);

        // File mode (100-107) - "0000644"
        header.set(new TextEncoder().encode('0000644'), 100);

        // Owner ID (108-115) - "0000000"
        header.set(new TextEncoder().encode('0000000'), 108);

        // Group ID (116-123) - "0000000"
        header.set(new TextEncoder().encode('0000000'), 116);

        // File size (124-135) - octal
        const sizeOctal = size.toString(8).padStart(11, '0');
        header.set(new TextEncoder().encode(sizeOctal), 124);

        // Modification time (136-147) - octal timestamp
        const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0');
        header.set(new TextEncoder().encode(mtime), 136);

        // Checksum placeholder (148-155) - fill with spaces first
        header.set(new TextEncoder().encode('        '), 148);

        // Type flag (156) - '0' for regular file
        header[156] = 48; // ASCII '0'

        // Calculate checksum
        let checksum = 0;
        for (let i = 0; i < 512; i++) {
            checksum += header[i];
        }

        // Write checksum (148-155)
        const checksumOctal = checksum.toString(8).padStart(6, '0') + '\0 ';
        header.set(new TextEncoder().encode(checksumOctal), 148);

        return header;
    }

    private async compressGzip(data: Uint8Array): Promise<Uint8Array> {
        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            
            const readable = Readable.from([data]);
            const gzip = zlib.createGzip();

            gzip.on('data', (chunk) => chunks.push(chunk));
            gzip.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
            gzip.on('error', reject);

            readable.pipe(gzip);
        });
    }
}