# Snapshot de Codebase
Este archivo consolida todo el código del proyecto para indexación rápida por IA. Primero el índice jerárquico, luego cada archivo con su path como título y código en bloque Markdown.

**Origen:** Archivos específicos: 14
**Total de archivos:** 14

## Índice de Archivos

Lista de archivos incluidos en este snapshot:

- **C:/repos/bloom-videos/bloom-development-extension/**
  - C:/repos/bloom-videos/bloom-development-extension\package.json
- **C:/repos/bloom-videos/bloom-development-extension/src/**
  - C:/repos/bloom-videos/bloom-development-extension/src\extension.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/commands/**
  - C:/repos/bloom-videos/bloom-development-extension/src/commands\createNucleusProject.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/core/**
  - C:/repos/bloom-videos/bloom-development-extension/src/core\nucleusManager.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/managers/**
  - C:/repos/bloom-videos/bloom-development-extension/src/managers\userManager.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/managers\workspaceManager.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/models/**
  - C:/repos/bloom-videos/bloom-development-extension/src/models\bloomConfig.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/providers/**
  - C:/repos/bloom-videos/bloom-development-extension/src/providers\nucleusTreeProvider.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/providers\nucleusWelcomeProvider.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/strategies/**
  - C:/repos/bloom-videos/bloom-development-extension/src/strategies\NucleusStrategy.ts
  - C:/repos/bloom-videos/bloom-development-extension/src/strategies\ProjectDetector.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/ui/welcome/**
  - C:/repos/bloom-videos/bloom-development-extension/src/ui/welcome\welcomeView.ts
- **C:/repos/bloom-videos/bloom-development-extension/src/utils/**
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
Metadatos: Lenguaje: typescript, Hash MD5: 52a33e0d57a016277d3a4fb47e78f593

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

    UserManager.init(context);

    // Inicializar GitManager
    GitManager.initialize(context);

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

    // ========================================
    // COMANDO: Add Project to Nucleus
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.addProjectToNucleus', async (treeItem: any) => {
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
        })
    );

    // ========================================
    // COMANDO: Review Pending Commits
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.reviewPendingCommits', async () => {
            await GitManager.reviewAndCommit();
        })
    );

    // ========================================
    // COMANDOS BÁSICOS
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
    // COMANDO: Show Welcome
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.showWelcome', () => {
            welcomeWebview.show();
        })
    );

    // ========================================
    // COMANDO: Create Nucleus Project (ahora abre Welcome)
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.createNucleusProject', async () => {
            // Siempre abrir Welcome, que maneja el flujo completo
            welcomeWebview.show();
        })
    );

    // ========================================
    // COMANDO: Link to Nucleus
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.linkToNucleus', async (uri?: vscode.Uri) => {
            await linkToNucleus(uri);
        })
    );

    // ========================================
    // COMANDOS: Profile & Browser
    // ========================================
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
        vscode.commands.registerCommand('bloom.openGrokInBrowser', () => openProviderInBrowser('grok', context, logger))
    );

    // ========================================
    // COMANDOS: Nucleus Management
    // ========================================
    context.subscriptions.push(
        vscode.commands.registerCommand('bloom.focusRealNucleusView', () =>
            vscode.commands.executeCommand('workbench.view.extension.bloomAiBridge')
        ),
        vscode.commands.registerCommand('bloom.syncNucleusProjects', () => {
            nucleusTreeProvider.refresh();
            vscode.window.showInformationMessage('🔄 Nucleus tree actualizado');
        }),
        vscode.commands.registerCommand('bloom.openNucleusProject', (project: any) => {
            if (project) {
                openNucleusProject(project);
            }
        }),
        vscode.commands.registerCommand('bloom.createNewNucleus', () => {
            new NucleusSetupPanel(context).show();
        })
    );

    // ========================================
    // VERIFICACIÓN: Mostrar Welcome en primera instalación
    // ========================================
    const isRegistered = UserManager.init(context).isRegistered();
    
    logger.info(`Estado de registro: ${isRegistered ? 'REGISTRADO' : 'NO REGISTRADO'}`);
    
    if (!isRegistered) {
        logger.info('Primera instalación detectada - Mostrando Welcome');
        setTimeout(() => {
            welcomeWebview.show();
        }, 1000);
    }

    // Actualizar contexto de VSCode
    vscode.commands.executeCommand('setContext', 'bloom.isRegistered', isRegistered);
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

### C:/repos/bloom-videos/bloom-development-extension/src/providers/nucleusWelcomeProvider.ts
Metadatos: Lenguaje: typescript, Hash MD5: 531fa41fd2e58febad0bd4ea1395d35a

```typescript
// src/providers/nucleusWelcomeProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { UserManager } from '../managers/userManager';

export class NucleusWelcomeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private context: vscode.ExtensionContext) {
        vscode.commands.executeCommand('setContext', 'bloom.isRegistered', UserManager.init(context).isRegistered());
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        const userManager = UserManager.init(this.context);
        if (userManager.isRegistered()) {
            // Ya registrado → delegar al NucleusTreeProvider real
            vscode.commands.executeCommand('bloom.focusRealNucleusView');
            return Promise.resolve([]);
        }

        // Mostrar pantalla de bienvenida
        const item = new vscode.TreeItem('Bienvenido a Bloom Nucleus', vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('flame');
        item.command = {
            command: 'bloom.showWelcome',
            title: 'Mostrar bienvenida'
        };
        return Promise.resolve([item]);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
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

### C:/repos/bloom-videos/bloom-development-extension/src/ui/welcome/welcomeView.ts
Metadatos: Lenguaje: typescript, Hash MD5: 1dca91f612e5703a7b75d4c72fa70fb2

```typescript
// src/ui/welcome/welcomeView.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
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
            // 1. GUARDAR USUARIO EN GLOBALSTATE
            const user = await getCurrentGitHubUser();
            const orgs = await getUserOrgs();

            await UserManager.init(this.context).saveUser({
                githubUsername: user.login,
                githubOrg: githubOrg || user.login,
                allOrgs: [user.login, ...orgs.map(o => o.login)]
            });

            // 2. ELEGIR CARPETA DONDE CREAR NUCLEUS
            const selectedFolder = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Seleccionar carpeta donde crear Nucleus',
                title: `Crear nucleus-${githubOrg || user.login}`
            });

            if (!selectedFolder || selectedFolder.length === 0) {
                vscode.window.showWarningMessage('Creación cancelada');
                return;
            }

            const parentFolder = selectedFolder[0].fsPath;
            const nucleusName = `nucleus-${githubOrg || user.login}`;
            const nucleusPath = path.join(parentFolder, nucleusName);

            // 3. CREAR ESTRUCTURA FÍSICA DE NUCLEUS
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Creando Nucleus...',
                cancellable: false
            }, async (progress) => {
                progress.report({ message: 'Creando estructura...' });

                // Crear carpeta principal
                if (!fs.existsSync(nucleusPath)) {
                    fs.mkdirSync(nucleusPath, { recursive: true });
                }

                // Crear estructura .bloom/
                await this.createNucleusStructure(nucleusPath, githubOrg || user.login, user);

                progress.report({ message: 'Finalizando...' });
            });

            // 4. MOSTRAR ÉXITO Y CERRAR
            this.panel?.webview.postMessage({ 
                command: 'nucleusCreated', 
                message: `¡Nucleus creado en ${nucleusPath}!` 
            });

            // Inicializar workspace con el Nucleus
            const { WorkspaceManager } = await import('../../managers/workspaceManager');
            await WorkspaceManager.initializeWorkspace(nucleusPath);

            vscode.window.showInformationMessage(
                `✅ Nucleus creado exitosamente en: ${nucleusPath}`
            );

            // Cerrar panel después de 2 segundos
            setTimeout(() => {
                this.panel?.dispose();
                vscode.commands.executeCommand('bloom.syncNucleusProjects');
            }, 2000);

        } catch (err: any) {
            this.panel?.webview.postMessage({
                command: 'error',
                text: err.message || 'Error creando Nucleus'
            });
            
            vscode.window.showErrorMessage(`Error creando Nucleus: ${err.message}`);
        }
    }

    /**
     * Crea la estructura completa de Nucleus sin depender de Python
     */
    private async createNucleusStructure(
        nucleusPath: string, 
        orgName: string, 
        user: any
    ): Promise<void> {
        const bloomPath = path.join(nucleusPath, '.bloom');

        // Crear directorios
        const dirs = [
            path.join(bloomPath, 'core'),
            path.join(bloomPath, 'organization'),
            path.join(bloomPath, 'projects')
        ];

        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }

        // 1. Crear nucleus-config.json
        const nucleusConfig = {
            type: 'nucleus',
            version: '1.0.0',
            id: this.generateUUID(),
            organization: {
                name: orgName,
                displayName: orgName,
                url: `https://github.com/${orgName}`,
                description: ''
            },
            nucleus: {
                name: `nucleus-${orgName}`,
                repoUrl: `https://github.com/${orgName}/nucleus-${orgName}.git`,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            },
            projects: [],
            settings: {
                autoIndexProjects: true,
                generateWebDocs: false
            }
        };

        fs.writeFileSync(
            path.join(bloomPath, 'core', 'nucleus-config.json'),
            JSON.stringify(nucleusConfig, null, 2),
            'utf-8'
        );

        // 2. Crear .rules.bl
        const rulesContent = `# Reglas del Nucleus - ${orgName}

## Convenciones de Código
- Usar nombres descriptivos
- Documentar funciones públicas
- Mantener consistencia con proyectos existentes

## Proceso de Review
- Todo código debe pasar por PR
- Al menos 1 aprobación requerida

## Testing
- Cobertura mínima: 70%
- Tests unitarios obligatorios para lógica crítica

---
bloom/v1
document_type: "nucleus_rules"
`;

        fs.writeFileSync(
            path.join(bloomPath, 'core', '.rules.bl'),
            rulesContent,
            'utf-8'
        );

        // 3. Crear .prompt.bl
        const promptContent = `# Prompt del Nucleus - ${orgName}

Eres un asistente de IA que ayuda a desarrolladores del equipo ${orgName}.

## Contexto de la Organización
[Completar con información sobre la organización]

## Proyectos Vinculados
[Se actualizará automáticamente con los proyectos linkeados]

## Tone & Style
- Profesional pero amigable
- Respuestas concisas y accionables
- Priorizar buenas prácticas

---
bloom/v1
document_type: "nucleus_prompt"
`;

        fs.writeFileSync(
            path.join(bloomPath, 'core', '.prompt.bl'),
            promptContent,
            'utf-8'
        );

        // 4. Crear .organization.bl
        const organizationContent = `# ${orgName}

## 📋 Información General

**Nombre:** ${orgName}
**GitHub:** https://github.com/${orgName}
**Creado:** ${new Date().toLocaleDateString()}

## 🎯 Misión

[Completar con la misión de la organización]

## 👥 Equipo

[Listar miembros del equipo]

## 📊 Métricas

- Proyectos activos: 0
- Desarrolladores: 1+
- Stack principal: [Definir]

---
bloom/v1
document_type: "organization_overview"
`;

        fs.writeFileSync(
            path.join(bloomPath, 'organization', '.organization.bl'),
            organizationContent,
            'utf-8'
        );

        // 5. Crear archivos de organización vacíos
        const orgFiles = ['about.bl', 'business-model.bl', 'policies.bl', 'protocols.bl'];
        for (const file of orgFiles) {
            const title = file.replace('.bl', '').replace('-', ' ').toUpperCase();
            const content = `# ${title}\n\n[Completar]\n\n---\nbloom/v1\ndocument_type: "organization_${file.replace('.bl', '')}"\n`;
            fs.writeFileSync(
                path.join(bloomPath, 'organization', file),
                content,
                'utf-8'
            );
        }

        // 6. Crear _index.bl
        const indexContent = `# Índice de Proyectos - ${orgName}

## Árbol de Proyectos

\`\`\`
${orgName}/
└── 🏢 nucleus-${orgName}  [Este proyecto - Centro de conocimiento]
\`\`\`

## Proyectos Vinculados

*No hay proyectos vinculados aún. Usa "Link to Nucleus" para agregar proyectos.*

---
bloom/v1
document_type: "projects_index"
auto_generated: true
updated_at: "${new Date().toISOString()}"
`;

        fs.writeFileSync(
            path.join(bloomPath, 'projects', '_index.bl'),
            indexContent,
            'utf-8'
        );

        // 7. Crear README.md
        const readmeContent = `# nucleus-${orgName}

Centro de conocimiento y documentación organizacional para ${orgName}.

## 🌸 Bloom Nucleus

Este repositorio usa Bloom BTIP para gestionar la documentación técnica y organizacional.

### Estructura

- \`.bloom/core/\` - Configuración del Nucleus
- \`.bloom/organization/\` - Documentación de la organización
- \`.bloom/projects/\` - Overviews de proyectos vinculados

### Uso

1. Abre este proyecto en VSCode con el plugin Bloom instalado
2. Usa "Link to Nucleus" en proyectos técnicos para vincularlos
3. Edita los archivos .bl para mantener la documentación actualizada

---

Generado por Bloom BTIP v1.0.0
`;

        fs.writeFileSync(
            path.join(nucleusPath, 'README.md'),
            readmeContent,
            'utf-8'
        );

        // 8. Crear .gitignore
        const gitignoreContent = `# Bloom
.bloom/cache/
.bloom/temp/

# IDE
.vscode/
.idea/

# OS
.DS_Store
Thumbs.db
`;

        fs.writeFileSync(
            path.join(nucleusPath, '.gitignore'),
            gitignoreContent,
            'utf-8'
        );
    }

    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    private getHtml(): string {
        // HTML existente - no cambiar
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

