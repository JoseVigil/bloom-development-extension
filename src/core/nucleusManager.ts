// src/core/nucleusManager.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../utils/logger';
import { getCurrentGitHubUser, getGitHubHeaders } from '../utils/githubOAuth';

const execAsync = promisify(exec);

export class NucleusManager {
    private logger: Logger;

    constructor(private context: vscode.ExtensionContext) {
        this.logger = new Logger();
    }

    async createOrLinkNucleus(org: string, localPath: string, isNew: boolean): Promise<string> {
        const repoName = `nucleus-${org}`;
        const user = await getCurrentGitHubUser();
        const headers = await getGitHubHeaders();

        // Check if repo exists in GitHub
        const repoUrl = `https://github.com/${org}/${repoName}`;
        const checkResp = await fetch(`https://api.github.com/repos/${org}/${repoName}`, { headers });
        const existsInGitHub = checkResp.ok;

        if (isNew) {
            if (existsInGitHub) throw new Error('Repo ya existe en GitHub');

            // Create new repo
            const createResp = await fetch(`https://api.github.com/orgs/${org}/repos`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: repoName,
                    description: 'Bloom Nucleus Project',
                    private: false,
                    auto_init: true
                })
            });
            if (!createResp.ok) throw new Error('Error creando repo');

            // Clone locally
            await execAsync(`git clone ${repoUrl} "${localPath}"`);
            this.logger.info(`Nucleus creado y clonado en ${localPath}`);

        } else {
            if (!existsInGitHub) throw new Error('Repo no existe en GitHub');

            // Clone or link existing local
            if (!fs.existsSync(localPath)) {
                await execAsync(`git clone ${repoUrl} "${localPath}"`);
                this.logger.info(`Nucleus clonado en ${localPath}`);
            } else {
                // Link if local exists
                const gitDir = path.join(localPath, '.git');
                if (fs.existsSync(gitDir)) {
                    this.logger.info(`Nucleus linkeado en ${localPath}`);
                } else {
                    throw new Error('Carpeta no es un repo Git válido');
                }
            }
        }

        // Open in new window
        const open = await vscode.window.showQuickPick(['Sí', 'No'], { placeHolder: '¿Abrir en nueva ventana?' });
        if (open === 'Sí') {
            await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(localPath), true);
        }

        return localPath;
    }

    async detectExistingNucleus(): Promise<string | null> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceFolder) return null;

        const nucleusPath = path.join(workspaceFolder, '.bloom', 'core', 'nucleus-config.json');
        if (fs.existsSync(nucleusPath)) {
            return workspaceFolder;
        }

        // Buscar en parent folders or linked
        return null;
    }
}