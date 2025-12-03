// src/utils/gitPathResolver.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class GitPathResolver {
  private static GIT_PATH_KEY = 'bloom.gitPath';

  static async getGitPath(context: vscode.ExtensionContext): Promise<string> {
    let gitPath = context.globalState.get<string>(this.GIT_PATH_KEY);

    if (gitPath && fs.existsSync(gitPath)) {
      return gitPath;
    }

    // Detecta OS
    if (process.platform === 'win32') {
      gitPath = await this.findWindowsGitPath();
    } else {
      // Linux/Mac: Asume en PATH
      gitPath = 'git';
    }

    if (!gitPath) {
      gitPath = await this.promptUserForGitPath();
    }

    if (gitPath && fs.existsSync(gitPath)) {
      await context.globalState.update(this.GIT_PATH_KEY, gitPath);
      return gitPath;
    }

    throw new Error('Git no encontrado. Instala Git desde git-scm.com y reinicia VSCode.');
  }

  private static async findWindowsGitPath(): Promise<string | undefined> {
    const commonPaths = [
      'C:\\Program Files\\Git\\cmd\\git.exe',
      'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
      'C:\\msys64\\usr\\bin\\git.exe',  // Para MSYS2/MinGW
      path.join(process.env.LOCALAPPDATA || '', 'Programs\\Git\\cmd\\git.exe')
    ];

    for (const p of commonPaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    return undefined;
  }

  private static async promptUserForGitPath(): Promise<string | undefined> {
    return await vscode.window.showInputBox({
      prompt: 'Git no encontrado. Ingresa el path completo a git.exe (e.g., C:\\Program Files\\Git\\cmd\\git.exe)',
      placeHolder: 'C:\\Program Files\\Git\\cmd\\git.exe',
      validateInput: (value) => fs.existsSync(value) ? undefined : 'Path inválido - debe existir git.exe'
    });
  }

  static async testGitPath(gitPath: string): Promise<boolean> {
    try {
      const { exec } = require('child_process');
      await new Promise((resolve, reject) => {
        exec(`"${gitPath}" --version`, (err: any, stdout: string) => {
          if (err) reject(err);
          resolve(stdout);
        });
      });
      return true;
    } catch {
      return false;
    }
  }
}