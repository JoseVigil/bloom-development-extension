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