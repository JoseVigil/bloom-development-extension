# Snapshot de Codebase
Este archivo consolida todo el código del proyecto para indexación rápida por IA. Primero el índice jerárquico, luego cada archivo con su path como título y código en bloque Markdown.

**Origen:** Archivos específicos: 45
**Total de archivos:** 26

## Índice de Archivos

Lista de archivos incluidos en este snapshot:

- **C:/repos/bloom-videos/bloom-development-extension/**
  - C:/repos/bloom-videos/bloom-development-extension\package.json
- **C:/repos/bloom-videos/bloom-development-extension/src/**
  - C:/repos/bloom-videos/bloom-development-extension/src\extension.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/commands/**
  - C:/repos/bloom-videos/bloom-development-extension/src/commands\addToIntent.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/commands\createNucleusProject.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/commands\deleteIntentFromForm.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/commands\generateIntent.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/commands\linkToNucleus.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/commands\manageProject.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/commands\openFileInVSCode.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/commands\openIntent.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/commands\revealInFinder.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/core/**
  - C:/repos/bloom-videos/bloom-development-extension/src/core\codebaseGenerator.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/core\gitOrchestrator.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/core\intentAutoSaver.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/core\intentSession.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/core\metadataManager.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/core\nucleusManager.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/managers/**
  - C:/repos/bloom-videos/bloom-development-extension/src/managers\userManager.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/managers\workspaceManager.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/models/**
  - C:/repos/bloom-videos/bloom-development-extension/src/models\intent.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/providers/**
  - C:/repos/bloom-videos/bloom-development-extension/src/providers\intentTreeProvider.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/providers\nucleusTreeProvider.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/ui/welcome/**
  - C:/repos/bloom-videos/bloom-development-extension/src/ui/welcome\welcomeView.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/utils/**
  - C:/repos/bloom-videos/bloom-development-extension/src/utils\gitManager.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/utils\githubApi.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/utils\githubOAuth.ts

## Contenidos de Archivos
### C:/repos/bloom-videos/bloom-development-extension/package.json
Metadatos: Lenguaje: json, Hash MD5: 8f5dedc915542b4772537f8ae237c112

```json
{
  "name": "bloom-btip-plugin",
  "displayName": "Bloom BTIP",
  "description": "Plugin para preview de Markdown y generación de Technical Intent Packages",
  "version": "1.1.0",
  "publisher": "bloom",
  "engines": {
    "vscode": "^1.80.0"
  },
  "categories": [
    "Other"
  ],
  "activationEvents": [
    "onCommand:bloom.openMarkdownPreview",
    "onCommand:bloom.generateIntent",
    "onCommand:bloom.createNucleusProject",
    "onCommand:bloom.linkToNucleus",
    "onCommand:bloom.syncNucleusProjects",
    "onView:bloomNucleus",
    "onView:bloomNucleusWelcome",
    "onView:bloomIntents",
    "onView:bloomProfiles",
    "onCommand:bloom.showWelcome",
    "onCommand:bloom.manageProfiles",
    "onCommand:bloom.openIntentInBrowser"
  ],
  "main": "./out/extension.js",
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "bloomAiBridge",
          "title": "Bloom Nucleus BTIPS",
          "icon": "$(flame)"
        }
      ]
    },
    "views": {
      "bloomAiBridge": [
        {
          "id": "bloomProfiles",
          "name": "Chrome Profiles",
          "contextualTitle": "AI Profiles"
        },
        {
          "id": "bloomNucleusWelcome",
          "name": "Nucleus",
          "when": "!bloom.isRegistered"
        },
        {
          "id": "bloomNucleus",
          "name": "Nucleus",
          "contextualTitle": "Organization Projects",
          "when": "bloom.isRegistered"
        },
        {
          "id": "bloomIntents",
          "name": "Intents"
        }
      ]
    },
    "viewsWelcome": [
      {
        "view": "bloomNucleus",
        "contents": "No hay ningún Nucleus detectado en este workspace.\n[Crear Nucleus](command:bloom.showWelcome)",
        "when": "bloom.isRegistered && workspaceFolderCount > 0"
      },
      {
        "view": "bloomNucleusWelcome",
        "contents": "Bienvenido a Bloom Nucleus\n\nPara comenzar, completá tu registro gratuito.\n[Conectar con GitHub](command:bloom.showWelcome)",
        "when": "!bloom.isRegistered"
      }
    ],
    "commands": [
      {
        "command": "bloom.openMarkdownPreview",
        "title": "Bloom: Open Markdown Preview"
      },
      {
        "command": "bloom.generateIntent",
        "title": "Bloom: Generate New Intent"
      },
      {
        "command": "bloom.openIntent",
        "title": "Open Intent"
      },
      {
        "command": "bloom.copyContextToClipboard",
        "title": "Copy Context to Clipboard",
        "icon": "$(clippy)"
      },
      {
        "command": "bloom.deleteIntent",
        "title": "Delete Intent"
      },
      {
        "command": "bloom.addToIntent",
        "title": "Bloom: Add to Intent"
      },
      {
        "command": "bloom.deleteIntentFromForm",
        "title": "Delete Current Intent"
      },
      {
        "command": "bloom.openFileInVSCode",
        "title": "Open File in VSCode"
      },
      {
        "command": "bloom.revealInFinder",
        "title": "Reveal in Finder/Explorer"
      },
      {
        "command": "bloom.copyFilePath",
        "title": "Copy File Path"
      },
      {
        "command": "bloom.createBTIPProject",
        "title": "Bloom: Create BTIP Project"
      },
      {
        "command": "bloom.createNucleusProject",
        "title": "Bloom: Crear Nucleus",
        "icon": "$(add)"
      },
      {
        "command": "bloom.linkToNucleus",
        "title": "Bloom: Link to Nucleus",
        "icon": "$(link)"
      },
      {
        "command": "bloom.unlinkFromNucleus",
        "title": "Bloom: Unlink from Nucleus"
      },
      {
        "command": "bloom.openNucleusProject",
        "title": "Bloom: Open Nucleus Project",
        "icon": "$(folder-opened)"
      },
      {
        "command": "bloom.syncNucleusProjects",
        "title": "Bloom: Sync Nucleus Projects",
        "icon": "$(sync)"
      },
      {
        "command": "bloom.regenerateContext",
        "title": "Bloom: Regenerate Project Context"
      },
      {
        "command": "bloom.generateQuestions",
        "title": "Bloom: Generate Questions"
      },
      {
        "command": "bloom.submitAnswers",
        "title": "Submit Answers to Claude"
      },
      {
        "command": "bloom.integrateSnapshot",
        "title": "Integrate Snapshot"
      },
      {
        "command": "bloom.reloadIntentForm",
        "title": "Reload Intent Form"
      },
      {
        "command": "bloom.manageProfiles",
        "title": "Bloom: Manage AI Profiles",
        "icon": "$(account)"
      },
      {
        "command": "bloom.refreshProfiles",
        "title": "Refresh Profiles",
        "icon": "$(refresh)"
      },
      {
        "command": "bloom.configureIntentProfile",
        "title": "Configure Profile for Intent",
        "icon": "$(gear)"
      },
      {
        "command": "bloom.openIntentInBrowser",
        "title": "Bloom: Open Intent in Browser",
        "icon": "$(browser)"
      },
      {
        "command": "bloom.openClaudeInBrowser",
        "title": "Bloom: Open Claude in Browser"
      },
      {
        "command": "bloom.openChatGPTInBrowser",
        "title": "Bloom: Open ChatGPT in Browser"
      },
      {
        "command": "bloom.openGrokInBrowser",
        "title": "Bloom: Open Grok in Browser"
      },
      {
        "command": "bloom.showWelcome",
        "title": "Bloom: Mostrar Bienvenida"
      },
      {
        "command": "bloom.resetRegistration",
        "title": "Bloom: Reset Registration (Debug)"
      },
      {
        "command": "bloom.addProjectToNucleus",
        "title": "Bloom: Agregar Proyecto",
        "icon": "$(add)"
      },
      {
        "command": "bloom.reviewPendingCommits",
        "title": "Bloom: Revisar Commits Pendientes",
        "icon": "$(git-commit)"
      }
    ],
    "menus": {
      "view/title": [
        {
          "command": "bloom.refreshProfiles",
          "when": "view == bloomProfiles",
          "group": "navigation"
        },
        {
          "command": "bloom.manageProfiles",
          "when": "view == bloomProfiles",
          "group": "navigation"
        },
        {
          "command": "bloom.createNucleusProject",
          "when": "view == bloomNucleus && bloom.isRegistered",
          "group": "navigation@1"
        },
        {
          "command": "bloom.syncNucleusProjects",
          "when": "view == bloomNucleus && bloom.isRegistered",
          "group": "navigation@2"
        }
      ],
      "explorer/context": [
        {
          "command": "bloom.generateIntent",
          "when": "explorerResourceIsFolder || resourceScheme == file",
          "group": "bloom@1"
        },
        {
          "command": "bloom.addToIntent",
          "when": "explorerResourceIsFolder || resourceScheme == file",
          "group": "bloom@2"
        },
        {
          "command": "bloom.createBTIPProject",
          "when": "explorerResourceIsFolder",
          "group": "bloom@3"
        },
        {
          "command": "bloom.linkToNucleus",
          "when": "explorerResourceIsFolder",
          "group": "bloom@5"
        }
      ],
      "commandPalette": [
        {
          "command": "bloom.regenerateContext",
          "when": "workspaceFolderCount > 0"
        },
        {
          "command": "bloom.createNucleusProject",
          "when": "bloom.isRegistered"
        },
        {
          "command": "bloom.linkToNucleus",
          "when": "workspaceFolderCount > 0"
        },
        {
          "command": "bloom.showWelcome",
          "when": "true"
        },
        {
          "command": "bloom.resetRegistration",
          "when": "true"
        }
      ],
      "view/item/context": [
        {
          "command": "bloom.addProjectToNucleus",
          "when": "view == bloomNucleus && viewItem == nucleusOrg",
          "group": "inline"
        },
        {
          "command": "bloom.openIntent",
          "when": "view == bloomIntents && viewItem == intent",
          "group": "1_main@1"
        },
        {
          "command": "bloom.copyContextToClipboard",
          "when": "view == bloomIntents && viewItem == intent",
          "group": "1_main@2"
        },
        {
          "command": "bloom.configureIntentProfile",
          "when": "view == bloomIntents && viewItem == intent",
          "group": "2_profile@1"
        },
        {
          "command": "bloom.openIntentInBrowser",
          "when": "view == bloomIntents && viewItem == intent",
          "group": "2_profile@2"
        },
        {
          "command": "bloom.deleteIntent",
          "when": "view == bloomIntents && viewItem == intent",
          "group": "3_danger@1"
        },
        {
          "command": "bloom.openNucleusProject",
          "when": "view == bloomNucleus && viewItem == nucleusProject",
          "group": "1_main@1"
        }
      ]
    },
    "keybindings": [
      {
        "command": "bloom.openIntentInBrowser",
        "key": "ctrl+shift+b",
        "mac": "cmd+shift+b",
        "when": "editorFocus"
      },
      {
        "command": "bloom.manageProfiles",
        "key": "ctrl+alt+m",
        "mac": "cmd+alt+m"
      },
      {
        "command": "bloom.createNucleusProject",
        "key": "ctrl+alt+n",
        "mac": "cmd+alt+n"
      }
    ],
    "configuration": {
      "title": "Bloom",
      "properties": {
        "bloom.version": {
          "type": "string",
          "enum": [
            "free",
            "pro"
          ],
          "default": "free",
          "description": "Versión del plugin"
        },
        "bloom.pythonPath": {
          "type": "string",
          "default": "python3",
          "description": "Path al ejecutable de Python para scripts"
        },
        "bloom.useCustomCodebaseGenerator": {
          "type": "boolean",
          "default": false,
          "description": "Usar script Python personalizado para generar codebase.md"
        },
        "bloom.claudeApiKey": {
          "type": "string",
          "default": "",
          "description": "API Key de Claude (o usar variable de entorno ANTHROPIC_API_KEY)"
        },
        "bloom.claudeModel": {
          "type": "string",
          "enum": [
            "claude-3-opus-20240229",
            "claude-3-sonnet-20240229"
          ],
          "default": "claude-3-sonnet-20240229",
          "description": "Modelo de Claude a utilizar"
        },
        "bloom.autoUpdateTree": {
          "type": "boolean",
          "default": true,
          "description": "Actualizar tree.txt automáticamente después de cambios"
        },
        "bloom.nucleusAutoDetect": {
          "type": "boolean",
          "default": true,
          "description": "Detectar y mostrar proyectos Nucleus automáticamente"
        }
      }
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run compile",
    "compile": "tsc -p ./",
    "watch": "tsc -watch -p ./",
    "pretest": "npm run compile && npm run lint",
    "lint": "eslint src --ext ts",
    "test": "node ./out/test/runTest.js"
  },
  "devDependencies": {
    "@types/node": "^18.19.130",
    "@types/uuid": "^10.0.0",
    "@types/vscode": "^1.85.0",
    "@typescript-eslint/eslint-plugin": "^5.59.0",
    "@typescript-eslint/parser": "^5.59.0",
    "eslint": "^8.41.0",
    "typescript": "^5.0.4"
  },
  "dependencies": {
    "@google/generative-ai": "^0.24.1",
    "@vscode/codicons": "^0.0.33",
    "punycode": "^2.3.0",
    "uuid": "^13.0.0"
  }
}

```

### C:/repos/bloom-videos/bloom-development-extension/src/commands/addToIntent.ts
Metadatos: Lenguaje: typescript, Hash MD5: 1677cc240ee281253a0c74167d0c0347

```typescript
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { MetadataManager } from '../core/metadataManager';
import { CodebaseGenerator } from '../core/codebaseGenerator';
import { IntentGenerator } from '../core/intentGenerator';
import { IntentSession } from '../core/intentSession';
import * as path from 'path';

export function registerAddToIntent(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.addToIntent',
        async (uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
            logger.info('Ejecutando comando: Bloom: Add to Intent');

            let files: vscode.Uri[] = [];

            if (selectedUris && selectedUris.length > 0) {
                files = selectedUris;
            } else if (uri) {
                files = [uri];
            }

            if (files.length === 0) {
                vscode.window.showErrorMessage('No hay archivos seleccionados.');
                return;
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No hay workspace abierto.');
                return;
            }

            const intentsPath = path.join(workspaceFolder.uri.fsPath, '.bloom', 'intents');

            try {
                const intentDirs = await vscode.workspace.fs.readDirectory(
                    vscode.Uri.file(intentsPath)
                );

                const intentNames = intentDirs
                    .filter(([name, type]) => type === vscode.FileType.Directory)
                    .map(([name]) => name);

                if (intentNames.length === 0) {
                    vscode.window.showInformationMessage('No hay intents disponibles.');
                    return;
                }

                const selected = await vscode.window.showQuickPick(intentNames, {
                    placeHolder: 'Selecciona el intent al que agregar archivos'
                });

                if (!selected) return;

                const intentFolder = vscode.Uri.file(path.join(intentsPath, selected));
                
                const metadataManager = new MetadataManager(logger);
                const codebaseGenerator = new CodebaseGenerator();
                const intentGenerator = new IntentGenerator(logger);

                const session = await IntentSession.forIntent(
                    selected,
                    workspaceFolder,
                    metadataManager,
                    codebaseGenerator,
                    intentGenerator,
                    logger
                );

                await session.addFiles(files);

                vscode.window.showInformationMessage(
                    `✅ ${files.length} archivo(s) agregado(s) a '${selected}'`
                );

            } catch (error) {
                vscode.window.showErrorMessage(`Error: ${error}`);
                logger.error('Error en addToIntent', error as Error);
            }
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.addToIntent" registrado');
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/commands/createNucleusProject.ts
Metadatos: Lenguaje: typescript, Hash MD5: 0f6fa1a52afaf09e7e353bf24f878839

```typescript
// src/commands/createNucleusProject.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';
import { PythonScriptRunner } from '../core/pythonScriptRunner';
import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

/**
 * Registra el comando bloom.createNucleusProject
 */
export function registerCreateNucleusProject(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const command = vscode.commands.registerCommand(
        'bloom.createNucleusProject',
        async () => {
            await createNucleusProject(context, logger);
        }
    );
    
    context.subscriptions.push(command);
}

/**
 * Crea un nuevo proyecto Nucleus ejecutando generate_nucleus.py
 */
async function createNucleusProject(
    context: vscode.ExtensionContext,
    logger: Logger
): Promise<void> {
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No hay carpeta de workspace abierta');
        return;
    }
    
    const projectRoot = workspaceFolder.uri.fsPath;
    const bloomDir = path.join(projectRoot, '.bloom');
    const nucleusConfigPath = path.join(bloomDir, 'core', 'nucleus-config.json');
    
    // =========================================================================
    // VERIFICAR SI YA ES NUCLEUS
    // =========================================================================
    
    if (fs.existsSync(nucleusConfigPath)) {
        const action = await vscode.window.showWarningMessage(
            'Este proyecto ya es un Nucleus. ¿Qué desea hacer?',
            'Regenerar', 'Cancelar'
        );
        
        if (action !== 'Regenerar') {
            return;
        }
        
        // Backup del config existente
        const backupPath = path.join(bloomDir, 'core', `nucleus-config.backup.${Date.now()}.json`);
        fs.copyFileSync(nucleusConfigPath, backupPath);
        logger.info(`Backup creado: ${backupPath}`);
    }
    
    // =========================================================================
    // SOLICITAR NOMBRE DE ORGANIZACIÓN
    // =========================================================================
    
    const orgName = await vscode.window.showInputBox({
        prompt: 'Nombre de la organización',
        placeHolder: 'Ej: Mi Empresa, Bloom, Acme Corp',
        validateInput: (value) => {
            if (!value || value.trim().length < 2) {
                return 'El nombre debe tener al menos 2 caracteres';
            }
            return null;
        }
    });
    
    if (!orgName) {
        return; // Usuario canceló
    }
    
    // =========================================================================
    // SOLICITAR URL DE GITHUB (OPCIONAL)
    // =========================================================================
    
    const orgUrl = await vscode.window.showInputBox({
        prompt: 'URL de GitHub de la organización (opcional)',
        placeHolder: 'Ej: https://github.com/mi-organizacion',
        value: await detectGitHubUrl(projectRoot)
    });
    
    // =========================================================================
    // EJECUTAR SCRIPT PYTHON
    // =========================================================================
    
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Creando Nucleus Organization...",
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ message: "Preparando..." });
            
            const pythonRunner = new PythonScriptRunner(context, logger);
            
            // Obtener configuración de Python
            const config = vscode.workspace.getConfiguration('bloom');
            const pythonPath = config.get<string>('pythonPath', 'python');
            
            // Path del script
            const scriptPath = path.join(
                context.extensionPath,
                'scripts',
                'generate_nucleus.py'
            );
            
            // Verificar que el script existe
            if (!fs.existsSync(scriptPath)) {
                throw new Error(`Script no encontrado: ${scriptPath}`);
            }
            
            progress.report({ message: "Ejecutando generate_nucleus.py..." });
            
            // Construir comando
            const args: string[] = [
                `--org="${orgName.trim()}"`,
                `--root="${projectRoot}"`,
                `--output="${bloomDir}"`
            ];
            
            if (orgUrl && orgUrl.trim()) {
                args.push(`--url="${orgUrl.trim()}"`);
            }
            
            const command = `"${pythonPath}" "${scriptPath}" ${args.join(' ')}`;
            
            // Ejecutar comando
            const { stdout, stderr } = await execAsync(command, {
                timeout: 30000
            });
            
            progress.report({ message: "Finalizando..." });
            
            // Log del resultado
            if (stdout) {
                logger.info(`generate_nucleus.py output:\n${stdout}`);
            }
            if (stderr) {
                logger.warn(`generate_nucleus.py stderr:\n${stderr}`);
            }
            
            // Verificar que se creó el archivo
            if (!fs.existsSync(nucleusConfigPath)) {
                throw new Error('El archivo nucleus-config.json no fue creado');
            }
            
            // Éxito
            vscode.window.showInformationMessage(
                `✅ Nucleus "${orgName}" creado exitosamente`
            );
            
            // Refrescar tree views
            vscode.commands.executeCommand('bloom.refreshNucleusTree');
            vscode.commands.executeCommand('bloom.refreshProfiles');
            
            // Abrir archivo de organización para editar
            const orgFile = path.join(bloomDir, 'organization', '.organization.bl');
            if (fs.existsSync(orgFile)) {
                const doc = await vscode.workspace.openTextDocument(orgFile);
                await vscode.window.showTextDocument(doc);
            }
            
        } catch (error: any) {
            logger.error('Error creando Nucleus', error);
            vscode.window.showErrorMessage(
                `Error creando Nucleus: ${error.message}`
            );
        }
    });
}

/**
 * Intenta detectar la URL de GitHub desde .git/config
 */
async function detectGitHubUrl(projectRoot: string): Promise<string> {
    const gitConfigPath = path.join(projectRoot, '.git', 'config');
    
    if (!fs.existsSync(gitConfigPath)) {
        return '';
    }
    
    try {
        const content = fs.readFileSync(gitConfigPath, 'utf-8');
        
        // Buscar URL del remote origin
        const urlMatch = content.match(/url\s*=\s*(.+)/);
        if (!urlMatch) {
            return '';
        }
        
        const url = urlMatch[1].trim();
        
        // Extraer organización
        // https://github.com/JoseVigil/nucleus-josevigil.git
        // git@github.com:JoseVigil/nucleus-josevigil.git
        const orgMatch = url.match(/github\.com[:/]([^/]+)/);
        if (orgMatch) {
            return `https://github.com/${orgMatch[1]}`;
        }
        
        return '';
    } catch {
        return '';
    }
}


// =============================================================================
// COMANDO APPEND PROJECT
// =============================================================================

/**
 * Registra el comando bloom.appendProject
 */
export function registerAppendProject(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const command = vscode.commands.registerCommand(
        'bloom.appendProject',
        async () => {
            await appendProjectToNucleus(context, logger);
        }
    );
    
    context.subscriptions.push(command);
}

/**
 * Vincula un proyecto hijo al Nucleus actual
 */
async function appendProjectToNucleus(
    context: vscode.ExtensionContext,
    logger: Logger
): Promise<void> {
    
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No hay carpeta de workspace abierta');
        return;
    }
    
    const nucleusRoot = workspaceFolder.uri.fsPath;
    const nucleusConfigPath = path.join(
        nucleusRoot, '.bloom', 'core', 'nucleus-config.json'
    );
    
    // Verificar que estamos en un Nucleus
    if (!fs.existsSync(nucleusConfigPath)) {
        vscode.window.showErrorMessage(
            'Este proyecto no es un Nucleus. Primero ejecute "Create Nucleus Project"'
        );
        return;
    }
    
    // Leer config actual
    let nucleusConfig: any;
    try {
        nucleusConfig = JSON.parse(fs.readFileSync(nucleusConfigPath, 'utf-8'));
    } catch (error) {
        vscode.window.showErrorMessage('Error leyendo nucleus-config.json');
        return;
    }
    
    // Buscar proyectos hermanos
    const parentDir = path.dirname(nucleusRoot);
    let siblingDirs: string[] = [];
    
    try {
        siblingDirs = fs.readdirSync(parentDir)
            .filter(name => {
                const fullPath = path.join(parentDir, name);
                return fs.statSync(fullPath).isDirectory() &&
                       name !== path.basename(nucleusRoot) &&
                       !name.startsWith('.') &&
                       !name.startsWith('nucleus-');
            });
    } catch {
        vscode.window.showErrorMessage('Error leyendo directorio padre');
        return;
    }
    
    if (siblingDirs.length === 0) {
        vscode.window.showInformationMessage(
            'No se encontraron proyectos hermanos para vincular'
        );
        return;
    }
    
    // Filtrar proyectos ya vinculados
    const linkedNames = nucleusConfig.projects.map((p: any) => p.name);
    const availableProjects = siblingDirs.filter(
        name => !linkedNames.includes(name)
    );
    
    if (availableProjects.length === 0) {
        vscode.window.showInformationMessage(
            'Todos los proyectos hermanos ya están vinculados'
        );
        return;
    }
    
    // Seleccionar proyectos
    const selected = await vscode.window.showQuickPick(
        availableProjects.map(name => ({
            label: name,
            description: detectProjectStrategy(path.join(parentDir, name)),
            picked: false
        })),
        {
            placeHolder: 'Seleccione proyectos a vincular',
            canPickMany: true
        }
    );
    
    if (!selected || selected.length === 0) {
        return;
    }
    
    // Vincular cada proyecto
    const now = new Date().toISOString();
    
    for (const item of selected) {
        const projectPath = path.join(parentDir, item.label);
        const strategy = item.description || 'generic';
        const projectId = generateUUID();
        
        // Crear LinkedProject
        const linkedProject = {
            id: projectId,
            name: item.label,
            displayName: item.label.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
            description: '',
            strategy: strategy,
            repoUrl: '',
            localPath: `../${item.label}`,
            status: 'active',
            linkedAt: now
        };
        
        // Agregar al registry
        nucleusConfig.projects.push(linkedProject);
        
        // Crear nucleus.json en el proyecto hijo
        const childBloomDir = path.join(projectPath, '.bloom');
        if (!fs.existsSync(childBloomDir)) {
            fs.mkdirSync(childBloomDir, { recursive: true });
        }
        
        const nucleusLink = {
            linkedToNucleus: true,
            nucleusId: nucleusConfig.id,
            nucleusName: nucleusConfig.nucleus.name,
            nucleusPath: `../${path.basename(nucleusRoot)}`,
            nucleusUrl: nucleusConfig.nucleus.repoUrl || '',
            organizationName: nucleusConfig.organization.name,
            projectId: projectId,
            linkedAt: now
        };
        
        fs.writeFileSync(
            path.join(childBloomDir, 'nucleus.json'),
            JSON.stringify(nucleusLink, null, 2),
            'utf-8'
        );
        
        // Crear overview.bl en nucleus
        const overviewDir = path.join(
            nucleusRoot, '.bloom', 'projects', item.label
        );
        if (!fs.existsSync(overviewDir)) {
            fs.mkdirSync(overviewDir, { recursive: true });
        }
        
        const overviewContent = generateProjectOverview(linkedProject);
        fs.writeFileSync(
            path.join(overviewDir, 'overview.bl'),
            overviewContent,
            'utf-8'
        );
        
        logger.info(`Proyecto vinculado: ${item.label}`);
    }
    
    // Actualizar nucleus-config.json
    nucleusConfig.nucleus.updatedAt = now;
    fs.writeFileSync(
        nucleusConfigPath,
        JSON.stringify(nucleusConfig, null, 2),
        'utf-8'
    );
    
    // Regenerar _index.bl
    regenerateProjectsIndex(nucleusRoot, nucleusConfig);
    
    vscode.window.showInformationMessage(
        `✅ ${selected.length} proyecto(s) vinculado(s)`
    );
    
    // Refrescar
    vscode.commands.executeCommand('bloom.refreshNucleusTree');
}


// =============================================================================
// HELPERS
// =============================================================================

function detectProjectStrategy(projectPath: string): string {
    if (fs.existsSync(path.join(projectPath, 'app', 'build.gradle'))) return 'android';
    if (fs.existsSync(path.join(projectPath, 'app', 'build.gradle.kts'))) return 'android';
    
    try {
        const items = fs.readdirSync(projectPath);
        if (items.some(f => f.endsWith('.xcodeproj'))) return 'ios';
        if (items.some(f => f.endsWith('.xcworkspace'))) return 'ios';
    } catch {}
    
    const packageJson = path.join(projectPath, 'package.json');
    if (fs.existsSync(packageJson)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8'));
            if (pkg.dependencies?.react) return 'react-web';
            if (pkg.dependencies?.express) return 'node';
            return 'node';
        } catch { return 'node'; }
    }
    
    if (fs.existsSync(path.join(projectPath, 'requirements.txt'))) return 'python-flask';
    if (fs.existsSync(path.join(projectPath, 'artisan'))) return 'php-laravel';
    
    return 'generic';
}

function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function generateProjectOverview(project: any): string {
    return `# ${project.displayName} - Overview

## Información General

**Nombre:** ${project.name}
**Estrategia:** ${project.strategy}
**Path Local:** ${project.localPath}
**Estado:** ${project.status}


## 🎯 Propósito

[¿Por qué existe este proyecto? ¿Qué problema resuelve?]


## 👥 Usuarios

[¿Quién usa este proyecto?]


## 💼 Lógica de Negocio

[¿Cómo contribuye al modelo de negocio?]


## 🔗 Dependencias

### Depende de:
- [Completar]

### Es usado por:
- [Completar]


---
bloom/v1
document_type: "project_overview"
project_id: "${project.id}"
linked_at: "${project.linkedAt}"
`;
}

function regenerateProjectsIndex(nucleusRoot: string, config: any): void {
    const indexPath = path.join(nucleusRoot, '.bloom', 'projects', '_index.bl');
    
    const orgName = config.organization.name;
    const projects = config.projects;
    
    const icons: Record<string, string> = {
        'android': '📱', 'ios': '🍎', 'react-web': '🌐',
        'node': '⚙️', 'python-flask': '🐍', 'php-laravel': '🐘',
        'generic': '📦'
    };
    
    let tree = `${orgName}/\n├── 🏢 ${config.nucleus.name}  [Nucleus]\n`;
    projects.forEach((p: any, i: number) => {
        const isLast = i === projects.length - 1;
        const prefix = isLast ? '└──' : '├──';
        const icon = icons[p.strategy] || '📦';
        tree += `${prefix} ${icon} ${p.name}  [${p.strategy}]\n`;
    });
    
    let table = '| Proyecto | Estrategia | Estado | Path |\n|----------|------------|--------|------|\n';
    projects.forEach((p: any) => {
        table += `| ${p.name} | ${p.strategy} | ${p.status} | ${p.localPath} |\n`;
    });
    
    const content = `# Índice de Proyectos - ${orgName}

## Árbol de Proyectos

\`\`\`
${tree}\`\`\`


## Proyectos Vinculados

${table}

## Relaciones Entre Proyectos

[Completar manualmente]


---
bloom/v1
document_type: "projects_index"
auto_generated: true
updated_at: "${new Date().toISOString()}"
`;
    
    fs.writeFileSync(indexPath, content, 'utf-8');
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/commands/deleteIntentFromForm.ts
Metadatos: Lenguaje: typescript, Hash MD5: 5fbed4ccaa395caa3ed9e18bc74258c6

```typescript
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { IntentSession } from '../core/intentSession';

export function registerDeleteIntentFromForm(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.deleteIntentFromForm',
        async (session: IntentSession) => {
            logger.info('Ejecutando comando: Delete Intent from Form');

            const state = session.getState();

            const confirm = await vscode.window.showWarningMessage(
                `¿Eliminar intent '${state.name}'?`,
                {
                    modal: true,
                    detail: 'Esto borrará la carpeta .bloom/intents/' + state.name + '/ permanentemente.'
                },
                'Eliminar'
            );

            if (confirm === 'Eliminar') {
                await session.deleteIntent();
                vscode.window.showInformationMessage(`Intent '${state.name}' eliminado`);
            }
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.deleteIntentFromForm" registrado');
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/commands/generateIntent.ts
Metadatos: Lenguaje: typescript, Hash MD5: 75b19d47810545e673cfca1a2a713d28

```typescript
// src/commands/generateIntent.ts
import * as vscode from 'vscode';
import { IntentFormPanel } from '../ui/intent/intentFormPanel';
import { Logger } from '../utils/logger';
import * as path from 'path';

export function registerGenerateIntent(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.generateIntent',
        async (uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
            logger.info('Ejecutando comando: Bloom: Generate Intent');

            let files: vscode.Uri[] = [];

            if (selectedUris && selectedUris.length > 0) {
                files = selectedUris;
            } else if (uri) {
                files = [uri];
            }

            if (files.length === 0) {
                vscode.window.showErrorMessage(
                    'Por favor selecciona al menos un archivo antes de generar un intent.'
                );
                logger.warn('No hay archivos seleccionados');
                return;
            }

            if (files.length > 1000) {
                vscode.window.showErrorMessage(
                    `Has seleccionado ${files.length} archivos. El límite máximo es 1000.`
                );
                logger.warn(`Límite de archivos excedido: ${files.length}`);
                return;
            }

            const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (!workspaceFolder) {
                vscode.window.showErrorMessage('No hay workspace abierto.');
                logger.error('No hay workspace folder');
                return;
            }

            const relativePaths = files.map(file =>
                path.relative(workspaceFolder.uri.fsPath, file.fsPath)
            );

            logger.info(`Rutas relativas: ${relativePaths.join(', ')}`);

            const formPanel = new IntentFormPanel(
                context,
                logger,
                workspaceFolder,
                files,
                relativePaths
            );

            formPanel.show();
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.generateIntent" registrado');
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/commands/linkToNucleus.ts
Metadatos: Lenguaje: typescript, Hash MD5: 3986826be2179eed7d54e3a65dbf6b97

```typescript
// src/commands/linkToNucleus.ts
// Command to link a BTIP project to a Nucleus project

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {
    NucleusConfig,
    LinkedProject,
    NucleusLink,
    createLinkedProject,
    createNucleusLink,
    loadNucleusConfig,
    saveNucleusConfig,
    saveNucleusLink
} from '../models/bloomConfig';
import { ProjectDetector } from '../strategies/ProjectDetector';

export async function linkToNucleus(uri?: vscode.Uri): Promise<void> {
    try {
        // Get current project root
        let currentProjectRoot: string;
        
        if (uri && uri.fsPath) {
            currentProjectRoot = uri.fsPath;
        } else if (vscode.workspace.workspaceFolders) {
            currentProjectRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
        } else {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }
        
        // Verify current project has .bloom/
        const bloomPath = path.join(currentProjectRoot, '.bloom');
        if (!fs.existsSync(bloomPath)) {
            vscode.window.showErrorMessage('Current project is not a Bloom project (.bloom/ folder not found)');
            return;
        }
        
        // Check if already linked
        const nucleusLinkPath = path.join(bloomPath, 'nucleus.json');
        if (fs.existsSync(nucleusLinkPath)) {
            const overwrite = await vscode.window.showWarningMessage(
                'This project is already linked to a Nucleus. Re-link?',
                'Yes', 'No'
            );
            
            if (overwrite !== 'Yes') {
                return;
            }
        }
        
        // Detect current project strategy
        const strategy = await ProjectDetector.getStrategyName(currentProjectRoot);
        
        if (strategy === 'nucleus') {
            vscode.window.showWarningMessage('Cannot link a Nucleus project to itself');
            return;
        }
        
        // Ask user to select Nucleus project
        const nucleusPath = await selectNucleusProject(currentProjectRoot);
        
        if (!nucleusPath) {
            return;
        }
        
        // Load Nucleus config
        const nucleusBloomPath = path.join(nucleusPath, '.bloom');
        const nucleusConfig = loadNucleusConfig(nucleusBloomPath);
        
        if (!nucleusConfig) {
            vscode.window.showErrorMessage('Invalid Nucleus project (nucleus-config.json not found or invalid)');
            return;
        }
        
        // Get project information
        const projectName = path.basename(currentProjectRoot);
        
        const displayName = await vscode.window.showInputBox({
            prompt: 'Enter display name for this project',
            placeHolder: 'e.g., Bloom Video Server',
            value: toTitleCase(projectName)
        });
        
        if (!displayName) {
            return;
        }
        
        const description = await vscode.window.showInputBox({
            prompt: 'Enter project description (optional)',
            placeHolder: 'e.g., Node.js server for video processing'
        });
        
        const repoUrl = await vscode.window.showInputBox({
            prompt: 'Enter project repository URL',
            placeHolder: 'e.g., https://github.com/org/project.git',
            value: inferRepoUrl(nucleusConfig.organization.url, projectName)
        });
        
        if (!repoUrl) {
            return;
        }
        
        // Calculate relative path from Nucleus to this project
        const relativePath = path.relative(nucleusPath, currentProjectRoot);
        
        // Show progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Linking project to Nucleus...',
            cancellable: false
        }, async (progress) => {
            
            progress.report({ message: 'Creating project entry...' });
            
            // Create LinkedProject entry
            const linkedProject = createLinkedProject(
                projectName,
                displayName,
                strategy as any,
                repoUrl,
                relativePath
            );
            
            if (description) {
                linkedProject.description = description;
            }
            
            // Update Nucleus config
            nucleusConfig.projects.push(linkedProject);
            nucleusConfig.nucleus.updatedAt = new Date().toISOString();
            
            saveNucleusConfig(nucleusBloomPath, nucleusConfig);
            
            progress.report({ message: 'Creating nucleus link...' });
            
            // Create NucleusLink in current project
            const nucleusLink = createNucleusLink(
                nucleusConfig,
                linkedProject.id,
                path.relative(currentProjectRoot, nucleusPath)
            );
            
            saveNucleusLink(bloomPath, nucleusLink);
            
            progress.report({ message: 'Creating project overview...' });
            
            // Create project overview in Nucleus
            await createProjectOverview(nucleusPath, projectName, linkedProject, nucleusConfig);
            
            progress.report({ message: 'Updating projects index...' });
            
            // Update projects index
            await updateProjectsIndex(nucleusPath, nucleusConfig);
            
            progress.report({ message: 'Done!' });
        });
        
        // Show success message
        vscode.window.showInformationMessage(
            `✅ Project "${displayName}" linked to Nucleus "${nucleusConfig.nucleus.name}" successfully!`
        );
        
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error linking to Nucleus: ${error.message}`);
        console.error('Link to Nucleus error:', error);
    }
}

async function selectNucleusProject(currentPath: string): Promise<string | null> {
    // Look for Nucleus projects in parent directory
    const parentDir = path.dirname(currentPath);
    
    const nucleusProjects: string[] = [];
    
    try {
        const items = fs.readdirSync(parentDir, { withFileTypes: true });
        
        for (const item of items) {
            if (!item.isDirectory()) {
                continue;
            }
            
            const itemPath = path.join(parentDir, item.name);
            const bloomPath = path.join(itemPath, '.bloom');
            
            if (!fs.existsSync(bloomPath)) {
                continue;
            }
            
            // Check if it's a Nucleus project
            const configPath = path.join(bloomPath, 'core', 'nucleus-config.json');
            if (fs.existsSync(configPath)) {
                nucleusProjects.push(itemPath);
            }
        }
    } catch (error) {
        // Ignore errors
    }
    
    if (nucleusProjects.length === 0) {
        // Let user browse for Nucleus
        const selected = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select Nucleus Project Folder',
            title: 'Select Nucleus Project'
        });
        
        if (!selected || selected.length === 0) {
            return null;
        }
        
        const selectedPath = selected[0].fsPath;
        
        // Verify it's a Nucleus project
        const bloomPath = path.join(selectedPath, '.bloom');
        const configPath = path.join(bloomPath, 'core', 'nucleus-config.json');
        
        if (!fs.existsSync(configPath)) {
            vscode.window.showErrorMessage('Selected folder is not a Nucleus project');
            return null;
        }
        
        return selectedPath;
    }
    
    // Let user pick from detected Nucleus projects
    const items = nucleusProjects.map(p => ({
        label: path.basename(p),
        description: p,
        detail: `Nucleus project at ${p}`
    }));
    
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select Nucleus project to link to'
    });
    
    if (!selected) {
        return null;
    }
    
    return selected.description!;
}

async function createProjectOverview(
    nucleusPath: string,
    projectName: string,
    linkedProject: LinkedProject,
    nucleusConfig: NucleusConfig
): Promise<void> {
    const projectOverviewDir = path.join(nucleusPath, '.bloom', 'projects', projectName);
    fs.mkdirSync(projectOverviewDir, { recursive: true });
    
    const overviewPath = path.join(projectOverviewDir, 'overview.bl');
    
    const template = `# ${linkedProject.displayName} - Overview

## Información General

**Nombre:** ${linkedProject.name}
**Estrategia:** ${linkedProject.strategy}
**Repositorio:** ${linkedProject.repoUrl}
**Estado:** ${linkedProject.status}


## 🎯 Propósito

[¿Por qué existe este proyecto? ¿Qué problema resuelve?]


## 👥 Usuarios

[¿Quién usa este proyecto? ¿Qué roles interactúan con él?]


## 💼 Lógica de Negocio

${linkedProject.description || '[Cómo contribuye al modelo de negocio de la organización]'}


## 🔗 Dependencias

### Depende de:
- [Proyecto X] - Para [funcionalidad]

### Es usado por:
- [Proyecto Y] - Para [funcionalidad]


## 📊 Estado Actual

- **Versión:** [X.X.X]
- **Última release:** [Fecha]
- **Issues abiertos:** [N]


## 🔑 Conceptos Clave

- **[Término 1]:** [Definición en contexto de este proyecto]


## 📁 Ubicación del Código

**Local:** ${linkedProject.localPath}
**Remote:** ${linkedProject.repoUrl}


---
bloom/v1
document_type: "project_overview"
project_id: "${linkedProject.id}"
linked_at: "${linkedProject.linkedAt}"
`;
    
    fs.writeFileSync(overviewPath, template, 'utf-8');
}

async function updateProjectsIndex(nucleusPath: string, config: NucleusConfig): Promise<void> {
    const indexPath = path.join(nucleusPath, '.bloom', 'projects', '_index.bl');
    
    // Group projects by type
    const mobile: LinkedProject[] = [];
    const backend: LinkedProject[] = [];
    const web: LinkedProject[] = [];
    const tools: LinkedProject[] = [];
    const other: LinkedProject[] = [];
    
    for (const project of config.projects) {
        switch (project.strategy) {
            case 'android':
            case 'ios':
                mobile.push(project);
                break;
            case 'node':
            case 'python-flask':
            case 'php-laravel':
                backend.push(project);
                break;
            case 'react-web':
                web.push(project);
                break;
            default:
                other.push(project);
                break;
        }
    }
    
    let tree = `${config.organization.name}/\n`;
    tree += `├── 🏢 ${config.nucleus.name}           [Este proyecto - Centro de conocimiento]\n`;
    tree += `│\n`;
    
    if (mobile.length > 0) {
        tree += `├── 📱 MOBILE\n`;
        mobile.forEach((p, i) => {
            const isLast = i === mobile.length - 1;
            tree += `│   ${isLast ? '└' : '├'}── ${p.name}           [${p.strategy} - ${p.description || p.displayName}]\n`;
        });
        tree += `│\n`;
    }
    
    if (backend.length > 0) {
        tree += `├── ⚙️ BACKEND\n`;
        backend.forEach((p, i) => {
            const isLast = i === backend.length - 1;
            tree += `│   ${isLast ? '└' : '├'}── ${p.name}           [${p.strategy} - ${p.description || p.displayName}]\n`;
        });
        tree += `│\n`;
    }
    
    if (web.length > 0) {
        tree += `├── 🌐 WEB\n`;
        web.forEach((p, i) => {
            const isLast = i === web.length - 1;
            tree += `│   ${isLast ? '└' : '├'}── ${p.name}           [${p.strategy} - ${p.description || p.displayName}]\n`;
        });
        tree += `│\n`;
    }
    
    if (other.length > 0) {
        tree += `└── 🔧 OTHER\n`;
        other.forEach((p, i) => {
            const isLast = i === other.length - 1;
            tree += `    ${isLast ? '└' : '├'}── ${p.name}           [${p.strategy} - ${p.description || p.displayName}]\n`;
        });
    }
    
    const content = `# Índice de Proyectos - ${config.organization.displayName}

## Árbol de Proyectos

\`\`\`
${tree}
\`\`\`


## Proyectos Activos

| Proyecto | Estrategia | Estado | Última Actualización |
|----------|------------|--------|---------------------|
${config.projects.map(p => `| ${p.name} | ${p.strategy} | ${getStatusIcon(p.status)} ${p.status} | ${new Date(p.linkedAt).toISOString().split('T')[0]} |`).join('\n')}


## Relaciones Entre Proyectos

[Completar manualmente con las relaciones entre proyectos]


---
bloom/v1
document_type: "projects_index"
auto_generated: true
last_updated: "${new Date().toISOString()}"
`;
    
    fs.writeFileSync(indexPath, content, 'utf-8');
}

function toTitleCase(str: string): string {
    return str
        .split(/[-_]/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function inferRepoUrl(orgUrl: string, projectName: string): string {
    return `${orgUrl}/${projectName}.git`;
}

function getStatusIcon(status: string): string {
    switch (status) {
        case 'active':
            return '✅';
        case 'development':
            return '🚧';
        case 'archived':
            return '📦';
        case 'planned':
            return '📋';
        default:
            return '❓';
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/commands/manageProject.ts
Metadatos: Lenguaje: typescript, Hash MD5: c02d97f25549519849508797a963ee22

```typescript
// src/commands/manageProject.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';
import { ProjectDetector } from '../strategies/ProjectDetector';
import { loadNucleusConfig, saveNucleusConfig, createLinkedProject } from '../models/bloomConfig';
import { GitManager } from '../utils/gitManager';
import { getUserOrgs, getOrgRepos } from '../utils/githubApi';
import { exec } from 'child_process';
import { promisify } from 'util';
import { WorkspaceManager } from '../managers/workspaceManager';

const execAsync = promisify(exec);

export async function manageProject(nucleusPath: string, orgName: string): Promise<void> {
    const action = await vscode.window.showQuickPick([
        {
            label: '$(folder) Vincular Proyecto Local Existente',
            description: 'Conectar un proyecto que ya existe en tu computadora',
            value: 'link-local'
        },
        {
            label: '$(cloud-download) Clonar desde GitHub',
            description: 'Clonar un repositorio de la organización',
            value: 'clone-github'
        },
        {
            label: '$(file-directory-create) Crear Proyecto Nuevo',
            description: 'Iniciar un proyecto desde cero con template',
            value: 'create-new'
        }
    ], {
        placeHolder: 'Selecciona cómo agregar el proyecto'
    });

    if (!action) return;

    switch (action.value) {
        case 'link-local':
            await linkLocalProject(nucleusPath, orgName);
            break;
        case 'clone-github':
            await cloneFromGitHub(nucleusPath, orgName);
            break;
        case 'create-new':
            await createNewProject(nucleusPath, orgName);
            break;
    }
}

/**
 * Vincular proyecto local existente
 */
async function linkLocalProject(nucleusPath: string, orgName: string): Promise<void> {
    const logger = new Logger();
    
    // Parent folder: donde DEBEN estar todos los proyectos
    const parentDir = path.dirname(nucleusPath);
    
    // Auto-discovery en el parent folder (ÚNICO lugar válido)
    const detectedProjects = await detectProjectsInFolder(parentDir, nucleusPath);

    if (detectedProjects.length > 0) {
        // Mostrar lista de proyectos detectados en el parent folder
        const selected = await vscode.window.showQuickPick(
            detectedProjects.map(p => ({
                label: `${getStrategyIcon(p.strategy)} ${p.name}`,
                description: `${p.strategy}`,
                detail: `${p.path}`,
                project: p
            })),
            {
                placeHolder: `Selecciona un proyecto del directorio ${path.basename(parentDir)}/`
            }
        );

        if (selected) {
            await linkProjectToNucleus(
                nucleusPath,
                orgName,
                selected.project.path,
                selected.project.name,
                selected.project.strategy
            );
            
            // Agregar al workspace
            await WorkspaceManager.addProjectToWorkspace(
                selected.project.path, 
                selected.project.name
            );
        }
    } else {
        vscode.window.showInformationMessage(
            `No se detectaron proyectos en ${parentDir}.\n\nSugerencia: Clona o crea proyectos nuevos.`
        );
    }
}

/**
 * Clonar desde GitHub
 */
async function cloneFromGitHub(nucleusPath: string, orgName: string): Promise<void> {
    try {
        // Parent folder: donde se clonará el proyecto
        const parentDir = path.dirname(nucleusPath);
        
        // 1. Obtener repos de la organización
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Obteniendo repositorios...',
            cancellable: false
        }, async () => {
            await new Promise(resolve => setTimeout(resolve, 500));
        });

        const repos = await getOrgRepos(orgName);
        
        // 2. Filtrar repos ya vinculados
        const nucleusConfig = loadNucleusConfig(path.join(nucleusPath, '.bloom'));
        const linkedRepos = nucleusConfig?.projects.map(p => p.name) || [];
        const availableRepos = repos.filter((r: any) => !linkedRepos.includes(r.name));

        if (availableRepos.length === 0) {
            vscode.window.showInformationMessage('Todos los repositorios ya están vinculados');
            return;
        }

        // 3. Seleccionar repo
        interface RepoQuickPickItem extends vscode.QuickPickItem {
            repo: any;
        }

        const selected = await vscode.window.showQuickPick<RepoQuickPickItem>(
            availableRepos.map((r: any) => ({
                label: r.name,
                description: r.description || 'Sin descripción',
                detail: `⭐ ${r.stargazers_count} - Se clonará en: ${parentDir}/${r.name}`,
                repo: r
            })),
            {
                placeHolder: `Selecciona repositorio (se clonará en ${path.basename(parentDir)}/)`
            }
        );

        if (!selected) return;

        // 4. Clonar directamente en parent folder (SIN preguntar ubicación)
        const clonePath = path.join(parentDir, selected.repo.name);

        // Verificar si ya existe
        if (fs.existsSync(clonePath)) {
            const overwrite = await vscode.window.showWarningMessage(
                `La carpeta ${selected.repo.name} ya existe en ${parentDir}.\n¿Deseas vincularla de todas formas?`,
                'Vincular Existente',
                'Cancelar'
            );

            if (overwrite !== 'Vincular Existente') return;

            // Vincular proyecto existente
            const strategy = await ProjectDetector.getStrategyName(clonePath);
            
            // Asegurar estructura .bloom
            await ensureBloomStructure(clonePath, strategy);
            
            await linkProjectToNucleus(nucleusPath, orgName, clonePath, selected.repo.name, strategy);
            
            // Agregar al workspace
            await WorkspaceManager.addProjectToWorkspace(clonePath, selected.repo.name);
            
            vscode.window.showInformationMessage(`✅ ${selected.repo.name} vinculado al Nucleus`);
            return;
        }

        // 5. Clonar con progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Clonando ${selected.repo.name} en ${path.basename(parentDir)}/...`,
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Clonando repositorio...' });
            
            try {
                // Usar la API de Git de VSCode
                const git = vscode.extensions.getExtension('vscode.git')?.exports;
                if (!git) {
                    throw new Error('Git extension no disponible');
                }
                
                const gitApi = git.getAPI(1);
                
                // Clonar usando la API de VSCode (en parent folder)
                await gitApi.clone(selected.repo.clone_url, parentDir);
                
                progress.report({ message: 'Detectando tipo de proyecto...' });
                
                // Detectar estrategia
                const strategy = await ProjectDetector.getStrategyName(clonePath);
                
                progress.report({ message: 'Creando estructura Bloom...' });
                
                // Asegurar estructura .bloom
                await ensureBloomStructure(clonePath, strategy);
                
                progress.report({ message: 'Vinculando al Nucleus...' });
                
                await linkProjectToNucleus(
                    nucleusPath,
                    orgName,
                    clonePath,
                    selected.repo.name,
                    strategy
                );
            } catch (error: any) {
                // Fallback a exec si la API falla
                if (error.message.includes('Git extension')) {
                    try {
                        await execAsync(`git clone "${selected.repo.clone_url}" "${clonePath}"`);
                        
                        progress.report({ message: 'Detectando tipo de proyecto...' });
                        const strategy = await ProjectDetector.getStrategyName(clonePath);
                        
                        progress.report({ message: 'Creando estructura Bloom...' });
                        await ensureBloomStructure(clonePath, strategy);
                        
                        progress.report({ message: 'Vinculando al Nucleus...' });
                        await linkProjectToNucleus(nucleusPath, orgName, clonePath, selected.repo.name, strategy);
                    } catch (execError: any) {
                        throw new Error(`No se pudo clonar: ${execError.message}. Asegúrate de tener Git instalado.`);
                    }
                } else {
                    throw error;
                }
            }
        });        

        // 6. Agregar al workspace automáticamente
        await WorkspaceManager.addProjectToWorkspace(clonePath, selected.repo.name);

        vscode.window.showInformationMessage(
            `✅ ${selected.repo.name} clonado y agregado al workspace`
        );

    } catch (error: any) {
        vscode.window.showErrorMessage(`Error clonando repositorio: ${error.message}`);
    }
}

/**
 * Crear proyecto nuevo
 */
async function createNewProject(nucleusPath: string, orgName: string): Promise<void> {
    // Parent folder: donde se creará el proyecto
    const parentDir = path.dirname(nucleusPath);
    
    // 1. Nombre del proyecto
    const projectName = await vscode.window.showInputBox({
        prompt: 'Nombre del proyecto',
        placeHolder: 'mi-proyecto',
        validateInput: (value) => {
            if (!value || value.length < 3) return 'Mínimo 3 caracteres';
            if (!/^[a-z0-9-]+$/.test(value)) return 'Solo minúsculas, números y guiones';
            
            // Verificar si ya existe en parent folder
            const wouldExist = path.join(parentDir, value);
            if (fs.existsSync(wouldExist)) {
                return `Ya existe una carpeta llamada "${value}" en ${path.basename(parentDir)}/`;
            }
            
            return null;
        }
    });

    if (!projectName) return;

    // 2. Tipo de proyecto
    const projectType = await vscode.window.showQuickPick([
        { label: '📱 Android', value: 'android' },
        { label: '🍎 iOS', value: 'ios' },
        { label: '🌐 React Web', value: 'react-web' },
        { label: '⚙️ Node Backend', value: 'node' },
        { label: '🐍 Python Flask', value: 'python-flask' },
        { label: '📦 Genérico', value: 'generic' }
    ], {
        placeHolder: 'Selecciona el tipo de proyecto'
    });

    if (!projectType) return;

    // 3. Crear directamente en parent folder (SIN preguntar ubicación)
    const projectPath = path.join(parentDir, projectName);

    // 4. Mostrar confirmación de ubicación
    const confirm = await vscode.window.showInformationMessage(
        `Se creará: ${parentDir}/${projectName}/`,
        'Crear',
        'Cancelar'
    );

    if (confirm !== 'Crear') return;

    // 5. Crear con template
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Creando ${projectName} en ${path.basename(parentDir)}/...`,
        cancellable: false
    }, async (progress) => {
        // Crear carpeta
        if (!fs.existsSync(projectPath)) {
            fs.mkdirSync(projectPath, { recursive: true });
        }

        progress.report({ message: 'Creando estructura básica...' });

        // Crear template básico según tipo
        await createProjectTemplate(projectPath, projectType.value);

        progress.report({ message: 'Creando estructura Bloom...' });
        
        // Asegurar estructura .bloom
        await ensureBloomStructure(projectPath, projectType.value);

        progress.report({ message: 'Vinculando al Nucleus...' });

        await linkProjectToNucleus(
            nucleusPath,
            orgName,
            projectPath,
            projectName,
            projectType.value
        );

        progress.report({ message: 'Inicializando Git...' });

        // Inicializar git
        try {
            await execAsync('git init', { cwd: projectPath });
            await execAsync('git add .', { cwd: projectPath });
            
            // Queue commit (no push automático)
            await GitManager.stageAndOpenSCM(
                projectPath,
                undefined, // Stage todos los archivos
                `🌸 Initial commit - Created with Bloom\n\nProyecto: ${projectName}\nEstrategia: ${projectType.value}`
            );

        } catch (gitError) {
            // Si git falla, continuar de todas formas
            console.warn('Git init failed:', gitError);
        }

        await WorkspaceManager.addProjectToWorkspace(projectPath, projectName);
    });

    // Agregar al workspace automáticamente
    await WorkspaceManager.addProjectToWorkspace(projectPath, projectName);

    vscode.window.showInformationMessage(
        `✅ ${projectName} creado y agregado al workspace`
    );
}

/**
 * Detecta proyectos en una carpeta
 */
async function detectProjectsInFolder(
    folderPath: string,
    excludePath: string
): Promise<Array<{name: string; path: string; strategy: string; description: string}>> {
    const projects: Array<any> = [];

    try {
        const items = fs.readdirSync(folderPath, { withFileTypes: true });

        for (const item of items) {
            if (!item.isDirectory()) continue;

            const itemPath = path.join(folderPath, item.name);

            // Excluir el propio Nucleus
            if (itemPath === excludePath) continue;

            // Detectar estrategia
            const strategy = await ProjectDetector.getStrategyName(itemPath);

            // Solo incluir si tiene .bloom/ o es un tipo reconocido
            const hasBloom = fs.existsSync(path.join(itemPath, '.bloom'));
            if (hasBloom || strategy !== 'generic') {
                projects.push({
                    name: item.name,
                    path: itemPath,
                    strategy,
                    description: hasBloom ? 'Proyecto Bloom detectado' : `Proyecto ${strategy} detectado`
                });
            }
        }
    } catch (error) {
        console.error('Error detecting projects:', error);
    }

    return projects;
}

/**
 * Asegura que existe estructura .bloom completa
 * SI YA EXISTE: No hace nada
 * SI NO EXISTE: Crea estructura completa según estrategia
 */
async function ensureBloomStructure(projectPath: string, strategy: string): Promise<void> {
    const bloomPath = path.join(projectPath, '.bloom');
    
    // CRÍTICO: Verificar si ya existe estructura completa
    const coreExists = fs.existsSync(path.join(bloomPath, 'core'));
    const projectExists = fs.existsSync(path.join(bloomPath, 'project'));
    
    if (coreExists && projectExists) {
        console.log('✅ Estructura .bloom ya existe - No se sobrescribe');
        return;
    }
    
    console.log(`📁 Creando estructura .bloom para proyecto ${strategy}...`);
    
    // Crear directorios
    const dirs = [
        path.join(bloomPath, 'core'),
        path.join(bloomPath, 'project'),
        path.join(bloomPath, 'intents')
    ];
    
    for (const dir of dirs) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
    
    // Crear archivos core básicos (SOLO si no existen)
    const rulesPath = path.join(bloomPath, 'core', '.rules.bl');
    if (!fs.existsSync(rulesPath)) {
        const rulesContent = `# Reglas del Proyecto

## Convenciones de Código
- Seguir guía de estilo del lenguaje
- Documentar funciones públicas
- Mantener consistencia con el equipo

## Testing
- Tests unitarios para lógica crítica
- Coverage mínimo recomendado: 70%

## Git
- Commits descriptivos
- Pull requests para features nuevos

---
bloom/v1
document_type: "project_rules"
strategy: "${strategy}"
created_at: "${new Date().toISOString()}"
`;
        
        fs.writeFileSync(rulesPath, rulesContent, 'utf-8');
    }
    
    const promptPath = path.join(bloomPath, 'core', '.prompt.bl');
    if (!fs.existsSync(promptPath)) {
        const promptContent = `# Prompt del Proyecto

Eres un asistente de IA especializado en proyectos ${strategy}.

## Contexto del Proyecto
Este es un proyecto ${strategy}. Ayuda al desarrollador con:
- Debugging de código
- Sugerencias de arquitectura
- Optimización de performance
- Buenas prácticas específicas de ${strategy}

## Tone
- Directo y técnico
- Ejemplos concretos
- Referencias a documentación oficial

---
bloom/v1
document_type: "project_prompt"
strategy: "${strategy}"
`;
        
        fs.writeFileSync(promptPath, promptContent, 'utf-8');
    }
    
    // Crear .context.bl (SOLO si no existe)
    const contextPath = path.join(bloomPath, 'project', '.context.bl');
    if (!fs.existsSync(contextPath)) {
        const contextContent = `# Contexto del Proyecto

## Estrategia Detectada
${strategy}

## Descripción
[Completar con descripción del proyecto]

## Stack Tecnológico
${getStackDescription(strategy)}

## Arquitectura
[Describir arquitectura del proyecto]

## Dependencias Clave
[Listar dependencias principales]

---
bloom/v1
document_type: "project_context"
strategy: "${strategy}"
created_at: "${new Date().toISOString()}"
`;
        
        fs.writeFileSync(contextPath, contextContent, 'utf-8');
    }
    
    console.log('✅ Estructura .bloom creada exitosamente');
}

/**
 * Retorna descripción de stack según estrategia
 */
function getStackDescription(strategy: string): string {
    const stacks: Record<string, string> = {
        'android': '- Lenguaje: Kotlin/Java\n- Build: Gradle\n- UI: XML/Jetpack Compose',
        'ios': '- Lenguaje: Swift\n- Build: Xcode\n- UI: SwiftUI/UIKit',
        'react-web': '- Lenguaje: JavaScript/TypeScript\n- Framework: React\n- Build: Webpack/Vite',
        'node': '- Lenguaje: JavaScript/TypeScript\n- Runtime: Node.js\n- Framework: Express/Fastify',
        'python-flask': '- Lenguaje: Python\n- Framework: Flask\n- Database: SQLAlchemy',
        'generic': '- [Definir stack tecnológico]'
    };
    
    return stacks[strategy] || stacks['generic'];
}

/**
 * Vincula un proyecto al Nucleus
 */
async function linkProjectToNucleus(
    nucleusPath: string,
    orgName: string,
    projectPath: string,
    projectName: string,
    strategy: string
): Promise<void> {
    const logger = new Logger();
    const bloomPath = path.join(nucleusPath, '.bloom');

    // 1. Cargar nucleus-config.json
    const nucleusConfig = loadNucleusConfig(bloomPath);
    if (!nucleusConfig) {
        throw new Error('Nucleus config not found');
    }

    // 2. Crear LinkedProject
    const relativePath = path.relative(nucleusPath, projectPath);
    const repoUrl = await detectGitRemote(projectPath);

    const linkedProject = createLinkedProject(
        projectName,
        projectName.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        strategy as any,
        repoUrl || `https://github.com/${orgName}/${projectName}.git`,
        relativePath
    );

    // 3. Actualizar nucleus-config.json
    nucleusConfig.projects.push(linkedProject);
    nucleusConfig.nucleus.updatedAt = new Date().toISOString();
    saveNucleusConfig(bloomPath, nucleusConfig);

    // 4. Crear nucleus.json en el proyecto hijo
    const projectBloomDir = path.join(projectPath, '.bloom');
    if (!fs.existsSync(projectBloomDir)) {
        fs.mkdirSync(projectBloomDir, { recursive: true });
    }

    const nucleusLink = {
        linkedToNucleus: true,
        nucleusId: nucleusConfig.id,
        nucleusName: nucleusConfig.nucleus.name,
        nucleusPath: path.relative(projectPath, nucleusPath),
        nucleusUrl: nucleusConfig.nucleus.repoUrl,
        organizationName: nucleusConfig.organization.name,
        projectId: linkedProject.id,
        linkedAt: linkedProject.linkedAt
    };

    fs.writeFileSync(
        path.join(projectBloomDir, 'nucleus.json'),
        JSON.stringify(nucleusLink, null, 2),
        'utf-8'
    );

    // 5. Crear overview.bl en Nucleus
    const overviewDir = path.join(bloomPath, 'projects', projectName);
    if (!fs.existsSync(overviewDir)) {
        fs.mkdirSync(overviewDir, { recursive: true });
    }

    const overviewContent = generateProjectOverview(linkedProject);
    fs.writeFileSync(
        path.join(overviewDir, 'overview.bl'),
        overviewContent,
        'utf-8'
    );

    // 6. Regenerar _index.bl
    regenerateProjectsIndex(nucleusPath, nucleusConfig);

    // 7. Queue Git commit en Nucleus
    await GitManager.queueCommit(
        nucleusPath,
        `📦 Added project: ${projectName} (${strategy})`,
        [
            '.bloom/core/nucleus-config.json',
            `.bloom/projects/${projectName}/overview.bl`,
            '.bloom/projects/_index.bl'
        ]
    );

    logger.info(`Proyecto ${projectName} vinculado exitosamente`);

    // Refrescar tree
    vscode.commands.executeCommand('bloom.syncNucleusProjects');
}

// Helper functions...
function getStrategyIcon(strategy: string): string {
    const icons: Record<string, string> = {
        'android': '📱', 
        'ios': '🍎', 
        'react-web': '🌐',
        'node': '⚙️', 
        'python-flask': '🐍', 
        'generic': '📦'
    };
    return icons[strategy] || '📦';
}

async function detectGitRemote(projectPath: string): Promise<string | null> {
    try {
        const { stdout } = await execAsync('git remote get-url origin', {
            cwd: projectPath
        });
        return stdout.trim();
    } catch {
        return null;
    }
}

function generateProjectOverview(project: any): string {
    return `# ${project.displayName} - Overview

## Información General
**Nombre:** ${project.name}
**Estrategia:** ${project.strategy}
**Repositorio:** ${project.repoUrl}
**Path Local:** ${project.localPath}
**Estado:** ${project.status}

## 🎯 Propósito
[Completar: ¿Por qué existe este proyecto? ¿Qué problema resuelve?]

## 👥 Usuarios
[Completar: ¿Quién usa este proyecto? ¿Qué roles interactúan con él?]

## 💼 Lógica de Negocio
[Completar: ¿Cómo contribuye al modelo de negocio de la organización?]

## 🔗 Dependencias
### Depende de:
- [Completar]

### Es usado por:
- [Completar]

---
bloom/v1
project_id: "${project.id}"
linked_at: "${project.linkedAt}"
`;
}

function regenerateProjectsIndex(nucleusPath: string, config: any): void {
    const indexPath = path.join(nucleusPath, '.bloom', 'projects', '_index.bl');
    
    let tree = `${config.organization.name}/\n`;
    tree += `├── 🏢 ${config.nucleus.name} [Nucleus]\n`;
    
    config.projects.forEach((p: any, i: number) => {
        const isLast = i === config.projects.length - 1;
        const prefix = isLast ? '└──' : '├──';
        const icon = getStrategyIcon(p.strategy);
        tree += `${prefix} ${icon} ${p.name} [${p.strategy}]\n`;
    });
    
    const content = `# Índice de Proyectos - ${config.organization.name}

## Árbol de Proyectos

\`\`\`
${tree}\`\`\`

## Proyectos Vinculados (${config.projects.length})

| Proyecto | Estrategia | Estado | Path |
|----------|------------|--------|------|
${config.projects.map((p: any) => `| ${p.name} | ${p.strategy} | ${p.status} | ${p.localPath} |`).join('\n')}

---
bloom/v1
auto_generated: true
updated_at: "${new Date().toISOString()}"
`;
    
    fs.writeFileSync(indexPath, content, 'utf-8');
}

async function createProjectTemplate(projectPath: string, type: string): Promise<void> {
    // Crear README.md
    const readme = `# ${path.basename(projectPath)}

Proyecto ${type} creado con Bloom BTIP.

## Setup

[Completar instrucciones de instalación]

## Development

[Completar comandos de desarrollo]

## Testing

[Completar comandos de testing]

---
Creado con 🌸 Bloom BTIP
`;
    
    fs.writeFileSync(path.join(projectPath, 'README.md'), readme, 'utf-8');

    // Crear .gitignore básico
    const gitignore = `# Dependencies
node_modules/
venv/
vendor/

# IDE
.vscode/
.idea/
*.swp

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Environment
.env
.env.local
`;
    fs.writeFileSync(path.join(projectPath, '.gitignore'), gitignore, 'utf-8');

    // Templates específicos según tipo
    switch (type) {
        case 'node':
            fs.writeFileSync(
                path.join(projectPath, 'package.json'),
                JSON.stringify({
                    name: path.basename(projectPath),
                    version: '1.0.0',
                    description: '',
                    main: 'index.js',
                    scripts: {
                        start: 'node index.js',
                        test: 'echo "No tests yet"'
                    },
                    keywords: [],
                    author: '',
                    license: 'ISC'
                }, null, 2),
                'utf-8'
            );
            
            // Crear index.js básico
            const indexJs = `// ${path.basename(projectPath)}
console.log('Hello from Bloom! 🌸');

// TODO: Implement your application logic here
`;
            fs.writeFileSync(path.join(projectPath, 'index.js'), indexJs, 'utf-8');
            break;
            
        // Agregar más templates según necesidad
        case 'python-flask':
            const requirementsTxt = `flask==3.0.0
python-dotenv==1.0.0
`;
            fs.writeFileSync(path.join(projectPath, 'requirements.txt'), requirementsTxt, 'utf-8');
            
            const appPy = `# ${path.basename(projectPath)}
from flask import Flask

app = Flask(__name__)

@app.route('/')
def hello():
    return 'Hello from Bloom! 🌸'

if __name__ == '__main__':
    app.run(debug=True)
`;
            fs.writeFileSync(path.join(projectPath, 'app.py'), appPy, 'utf-8');
            break;
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/commands/openFileInVSCode.ts
Metadatos: Lenguaje: typescript, Hash MD5: 464c261ba1bcdbb36dc98c0ab3f3de17

```typescript
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export function registerOpenFileInVSCode(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.openFileInVSCode',
        async (fileUri: vscode.Uri) => {
            logger.info(`Abriendo archivo en VSCode: ${fileUri.fsPath}`);

            try {
                const document = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(document, {
                    viewColumn: vscode.ViewColumn.Two,
                    preserveFocus: false
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Error abriendo archivo: ${error}`);
                logger.error('Error abriendo archivo', error as Error);
            }
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.openFileInVSCode" registrado');
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/commands/openIntent.ts
Metadatos: Lenguaje: typescript, Hash MD5: ac4e21ac43cf013c8e4b80665e9e7a79

```typescript
import * as vscode from 'vscode';
    import { Logger } from '../utils/logger';
    import { MetadataManager } from '../core/metadataManager';
    import { IntentTreeItem } from '../providers/intentTreeProvider';
    import { joinPath } from '../utils/uriHelper';
    
    export function registerOpenIntent(
        context: vscode.ExtensionContext,
        logger: Logger,
        metadataManager: MetadataManager
    ): void {
        const disposable = vscode.commands.registerCommand(
            'bloom.openIntent',
            async (treeItem: IntentTreeItem) => {
                logger.info(`Abriendo intent: ${treeItem.intent.metadata.name}`);
                
                const intentPath = joinPath(
                    treeItem.intent.folderUri,
                    'intent.bl'
                );
                
                const document = await vscode.workspace.openTextDocument(intentPath);
                await vscode.window.showTextDocument(document);
                
                await metadataManager.incrementOpens(treeItem.intent.folderUri);
            }
        );
        
        context.subscriptions.push(disposable);
        logger.info('Comando "bloom.openIntent" registrado');
    }
```

### C:/repos/bloom-videos/bloom-development-extension/src/commands/revealInFinder.ts
Metadatos: Lenguaje: typescript, Hash MD5: 2d31658640da1c50a5205584d94b1865

```typescript
import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

export function registerRevealInFinder(
    context: vscode.ExtensionContext,
    logger: Logger
): void {
    const disposable = vscode.commands.registerCommand(
        'bloom.revealInFinder',
        async (fileUri: vscode.Uri) => {
            logger.info(`Revelando en Finder: ${fileUri.fsPath}`);

            try {
                await vscode.commands.executeCommand('revealFileInOS', fileUri);
            } catch (error) {
                vscode.window.showErrorMessage(`Error revelando archivo: ${error}`);
                logger.error('Error revelando archivo', error as Error);
            }
        }
    );

    context.subscriptions.push(disposable);
    logger.info('Comando "bloom.revealInFinder" registrado');
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/core/codebaseGenerator.ts
Metadatos: Lenguaje: typescript, Hash MD5: f981e517fb7fd3c2fa1fe42de4a361df

```typescript
import * as vscode from 'vscode';
import { FileDescriptor, CodebaseGeneratorOptions } from '../models/codebaseStrategy';
import { promises as fs } from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class CodebaseGenerator {
    async generate(
        files: FileDescriptor[],
        outputPath: vscode.Uri,
        options: CodebaseGeneratorOptions
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration('bloom');
        const useCustomGenerator = config.get<boolean>('useCustomCodebaseGenerator', false);
        
        if (useCustomGenerator && options.format === 'markdown') {
            const success = await this.tryPythonGeneration(files, outputPath, options);
            if (success) {
                return;
            }
            
            vscode.window.showWarningMessage(
                'Script Python no disponible, usando generador nativo'
            );
        }
        
        if (options.format === 'markdown') {
            await this.generateMarkdown(files, outputPath, options);
        } else {
            await this.generateTarball(files, outputPath, options);
        }
    }
    
    private async tryPythonGeneration(
        files: FileDescriptor[],
        outputPath: vscode.Uri,
        options: CodebaseGeneratorOptions
    ): Promise<boolean> {
        try {
            const workspacePath = options.workspaceFolder.uri.fsPath;
            const scriptPath = path.join(workspacePath, '.bloom', 'scripts', 'generate_codebase.py');
            
            try {
                await fs.access(scriptPath);
            } catch {
                return false;
            }
            
            const config = vscode.workspace.getConfiguration('bloom');
            const pythonPath = config.get<string>('pythonPath', 'python');
            
            const filesListPath = path.join(path.dirname(outputPath.fsPath), 'files_list.json');
            await fs.writeFile(
                filesListPath,
                JSON.stringify({
                    files: files.map(f => ({
                        relativePath: f.relativePath,
                        absolutePath: f.absolutePath
                    })),
                    workspacePath: workspacePath,
                    outputPath: outputPath.fsPath
                }),
                'utf-8'
            );
            
            const command = `"${pythonPath}" "${scriptPath}" "${filesListPath}"`;
            const { stdout, stderr } = await execAsync(command, {
                cwd: workspacePath,
                timeout: 60000
            });
            
            if (stderr) {
                console.warn('Python script warnings:', stderr);
            }
            
            console.log('Python script output:', stdout);
            
            try {
                await fs.access(outputPath.fsPath);
                vscode.window.showInformationMessage('✅ Codebase regenerado (Python)');
                return true;
            } catch {
                return false;
            }
            
        } catch (error) {
            console.error('Error ejecutando script Python:', error);
            return false;
        }
    }
    
    private async generateMarkdown(
        files: FileDescriptor[],
        outputPath: vscode.Uri,
        options: CodebaseGeneratorOptions
    ): Promise<void> {
        let content = this.generateHeader(files, options);
        content += this.generateIndex(files, options);
        content += await this.generateContent(files, options);
        
        await fs.writeFile(outputPath.fsPath, content, 'utf-8');
    }
    
    private generateHeader(
        files: FileDescriptor[],
        options: CodebaseGeneratorOptions
    ): string {
        const timestamp = new Date().toISOString();
        let header = `# Snapshot de Codebase\n`;
        header += `Este archivo consolida todo el código del proyecto para indexación rápida por IA. `;
        header += `Primero el índice jerárquico, luego cada archivo con su path como título y código en bloque Markdown.\n\n`;
        
        if (options.includeMetadata) {
            header += `**Generado:** ${timestamp}\n`;
            header += `**Total de archivos:** ${files.length}\n\n`;
        }
        
        return header;
    }
    
    private generateIndex(
        files: FileDescriptor[],
        options: CodebaseGeneratorOptions
    ): string {
        if (!options.addTableOfContents) {
            return '';
        }
        
        let index = `## Índice de Archivos\n\n`;
        index += `Lista de archivos incluidos en este snapshot:\n\n`;
        
        const filesByDir: Record<string, string[]> = {};
        
        for (const file of files) {
            const dir = path.dirname(file.relativePath);
            if (!filesByDir[dir]) {
                filesByDir[dir] = [];
            }
            filesByDir[dir].push(file.relativePath);
        }
        
        const sortedDirs = Object.keys(filesByDir).sort();
        
        for (const dir of sortedDirs) {
            index += `- **${dir}/**\n`;
            for (const filePath of filesByDir[dir].sort()) {
                index += `  - ${filePath}\n`;
            }
        }
        
        index += `\n`;
        return index;
    }
    
    private async generateContent(
        files: FileDescriptor[],
        options: CodebaseGeneratorOptions
    ): Promise<string> {
        let content = `## Contenidos de Archivos\n`;
        
        for (const file of files) {
            content += await this.generateFileSection(file, options);
        }
        
        return content;
    }
    
    private async generateFileSection(
        file: FileDescriptor,
        options: CodebaseGeneratorOptions
    ): Promise<string> {
        let section = `### ${file.relativePath}\n`;
        
        if (options.includeMetadata && file.metadata) {
            section += `Metadatos: `;
            section += `Lenguaje: ${file.metadata.type}, `;
            section += `Tamaño: ${this.formatBytes(file.metadata.size)}\n\n`;
        }
        
        try {
            const fileContent = await fs.readFile(file.absolutePath, 'utf-8');
            const language = this.getLanguageFromExtension(file.relativePath);
            
            section += `\`\`\`${language}\n`;
            section += fileContent;
            section += `\n\`\`\`\n\n`;
        } catch (error) {
            section += `*Error leyendo archivo: ${error}*\n\n`;
        }
        
        return section;
    }
    
    private getLanguageFromExtension(filePath: string): string {
        const ext = path.extname(filePath).toLowerCase();
        const languageMap: Record<string, string> = {
            '.ts': 'typescript',
            '.tsx': 'tsx',
            '.js': 'javascript',
            '.jsx': 'jsx',
            '.json': 'json',
            '.md': 'markdown',
            '.css': 'css',
            '.scss': 'scss',
            '.html': 'html',
            '.py': 'python',
            '.java': 'java',
            '.kt': 'kotlin',
            '.swift': 'swift',
        };
        
        return languageMap[ext] || 'text';
    }
    
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }
    
    private async generateTarball(
        files: FileDescriptor[],
        outputPath: vscode.Uri,
        options: CodebaseGeneratorOptions
    ): Promise<void> {
        throw new Error('Tarball generation not yet implemented');
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/core/gitOrchestrator.ts
Metadatos: Lenguaje: typescript, Hash MD5: e3431a0295b097460fb2262915628006

```typescript
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
```

### C:/repos/bloom-videos/bloom-development-extension/src/core/intentAutoSaver.ts
Metadatos: Lenguaje: typescript, Hash MD5: 223acfbc13738402a8574728e8403808

```typescript
import * as vscode from 'vscode';
import { MetadataManager } from './metadataManager';
import { CodebaseGenerator } from './codebaseGenerator';
import { Logger } from '../utils/logger';
import { joinPath } from '../utils/uriHelper';
import { FileDescriptor, FileCategory } from '../models/codebaseStrategy';
import { IntentContent } from '../models/intent';
import * as path from 'path';

export class IntentAutoSaver {
    private pendingUpdates: Map<string, any> = new Map();
    private timer: NodeJS.Timeout | null = null;
    private readonly DEBOUNCE_MS = 2000;

    constructor(
        private intentFolder: vscode.Uri,
        private workspaceFolder: vscode.WorkspaceFolder,
        private metadataManager: MetadataManager,
        private codebaseGenerator: CodebaseGenerator,
        private logger: Logger
    ) {}

    enqueue(updates: Partial<IntentContent>): void {
        for (const [key, value] of Object.entries(updates)) {
            this.pendingUpdates.set(key, value);
        }

        if (this.timer) {
            clearTimeout(this.timer);
        }

        this.timer = setTimeout(() => {
            this.flush().catch(error => {
                this.logger.error('Auto-save failed', error);
            });
        }, this.DEBOUNCE_MS);
    }

    async flush(): Promise<void> {
        if (this.pendingUpdates.size === 0) {
            return;
        }

        this.logger.info('Flushing auto-save queue');

        const updates = Object.fromEntries(this.pendingUpdates);
        this.pendingUpdates.clear();

        try {
            const existing = await this.metadataManager.read(this.intentFolder);
            if (!existing) {
                this.logger.warn('Intent not found, skipping auto-save');
                return;
            }

            // Merge content con valores por defecto seguros
            const mergedContent: IntentContent = {
                problem: updates.problem ?? existing.content.problem,
                expectedOutput: updates.expectedOutput ?? existing.content.expectedOutput,
                currentBehavior: updates.currentBehavior ?? existing.content.currentBehavior,
                desiredBehavior: updates.desiredBehavior ?? existing.content.desiredBehavior,
                considerations: updates.considerations ?? existing.content.considerations
            };

            const updatedMetadata = {
                ...existing,
                content: mergedContent,
                updated: new Date().toISOString()
            };

            await this.metadataManager.save(this.intentFolder, updatedMetadata);

            // Regenerar codebase si hay archivos
            const filesIncluded = existing.files.filesIncluded || [];
            if (filesIncluded.length > 0) {
                await this.regenerateCodebase(filesIncluded);
            }

            this.logger.info('Auto-save completed');
        } catch (error) {
            this.logger.error('Auto-save error', error as Error);
            throw error;
        }
    }

    private async regenerateCodebase(filesIncluded: string[]): Promise<void> {
        const fileDescriptors: FileDescriptor[] = filesIncluded.map((relativePath: string) => {
            const absolutePath = path.join(this.workspaceFolder.uri.fsPath, relativePath);
            return {
                relativePath,
                absolutePath,
                category: this.categorizeFile(relativePath),
                priority: 1,
                size: 0,
                extension: path.extname(relativePath),
                metadata: {
                    size: 0,
                    type: path.extname(relativePath).slice(1),
                    lastModified: Date.now()
                }
            };
        });

        const codebasePath = joinPath(this.intentFolder, 'codebase.md');

        await this.codebaseGenerator.generate(
            fileDescriptors,
            codebasePath,
            {
                workspaceFolder: this.workspaceFolder,
                format: 'markdown',
                includeMetadata: true,
                addTableOfContents: true,
                categorizeByType: false
            }
        );
    }

    private categorizeFile(filePath: string): FileCategory {
        const ext = path.extname(filePath).toLowerCase();
        
        // Code files
        if (['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.kt', '.swift'].includes(ext)) {
            return 'code';
        }
        
        // Config files
        if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext)) {
            return 'config';
        }
        
        // Documentation
        if (['.md', '.txt', '.rst'].includes(ext)) {
            return 'docs';
        }
        
        // Tests
        if (filePath.includes('.test.') || filePath.includes('.spec.') || filePath.includes('__tests__')) {
            return 'test';
        }
        
        // Assets
        if (['.png', '.jpg', '.svg', '.ico', '.gif'].includes(ext)) {
            return 'asset';
        }
        
        return 'other';
    }

    dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.pendingUpdates.clear();
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/core/intentSession.ts
Metadatos: Lenguaje: typescript, Hash MD5: 7cfd667fe36c6e612e8506a2672ff6ae

```typescript
import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import { MetadataManager } from './metadataManager';
import { CodebaseGenerator } from './codebaseGenerator';
import { IntentGenerator } from './intentGenerator';
import { IntentAutoSaver } from './intentAutoSaver';
import { Logger } from '../utils/logger';
import { IntentFormData, IntentContent, TokenStats, formDataToContent, IntentWorkflow, IntentWorkflowStage } from '../models/intent';
import { FileDescriptor, FileCategory } from '../models/codebaseStrategy';
import { joinPath } from '../utils/uriHelper';
import * as path from 'path';

export interface IntentState {
    id: string;
    name: string;
    status: 'draft' | 'in-progress' | 'completed' | 'archived';
    files: string[];
    content: IntentContent;
    tokens: TokenStats;
    workflow: IntentWorkflow;
    projectType?: string;
    intentFolder: vscode.Uri;
}

export class IntentSession extends EventEmitter {
    private autoSaver: IntentAutoSaver;
    private state: IntentState;

    private constructor(
        private intentFolder: vscode.Uri,
        private workspaceFolder: vscode.WorkspaceFolder,
        private metadataManager: MetadataManager,
        private codebaseGenerator: CodebaseGenerator,
        private intentGenerator: IntentGenerator,
        private logger: Logger,
        initialState: IntentState
    ) {
        super();
        this.state = initialState;
        this.autoSaver = new IntentAutoSaver(
            intentFolder,
            workspaceFolder,
            metadataManager,
            codebaseGenerator,
            logger
        );
    }

    static async create(
        intentFolder: vscode.Uri,
        workspaceFolder: vscode.WorkspaceFolder,
        selectedFiles: vscode.Uri[],
        relativePaths: string[],
        metadataManager: MetadataManager,
        codebaseGenerator: CodebaseGenerator,
        intentGenerator: IntentGenerator,
        logger: Logger
    ): Promise<IntentSession> {
        const initialState: IntentState = {
            id: '',
            name: '',
            status: 'draft',
            files: relativePaths,
            content: {
                problem: '',
                expectedOutput: '',
                currentBehavior: [],
                desiredBehavior: [],
                considerations: ''
            },
            tokens: {
                estimated: 0,
                limit: 100000,
                percentage: 0
            },
            workflow: {
                stage: 'draft',
                questions: [],
                integrationStatus: 'pending'
            },
            intentFolder: intentFolder
        };

        const session = new IntentSession(
            intentFolder,
            workspaceFolder,
            metadataManager,
            codebaseGenerator,
            intentGenerator,
            logger,
            initialState
        );

        await session.calculateTokens();

        return session;
    }

    static async forIntent(
        intentName: string,
        workspaceFolder: vscode.WorkspaceFolder,
        metadataManager: MetadataManager,
        codebaseGenerator: CodebaseGenerator,
        intentGenerator: IntentGenerator,
        logger: Logger
    ): Promise<IntentSession> {
        const intentFolder = vscode.Uri.file(
            path.join(workspaceFolder.uri.fsPath, '.bloom', 'intents', intentName)
        );

        const metadata = await metadataManager.read(intentFolder);
        if (!metadata) {
            throw new Error(`Intent '${intentName}' not found`);
        }

        const state: IntentState = {
            id: metadata.id,
            name: metadata.name,
            status: metadata.status,
            files: metadata.files.filesIncluded || [],
            content: metadata.content,
            tokens: metadata.tokens,
            workflow: metadata.workflow || {
                stage: 'draft',
                questions: [],
                integrationStatus: 'pending'
            },
            projectType: metadata.projectType,
            intentFolder: intentFolder
        };

        return new IntentSession(
            intentFolder,
            workspaceFolder,
            metadataManager,
            codebaseGenerator,
            intentGenerator,
            logger,
            state
        );
    }

    async updateWorkflow(updates: Partial<IntentWorkflow>): Promise<void> {
        this.state.workflow = {
            ...this.state.workflow,
            ...updates
        };

        await this.metadataManager.update(this.intentFolder, {
            workflow: this.state.workflow
        });

        this.emit('workflowChanged', this.state.workflow);
    }

    async readIntentFile(): Promise<string> {
        const intentPath = joinPath(this.intentFolder, 'intent.bl');
        const content = await vscode.workspace.fs.readFile(intentPath);
        return new TextDecoder().decode(content);
    }

    async readCodebaseFile(): Promise<string> {
        const codebasePath = joinPath(this.intentFolder, 'codebase.md');
        const content = await vscode.workspace.fs.readFile(codebasePath);
        return new TextDecoder().decode(content);
    }

    async readSnapshotFile(): Promise<string> {
        if (!this.state.workflow.snapshotPath) {
            throw new Error('No snapshot path available');
        }
        const snapshotPath = vscode.Uri.file(this.state.workflow.snapshotPath);
        const content = await vscode.workspace.fs.readFile(snapshotPath);
        return new TextDecoder().decode(content);
    }

    getWorkflowStage(): IntentWorkflowStage {
        return this.state.workflow?.stage || 'draft';
    }

    getIntentFolder(): vscode.Uri {
        return this.intentFolder;
    }

    getWorkspaceFolder(): vscode.WorkspaceFolder {
        return this.workspaceFolder;
    }

    async addFiles(files: vscode.Uri[]): Promise<void> {
        this.logger.info(`Adding ${files.length} files to intent`);

        const newRelativePaths = files.map(file =>
            path.relative(this.workspaceFolder.uri.fsPath, file.fsPath)
        );

        this.state.files = [...new Set([...this.state.files, ...newRelativePaths])];

        await this.metadataManager.update(this.intentFolder, {
            files: {
                intentFile: 'intent.bl',
                codebaseFile: 'codebase.md',
                filesIncluded: this.state.files,
                filesCount: this.state.files.length,
                totalSize: await this.calculateTotalSize()
            }
        });

        await this.regenerateCodebase();
        await this.calculateTokens();

        this.emit('filesChanged', this.state.files);
        this.logger.info(`Files added successfully`);
    }

    async removeFile(filePath: string): Promise<void> {
        this.logger.info(`Removing file: ${filePath}`);

        this.state.files = this.state.files.filter(f => f !== filePath);

        await this.metadataManager.update(this.intentFolder, {
            files: {
                intentFile: 'intent.bl',
                codebaseFile: 'codebase.md',
                filesIncluded: this.state.files,
                filesCount: this.state.files.length,
                totalSize: await this.calculateTotalSize()
            }
        });

        await this.regenerateCodebase();
        await this.calculateTokens();

        this.emit('filesChanged', this.state.files);
        this.logger.info(`File removed successfully`);
    }

    async generateIntent(formData: IntentFormData): Promise<void> {
        this.logger.info('Generating intent.bl');

        this.state.name = formData.name;
        this.state.content = formDataToContent(formData);

        const intentPath = joinPath(this.intentFolder, 'intent.bl');
        await this.intentGenerator.generateIntent(
            formData,
            this.state.files,
            intentPath
        );

        await this.regenerateCodebase();

        await this.updateWorkflow({
            stage: 'intent-generated'
        });

        await this.changeStatus('completed');

        this.logger.info('Intent generated successfully');
    }

    async regenerateIntent(formData: IntentFormData): Promise<void> {
        this.logger.info('Regenerating intent.bl');

        this.state.content = formDataToContent(formData);

        const intentPath = joinPath(this.intentFolder, 'intent.bl');
        await this.intentGenerator.generateIntent(
            formData,
            this.state.files,
            intentPath
        );

        await this.regenerateCodebase();

        await this.metadataManager.update(this.intentFolder, {
            content: this.state.content
        });

        this.logger.info('Intent regenerated successfully');
    }

    queueAutoSave(updates: Partial<IntentContent>): void {
        Object.assign(this.state.content, updates);
        this.autoSaver.enqueue(updates);
        this.emit('stateChanged', this.state);
    }

    async changeStatus(status: 'draft' | 'in-progress' | 'completed' | 'archived'): Promise<void> {
        this.state.status = status;
        await this.metadataManager.update(this.intentFolder, {
            status
        });
        this.emit('stateChanged', this.state);
    }

    async deleteIntent(): Promise<void> {
        this.logger.info(`Deleting intent: ${this.state.name}`);

        await vscode.workspace.fs.delete(this.intentFolder, { recursive: true });

        this.dispose();
        this.logger.info('Intent deleted successfully');
    }

    getState(): IntentState {
        return { ...this.state };
    }

    private async regenerateCodebase(): Promise<void> {
        this.logger.info('Regenerating codebase.md');

        await vscode.workspace.fs.createDirectory(this.intentFolder);

        try {
            await vscode.workspace.fs.stat(this.intentFolder);
        } catch {
            // Crear carpeta si no existe
            await vscode.workspace.fs.createDirectory(this.intentFolder);
            this.logger.info(`Created intent folder: ${this.intentFolder.fsPath}`);
        }

        const fileDescriptors: FileDescriptor[] = this.state.files.map(relativePath => {
            const absolutePath = path.join(this.workspaceFolder.uri.fsPath, relativePath);
            return {
                relativePath,
                absolutePath,
                category: this.categorizeFile(relativePath),
                priority: 1,
                size: 0,
                extension: path.extname(relativePath),
                metadata: {
                    size: 0,
                    type: path.extname(relativePath).slice(1),
                    lastModified: Date.now()
                }
            };
        });

        const codebasePath = joinPath(this.intentFolder, 'codebase.md');

        await this.codebaseGenerator.generate(
            fileDescriptors,
            codebasePath,
            {
                workspaceFolder: this.workspaceFolder,
                format: 'markdown',
                includeMetadata: true,
                addTableOfContents: true,
                categorizeByType: false
            }
        );

        this.logger.info('Codebase regenerated');
    }

    private categorizeFile(filePath: string): FileCategory {
        const ext = path.extname(filePath).toLowerCase();

        if (['.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.kt', '.swift'].includes(ext)) {
            return 'code';
        }
        if (['.json', '.yaml', '.yml', '.toml', '.ini', '.env'].includes(ext)) {
            return 'config';
        }
        if (['.md', '.txt', '.rst'].includes(ext)) {
            return 'docs';
        }
        if (filePath.includes('.test.') || filePath.includes('.spec.')) {
            return 'test';
        }
        if (['.png', '.jpg', '.svg', '.ico'].includes(ext)) {
            return 'asset';
        }
        return 'other';
    }

    private async calculateTokens(): Promise<void> {
        let totalChars = 0;

        for (const relativePath of this.state.files) {
            const fileUri = vscode.Uri.file(
                path.join(this.workspaceFolder.uri.fsPath, relativePath)
            );
            try {
                const content = await vscode.workspace.fs.readFile(fileUri);
                totalChars += content.length;
            } catch (error) {
                this.logger.warn(`Error reading file ${relativePath}: ${error}`);
            }
        }

        totalChars += this.state.content.problem.length;
        totalChars += this.state.content.expectedOutput.length;
        totalChars += this.state.content.considerations.length;

        const estimated = Math.ceil(totalChars / 4);
        const percentage = (estimated / this.state.tokens.limit) * 100;

        this.state.tokens = {
            estimated,
            limit: 100000,
            percentage: Math.round(percentage * 100) / 100
        };

        await this.metadataManager.update(this.intentFolder, {
            tokens: this.state.tokens
        });

        this.emit('tokensChanged', this.state.tokens);
    }

    private async calculateTotalSize(): Promise<number> {
        let total = 0;
        for (const relativePath of this.state.files) {
            const fileUri = vscode.Uri.file(
                path.join(this.workspaceFolder.uri.fsPath, relativePath)
            );
            try {
                const stat = await vscode.workspace.fs.stat(fileUri);
                total += stat.size;
            } catch (error) {
                this.logger.warn(`Error calculating size for ${relativePath}`);
            }
        }
        return total;
    }

    dispose(): void {
        this.autoSaver.dispose();
        this.removeAllListeners();
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/core/metadataManager.ts
Metadatos: Lenguaje: typescript, Hash MD5: 9938a0412cb7d36fbb41171ec6e0a8db

```typescript
import * as vscode from 'vscode';
import { IntentMetadata, Intent, IntentContent, TokenStats, IntentWorkflow } from '../models/intent';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { joinPath } from '../utils/uriHelper';

export class MetadataManager {
    constructor(private logger: Logger) {}

    async create(
        intentFolder: vscode.Uri,
        options: {
            name: string;
            projectType?: string;
            version: 'free' | 'pro';
            files: vscode.Uri[];
            filesCount: number;
            estimatedTokens?: number;
            content: IntentContent;
        }
    ): Promise<IntentMetadata> {
        const now = new Date().toISOString();
        const estimatedTokens = options.estimatedTokens || 0;

        const tokens: TokenStats = {
            estimated: estimatedTokens,
            limit: 100000,
            percentage: (estimatedTokens / 100000) * 100
        };

        const workflow: IntentWorkflow = {
            stage: 'draft',
            questions: [],
            integrationStatus: 'pending'
        };

        const metadata: IntentMetadata = {
            id: uuidv4(),
            name: options.name,
            displayName: this.generateDisplayName(options.name),
            created: now,
            updated: now,
            status: 'in-progress',
            projectType: options.projectType as any,
            version: options.version,
            files: {
                intentFile: 'intent.bl',
                codebaseFile: options.version === 'free' ? 'codebase.md' : 'codebase.tar.gz',
                filesIncluded: options.files.map(f => f.fsPath),
                filesCount: options.filesCount,
                totalSize: await this.calculateTotalSize(options.files)
            },
            content: options.content,
            tokens: tokens,
            workflow: workflow,
            stats: {
                timesOpened: 0,
                lastOpened: null,
                estimatedTokens: estimatedTokens
            },
            bloomVersion: '1.0.0'
        };

        await this.save(intentFolder, metadata);
        this.logger.info(`Metadata creada para intent: ${options.name}`);

        return metadata;
    }

    async read(intentFolder: vscode.Uri): Promise<IntentMetadata | null> {
        try {
            const metadataPath = joinPath(intentFolder, '.bloom-meta.json');
            const content = await vscode.workspace.fs.readFile(metadataPath);
            const metadata: IntentMetadata = JSON.parse(new TextDecoder().decode(content));

            return metadata;
        } catch (error) {
            this.logger.warn(`Error al leer metadata de ${intentFolder.fsPath}: ${error}`);
            return null;
        }
    }

    async update(
        intentFolder: vscode.Uri,
        updates: Partial<IntentMetadata>
    ): Promise<IntentMetadata | null> {
        const existing = await this.read(intentFolder);
        if (!existing) return null;

        const updated: IntentMetadata = {
            ...existing,
            ...updates,
            updated: new Date().toISOString()
        };

        await this.save(intentFolder, updated);
        this.logger.info(`Metadata actualizada para intent: ${existing.name}`);

        return updated;
    }

    async save(intentFolder: vscode.Uri, metadata: IntentMetadata): Promise<void> {
        const metadataPath = joinPath(intentFolder, '.bloom-meta.json');
        const content = JSON.stringify(metadata, null, 2);
        await vscode.workspace.fs.writeFile(metadataPath, new TextEncoder().encode(content));
    }

    async incrementOpens(intentFolder: vscode.Uri): Promise<void> {
        const metadata = await this.read(intentFolder);
        if (!metadata) return;

        metadata.stats.timesOpened += 1;
        metadata.stats.lastOpened = new Date().toISOString();

        await this.save(intentFolder, metadata);
    }

    async changeStatus(
        intentFolder: vscode.Uri,
        newStatus: IntentMetadata['status']
    ): Promise<void> {
        await this.update(intentFolder, { status: newStatus });
    }

    async updateTags(intentFolder: vscode.Uri, tags: string[]): Promise<void> {
        await this.update(intentFolder, { tags });
    }

    isValid(metadata: any): metadata is IntentMetadata {
        return (
            typeof metadata.id === 'string' &&
            typeof metadata.name === 'string' &&
            typeof metadata.created === 'string' &&
            typeof metadata.status === 'string' &&
            ['draft', 'in-progress', 'completed', 'archived'].includes(metadata.status)
        );
    }

    private generateDisplayName(name: string): string {
        return name
            .replace(/-/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    private async calculateTotalSize(files: vscode.Uri[]): Promise<number> {
        let total = 0;
        for (const file of files) {
            try {
                const stat = await vscode.workspace.fs.stat(file);
                total += stat.size;
            } catch (error) {
                this.logger.warn(`Error al calcular tamaño de ${file.fsPath}`);
            }
        }
        return total;
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/core/nucleusManager.ts
Metadatos: Lenguaje: typescript, Hash MD5: 23f3165a42d78ce0400583b0a2ddbe57

```typescript
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
```

### C:/repos/bloom-videos/bloom-development-extension/src/extension.ts
Metadatos: Lenguaje: typescript, Hash MD5: 0d774f6c3359dc0cf0cb890ef101c69a

```typescript
// src/extension.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import { registerOpenMarkdownPreview } from './commands/openMarkdownPreview';
import { registerGenerateIntent } from './commands/generateIntent';
import { registerOpenIntent } from './commands/openIntent';
import { registerCopyContextToClipboard } from './commands/copyContextToClipboard';
import { registerDeleteIntent } from './commands/deleteIntent';
import { registerAddToIntent } from './commands/addToIntent';
import { registerDeleteIntentFromForm } from './commands/deleteIntentFromForm';
import { registerOpenFileInVSCode } from './commands/openFileInVSCode';
import { registerRevealInFinder } from './commands/revealInFinder';
import { registerCreateBTIPProject } from './commands/createBTIPProject';
import { registerGenerateQuestions } from './commands/generateQuestions';
import { registerSubmitAnswers } from './commands/submitAnswers';
import { registerIntegrateSnapshot } from './commands/integrateSnapshot';
import { registerReloadIntentForm } from './commands/reloadIntentForm';
import { Logger } from './utils/logger';
import { MetadataManager } from './core/metadataManager';
import { ContextGatherer } from './core/contextGatherer';
import { TokenEstimator } from './utils/tokenEstimator';
import { IntentTreeProvider } from './providers/intentTreeProvider';
import { registerRegenerateContext } from './commands/regenerateContext';
import { ProfileManagerPanel } from './ui/profile/profileManagerPanel';
import { ChromeProfileManager } from './core/chromeProfileManager';
import { Intent } from './models/intent';
import { ProfileTreeProvider } from './providers/profileTreeProvider';
import { openIntentInBrowser, openProviderInBrowser } from './commands/openIntentInBrowser';
import { NucleusTreeProvider } from './providers/nucleusTreeProvider';
import { NucleusWelcomeProvider } from './providers/nucleusWelcomeProvider';
import { WelcomeView } from './ui/welcome/welcomeView';
import { UserManager } from './managers/userManager';
import { NucleusSetupPanel } from './ui/nucleus/NucleusSetupPanel';
import { openNucleusProject } from './providers/nucleusTreeProvider';
import { linkToNucleus } from './commands/linkToNucleus';
import { manageProject } from './commands/manageProject';
import { GitManager } from './utils/gitManager';

import {
    configureIntentProfile,
    changeIntentProfile,
    removeIntentProfile
} from './commands/configureIntentProfile';

export function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    logger.info('Bloom BTIP + Nucleus Premium activado');

    // Inicializar UserManager
    UserManager.init(context);

    // Inicializar GitManager
    GitManager.initialize(context);

    const metadataManager = new MetadataManager(logger);
    const contextGatherer = new ContextGatherer(logger);
    const tokenEstimator = new TokenEstimator();

    const welcomeWebview = new WelcomeView(context);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        logger.warn('No workspace folder detected - Limited functionality');
        // Aún así registrar comandos críticos
        registerCriticalCommands(context, logger, welcomeWebview);
        return;
    }

    const gitExtension = vscode.extensions.getExtension('vscode.git');
    if (!gitExtension) {
        logger.error('VSCode Git extension not available');
    }

    // ========================================
    // TREE PROVIDERS
    // ========================================
    
    // Intent Tree
    const intentTreeProvider = new IntentTreeProvider(workspaceFolder, logger, metadataManager);
    vscode.window.registerTreeDataProvider('bloomIntents', intentTreeProvider);

    // Nucleus Real + Welcome
    const nucleusTreeProvider = new NucleusTreeProvider(workspaceFolder.uri.fsPath, context);
    const nucleusWelcomeProvider = new NucleusWelcomeProvider(context);

    vscode.window.registerTreeDataProvider('bloomNucleus', nucleusTreeProvider);
    vscode.window.registerTreeDataProvider('bloomNucleusWelcome', nucleusWelcomeProvider);

    vscode.window.createTreeView('bloomNucleus', {
        treeDataProvider: nucleusTreeProvider,
        showCollapseAll: true
    });

    // Chrome Profile Manager
    const chromeProfileManager = new ChromeProfileManager(context, logger);
    
    try {
        ProfileTreeProvider.initialize(context, logger, chromeProfileManager);
        logger.info('ProfileTreeProvider initialized successfully');
    } catch (error: any) {
        logger.error('Error initializing ProfileTreeProvider', error);
    }

    // ========================================
    // COMANDOS BÁSICOS DE INTENTS
    // ========================================
    registerOpenMarkdownPreview(context, logger);
    registerGenerateIntent(context, logger);
    registerOpenIntent(context, logger, metadataManager);
    registerCopyContextToClipboard(context, logger, contextGatherer);
    registerDeleteIntent(context, logger, intentTreeProvider);
    registerAddToIntent(context, logger);
    registerDeleteIntentFromForm(context, logger);
    registerOpenFileInVSCode(context, logger);
    registerRevealInFinder(context, logger);
    registerCreateBTIPProject(context, logger);
    registerGenerateQuestions(context, logger);
    registerSubmitAnswers(context, logger);
    registerIntegrateSnapshot(context, logger);
    registerReloadIntentForm(context, logger);
    registerRegenerateContext(context, logger);

    // ========================================
    // COMANDOS: Chrome Profiles & Browser
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.manageProfiles', () => {
            try {
                ProfileManagerPanel.createOrShow(context.extensionUri, logger, context);
            } catch (error: any) {
                logger.error('Error opening profile manager', error);
                vscode.window.showErrorMessage(`Error abriendo gestor de perfiles: ${error.message}`);
            }
        })
    );

    

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.refreshProfiles', () => {
            try {
                const provider = ProfileTreeProvider.getInstance();
                if (provider) {
                    provider.refresh();
                    vscode.window.showInformationMessage('✅ Perfiles actualizados');
                    logger.info('Chrome profiles refreshed');
                } else {
                    throw new Error('ProfileTreeProvider not initialized');
                }
            } catch (error: any) {
                logger.error('Error refreshing profiles', error);
                vscode.window.showErrorMessage(`Error refrescando perfiles: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.configureIntentProfile', (intent: Intent) => {
            if (intent) {
                configureIntentProfile(intent, context, logger);
            } else {
                vscode.window.showWarningMessage('No intent selected');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.changeIntentProfile', (intent: Intent) => {
            if (intent) {
                changeIntentProfile(intent, context, logger);
            } else {
                vscode.window.showWarningMessage('No intent selected');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.removeIntentProfile', (intent: Intent) => {
            if (intent) {
                removeIntentProfile(intent, context, logger);
            } else {
                vscode.window.showWarningMessage('No intent selected');
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openIntentInBrowser', async (intent?: Intent) => {
            try {
                if (!intent) {
                    const intents = await getAvailableIntents(workspaceFolder);
                    if (intents.length === 0) {
                        vscode.window.showInformationMessage('No hay intents disponibles');
                        return;
                    }
                    const selected = await vscode.window.showQuickPick(
                        intents.map(i => ({ label: i.metadata.name, intent: i })),
                        { placeHolder: 'Selecciona un intent' }
                    );
                    intent = selected?.intent;
                }
                if (intent) {
                    await openIntentInBrowser(intent, context, logger);
                }
            } catch (error: any) {
                logger.error('Error opening intent in browser', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openClaudeInBrowser', () => {
            openProviderInBrowser('claude', context, logger);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openChatGPTInBrowser', () => {
            openProviderInBrowser('chatgpt', context, logger);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openGrokInBrowser', () => {
            openProviderInBrowser('grok', context, logger);
        })
    );

    // ========================================
    // COMANDOS: Nucleus Management
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.showWelcome', () => {
            try {
                welcomeWebview.show();
                logger.info('Welcome view shown');
            } catch (error: any) {
                logger.error('Error showing welcome', error);
                vscode.window.showErrorMessage(`Error mostrando bienvenida: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.createNucleusProject', async () => {
            try {
                welcomeWebview.show();
                logger.info('Create Nucleus flow initiated');
            } catch (error: any) {
                logger.error('Error creating nucleus', error);
                vscode.window.showErrorMessage(`Error creando Nucleus: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.addProjectToNucleus', async (treeItem: any) => {
            try {
                if (!treeItem || !treeItem.data) {
                    vscode.window.showErrorMessage('Error: No se pudo obtener información del Nucleus');
                    return;
                }

                const orgName = treeItem.data.orgName;
                const nucleusPath = treeItem.data.nucleusPath;

                if (!nucleusPath) {
                    vscode.window.showErrorMessage(`No se encontró el Nucleus para ${orgName}`);
                    return;
                }

                await manageProject(nucleusPath, orgName);
            } catch (error: any) {
                logger.error('Error adding project to nucleus', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.linkToNucleus', async (uri?: vscode.Uri) => {
            try {
                await linkToNucleus(uri);
            } catch (error: any) {
                logger.error('Error linking to nucleus', error);
                vscode.window.showErrorMessage(`Error vinculando a Nucleus: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.syncNucleusProjects', () => {
            try {
                nucleusTreeProvider.refresh();
                vscode.window.showInformationMessage('🔄 Nucleus tree actualizado');
                logger.info('Nucleus tree refreshed');
            } catch (error: any) {
                logger.error('Error syncing nucleus projects', error);
                vscode.window.showErrorMessage(`Error sincronizando: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.openNucleusProject', (project: any) => {
            try {
                if (project) {
                    openNucleusProject(project);
                } else {
                    vscode.window.showWarningMessage('No project selected');
                }
            } catch (error: any) {
                logger.error('Error opening nucleus project', error);
                vscode.window.showErrorMessage(`Error abriendo proyecto: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.createNewNucleus', () => {
            try {
                new NucleusSetupPanel(context).show();
                logger.info('Nucleus setup panel opened');
            } catch (error: any) {
                logger.error('Error opening nucleus setup', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.focusRealNucleusView', () => {
            vscode.commands.executeCommand('workbench.view.extension.bloomAiBridge');
        })
    );

    // ========================================
    // COMANDOS: Git Management
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.reviewPendingCommits', async () => {
            try {
                await GitManager.reviewAndCommit();
            } catch (error: any) {
                logger.error('Error reviewing commits', error);
                vscode.window.showErrorMessage(`Error: ${error.message}`);
            }
        })
    );

    // ========================================
    // COMANDO: Reset Registration (DEBUG)
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.resetRegistration', async () => {
            const confirm = await vscode.window.showWarningMessage(
                '⚠️ ¿Estás seguro de que querés resetear el registro?\n\nEsto borrará:\n- Datos de GitHub guardados\n- Configuración de organizaciones\n- Estado de registro',
                { modal: true },
                'Sí, Resetear',
                'Cancelar'
            );

            if (confirm === 'Sí, Resetear') {
                try {
                    await UserManager.init(context).clear();
                    
                    vscode.window.showInformationMessage(
                        '✅ Registro reseteado exitosamente. La ventana se recargará...'
                    );
                    
                    logger.info('Registration reset - Reloading window');
                    
                    // Recargar ventana después de 1 segundo
                    setTimeout(async () => {
                        await vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }, 1000);
                    
                } catch (error: any) {
                    vscode.window.showErrorMessage(`Error reseteando registro: ${error.message}`);
                    logger.error('Error en resetRegistration', error);
                }
            }
        })
    );

    // ========================================
    // ⛓️‍💥 DESVINCULAR NUCLEUS (Botón oficial) – VERSIÓN 100% CORREGIDA
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.unlinkNucleus', async () => {
            const userData = await UserManager.getUserData() as {
                githubOrg: string | null;
                allOrgs: string[];
            } | null;

            if (!userData?.githubOrg) {
                vscode.window.showWarningMessage('Ningún Nucleus vinculado actualmente');
                return;
            }

            const org: string = userData.githubOrg;

            const choice = await vscode.window.showWarningMessage(
                `⛓️‍💥 Desvincular Nucleus de ${org}`,
                { 
                    modal: true, 
                    detail: "El repositorio local y remoto NO se borrarán.\nSolo se quitará del plugin. Podrás volver a levantarlo cuando quieras." 
                },
                'Sí, desvincular',
                'Cancelar'
            );

            if (choice !== 'Sí, desvincular') return;

            // Remover de la lista de organizaciones
            userData.allOrgs = userData.allOrgs.filter((o: string) => o !== org);

            // Si era el activo, pasar al siguiente (o null)
            if (userData.githubOrg === org) {
                userData.githubOrg = userData.allOrgs[0] || null;
            }

            // Guardar cambios
            await context.globalState.update('bloom.user', userData);

            // Actualizar contexto global de VSCode
            await vscode.commands.executeCommand('setContext', 'bloom.isRegistered', userData.githubOrg !== null);

            // Cerrar solo las carpetas relacionadas con este nucleus (corregido 100%)
            const foldersToRemove = vscode.workspace.workspaceFolders?.filter(folder =>
                folder.name.includes(`nucleus-${org}`) || 
                folder.uri.fsPath.includes(`nucleus-${org}`)
            ) ?? [];

            if (foldersToRemove.length > 0) {
                const indices = foldersToRemove.map(f => vscode.workspace.workspaceFolders!.indexOf(f));
                // Borrar de atrás hacia adelante para no romper índices
                for (let i = indices.length - 1; i >= 0; i--) {
                    await vscode.workspace.updateWorkspaceFolders(indices[i], 1);
                }
            }

            // Refresh del árbol
            nucleusTreeProvider.refresh();

            vscode.window.showInformationMessage(`✅ Nucleus ${org} desvinculado correctamente`);
        })
    );

    // ========================================
    // VERIFICACIÓN: Mostrar Welcome en primera instalación
    // ========================================
    const isRegistered = UserManager.init(context).isRegistered();
    
    logger.info(`Estado de registro: ${isRegistered ? 'REGISTRADO' : 'NO REGISTRADO'}`);
    
    if (!isRegistered) {
        logger.info('Primera instalación detectada - Mostrando Welcome en 1 segundo');
        setTimeout(() => {
            try {
                welcomeWebview.show();
            } catch (error: any) {
                logger.error('Error showing welcome on first run', error);
            }
        }, 1000);
    }

    // Actualizar contexto de VSCode
    vscode.commands.executeCommand('setContext', 'bloom.isRegistered', isRegistered);

    logger.info('✅ Bloom BTIP activation complete - All commands registered');
}

/**
 * Registra comandos críticos incluso sin workspace
 */
function registerCriticalCommands(
    context: vscode.ExtensionContext,
    logger: Logger,
    welcomeWebview: WelcomeView
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.showWelcome', () => {
            welcomeWebview.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.createNucleusProject', () => {
            welcomeWebview.show();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.resetRegistration', async () => {
            await UserManager.init(context).clear();
            vscode.window.showInformationMessage('Registro reseteado');
        })
    );

    logger.info('Critical commands registered (no workspace mode)');
}

/**
 * Obtiene intents disponibles en el workspace
 */
async function getAvailableIntents(workspaceFolder: vscode.WorkspaceFolder): Promise<Intent[]> {
    const intentsPath = path.join(workspaceFolder.uri.fsPath, '.bloom', 'intents');
    
    if (!fs.existsSync(intentsPath)) {
        return [];
    }

    const files = fs.readdirSync(intentsPath).filter(f => f.endsWith('.json'));
    const intents: Intent[] = [];

    for (const file of files) {
        try {
            const filePath = path.join(intentsPath, file);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as Intent;
            
            if (data?.metadata?.name) {
                intents.push(data);
            }
        } catch (error) {
            // Skip invalid intent files
            console.warn(`Skipping invalid intent file: ${file}`);
        }
    }
    
    return intents;
}

export function deactivate() {
    // VS Code limpia todo automáticamente
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/managers/userManager.ts
Metadatos: Lenguaje: typescript, Hash MD5: e1825d546d9d902fb76685147c8c91eb

```typescript
// src/managers/userManager.ts
import * as vscode from 'vscode';

export interface BloomUser {
    githubUsername: string;
    githubOrg: string;          
    allOrgs: string[];         
    registeredAt: number;
}

export class UserManager {
    private static instance: UserManager;
    private context: vscode.ExtensionContext;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    static init(context: vscode.ExtensionContext): UserManager {
        if (!UserManager.instance) {
            UserManager.instance = new UserManager(context);
        }
        return UserManager.instance;
    }

    getUser(): BloomUser | null {
        const user = this.context.globalState.get<BloomUser>('bloom.user.v3');
        return user ?? null;
    }

    async saveUser(data: {
        githubUsername: string;
        githubOrg?: string;
        allOrgs?: string[];
    }): Promise<void> {
        const finalUser: BloomUser = {
            githubUsername: data.githubUsername.trim().replace('@', ''),
            githubOrg: (data.githubOrg?.trim() || data.githubUsername.trim().replace('@', '')),
            allOrgs: data.allOrgs || [data.githubUsername.trim().replace('@', '')],
            registeredAt: Date.now()
        };

        await this.context.globalState.update('bloom.user.v3', finalUser);
        await vscode.commands.executeCommand('setContext', 'bloom.isRegistered', true);
    }

    isRegistered(): boolean {
        const user = this.getUser();
        return !!user?.githubUsername && !!user?.allOrgs?.length;
    }

    async clear(): Promise<void> {
        await this.context.globalState.update('bloom.user.v3', undefined);
        await vscode.commands.executeCommand('setContext', 'bloom.isRegistered', false);
    }

    static async getUserData(): Promise<any> {
        const context = this.instance?.context;
        if (!context) return null;
        return context.globalState.get('bloom.user', null);
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/managers/workspaceManager.ts
Metadatos: Lenguaje: typescript, Hash MD5: 779530b637f4d06b8632aff79fad71c3

```typescript
// src/managers/workspaceManager.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface WorkspaceFolder {
    name: string;
    path: string;
}

interface WorkspaceConfig {
    folders: WorkspaceFolder[];
    settings: {
        'bloom.activeNucleus'?: string;
        [key: string]: any;
    };
    extensions?: {
        recommendations: string[];
    };
}

export class WorkspaceManager {
    /**
     * Inicializa workspace al crear Nucleus por primera vez
     * Crea archivo .code-workspace en el parent folder
     */
    static async initializeWorkspace(nucleusPath: string): Promise<void> {
        const nucleusName = path.basename(nucleusPath);
        const parentFolder = path.dirname(nucleusPath);
        const orgName = nucleusName.replace('nucleus-', '');
        const workspaceFilePath = path.join(parentFolder, `${orgName}-workspace.code-workspace`);

        // Verificar si ya existe workspace
        if (fs.existsSync(workspaceFilePath)) {
            console.log(`Workspace file already exists: ${workspaceFilePath}`);
            return;
        }

        // Crear configuración inicial del workspace
        const workspaceConfig: WorkspaceConfig = {
            folders: [
                {
                    name: `🏢 ${nucleusName}`,
                    path: `./${nucleusName}`
                }
            ],
            settings: {                
                'bloom.activeNucleus': nucleusName,
                'window.title': `${orgName} Workspace`,
                'files.exclude': {
                    '**/.git': true,
                    '**/.DS_Store': true,
                    '**/node_modules': true
                }
            },
            extensions: {
                recommendations: ['bloom.bloom-btip-plugin']
            }
        };

        // Guardar archivo .code-workspace
        fs.writeFileSync(
            workspaceFilePath,
            JSON.stringify(workspaceConfig, null, 2),
            'utf-8'
        );

        console.log(`✅ Workspace file created: ${workspaceFilePath}`);

        // Ofrecer abrir el workspace
        const openWorkspace = await vscode.window.showInformationMessage(
            `Workspace creado: ${path.basename(workspaceFilePath)}`,
            'Abrir Workspace',
            'Más Tarde'
        );

        if (openWorkspace === 'Abrir Workspace') {
            await vscode.commands.executeCommand(
                'vscode.openFolder',
                vscode.Uri.file(workspaceFilePath),
                false // No nueva ventana - reemplaza actual
            );
        }
    }

    /**
     * Agrega un proyecto al workspace actual
     * Si no hay workspace, crea uno nuevo
     */
    static async addProjectToWorkspace(projectPath: string, projectName?: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const projectUri = vscode.Uri.file(projectPath);

        // Verificar si ya está en el workspace
        const alreadyInWorkspace = workspaceFolders.some(
            folder => folder.uri.fsPath === projectPath
        );

        if (alreadyInWorkspace) {
            console.log(`Project already in workspace: ${projectPath}`);
            
            // Enfocar en el explorador
            await vscode.commands.executeCommand(
                'revealInExplorer',
                projectUri
            );
            return;
        }

        // Detectar estrategia para icono
        const icon = await this.getProjectIcon(projectPath);
        const displayName = projectName || path.basename(projectPath);

        // Agregar al workspace usando API nativa
        const workspaceEdit = vscode.workspace.updateWorkspaceFolders(
            workspaceFolders.length, // Insertar al final
            0, // No eliminar ninguno
            {
                uri: projectUri,
                name: `${icon} ${displayName}`
            }
        );

        if (workspaceEdit) {
            console.log(`✅ Project added to workspace: ${projectPath}`);
            
            // Actualizar archivo .code-workspace si existe
            await this.syncWorkspaceFile();
            
            // Enfocar en el nuevo proyecto
            setTimeout(async () => {
                await vscode.commands.executeCommand(
                    'revealInExplorer',
                    projectUri
                );
            }, 500);
        } else {
            console.error(`❌ Failed to add project to workspace: ${projectPath}`);
            
            // Fallback: ofrecer abrir manualmente
            const openManually = await vscode.window.showWarningMessage(
                `No se pudo agregar "${displayName}" al workspace actual.`,
                'Abrir en Nueva Ventana',
                'Cancelar'
            );

            if (openManually === 'Abrir en Nueva Ventana') {
                await vscode.commands.executeCommand(
                    'vscode.openFolder',
                    projectUri,
                    true
                );
            }
        }
    }

    /**
     * Remueve un proyecto del workspace
     */
    static async removeProjectFromWorkspace(projectPath: string): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        
        const folderIndex = workspaceFolders.findIndex(
            folder => folder.uri.fsPath === projectPath
        );

        if (folderIndex === -1) {
            console.log(`Project not in workspace: ${projectPath}`);
            return;
        }

        const workspaceEdit = vscode.workspace.updateWorkspaceFolders(
            folderIndex, // Índice a remover
            1 // Cantidad a remover
        );

        if (workspaceEdit) {
            console.log(`✅ Project removed from workspace: ${projectPath}`);
            await this.syncWorkspaceFile();
        }
    }

    /**
     * Lee la configuración del workspace actual
     */
    static getWorkspaceConfig(): WorkspaceConfig | null {
        const workspaceFile = vscode.workspace.workspaceFile;
        
        if (!workspaceFile) {
            return null;
        }

        try {
            const content = fs.readFileSync(workspaceFile.fsPath, 'utf-8');
            return JSON.parse(content) as WorkspaceConfig;
        } catch (error) {
            console.error('Error reading workspace config:', error);
            return null;
        }
    }

    /**
     * Sincroniza el archivo .code-workspace con el estado actual
     */
    private static async syncWorkspaceFile(): Promise<void> {
        const workspaceFile = vscode.workspace.workspaceFile;
        
        if (!workspaceFile) {
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders || [];
        const workspaceRoot = path.dirname(workspaceFile.fsPath);

        try {
            // Leer config existente
            let config: WorkspaceConfig;
            
            if (fs.existsSync(workspaceFile.fsPath)) {
                const content = fs.readFileSync(workspaceFile.fsPath, 'utf-8');
                config = JSON.parse(content);
            } else {
                config = { folders: [], settings: {} };
            }

            // Actualizar folders con estado actual
            config.folders = workspaceFolders.map(folder => {
                const relativePath = path.relative(workspaceRoot, folder.uri.fsPath);
                return {
                    name: folder.name,
                    path: relativePath.startsWith('.') ? relativePath : `./${relativePath}`
                };
            });

            // Guardar
            fs.writeFileSync(
                workspaceFile.fsPath,
                JSON.stringify(config, null, 2),
                'utf-8'
            );

            console.log(`✅ Workspace file synchronized`);
        } catch (error) {
            console.error('Error syncing workspace file:', error);
        }
    }

    /**
     * Detecta el icono apropiado según el tipo de proyecto
     */
    private static async getProjectIcon(projectPath: string): Promise<string> {
        // Importar ProjectDetector dinámicamente para evitar dependencias circulares
        try {
            const { ProjectDetector } = await import('../strategies/ProjectDetector');
            const strategy = await ProjectDetector.getStrategyName(projectPath);
            
            const icons: Record<string, string> = {
                'android': '📱',
                'ios': '🍎',
                'react-web': '🌐',
                'web': '🌐',
                'node': '⚙️',
                'python-flask': '🐍',
                'php-laravel': '🐘',
                'nucleus': '🏢',
                'generic': '📦'
            };
            
            return icons[strategy] || '📦';
        } catch {
            return '📦';
        }
    }

    /**
     * Verifica si estamos en un multi-root workspace
     */
    static isMultiRootWorkspace(): boolean {
        return (vscode.workspace.workspaceFolders?.length || 0) > 1;
    }

    /**
     * Obtiene el path del Nucleus actual en el workspace
     */
    static getCurrentNucleusPath(): string | null {
        const folders = vscode.workspace.workspaceFolders || [];
        
        for (const folder of folders) {
            const nucleusConfigPath = path.join(
                folder.uri.fsPath,
                '.bloom',
                'core',
                'nucleus-config.json'
            );
            
            if (fs.existsSync(nucleusConfigPath)) {
                return folder.uri.fsPath;
            }
        }
        
        return null;
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/models/intent.ts
Metadatos: Lenguaje: typescript, Hash MD5: d26b8a88a944883e84598f03440b7776

```typescript
import * as vscode from 'vscode';

// ============================================
// TIPOS BASE
// ============================================

export type IntentStatus = 'draft' | 'in-progress' | 'completed' | 'archived';

export type FileCategory = 'code' | 'config' | 'docs' | 'test' | 'asset' | 'other';

// Strategies
export type ProjectType = 
    | 'android' 
    | 'ios' 
    | 'react-web' 
    | 'web'
    | 'node'
    | 'python-flask'
    | 'php-laravel'
    | 'nucleus'        
    | 'generic';

// Workflow stages
export type IntentWorkflowStage =
    | 'draft'
    | 'intent-generated'
    | 'questions-ready'
    | 'answers-submitted'
    | 'snapshot-downloaded'
    | 'integrated';

// Question types
export type QuestionCategory =
    | 'architecture'
    | 'design'
    | 'implementation'
    | 'testing'
    | 'security';

export type QuestionPriority = 'high' | 'medium' | 'low';

export type AnswerType =
    | 'multiple-choice'
    | 'free-text'
    | 'boolean'
    | 'code-snippet';

// ============================================
// NUEVAS INTERFACES: WORKFLOW
// ============================================

export interface Question {
    id: string;
    category: QuestionCategory;
    priority: QuestionPriority;
    text: string;
    answerType: AnswerType;
    options?: string[];
    userAnswer?: string;
    metadata?: {
        rationale?: string;
        impact?: string;
    };
}

export interface IntentWorkflow {
    stage: IntentWorkflowStage;
    questions: Question[];
    questionsArtifactUrl?: string;
    snapshotPath?: string;
    integrationStatus?: 'pending' | 'in-progress' | 'success' | 'failed';
    integrationReport?: {
        filesCreated: string[];
        filesModified: string[];
        conflicts: string[];
    };
}

// ============================================
// INTERFACE PRINCIPAL: FORMULARIO
// ============================================

export interface IntentFormData {
    name: string;
    problem: string;
    expectedOutput: string;
    currentBehavior: string[];
    desiredBehavior: string[];
    considerations: string;
    selectedFiles: string[];
}

// ============================================
// METADATA: Información de archivos
// ============================================

export interface FilesMetadata {
    intentFile: string;
    codebaseFile: string;
    filesIncluded: string[];
    filesCount: number;
    totalSize: number;
}

// ============================================
// TOKENS: Estadísticas de tokens
// ============================================

export interface TokenStats {
    estimated: number;
    limit: number;
    percentage: number;
}

// ============================================
// CONTENT: Contenido del intent
// ============================================

export interface IntentContent {
    problem: string;
    expectedOutput: string;
    currentBehavior: string[];
    desiredBehavior: string[];
    considerations: string;
}

// ============================================
// METADATA COMPLETA: Persistencia
// ============================================

export interface IntentMetadata {
    id: string;
    name: string;
    displayName: string;
    created: string;
    updated: string;
    status: IntentStatus;
    projectType?: ProjectType;
    version: 'free' | 'pro';

    files: FilesMetadata;
    content: IntentContent;
    tokens: TokenStats;
    tags?: string[];

    workflow: IntentWorkflow;

    stats: {
        timesOpened: number;
        lastOpened: string | null;
        estimatedTokens: number;
    };

    bloomVersion: string;
}

// ============================================================================
// CLAUDE BRIDGE AUTOMATION: Gestión de perfiles y automatización de Claude.ai
// ============================================================================

/**
 * Configuración de profile de Chrome para un intent
 */
export interface IntentProfileConfig {
    profileName: string;              // Nombre del profile de Chrome ("Default", "Profile 1", etc.)
    provider: 'claude' | 'chatgpt' | 'grok';  // Provider principal
    account?: string;                  // Email de la cuenta (opcional)
}

/**
 * Información de conversación activa
 */
export interface ActiveConversation {
    conversationId: string;
    url: string;
    lastAccessed: Date;
}

// ============================================
// INTENT: Entidad completa
// ============================================

export interface Intent {
    folderUri: vscode.Uri;
    metadata: IntentMetadata;
    
    // Configuración de profile
    profileConfig?: IntentProfileConfig;
    
    // Conversaciones activas por provider
    activeConversations?: {
        claude?: ActiveConversation;
        chatgpt?: ActiveConversation;
        grok?: ActiveConversation;
    };
}

// ============================================
// HELPERS: Conversión FormData → Content
// ============================================

export function formDataToContent(formData: IntentFormData): IntentContent {
    return {
        problem: formData.problem,
        expectedOutput: formData.expectedOutput,
        currentBehavior: formData.currentBehavior,
        desiredBehavior: formData.desiredBehavior,
        considerations: formData.considerations
    };
}

// ============================================
// HELPERS: Crear metadata inicial
// ============================================

export function createInitialMetadata(
    formData: IntentFormData,
    options: {
        projectType?: ProjectType;
        version: 'free' | 'pro';
        filesCount: number;
        totalSize: number;
        estimatedTokens: number;
    }
): Omit<IntentMetadata, 'id' | 'created' | 'updated'> {
    return {
        name: formData.name,
        displayName: generateDisplayName(formData.name),
        status: 'draft',
        projectType: options.projectType,
        version: options.version,

        files: {
            intentFile: 'intent.bl',
            codebaseFile: options.version === 'free' ? 'codebase.md' : 'codebase.tar.gz',
            filesIncluded: formData.selectedFiles,
            filesCount: options.filesCount,
            totalSize: options.totalSize
        },

        content: formDataToContent(formData),

        tokens: {
            estimated: options.estimatedTokens,
            limit: 100000,
            percentage: (options.estimatedTokens / 100000) * 100
        },

        tags: [],

        workflow: {
            stage: 'draft',
            questions: [],
            integrationStatus: 'pending'
        },

        stats: {
            timesOpened: 0,
            lastOpened: null,
            estimatedTokens: options.estimatedTokens
        },

        bloomVersion: '1.0.0'
    };
}

function generateDisplayName(name: string): string {
    return name
        .replace(/-/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}

// ============================================
// TOKEN ESTIMATOR: Análisis de payload
// ============================================

export interface ModelLimit {
    modelName: string;
    contextWindow: number;
    reserved: number;
    available: number;
    used: number;
    remaining: number;
    usagePercent: number;
    status: 'safe' | 'warning' | 'critical';
}

export interface Recommendation {
    severity: 'ok' | 'warning' | 'critical';
    model: string;
    message: string;
}

export interface PayloadAnalysis {
    totalChars: number;
    estimatedTokens: number;
    limits: Record<string, ModelLimit>;
    recommendations: Recommendation[];
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/providers/intentTreeProvider.ts
Metadatos: Lenguaje: typescript, Hash MD5: 33b61fad1cbd6542a56b594bc6880197

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs'; // Agregado para fs.existsSync
import { Intent, IntentMetadata, IntentStatus } from '../models/intent';
import { Logger } from '../utils/logger';
import { MetadataManager } from '../core/metadataManager';
import { joinPath } from '../utils/uriHelper';

export class IntentTreeProvider implements vscode.TreeDataProvider<IntentTreeItem | IntentGroupItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<IntentTreeItem | IntentGroupItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
    
    constructor(
        private workspaceFolder: vscode.WorkspaceFolder,
        private logger: Logger,
        private metadataManager: MetadataManager
    ) {}
    
    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }
    
     getTreeItem(element: IntentTreeItem | IntentGroupItem): vscode.TreeItem {
        return element;
    }
    
    async getChildren(element?: IntentTreeItem | IntentGroupItem): Promise<Array<IntentTreeItem | IntentGroupItem>> {
        if (!element) {
            return [
                new IntentGroupItem('in-progress', 'In Progress', this.workspaceFolder),
                new IntentGroupItem('completed', 'Completed', this.workspaceFolder),
                new IntentGroupItem('archived', 'Archived', this.workspaceFolder)
            ];
        }
        
        if (element instanceof IntentGroupItem) {
            const intents = await this.loadIntentsByStatus(element.status);
            return intents.map(intent => new IntentTreeItem(intent));
        }
        
        return [];
    }
    
    private async loadIntentsByStatus(status: IntentStatus): Promise<Intent[]> {
        const intentsDir = joinPath(
            this.workspaceFolder.uri,
            '.bloom',
            'intents'
        );
        
        // Nuevo: Check si el directorio existe para evitar ENOENT
        const intentsPath = intentsDir.fsPath;
        if (!fs.existsSync(intentsPath)) {
            this.logger.info(`Intents directory not found: ${intentsPath} - Returning empty list.`);
            return [];
        }
        
        try {
            const entries = await vscode.workspace.fs.readDirectory(intentsDir);
            const intents: Intent[] = [];
            
            for (const [name, type] of entries) {
                if (type === vscode.FileType.Directory) {
                    const intentFolder = joinPath(intentsDir, name);
                    const metadata = await this.metadataManager.read(intentFolder);
                    
                    if (metadata && metadata.status === status) {
                        intents.push({ metadata, folderUri: intentFolder });
                    }
                }
            }
            
            return intents.sort(
                (a, b) => new Date(b.metadata.updated).getTime() - new Date(a.metadata.updated).getTime()
            );
        } catch (error) {
            this.logger.error('Error al cargar intents', error as Error);
            return [];
        }
    }

    // Nuevo método para nesting en Nucleus
    public async getIntents(): Promise<IntentTreeItem[]> {
        const allIntents: Intent[] = [];
        const statuses: IntentStatus[] = ['in-progress', 'completed', 'archived'];
        for (const status of statuses) {
            const intents = await this.loadIntentsByStatus(status);
            allIntents.push(...intents);
        }
        return allIntents.map(intent => new IntentTreeItem(intent));
    }
}

export class IntentGroupItem extends vscode.TreeItem {
    constructor(
        public readonly status: IntentStatus,
        label: string,
        private workspaceFolder: vscode.WorkspaceFolder
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'intentGroup';
        this.iconPath = vscode.ThemeIcon.Folder;
    }
}

export class IntentTreeItem extends vscode.TreeItem {
    constructor(public readonly intent: Intent) {
        super(
            intent.metadata.displayName || intent.metadata.name,
            vscode.TreeItemCollapsibleState.None
        );
        
        this.contextValue = 'intent';
        this.tooltip = this.buildTooltip();
        this.description = `(${intent.metadata.files.filesCount} archivos)`;
        this.iconPath = vscode.ThemeIcon.File;
        
        this.command = {
            command: 'bloom.openIntent',
            title: 'Open Intent',
            arguments: [this]
        };
    }
    
    private buildTooltip(): string {
        const meta = this.intent.metadata;
        return `${meta.displayName || meta.name}\nArchivos: ${meta.files.filesCount}\nCreado: ${new Date(meta.created).toLocaleDateString()}\nTags: ${meta.tags?.join(', ') || 'ninguno'}`;
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/providers/nucleusTreeProvider.ts
Metadatos: Lenguaje: typescript, Hash MD5: 8ca0cce5e2433796f67da96dede04957

```typescript
// src/providers/nucleusTreeProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { NucleusConfig, LinkedProject, loadNucleusConfig } from '../models/bloomConfig';
import { Logger } from '../utils/logger';
import { UserManager } from '../managers/userManager';

export class NucleusTreeProvider implements vscode.TreeDataProvider<NucleusTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<NucleusTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private configs: Map<string, NucleusConfig> = new Map();
    private logger = new Logger();

    constructor(
        private workspaceRoot: string | undefined,
        private context: vscode.ExtensionContext
    ) {
        this.refresh();
    }

    refresh(): void {
        this.detectAllNucleus();
        this._onDidChangeTreeData.fire(undefined);
    }

    private detectAllNucleus(): void {
        this.configs.clear();
        const user = UserManager.init(this.context).getUser();
        if (!user) return;

        const orgs = user.allOrgs || [user.githubUsername];

        for (const org of orgs) {
            const config = this.detectNucleusForOrg(org);
            if (config) {
                this.configs.set(org, config);
            }
        }
    }

    private detectNucleusForOrg(org: string): NucleusConfig | null {
        if (!this.workspaceRoot) return null;

        // Caso 1: Workspace actual ES un Nucleus
        const bloomPath = path.join(this.workspaceRoot, '.bloom');
        const configPath = path.join(bloomPath, 'core', 'nucleus-config.json');

        if (fs.existsSync(configPath)) {
            const config = loadNucleusConfig(bloomPath);
            if (config?.organization?.name === org) {
                return config;
            }
        }

        // Caso 2: Workspace tiene link a Nucleus
        const linkPath = path.join(bloomPath, 'nucleus.json');
        if (fs.existsSync(linkPath)) {
            try {
                const link = JSON.parse(fs.readFileSync(linkPath, 'utf-8'));
                if (link.organizationName === org && link.nucleusPath) {
                    const fullPath = path.resolve(this.workspaceRoot, link.nucleusPath);
                    if (fs.existsSync(fullPath)) {
                        return loadNucleusConfig(path.join(fullPath, '.bloom'));
                    }
                }
            } catch {}
        }

        // Caso 3: Buscar en parent directory
        const parentDir = path.dirname(this.workspaceRoot);
        const nucleusName = `nucleus-${org}`;
        const nucleusPath = path.join(parentDir, nucleusName);
        
        if (fs.existsSync(nucleusPath)) {
            const nucleusBloomPath = path.join(nucleusPath, '.bloom');
            if (fs.existsSync(nucleusBloomPath)) {
                return loadNucleusConfig(nucleusBloomPath);
            }
        }

        return null;
    }

    getTreeItem(element: NucleusTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: NucleusTreeItem): Promise<NucleusTreeItem[]> {
        console.log('[NucleusTree] getChildren called, element:', element?.type);
        
        if (!element) {
            const items: NucleusTreeItem[] = [];

            console.log('[NucleusTree] Configs detected:', this.configs.size);

            // Mostrar organizaciones con Nucleus
            for (const [org, config] of this.configs.entries()) {
                console.log('[NucleusTree] Processing org:', org, 'projects:', config.projects.length);
                
                // Encontrar el path del Nucleus
                const nucleusPath = this.findNucleusPath(org);
                
                console.log('[NucleusTree] Nucleus path for', org, ':', nucleusPath);
                
                const orgItem = new NucleusTreeItem(
                    `${org} (${config.projects.length} proyecto${config.projects.length !== 1 ? 's' : ''})`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'org',
                    { orgName: org, nucleusPath: nucleusPath, config: config }
                );
                
                // IMPORTANTE: Agregar tooltip para que el usuario sepa que puede agregar
                orgItem.tooltip = `Click derecho o en el ícono + para agregar proyectos`;
                
                console.log('[NucleusTree] orgItem contextValue:', orgItem.contextValue);
                
                items.push(orgItem);
            }

            // Solo mostrar si no hay Nucleus detectados
            if (items.length === 0) {
                console.log('[NucleusTree] No configs found, showing info message');
                items.push(new NucleusTreeItem(
                    'No hay Nucleus en este workspace',
                    vscode.TreeItemCollapsibleState.None,
                    'info'
                ));
            }

            console.log('[NucleusTree] Returning', items.length, 'items');
            return items;
        }

        if (element.type === 'org') {
            const org = element.data.orgName;
            const config = this.configs.get(org);
            if (!config?.projects) return [];
            
            return config.projects.map(p =>
                new NucleusTreeItem(
                    `${this.getProjectIcon(p.strategy)} ${p.displayName || p.name}`,
                    vscode.TreeItemCollapsibleState.None,
                    'project',
                    p,
                    {
                        command: 'bloom.openNucleusProject',
                        title: 'Abrir proyecto',
                        arguments: [p]
                    }
                )
            );
        }

        return [];
    }

    private findNucleusPath(org: string): string | undefined {
        if (!this.workspaceRoot) return undefined;

        // Intentar workspace actual
        const localBloom = path.join(this.workspaceRoot, '.bloom', 'core', 'nucleus-config.json');
        if (fs.existsSync(localBloom)) {
            return this.workspaceRoot;
        }

        // Intentar parent directory
        const parentDir = path.dirname(this.workspaceRoot);
        const nucleusPath = path.join(parentDir, `nucleus-${org}`);
        if (fs.existsSync(nucleusPath)) {
            return nucleusPath;
        }

        return undefined;
    }

    private getProjectIcon(strategy: string): string {
        const icons: Record<string, string> = {
            'android': '📱',
            'ios': '🍎',
            'react-web': '🌐',
            'web': '🌐',
            'node': '⚙️',
            'python-flask': '🐍',
            'php-laravel': '🐘',
            'generic': '📦'
        };
        return icons[strategy] || '📦';
    }

    // NUEVO: Método público para obtener nucleusPath
    public getNucleusPath(org: string): string | undefined {
        return this.findNucleusPath(org);
    }
}

class NucleusTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'org' | 'project' | 'info',
        public readonly data?: any,
        command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.command = command;

        switch (type) {
            case 'org':
                this.iconPath = new vscode.ThemeIcon('organization');
                this.contextValue = 'nucleusOrg';
                break;
            case 'project':
                this.iconPath = new vscode.ThemeIcon('folder');
                this.contextValue = 'nucleusProject';
                this.tooltip = `${data.name} - ${data.strategy}`;
                break;
            case 'info':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
        }
    }
}

export async function openNucleusProject(project: LinkedProject): Promise<void> {
    try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        // Intentar encontrar el proyecto
        let projectPath: string | null = null;
        
        // 1. Relativo al workspace actual
        const relativePath = path.join(workspaceRoot, project.localPath);
        if (fs.existsSync(relativePath)) {
            projectPath = relativePath;
        } else {
            // 2. Relativo al parent directory
            const parentDir = path.dirname(workspaceRoot);
            const parentRelativePath = path.join(parentDir, project.localPath);
            if (fs.existsSync(parentRelativePath)) {
                projectPath = parentRelativePath;
            }
        }

        if (!projectPath) {
            const browse = await vscode.window.showWarningMessage(
                `No se encontró el proyecto en: ${project.localPath}`,
                'Buscar Manualmente',
                'Cancelar'
            );

            if (browse === 'Buscar Manualmente') {
                const selected = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: `Seleccionar carpeta de ${project.name}`,
                    title: `Localizar ${project.displayName}`
                });

                if (selected && selected.length > 0) {
                    projectPath = selected[0].fsPath;
                }
            }

            if (!projectPath) return;
        }

        // ✅ NUEVO: Agregar al workspace en lugar de abrir nueva ventana
        const { WorkspaceManager } = await import('../managers/workspaceManager');
        await WorkspaceManager.addProjectToWorkspace(projectPath, project.displayName);

    } catch (error: any) {
        vscode.window.showErrorMessage(`Error abriendo proyecto: ${error.message}`);
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/ui/welcome/welcomeView.ts
Metadatos: Lenguaje: typescript, Hash MD5: fd7c838c62d490d9b5318a302ca6e092

```typescript
// src/ui/welcome/welcomeView.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { UserManager } from '../../managers/userManager';
import { getUserOrgs } from '../../utils/githubApi';
import { getCurrentGitHubUser, getGitHubTokenFromSession } from '../../utils/githubOAuth';
import { GitOrchestrator, NucleusResult } from '../../core/gitOrchestrator';
import { Logger } from '../../utils/logger';
import { PythonScriptRunner } from '../../core/pythonScriptRunner';

export class WelcomeView {
    private panel: vscode.WebviewPanel | undefined;

    constructor(private context: vscode.ExtensionContext) {}

    show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'bloomWelcome',
            'Bienvenido a Bloom',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'ui', 'welcome'))]
            }
        );

        this.panel.webview.html = this.getHtml();
        this.panel.onDidDispose(() => { this.panel = undefined; });

        this.panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'authenticate':
                    await this.authenticateAndFillForm();
                    break;
                case 'createNucleus':
                    await this.createNucleus(msg.githubOrg);
                    break;
            }
        });
    }

    private async authenticateAndFillForm() {
        try {
            vscode.window.showInformationMessage('Conectando con GitHub...');

            const user = await getCurrentGitHubUser();
            const orgs = await getUserOrgs();

            this.panel?.webview.postMessage({
                command: 'userAuthenticated',
                name: user.name || user.login,
                email: user.email || 'email@privado.com',
                username: user.login,
                orgs: orgs
            });

        } catch (err: any) {
            this.panel?.webview.postMessage({
                command: 'error',
                text: err.message || 'No se pudo conectar con GitHub'
            });
        }
    }

    private async createNucleus(githubOrg?: string) {
        try {
            // 1. GUARDAR USUARIO EN GLOBALSTATE
            const user = await getCurrentGitHubUser();
            const orgs = await getUserOrgs();

            await UserManager.init(this.context).saveUser({
                githubUsername: user.login,
                githubOrg: githubOrg || user.login,
                allOrgs: [user.login, ...orgs.map(o => o.login)]
            });

            // 2. OBTENER TOKEN FRESCO DESDE SESIÓN DE VSCODE
            const token = await getGitHubTokenFromSession();
            if (!token) {
                throw new Error('No GitHub token available. Please authenticate again.');
            }

            // 3. CREAR ORCHESTRATOR
            const logger = new Logger();
            const orchestrator = new GitOrchestrator(
                token,
                logger,
                new PythonScriptRunner(this.context, logger)
            );

            // 4. DETECTAR ESTADO
            const status = await orchestrator.detectNucleusStatus(githubOrg || user.login);

            // 5. ELEGIR ACCIÓN SEGÚN ESTADO
            let result: NucleusResult;

            if (status.location === 'none') {
                // Crear nuevo
                const folder = await vscode.window.showOpenDialog({
                    canSelectFolders: true,
                    canSelectFiles: false,
                    canSelectMany: false,
                    title: 'Seleccionar carpeta parent para Nucleus',
                    openLabel: 'Seleccionar'
                });
                
                if (!folder || folder.length === 0) {
                    vscode.window.showWarningMessage('Creación cancelada');
                    return;
                }
                
                result = await orchestrator.createNucleus(
                    githubOrg || user.login,
                    folder[0].fsPath
                );

            } else if (status.location === 'remote') {
                // Clonar
                const folder = await vscode.window.showOpenDialog({
                    canSelectFolders: true,
                    canSelectFiles: false,
                    canSelectMany: false,
                    title: 'Seleccionar carpeta donde clonar',
                    openLabel: 'Seleccionar'
                });
                
                if (!folder || folder.length === 0) {
                    vscode.window.showWarningMessage('Clonación cancelada');
                    return;
                }
                
                result = await orchestrator.cloneNucleus(
                    githubOrg || user.login,
                    folder[0].fsPath
                );

            } else if (status.location === 'both' || status.location === 'local') {
                // Vincular existente
                if (!status.localPath) {
                    throw new Error('Local path not found in status');
                }
                
                result = await orchestrator.linkNucleus(
                    status.localPath,
                    githubOrg || user.login
                );
            } else {
                throw new Error('Unknown nucleus status');
            }

            // 6. MOSTRAR RESULTADO
            if (result.success) {
                this.panel?.webview.postMessage({
                    command: 'nucleusCreated',
                    message: result.message
                });
                
                setTimeout(() => {
                    this.panel?.dispose();
                    vscode.commands.executeCommand('bloom.syncNucleusProjects');
                }, 2000);
            } else {
                throw new Error(result.error || 'Error desconocido');
            }

        } catch (err: any) {
            this.panel?.webview.postMessage({
                command: 'error',
                text: err.message
            });
            
            vscode.window.showErrorMessage(`Error creando Nucleus: ${err.message}`);
        }
    }

    private getHtml(): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { 
            font-family: var(--vscode-font-family); 
            color: var(--vscode-foreground); 
            background: var(--vscode-editor-background); 
            padding: 40px;
            max-width: 600px;
            margin: 0 auto;
        }
        h1 { 
            font-size: 32px; 
            margin-bottom: 10px;
            color: var(--vscode-textLink-foreground);
        }
        p { 
            margin-bottom: 20px;
            line-height: 1.6;
        }
        select, input { 
            width: 100%; 
            padding: 12px; 
            margin-bottom: 15px; 
            border-radius: 4px; 
            border: 1px solid var(--vscode-input-border);
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
        }
        button { 
            padding: 12px 24px; 
            border-radius: 4px; 
            background: var(--vscode-button-background); 
            color: var(--vscode-button-foreground); 
            border: none; 
            cursor: pointer; 
            font-weight: 600;
            width: 100%;
            margin: 8px 0;
        }
        button:hover { 
            background: var(--vscode-button-hoverBackground); 
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
        }
        #status {
            padding: 12px;
            border-radius: 4px;
            margin-top: 20px;
            display: none;
        }
        #status.success {
            background: rgba(76, 201, 176, 0.2);
            border-left: 3px solid #4ec9b0;
            display: block;
        }
        #status.error {
            background: rgba(244, 135, 113, 0.2);
            border-left: 3px solid #f48771;
            display: block;
        }
    </style>
</head>
<body>
    <h1>🌸 Bienvenido a Bloom</h1>
    <p>Conectá con GitHub para comenzar a usar Bloom BTIP y gestionar tus proyectos.</p>

    <button id="authBtn">Conectar con GitHub</button>

    <div id="formContainer" style="display:none;">
        <div class="form-group">
            <label>Nombre</label>
            <input type="text" id="name" readonly />
        </div>

        <div class="form-group">
            <label>Email</label>
            <input type="text" id="email" readonly />
        </div>

        <div class="form-group">
            <label>Usuario de GitHub</label>
            <input type="text" id="username" readonly />
        </div>

        <div class="form-group">
            <label>Selecciona Organización</label>
            <select id="org">
                <option value="">Selecciona una organización</option>
            </select>
        </div>

        <button id="createBtn" disabled>Crear Nucleus</button>
    </div>

    <div id="status"></div>

    <script>
        const vscode = acquireVsCodeApi();

        document.getElementById('authBtn').onclick = () => {
            vscode.postMessage({ command: 'authenticate' });
        };

        document.getElementById('org').onchange = () => {
            const org = document.getElementById('org').value;
            document.getElementById('createBtn').disabled = !org;
        };

        document.getElementById('createBtn').onclick = () => {
            const org = document.getElementById('org').value;
            vscode.postMessage({ command: 'createNucleus', githubOrg: org });
        };

        window.addEventListener('message', e => {
            const msg = e.data;
            
            if (msg.command === 'userAuthenticated') {
                document.getElementById('name').value = msg.name;
                document.getElementById('email').value = msg.email;
                document.getElementById('username').value = msg.username;
                
                const select = document.getElementById('org');
                select.innerHTML = '<option value="">Selecciona una organización</option>';
                
                // Agregar usuario personal
                const personalOpt = document.createElement('option');
                personalOpt.value = msg.username;
                personalOpt.textContent = msg.username + ' (Personal)';
                select.appendChild(personalOpt);
                
                // Agregar organizaciones
                msg.orgs.forEach(o => {
                    const opt = document.createElement('option');
                    opt.value = o.login;
                    opt.textContent = o.login;
                    select.appendChild(opt);
                });
                
                document.getElementById('formContainer').style.display = 'block';
                document.getElementById('authBtn').style.display = 'none';
            }
            
            if (msg.command === 'nucleusCreated') {
                const status = document.getElementById('status');
                status.textContent = msg.message;
                status.className = 'success';
            }
            
            if (msg.command === 'error') {
                const status = document.getElementById('status');
                status.textContent = msg.text;
                status.className = 'error';
            }
        });
    </script>
</body>
</html>
        `;
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/utils/gitManager.ts
Metadatos: Lenguaje: typescript, Hash MD5: 862e9ca23f4c222adc322625a141f59e

```typescript
// src/utils/gitManager.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../utils/logger';

const execAsync = promisify(exec);

export interface GitChange {
    file: string;
    status: 'added' | 'modified' | 'deleted';
}

export interface PendingCommit {
    repoPath: string;
    repoName: string;
    message: string;
    changes: GitChange[];
    timestamp: number;
}

export class GitManager {
    private static pendingCommits: PendingCommit[] = [];
    private static statusBarItem: vscode.StatusBarItem;
    private static logger: Logger;

    static initialize(context: vscode.ExtensionContext) {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );
        this.statusBarItem.command = 'bloom.reviewPendingCommits';
        context.subscriptions.push(this.statusBarItem);
        this.updateStatusBar();
    }

    /**
     * Registra un commit pendiente SIN ejecutarlo
     */
    static async queueCommit(
        repoPath: string,
        message: string,
        files?: string[]
    ): Promise<void> {
        const repoName = path.basename(repoPath);
        
        // Detectar cambios
        const changes = await this.getChanges(repoPath, files);
        
        if (changes.length === 0) {
            return; // No hay nada que commitear
        }

        // Agregar a la cola
        this.pendingCommits.push({
            repoPath,
            repoName,
            message,
            changes,
            timestamp: Date.now()
        });

        this.updateStatusBar();
        this.showNotification(repoName, changes.length);
    }

    /**
     * Obtiene cambios en el repositorio
     */
    private static async getChanges(
        repoPath: string,
        files?: string[]
    ): Promise<GitChange[]> {
        try {
            const { stdout } = await execAsync('git status --porcelain', {
                cwd: repoPath
            });

            if (!stdout.trim()) {
                return [];
            }

            const lines = stdout.trim().split('\n');
            const changes: GitChange[] = [];

            for (const line of lines) {
                const status = line.substring(0, 2).trim();
                const file = line.substring(3);

                // Si se especificaron archivos, filtrar
                if (files && files.length > 0) {
                    if (!files.some(f => file.includes(f))) {
                        continue;
                    }
                }

                let changeStatus: 'added' | 'modified' | 'deleted';
                if (status.includes('A')) changeStatus = 'added';
                else if (status.includes('D')) changeStatus = 'deleted';
                else changeStatus = 'modified';

                changes.push({ file, status: changeStatus });
            }

            return changes;
        } catch (error) {
            console.error('Error getting git changes:', error);
            return [];
        }
    }

    /**
     * Muestra notificación de cambios pendientes
     */
    private static showNotification(repoName: string, changeCount: number) {
        const message = `💾 ${changeCount} cambio(s) guardado(s) en ${repoName}`;
        
        vscode.window.showInformationMessage(
            message,
            'Ver Cambios',
            'Más Tarde'
        ).then(selection => {
            if (selection === 'Ver Cambios') {
                vscode.commands.executeCommand('bloom.reviewPendingCommits');
            }
        });
    }

    /**
     * Actualiza status bar con contador
     */
    private static updateStatusBar() {
        if (this.pendingCommits.length === 0) {
            this.statusBarItem.hide();
            return;
        }

        const total = this.pendingCommits.reduce((sum, c) => sum + c.changes.length, 0);
        const repos = [...new Set(this.pendingCommits.map(c => c.repoName))].length;

        this.statusBarItem.text = `$(git-commit) ${total} cambios en ${repos} repo(s)`;
        this.statusBarItem.tooltip = 'Click para revisar y commitear';
        this.statusBarItem.show();
    }

    /**
     * Muestra panel de revisión de commits
     */
    static async reviewAndCommit(): Promise<void> {
        if (this.pendingCommits.length === 0) {
            vscode.window.showInformationMessage('No hay cambios pendientes');
            return;
        }

        // Crear panel webview
        const panel = vscode.window.createWebviewPanel(
            'bloomGitReview',
            'Revisar Commits Pendientes',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = this.getReviewHtml();

        // Enviar datos
        panel.webview.postMessage({
            command: 'loadCommits',
            commits: this.pendingCommits
        });

        // Escuchar acciones
        panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.command) {
                case 'editMessage':
                    await this.editCommitMessage(message.index, message.newMessage);
                    panel.webview.postMessage({
                        command: 'loadCommits',
                        commits: this.pendingCommits
                    });
                    break;

                case 'commitAndPush':
                    await this.executeCommit(message.index, true);
                    this.pendingCommits.splice(message.index, 1);
                    
                    if (this.pendingCommits.length === 0) {
                        panel.dispose();
                    } else {
                        panel.webview.postMessage({
                            command: 'loadCommits',
                            commits: this.pendingCommits
                        });
                    }
                    this.updateStatusBar();
                    break;

                case 'commitOnly':
                    await this.executeCommit(message.index, false);
                    this.pendingCommits.splice(message.index, 1);
                    
                    if (this.pendingCommits.length === 0) {
                        panel.dispose();
                    } else {
                        panel.webview.postMessage({
                            command: 'loadCommits',
                            commits: this.pendingCommits
                        });
                    }
                    this.updateStatusBar();
                    break;

                case 'discard':
                    this.pendingCommits.splice(message.index, 1);
                    
                    if (this.pendingCommits.length === 0) {
                        panel.dispose();
                    } else {
                        panel.webview.postMessage({
                            command: 'loadCommits',
                            commits: this.pendingCommits
                        });
                    }
                    this.updateStatusBar();
                    break;

                case 'commitAll':
                    await this.commitAll(message.withPush);
                    panel.dispose();
                    break;
            }
        });
    }

    /**
     * Edita mensaje de commit
     */
    private static async editCommitMessage(index: number, newMessage: string) {
        if (this.pendingCommits[index]) {
            this.pendingCommits[index].message = newMessage;
        }
    }

    /**
     * Ejecuta un commit específico
     */
    private static async executeCommit(index: number, withPush: boolean): Promise<void> {
        const commit = this.pendingCommits[index];
        
        try {
            // Stage cambios
            await execAsync('git add .', { cwd: commit.repoPath });

            // Commit
            const escapedMessage = commit.message.replace(/"/g, '\\"');
            await execAsync(`git commit -m "${escapedMessage}"`, {
                cwd: commit.repoPath
            });

            // Push si se solicita
            if (withPush) {
                await execAsync('git push', { cwd: commit.repoPath });
                vscode.window.showInformationMessage(
                    `✅ Commit + Push exitoso en ${commit.repoName}`
                );
            } else {
                vscode.window.showInformationMessage(
                    `✅ Commit exitoso en ${commit.repoName} (sin push)`
                );
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(
                `Error en ${commit.repoName}: ${error.message}`
            );
        }
    }

    /**
     * Commitea todos los cambios pendientes
     */
    private static async commitAll(withPush: boolean): Promise<void> {
        let successful = 0;
        let failed = 0;

        for (const commit of this.pendingCommits) {
            try {
                await execAsync('git add .', { cwd: commit.repoPath });
                const escapedMessage = commit.message.replace(/"/g, '\\"');
                await execAsync(`git commit -m "${escapedMessage}"`, {
                    cwd: commit.repoPath
                });

                if (withPush) {
                    await execAsync('git push', { cwd: commit.repoPath });
                }
                
                successful++;
            } catch (error) {
                failed++;
            }
        }

        this.pendingCommits = [];
        this.updateStatusBar();

        const action = withPush ? 'Commit + Push' : 'Commit';
        vscode.window.showInformationMessage(
            `${action}: ${successful} exitosos, ${failed} fallidos`
        );
    }

    /**
     * HTML del panel de revisión
     */
    private static getReviewHtml(): string {
        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 20px;
        }
        h1 { margin-bottom: 20px; }
        .commit-card {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            padding: 16px;
            margin-bottom: 16px;
        }
        .commit-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 12px;
        }
        .repo-name {
            font-weight: 600;
            font-size: 16px;
        }
        .timestamp {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }
        .commit-message {
            width: 100%;
            padding: 8px;
            margin-bottom: 12px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            border-radius: 4px;
            font-family: monospace;
        }
        .changes-list {
            margin-bottom: 12px;
            padding: 8px;
            background: rgba(0,0,0,0.2);
            border-radius: 4px;
            max-height: 150px;
            overflow-y: auto;
        }
        .change-item {
            font-family: monospace;
            font-size: 12px;
            padding: 2px 0;
        }
        .added { color: #4ec9b0; }
        .modified { color: #ce9178; }
        .deleted { color: #f48771; }
        .actions {
            display: flex;
            gap: 8px;
        }
        button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 600;
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-danger {
            background: transparent;
            color: var(--vscode-errorForeground);
            border: 1px solid var(--vscode-errorForeground);
        }
        .bulk-actions {
            position: sticky;
            top: 0;
            background: var(--vscode-editor-background);
            padding: 16px 0;
            border-bottom: 1px solid var(--vscode-panel-border);
            margin-bottom: 20px;
            display: flex;
            gap: 8px;
        }
    </style>
</head>
<body>
    <h1>📋 Revisar Commits Pendientes</h1>
    
    <div class="bulk-actions">
        <button class="btn-primary" onclick="commitAll(true)">✅ Commit + Push Todos</button>
        <button class="btn-secondary" onclick="commitAll(false)">💾 Commit Todos (sin push)</button>
    </div>

    <div id="commits"></div>

    <script>
        const vscode = acquireVsCodeApi();

        window.addEventListener('message', e => {
            if (e.data.command === 'loadCommits') {
                renderCommits(e.data.commits);
            }
        });

        function renderCommits(commits) {
            const container = document.getElementById('commits');
            container.innerHTML = commits.map((commit, i) => \`
                <div class="commit-card">
                    <div class="commit-header">
                        <span class="repo-name">📦 \${commit.repoName}</span>
                        <span class="timestamp">\${new Date(commit.timestamp).toLocaleString()}</span>
                    </div>
                    
                    <textarea class="commit-message" id="msg-\${i}">\${commit.message}</textarea>
                    
                    <div class="changes-list">
                        \${commit.changes.map(c => \`
                            <div class="change-item \${c.status}">
                                \${c.status === 'added' ? '+' : c.status === 'deleted' ? '-' : 'M'} \${c.file}
                            </div>
                        \`).join('')}
                    </div>
                    
                    <div class="actions">
                        <button class="btn-primary" onclick="commitAndPush(\${i})">
                            ✅ Commit + Push
                        </button>
                        <button class="btn-secondary" onclick="commitOnly(\${i})">
                            💾 Solo Commit
                        </button>
                        <button class="btn-secondary" onclick="editMessage(\${i})">
                            ✏️ Editar
                        </button>
                        <button class="btn-danger" onclick="discard(\${i})">
                            🗑️ Descartar
                        </button>
                    </div>
                </div>
            \`).join('');
        }

        function editMessage(index) {
            const newMessage = document.getElementById('msg-' + index).value;
            vscode.postMessage({
                command: 'editMessage',
                index: index,
                newMessage: newMessage
            });
        }

        function commitAndPush(index) {
            vscode.postMessage({
                command: 'commitAndPush',
                index: index
            });
        }

        function commitOnly(index) {
            vscode.postMessage({
                command: 'commitOnly',
                index: index
            });
        }

        function discard(index) {
            if (confirm('¿Descartar estos cambios?')) {
                vscode.postMessage({
                    command: 'discard',
                    index: index
                });
            }
        }

        function commitAll(withPush) {
            vscode.postMessage({
                command: 'commitAll',
                withPush: withPush
            });
        }
    </script>
</body>
</html>
        `;
    }

    /**
     * Obtiene conteo de commits pendientes
     */
    static getPendingCount(): number {
        return this.pendingCommits.length;
    }

    /**
     * Limpia commits pendientes
     */
    static clearPending(): void {
        this.pendingCommits = [];
        this.updateStatusBar();
    }

    /**
     * MÉTODO UNIVERSAL: Prepara archivos y abre SCM panel para commit confirmable
     * 
     * @param repoPath - Path absoluto al repositorio
     * @param files - Array de paths relativos a stagear (undefined = todo)
     * @param commitMessage - Mensaje sugerido (pre-llena el input del SCM)
     * 
     * CASOS DE USO:
     * - Proyectos nuevos: stageAndOpenSCM(projectPath, undefined, "Initial commit")
     * - Intents: stageAndOpenSCM(workspacePath, ['.bloom/intents/...'], "Generated intent")
     * - Nucleus: stageAndOpenSCM(nucleusPath, undefined, "Initial Nucleus")
     */
    static async stageAndOpenSCM(
        repoPath: string,
        files?: string[],
        commitMessage?: string
    ): Promise<void> {
        try {
            const repoName = path.basename(repoPath);
            
            console.log(`[GitManager] stageAndOpenSCM called:`, {
                repoPath,
                filesCount: files?.length || 'all',
                hasMessage: !!commitMessage
            });

            // 1. Verificar que es un repo git válido
            const gitDir = path.join(repoPath, '.git');
            if (!fs.existsSync(gitDir)) {
                throw new Error(`Not a git repository: ${repoPath}`);
            }

            // 2. Stage archivos
            if (files && files.length > 0) {
                // Stage archivos específicos
                console.log(`[GitManager] Staging ${files.length} specific files`);
                for (const file of files) {
                    try {
                        await execAsync(`git add "${file}"`, { cwd: repoPath });
                    } catch (error: any) {
                        console.warn(`[GitManager] Could not stage ${file}:`, error.message);
                        // Continuar con otros archivos
                    }
                }
            } else {
                // Stage todo
                console.log(`[GitManager] Staging all changes`);
                await execAsync('git add .', { cwd: repoPath });
            }

            // 3. Verificar que hay cambios staged
            const { stdout: stagedFiles } = await execAsync(
                'git diff --cached --name-only',
                { cwd: repoPath }
            );

            if (!stagedFiles.trim()) {
                vscode.window.showInformationMessage(
                    `✓ No hay cambios nuevos en ${repoName}`
                );
                console.log(`[GitManager] No staged changes in ${repoName}`);
                return;
            }

            const changedFilesList = stagedFiles.trim().split('\n').filter(f => f);
            console.log(`[GitManager] ${changedFilesList.length} files staged`);

            // 4. Intentar pre-llenar mensaje de commit usando Git Extension API
            if (commitMessage) {
                await this.trySetCommitMessage(repoPath, commitMessage);
            }

            // 5. Enfocar en SCM panel
            await vscode.commands.executeCommand('workbench.view.scm');
            
            // 6. Intentar enfocar en el repo específico (importante en multi-root)
            try {
                await vscode.commands.executeCommand('workbench.scm.focus');
            } catch (error) {
                // No crítico
                console.warn('[GitManager] Could not focus SCM:', error);
            }

            // 7. Mostrar notificación NO BLOQUEANTE
            const filePreview = changedFilesList.slice(0, 5).join('\n');
            const moreFiles = changedFilesList.length > 5 
                ? `\n... y ${changedFilesList.length - 5} más` 
                : '';

            const action = await vscode.window.showInformationMessage(
                `📝 ${changedFilesList.length} archivo(s) preparado(s) en ${repoName}`,
                {
                    modal: false, // NO BLOQUEANTE
                    detail: `Revisá los cambios en el panel SCM.\n\nArchivos:\n${filePreview}${moreFiles}`
                },
                'Ver SCM'
            );

            if (action === 'Ver SCM') {
                await vscode.commands.executeCommand('workbench.view.scm');
            }

            console.log(`[GitManager] Successfully staged and opened SCM for ${repoName}`);

        } catch (error: any) {
            console.error('[GitManager] Error in stageAndOpenSCM:', error);
            vscode.window.showErrorMessage(
                `Error preparando cambios: ${error.message}`
            );
            throw error; // Re-throw para que el caller sepa que falló
        }
    }

    /**
     * HELPER: Intenta pre-llenar el mensaje de commit en el SCM panel
     * NOTA: Esto puede fallar silenciosamente (no es crítico)
     */
    private static async trySetCommitMessage(
        repoPath: string,
        message: string
    ): Promise<void> {
        try {
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) {
                console.warn('[GitManager] Git extension not found');
                return;
            }

            const gitApi = gitExtension.exports.getAPI(1);
            
            // Buscar el repositorio que coincide con el path
            const repo = gitApi.repositories.find(
                (r: any) => r.rootUri.fsPath === repoPath
            );

            if (repo && repo.inputBox) {
                repo.inputBox.value = message;
                console.log('[GitManager] Commit message pre-filled successfully');
            } else {
                console.warn('[GitManager] Repository not found in Git API');
            }
        } catch (error: any) {
            // Fallo silencioso - no es crítico
            console.warn('[GitManager] Could not set commit message:', error.message);
        }
    }


    /**
     * Configura mensaje de commit sugerido en el repo
     */
    private static async setCommitMessage(
        repoPath: string,
        message: string
    ): Promise<void> {
        try {
            // Usar la API de Git de VSCode si está disponible
            const gitExtension = vscode.extensions.getExtension('vscode.git');
            if (!gitExtension) return;

            const gitApi = gitExtension.exports.getAPI(1);
            const repo = gitApi.repositories.find(
                (r: any) => r.rootUri.fsPath === repoPath
            );

            if (repo) {
                repo.inputBox.value = message;
            }
        } catch (error) {
            // Silently fail - no es crítico
            console.warn('Could not set commit message:', error);
        }
    }

}
```

### C:/repos/bloom-videos/bloom-development-extension/src/utils/githubApi.ts
Metadatos: Lenguaje: typescript, Hash MD5: f95dbdf7a98e486da4f00dde81bbc3e5

```typescript
// src/utils/githubApi.ts
import { getGitHubHeaders } from './githubOAuth';

// ============================================================================
// INTERFACES
// ============================================================================

export interface GitHubOrg {
    login: string;
    id: number;
    avatar_url: string;
    description?: string | null;
}

export interface GitHubRepo {
    id: number;
    name: string;
    full_name: string;
    description: string | null;
    clone_url: string;
    html_url: string;
    stargazers_count: number;
    updated_at: string;
    language: string | null;
    private: boolean;
}

// ============================================================================
// FUNCIONES EXISTENTES (de tu código original)
// ============================================================================

/**
 * Obtiene las organizaciones del usuario actual
 */
export async function getUserOrgs(): Promise<GitHubOrg[]> {
    const headers = await getGitHubHeaders();
    const resp = await fetch('https://api.github.com/user/orgs', { headers });
    
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Error obteniendo organizaciones: ${err}`);
    }
    
    return (await resp.json()) as GitHubOrg[];
}

/**
 * Crea un repositorio Nucleus en GitHub
 * (Función original de tu código)
 */
export async function createNucleusRepo(orgLogin?: string): Promise<string> {
    const headers = await getGitHubHeaders();
    const repoName = `bloom-nucleus-${new Date().getFullYear()}`;

    const body = {
        name: repoName,
        description: 'Nucleus Project - Bloom BTIP Premium',
        private: false,
        auto_init: true,
        gitignore_template: 'Node'
    };

    const url = orgLogin
        ? `https://api.github.com/orgs/${orgLogin}/repos`
        : 'https://api.github.com/user/repos';

    const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`No se pudo crear el repositorio: ${err}`);
    }

    const data = await resp.json() as any;
    return data.html_url;
}

// ============================================================================
// NUEVAS FUNCIONES (para manageProject.ts)
// ============================================================================

/**
 * Obtiene los repositorios de una organización O usuario personal
 * Detecta automáticamente si es org o user
 */
export async function getOrgRepos(orgOrUser: string): Promise<GitHubRepo[]> {
    const headers = await getGitHubHeaders();
    
    // Primero intentar como organización
    let resp = await fetch(
        `https://api.github.com/orgs/${orgOrUser}/repos?per_page=100&sort=updated`,
        { headers }
    );
    
    // Si falla (404), intentar como usuario personal
    if (!resp.ok && resp.status === 404) {
        // Verificar si es el usuario actual
        const userResp = await fetch('https://api.github.com/user', { headers });
        if (userResp.ok) {
            const currentUser = await userResp.json() as any;
            
            // Si el nombre coincide con el usuario actual, obtener sus repos
            if (currentUser.login.toLowerCase() === orgOrUser.toLowerCase()) {
                resp = await fetch(
                    'https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner',
                    { headers }
                );
            }
        }
    }
    
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Error obteniendo repositorios de ${orgOrUser}: ${err}`);
    }
    
    return (await resp.json()) as GitHubRepo[];
}

/**
 * Obtiene los repositorios del usuario personal (no organizaciones)
 */
export async function getUserRepos(): Promise<GitHubRepo[]> {
    const headers = await getGitHubHeaders();
    
    const resp = await fetch(
        'https://api.github.com/user/repos?per_page=100&sort=updated',
        { headers }
    );
    
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Error obteniendo repositorios personales: ${err}`);
    }
    
    return (await resp.json()) as GitHubRepo[];
}

/**
 * Obtiene un repositorio específico
 */
export async function getRepo(owner: string, repo: string): Promise<GitHubRepo> {
    const headers = await getGitHubHeaders();
    
    const resp = await fetch(
        `https://api.github.com/repos/${owner}/${repo}`,
        { headers }
    );
    
    if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Error obteniendo repositorio ${owner}/${repo}: ${err}`);
    }
    
    return (await resp.json()) as GitHubRepo;
}

/**
 * Crea un nuevo repositorio en una organización
 */
export async function createOrgRepo(
    org: string,
    name: string,
    description?: string,
    isPrivate: boolean = false
): Promise<GitHubRepo> {
    const headers = await getGitHubHeaders();
    
    const resp = await fetch(
        `https://api.github.com/orgs/${org}/repos`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name,
                description,
                private: isPrivate,
                auto_init: true
            })
        }
    );
    
    if (!resp.ok) {
        const err = await resp.text();
        let errorMessage = `Error creando repositorio ${name} en ${org}`;
        
        try {
            const errorData = JSON.parse(err);
            if (errorData.message) {
                errorMessage = errorData.message;
            }
        } catch {
            errorMessage += `: ${err}`;
        }
        
        throw new Error(errorMessage);
    }
    
    return (await resp.json()) as GitHubRepo;
}

/**
 * Verifica si un repositorio existe
 */
export async function repoExists(owner: string, repo: string): Promise<boolean> {
    try {
        await getRepo(owner, repo);
        return true;
    } catch {
        return false;
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/utils/githubOAuth.ts
Metadatos: Lenguaje: typescript, Hash MD5: ffa29ea8963cd13394f5d6350d06d3fd

```typescript
// src/utils/githubOAuth.ts
import * as vscode from 'vscode';

const GITHUB_AUTH_PROVIDER_ID = 'github';
const SCOPES = ['repo', 'read:org', 'user:email'];

// Cache para el token (en memoria)
let cachedToken: string | null = null;

/**
 * Guarda el token en cache para uso posterior
 */
export function setGitHubToken(token: string): void {
    cachedToken = token;
}

/**
 * Obtiene el token guardado en cache (desde memoria)
 * Para obtener un token fresco desde VSCode, usar getGitHubTokenFromSession()
 */
export function getCachedGitHubToken(): string | null {
    return cachedToken;
}

/**
 * Obtiene la sesión de GitHub desde VSCode
 */
export async function getGitHubSession(): Promise<vscode.AuthenticationSession> {
    const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, {
        createIfNone: true
    });

    if (!session) {
        throw new Error('No se pudo autenticar con GitHub');
    }

    return session;
}

/**
 * Obtiene el token de acceso desde la sesión de VSCode y lo guarda en cache
 */
export async function getGitHubTokenFromSession(): Promise<string> {
    const session = await getGitHubSession();
    const token = session.accessToken;
    
    // Guardar en cache automáticamente
    setGitHubToken(token);
    
    return token;
}

/**
 * Obtiene headers para peticiones a la API de GitHub
 */
export async function getGitHubHeaders(): Promise<Record<string, string>> {
    const token = await getGitHubTokenFromSession();
    return {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Bloom-VSCode-Extension'
    };
}

/**
 * Obtiene el usuario actual de GitHub
 * Ahora guarda el token automáticamente en cache
 */
export async function getCurrentGitHubUser(): Promise<{
    login: string;
    name?: string;
    email?: string | null;
}> {
    const headers = await getGitHubHeaders();
    const resp = await fetch('https://api.github.com/user', { headers });
    if (!resp.ok) throw new Error('Error obteniendo datos del usuario');
    const data = await resp.json() as any;

    if (!data.email) {
        const emailsResp = await fetch('https://api.github.com/user/emails', { headers });
        if (emailsResp.ok) {
            const emails = await emailsResp.json() as any[];
            const primary = emails.find((e: any) => e.primary && e.verified);
            if (primary) data.email = primary.email;
        }
    }

    return {
        login: data.login,
        name: data.name || data.login,
        email: data.email || null
    };
}

/**
 * Versión alternativa que retorna tanto el usuario como el token explícitamente
 */
export async function getCurrentGitHubUserWithToken(): Promise<{
    user: {
        login: string;
        name?: string;
        email?: string | null;
    };
    token: string;
}> {
    const session = await getGitHubSession();
    const token = session.accessToken;
    setGitHubToken(token);
    
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Bloom-VSCode-Extension'
    };
    
    const resp = await fetch('https://api.github.com/user', { headers });
    if (!resp.ok) throw new Error('Error obteniendo datos del usuario');
    const data = await resp.json() as any;

    if (!data.email) {
        const emailsResp = await fetch('https://api.github.com/user/emails', { headers });
        if (emailsResp.ok) {
            const emails = await emailsResp.json() as any[];
            const primary = emails.find((e: any) => e.primary && e.verified);
            if (primary) data.email = primary.email;
        }
    }

    const user = {
        login: data.login,
        name: data.name || data.login,
        email: data.email || null
    };

    return { user, token };
}
```

