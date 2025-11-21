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