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
    
    // Opción 1: Auto-discovery
    const parentDir = path.dirname(nucleusPath);
    const detectedProjects = await detectProjectsInFolder(parentDir, nucleusPath);

    if (detectedProjects.length > 0) {
        const useDetected = await vscode.window.showQuickPick([
            {
                label: '$(search) Usar Proyectos Detectados',
                description: `${detectedProjects.length} proyecto(s) encontrado(s)`,
                value: 'detected'
            },
            {
                label: '$(folder) Elegir Carpeta Manualmente',
                description: 'Buscar en otra ubicación',
                value: 'manual'
            }
        ], {
            placeHolder: '¿Cómo quieres seleccionar el proyecto?'
        });

        if (!useDetected) return;

        if (useDetected.value === 'detected') {
            // Mostrar lista de proyectos detectados
            const selected = await vscode.window.showQuickPick(
                detectedProjects.map(p => ({
                    label: `${getStrategyIcon(p.strategy)} ${p.name}`,
                    description: `${p.strategy} - ${p.path}`,
                    detail: p.description,
                    project: p
                })),
                {
                    placeHolder: 'Selecciona el proyecto a vincular'
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
            }
            return;
        }
    }

    // Opción 2: File picker manual
    const selectedFolder = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Seleccionar Proyecto',
        title: 'Vincular Proyecto Existente'
    });

    if (!selectedFolder || selectedFolder.length === 0) return;

    const projectPath = selectedFolder[0].fsPath;
    const projectName = path.basename(projectPath);
    const strategy = await ProjectDetector.getStrategyName(projectPath);

    await linkProjectToNucleus(nucleusPath, orgName, projectPath, projectName, strategy);
}

/**
 * Clonar desde GitHub
 */
async function cloneFromGitHub(nucleusPath: string, orgName: string): Promise<void> {
    try {
        // 1. Obtener repos de la organización
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Obteniendo repositorios...',
            cancellable: false
        }, async () => {
            // Simular llamada - reemplazar con tu implementación
            await new Promise(resolve => setTimeout(resolve, 1000));
        });

        const repos = await getOrgRepos(orgName);
        
        // 2. Filtrar repos ya vinculados
        const nucleusConfig = loadNucleusConfig(path.join(nucleusPath, '.bloom'));
        const linkedRepos = nucleusConfig?.projects.map(p => p.name) || [];
        const availableRepos = repos.filter(r => !linkedRepos.includes(r.name));

        if (availableRepos.length === 0) {
            vscode.window.showInformationMessage('Todos los repositorios ya están vinculados');
            return;
        }

        // 3. Seleccionar repo
        const selected = await vscode.window.showQuickPick(
            availableRepos.map(r => ({
                label: r.name,
                description: r.description || 'Sin descripción',
                detail: `⭐ ${r.stargazers_count} - Actualizado: ${new Date(r.updated_at).toLocaleDateString()}`,
                repo: r
            })),
            {
                placeHolder: 'Selecciona el repositorio a clonar'
            }
        );

        if (!selected) return;

        // 4. Elegir carpeta destino
        const parentDir = path.dirname(nucleusPath);
        const defaultPath = path.join(parentDir, selected.repo.name);

        const destinationFolder = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Seleccionar Carpeta Destino',
            title: `Clonar ${selected.repo.name}`,
            defaultUri: vscode.Uri.file(parentDir)
        });

        if (!destinationFolder) return;

        const clonePath = path.join(destinationFolder[0].fsPath, selected.repo.name);

        // 5. Clonar con progress
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Clonando ${selected.repo.name}...`,
            cancellable: false
        }, async (progress) => {
            progress.report({ message: 'Clonando repositorio...' });
            
            await execAsync(`git clone ${selected.repo.clone_url} "${clonePath}"`);
            
            progress.report({ message: 'Vinculando al Nucleus...' });
            
            // Detectar estrategia
            const strategy = await ProjectDetector.getStrategyName(clonePath);
            
            await linkProjectToNucleus(
                nucleusPath,
                orgName,
                clonePath,
                selected.repo.name,
                strategy
            );
        });

        // 6. Ofrecer abrir proyecto
        const openProject = await vscode.window.showInformationMessage(
            `✅ ${selected.repo.name} clonado y vinculado exitosamente`,
            'Abrir Proyecto',
            'Cerrar'
        );

        if (openProject === 'Abrir Proyecto') {
            await vscode.commands.executeCommand(
                'vscode.openFolder',
                vscode.Uri.file(clonePath),
                true
            );
        }

    } catch (error: any) {
        vscode.window.showErrorMessage(`Error clonando repositorio: ${error.message}`);
    }
}

/**
 * Crear proyecto nuevo
 */
async function createNewProject(nucleusPath: string, orgName: string): Promise<void> {
    // 1. Nombre del proyecto
    const projectName = await vscode.window.showInputBox({
        prompt: 'Nombre del proyecto',
        placeHolder: 'mi-proyecto',
        validateInput: (value) => {
            if (!value || value.length < 3) return 'Mínimo 3 caracteres';
            if (!/^[a-z0-9-]+$/.test(value)) return 'Solo minúsculas, números y guiones';
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

    // 3. Ubicación
    const parentDir = path.dirname(nucleusPath);
    const location = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Seleccionar Carpeta Padre',
        title: `Crear ${projectName}`,
        defaultUri: vscode.Uri.file(parentDir)
    });

    if (!location) return;

    const projectPath = path.join(location[0].fsPath, projectName);

    // 4. Crear con template
    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Creando ${projectName}...`,
        cancellable: false
    }, async (progress) => {
        // Crear carpeta
        if (!fs.existsSync(projectPath)) {
            fs.mkdirSync(projectPath, { recursive: true });
        }

        progress.report({ message: 'Creando estructura...' });

        // Crear template básico según tipo
        await createProjectTemplate(projectPath, projectType.value);

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
        await execAsync('git init', { cwd: projectPath });
        await execAsync('git add .', { cwd: projectPath });
        
        // Queue commit (no push automático)
        await GitManager.queueCommit(
            projectPath,
            `🌸 Initial commit - Created with Bloom`
        );
    });

    // 5. Ofrecer abrir
    const openProject = await vscode.window.showInformationMessage(
        `✅ Proyecto ${projectName} creado exitosamente`,
        'Abrir Proyecto',
        'Cerrar'
    );

    if (openProject === 'Abrir Proyecto') {
        await vscode.commands.executeCommand(
            'vscode.openFolder',
            vscode.Uri.file(projectPath),
            true
        );
    }
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

    // 5. Crear overview.bl
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
    vscode.window.showInformationMessage(`✅ ${projectName} vinculado al Nucleus`);

    // Refrescar tree
    vscode.commands.executeCommand('bloom.syncNucleusProjects');
}

// Helper functions...
function getStrategyIcon(strategy: string): string {
    const icons: Record<string, string> = {
        'android': '📱', 'ios': '🍎', 'react-web': '🌐',
        'node': '⚙️', 'python-flask': '🐍', 'generic': '📦'
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
[Completar]

## 👥 Usuarios
[Completar]

## 💼 Lógica de Negocio
[Completar]

## 🔗 Dependencias
[Completar]

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

[Completar instrucciones]

## Development

[Completar comandos]
`;
    
    fs.writeFileSync(path.join(projectPath, 'README.md'), readme, 'utf-8');

    // Crear .gitignore básico
    const gitignore = `node_modules/
.DS_Store
*.log
.env
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
                    scripts: { test: 'echo "No tests yet"' }
                }, null, 2),
                'utf-8'
            );
            break;
        // Agregar más templates según necesidad
    }
}