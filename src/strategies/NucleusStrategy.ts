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