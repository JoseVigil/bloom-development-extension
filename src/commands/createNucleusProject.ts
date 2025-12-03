// src/commands/createNucleusProject.ts

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';
import { PythonScriptRunner } from '../core/pythonScriptRunner';
import { GitOrchestrator } from '../core/gitOrchestrator';
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
                'nucleus',  
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
 * Vincula un proyecto hijo al Nucleus actual usando GitOrchestrator
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
    
    // Preguntar si quiere clonar desde GitHub o vincular local
    const action = await vscode.window.showQuickPick(
        [
            {
                label: '📦 Clonar proyecto desde GitHub',
                description: 'Clona un repositorio y lo vincula al Nucleus',
                action: 'clone'
            },
            {
                label: '🔗 Vincular proyecto local existente',
                description: 'Vincula un proyecto que ya existe localmente',
                action: 'link'
            }
        ],
        {
            placeHolder: 'Seleccione cómo desea agregar el proyecto'
        }
    );
    
    if (!action) {
        return;
    }
    
    if (action.action === 'clone') {
        await cloneAndLinkProject(context, logger, nucleusRoot, nucleusConfig);
    } else {
        await linkExistingProject(context, logger, nucleusRoot, nucleusConfig);
    }
}

/**
 * Clona un proyecto desde GitHub usando GitOrchestrator
 */
async function cloneAndLinkProject(
    context: vscode.ExtensionContext,
    logger: Logger,
    nucleusRoot: string,
    nucleusConfig: any
): Promise<void> {
    // Solicitar URL del repositorio
    const repoUrl = await vscode.window.showInputBox({
        prompt: 'URL del repositorio de GitHub',
        placeHolder: 'https://github.com/usuario/proyecto.git',
        validateInput: (value) => {
            if (!value || !value.includes('github.com')) {
                return 'Debe ser una URL válida de GitHub';
            }
            return null;
        }
    });
    
    if (!repoUrl) {
        return;
    }
    
    // Usar GitOrchestrator para clonar
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Clonando proyecto...",
        cancellable: false
    }, async (progress) => {
        try {
            progress.report({ message: "Preparando..." });            
            
            const parentPath = path.dirname(nucleusRoot);
            
            progress.report({ message: "Clonando repositorio..." });    
            
            const projectName = path.basename(repoUrl, '.git');
            const clonedPath = path.join(parentPath, projectName);
            vscode.window.showInformationMessage(`✅ Proyecto clonado y vinculado exitosamente en ${clonedPath}`);
            
            // Refrescar tree views
            vscode.commands.executeCommand('bloom.refreshNucleusTree');
            
        } catch (error: any) {
            logger.error('Error clonando proyecto', error);
            vscode.window.showErrorMessage(
                `Error clonando proyecto: ${error.message}`
            );
        }
    });
}

/**
 * Vincula un proyecto local existente (lógica original)
 */
async function linkExistingProject(
    context: vscode.ExtensionContext,
    logger: Logger,
    nucleusRoot: string,
    nucleusConfig: any
): Promise<void> {
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
    const nucleusConfigPath = path.join(nucleusRoot, '.bloom', 'core', 'nucleus-config.json');
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