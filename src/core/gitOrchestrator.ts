// src/core/gitOrchestrator.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import simpleGit, { SimpleGit } from 'simple-git';
import { Octokit } from '@octokit/rest';
import { Logger } from '../utils/logger';
import { PythonScriptRunner } from './pythonScriptRunner';
import { WorkspaceManager } from '../managers/workspaceManager';
import { GitManager } from '../utils/gitManager';

export interface NucleusStatus {
  exists: boolean;
  location: 'local' | 'remote' | 'both' | 'none';
  localPath?: string;
  remoteUrl?: string;
  hasValidStructure?: boolean;
  conflictDetected?: boolean;
}

export interface NucleusResult {
  success: boolean;
  nucleusPath: string;
  action: 'created' | 'cloned' | 'linked';
  message: string;
  error?: string;
}

export class GitOrchestrator {
  private octokit: Octokit;
  private git: SimpleGit;
  private logger: Logger;
  private pythonRunner: PythonScriptRunner;

  constructor(
    githubToken: string,
    logger: Logger,
    pythonRunner: PythonScriptRunner
  ) {
    this.octokit = new Octokit({ auth: githubToken });
    this.git = simpleGit();
    this.logger = logger;
    this.pythonRunner = pythonRunner;
  }

  /**
   * FLUJO 1: Detectar estado de Nucleus
   */
  async detectNucleusStatus(org: string): Promise<NucleusStatus> {
    const nucleusName = `nucleus-${org}`;
    const status: NucleusStatus = {
      exists: false,
      location: 'none'
    };

    // 1. Verificar remoto en GitHub
    const remoteExists = await this.checkRemoteRepo(org, nucleusName);
    
    // 2. Verificar local (en parent folder del workspace)
    const localPath = this.findLocalNucleus(org);

    if (remoteExists && localPath) {
      status.exists = true;
      status.location = 'both';
      status.localPath = localPath;
      status.remoteUrl = `https://github.com/${org}/${nucleusName}.git`;
      
      // Validar consistencia
      const isConsistent = await this.validateConsistency(localPath, status.remoteUrl);
      status.conflictDetected = !isConsistent;
      status.hasValidStructure = this.hasValidBloomStructure(localPath);
      
    } else if (remoteExists) {
      status.exists = true;
      status.location = 'remote';
      status.remoteUrl = `https://github.com/${org}/${nucleusName}.git`;
      
    } else if (localPath) {
      status.exists = true;
      status.location = 'local';
      status.localPath = localPath;
      status.hasValidStructure = this.hasValidBloomStructure(localPath);
    }

    this.logger.info(`Nucleus status for ${org}: ${JSON.stringify(status)}`);
    return status;
  }

  
  /**
   * FLUJO 2: Crear Nucleus (local + remoto nuevo)
   */
  async createNucleus(org: string, parentPath: string): Promise<NucleusResult> {
      const nucleusName = `nucleus-${org}`;
      const nucleusPath = path.join(parentPath, nucleusName);

      try {
          // 1. Crear repo remoto en GitHub
          this.logger.info(`Creating remote repo: ${nucleusName}`);
          await this.octokit.repos.createForAuthenticatedUser({
              name: nucleusName,
              description: `Nucleus organizacional para ${org}`,
              private: false,
              auto_init: false
          });

          // 2. Crear carpeta local
          if (!fs.existsSync(nucleusPath)) {
              fs.mkdirSync(nucleusPath, { recursive: true });
          }

          // 3. Inicializar Git
          const git = simpleGit(nucleusPath);
          await git.init();
          await git.addRemote('origin', `https://github.com/${org}/${nucleusName}.git`);

          // 4. Ejecutar Python para generar estructura
          this.logger.info('Generating Nucleus structure with Python...');
          await this.pythonRunner.generateNucleus(nucleusPath, org);

          // 5. Crear workspace
          await WorkspaceManager.initializeWorkspace(nucleusPath);

          // ✅ FIX: Usar GitManager directamente (elimina duplicación)
          await GitManager.stageAndOpenSCM(
              nucleusPath,
              undefined, // Stage todos los archivos
              `🌸 Initial Nucleus commit - ${nucleusName}\n\nGenerated with Bloom BTIP\nOrganization: ${org}`
          );

          return {
              success: true,
              nucleusPath,
              action: 'created',
              message: `Nucleus creado en ${nucleusPath}. Revisá los cambios en el panel SCM para hacer commit.`
          };

      } catch (error: any) {
          this.logger.error('Error creating nucleus', error);
          return {
              success: false,
              nucleusPath,
              action: 'created',
              message: 'Error al crear Nucleus',
              error: error.message
          };
      }
  }

  /**
   * FLUJO 3: Clonar Nucleus (remoto existe)
   */
  async cloneNucleus(org: string, parentPath: string): Promise<NucleusResult> {
      const nucleusName = `nucleus-${org}`;
      const nucleusPath = path.join(parentPath, nucleusName);
      const repoUrl = `https://github.com/${org}/${nucleusName}.git`;

      try {
          this.logger.info(`Cloning nucleus from ${repoUrl}`);

          // 1. Clonar repositorio
          await simpleGit().clone(repoUrl, nucleusPath);

          // 2. Verificar estructura .bloom/
          const needsCompletion = !this.hasValidBloomStructure(nucleusPath);

          if (needsCompletion) {
              this.logger.info('Completing missing .bloom/ structure...');
              await this.pythonRunner.generateNucleus(nucleusPath, org, { skipExisting: true });
              
              // ✅ FIX: Usar GitManager directamente
              await GitManager.stageAndOpenSCM(
                  nucleusPath,
                  undefined,
                  `🔧 Complete missing .bloom/ structure\n\nAdded by Bloom BTIP`
              );
          }

          // 3. Crear workspace
          await WorkspaceManager.initializeWorkspace(nucleusPath);

          return {
              success: true,
              nucleusPath,
              action: 'cloned',
              message: needsCompletion 
                  ? 'Nucleus clonado. Se agregaron archivos faltantes - revisar SCM.'
                  : 'Nucleus clonado exitosamente.'
          };

      } catch (error: any) {
          this.logger.error('Error cloning nucleus', error);
          return {
              success: false,
              nucleusPath,
              action: 'cloned',
              message: 'Error al clonar Nucleus',
              error: error.message
          };
      }
  }

  /**
   * FLUJO 4: Vincular Nucleus (local + remoto existen)
   */
  async linkNucleus(localPath: string, org: string): Promise<NucleusResult> {
      try {
          const nucleusName = `nucleus-${org}`;
          const expectedRemote = `https://github.com/${org}/${nucleusName}.git`;

          // 1. Validar que el directorio existe
          if (!fs.existsSync(localPath)) {
              throw new Error(`Path no existe: ${localPath}`);
          }

          // 2. Verificar .git
          const git = simpleGit(localPath);
          const isRepo = await git.checkIsRepo();
          
          if (!isRepo) {
              throw new Error('No es un repositorio Git válido');
          }

          // 3. Verificar remote origin
          const remotes = await git.getRemotes(true);
          const origin = remotes.find(r => r.name === 'origin');
          
          if (!origin) {
              // Agregar origin si no existe
              await git.addRemote('origin', expectedRemote);
          } else if (origin.refs.fetch !== expectedRemote) {
              throw new Error(`Remote origin no coincide. Esperado: ${expectedRemote}, Actual: ${origin.refs.fetch}`);
          }

          // 4. Validar estructura .bloom/
          const needsCompletion = !this.hasValidBloomStructure(localPath);
          
          if (needsCompletion) {
              this.logger.info('Completing .bloom/ structure...');
              await this.pythonRunner.generateNucleus(localPath, org, { skipExisting: true });
              
              // ✅ FIX: Usar GitManager directamente
              await GitManager.stageAndOpenSCM(
                  localPath,
                  undefined,
                  `🔗 Link to Nucleus - Complete structure\n\nAdded by Bloom BTIP`
              );
          }

          // 5. Crear workspace si no existe
          await WorkspaceManager.initializeWorkspace(localPath);

          return {
              success: true,
              nucleusPath: localPath,
              action: 'linked',
              message: needsCompletion
                  ? 'Nucleus vinculado. Se agregaron archivos faltantes - revisar SCM.'
                  : 'Nucleus vinculado exitosamente.'
          };

      } catch (error: any) {
          this.logger.error('Error linking nucleus', error);
          return {
              success: false,
              nucleusPath: localPath,
              action: 'linked',
              message: 'Error al vincular Nucleus',
              error: error.message
          };
      }
  }

  /**
   * UTILIDADES PRIVADAS
   */

  private async checkRemoteRepo(org: string, repoName: string): Promise<boolean> {
    try {
      await this.octokit.repos.get({
        owner: org,
        repo: repoName
      });
      return true;
    } catch (error: any) {
      if (error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  private findLocalNucleus(org: string): string | null {
    const nucleusName = `nucleus-${org}`;
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    
    if (!workspaceRoot) return null;

    // Buscar en parent directory
    const parentDir = path.dirname(workspaceRoot);
    const possiblePath = path.join(parentDir, nucleusName);

    if (fs.existsSync(possiblePath)) {
      return possiblePath;
    }

    // Buscar en workspace actual
    if (path.basename(workspaceRoot) === nucleusName) {
      return workspaceRoot;
    }

    return null;
  }

  private async validateConsistency(localPath: string, remoteUrl: string): Promise<boolean> {
    try {
      const git = simpleGit(localPath);
      const remotes = await git.getRemotes(true);
      const origin = remotes.find(r => r.name === 'origin');
      
      if (!origin) return false;
      
      // Normalizar URLs para comparación
      const normalizedLocal = this.normalizeGitUrl(origin.refs.fetch);
      const normalizedRemote = this.normalizeGitUrl(remoteUrl);
      
      return normalizedLocal === normalizedRemote;
    } catch {
      return false;
    }
  }

  private normalizeGitUrl(url: string): string {
    return url
      .replace(/\.git$/, '')
      .replace(/^https:\/\//, '')
      .replace(/^git@github\.com:/, 'github.com/')
      .toLowerCase();
  }

  private hasValidBloomStructure(nucleusPath: string): boolean {
    const requiredPaths = [
      '.bloom',
      '.bloom/core',
      '.bloom/core/nucleus-config.json',
      '.bloom/organization',
      '.bloom/projects'
    ];

    return requiredPaths.every(p => 
      fs.existsSync(path.join(nucleusPath, p))
    );
  }

  private async openSCMPanel(repoPath: string): Promise<void> {
    // Enfocar en el repo específico
    const uri = vscode.Uri.file(repoPath);
    await vscode.commands.executeCommand('workbench.view.scm');

    await GitManager.stageAndOpenSCM(
        repoPath,
        undefined,
        `🌸 Initial Nucleus commit\n\nGenerated with Bloom BTIP`
    );
    
    // Opcional: Mostrar mensaje
    vscode.window.showInformationMessage(
      '📝 Archivos agregados al stage. Revisa el panel SCM para hacer commit.',
      'Abrir SCM'
    ).then(selection => {
      if (selection === 'Abrir SCM') {
        vscode.commands.executeCommand('workbench.view.scm');
      }
    });
    
  }
}