import * as vscode from 'vscode';

export type ProjectStrategy =
    | 'android'
    | 'ios'
    | 'react-web'
    | 'node'
    | 'python-flask'
    | 'php-laravel'
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
    | NodeStrategyConfig
    | PythonFlaskStrategyConfig
    | PhpLaravelStrategyConfig
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

        default:
            return {
                customSettings: {}
            } as GenericStrategyConfig;
    }
}