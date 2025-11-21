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