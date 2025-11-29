import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

export interface ScriptResult {
    success: boolean;
    stdout: string;
    stderr: string;
    outputFile?: string;
}

export interface GenerateNucleusOptions {
    skipExisting?: boolean;
    url?: string;
}

export class PythonScriptRunner {
    private scriptsPath: string;

    constructor(
        private context: vscode.ExtensionContext,
        private logger: Logger
    ) {
        this.scriptsPath = path.join(context.extensionPath, 'scripts');
    }

    /**
     * NUEVO: Genera estructura completa de Nucleus
     * Ejecuta generate_nucleus.py (si existe) o fallback a TS
     */
    async generateNucleus(
        nucleusPath: string,
        orgName: string,
        options: GenerateNucleusOptions = {}
    ): Promise<ScriptResult> {
        this.logger.info(`Generating Nucleus structure for ${orgName}`);

        const config = vscode.workspace.getConfiguration('bloom');
        const pythonPath = config.get<string>('pythonPath', 'python3');

        const scriptPath = path.join(this.scriptsPath, 'generate_nucleus.py');

        // Verificar si el script Python existe
        if (!fs.existsSync(scriptPath)) {
            this.logger.warn('generate_nucleus.py not found, using TypeScript fallback');
            return await this.generateNucleusFallback(nucleusPath, orgName, options);
        }

        try {
            // Construir comando
            const skipFlag = options.skipExisting ? '--skip-existing' : '';
            const urlFlag = options.url ? `--url "${options.url}"` : '';
            
            const command = `"${pythonPath}" "${scriptPath}" --org "${orgName}" --root "${nucleusPath}" --output ".bloom" ${skipFlag} ${urlFlag}`;

            const { stdout, stderr } = await execAsync(command, {
                cwd: nucleusPath,
                timeout: 60000
            });

            this.logger.info('generate_nucleus.py completed');

            return {
                success: true,
                stdout,
                stderr
            };
        } catch (error: any) {
            this.logger.error('Error executing generate_nucleus.py', error);
            
            // Intentar fallback
            this.logger.info('Attempting TypeScript fallback...');
            return await this.generateNucleusFallback(nucleusPath, orgName, options);
        }
    }

    /**
     * NUEVO: Genera contexto de proyecto
     * Ejecuta generate_context.py (si existe) o fallback a TS
     */
    async generateContext(
        projectPath: string,
        strategy: string,
        options: { skipExisting?: boolean } = {}
    ): Promise<ScriptResult> {
        this.logger.info(`Generating context for ${strategy} project`);

        const config = vscode.workspace.getConfiguration('bloom');
        const pythonPath = config.get<string>('pythonPath', 'python3');

        const scriptPath = path.join(this.scriptsPath, 'generate_context.py');

        // Verificar si el script existe
        if (!fs.existsSync(scriptPath)) {
            this.logger.warn('generate_context.py not found, using TypeScript fallback');
            return await this.generateContextFallback(projectPath, strategy);
        }

        try {
            const skipFlag = options.skipExisting ? '--skip-existing' : '';
            const command = `"${pythonPath}" "${scriptPath}" --strategy "${strategy}" --root "${projectPath}" --output ".bloom/project" ${skipFlag}`;

            const { stdout, stderr } = await execAsync(command, {
                cwd: projectPath,
                timeout: 60000
            });

            this.logger.info('generate_context.py completed');

            return {
                success: true,
                stdout,
                stderr
            };
        } catch (error: any) {
            this.logger.error('Error executing generate_context.py', error);
            
            // Intentar fallback
            return await this.generateContextFallback(projectPath, strategy);
        }
    }

    /**
     * FALLBACK: Genera estructura Nucleus usando TypeScript
     * Se usa cuando generate_nucleus.py no existe o falla
     */
    private async generateNucleusFallback(
        nucleusPath: string,
        orgName: string,
        options: GenerateNucleusOptions = {}
    ): Promise<ScriptResult> {
        try {
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

            // 1. nucleus-config.json
            const configPath = path.join(bloomPath, 'core', 'nucleus-config.json');
            if (!options.skipExisting || !fs.existsSync(configPath)) {
                const nucleusConfig = {
                    type: 'nucleus',
                    version: '1.0.0',
                    id: this.generateUUID(),
                    organization: {
                        name: orgName,
                        displayName: orgName,
                        url: options.url || `https://github.com/${orgName}`,
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

                fs.writeFileSync(configPath, JSON.stringify(nucleusConfig, null, 2), 'utf-8');
            }

            // 2. .rules.bl
            const rulesPath = path.join(bloomPath, 'core', '.rules.bl');
            if (!options.skipExisting || !fs.existsSync(rulesPath)) {
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
                fs.writeFileSync(rulesPath, rulesContent, 'utf-8');
            }

            // 3. .prompt.bl
            const promptPath = path.join(bloomPath, 'core', '.prompt.bl');
            if (!options.skipExisting || !fs.existsSync(promptPath)) {
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
                fs.writeFileSync(promptPath, promptContent, 'utf-8');
            }

            // 4. .organization.bl
            const orgPath = path.join(bloomPath, 'organization', '.organization.bl');
            if (!options.skipExisting || !fs.existsSync(orgPath)) {
                const organizationContent = `# ${orgName}

## 📋 Información General

**Nombre:** ${orgName}
**GitHub:** ${options.url || `https://github.com/${orgName}`}
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
                fs.writeFileSync(orgPath, organizationContent, 'utf-8');
            }

            // 5. Archivos de organización
            const orgFiles = ['about.bl', 'business-model.bl', 'policies.bl', 'protocols.bl'];
            for (const file of orgFiles) {
                const filePath = path.join(bloomPath, 'organization', file);
                if (!options.skipExisting || !fs.existsSync(filePath)) {
                    const title = file.replace('.bl', '').replace('-', ' ').toUpperCase();
                    const content = `# ${title}\n\n[Completar]\n\n---\nbloom/v1\ndocument_type: "organization_${file.replace('.bl', '')}"\n`;
                    fs.writeFileSync(filePath, content, 'utf-8');
                }
            }

            // 6. _index.bl
            const indexPath = path.join(bloomPath, 'projects', '_index.bl');
            if (!options.skipExisting || !fs.existsSync(indexPath)) {
                const indexContent = `# Índice de Proyectos - ${orgName}

## Árbol de Proyectos

\`\`\`
${orgName}/
└── 🢐 nucleus-${orgName}  [Este proyecto - Centro de conocimiento]
\`\`\`

## Proyectos Vinculados

*No hay proyectos vinculados aún. Usa "Link to Nucleus" para agregar proyectos.*

---
bloom/v1
document_type: "projects_index"
auto_generated: true
updated_at: "${new Date().toISOString()}"
`;
                fs.writeFileSync(indexPath, indexContent, 'utf-8');
            }

            // 7. README.md (solo si no existe)
            const readmePath = path.join(nucleusPath, 'README.md');
            if (!fs.existsSync(readmePath)) {
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
                fs.writeFileSync(readmePath, readmeContent, 'utf-8');
            }

            // 8. .gitignore (solo si no existe)
            const gitignorePath = path.join(nucleusPath, '.gitignore');
            if (!fs.existsSync(gitignorePath)) {
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
                fs.writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
            }

            return {
                success: true,
                stdout: 'Nucleus structure generated (TypeScript fallback)',
                stderr: ''
            };

        } catch (error: any) {
            this.logger.error('Error in generateNucleusFallback', error);
            return {
                success: false,
                stdout: '',
                stderr: error.message
            };
        }
    }

    /**
     * FALLBACK: Genera contexto usando TypeScript
     */
    private async generateContextFallback(
        projectPath: string,
        strategy: string
    ): Promise<ScriptResult> {
        try {
            const bloomPath = path.join(projectPath, '.bloom');
            const projectDir = path.join(bloomPath, 'project');

            if (!fs.existsSync(projectDir)) {
                fs.mkdirSync(projectDir, { recursive: true });
            }

            // Generar .context.bl
            const contextPath = path.join(projectDir, '.context.bl');
            const contextContent = `# Contexto del Proyecto

## Estrategia Detectada
${strategy}

## Descripción
[Completar con descripción del proyecto]

## Stack Tecnológico
${this.getStackDescription(strategy)}

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

            return {
                success: true,
                stdout: 'Project context generated (TypeScript fallback)',
                stderr: ''
            };

        } catch (error: any) {
            this.logger.error('Error in generateContextFallback', error);
            return {
                success: false,
                stdout: '',
                stderr: error.message
            };
        }
    }

    /**
     * Métodos existentes (sin cambios)
     */
    async generateTree(
        outputFile: string,
        targetPaths: string[]
    ): Promise<ScriptResult> {
        this.logger.info('Ejecutando tree_custom.py');

        const config = vscode.workspace.getConfiguration('bloom');
        const pythonPath = config.get<string>('pythonPath', 'python3');

        const scriptPath = path.join(this.scriptsPath, 'tree_custom.py');
        const args = [outputFile, ...targetPaths].map(p => `"${p}"`).join(' ');
        const command = `"${pythonPath}" "${scriptPath}" ${args}`;

        try {
            const { stdout, stderr } = await execAsync(command, {
                timeout: 30000
            });

            this.logger.info('tree_custom.py completado');

            return {
                success: true,
                stdout,
                stderr,
                outputFile
            };
        } catch (error: any) {
            this.logger.error('Error ejecutando tree_custom.py', error);
            return {
                success: false,
                stdout: error.stdout || '',
                stderr: error.stderr || error.message
            };
        }
    }

    async generateCodebase(
        outputFile: string,
        files: string[]
    ): Promise<ScriptResult> {
        this.logger.info('Ejecutando codebase_generation.py');

        const config = vscode.workspace.getConfiguration('bloom');
        const pythonPath = config.get<string>('pythonPath', 'python3');

        const scriptPath = path.join(this.scriptsPath, 'codebase_generation.py');
        const filesArg = files.map(f => `"${f}"`).join(' ');
        const command = `"${pythonPath}" "${scriptPath}" --output "${outputFile}" --files ${filesArg}`;

        try {
            const { stdout, stderr } = await execAsync(command, {
                timeout: 60000
            });

            this.logger.info('codebase_generation.py completado');

            return {
                success: true,
                stdout,
                stderr,
                outputFile
            };
        } catch (error: any) {
            this.logger.error('Error ejecutando codebase_generation.py', error);
            return {
                success: false,
                stdout: error.stdout || '',
                stderr: error.stderr || error.message
            };
        }
    }

    async integrateSnapshot(
        snapshotFile: string,
        projectRoot: string,
        treeFile: string,
        backupDir: string,
        dryRun: boolean = false
    ): Promise<ScriptResult & {
        filesCreated?: string[];
        filesModified?: string[];
        conflicts?: string[];
    }> {
        this.logger.info('Ejecutando codebase_snapshot_integration.py');

        const config = vscode.workspace.getConfiguration('bloom');
        const pythonPath = config.get<string>('pythonPath', 'python3');

        const scriptPath = path.join(this.scriptsPath, 'codebase_snapshot_integration.py');
        const dryRunFlag = dryRun ? '--dry-run' : '';
        const command = `"${pythonPath}" "${scriptPath}" "${snapshotFile}" "${projectRoot}" --tree "${treeFile}" --backup-dir "${backupDir}" ${dryRunFlag}`;

        try {
            const { stdout, stderr } = await execAsync(command, {
                timeout: 120000
            });

            this.logger.info('codebase_snapshot_integration.py completado');

            const filesCreated = this.extractFilesFromOutput(stdout, 'CREATED:');
            const filesModified = this.extractFilesFromOutput(stdout, 'MODIFIED:');
            const conflicts = this.extractFilesFromOutput(stdout, 'CONFLICT:');

            return {
                success: true,
                stdout,
                stderr,
                filesCreated,
                filesModified,
                conflicts
            };
        } catch (error: any) {
            this.logger.error('Error ejecutando codebase_snapshot_integration.py', error);
            return {
                success: false,
                stdout: error.stdout || '',
                stderr: error.stderr || error.message
            };
        }
    }

    private extractFilesFromOutput(output: string, marker: string): string[] {
        const lines = output.split('\n');
        const files: string[] = [];

        for (const line of lines) {
            if (line.includes(marker)) {
                const filePath = line.split(marker)[1]?.trim();
                if (filePath) {
                    files.push(filePath);
                }
            }
        }

        return files;
    }

    async detectChromeProfiles(): Promise<ScriptResult & {
        profiles?: Array<{
            name: string;
            path: string;
            accounts: Array<{provider: string, email: string}>;
        }>;
    }> {
        const config = vscode.workspace.getConfiguration('bloom');
        const pythonPath = config.get<string>('pythonPath', 'python3');

        const scriptPath = path.join(this.scriptsPath, 'chrome_profile_detector.py');
        const command = `"${pythonPath}" "${scriptPath}" --json`;
        
        const { stdout } = await execAsync(command);
        const profiles = JSON.parse(stdout);
        
        return { success: true, stdout, stderr: '', profiles };
    }

    async sendClaudeMessage(
        prompt: string,
        profile: string,
        account: string,
        contextFiles: string[]
    ): Promise<ScriptResult & { conversationId?: string }> {
        this.logger.info('Enviando mensaje a Claude via claude_bridge.py');

        const config = vscode.workspace.getConfiguration('bloom');
        const pythonPath = config.get<string>('pythonPath', 'python3');

        const scriptPath = path.join(this.scriptsPath, 'claude_bridge.py');
        
        // Crear archivo temporal con el prompt
        const tempPromptFile = path.join(this.scriptsPath, '.temp_prompt.txt');
        await fs.promises.writeFile(tempPromptFile, prompt, 'utf-8');
        
        // Crear archivo temporal con contexto
        const tempContextFile = path.join(this.scriptsPath, '.temp_context.json');
        await fs.promises.writeFile(
            tempContextFile, 
            JSON.stringify({ files: contextFiles }), 
            'utf-8'
        );

        const command = `"${pythonPath}" "${scriptPath}" send --profile "${profile}" --account "${account}" --prompt "${tempPromptFile}" --context "${tempContextFile}"`;

        try {
            const { stdout, stderr } = await execAsync(command, {
                timeout: 120000
            });

            this.logger.info('claude_bridge.py completado');

            // Extraer conversation ID del output
            const match = stdout.match(/Conversation ID: ([a-f0-9-]+)/);
            const conversationId = match ? match[1] : undefined;

            return {
                success: true,
                stdout,
                stderr,
                conversationId
            };
        } catch (error: any) {
            this.logger.error('Error ejecutando claude_bridge.py', error);
            return {
                success: false,
                stdout: error.stdout || '',
                stderr: error.stderr || error.message,
                conversationId: undefined
            };
        }
    }

    /**
     * UTILIDADES PRIVADAS
     */
    private generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    private getStackDescription(strategy: string): string {
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
}