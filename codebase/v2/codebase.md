# Snapshot de Codebase
Este archivo consolida todo el código del proyecto para indexación rápida por IA. Primero el índice jerárquico, luego cada archivo con su path como título y código en bloque Markdown.

**Origen:** Archivos específicos: 29
**Total de archivos:** 29

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
  - C:/repos/bloom-videos/bloom-development-extension/src/commands\openFileInVSCode.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/commands\openIntent.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/commands\revealInFinder.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/core/**
  - C:/repos/bloom-videos/bloom-development-extension/src/core\codebaseGenerator.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/core\intentAutoSaver.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/core\intentSession.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/core\metadataManager.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/core\nucleusManager.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/managers/**
  - C:/repos/bloom-videos/bloom-development-extension/src/managers\userManager.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/models/**
  - C:/repos/bloom-videos/bloom-development-extension/src/models\bloomConfig.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/models\intent.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/providers/**
  - C:/repos/bloom-videos/bloom-development-extension/src/providers\intentTreeProvider.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/providers\nucleusTreeProvider.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/strategies/**
  - C:/repos/bloom-videos/bloom-development-extension/src/strategies\NucleusStrategy.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/strategies\ProjectDetector.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/ui/intent/**
  - C:/repos/bloom-videos/bloom-development-extension/src/ui/intent\intentForm.css
  - C:/repos/bloom-videos/bloom-development-extension/src/ui/intent\intentForm.html
  - C:/repos/bloom-videos/bloom-development-extension/src/ui/intent\intentForm.js
  - C:/repos/bloom-videos/bloom-development-extension/src/ui/intent\intentFormPanel.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/ui/nucleus/**
  - C:/repos/bloom-videos/bloom-development-extension/src/ui/nucleus\NucleusSetupPanel.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/ui/welcome/**
  - C:/repos/bloom-videos/bloom-development-extension/src/ui/welcome\welcomeView.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/utils/**
  - C:/repos/bloom-videos/bloom-development-extension/src/utils\githubOAuth.ts

## Contenidos de Archivos
### C:/repos/bloom-videos/bloom-development-extension/package.json
Metadatos: Lenguaje: json, Hash MD5: afe6ce89bb8c412601536420b233afa2

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
      ],
      "explorer": [
        {
          "id": "bloomIntentsExplorer",
          "name": "Bloom Intents"
        }
      ]
    },
    "viewsWelcome": [
      {
        "view": "bloomNucleus",
        "contents": "No hay ningún Nucleus detectado en este workspace.\n[Crear Nucleus Project](command:bloom.createNucleusProject)",
        "when": "bloom.isRegistered && workspaceFolderCount > 0"
      },
      {
        "view": "bloomNucleusWelcome",
        "contents": "Bienvenido a Bloom Nucleus\n\nPara comenzar, completá tu registro gratuito.",
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
        "title": "Crear Nucleus Project",
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
        "title": "Sync Nucleus Projects",
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
        "title": "Mostrar Bienvenida Bloom"
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
          "command": "bloom.createNucleusProject",
          "when": "explorerResourceIsFolder",
          "group": "bloom@4"
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
          "when": "workspaceFolderCount > 0"
        },
        {
          "command": "bloom.linkToNucleus",
          "when": "workspaceFolderCount > 0"
        }
      ],
      "view/item/context": [
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
          "enum": ["free", "pro"],
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
          "enum": ["claude-3-opus-20240229", "claude-3-sonnet-20240229"],
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
            
            const pythonRunner = new PythonScriptRunner();
            
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
Metadatos: Lenguaje: typescript, Hash MD5: 1bacfabd70bd0f41c824b224e8686e35

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
import { registerCreateNucleusProject } from './commands/createNucleusProject';
import { openIntentInBrowser, openProviderInBrowser } from './commands/openIntentInBrowser';
import { NucleusTreeProvider } from './providers/nucleusTreeProvider';
import { NucleusWelcomeProvider } from './providers/nucleusWelcomeProvider';
import { WelcomeView } from './ui/welcome/welcomeView';
import { UserManager } from './managers/userManager';
import { NucleusSetupPanel } from './ui/nucleus/NucleusSetupPanel';
import { openNucleusProject } from './providers/nucleusTreeProvider';



import {
    configureIntentProfile,
    changeIntentProfile,
    removeIntentProfile
} from './commands/configureIntentProfile';

export function activate(context: vscode.ExtensionContext) {
    const logger = new Logger();
    logger.info('Bloom BTIP + Nucleus Premium activado');

    UserManager.init(context);

    const metadataManager = new MetadataManager(logger);
    const contextGatherer = new ContextGatherer(logger);
    const tokenEstimator = new TokenEstimator();

    const welcomeWebview = new WelcomeView(context);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) return;

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
    ProfileTreeProvider.initialize(context, logger, chromeProfileManager);

    // === CORREGIDO: todos los registerCommand con los parámetros correctos ===
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
    registerCreateNucleusProject(context, logger);

    // Profile & Browser commands
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.manageProfiles', () =>
            ProfileManagerPanel.createOrShow(context.extensionUri, logger, context)
        ),
        vscode.commands.registerCommand('bloom.refreshProfiles', () =>
            ProfileTreeProvider.getInstance().refresh()
        ),
        vscode.commands.registerCommand('bloom.configureIntentProfile', (intent: Intent) =>
            intent && configureIntentProfile(intent, context, logger)
        ),
        vscode.commands.registerCommand('bloom.changeIntentProfile', (intent: Intent) =>
            intent && changeIntentProfile(intent, context, logger)
        ),
        vscode.commands.registerCommand('bloom.removeIntentProfile', (intent: Intent) =>
            intent && removeIntentProfile(intent, context, logger)
        ),
        vscode.commands.registerCommand('bloom.openIntentInBrowser', async (intent?: Intent) => {
            if (!intent) {
                const intents = await getAvailableIntents(workspaceFolder);
                if (intents.length === 0) return vscode.window.showInformationMessage('No intents found');
                const selected = await vscode.window.showQuickPick(
                    intents.map(i => ({ label: i.metadata.name, intent: i })),
                    { placeHolder: 'Select intent' }
                );
                intent = selected?.intent;
            }
            if (intent) await openIntentInBrowser(intent, context, logger);
        }),
        vscode.commands.registerCommand('bloom.openClaudeInBrowser', () => openProviderInBrowser('claude', context, logger)),
        vscode.commands.registerCommand('bloom.openChatGPTInBrowser', () => openProviderInBrowser('chatgpt', context, logger)),
        vscode.commands.registerCommand('bloom.openGrokInBrowser', () => openProviderInBrowser('grok', context, logger)),
        vscode.commands.registerCommand('bloom.showWelcome', () => welcomeWebview.show()),
        vscode.commands.registerCommand('bloom.focusRealNucleusView', () =>
            vscode.commands.executeCommand('workbench.view.extension.bloomNucleus')
        ),
        vscode.commands.registerCommand('bloom.syncNucleusProjects', () => nucleusTreeProvider.refresh()),
        vscode.commands.registerCommand('bloom.openNucleusProject', (project: any) => project && openNucleusProject(project)),
        vscode.commands.registerCommand('bloom.createNewNucleus', () => new NucleusSetupPanel(context).show())
    );

    // Registro premium
    if (!UserManager.init(context).isRegistered()) {
        setTimeout(() => welcomeWebview.show(), 1000);
    }

    vscode.commands.executeCommand('setContext', 'bloom.isRegistered', UserManager.init(context).isRegistered());
}

async function getAvailableIntents(workspaceFolder: vscode.WorkspaceFolder): Promise<Intent[]> {
    const intentsPath = path.join(workspaceFolder.uri.fsPath, '.bloom', 'intents');
    if (!fs.existsSync(intentsPath)) return [];

    const files = fs.readdirSync(intentsPath).filter(f => f.endsWith('.json'));
    const intents: Intent[] = [];

    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(intentsPath, file), 'utf-8')) as Intent;
            if (data?.metadata?.name) intents.push(data);
        } catch { }
    }
    return intents;
}

export function deactivate() {
    // VS Code limpia todo automáticamente
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/managers/userManager.ts
Metadatos: Lenguaje: typescript, Hash MD5: a35f271eb96a232edf4795f84a5212a2

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
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/models/bloomConfig.ts
Metadatos: Lenguaje: typescript, Hash MD5: 350870ef26928fef261f00e68a8af060

```typescript
import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// ORIGINAL BLOOM CONFIG (actualizado)
// ============================================================================

export type ProjectStrategy =
    | 'android'
    | 'ios'
    | 'react-web'
    | 'web'          
    | 'node'
    | 'python-flask'
    | 'php-laravel'
    | 'nucleus'
    | 'generic';

export interface AndroidStrategyConfig {
    minSdk: number;
    targetSdk: number;
    kotlinVersion: string;
    useCompose: boolean;
}

export interface IosStrategyConfig {
    minVersion: string;
    swiftVersion: string;
    useSwiftUI: boolean;
}

export interface ReactStrategyConfig {
    reactVersion: string;
    useTypeScript: boolean;
    cssFramework?: 'tailwind' | 'styled-components' | 'css-modules';
}

// NEW: Web strategy config (similar to react-web but more generic)
export interface WebStrategyConfig {
    useTypeScript: boolean;
    cssFramework?: 'tailwind' | 'styled-components' | 'css-modules' | 'vanilla-css';
    framework?: 'vanilla' | 'vue' | 'angular' | 'svelte';
}

export interface NodeStrategyConfig {
    nodeVersion: string;
    packageManager: 'npm' | 'yarn' | 'pnpm';
    framework?: 'express' | 'fastify' | 'nest';
}

export interface PythonFlaskStrategyConfig {
    pythonVersion: string;
    flaskVersion: string;
    databaseType: 'sqlite' | 'postgresql' | 'mysql';
    useAlembic: boolean;
}

export interface PhpLaravelStrategyConfig {
    phpVersion: string;
    laravelVersion: string;
    databaseDriver: 'mysql' | 'pgsql' | 'sqlite';
    usePest: boolean;
}

export interface GenericStrategyConfig {
    customSettings: Record<string, any>;
}

export type StrategyConfig =
    | AndroidStrategyConfig
    | IosStrategyConfig
    | ReactStrategyConfig
    | WebStrategyConfig
    | NodeStrategyConfig
    | PythonFlaskStrategyConfig
    | PhpLaravelStrategyConfig
    | NucleusConfig
    | GenericStrategyConfig;

export interface BloomConfig {
    version: string;
    projectName: string;
    strategy: ProjectStrategy;
    strategyConfig: StrategyConfig;
    createdAt: string;
    lastModified: string;
    paths: {
        core: string;
        intents: string;
        project: string;
        utils: string;
    };
}

export function createDefaultConfig(
    projectName: string,
    strategy: ProjectStrategy,
    workspaceFolder: vscode.WorkspaceFolder
): BloomConfig {
    return {
        version: '1.0.0',
        projectName,
        strategy,
        strategyConfig: getDefaultStrategyConfig(strategy),
        createdAt: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        paths: {
            core: '.bloom/core',
            intents: '.bloom/intents',
            project: '.bloom/project',
            utils: '.bloom/utils'
        }
    };
}

function getDefaultStrategyConfig(strategy: ProjectStrategy): StrategyConfig {
    switch (strategy) {
        case 'android':
            return {
                minSdk: 24,
                targetSdk: 34,
                kotlinVersion: '1.9.0',
                useCompose: true
            } as AndroidStrategyConfig;

        case 'ios':
            return {
                minVersion: '15.0',
                swiftVersion: '5.9',
                useSwiftUI: true
            } as IosStrategyConfig;

        case 'react-web':
            return {
                reactVersion: '18.2.0',
                useTypeScript: true,
                cssFramework: 'tailwind'
            } as ReactStrategyConfig;

        case 'web':
            return {
                useTypeScript: true,
                cssFramework: 'tailwind',
                framework: 'vanilla'
            } as WebStrategyConfig;

        case 'node':
            return {
                nodeVersion: '18.0.0',
                packageManager: 'npm',
                framework: 'express'
            } as NodeStrategyConfig;

        case 'python-flask':
            return {
                pythonVersion: '3.11',
                flaskVersion: '3.0.0',
                databaseType: 'sqlite',
                useAlembic: true
            } as PythonFlaskStrategyConfig;

        case 'php-laravel':
            return {
                phpVersion: '8.2',
                laravelVersion: '10.0',
                databaseDriver: 'mysql',
                usePest: true
            } as PhpLaravelStrategyConfig;

        case 'nucleus':
            return createNucleusConfig('default-org', 'https://github.com/default', 'https://github.com/default/nucleus');

        default:
            return {
                customSettings: {}
            } as GenericStrategyConfig;
    }
}

// ============================================================================
// NUCLEUS EXTENSION
// ============================================================================

export type ProjectStatus = 'active' | 'development' | 'archived' | 'planned';
export type ProjectType = 'nucleus' | 'btip';

export interface NucleusOrganization {
    name: string;
    displayName: string;
    url: string;
    description?: string;
}

export interface NucleusInfo {
    name: string;
    repoUrl: string;
    createdAt: string;
    updatedAt: string;
}

export interface LinkedProject {
    id: string;
    name: string;
    displayName: string;
    description?: string;
    strategy: ProjectStrategy;
    repoUrl: string;
    localPath: string;
    status: ProjectStatus;
    linkedAt: string;
}

export interface NucleusSettings {
    autoIndexProjects: boolean;
    generateWebDocs: boolean;
}

export interface NucleusConfig {
    type: 'nucleus';
    version: string;
    id: string;
    organization: NucleusOrganization;
    nucleus: NucleusInfo;
    projects: LinkedProject[];
    settings: NucleusSettings;
}

export interface NucleusLink {
    linkedToNucleus: boolean;
    nucleusId: string;
    nucleusName: string;
    nucleusPath: string;
    nucleusUrl: string;
    organizationName: string;
    projectId: string;
    linkedAt: string;
}

export function createNucleusConfig(
    organizationName: string,
    organizationUrl: string,
    nucleusRepoUrl: string
): NucleusConfig {
    const now = new Date().toISOString();
    const nucleusName = `nucleus-${organizationName.toLowerCase().replace(/\s+/g, '-')}`;
    
    return {
        type: 'nucleus',
        version: '1.0.0',
        id: uuidv4(),
        organization: {
            name: organizationName,
            displayName: organizationName,
            url: organizationUrl,
            description: ''
        },
        nucleus: {
            name: nucleusName,
            repoUrl: nucleusRepoUrl,
            createdAt: now,
            updatedAt: now
        },
        projects: [],
        settings: {
            autoIndexProjects: true,
            generateWebDocs: false
        }
    };
}

export function createLinkedProject(
    name: string,
    displayName: string,
    strategy: ProjectStrategy,
    repoUrl: string,
    localPath: string
): LinkedProject {
    return {
        id: uuidv4(),
        name,
        displayName,
        description: '',
        strategy,
        repoUrl,
        localPath,
        status: 'active',
        linkedAt: new Date().toISOString()
    };
}

export function createNucleusLink(
    nucleusConfig: NucleusConfig,
    projectId: string,
    nucleusPath: string
): NucleusLink {
    return {
        linkedToNucleus: true,
        nucleusId: nucleusConfig.id,
        nucleusName: nucleusConfig.nucleus.name,
        nucleusPath,
        nucleusUrl: nucleusConfig.nucleus.repoUrl,
        organizationName: nucleusConfig.organization.name,
        projectId,
        linkedAt: new Date().toISOString()
    };
}

export function detectProjectType(bloomPath: string): ProjectType | null {
    const fs = require('fs');
    const path = require('path');
    
    // Check for nucleus-config.json
    const nucleusConfigPath = path.join(bloomPath, 'core', 'nucleus-config.json');
    if (fs.existsSync(nucleusConfigPath)) {
        return 'nucleus';
    }
    
    // Check for project/ directory (BTIP indicator)
    const projectDir = path.join(bloomPath, 'project');
    if (fs.existsSync(projectDir)) {
        return 'btip';
    }
    
    // Check for nucleus.json (linked BTIP)
    const nucleusLinkPath = path.join(bloomPath, 'nucleus.json');
    if (fs.existsSync(nucleusLinkPath)) {
        return 'btip';
    }
    
    return null;
}

export function isNucleusProject(bloomPath: string): boolean {
    return detectProjectType(bloomPath) === 'nucleus';
}

export function isBTIPProject(bloomPath: string): boolean {
    return detectProjectType(bloomPath) === 'btip';
}

export function hasNucleusLink(bloomPath: string): boolean {
    const fs = require('fs');
    const path = require('path');
    const nucleusLinkPath = path.join(bloomPath, 'nucleus.json');
    return fs.existsSync(nucleusLinkPath);
}

export function loadNucleusConfig(bloomPath: string): NucleusConfig | null {
    const fs = require('fs');
    const path = require('path');
    
    try {
        const configPath = path.join(bloomPath, 'core', 'nucleus-config.json');
        if (!fs.existsSync(configPath)) {
            return null;
        }
        
        const content = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(content) as NucleusConfig;
    } catch (error) {
        console.error('Error loading nucleus config:', error);
        return null;
    }
}

export function loadNucleusLink(bloomPath: string): NucleusLink | null {
    const fs = require('fs');
    const path = require('path');
    
    try {
        const linkPath = path.join(bloomPath, 'nucleus.json');
        if (!fs.existsSync(linkPath)) {
            return null;
        }
        
        const content = fs.readFileSync(linkPath, 'utf-8');
        return JSON.parse(content) as NucleusLink;
    } catch (error) {
        console.error('Error loading nucleus link:', error);
        return null;
    }
}

export function saveNucleusConfig(bloomPath: string, config: NucleusConfig): boolean {
    const fs = require('fs');
    const path = require('path');
    
    try {
        const configPath = path.join(bloomPath, 'core', 'nucleus-config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
        return true;
    } catch (error) {
        console.error('Error saving nucleus config:', error);
        return false;
    }
}

export function saveNucleusLink(bloomPath: string, link: NucleusLink): boolean {
    const fs = require('fs');
    const path = require('path');
    
    try {
        const linkPath = path.join(bloomPath, 'nucleus.json');
        fs.writeFileSync(linkPath, JSON.stringify(link, null, 2), 'utf-8');
        return true;
    } catch (error) {
        console.error('Error saving nucleus link:', error);
        return false;
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
Metadatos: Lenguaje: typescript, Hash MD5: 851d77bc5ede898e2da7412353c89e3a

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
        this._onDidChangeTreeData.fire(undefined);  // ← CORREGIDO
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

        const bloomPath = path.join(this.workspaceRoot, '.bloom');
        const configPath = path.join(bloomPath, 'core', 'nucleus-config.json');

        if (fs.existsSync(configPath)) {
            const config = loadNucleusConfig(bloomPath);
            if (config?.organization?.name === org) {
                return config;
            }
        }

        const linkPath = path.join(bloomPath, 'nucleus.json');
        if (fs.existsSync(linkPath)) {
            try {
                const link = JSON.parse(fs.readFileSync(linkPath, 'utf-8'));
                if (link.organization === org && link.nucleusPath) {
                    const fullPath = path.resolve(this.workspaceRoot, link.nucleusPath);
                    if (fs.existsSync(fullPath)) {
                        return loadNucleusConfig(path.join(fullPath, '.bloom'));
                    }
                }
            } catch {}
        }

        return null;
    }

    getTreeItem(element: NucleusTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: NucleusTreeItem): Promise<NucleusTreeItem[]> {
        if (!element) {
            const items: NucleusTreeItem[] = [];

            for (const org of this.configs.keys()) {
                items.push(new NucleusTreeItem(
                    `${org}`,
                    vscode.TreeItemCollapsibleState.Expanded,
                    'org',
                    org
                ));
            }

            items.push(new NucleusTreeItem(
                'Agregar otro Nucleus',
                vscode.TreeItemCollapsibleState.None,
                'add'
            ));

            if (items.length === 1) {
                items.unshift(new NucleusTreeItem(
                    'No hay Nucleus configurado',
                    vscode.TreeItemCollapsibleState.None,
                    'empty'
                ));
            }

            return items;
        }

        if (element.type === 'org') {
            const config = this.configs.get(element.data as string);
            if (!config?.projects) return [];
            return config.projects.map(p =>
                new NucleusTreeItem(
                    `${p.displayName || p.name}`,
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

        if (element.type === 'add') {
            vscode.commands.executeCommand('bloom.createNewNucleus');
            return [];
        }

        return [];
    }
}

class NucleusTreeItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: 'org' | 'project' | 'add' | 'empty',
        public readonly data?: any,
        command?: vscode.Command
    ) {
        super(label, collapsibleState);
        this.command = command;

        switch (type) {
            case 'org':
                this.iconPath = new vscode.ThemeIcon('organization');
                break;
            case 'project':
                this.iconPath = new vscode.ThemeIcon('folder');
                break;
            case 'add':
                this.iconPath = new vscode.ThemeIcon('add');
                break;
            case 'empty':
                this.iconPath = new vscode.ThemeIcon('info');
                break;
        }
    }
}

// ←←← LA FUNCIÓN QUE FALTABA EXPORTAR
export async function openNucleusProject(project: LinkedProject): Promise<void> {
    try {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        let projectPath: string | null = null;
        const relativePath = path.join(workspaceRoot, project.localPath);
        if (fs.existsSync(relativePath)) {
            projectPath = relativePath;
        } else {
            const parentDir = path.dirname(workspaceRoot);
            const parentRelativePath = path.join(parentDir, project.localPath);
            if (fs.existsSync(parentRelativePath)) {
                projectPath = parentRelativePath;
            }
        }

        if (!projectPath) {
            const browse = await vscode.window.showWarningMessage(
                `Project path not found: ${project.localPath}`,
                'Browse for Project', 'Cancel'
            );

            if (browse === 'Browse for Project') {
                const selected = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: `Select ${project.name} folder`,
                    title: `Locate ${project.displayName}`
                });

                if (selected && selected.length > 0) {
                    projectPath = selected[0].fsPath;
                }
            }

            if (!projectPath) return;
        }

        await vscode.commands.executeCommand(
            'vscode.openFolder',
            vscode.Uri.file(projectPath),
            true
        );
    } catch (error: any) {
        vscode.window.showErrorMessage(`Error opening project: ${error.message}`);
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/strategies/NucleusStrategy.ts
Metadatos: Lenguaje: typescript, Hash MD5: 476ba538135d31f3b0079d8db53cd28d

```typescript
// src/strategies/NucleusStrategy.ts
// Strategy for handling Nucleus (organizational) projects

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CodebaseStrategy, FileDescriptor, FileCategory } from '../models/codebaseStrategy';
import { ProjectType } from '../models/intent';

export class NucleusStrategy implements CodebaseStrategy {
    name = 'nucleus';
    projectType: ProjectType = 'nucleus';
    
    /**
     * Detects if the workspace is a Nucleus project
     */
    async detect(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
        const bloomPath = path.join(workspaceFolder.uri.fsPath, '.bloom');
        
        if (!fs.existsSync(bloomPath)) {
            return false;
        }
        
        // Check for nucleus-config.json
        const nucleusConfigPath = path.join(bloomPath, 'core', 'nucleus-config.json');
        if (!fs.existsSync(nucleusConfigPath)) {
            return false;
        }
        
        // Validate it's actually a nucleus config
        try {
            const content = fs.readFileSync(nucleusConfigPath, 'utf-8');
            const config = JSON.parse(content);
            return config.type === 'nucleus';
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Categorizes files for Nucleus projects
     * Nucleus projects focus on .bl (Bloom) documentation files
     */
    async categorize(files: vscode.Uri[]): Promise<FileDescriptor[]> {
        const descriptors: FileDescriptor[] = [];
        
        for (const fileUri of files) {
            const absolutePath = fileUri.fsPath;
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileUri);
            
            if (!workspaceFolder) {
                continue;
            }
            
            const relativePath = path.relative(workspaceFolder.uri.fsPath, absolutePath);
            const extension = path.extname(absolutePath);
            
            let category: FileCategory = 'docs';
            let priority = 5;
            
            // Categorize by location and type
            if (relativePath.includes('.bloom/core/')) {
                category = 'config';
                priority = 10;
            } else if (relativePath.includes('.bloom/organization/')) {
                category = 'docs';
                priority = 9;
            } else if (relativePath.includes('.bloom/projects/')) {
                category = 'docs';
                priority = 8;
            } else if (extension === '.json') {
                category = 'config';
                priority = 7;
            } else if (extension === '.md') {
                category = 'docs';
                priority = 6;
            }
            
            const stats = fs.statSync(absolutePath);
            
            descriptors.push({
                relativePath,
                absolutePath,
                category,
                priority,
                size: stats.size,
                extension,
                metadata: {
                    size: stats.size,
                    type: extension,
                    lastModified: stats.mtimeMs
                }
            });
        }
        
        return descriptors;
    }
    
    /**
     * Prioritizes files for Nucleus projects
     * Core files > Organization files > Project overviews
     */
    prioritize(files: FileDescriptor[]): FileDescriptor[] {
        return files.sort((a, b) => {
            // Sort by priority (higher first)
            if (b.priority !== a.priority) {
                return b.priority - a.priority;
            }
            
            // Then by path depth (shallower first)
            const depthA = a.relativePath.split(path.sep).length;
            const depthB = b.relativePath.split(path.sep).length;
            
            if (depthA !== depthB) {
                return depthA - depthB;
            }
            
            // Finally alphabetically
            return a.relativePath.localeCompare(b.relativePath);
        });
    }
    
    /**
     * Legacy method for backward compatibility
     */
    async generateCodebase(projectRoot: string, outputPath: string): Promise<string> {
        const codebasePath = path.join(outputPath, 'codebase.md');
        
        // For Nucleus projects, we generate a different kind of codebase
        // focused on organizational documentation rather than code
        
        const content = await this.generateNucleusCodebase(projectRoot);
        
        fs.writeFileSync(codebasePath, content, 'utf-8');
        
        return codebasePath;
    }
    
    private async generateNucleusCodebase(projectRoot: string): Promise<string> {
        const sections: string[] = [];
        
        sections.push('# BLOOM NUCLEUS - ORGANIZATIONAL DOCUMENTATION\n');
        sections.push('This is a Nucleus project - an organizational knowledge center.\n');
        sections.push('---\n\n');
        
        // 1. Read nucleus-config.json
        const config = this.readNucleusConfig(projectRoot);
        if (config) {
            sections.push('## ORGANIZATION INFO\n');
            sections.push(`**Name:** ${config.organization.name}\n`);
            sections.push(`**Display Name:** ${config.organization.displayName}\n`);
            sections.push(`**URL:** ${config.organization.url}\n`);
            if (config.organization.description) {
                sections.push(`**Description:** ${config.organization.description}\n`);
            }
            sections.push('\n');
            
            sections.push('## NUCLEUS INFO\n');
            sections.push(`**Nucleus Name:** ${config.nucleus.name}\n`);
            sections.push(`**Repository:** ${config.nucleus.repoUrl}\n`);
            sections.push(`**Created:** ${config.nucleus.createdAt}\n`);
            sections.push(`**Updated:** ${config.nucleus.updatedAt}\n`);
            sections.push('\n');
            
            if (config.projects && config.projects.length > 0) {
                sections.push('## LINKED PROJECTS\n');
                for (const project of config.projects) {
                    sections.push(`### ${project.displayName}\n`);
                    sections.push(`- **Name:** ${project.name}\n`);
                    sections.push(`- **Strategy:** ${project.strategy}\n`);
                    sections.push(`- **Status:** ${project.status}\n`);
                    sections.push(`- **Repository:** ${project.repoUrl}\n`);
                    sections.push(`- **Local Path:** ${project.localPath}\n`);
                    if (project.description) {
                        sections.push(`- **Description:** ${project.description}\n`);
                    }
                    sections.push('\n');
                }
            }
        }
        
        // 2. Read organization files
        const organizationPath = path.join(projectRoot, '.bloom', 'organization');
        if (fs.existsSync(organizationPath)) {
            sections.push('## ORGANIZATION DOCUMENTATION\n\n');
            
            const orgFiles = [
                '.organization.bl',
                'about.bl',
                'business-model.bl',
                'policies.bl',
                'protocols.bl'
            ];
            
            for (const file of orgFiles) {
                const filePath = path.join(organizationPath, file);
                if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    sections.push(`### 📄 ${file}\n\n`);
                    sections.push('```markdown\n');
                    sections.push(content);
                    sections.push('\n```\n\n');
                }
            }
        }
        
        // 3. Read projects index
        const projectsIndexPath = path.join(projectRoot, '.bloom', 'projects', '_index.bl');
        if (fs.existsSync(projectsIndexPath)) {
            sections.push('## PROJECTS INDEX\n\n');
            const content = fs.readFileSync(projectsIndexPath, 'utf-8');
            sections.push('```markdown\n');
            sections.push(content);
            sections.push('\n```\n\n');
        }
        
        // 4. Read project overviews
        const projectsPath = path.join(projectRoot, '.bloom', 'projects');
        if (fs.existsSync(projectsPath)) {
            const projectDirs = fs.readdirSync(projectsPath, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => dirent.name);
            
            if (projectDirs.length > 0) {
                sections.push('## PROJECT OVERVIEWS\n\n');
                
                for (const projectDir of projectDirs) {
                    const overviewPath = path.join(projectsPath, projectDir, 'overview.bl');
                    if (fs.existsSync(overviewPath)) {
                        const content = fs.readFileSync(overviewPath, 'utf-8');
                        sections.push(`### 📦 ${projectDir}\n\n`);
                        sections.push('```markdown\n');
                        sections.push(content);
                        sections.push('\n```\n\n');
                    }
                }
            }
        }
        
        // 5. Read core rules and prompt
        const coreRulesPath = path.join(projectRoot, '.bloom', 'core', '.rules.bl');
        if (fs.existsSync(coreRulesPath)) {
            sections.push('## NUCLEUS RULES\n\n');
            const content = fs.readFileSync(coreRulesPath, 'utf-8');
            sections.push('```markdown\n');
            sections.push(content);
            sections.push('\n```\n\n');
        }
        
        const corePromptPath = path.join(projectRoot, '.bloom', 'core', '.prompt.bl');
        if (fs.existsSync(corePromptPath)) {
            sections.push('## NUCLEUS PROMPT\n\n');
            const content = fs.readFileSync(corePromptPath, 'utf-8');
            sections.push('```markdown\n');
            sections.push(content);
            sections.push('\n```\n\n');
        }
        
        sections.push('---\n');
        sections.push('Generated by Bloom BTIP Plugin\n');
        sections.push(`Timestamp: ${new Date().toISOString()}\n`);
        
        return sections.join('');
    }
    
    private readNucleusConfig(projectRoot: string): any {
        try {
            const configPath = path.join(projectRoot, '.bloom', 'core', 'nucleus-config.json');
            if (!fs.existsSync(configPath)) {
                return null;
            }
            
            const content = fs.readFileSync(configPath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Error reading nucleus config:', error);
            return null;
        }
    }
    
    async getProjectStructure(projectRoot: string): Promise<string> {
        // For Nucleus, return organizational structure
        const lines: string[] = [];
        
        lines.push('Nucleus Project Structure:');
        lines.push('');
        lines.push('.bloom/');
        lines.push('├── core/');
        lines.push('│   ├── nucleus-config.json  🔑 (Nucleus identifier)');
        lines.push('│   ├── .rules.bl');
        lines.push('│   └── .prompt.bl');
        lines.push('├── organization/');
        lines.push('│   ├── .organization.bl');
        lines.push('│   ├── about.bl');
        lines.push('│   ├── business-model.bl');
        lines.push('│   ├── policies.bl');
        lines.push('│   └── protocols.bl');
        lines.push('└── projects/');
        lines.push('    ├── _index.bl');
        lines.push('    └── {project-name}/');
        lines.push('        └── overview.bl');
        
        return lines.join('\n');
    }
    
    async validateProject(projectRoot: string): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];
        
        // Check for nucleus-config.json
        const configPath = path.join(projectRoot, '.bloom', 'core', 'nucleus-config.json');
        if (!fs.existsSync(configPath)) {
            errors.push('Missing nucleus-config.json in .bloom/core/');
        } else {
            try {
                const content = fs.readFileSync(configPath, 'utf-8');
                const config = JSON.parse(content);
                
                if (config.type !== 'nucleus') {
                    errors.push('nucleus-config.json must have type="nucleus"');
                }
                
                if (!config.organization || !config.organization.name) {
                    errors.push('nucleus-config.json missing organization.name');
                }
                
                if (!config.nucleus || !config.nucleus.name) {
                    errors.push('nucleus-config.json missing nucleus.name');
                }
            } catch (error) {
                errors.push('Invalid JSON in nucleus-config.json');
            }
        }
        
        // Check for organization directory
        const orgPath = path.join(projectRoot, '.bloom', 'organization');
        if (!fs.existsSync(orgPath)) {
            errors.push('Missing .bloom/organization/ directory');
        }
        
        // Check for projects directory
        const projectsPath = path.join(projectRoot, '.bloom', 'projects');
        if (!fs.existsSync(projectsPath)) {
            errors.push('Missing .bloom/projects/ directory');
        }
        
        return {
            valid: errors.length === 0,
            errors
        };
    }
    
    getRequiredFiles(): string[] {
        return [
            '.bloom/core/nucleus-config.json',
            '.bloom/core/.rules.bl',
            '.bloom/core/.prompt.bl',
            '.bloom/organization/.organization.bl',
            '.bloom/projects/_index.bl'
        ];
    }
    
    getFileExtensions(): string[] {
        return ['.bl', '.json', '.md'];
    }
    
    async estimateTokenCount(projectRoot: string): Promise<number> {
        // Nucleus projects are documentation-heavy
        // Estimate based on .bl files
        
        let totalChars = 0;
        const bloomPath = path.join(projectRoot, '.bloom');
        
        const countFiles = (dir: string) => {
            if (!fs.existsSync(dir)) {
                return;
            }
            
            const items = fs.readdirSync(dir, { withFileTypes: true });
            
            for (const item of items) {
                const fullPath = path.join(dir, item.name);
                
                if (item.isDirectory()) {
                    countFiles(fullPath);
                } else if (item.isFile() && (item.name.endsWith('.bl') || item.name.endsWith('.json'))) {
                    try {
                        const content = fs.readFileSync(fullPath, 'utf-8');
                        totalChars += content.length;
                    } catch (error) {
                        // Skip files we can't read
                    }
                }
            }
        };
        
        countFiles(bloomPath);
        
        // Rough estimate: 4 chars per token
        return Math.ceil(totalChars / 4);
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/strategies/ProjectDetector.ts
Metadatos: Lenguaje: typescript, Hash MD5: 90d1bb620a99fa928094c41670d9555a

```typescript
// src/strategies/ProjectDetector.ts
// Updated to detect Nucleus projects with registered strategies pattern

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CodebaseStrategy } from '../models/codebaseStrategy';
import { AndroidStrategy } from './AndroidStrategy';
import { IOSStrategy } from './IOSStrategy';
import { ReactStrategy } from './ReactStrategy';
import { WebStrategy } from './WebStrategy';
import { NucleusStrategy } from './NucleusStrategy';
import { GenericStrategy } from './GenericStrategy';

export class ProjectDetector {
    private strategies: CodebaseStrategy[] = [];
    
    constructor() {
        this.registerStrategies();
    }
    
    private registerStrategies(): void {
        this.strategies = [
            new NucleusStrategy(),
            new AndroidStrategy(),
            new IOSStrategy(),
            new ReactStrategy(),
            new WebStrategy(),
            new GenericStrategy() 
        ];
    }
    
    /**
     * Detects the project type and returns the appropriate strategy
     * Maintains both the registered strategies pattern and priority detection
     */
    async detectStrategy(workspaceRoot: string): Promise<CodebaseStrategy> {
        // Convert string path to WorkspaceFolder
        const workspaceFolder = this.getWorkspaceFolderFromPath(workspaceRoot);
        
        // PRIORITY 1: Check for explicit .bloom/core/strategy indicator
        const explicitStrategy = this.readExplicitStrategy(workspaceRoot);
        if (explicitStrategy) {
            console.log(`✅ Detected explicit strategy: ${explicitStrategy}`);
            return this.getStrategyByName(explicitStrategy);
        }
        
        // PRIORITY 2: Use registered strategies with detection logic
        for (const strategy of this.strategies) {
            // Skip GenericStrategy until we've checked all others
            if (strategy instanceof GenericStrategy) {
                continue;
            }
            
            const detected = await strategy.detect(workspaceFolder);
            if (detected) {
                console.log(`✅ Detected ${strategy.name} project`);
                return strategy;
            }
        }
        
        // DEFAULT: Generic strategy
        console.log('⚠️  Using Generic strategy (no specific type detected)');
        return new GenericStrategy();
    }
    
    /**
     * Helper method to convert string path to WorkspaceFolder
     */
    private getWorkspaceFolderFromPath(workspaceRoot: string): vscode.WorkspaceFolder {
        // Try to find the actual workspace folder
        const uri = vscode.Uri.file(workspaceRoot);
        const existingFolder = vscode.workspace.getWorkspaceFolder(uri);
        
        if (existingFolder) {
            return existingFolder;
        }
        
        // Create a minimal WorkspaceFolder object if not found
        return {
            uri: uri,
            name: path.basename(workspaceRoot),
            index: 0
        };
    }
    
    /**
     * Static method for direct detection (maintains compatibility)
     */
    static async detectStrategy(projectRoot: string): Promise<CodebaseStrategy> {
        const detector = new ProjectDetector();
        return await detector.detectStrategy(projectRoot);
    }
    
    /**
     * Detects if project is a Nucleus (organizational) project
     */
    private isNucleusProject(projectRoot: string): boolean {
        const bloomPath = path.join(projectRoot, '.bloom');
        
        if (!fs.existsSync(bloomPath)) {
            return false;
        }
        
        // Check for nucleus-config.json
        const nucleusConfigPath = path.join(bloomPath, 'core', 'nucleus-config.json');
        if (!fs.existsSync(nucleusConfigPath)) {
            return false;
        }
        
        // Validate it's actually a nucleus config
        try {
            const content = fs.readFileSync(nucleusConfigPath, 'utf-8');
            const config = JSON.parse(content);
            return config.type === 'nucleus';
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Reads explicit strategy from .bloom/core/.strategy if exists
     */
    private readExplicitStrategy(projectRoot: string): string | null {
        const strategyPath = path.join(projectRoot, '.bloom', 'core', '.strategy');
        
        if (!fs.existsSync(strategyPath)) {
            return null;
        }
        
        try {
            const content = fs.readFileSync(strategyPath, 'utf-8').trim();
            return content;
        } catch (error) {
            return null;
        }
    }
    
    /**
     * Returns strategy instance by name
     */
    private getStrategyByName(name: string): CodebaseStrategy {
        switch (name.toLowerCase()) {
            case 'android':
                return new AndroidStrategy();
            case 'ios':
                return new IOSStrategy();
            case 'react-web':
            case 'react':
                return new ReactStrategy();
            case 'web':
                return new WebStrategy();
            case 'nucleus':
                return new NucleusStrategy();
            default:
                return new GenericStrategy();
        }
    }
    
    /**
     * Detects Android projects
     */
    private isAndroidProject(projectRoot: string): boolean {
        // Check for build.gradle in app/
        const appBuildGradle = path.join(projectRoot, 'app', 'build.gradle');
        const appBuildGradleKts = path.join(projectRoot, 'app', 'build.gradle.kts');
        
        if (fs.existsSync(appBuildGradle) || fs.existsSync(appBuildGradleKts)) {
            return true;
        }
        
        // Check for AndroidManifest.xml
        const manifest = path.join(projectRoot, 'app', 'src', 'main', 'AndroidManifest.xml');
        if (fs.existsSync(manifest)) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Detects iOS projects
     */
    private isIOSProject(projectRoot: string): boolean {
        // Check for .xcodeproj or .xcworkspace
        const items = fs.readdirSync(projectRoot);
        
        for (const item of items) {
            if (item.endsWith('.xcodeproj') || item.endsWith('.xcworkspace')) {
                return true;
            }
        }
        
        // Check for Podfile
        const podfile = path.join(projectRoot, 'Podfile');
        if (fs.existsSync(podfile)) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Detects React Web projects
     */
    private isReactProject(projectRoot: string): boolean {
        const packageJsonPath = path.join(projectRoot, 'package.json');
        
        if (!fs.existsSync(packageJsonPath)) {
            return false;
        }
        
        try {
            const content = fs.readFileSync(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(content);
            
            const deps = {
                ...packageJson.dependencies,
                ...packageJson.devDependencies
            };
            
            // Check for React
            if (deps['react'] || deps['react-dom']) {
                return true;
            }
            
        } catch (error) {
            return false;
        }
        
        return false;
    }
    
    /**
     * Detects generic web projects
     */
    private isWebProject(projectRoot: string): boolean {
        // Check for package.json
        const packageJsonPath = path.join(projectRoot, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            return true;
        }
        
        // Check for index.html
        const indexHtml = path.join(projectRoot, 'index.html');
        if (fs.existsSync(indexHtml)) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Gets a human-readable name for the detected strategy
     */
    static async getStrategyName(projectRoot: string): Promise<string> {
        const strategy = await this.detectStrategy(projectRoot);
        return strategy.name;
    }
    
    /**
     * Checks if a project has Nucleus link
     */
    static hasNucleusLink(projectRoot: string): boolean {
        const nucleusLinkPath = path.join(projectRoot, '.bloom', 'nucleus.json');
        return fs.existsSync(nucleusLinkPath);
    }
    
    /**
     * Reads Nucleus link configuration
     */
    static readNucleusLink(projectRoot: string): any {
        try {
            const linkPath = path.join(projectRoot, '.bloom', 'nucleus.json');
            if (!fs.existsSync(linkPath)) {
                return null;
            }
            
            const content = fs.readFileSync(linkPath, 'utf-8');
            return JSON.parse(content);
        } catch (error) {
            console.error('Error reading nucleus link:', error);
            return null;
        }
    }
    
    /**
     * Finds parent Nucleus project if linked
     */
    static findParentNucleus(projectRoot: string): string | null {
        const nucleusLink = this.readNucleusLink(projectRoot);
        
        if (!nucleusLink || !nucleusLink.nucleusPath) {
            return null;
        }
        
        // Resolve relative path
        const nucleusPath = path.resolve(projectRoot, nucleusLink.nucleusPath);
        
        // Verify it exists and is a Nucleus project
        if (fs.existsSync(nucleusPath) && this.isNucleusProject(nucleusPath)) {
            return nucleusPath;
        }
        
        return null;
    }
    
    /**
     * Static version for Nucleus project detection
     */
    private static isNucleusProject(projectRoot: string): boolean {
        const detector = new ProjectDetector();
        return detector.isNucleusProject(projectRoot);
    }
    
    /**
     * Gets all projects info including Nucleus relationships
     */
    static async getProjectInfo(projectRoot: string): Promise<{
        projectType: 'nucleus' | 'btip' | 'unknown';
        strategy: string;
        hasNucleusLink: boolean;
        nucleusPath?: string;
        organizationName?: string;
    }> {
        const bloomPath = path.join(projectRoot, '.bloom');
        
        if (!fs.existsSync(bloomPath)) {
            return {
                projectType: 'unknown',
                strategy: 'none',
                hasNucleusLink: false
            };
        }
        
        const isNucleus = this.isNucleusProject(projectRoot);
        const hasLink = this.hasNucleusLink(projectRoot);
        const strategy = await this.getStrategyName(projectRoot);
        
        const info: any = {
            projectType: isNucleus ? 'nucleus' : 'btip',
            strategy,
            hasNucleusLink: hasLink
        };
        
        if (hasLink) {
            const link = this.readNucleusLink(projectRoot);
            if (link) {
                info.nucleusPath = link.nucleusPath;
                info.organizationName = link.organizationName;
            }
        }
        
        if (isNucleus) {
            // Read nucleus config for organization name
            try {
                const configPath = path.join(bloomPath, 'core', 'nucleus-config.json');
                const content = fs.readFileSync(configPath, 'utf-8');
                const config = JSON.parse(content);
                info.organizationName = config.organization.name;
            } catch (error) {
                // Ignore
            }
        }
        
        return info;
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/ui/intent/intentForm.css
Metadatos: Lenguaje: css, Hash MD5: ff012a96dda3b528496db5ecdf746715

```css
* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background-color: var(--vscode-editor-background);
    padding: 20px;
    line-height: 1.6;
}

.container {
    max-width: 1200px;
    margin: 0 auto;
}

h1 {
    margin-bottom: 24px;
    font-size: 24px;
    color: var(--vscode-textLink-foreground);
}

.form-section {
    margin-bottom: 24px;
}

label {
    display: block;
    margin-bottom: 8px;
    font-weight: 600;
    font-size: 14px;
}

.required {
    color: var(--vscode-errorForeground);
}

.help-text {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-top: 4px;
    font-style: italic;
}

input[type="text"],
textarea {
    width: 100%;
    padding: 10px;
    background-color: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    transition: border-color 0.2s ease;
}

input[type="text"]:focus,
textarea:focus {
    outline: 1px solid var(--vscode-focusBorder);
    border-color: var(--vscode-focusBorder);
}

textarea {
    min-height: 120px;
    resize: vertical;
}

.editor-toolbar {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    padding: 4px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 4px;
}

.toolbar-btn {
    padding: 4px 8px;
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 2px;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
    transition: background-color 0.2s ease;
}

.toolbar-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
}

.toolbar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.file-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 12px;
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    min-height: 52px;
}

.file-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border-radius: 16px;
    transition: all 0.2s;
}

.file-pill:hover {
    background: var(--vscode-button-hoverBackground);
    transform: translateY(-1px);
}

.file-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 2px 4px;
    color: inherit;
    font-size: 14px;
    transition: opacity 0.2s;
}

.file-btn:hover {
    opacity: 0.7;
}

.file-btn.file-name {
    font-weight: 500;
    font-size: 13px;
}

.file-btn.file-remove {
    color: var(--vscode-errorForeground);
    font-weight: bold;
}

.token-counter {
    margin-top: 12px;
    padding: 12px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 4px;
    border: 1px solid var(--vscode-input-border);
}

.token-bar {
    width: 100%;
    height: 8px;
    background: var(--vscode-input-background);
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 8px;
}

.token-fill {
    height: 100%;
    transition: width 0.3s ease, background-color 0.3s ease;
    border-radius: 4px;
}

.token-counter.token-safe .token-fill {
    background: #4ec9b0;
}

.token-counter.token-warning .token-fill {
    background: #ce9178;
}

.token-counter.token-error .token-fill {
    background: var(--vscode-errorForeground);
}

.token-text {
    font-size: 13px;
    font-weight: 500;
}

.token-counter.token-safe .token-text {
    color: #4ec9b0;
}

.token-counter.token-warning .token-text {
    color: #ce9178;
}

.token-counter.token-error .token-text {
    color: var(--vscode-errorForeground);
}

.list-container {
    background-color: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 4px;
    padding: 10px;
    min-height: 60px;
}

.list-item {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    padding: 8px;
    background-color: var(--vscode-editor-background);
    border-radius: 3px;
}

.list-item:last-child {
    margin-bottom: 0;
}

.list-item input {
    flex: 1;
    margin-right: 10px;
    background-color: transparent;
    border: none;
    color: var(--vscode-foreground);
    padding: 6px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
}

.list-item input:focus {
    outline: 1px solid var(--vscode-focusBorder);
    border-radius: 2px;
}

.btn-remove {
    background: none;
    border: none;
    color: var(--vscode-errorForeground);
    cursor: pointer;
    padding: 0;
    font-size: 20px;
    line-height: 1;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    transition: background-color 0.2s ease;
}

.btn-remove:hover {
    background-color: rgba(244, 135, 113, 0.2);
}

.btn-add {
    background-color: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    margin-top: 8px;
    transition: background-color 0.2s ease;
}

.btn-add:hover {
    background-color: var(--vscode-button-secondaryHoverBackground);
}

.button-group {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 32px;
    padding-top: 20px;
    border-top: 1px solid var(--vscode-panel-border);
}

.button-spacer {
    flex: 1;
}

.btn-primary {
    padding: 10px 24px;
    background-color: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    font-size: 14px;
    transition: background-color 0.2s ease;
}

.btn-primary:hover {
    background-color: var(--vscode-button-hoverBackground);
}

.btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.btn-secondary {
    padding: 10px 24px;
    background-color: transparent;
    color: var(--vscode-foreground);
    border: 1px solid var(--vscode-panel-border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: background-color 0.2s ease;
}

.btn-secondary:hover {
    background-color: var(--vscode-list-hoverBackground);
}

.btn-danger {
    padding: 10px 24px;
    background-color: transparent;
    color: var(--vscode-errorForeground);
    border: 1px solid var(--vscode-errorForeground);
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s ease;
}

.btn-danger:hover {
    background-color: var(--vscode-errorForeground);
    color: var(--vscode-editor-background);
}

.auto-save-indicator {
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 16px;
    padding: 8px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 4px;
    transition: opacity 0.3s ease;
}

.error-message {
    background-color: rgba(244, 135, 113, 0.2);
    border-left: 3px solid var(--vscode-errorForeground);
    padding: 12px;
    margin-bottom: 20px;
    border-radius: 4px;
    display: none;
    animation: fadeIn 0.3s ease;
}

.error-message strong {
    display: block;
    margin-bottom: 8px;
    color: var(--vscode-errorForeground);
}

.error-message ul {
    margin: 0;
    padding-left: 20px;
}

.error-message li {
    margin-bottom: 4px;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(-10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/ui/intent/intentForm.html
Metadatos: Lenguaje: html, Hash MD5: 233a448be936bc92ba1f99fe3a36f3de

```html
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Generate Intent</title>
    <!-- CSS_PLACEHOLDER -->
</head>
<body>
    <div class="container">
        <h1>🌸 Crear Bloom Intent</h1>

        <div class="auto-save-indicator" id="autoSaveIndicator">
            💾 Draft guardado automáticamente
        </div>

        <div id="errorMessage" class="error-message">
            <strong>⚠️ Errores de validación:</strong>
            <ul id="errorList"></ul>
        </div>

        <form id="intentForm">
            <div class="form-section">
                <label for="name">Nombre del Intent <span class="required">*</span></label>
                <input type="text" id="name" name="name" placeholder="fix-login-crash" required>
                <p class="help-text">Solo letras minúsculas, números y guiones</p>
            </div>

            <!-- profileManager.html -->
            <div class="profile-container">
                <h2>Chrome Profiles Detected</h2>
                <div id="profilesList"></div>
                
                <h2>Intent → Profile Mapping</h2>
                <table id="intentMappings">
                    <tr>
                        <th>Intent</th>
                        <th>Chrome Profile</th>
                        <th>Claude Account</th>
                        <th>Actions</th>
                    </tr>
                </table>
                
                <button onclick="scanProfiles()">🔄 Scan Profiles</button>
            </div>

            <div class="form-section">
                <label>📁 Archivos relevantes</label>
                <div class="file-pills" id="filePills">
                    <!-- Generado dinámicamente -->
                </div>
                <div class="token-counter" id="tokenCounter">
                    <div class="token-bar">
                        <div class="token-fill" id="tokenFill"></div>
                    </div>
                    <div class="token-text" id="tokenText">
                        📊 Token estimate: 0 / 100,000 (0%)
                    </div>
                </div>
            </div>

            <div class="form-section">
                <label for="problem">¿Qué problema quieres resolver? <span class="required">*</span></label>
                
                <div class="editor-toolbar">
                    <button type="button" class="toolbar-btn" onclick="formatText('bold')" title="Negrita">B</button>
                    <button type="button" class="toolbar-btn" onclick="formatText('italic')" title="Cursiva">I</button>
                    <button type="button" class="toolbar-btn" onclick="formatText('code')" title="Código">```</button>
                    <button type="button" class="toolbar-btn" onclick="formatText('list')" title="Lista">• -</button>
                </div>
                
                <textarea id="problem" name="problem" placeholder="Describe el problema en detalle..." required></textarea>
            </div>

            <div class="form-section">
                <label for="expectedOutput">Output Esperado <span class="required">*</span></label>
                <textarea id="expectedOutput" name="expectedOutput" placeholder="Describe el resultado esperado..." required></textarea>
            </div>

            <div class="form-section">
                <label>Comportamiento Actual</label>
                <div class="list-container" id="currentBehaviorList"></div>
                <button type="button" class="btn-add" onclick="addListItem('currentBehavior')">
                    + Agregar paso
                </button>
            </div>

            <div class="form-section">
                <label>Comportamiento Deseado</label>
                <div class="list-container" id="desiredBehaviorList"></div>
                <button type="button" class="btn-add" onclick="addListItem('desiredBehavior')">
                    + Agregar paso
                </button>
            </div>

            <div class="form-section">
                <label for="considerations">💬 Consideraciones adicionales (opcional)</label>
                <textarea id="considerations" name="considerations" rows="3" placeholder="Ej: Usar Retrofit, mantener estilo actual"></textarea>
            </div>

            <div class="button-group">
                <button type="submit" class="btn-primary" id="generateBtn">✨ Generar Intent</button>
                <button type="button" class="btn-secondary" onclick="cancel()">Cancelar</button>
                <div class="button-spacer"></div>
                <button type="button" class="btn-danger" id="deleteBtn" onclick="deleteIntent()">🗑️ Delete Intent</button>
            </div>
        </form>
    </div>
    
    <!-- JS_PLACEHOLDER -->
</body>
</html>
```

### C:/repos/bloom-videos/bloom-development-extension/src/ui/intent/intentForm.js
Metadatos: Lenguaje: javascript, Hash MD5: 0335754214d96bc50c860d2a97614f38

```javascript
const vscode = acquireVsCodeApi();
let lastFocusedField = null;
let autoSaveTimer = null;
let isEditMode = false;

let listCounters = {
    currentBehavior: 0,
    desiredBehavior: 0
};

document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
        lastFocusedField = e.target;
    }
});

function formatText(type) {
    const textarea = lastFocusedField || document.getElementById('problem');
    if (!textarea || textarea.tagName !== 'TEXTAREA') return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    let formatted = selected;

    switch(type) {
        case 'bold':
            formatted = `**${selected}**`;
            break;
        case 'italic':
            formatted = `*${selected}*`;
            break;
        case 'code':
            formatted = `\`\`\`\n${selected}\n\`\`\``;
            break;
        case 'list':
            formatted = selected.split('\n').map(line => line ? `- ${line}` : '').join('\n');
            break;
    }

    textarea.value = textarea.value.substring(0, start) + formatted + textarea.value.substring(end);
    textarea.selectionStart = start;
    textarea.selectionEnd = start + formatted.length;
    textarea.focus();

    triggerAutoSave();
}

function insertFileName(filename) {
    const target = lastFocusedField || document.getElementById('problem');
    if (!target || (target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT')) {
        alert('Haz click en un campo de texto primero');
        return;
    }

    const start = target.selectionStart || 0;
    const end = target.selectionEnd || 0;
    const text = filename + ' ';

    target.value = target.value.substring(0, start) + text + target.value.substring(end);
    target.selectionStart = target.selectionEnd = start + text.length;
    target.focus();

    triggerAutoSave();
}

function openFileInVSCode(filePath) {
    vscode.postMessage({
        command: 'openFileInVSCode',
        filePath: filePath
    });
}

function copyFilePath(filePath) {
    vscode.postMessage({
        command: 'copyFilePath',
        filePath: filePath
    });
}

function revealInFinder(filePath) {
    vscode.postMessage({
        command: 'revealInFinder',
        filePath: filePath
    });
}

function removeFile(filePath) {
    vscode.postMessage({
        command: 'removeFile',
        filePath: filePath
    });
}

function addListItem(listName) {
    const listContainer = document.getElementById(listName + 'List');
    const itemId = listName + '_' + listCounters[listName]++;
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'list-item';
    itemDiv.id = itemId;
    itemDiv.innerHTML = `
        <input type="text" placeholder="Escribir aquí..." />
        <button type="button" class="btn-remove" onclick="removeListItem('${itemId}')" title="Eliminar">×</button>
    `;
    
    listContainer.appendChild(itemDiv);
    
    const newInput = itemDiv.querySelector('input');
    if (newInput) {
        newInput.focus();
        newInput.addEventListener('input', triggerAutoSave);
    }

    triggerAutoSave();
}

function removeListItem(itemId) {
    const item = document.getElementById(itemId);
    if (item) {
        item.remove();
        triggerAutoSave();
    }
}

function getListValues(listName) {
    const listContainer = document.getElementById(listName + 'List');
    const inputs = listContainer.querySelectorAll('input');
    return Array.from(inputs)
        .map(input => input.value.trim())
        .filter(v => v.length > 0);
}

function triggerAutoSave() {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
        const updates = {
            problem: document.getElementById('problem').value,
            expectedOutput: document.getElementById('expectedOutput').value,
            currentBehavior: getListValues('currentBehavior'),
            desiredBehavior: getListValues('desiredBehavior'),
            considerations: document.getElementById('considerations').value
        };
        
        vscode.postMessage({
            command: 'autoSave',
            updates: updates
        });
        
        showAutoSaveIndicator();
    }, 2000);
}

function showAutoSaveIndicator() {
    const indicator = document.getElementById('autoSaveIndicator');
    indicator.textContent = '💾 Guardado ' + new Date().toLocaleTimeString();
    indicator.style.opacity = '1';

    setTimeout(() => {
        indicator.style.opacity = '0.6';
    }, 2000);
}

function showValidationErrors(errors) {
    const errorDiv = document.getElementById('errorMessage');
    const errorList = document.getElementById('errorList');
    
    errorList.innerHTML = errors.map(err => `<li>${err}</li>`).join('');
    errorDiv.style.display = 'block';
    
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function hideValidationErrors() {
    const errorDiv = document.getElementById('errorMessage');
    errorDiv.style.display = 'none';
}

function updateTokenDisplay(tokens) {
    const tokenText = document.getElementById('tokenText');
    const tokenFill = document.getElementById('tokenFill');
    const tokenCounter = document.getElementById('tokenCounter');
    
    const percentage = tokens.percentage;
    const estimated = tokens.estimated.toLocaleString();
    const limit = tokens.limit.toLocaleString();
    
    tokenFill.style.width = Math.min(percentage, 100) + '%';
    
    if (percentage < 80) {
        tokenCounter.className = 'token-counter token-safe';
        tokenText.textContent = `📊 Token estimate: ${estimated} / ${limit} (${percentage.toFixed(1)}%)`;
    } else if (percentage < 100) {
        tokenCounter.className = 'token-counter token-warning';
        tokenText.textContent = `⚠️ Warning: ${estimated} / ${limit} (${percentage.toFixed(1)}%) - Consider removing files`;
    } else {
        tokenCounter.className = 'token-counter token-error';
        tokenText.textContent = `❌ Error: ${estimated} / ${limit} (${percentage.toFixed(1)}%) - Cannot generate, remove files`;
        document.getElementById('generateBtn').disabled = true;
    }
}

document.getElementById('intentForm').addEventListener('submit', (e) => {
    e.preventDefault();
    
    hideValidationErrors();

    const formData = {
        name: document.getElementById('name').value.trim(),
        problem: document.getElementById('problem').value.trim(),
        expectedOutput: document.getElementById('expectedOutput').value.trim(),
        currentBehavior: getListValues('currentBehavior'),
        desiredBehavior: getListValues('desiredBehavior'),
        considerations: document.getElementById('considerations').value.trim(),
        selectedFiles: []
    };

    vscode.postMessage({
        command: 'submit',
        data: formData
    });
});

function cancel() {
    if (confirm('¿Estás seguro de que quieres cancelar? Se perderán todos los cambios.')) {
        vscode.postMessage({ command: 'cancel' });
    }
}

function deleteIntent() {
    vscode.postMessage({ command: 'deleteIntent' });
}

function updateGenerateButton() {
    const hasName = document.getElementById('name').value.length > 0;
    const hasProblem = document.getElementById('problem').value.length > 20;
    const hasOutput = document.getElementById('expectedOutput').value.length > 10;
    
    document.getElementById('generateBtn').disabled = !(hasName && hasProblem && hasOutput);
}

document.getElementById('problem').addEventListener('input', () => {
    triggerAutoSave();
    updateGenerateButton();
});

document.getElementById('name').addEventListener('input', () => {
    triggerAutoSave();
    updateGenerateButton();
});

document.getElementById('expectedOutput').addEventListener('input', () => {
    triggerAutoSave();
    updateGenerateButton();
});

document.getElementById('considerations').addEventListener('input', triggerAutoSave);

window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.command) {
        case 'setFiles':
            renderFilePills(message.files);
            break;
            
        case 'updateTokens':
            updateTokenDisplay(message.tokens);
            break;
            
        case 'loadExistingIntent':
            loadExistingIntentData(message.data);
            break;
            
        case 'validationErrors':
            showValidationErrors(message.errors);
            break;
            
        case 'error':
            alert('Error: ' + message.message);
            break;
    }
});

function renderFilePills(files) {
    const container = document.getElementById('filePills');
    
    if (!files || files.length === 0) {
        container.innerHTML = '<p class="help-text">No hay archivos seleccionados</p>';
        return;
    }
    
    container.innerHTML = files.map(file => `
        <div class="file-pill">
            <button type="button" class="file-btn file-name" onclick="insertFileName('${file.filename}')" title="Insertar nombre">
                📄 ${file.filename}
            </button>
            <button type="button" class="file-btn" onclick="openFileInVSCode('${file.relativePath}')" title="Abrir en VSCode">
                🔗
            </button>
            <button type="button" class="file-btn" onclick="copyFilePath('${file.relativePath}')" title="Copiar path">
                📋
            </button>
            <button type="button" class="file-btn" onclick="revealInFinder('${file.relativePath}')" title="Mostrar en Finder/Explorer">
                📂
            </button>
            <button type="button" class="file-btn file-remove" onclick="removeFile('${file.relativePath}')" title="Remover">
                ❌
            </button>
        </div>
    `).join('');
}

function loadExistingIntentData(data) {
    isEditMode = true;
    
    document.getElementById('name').value = data.name || '';
    document.getElementById('name').disabled = true;
    
    document.getElementById('problem').value = data.content.problem || '';
    document.getElementById('expectedOutput').value = data.content.expectedOutput || '';
    document.getElementById('considerations').value = data.content.considerations || '';
    
    if (data.content.currentBehavior && Array.isArray(data.content.currentBehavior)) {
        data.content.currentBehavior.forEach(value => {
            addListItem('currentBehavior');
            const items = document.getElementById('currentBehaviorList').querySelectorAll('.list-item');
            const lastItem = items[items.length - 1];
            if (lastItem) {
                lastItem.querySelector('input').value = value;
            }
        });
    }

    if (data.content.desiredBehavior && Array.isArray(data.content.desiredBehavior)) {
        data.content.desiredBehavior.forEach(value => {
            addListItem('desiredBehavior');
            const items = document.getElementById('desiredBehaviorList').querySelectorAll('.list-item');
            const lastItem = items[items.length - 1];
            if (lastItem) {
                lastItem.querySelector('input').value = value;
            }
        });
    }
    
    const generateBtn = document.getElementById('generateBtn');
    if (data.status === 'completed') {
        generateBtn.textContent = '🔄 Regenerar Intent';
    }
    
    const deleteBtn = document.getElementById('deleteBtn');
    deleteBtn.style.display = 'block';
}

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        document.getElementById('intentForm').dispatchEvent(new Event('submit'));
    }
    
    if (e.key === 'Escape') {
        cancel();
    }
});

addListItem('currentBehavior');
addListItem('desiredBehavior');
updateGenerateButton();

const deleteBtn = document.getElementById('deleteBtn');
deleteBtn.style.display = 'none';
```

### C:/repos/bloom-videos/bloom-development-extension/src/ui/intent/intentFormPanel.ts
Metadatos: Lenguaje: typescript, Hash MD5: 1efcfa2f54ebd76a205cd90d6306c1ad

```typescript
// src/ui/intentFormPanel.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../../utils/logger';
import { Validator } from '../../core/validator';
import { IntentGenerator } from '../../core/intentGenerator';
import { MetadataManager } from '../../core/metadataManager';
import { CodebaseGenerator } from '../../core/codebaseGenerator';
import { IntentSession } from '../../core/intentSession';
import { TokenEstimator, TokenEstimation } from '../../utils/tokenEstimator';
import { PythonExecutor } from '../../utils/pythonExecutor';
import { IntentFormData, TokenStats } from '../../models/intent';
import { joinPath } from '../../utils/uriHelper';


export class IntentFormPanel {
    private panel: vscode.WebviewPanel | undefined;
    private session: IntentSession | undefined;
    private isEditMode: boolean = false;
    private intentName: string | undefined;
    private pythonExecutor: PythonExecutor;
    private tokenEstimation: TokenEstimation | undefined;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger,
        private workspaceFolder: vscode.WorkspaceFolder,
        private selectedFiles: vscode.Uri[],
        private relativePaths: string[],
        existingIntentName?: string
    ) {
        this.intentName = existingIntentName;
        this.isEditMode = !!existingIntentName;
        this.pythonExecutor = new PythonExecutor(logger);
    }

    async show(): Promise<void> {
        this.panel = vscode.window.createWebviewPanel(
            'bloomIntentForm',
            this.isEditMode ? 'Bloom: Edit Intent' : 'Bloom: Generate Intent',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    joinPath(this.context.extensionUri, 'src', 'ui')
                ]
            }
        );

        this.panel.webview.html = this.getHtmlContent();
        
        // Inicializar sesión
        if (this.isEditMode && this.intentName) {
            await this.loadExistingIntent(this.intentName);
        } else {
            await this.createNewSession();
        }

        this.setupMessageListener();
        this.setupSessionListeners();

        // Enviar archivos iniciales
        this.sendFilesToWebview();
        
        // Calcular tokens iniciales
        if (this.relativePaths.length > 0) {
            await this.calculateAndSendTokens();
        }

        this.logger.info('Formulario de intent abierto');
    }

    private async createNewSession(): Promise<void> {
        const metadataManager = new MetadataManager(this.logger);
        const codebaseGenerator = new CodebaseGenerator();
        const intentGenerator = new IntentGenerator(this.logger);

        const intentFolder = vscode.Uri.file(
            path.join(this.workspaceFolder.uri.fsPath, '.bloom', 'intents', 'temp_' + Date.now())
        );

        this.session = await IntentSession.create(
            intentFolder,
            this.workspaceFolder,
            this.selectedFiles,
            this.relativePaths,
            metadataManager,
            codebaseGenerator,
            intentGenerator,
            this.logger
        );
    }

    private async loadExistingIntent(intentName: string): Promise<void> {
        const metadataManager = new MetadataManager(this.logger);
        const codebaseGenerator = new CodebaseGenerator();
        const intentGenerator = new IntentGenerator(this.logger);

        this.session = await IntentSession.forIntent(
            intentName,
            this.workspaceFolder,
            metadataManager,
            codebaseGenerator,
            intentGenerator,
            this.logger
        );

        const state = this.session.getState();
        
        // Cargar datos existentes en el formulario
        this.panel?.webview.postMessage({
            command: 'loadExistingIntent',
            data: {
                name: state.name,
                content: state.content,
                status: state.status
            }
        });
    }

    private setupSessionListeners(): void {
        if (!this.session) return;

        this.session.on('filesChanged', (files: string[]) => {
            this.relativePaths = files;
            this.sendFilesToWebview();
            this.calculateAndSendTokens();
            this.logger.info(`Archivos actualizados: ${files.length}`);
        });

        this.session.on('tokensChanged', (tokens: TokenStats) => {
            this.panel?.webview.postMessage({
                command: 'updateTokens',
                tokens
            });
        });

        this.session.on('stateChanged', (state: any) => {
            this.logger.info(`Estado del intent actualizado: ${state.status}`);
        });
    }

    private sendFilesToWebview(): void {
        if (!this.panel) return;

        const filesData = this.relativePaths.map(filePath => ({
            filename: path.basename(filePath),
            fullPath: filePath,
            relativePath: filePath
        }));

        this.panel.webview.postMessage({
            command: 'setFiles',
            files: filesData
        });
    }

    private async calculateAndSendTokens(): Promise<void> {
        if (!this.session) return;

        try {
            const intentFolder = this.session.getState().intentFolder;
            
            this.tokenEstimation = await TokenEstimator.estimateIntent(
                intentFolder,
                this.relativePaths
            );

            // Enviar al webview
            this.panel?.webview.postMessage({
                command: 'updateTokens',
                tokens: {
                    estimated: this.tokenEstimation.totalTokens,
                    limit: 100000,
                    percentage: this.tokenEstimation.percentage * 100
                }
            });

            // Mostrar alerta si es necesario
            const alertMessage = TokenEstimator.getAlertMessage(this.tokenEstimation);
            if (alertMessage) {
                if (this.tokenEstimation.error) {
                    vscode.window.showErrorMessage(alertMessage);
                } else if (this.tokenEstimation.warning) {
                    vscode.window.showWarningMessage(alertMessage);
                }
            }

        } catch (error: any) {
            this.logger.error(`Error calculando tokens: ${error.message}`);
        }
    }

    private setupMessageListener(): void {
        if (!this.panel) return;

        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'submit':
                        await this.handleSubmit(message.data);
                        break;
                    case 'cancel':
                        this.panel?.dispose();
                        break;
                    case 'openFileInVSCode':
                        await this.handleOpenFileInVSCode(message.filePath);
                        break;
                    case 'copyFilePath':
                        await this.handleCopyFilePath(message.filePath);
                        break;
                    case 'revealInFinder':
                        await this.handleRevealInFinder(message.filePath);
                        break;
                    case 'removeFile':
                        await this.handleRemoveFile(message.filePath);
                        break;
                    case 'autoSave':
                        await this.handleAutoSave(message.updates);
                        break;
                    case 'deleteIntent':
                        await this.handleDeleteIntent();
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );
    }

    private async handleOpenFileInVSCode(filePath: string): Promise<void> {
        const fullPath = path.join(this.workspaceFolder.uri.fsPath, filePath);
        const fileUri = vscode.Uri.file(fullPath);
        
        try {
            await vscode.window.showTextDocument(fileUri, {
                viewColumn: vscode.ViewColumn.Beside
            });
        } catch (error: any) {
            this.logger.error(`Error abriendo archivo: ${error.message}`);
            vscode.window.showErrorMessage(`No se pudo abrir: ${filePath}`);
        }
    }

    private async handleCopyFilePath(filePath: string): Promise<void> {
        const fullPath = path.join(this.workspaceFolder.uri.fsPath, filePath);
        await vscode.env.clipboard.writeText(fullPath);
        vscode.window.showInformationMessage('Path copiado al clipboard');
    }

    private async handleRevealInFinder(filePath: string): Promise<void> {
        const fullPath = path.join(this.workspaceFolder.uri.fsPath, filePath);
        const fileUri = vscode.Uri.file(fullPath);
        
        await vscode.commands.executeCommand('revealFileInOS', fileUri);
    }

    private async handleRemoveFile(filePath: string): Promise<void> {
        if (!this.session) return;

        const confirm = await vscode.window.showWarningMessage(
            `¿Remover ${path.basename(filePath)}?`,
            'Remover',
            'Cancelar'
        );

        if (confirm === 'Remover') {
            await this.session.removeFile(filePath);
            vscode.window.showInformationMessage(`Archivo removido: ${path.basename(filePath)}`);
            
            // Recalcular tokens
            await this.calculateAndSendTokens();
        }
    }

    private async handleAutoSave(updates: any): Promise<void> {
        if (!this.session) return;

        this.session.queueAutoSave(updates);
    }

    private async handleDeleteIntent(): Promise<void> {
        if (!this.session) return;

        const state = this.session.getState();
        
        const confirm = await vscode.window.showWarningMessage(
            `¿Eliminar intent '${state.name}'?`,
            {
                modal: true,
                detail: `Esto borrará la carpeta .bloom/intents/${state.name}/ permanentemente.`
            },
            'Eliminar'
        );

        if (confirm === 'Eliminar') {
            await this.session.deleteIntent();
            this.panel?.dispose();
            vscode.window.showInformationMessage(`Intent '${state.name}' eliminado`);
            
            // Refrescar tree view
            vscode.commands.executeCommand('workbench.view.extension.bloomIntents');
        }
    }

    private async handleSubmit(data: IntentFormData): Promise<void> {
        this.logger.info('Procesando formulario de intent');

        // Validar que no exceda tokens
        if (this.tokenEstimation?.error) {
            vscode.window.showErrorMessage(
                '❌ No se puede generar: excede el límite de tokens. Remueve archivos primero.'
            );
            return;
        }

        if (!data.name || data.name.length < 3) {
            vscode.window.showErrorMessage('El nombre del intent debe tener al menos 3 caracteres');
            return;
        }

        const validator = new Validator();
        const validation = validator.validate(data);

        if (!validation.isValid) {
            this.panel?.webview.postMessage({
                command: 'validationErrors',
                errors: validation.errors
            });
            this.logger.warn(`Errores de validación: ${validation.errors.join(', ')}`);
            return;
        }

        if (!this.session) {
            vscode.window.showErrorMessage('Error: Sesión no inicializada');
            return;
        }

        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: this.isEditMode ? 'Regenerando intent' : 'Generando intent',
                    cancellable: false
                },
                async (progress) => {
                    // Crear carpeta definitiva si es nuevo intent
                    if (!this.isEditMode) {
                        progress.report({ message: 'Creando estructura...' });
                        
                        const intentFolder = vscode.Uri.file(
                            path.join(this.workspaceFolder.uri.fsPath, '.bloom', 'intents', data.name)
                        );
                        
                        await this.ensureDirectory(vscode.Uri.file(path.join(this.workspaceFolder.uri.fsPath, '.bloom')));
                        await this.ensureDirectory(vscode.Uri.file(path.join(this.workspaceFolder.uri.fsPath, '.bloom', 'intents')));
                        await this.ensureDirectory(intentFolder);
                        
                        // Actualizar sesión con carpeta definitiva
                        const metadataManager = new MetadataManager(this.logger);
                        const codebaseGenerator = new CodebaseGenerator();
                        const intentGenerator = new IntentGenerator(this.logger);
                        
                        this.session = await IntentSession.create(
                            intentFolder,
                            this.workspaceFolder,
                            this.selectedFiles,
                            this.relativePaths,
                            metadataManager,
                            codebaseGenerator,
                            intentGenerator,
                            this.logger
                        );
                    }

                    progress.report({ message: 'Generando codebase.bl...' });

                    // Generar codebase.bl (con opción de script Python)
                    await this.generateCodebase();

                    progress.report({ message: 'Guardando intent...' });

                    // Generar o regenerar intent
                    if (this.isEditMode) {
                        await this.session!.regenerateIntent(data);
                        vscode.window.showInformationMessage(`✅ Intent '${data.name}' regenerado exitosamente`);
                    } else {
                        await this.session!.generateIntent(data);
                        vscode.window.showInformationMessage(`✅ Intent '${data.name}' creado exitosamente`);
                    }
                }
            );

            this.panel?.dispose();
            
            // Refrescar tree view
            vscode.commands.executeCommand('workbench.view.extension.bloomIntents');

            this.logger.info('Intent generado exitosamente');

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Error al generar intent: ${errorMessage}`);
            this.logger.error('Error al generar intent', error as Error);

            this.panel?.webview.postMessage({
                command: 'error',
                message: errorMessage
            });
        }
    }

    private async generateCodebase(): Promise<void> {
        const useCustom = vscode.workspace.getConfiguration('bloom')
            .get('useCustomCodebaseGenerator', false);

        if (useCustom) {
            // Intentar usar script Python personalizado
            const intentPath = this.session!.getState().intentFolder.fsPath;
            const result = await this.pythonExecutor.generateCodebase(
                intentPath,
                this.relativePaths
            );

            if (!result.success) {
                this.logger.warn('Script Python falló, usando generador nativo');
                await this.generateCodebaseNative();
            }
        } else {
            // Usar generador nativo TypeScript
            await this.generateCodebaseNative();
        }
    }

    private async generateCodebaseNative(): Promise<void> {
        let codebaseContent = '# CODEBASE\n\n';

        for (const filePath of this.relativePaths) {
            try {
                const fullPath = joinPath(this.workspaceFolder.uri, filePath);
                const fileContent = await vscode.workspace.fs.readFile(fullPath);
                const text = Buffer.from(fileContent).toString('utf-8');

                codebaseContent += `## Archivo: ${filePath}\n\n`;
                codebaseContent += '```\n';
                codebaseContent += text;
                codebaseContent += '\n```\n\n';

            } catch (error) {
                this.logger.warn(`No se pudo leer: ${filePath}`);
            }
        }

        const intentFolder = this.session!.getState().intentFolder;
        const codebasePath = joinPath(intentFolder, 'codebase.bl');

        await vscode.workspace.fs.writeFile(
            codebasePath,
            Buffer.from(codebaseContent, 'utf-8')
        );

        this.logger.info('codebase.bl generado con método nativo');
    }

    private async ensureDirectory(uri: vscode.Uri): Promise<void> {
        try {
            await vscode.workspace.fs.stat(uri);
        } catch {
            await vscode.workspace.fs.createDirectory(uri);
        }
    }

    private getHtmlContent(): string {
        const htmlPath = path.join(this.context.extensionPath, 'src', 'ui', 'intentForm.html');
        const cssPath = path.join(this.context.extensionPath, 'src', 'ui', 'intentForm.css');
        const jsPath = path.join(this.context.extensionPath, 'src', 'ui', 'intentForm.js');

        let htmlContent = fs.readFileSync(htmlPath, 'utf8');
        const cssContent = fs.readFileSync(cssPath, 'utf8');
        const jsContent = fs.readFileSync(jsPath, 'utf8');

        htmlContent = htmlContent.replace('<!-- CSS_PLACEHOLDER -->', `<style>${cssContent}</style>`);
        htmlContent = htmlContent.replace('<!-- JS_PLACEHOLDER -->', `<script>${jsContent}</script>`);

        return htmlContent;
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/ui/nucleus/NucleusSetupPanel.ts
Metadatos: Lenguaje: typescript, Hash MD5: 6bc86aaeff1de6c434100199280f259d

```typescript
// src/ui/nucleus/NucleusSetupPanel.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { NucleusManager } from '../../core/nucleusManager';
import { getCurrentGitHubUser } from '../../utils/githubOAuth';
import { getUserOrgs } from '../../utils/githubApi';
import { UserManager } from '../../managers/userManager';

export class NucleusSetupPanel {
    private panel: vscode.WebviewPanel | undefined;
    private nucleusManager: NucleusManager;

    constructor(private context: vscode.ExtensionContext) {
        this.nucleusManager = new NucleusManager(context);
    }

    show() {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'bloomNucleusSetup',
            'Crear Nucleus',
            vscode.ViewColumn.One,
            { enableScripts: true, retainContextWhenHidden: true }
        );

        this.panel.webview.html = this.getHtml();
        this.panel.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case 'loadData':
                    await this.loadData();
                    break;
                case 'createNucleus':
                    await this.createNucleus(msg.org, msg.localPath, msg.isNew);
                    break;
            }
        });

        this.panel.onDidDispose(() => { this.panel = undefined; });
    }

    private async loadData() {
        try {
            const user = await getCurrentGitHubUser();
            const orgs = await getUserOrgs();

            this.panel?.webview.postMessage({
                command: 'dataLoaded',
                orgs
            });
        } catch (err: any) {
            this.panel?.webview.postMessage({ command: 'error', text: err.message });
        }
    }

    private async createNucleus(org: string, localPath: string, isNew: boolean) {
        try {
            const nucleusPath = await this.nucleusManager.createOrLinkNucleus(org, localPath, isNew);

            await UserManager.init(this.context).saveUser({
                githubUsername: (await getCurrentGitHubUser()).login,
                githubOrg: org
            });

            this.panel?.webview.postMessage({ command: 'success', path: nucleusPath });
        } catch (err: any) {
            this.panel?.webview.postMessage({ command: 'error', text: err.message });
        }
    }

    private getHtml(): string {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); padding: 20px; }
                    h1 { font-size: 24px; margin-bottom: 20px; }
                    p { margin-bottom: 20px; }
                    select, input { width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 4px; border: 1px solid var(--vscode-input-border); }
                    button { padding: 10px; border-radius: 4px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; cursor: pointer; margin: 5px 0; }
                    button:hover { background: var(--vscode-button-hoverBackground); }
                </style>
            </head>
            <body>
                <h1>Crear un Nuevo Nucleus</h1>
                <p>Selecciona la organización y la ubicación local para tu Nucleus.</p>
                <button id="loadBtn">Cargar Organizaciones</button>

                <select id="org" style="display:none;">
                    <option value="">Selecciona Organización</option>
                </select>

                <button id="newBtn" style="display:none;">Crear Carpeta Nueva</button>
                <button id="existingBtn" style="display:none;">Usar Carpeta Existente</button>

                <input type="text" id="localPath" placeholder="Ruta local" readonly style="display:none;"/>

                <button id="createBtn" disabled style="display:none;">Crear Nucleus</button>

                <div id="status"></div>

                <script>
                    const vscode = acquireVsCodeApi();

                    document.getElementById('loadBtn').onclick = () => {
                        vscode.postMessage({ command: 'loadData' });
                    };

                    document.getElementById('newBtn').onclick = async () => {
                        const folder = await vscode.window.showOpenDialog({ canSelectFolders: true });
                        if (folder) document.getElementById('localPath').value = folder[0].fsPath;
                    };

                    document.getElementById('existingBtn').onclick = async () => {
                        const folder = await vscode.window.showOpenDialog({ canSelectFolders: true });
                        if (folder) document.getElementById('localPath').value = folder[0].fsPath;
                    };

                    document.getElementById('createBtn').onclick = () => {
                        const org = document.getElementById('org').value;
                        const localPath = document.getElementById('localPath').value;
                        const isNew = document.getElementById('newBtn').clicked; // Simplificado
                        vscode.postMessage({ command: 'createNucleus', org, localPath, isNew });
                    };

                    window.addEventListener('message', e => {
                        const msg = e.data;
                        if (msg.command === 'dataLoaded') {
                            const select = document.getElementById('org');
                            msg.orgs.forEach(o => {
                                const opt = document.createElement('option');
                                opt.value = o.login;
                                opt.textContent = o.login;
                                select.appendChild(opt);
                            });
                            select.style.display = 'block';
                            document.getElementById('newBtn').style.display = 'block';
                            document.getElementById('existingBtn').style.display = 'block';
                            document.getElementById('createBtn').style.display = 'block';
                            document.getElementById('createBtn').disabled = false;
                        }
                        if (msg.command === 'success') {
                            document.getElementById('status').textContent = 'Nucleus creado!';
                        }
                        if (msg.command === 'error') {
                            document.getElementById('status').textContent = msg.text;
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/ui/welcome/welcomeView.ts
Metadatos: Lenguaje: typescript, Hash MD5: d46d07883be22b5c3a9fd5782beace9b

```typescript
// src/ui/welcome/welcomeView.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { UserManager } from '../../managers/userManager';
import { getUserOrgs } from '../../utils/githubApi';
import { getCurrentGitHubUser } from '../../utils/githubOAuth';

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
            vscode.window.showInformationMessage('Creando tu Nucleus...');

            const user = await getCurrentGitHubUser();
            const orgs = await getUserOrgs();

            // GUARDAR TODAS LAS ORGS
            await UserManager.init(this.context).saveUser({
                githubUsername: user.login,
                githubOrg: githubOrg || user.login,
                allOrgs: [user.login, ...orgs.map(o => o.login)]
            });

            this.panel?.webview.postMessage({ 
                command: 'nucleusCreated', 
                message: '¡Listo! Ya podés usar Bloom.' 
            });

            setTimeout(() => {
                this.panel?.dispose();
                vscode.commands.executeCommand('bloom.focusRealNucleusView');
            }, 2000);

        } catch (err: any) {
            this.panel?.webview.postMessage({
                command: 'error',
                text: err.message || 'Error creando Nucleus'
            });
        }
    }

    private getHtml(): string {
        const htmlPath = path.join(this.context.extensionPath, 'src', 'ui', 'welcome', 'welcomeView.html');
        return require('fs').readFileSync(htmlPath, 'utf-8');
    }
}
```

### C:/repos/bloom-videos/bloom-development-extension/src/utils/githubOAuth.ts
Metadatos: Lenguaje: typescript, Hash MD5: 4021a1a307d87b1a9bd3c5cacc0a1d55

```typescript
// src/utils/githubOAuth.ts
import * as vscode from 'vscode';

const GITHUB_AUTH_PROVIDER_ID = 'github';
const SCOPES = ['repo', 'read:org', 'user:email'];

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

export async function getGitHubSession(): Promise<vscode.AuthenticationSession> {
    const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, {
        createIfNone: true
    });

    if (!session) {
        throw new Error('No se pudo autenticar con GitHub');
    }

    return session;
}

export async function getGitHubToken(): Promise<string> {
    const session = await getGitHubSession();
    return session.accessToken;
}

export async function getGitHubHeaders(): Promise<Record<string, string>> {
    const token = await getGitHubToken();
    return {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Bloom-VSCode-Extension'
    };
}


```

