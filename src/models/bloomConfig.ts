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

/**
 * Resuelve el path real de nucleus-config.json dentro de un .bloom/.
 *
 * La estructura real en disco es .bloom/.nucleus-{slug}/.core/nucleus-config.json
 * (no .bloom/core/nucleus-config.json). Si se conoce el slug (org), se arma
 * el path directo. Si no, se busca la única subcarpeta .nucleus-* presente
 * (multi-org en el mismo .bloom no está soportado, mismo criterio que
 * org-resolver.ts). Devuelve null si no hay ninguna o hay más de una.
 */
function resolveNucleusConfigPath(bloomPath: string, org?: string): string | null {
    const fs = require('fs');
    const path = require('path');

    if (org) {
        return path.join(bloomPath, `.nucleus-${org}`, '.core', 'nucleus-config.json');
    }

    if (!fs.existsSync(bloomPath)) {
        return null;
    }

    const nucleusDirs = fs.readdirSync(bloomPath).filter((d: string) => d.startsWith('.nucleus-'));
    if (nucleusDirs.length !== 1) {
        return null;
    }

    return path.join(bloomPath, nucleusDirs[0], '.core', 'nucleus-config.json');
}

export function detectProjectType(bloomPath: string, org?: string): ProjectType | null {
    const fs = require('fs');
    const path = require('path');
    
    // Check for nucleus-config.json
    const nucleusConfigPath = resolveNucleusConfigPath(bloomPath, org);
    if (nucleusConfigPath && fs.existsSync(nucleusConfigPath)) {
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

export function isNucleusProject(bloomPath: string, org?: string): boolean {
    return detectProjectType(bloomPath, org) === 'nucleus';
}

export function isBTIPProject(bloomPath: string, org?: string): boolean {
    return detectProjectType(bloomPath, org) === 'btip';
}

export function hasNucleusLink(bloomPath: string): boolean {
    const fs = require('fs');
    const path = require('path');
    const nucleusLinkPath = path.join(bloomPath, 'nucleus.json');
    return fs.existsSync(nucleusLinkPath);
}

export function loadNucleusConfig(bloomPath: string, org?: string): NucleusConfig | null {
    const fs = require('fs');
    
    try {
        const configPath = resolveNucleusConfigPath(bloomPath, org);
        if (!configPath || !fs.existsSync(configPath)) {
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

export function saveNucleusConfig(bloomPath: string, config: NucleusConfig, org?: string): boolean {
    const fs = require('fs');
    const path = require('path');

    try {
        // Al guardar, si no hay .nucleus-{org}/.core todavía, hace falta el
        // slug para poder crearlo (no hay nada que descubrir en disco aún).
        const slug = org || config.organization?.name;
        if (!slug) {
            console.error('Error saving nucleus config: no se pudo determinar el slug de organización');
            return false;
        }
        const nucleusDir = path.join(bloomPath, `.nucleus-${slug}`, '.core');
        fs.mkdirSync(nucleusDir, { recursive: true });
        const configPath = path.join(nucleusDir, 'nucleus-config.json');
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