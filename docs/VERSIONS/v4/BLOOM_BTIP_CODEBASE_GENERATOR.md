# BLOOM_BTIP_CODEBASE_GENERATOR.md

## Propósito

Este documento define la especificación técnica completa del Codebase Generator para el Bloom VSCode Plugin, describiendo el sistema de detección automática de proyectos, estrategias por plataforma, categorización inteligente de archivos, y generación de dos formatos de salida: codebase.md (versión gratis) y codebase.tar.gz (versión paga).

El Codebase Generator es el componente responsable de empaquetar el código fuente relevante de un proyecto para ser enviado a modelos de IA, optimizando la selección de archivos según el tipo de proyecto detectado.

Todos los bloques de código en este documento usan indentación de 4 espacios, sin uso de triple backticks, siguiendo la convención Bloom para compatibilidad con artifacts markdown.

---

## 1. Visión General

### 1.1. Objetivo

El Codebase Generator transforma la selección manual de archivos en un proceso inteligente y automatizado que:

- Detecta automáticamente el tipo de proyecto (Android, iOS, Web, React, etc.)
- Pre-selecciona archivos relevantes según estrategia específica del tipo de proyecto
- Categoriza archivos por importancia y función
- Excluye automáticamente archivos innecesarios (build/, node_modules/, etc.)
- Genera dos formatos de salida según versión del plugin:
  - codebase.md: Archivo markdown con código concatenado (versión gratis)
  - codebase.tar.gz: Archivo comprimido con archivos individuales (versión paga)

### 1.2. Arquitectura del Sistema

    Usuario selecciona archivos
            ↓
    ProjectDetector detecta tipo de proyecto
            ↓
    CodebaseStrategy selecciona archivos relevantes
            ↓
    FileCategorizer organiza por prioridad
            ↓
    Quick Pick muestra archivos pre-seleccionados
            ↓
    Usuario ajusta selección (opcional)
            ↓
    CodebaseGenerator crea output
            ↓
    ├─→ codebase.md (Free Mode)
    └─→ codebase.tar.gz (API Mode)

### 1.3. Tipos de Proyecto Soportados

    - Android (Kotlin/Java)
    - iOS (Swift/Objective-C)
    - Web (HTML/CSS/JS)
    - React (JSX/TSX)
    - React Native
    - Flutter (Dart)
    - Node.js/Backend
    - Python
    - Generic (fallback)

---

## 2. Sistema de Detección de Proyectos

### 2.1. ProjectDetector

Clase central que identifica el tipo de proyecto basándose en archivos y estructura de carpetas.

    export class ProjectDetector {
        private strategies: ICodebaseStrategy[] = [];
        
        constructor() {
            this.registerStrategies();
        }
        
        private registerStrategies(): void {
            this.strategies = [
                new AndroidStrategy(),
                new IOSStrategy(),
                new ReactStrategy(),
                new ReactNativeStrategy(),
                new FlutterStrategy(),
                new NodeBackendStrategy(),
                new PythonStrategy(),
                new WebStrategy(),
                new GenericStrategy() // Fallback
            ];
        }
        
        async detectStrategy(workspaceRoot: string): Promise<ICodebaseStrategy | null> {
            for (const strategy of this.strategies) {
                const detected = await strategy.detect(workspaceRoot);
                if (detected) {
                    return strategy;
                }
            }
            return null;
        }
        
        async detectAll(workspaceRoot: string): Promise<ICodebaseStrategy[]> {
            const detected: ICodebaseStrategy[] = [];
            
            for (const strategy of this.strategies) {
                if (await strategy.detect(workspaceRoot)) {
                    detected.push(strategy);
                }
            }
            
            return detected;
        }
    }

### 2.2. Interface ICodebaseStrategy

Contrato que todas las estrategias deben implementar.

    export interface ICodebaseStrategy {
        name: string;
        projectType: ProjectType;
        detect(workspaceRoot: string): Promise<boolean>;
        getRelevantFiles(workspaceRoot: string, selectedFiles?: vscode.Uri[]): Promise<FileDescriptor[]>;
        categorizeFile(filePath: string): FileCategory;
        assignPriority(file: FileDescriptor): number;
        generateIndex(files: FileDescriptor[]): string;
    }
    
    export type ProjectType = 
        | 'android'
        | 'ios'
        | 'web'
        | 'react'
        | 'react-native'
        | 'flutter'
        | 'nodejs'
        | 'python'
        | 'generic';
    
    export interface FileDescriptor {
        absolutePath: string;
        relativePath: string;
        category: FileCategory;
        priority: number;
        size: number;
        extension: string;
    }
    
    export enum FileCategory {
        MANIFEST = 'Manifest',
        BUILD_CONFIG = 'Build Configuration',
        GRADLE = 'Gradle',
        PACKAGE_JSON = 'Package Configuration',
        SOURCE_CODE = 'Source Code',
        COMPONENT = 'Component',
        SERVICE = 'Service',
        MODEL = 'Model',
        CONTROLLER = 'Controller',
        RESOURCE = 'Resource',
        LAYOUT = 'Layout',
        STYLE = 'Style',
        NAVIGATION = 'Navigation',
        DEPENDENCY = 'Dependency',
        TEST = 'Test',
        ASSET = 'Asset',
        DOCUMENTATION = 'Documentation',
        CONFIGURATION = 'Configuration',
        OTHER = 'Other'
    }

---

## 3. Estrategia Android

### 3.1. Detección

    export class AndroidStrategy implements ICodebaseStrategy {
        name = 'Android';
        projectType: ProjectType = 'android';
        
        async detect(workspaceRoot: string): Promise<boolean> {
            const indicators = [
                'build.gradle',
                'settings.gradle',
                'app/build.gradle',
                'app/src/main/AndroidManifest.xml',
                'gradlew'
            ];
            
            for (const indicator of indicators) {
                const indicatorPath = path.join(workspaceRoot, indicator);
                if (await fileExists(indicatorPath)) {
                    return true;
                }
            }
            
            return false;
        }
    }

### 3.2. Archivos Relevantes

    async getRelevantFiles(workspaceRoot: string, selectedFiles?: vscode.Uri[]): Promise<FileDescriptor[]> {
        const patterns = this.getSearchPatterns();
        const excludePatterns = this.getExcludePatterns();
        
        const files: FileDescriptor[] = [];
        
        for (const pattern of patterns) {
            const found = await vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceRoot, pattern),
                `{${excludePatterns.join(',')}}`
            );
            
            for (const fileUri of found) {
                const descriptor = await this.createFileDescriptor(fileUri, workspaceRoot);
                files.push(descriptor);
            }
        }
        
        // Si hay archivos seleccionados, incluirlos también
        if (selectedFiles && selectedFiles.length > 0) {
            for (const fileUri of selectedFiles) {
                const descriptor = await this.createFileDescriptor(fileUri, workspaceRoot);
                if (!files.some(f => f.absolutePath === descriptor.absolutePath)) {
                    files.push(descriptor);
                }
            }
        }
        
        // Ordenar por prioridad
        return files.sort((a, b) => a.priority - b.priority);
    }
    
    private getSearchPatterns(): string[] {
        return [
            // Prioridad 1: Críticos
            'build.gradle',
            'settings.gradle',
            'app/build.gradle',
            'app/src/main/AndroidManifest.xml',
            'gradle.properties',
            'app/proguard-rules.pro',
            
            // Prioridad 2: Configuración
            'app/src/main/res/values/strings.xml',
            'app/src/main/res/values/colors.xml',
            'app/src/main/res/values/themes.xml',
            'app/src/main/res/values/styles.xml',
            
            // Prioridad 3: Código fuente
            'app/src/main/java/**/*.kt',
            'app/src/main/java/**/*.java',
            
            // Prioridad 4: Recursos
            'app/src/main/res/layout/**/*.xml',
            'app/src/main/res/drawable/**/*.xml',
            'app/src/main/res/navigation/**/*.xml',
            
            // Prioridad 5: Tests (opcional)
            'app/src/test/**/*.kt',
            'app/src/androidTest/**/*.kt'
        ];
    }
    
    private getExcludePatterns(): string[] {
        return [
            '**/build/**',
            '**/.gradle/**',
            '**/.idea/**',
            '**/local.properties',
            '**/*.iml',
            '**/.DS_Store',
            '**/app/release/**',
            '**/captures/**',
            '**/.externalNativeBuild/**',
            '**/caches/**'
        ];
    }

### 3.3. Categorización de Archivos

    categorizeFile(relativePath: string): FileCategory {
        const fileName = path.basename(relativePath);
        const lowerPath = relativePath.toLowerCase();
        
        // Manifest
        if (fileName === 'AndroidManifest.xml') {
            return FileCategory.MANIFEST;
        }
        
        // Build configuration
        if (fileName === 'build.gradle' || fileName === 'settings.gradle') {
            return FileCategory.BUILD_CONFIG;
        }
        
        if (fileName === 'gradle.properties' || fileName === 'proguard-rules.pro') {
            return FileCategory.GRADLE;
        }
        
        // Layouts
        if (lowerPath.includes('/res/layout/')) {
            return FileCategory.LAYOUT;
        }
        
        // Navigation
        if (lowerPath.includes('/res/navigation/')) {
            return FileCategory.NAVIGATION;
        }
        
        // Resources
        if (lowerPath.includes('/res/values/') || lowerPath.includes('/res/drawable/')) {
            return FileCategory.RESOURCE;
        }
        
        // Source code
        if (relativePath.match(/\.(kt|java)$/)) {
            // Distinguir por tipo de clase
            if (lowerPath.includes('viewmodel')) {
                return FileCategory.MODEL;
            }
            if (lowerPath.includes('repository') || lowerPath.includes('service')) {
                return FileCategory.SERVICE;
            }
            if (lowerPath.includes('activity') || lowerPath.includes('fragment')) {
                return FileCategory.COMPONENT;
            }
            return FileCategory.SOURCE_CODE;
        }
        
        // Tests
        if (lowerPath.includes('/test/') || lowerPath.includes('/androidtest/')) {
            return FileCategory.TEST;
        }
        
        return FileCategory.OTHER;
    }

### 3.4. Asignación de Prioridades

    assignPriority(file: FileDescriptor): number {
        const priorityMap: Record<FileCategory, number> = {
            [FileCategory.MANIFEST]: 1,
            [FileCategory.BUILD_CONFIG]: 1,
            [FileCategory.GRADLE]: 1,
            [FileCategory.RESOURCE]: 2,
            [FileCategory.COMPONENT]: 3,
            [FileCategory.MODEL]: 3,
            [FileCategory.SERVICE]: 3,
            [FileCategory.SOURCE_CODE]: 3,
            [FileCategory.LAYOUT]: 4,
            [FileCategory.NAVIGATION]: 4,
            [FileCategory.STYLE]: 4,
            [FileCategory.TEST]: 5,
            [FileCategory.ASSET]: 6,
            [FileCategory.DOCUMENTATION]: 7,
            [FileCategory.OTHER]: 8
        };
        
        return priorityMap[file.category] || 9;
    }

### 3.5. Generación de Índice

    generateIndex(files: FileDescriptor[]): string {
        const grouped = this.groupByCategory(files);
        let index = '## 📋 Project Structure\n\n';
        
        for (const [category, categoryFiles] of grouped) {
            const icon = this.getCategoryIcon(category);
            index += `### ${icon} ${category} (${categoryFiles.length})\n`;
            
            for (const file of categoryFiles) {
                index += `- ${file.relativePath}\n`;
            }
            
            index += '\n';
        }
        
        return index;
    }
    
    private groupByCategory(files: FileDescriptor[]): Map<FileCategory, FileDescriptor[]> {
        const grouped = new Map<FileCategory, FileDescriptor[]>();
        
        for (const file of files) {
            if (!grouped.has(file.category)) {
                grouped.set(file.category, []);
            }
            grouped.get(file.category)!.push(file);
        }
        
        // Ordenar por prioridad dentro de cada categoría
        for (const [, categoryFiles] of grouped) {
            categoryFiles.sort((a, b) => a.priority - b.priority);
        }
        
        return grouped;
    }
    
    private getCategoryIcon(category: FileCategory): string {
        const icons: Record<FileCategory, string> = {
            [FileCategory.MANIFEST]: '📋',
            [FileCategory.BUILD_CONFIG]: '🔧',
            [FileCategory.GRADLE]: '⚙️',
            [FileCategory.SOURCE_CODE]: '📱',
            [FileCategory.COMPONENT]: '🧩',
            [FileCategory.SERVICE]: '🔌',
            [FileCategory.MODEL]: '📦',
            [FileCategory.LAYOUT]: '🎨',
            [FileCategory.RESOURCE]: '🖼️',
            [FileCategory.NAVIGATION]: '🧭',
            [FileCategory.TEST]: '🧪',
            [FileCategory.DOCUMENTATION]: '📝',
            [FileCategory.OTHER]: '📄'
        };
        
        return icons[category] || '📄';
    }

---

## 4. Estrategia iOS

### 4.1. Detección

    export class IOSStrategy implements ICodebaseStrategy {
        name = 'iOS';
        projectType: ProjectType = 'ios';
        
        async detect(workspaceRoot: string): Promise<boolean> {
            const indicators = [
                '**/*.xcodeproj',
                '**/*.xcworkspace',
                'Podfile',
                'Package.swift'
            ];
            
            for (const indicator of indicators) {
                const found = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(workspaceRoot, indicator),
                    null,
                    1
                );
                
                if (found.length > 0) {
                    return true;
                }
            }
            
            return false;
        }
    }

### 4.2. Archivos Relevantes

    private getSearchPatterns(): string[] {
        return [
            // Prioridad 1: Críticos
            'Podfile',
            'Podfile.lock',
            'Package.swift',
            '**/Info.plist',
            '**/*.entitlements',
            
            // Prioridad 2: Configuración
            '**/*.xcconfig',
            '**/project.pbxproj',
            
            // Prioridad 3: Código fuente
            '**/*.swift',
            '**/*.m',
            '**/*.h',
            
            // Prioridad 4: Storyboards y XIBs
            '**/*.storyboard',
            '**/*.xib',
            
            // Prioridad 5: Assets
            '**/Assets.xcassets/**/*.json',
            
            // Prioridad 6: Tests
            '**/*Tests.swift'
        ];
    }
    
    private getExcludePatterns(): string[] {
        return [
            '**/Pods/**',
            '**/build/**',
            '**/.build/**',
            '**/DerivedData/**',
            '**/*.xcassets/**/Contents.json',
            '**/.DS_Store'
        ];
    }

### 4.3. Categorización

    categorizeFile(relativePath: string): FileCategory {
        const fileName = path.basename(relativePath);
        const lowerPath = relativePath.toLowerCase();
        
        if (fileName === 'Podfile' || fileName === 'Package.swift') {
            return FileCategory.DEPENDENCY;
        }
        
        if (fileName === 'Info.plist' || fileName.endsWith('.entitlements')) {
            return FileCategory.MANIFEST;
        }
        
        if (fileName.endsWith('.xcconfig')) {
            return FileCategory.CONFIGURATION;
        }
        
        if (fileName.endsWith('.storyboard') || fileName.endsWith('.xib')) {
            return FileCategory.LAYOUT;
        }
        
        if (relativePath.match(/\.(swift|m|h)$/)) {
            if (lowerPath.includes('viewmodel') || lowerPath.includes('model')) {
                return FileCategory.MODEL;
            }
            if (lowerPath.includes('service') || lowerPath.includes('manager')) {
                return FileCategory.SERVICE;
            }
            if (lowerPath.includes('view') || lowerPath.includes('controller')) {
                return FileCategory.COMPONENT;
            }
            return FileCategory.SOURCE_CODE;
        }
        
        if (lowerPath.includes('test')) {
            return FileCategory.TEST;
        }
        
        return FileCategory.OTHER;
    }

---

## 5. Estrategia Web

### 5.1. Detección

    export class WebStrategy implements ICodebaseStrategy {
        name = 'Web';
        projectType: ProjectType = 'web';
        
        async detect(workspaceRoot: string): Promise<boolean> {
            const indicators = [
                'index.html',
                'index.htm',
                'package.json'
            ];
            
            for (const indicator of indicators) {
                const indicatorPath = path.join(workspaceRoot, indicator);
                if (await fileExists(indicatorPath)) {
                    // Verificar que no sea React (React tiene su propia estrategia)
                    const packageJsonPath = path.join(workspaceRoot, 'package.json');
                    if (await fileExists(packageJsonPath)) {
                        const content = await readFile(packageJsonPath);
                        const packageJson = JSON.parse(content);
                        
                        if (packageJson.dependencies?.react || packageJson.dependencies?.['react-dom']) {
                            return false; // Es React, no Web genérico
                        }
                    }
                    
                    return true;
                }
            }
            
            return false;
        }
    }

### 5.2. Archivos Relevantes

    private getSearchPatterns(): string[] {
        return [
            // Prioridad 1: HTML
            '*.html',
            '**/*.html',
            
            // Prioridad 2: CSS
            '*.css',
            '**/*.css',
            '**/*.scss',
            '**/*.sass',
            '**/*.less',
            
            // Prioridad 3: JavaScript
            '*.js',
            '**/*.js',
            '**/*.mjs',
            '**/*.ts',
            
            // Prioridad 4: Configuración
            'package.json',
            'tsconfig.json',
            'webpack.config.js',
            'vite.config.js',
            
            // Prioridad 5: Assets
            '**/images/**',
            '**/fonts/**'
        ];
    }
    
    private getExcludePatterns(): string[] {
        return [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/.next/**',
            '**/coverage/**'
        ];
    }

---

## 6. Estrategia React

### 6.1. Detección

    export class ReactStrategy implements ICodebaseStrategy {
        name = 'React';
        projectType: ProjectType = 'react';
        
        async detect(workspaceRoot: string): Promise<boolean> {
            const packageJsonPath = path.join(workspaceRoot, 'package.json');
            
            if (await fileExists(packageJsonPath)) {
                const content = await readFile(packageJsonPath);
                const packageJson = JSON.parse(content);
                
                return !!(
                    packageJson.dependencies?.react ||
                    packageJson.dependencies?.['react-dom'] ||
                    packageJson.devDependencies?.react
                );
            }
            
            return false;
        }
    }

### 6.2. Archivos Relevantes

    private getSearchPatterns(): string[] {
        return [
            // Prioridad 1: Configuración
            'package.json',
            'tsconfig.json',
            'vite.config.ts',
            'next.config.js',
            
            // Prioridad 2: Entry points
            'src/index.tsx',
            'src/index.jsx',
            'src/main.tsx',
            'src/App.tsx',
            'src/App.jsx',
            
            // Prioridad 3: Componentes
            'src/components/**/*.tsx',
            'src/components/**/*.jsx',
            
            // Prioridad 4: Pages/Routes
            'src/pages/**/*.tsx',
            'src/app/**/*.tsx',
            
            // Prioridad 5: Hooks
            'src/hooks/**/*.ts',
            'src/hooks/**/*.tsx',
            
            // Prioridad 6: Services/API
            'src/services/**/*.ts',
            'src/api/**/*.ts',
            
            // Prioridad 7: Styles
            'src/**/*.css',
            'src/**/*.scss',
            'src/**/*.module.css',
            
            // Prioridad 8: Tests
            'src/**/*.test.tsx',
            'src/**/*.spec.tsx'
        ];
    }

### 6.3. Categorización

    categorizeFile(relativePath: string): FileCategory {
        const lowerPath = relativePath.toLowerCase();
        
        if (relativePath === 'package.json' || relativePath === 'tsconfig.json') {
            return FileCategory.PACKAGE_JSON;
        }
        
        if (lowerPath.includes('/components/')) {
            return FileCategory.COMPONENT;
        }
        
        if (lowerPath.includes('/pages/') || lowerPath.includes('/app/')) {
            return FileCategory.COMPONENT;
        }
        
        if (lowerPath.includes('/hooks/')) {
            return FileCategory.SERVICE;
        }
        
        if (lowerPath.includes('/services/') || lowerPath.includes('/api/')) {
            return FileCategory.SERVICE;
        }
        
        if (relativePath.match(/\.(css|scss|sass|less)$/)) {
            return FileCategory.STYLE;
        }
        
        if (lowerPath.includes('.test.') || lowerPath.includes('.spec.')) {
            return FileCategory.TEST;
        }
        
        if (relativePath.match(/\.(tsx|jsx|ts|js)$/)) {
            return FileCategory.SOURCE_CODE;
        }
        
        return FileCategory.OTHER;
    }

---

## 7. Generación de Codebase

### 7.1. CodebaseGenerator (Refactorizado)

    export class CodebaseGenerator {
        constructor(private logger: Logger) {}
        
        async generate(
            files: FileDescriptor[],
            outputPath: vscode.Uri,
            options: CodebaseGeneratorOptions
        ): Promise<void> {
            if (options.format === 'markdown') {
                await this.generateMarkdown(files, outputPath, options);
            } else {
                await this.generateTarball(files, outputPath, options);
            }
        }
        
        private async generateMarkdown(
            files: FileDescriptor[],
            outputPath: vscode.Uri,
            options: CodebaseGeneratorOptions
        ): Promise<void> {
            let content = this.generateHeader(files, options);
            content += this.generateIndex(files, options);
            content += this.generateContent(files, options);
            
            await writeFile(outputPath, content);
            this.logger.info(`Codebase markdown generado: ${outputPath.fsPath}`);
        }
        
        private generateHeader(files: FileDescriptor[], options: CodebaseGeneratorOptions): string {
            let header = `# Bloom Codebase\n\n`;
            header += `> Generated on ${new Date().toISOString()}\n`;
            header += `> Project Type: ${options.projectType || 'Generic'}\n`;
            header += `> Total Files: ${files.length}\n`;
            header += `> Total Size: ${this.formatSize(this.calculateTotalSize(files))}\n\n`;
            
            return header;
        }
        
        private generateIndex(files: FileDescriptor[], options: CodebaseGeneratorOptions): string {
            if (options.strategy) {
                return options.strategy.generateIndex(files);
            }
            
            // Índice genérico
            let index = '## 📋 File Index\n\n';
            for (const file of files) {
                index += `- ${file.relativePath}\n`;
            }
            index += '\n---\n\n';
            
            return index;
        }
        
        private async generateContent(files: FileDescriptor[], options: CodebaseGeneratorOptions): Promise<string> {
            let content = '';
            
            const grouped = this.groupByCategory(files);
            
            for (const [category, categoryFiles] of grouped) {
                const icon = this.getCategoryIcon(category);
                content += `## ${icon} ${category}\n\n`;
                
                for (const file of categoryFiles) {
                    content += await this.generateFileSection(file, options);
                }
                
                content += '---\n\n';
            }
            
            return content;
        }
        
        private async generateFileSection(file: FileDescriptor, options: CodebaseGeneratorOptions): Promise<string> {
            let section = `### File: ${file.relativePath}\n`;
            section += `Category: ${file.category}\n`;
            section += `Size: ${this.formatSize(file.size)}\n`;
            section += `Priority: ${file.priority}\n\n`;
            
            // Leer contenido del archivo
            const fileUri = vscode.Uri.file(file.absolutePath);
            const fileContent = await readFileContent(fileUri);
            
            // Indentación de 4 espacios
            const indented = fileContent
                .split('\n')
                .map(line => `    ${line}`)
                .join('\n');
            
            section += indented;
            section += '\n\n';
            
            return section;
        }
        
        private async generateTarball(
            files: FileDescriptor[],
            outputPath: vscode.Uri,
            options: CodebaseGeneratorOptions
        ): Promise<void> {
            const packager = new FilePackager(this.logger);
            const fileUris = files.map(f => vscode.Uri.file(f.absolutePath));
            
            await packager.createTarball(
                fileUris,
                outputPath,
                options.workspaceFolder
            );
            
            this.logger.info(`Codebase tarball generado: ${outputPath.fsPath}`);
        }
        
        private groupByCategory(files: FileDescriptor[]): Map<FileCategory, FileDescriptor[]> {
            const grouped = new Map<FileCategory, FileDescriptor[]>();
            
            for (const file of files) {
                if (!grouped.has(file.category)) {
                    grouped.set(file.category, []);
                }
                grouped.get(file.category)!.push(file);
            }
            
            return grouped;
        }
        
        private getCategoryIcon(category: FileCategory): string {
            const icons: Record<FileCategory, string> = {
                [FileCategory.MANIFEST]: '📋',
                [FileCategory.BUILD_CONFIG]: '🔧',
                [FileCategory.PACKAGE_JSON]: '📦',
                [FileCategory.SOURCE_CODE]: '📱',
                [FileCategory.COMPONENT]: '🧩',
                [FileCategory.SERVICE]: '🔌',
                [FileCategory.MODEL]: '📊',
                [FileCategory.CONTROLLER]: '🎮',
                [FileCategory.LAYOUT]: '🎨',
                [FileCategory.STYLE]: '🖌️',
                [FileCategory.RESOURCE]: '🖼️',
                [FileCategory.NAVIGATION]: '🧭',
                [FileCategory.TEST]: '🧪',
                [FileCategory.ASSET]: '🎬',
                [FileCategory.DOCUMENTATION]: '📝',
                [FileCategory.CONFIGURATION]: '⚙️',
                [FileCategory.OTHER]: '📄'
            };
            
            return icons[category] || '📄';
        }
        
        private calculateTotalSize(files: FileDescriptor[]): number {
            return files.reduce((sum, file) => sum + file.size, 0);
        }
        
        private formatSize(bytes: number): string {
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }
    }
    
    export interface CodebaseGeneratorOptions {
        format: 'markdown' | 'tarball';
        projectType?: ProjectType;
        strategy?: ICodebaseStrategy;
        workspaceFolder: vscode.WorkspaceFolder;
        includeTests?: boolean;
        maxFileSize?: number;
    }

---

## 8. Flujo de Usuario Mejorado

### 8.1. Selección Manual (Actual)

    1. Usuario selecciona archivos en Explorer
    2. Click derecho → Bloom: Generate Intent
    3. Formulario se abre con archivos pre-poblados
    4. Usuario completa formulario
    5. Sistema genera intent + codebase

### 8.2. Selección Automática (Nueva)

    1. Usuario abre workspace con proyecto Android
    2. Click en "Bloom: Generate Intent" (sin seleccionar archivos)
    3. Sistema detecta: "Android project"
    4. Quick Pick muestra archivos pre-seleccionados por prioridad:
       
       ✓ app/build.gradle (Build Config - Priority 1)
       ✓ AndroidManifest.xml (Manifest - Priority 1)
       ✓ MainActivity.kt (Component - Priority 3)
       ✓ activity_main.xml (Layout - Priority 4)
       ☐ MainViewModelTest.kt (Test - Priority 5)
    
    5. Usuario ajusta selección (agrega/quita archivos)
    6. Acepta selección
    7. Formulario se abre con archivos seleccionados
    8. Sistema genera intent + codebase

### 8.3. Modo Híbrido (Recomendado)

    1. Usuario selecciona algunos archivos clave manualmente
    2. Click derecho → Bloom: Generate Intent
    3. Sistema detecta proyecto y sugiere archivos adicionales
    4. Quick Pick muestra:
       - Archivos seleccionados manualmente (marcados)
       - Archivos sugeridos por estrategia (pre-marcados)
       - Otros archivos relevantes (sin marcar)
    5. Usuario ajusta y confirma
    6. Proceso continúa normalmente

---

## 9. Integración con Intent Manager

### 9.1. Flujo Completo

    generateIntent.ts (comando)
            ↓
    Detectar archivos seleccionados
            ↓
    ProjectDetector.detectStrategy()
            ↓
    Strategy.getRelevantFiles() → FileDescriptor[]
            ↓
    Quick Pick con pre-selección
            ↓
    Usuario ajusta selección
            ↓
    IntentFormPanel.show()
            ↓
    Usuario completa formulario
            ↓
    Crear carpeta .bloom/intents/[nombre]/
            ↓
    CodebaseGenerator.generate()
            ↓
    ├─→ codebase.md (si version === 'free')
    └─→ codebase.tar.gz (si version === 'pro')
            ↓
    IntentGenerator.generate() → intent.bl
            ↓
    MetadataManager.create() → .bloom-meta.json
            ↓
    IntentTreeProvider.refresh()

### 9.2. Código de Integración

    // commands/generateIntent.ts (refactorizado)
    
    export async function registerGenerateIntent(
        context: vscode.ExtensionContext,
        logger: Logger
    ): Promise<void> {
        const disposable = vscode.commands.registerCommand(
            'bloom.generateIntent',
            async (uri: vscode.Uri, selectedUris: vscode.Uri[]) => {
                logger.info('Ejecutando comando: Bloom: Generate Intent');
                
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    vscode.window.showErrorMessage('No hay workspace abierto.');
                    return;
                }
                
                // 1. Determinar archivos seleccionados
                let selectedFiles: vscode.Uri[] = [];
                
                if (selectedUris && selectedUris.length > 0) {
                    selectedFiles = selectedUris;
                } else if (uri) {
                    selectedFiles = [uri];
                }
                
                // 2. Detectar tipo de proyecto
                const detector = new ProjectDetector();
                const strategy = await detector.detectStrategy(workspaceFolder.uri.fsPath);
                
                let finalFiles: vscode.Uri[] = [];
                
                if (strategy && selectedFiles.length === 0) {
                    // Modo automático: usar estrategia para sugerir archivos
                    logger.info(`Proyecto detectado: ${strategy.name}`);
                    
                    const relevantFiles = await strategy.getRelevantFiles(
                        workspaceFolder.uri.fsPath
                    );
                    
                    // Mostrar Quick Pick con pre-selección
                    finalFiles = await showFileSelectionQuickPick(
                        relevantFiles,
                        strategy
                    );
                    
                    if (finalFiles.length === 0) {
                        logger.warn('Usuario canceló selección de archivos');
                        return;
                    }
                    
                } else if (strategy && selectedFiles.length > 0) {
                    // Modo híbrido: combinar selección manual con sugerencias
                    logger.info(`Proyecto detectado: ${strategy.name} (modo híbrido)`);
                    
                    const relevantFiles = await strategy.getRelevantFiles(
                        workspaceFolder.uri.fsPath,
                        selectedFiles
                    );
                    
                    finalFiles = await showFileSelectionQuickPick(
                        relevantFiles,
                        strategy,
                        selectedFiles
                    );
                    
                    if (finalFiles.length === 0) {
                        logger.warn('Usuario canceló selección de archivos');
                        return;
                    }
                    
                } else {
                    // Modo manual: usar archivos seleccionados directamente
                    if (selectedFiles.length === 0) {
                        vscode.window.showErrorMessage(
                            'Por favor selecciona al menos un archivo antes de generar un intent.'
                        );
                        return;
                    }
                    
                    finalFiles = selectedFiles;
                }
                
                // 3. Validar límite de archivos
                if (finalFiles.length > 1000) {
                    vscode.window.showErrorMessage(
                        `Has seleccionado ${finalFiles.length} archivos. El límite máximo es 1000.`
                    );
                    return;
                }
                
                // 4. Convertir a rutas relativas
                const relativePaths = finalFiles.map(file =>
                    path.relative(workspaceFolder.uri.fsPath, file.fsPath)
                );
                
                logger.info(`Archivos finales: ${finalFiles.length}`);
                
                // 5. Abrir formulario
                const formPanel = new IntentFormPanel(
                    context,
                    logger,
                    workspaceFolder,
                    finalFiles,
                    relativePaths,
                    strategy // Pasar estrategia para usar en generación
                );
                
                formPanel.show();
            }
        );
        
        context.subscriptions.push(disposable);
        logger.info('Comando "bloom.generateIntent" registrado');
    }

### 9.3. Quick Pick con Pre-selección

    async function showFileSelectionQuickPick(
        fileDescriptors: FileDescriptor[],
        strategy: ICodebaseStrategy,
        manuallySelected?: vscode.Uri[]
    ): Promise<vscode.Uri[]> {
        const quickPick = vscode.window.createQuickPick<FileQuickPickItem>();
        
        quickPick.title = `Seleccionar archivos para Intent (${strategy.name})`;
        quickPick.placeholder = 'Marca/desmarca archivos. Enter para confirmar.';
        quickPick.canSelectMany = true;
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;
        
        // Crear items
        const items: FileQuickPickItem[] = fileDescriptors.map(fd => {
            const wasManuallySelected = manuallySelected?.some(
                uri => uri.fsPath === fd.absolutePath
            );
            
            return {
                label: path.basename(fd.relativePath),
                description: fd.relativePath,
                detail: `${fd.category} | Priority ${fd.priority} | ${formatSize(fd.size)}`,
                picked: fd.priority <= 4 || wasManuallySelected, // Auto-select priority 1-4
                alwaysShow: true,
                fileDescriptor: fd,
                manuallySelected: wasManuallySelected
            };
        });
        
        // Ordenar: manuales primero, luego por prioridad
        items.sort((a, b) => {
            if (a.manuallySelected && !b.manuallySelected) return -1;
            if (!a.manuallySelected && b.manuallySelected) return 1;
            return a.fileDescriptor.priority - b.fileDescriptor.priority;
        });
        
        quickPick.items = items;
        quickPick.selectedItems = items.filter(item => item.picked);
        
        return new Promise<vscode.Uri[]>((resolve) => {
            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems.map(
                    item => vscode.Uri.file(item.fileDescriptor.absolutePath)
                );
                quickPick.dispose();
                resolve(selected);
            });
            
            quickPick.onDidHide(() => {
                quickPick.dispose();
                resolve([]);
            });
            
            quickPick.show();
        });
    }
    
    interface FileQuickPickItem extends vscode.QuickPickItem {
        fileDescriptor: FileDescriptor;
        manuallySelected?: boolean;
    }

---

## 10. Formato de Salida: codebase.md

### 10.1. Estructura Completa

    # Bloom Codebase
    
    > Generated on 2025-11-16T10:30:00.000Z
    > Project Type: Android
    > Total Files: 12
    > Total Size: 45.6 KB
    
    ## 📋 Project Structure
    
    ### 🔧 Build Configuration (3)
    - app/build.gradle
    - settings.gradle
    - gradle.properties
    
    ### 📱 Source Code (5)
    - app/src/main/java/com/example/MainActivity.kt
    - app/src/main/java/com/example/LoginViewModel.kt
    - app/src/main/java/com/example/AuthRepository.kt
    - app/src/main/java/com/example/AuthService.kt
    - app/src/main/java/com/example/TokenManager.kt
    
    ### 🎨 Layout (4)
    - app/src/main/res/layout/activity_main.xml
    - app/src/main/res/layout/fragment_login.xml
    - app/src/main/res/values/strings.xml
    - app/src/main/res/navigation/nav_graph.xml
    
    ---
    
    ## 🔧 Build Configuration
    
    ### File: app/build.gradle
    Category: Build Configuration
    Size: 2.4 KB
    Priority: 1
    
        plugins {
            id 'com.android.application'
            id 'org.jetbrains.kotlin.android'
            id 'kotlin-kapt'
        }
        
        android {
            namespace 'com.example.app'
            compileSdk 34
            
            defaultConfig {
                applicationId "com.example.app"
                minSdk 24
                targetSdk 34
                versionCode 1
                versionName "1.0"
            }
            
            buildFeatures {
                viewBinding true
            }
        }
        
        dependencies {
            implementation 'androidx.core:core-ktx:1.12.0'
            implementation 'androidx.lifecycle:lifecycle-viewmodel-ktx:2.7.0'
        }
    
    ---
    
    ### File: settings.gradle
    Category: Build Configuration
    Size: 0.3 KB
    Priority: 1
    
        pluginManagement {
            repositories {
                google()
                mavenCentral()
            }
        }
        
        dependencyResolutionManagement {
            repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
            repositories {
                google()
                mavenCentral()
            }
        }
        
        rootProject.name = "MyApp"
        include ':app'
    
    ---
    
    ## 📱 Source Code
    
    ### File: app/src/main/java/com/example/MainActivity.kt
    Category: Component
    Size: 3.2 KB
    Priority: 3
    
        package com.example
        
        import android.os.Bundle
        import androidx.activity.viewModels
        import androidx.appcompat.app.AppCompatActivity
        import com.example.databinding.ActivityMainBinding
        
        class MainActivity : AppCompatActivity() {
            
            private lateinit var binding: ActivityMainBinding
            private val viewModel: LoginViewModel by viewModels()
            
            override fun onCreate(savedInstanceState: Bundle?) {
                super.onCreate(savedInstanceState)
                binding = ActivityMainBinding.inflate(layoutInflater)
                setContentView(binding.root)
                
                setupUI()
                observeViewModel()
            }
            
            private fun setupUI() {
                binding.btnLogin.setOnClickListener {
                    val email = binding.etEmail.text.toString()
                    val password = binding.etPassword.text.toString()
                    viewModel.login(email, password)
                }
            }
            
            private fun observeViewModel() {
                viewModel.loginState.observe(this) { state ->
                    when (state) {
                        is LoginState.Loading -> showLoading()
                        is LoginState.Success -> navigateToHome()
                        is LoginState.Error -> showError(state.message)
                    }
                }
            }
        }
    
    ---
    
    [... más archivos ...]

### 10.2. Ventajas del Formato Markdown

    ✅ Legible por humanos
    ✅ Fácil de copiar/pegar en Claude.ai
    ✅ Puede editarse manualmente antes de enviar
    ✅ Incluye metadata útil (categoría, tamaño, prioridad)
    ✅ Organizado por categoría con índice
    ✅ Compatible con versión gratis (sin API)

---

## 11. Formato de Salida: codebase.tar.gz

### 11.1. Estructura del Tarball

El archivo .tar.gz mantiene la estructura de carpetas original:

    codebase.tar.gz
    ├── app/
    │   ├── build.gradle
    │   └── src/
    │       └── main/
    │           ├── AndroidManifest.xml
    │           └── java/
    │               └── com/
    │                   └── example/
    │                       ├── MainActivity.kt
    │                       └── LoginViewModel.kt
    ├── settings.gradle
    └── gradle.properties

### 11.2. Implementación (Ya Existente)

El código actual de `filePackager.ts` ya implementa la creación de tar.gz:

    export class FilePackager {
        private readonly MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
        
        async createTarball(
            files: vscode.Uri[],
            outputPath: vscode.Uri,
            workspaceFolder: vscode.WorkspaceFolder
        ): Promise<void> {
            // Leer archivos
            const fileContents: Array<{ path: string; content: Uint8Array }> = [];
            
            for (const fileUri of files) {
                const relativePath = path.relative(
                    workspaceFolder.uri.fsPath,
                    fileUri.fsPath
                );
                const content = await vscode.workspace.fs.readFile(fileUri);
                
                fileContents.push({ path: relativePath, content });
            }
            
            // Crear tar
            const tarBuffer = this.createTar(fileContents);
            
            // Comprimir con gzip
            const gzipBuffer = await this.compressGzip(tarBuffer);
            
            // Escribir
            await vscode.workspace.fs.writeFile(outputPath, gzipBuffer);
        }
    }

### 11.3. Ventajas del Formato Tarball

    ✅ Archivos individuales preservados
    ✅ Estructura de carpetas mantenida
    ✅ Compresión eficiente (menor tamaño)
    ✅ Compatible con API de Claude (puede extraer automáticamente)
    ✅ Ideal para proyectos grandes

---

## 12. Refactorización de IntentFormPanel

### 12.1. Aceptar Estrategia

    export class IntentFormPanel {
        constructor(
            private context: vscode.ExtensionContext,
            private logger: Logger,
            private workspaceFolder: vscode.WorkspaceFolder,
            private selectedFiles: vscode.Uri[],
            private relativePaths: string[],
            private strategy?: ICodebaseStrategy // NUEVO
        ) {}
        
        private async handleSubmit(data: IntentFormData): Promise<void> {
            // ... validación ...
            
            // Crear carpeta
            const intentFolder = vscode.Uri.joinPath(
                this.workspaceFolder.uri,
                '.bloom',
                'intents',
                data.name
            );
            await vscode.workspace.fs.createDirectory(intentFolder);
            
            // Determinar formato según configuración
            const version = vscode.workspace.getConfiguration('bloom').get<string>('version', 'free');
            const codebaseFile = version === 'free' ? 'codebase.md' : 'codebase.tar.gz';
            
            // Generar codebase
            const generator = new CodebaseGenerator(this.logger);
            const codebasePath = vscode.Uri.joinPath(intentFolder, codebaseFile);
            
            const fileDescriptors = await this.createFileDescriptors();
            
            await generator.generate(fileDescriptors, codebasePath, {
                format: version === 'free' ? 'markdown' : 'tarball',
                projectType: this.strategy?.projectType,
                strategy: this.strategy,
                workspaceFolder: this.workspaceFolder
            });
            
            // Generar intent.bl
            const intentGenerator = new IntentGenerator(this.logger);
            const intentPath = vscode.Uri.joinPath(intentFolder, 'intent.bl');
            await intentGenerator.generateIntent(data, this.relativePaths, intentPath);
            
            // Crear metadata
            const metadataManager = new MetadataManager(this.logger);
            await metadataManager.create(intentFolder, {
                name: data.name,
                projectType: this.strategy?.projectType,
                version: version,
                files: this.selectedFiles,
                filesCount: this.selectedFiles.length
            });
            
            // Éxito
            this.panel?.dispose();
            vscode.window.showInformationMessage(
                `✅ Intent '${data.name}' creado exitosamente en .bloom/intents/${data.name}/`
            );
        }
        
        private async createFileDescriptors(): Promise<FileDescriptor[]> {
            const descriptors: FileDescriptor[] = [];
            
            for (const fileUri of this.selectedFiles) {
                const relativePath = path.relative(
                    this.workspaceFolder.uri.fsPath,
                    fileUri.fsPath
                );
                
                const stat = await vscode.workspace.fs.stat(fileUri);
                const extension = path.extname(fileUri.fsPath);
                
                const category = this.strategy
                    ? this.strategy.categorizeFile(relativePath)
                    : FileCategory.OTHER;
                
                const descriptor: FileDescriptor = {
                    absolutePath: fileUri.fsPath,
                    relativePath: relativePath,
                    category: category,
                    priority: 5, // Default
                    size: stat.size,
                    extension: extension
                };
                
                if (this.strategy) {
                    descriptor.priority = this.strategy.assignPriority(descriptor);
                }
                
                descriptors.push(descriptor);
            }
            
            return descriptors.sort((a, b) => a.priority - b.priority);
        }
    }

---

## 13. Configuración del Plugin

### 13.1. Settings en package.json

    "contributes": {
        "configuration": {
            "title": "Bloom Codebase",
            "properties": {
                "bloom.version": {
                    "type": "string",
                    "enum": ["free", "pro"],
                    "default": "free",
                    "description": "Versión del plugin (free: codebase.md, pro: codebase.tar.gz + API)"
                },
                "bloom.codebase.includeTests": {
                    "type": "boolean",
                    "default": false,
                    "description": "Incluir archivos de test en el codebase"
                },
                "bloom.codebase.maxFileSize": {
                    "type": "number",
                    "default": 1048576,
                    "description": "Tamaño máximo por archivo en bytes (default: 1MB)"
                },
                "bloom.codebase.maxTotalSize": {
                    "type": "number",
                    "default": 104857600,
                    "description": "Tamaño total máximo del codebase en bytes (default: 100MB)"
                },
                "bloom.codebase.autoDetectProjectType": {
                    "type": "boolean",
                    "default": true,
                    "description": "Detectar automáticamente el tipo de proyecto"
                },
                "bloom.codebase.showQuickPickOnAutoDetect": {
                    "type": "boolean",
                    "default": true,
                    "description": "Mostrar Quick Pick de selección cuando se detecta proyecto automáticamente"
                }
            }
        }
    }

### 13.2. Leer Configuración

    function getCodebaseConfig(): CodebaseConfig {
        const config = vscode.workspace.getConfiguration('bloom.codebase');
        
        return {
            includeTests: config.get<boolean>('includeTests', false),
            maxFileSize: config.get<number>('maxFileSize', 1048576),
            maxTotalSize: config.get<number>('maxTotalSize', 104857600),
            autoDetect: config.get<boolean>('autoDetectProjectType', true),
            showQuickPick: config.get<boolean>('showQuickPickOnAutoDetect', true)
        };
    }

---

## 14. Testing

### 14.1. Unit Tests para Estrategias

    // tests/strategies/androidStrategy.test.ts
    
    describe('AndroidStrategy', () => {
        let strategy: AndroidStrategy;
        
        beforeEach(() => {
            strategy = new AndroidStrategy();
        });
        
        describe('detect', () => {
            it('should detect Android project with build.gradle', async () => {
                const mockWorkspace = createMockWorkspace({
                    'build.gradle': '',
                    'app/build.gradle': ''
                });
                
                const detected = await strategy.detect(mockWorkspace.root);
                expect(detected).toBe(true);
            });
            
            it('should not detect non-Android project', async () => {
                const mockWorkspace = createMockWorkspace({
                    'package.json': '{}'
                });
                
                const detected = await strategy.detect(mockWorkspace.root);
                expect(detected).toBe(false);
            });
        });
        
        describe('categorizeFile', () => {
            it('should categorize manifest file', () => {
                const category = strategy.categorizeFile('app/src/main/AndroidManifest.xml');
                expect(category).toBe(FileCategory.MANIFEST);
            });
            
            it('should categorize build.gradle', () => {
                const category = strategy.categorizeFile('app/build.gradle');
                expect(category).toBe(FileCategory.BUILD_CONFIG);
            });
            
            it('should categorize Kotlin source', () => {
                const category = strategy.categorizeFile('app/src/main/java/com/example/MainActivity.kt');
                expect(category).toBe(FileCategory.COMPONENT);
            });
        });
        
        describe('assignPriority', () => {
            it('should assign priority 1 to manifest', () => {
                const file: FileDescriptor = {
                    absolutePath: '/path/AndroidManifest.xml',
                    relativePath: 'app/src/main/AndroidManifest.xml',
                    category: FileCategory.MANIFEST,
                    priority: 0,
                    size: 1024,
                    extension: '.xml'
                };
                
                const priority = strategy.assignPriority(file);
                expect(priority).toBe(1);
            });
        });
    });

### 14.2. Integration Tests

    // tests/integration/codebaseGenerator.test.ts
    
    describe('CodebaseGenerator Integration', () => {
        it('should generate markdown codebase for Android project', async () => {
            const workspace = await createTestWorkspace('android-sample');
            const detector = new ProjectDetector();
            const strategy = await detector.detectStrategy(workspace.root);
            
            expect(strategy).not.toBeNull();
            expect(strategy!.name).toBe('Android');
            
            const files = await strategy!.getRelevantFiles(workspace.root);
            expect(files.length).toBeGreaterThan(0);
            
            const generator = new CodebaseGenerator(logger);
            const outputPath = path.join(workspace.root, 'codebase.md');
            
            await generator.generate(files, vscode.Uri.file(outputPath), {
                format: 'markdown',
                strategy: strategy!,
                workspaceFolder: workspace.folder
            });
            
            const content = await fs.readFile(outputPath, 'utf8');
            expect(content).toContain('# Bloom Codebase');
            expect(content).toContain('Project Type: Android');
            expect(content).toContain('## 🔧 Build Configuration');
        });
    });

---

## 15. Estrategias Adicionales (Resumen)

### 15.1. Flutter Strategy

    Detección:
    - pubspec.yaml con dependencies.flutter
    - lib/ folder con .dart files
    
    Archivos relevantes:
    - pubspec.yaml (Priority 1)
    - lib/main.dart (Priority 1)
    - lib/**/*.dart (Priority 3)
    - assets/** (Priority 5)
    - test/**/*.dart (Priority 6)

### 15.2. Node.js Backend Strategy

    Detección:
    - package.json sin react/vue/angular
    - Presencia de express/fastify/nest en dependencies
    
    Archivos relevantes:
    - package.json (Priority 1)
    - src/index.ts o server.ts (Priority 1)
    - src/**/*.ts (Priority 3)
    - .env.example (Priority 2)
    - tests/**/*.test.ts (Priority 5)

### 15.3. Python Strategy

    Detección:
    - requirements.txt o pyproject.toml
    - setup.py
    - Archivos .py en root
    
    Archivos relevantes:
    - requirements.txt (Priority 1)
    - setup.py (Priority 1)
    - **/*.py (Priority 3)
    - tests/**/*.py (Priority 5)

---

## 16. Optimizaciones de Performance

### 16.1. Caché de Detección

    class ProjectDetectionCache {
        private cache = new Map<string, CachedDetection>();
        
        async getOrDetect(workspaceRoot: string): Promise<ICodebaseStrategy | null> {
            const cached = this.cache.get(workspaceRoot);
            
            if (cached && Date.now() - cached.timestamp < 60000) {
                return cached.strategy;
            }
            
            const detector = new ProjectDetector();
            const strategy = await detector.detectStrategy(workspaceRoot);
            
            this.cache.set(workspaceRoot, {
                strategy,
                timestamp: Date.now()
            });
            
            return strategy;
        }
    }

### 16.2. Búsqueda Paralela de Archivos

    async getRelevantFiles(workspaceRoot: string): Promise<FileDescriptor[]> {
        const patterns = this.getSearchPatterns();
        const excludePatterns = this.getExcludePatterns();
        
        // Buscar en paralelo
        const searchPromises = patterns.map(pattern =>
            vscode.workspace.findFiles(
                new vscode.RelativePattern(workspaceRoot, pattern),
                `{${excludePatterns.join(',')}}`
            )
        );
        
        const results = await Promise.all(searchPromises);
        const allFiles = results.flat();
        
        // Crear descriptores en paralelo
        const descriptorPromises = allFiles.map(uri =>
            this.createFileDescriptor(uri, workspaceRoot)
        );
        
        return Promise.all(descriptorPromises);
    }

---

## 17. Resultado Esperado

Un sistema completo de generación de codebase que:

1. ✅ Detecta automáticamente el tipo de proyecto
2. ✅ Sugiere archivos relevantes según estrategia específica
3. ✅ Categoriza archivos por importancia y función
4. ✅ Pre-selecciona archivos inteligentemente
5. ✅ Excluye archivos innecesarios automáticamente
6. ✅ Genera codebase.md para versión gratis
7. ✅ Genera codebase.tar.gz para versión paga
8. ✅ Incluye índice organizado por categoría
9. ✅ Proporciona metadata útil (tamaño, prioridad, categoría)
10. ✅ Se integra perfectamente con Intent Manager
11. ✅ Soporta múltiples tipos de proyecto (Android, iOS, React, etc.)
12. ✅ Es extensible para agregar nuevas estrategias
13. ✅ Tiene performance optimizada con caché y búsqueda paralela
14. ✅ Incluye validaciones y manejo de errores robusto
15. ✅ Es testeable con cobertura completa

---

## 18. Próximos Pasos de Implementación

### Fase 1: Core Interfaces (Semana 1)

- [ ] Crear interfaces (ICodebaseStrategy, FileDescriptor, FileCategory)
- [ ] Implementar ProjectDetector
- [ ] Implementar AndroidStrategy completa
- [ ] Unit tests para core components

### Fase 2: Generador (Semana 2)

- [ ] Refactorizar CodebaseGenerator para soportar markdown
- [ ] Implementar generación de codebase.md
- [ ] Mantener generación de codebase.tar.gz existente
- [ ] Integration tests

### Fase 3: Estrategias Adicionales (Semana 3)

- [ ] Implementar IOSStrategy
- [ ] Implementar ReactStrategy
- [ ] Implementar WebStrategy
- [ ] Implementar GenericStrategy (fallback)
- [ ] Tests para cada estrategia

### Fase 4: UI Integration (Semana 4)

- [ ] Implementar Quick Pick con pre-selección
- [ ] Refactorizar generateIntent.ts
- [ ] Agregar detección automática al flujo
- [ ] Implementar modo híbrido
- [ ] End-to-end tests

### Fase 5: Optimización (Semana 5)

- [ ] Implementar caché de detección
- [ ] Optimizar búsqueda de archivos (paralela)
- [ ] Agregar progress indicators
- [ ] Performance testing
- [ ] Memory profiling

### Fase 6: Documentación y Polish (Semana 6)

- [ ] Documentación completa de APIs
- [ ] Guía para agregar nuevas estrategias
- [ ] Ejemplos de uso
- [ ] Tutorial interactivo
- [ ] Release v1.0.0

---

## 19. Guía para Agregar Nueva Estrategia

### 19.1. Template Básico

    export class MyProjectStrategy implements ICodebaseStrategy {
        name = 'My Project Type';
        projectType: ProjectType = 'generic'; // o crear nuevo tipo
        
        async detect(workspaceRoot: string): Promise<boolean> {
            // Buscar archivos indicadores
            const indicators = [
                'my-project-file.json',
                'specific-folder/'
            ];
            
            for (const indicator of indicators) {
                const indicatorPath = path.join(workspaceRoot, indicator);
                if (await fileExists(indicatorPath)) {
                    return true;
                }
            }
            
            return false;
        }
        
        async getRelevantFiles(
            workspaceRoot: string,
            selectedFiles?: vscode.Uri[]
        ): Promise<FileDescriptor[]> {
            const patterns = [
                // Priority 1: Críticos
                'config-file.json',
                
                // Priority 2: Configuración
                'settings/**/*.json',
                
                // Priority 3: Código fuente
                'src/**/*.ext'
            ];
            
            const excludePatterns = [
                '**/node_modules/**',
                '**/build/**'
            ];
            
            const files: FileDescriptor[] = [];
            
            for (const pattern of patterns) {
                const found = await vscode.workspace.findFiles(
                    new vscode.RelativePattern(workspaceRoot, pattern),
                    `{${excludePatterns.join(',')}}`
                );
                
                for (const fileUri of found) {
                    const descriptor = await this.createFileDescriptor(
                        fileUri,
                        workspaceRoot
                    );
                    files.push(descriptor);
                }
            }
            
            return files.sort((a, b) => a.priority - b.priority);
        }
        
        categorizeFile(relativePath: string): FileCategory {
            const fileName = path.basename(relativePath);
            const lowerPath = relativePath.toLowerCase();
            
            if (fileName === 'config-file.json') {
                return FileCategory.CONFIGURATION;
            }
            
            if (lowerPath.includes('/src/')) {
                return FileCategory.SOURCE_CODE;
            }
            
            return FileCategory.OTHER;
        }
        
        assignPriority(file: FileDescriptor): number {
            const priorityMap: Record<FileCategory, number> = {
                [FileCategory.CONFIGURATION]: 1,
                [FileCategory.SOURCE_CODE]: 3,
                [FileCategory.OTHER]: 5
            };
            
            return priorityMap[file.category] || 9;
        }
        
        generateIndex(files: FileDescriptor[]): string {
            // Usar implementación base o personalizar
            return this.defaultGenerateIndex(files);
        }
        
        private async createFileDescriptor(
            fileUri: vscode.Uri,
            workspaceRoot: string
        ): Promise<FileDescriptor> {
            const relativePath = path.relative(workspaceRoot, fileUri.fsPath);
            const stat = await vscode.workspace.fs.stat(fileUri);
            const extension = path.extname(fileUri.fsPath);
            
            const category = this.categorizeFile(relativePath);
            
            const descriptor: FileDescriptor = {
                absolutePath: fileUri.fsPath,
                relativePath: relativePath,
                category: category,
                priority: 0,
                size: stat.size,
                extension: extension
            };
            
            descriptor.priority = this.assignPriority(descriptor);
            
            return descriptor;
        }
    }

### 19.2. Registrar Nueva Estrategia

    // En ProjectDetector constructor
    private registerStrategies(): void {
        this.strategies = [
            new AndroidStrategy(),
            new IOSStrategy(),
            new ReactStrategy(),
            new MyProjectStrategy(),      // ← Agregar aquí
            new GenericStrategy()          // Siempre último (fallback)
        ];
    }

### 19.3. Testing de Nueva Estrategia

    describe('MyProjectStrategy', () => {
        let strategy: MyProjectStrategy;
        
        beforeEach(() => {
            strategy = new MyProjectStrategy();
        });
        
        it('should detect my project type', async () => {
            const workspace = createMockWorkspace({
                'my-project-file.json': '{}'
            });
            
            const detected = await strategy.detect(workspace.root);
            expect(detected).toBe(true);
        });
        
        it('should categorize files correctly', () => {
            expect(strategy.categorizeFile('config-file.json'))
                .toBe(FileCategory.CONFIGURATION);
            
            expect(strategy.categorizeFile('src/main.ext'))
                .toBe(FileCategory.SOURCE_CODE);
        });
        
        it('should assign correct priorities', () => {
            const configFile: FileDescriptor = {
                absolutePath: '/path/config-file.json',
                relativePath: 'config-file.json',
                category: FileCategory.CONFIGURATION,
                priority: 0,
                size: 1024,
                extension: '.json'
            };
            
            expect(strategy.assignPriority(configFile)).toBe(1);
        });
    });

---

## 20. Casos de Uso Avanzados

### 20.1. Proyecto Monorepo

Para proyectos con múltiples sub-proyectos:

    my-monorepo/
    ├── backend/           (Node.js)
    ├── frontend/          (React)
    └── mobile/            (React Native)

Estrategia:

    export class MonorepoStrategy implements ICodebaseStrategy {
        name = 'Monorepo';
        projectType: ProjectType = 'generic';
        
        async detect(workspaceRoot: string): Promise<boolean> {
            // Detectar workspace de Yarn/npm/pnpm
            const indicators = [
                'yarn.lock',
                'pnpm-workspace.yaml',
                'lerna.json'
            ];
            
            for (const indicator of indicators) {
                if (await fileExists(path.join(workspaceRoot, indicator))) {
                    // Verificar que hay múltiples package.json
                    const packageJsons = await vscode.workspace.findFiles(
                        '**/package.json',
                        '**/node_modules/**'
                    );
                    
                    return packageJsons.length > 1;
                }
            }
            
            return false;
        }
        
        async getRelevantFiles(workspaceRoot: string): Promise<FileDescriptor[]> {
            // Permitir selección de sub-proyecto
            const subProjects = await this.detectSubProjects(workspaceRoot);
            
            const selected = await vscode.window.showQuickPick(
                subProjects.map(sp => ({
                    label: sp.name,
                    description: sp.type,
                    value: sp
                })),
                {
                    placeHolder: 'Selecciona el sub-proyecto para el intent',
                    canPickMany: false
                }
            );
            
            if (!selected) return [];
            
            // Delegar a la estrategia específica del sub-proyecto
            const detector = new ProjectDetector();
            const strategy = await detector.detectStrategy(selected.value.path);
            
            return strategy
                ? strategy.getRelevantFiles(selected.value.path)
                : [];
        }
    }

### 20.2. Proyecto con Arquitectura Modular

Para proyectos con módulos/features separados:

    app/
    ├── core/
    ├── features/
    │   ├── auth/
    │   ├── profile/
    │   └── payment/
    └── shared/

Permitir seleccionar solo un feature:

    async getRelevantFiles(workspaceRoot: string): Promise<FileDescriptor[]> {
        const featuresDir = path.join(workspaceRoot, 'app', 'features');
        
        if (await fileExists(featuresDir)) {
            const features = await vscode.workspace.fs.readDirectory(
                vscode.Uri.file(featuresDir)
            );
            
            const featureNames = features
                .filter(([, type]) => type === vscode.FileType.Directory)
                .map(([name]) => name);
            
            const selected = await vscode.window.showQuickPick(
                ['All features', ...featureNames],
                {
                    placeHolder: 'Selecciona el feature para el intent'
                }
            );
            
            if (selected === 'All features') {
                return this.getAllFiles(workspaceRoot);
            } else if (selected) {
                return this.getFeatureFiles(featuresDir, selected);
            }
        }
        
        return this.getAllFiles(workspaceRoot);
    }

---

## 21. Manejo de Archivos Grandes

### 21.1. Validación de Tamaño

    async validateFileSize(file: FileDescriptor, maxSize: number): Promise<boolean> {
        if (file.size > maxSize) {
            const action = await vscode.window.showWarningMessage(
                `El archivo ${file.relativePath} excede el tamaño máximo (${formatSize(maxSize)})`,
                'Omitir',
                'Incluir de todos modos'
            );
            
            return action === 'Incluir de todos modos';
        }
        
        return true;
    }

### 21.2. Truncar Archivos Grandes

    async readFileContent(fileUri: vscode.Uri, maxSize?: number): Promise<string> {
        const content = await vscode.workspace.fs.readFile(fileUri);
        const text = new TextDecoder().decode(content);
        
        if (maxSize && text.length > maxSize) {
            const truncated = text.substring(0, maxSize);
            return `${truncated}\n\n... [archivo truncado, ${text.length - maxSize} caracteres omitidos]`;
        }
        
        return text;
    }

### 21.3. Excluir Archivos Binarios

    private async shouldIncludeFile(fileUri: vscode.Uri): Promise<boolean> {
        const extension = path.extname(fileUri.fsPath).toLowerCase();
        
        // Extensiones binarias comunes a excluir
        const binaryExtensions = [
            '.jpg', '.jpeg', '.png', '.gif', '.bmp',
            '.pdf', '.zip', '.tar', '.gz',
            '.exe', '.dll', '.so', '.dylib',
            '.mp4', '.mov', '.avi',
            '.mp3', '.wav'
        ];
        
        if (binaryExtensions.includes(extension)) {
            return false;
        }
        
        // Detectar archivos binarios por contenido
        const sample = await this.readFileSample(fileUri, 512);
        return !this.isBinary(sample);
    }
    
    private isBinary(buffer: Uint8Array): boolean {
        // Detectar bytes null como indicador de binario
        for (let i = 0; i < Math.min(buffer.length, 512); i++) {
            if (buffer[i] === 0) {
                return true;
            }
        }
        return false;
    }

---

## 22. Integración con Git

### 22.1. Respetar .gitignore

    async getRelevantFiles(workspaceRoot: string): Promise<FileDescriptor[]> {
        const gitignorePatterns = await this.readGitignore(workspaceRoot);
        const excludePatterns = [
            ...this.getExcludePatterns(),
            ...gitignorePatterns
        ];
        
        // Usar excludePatterns en búsqueda
        const files = await vscode.workspace.findFiles(
            pattern,
            `{${excludePatterns.join(',')}}`
        );
        
        return files;
    }
    
    private async readGitignore(workspaceRoot: string): Promise<string[]> {
        const gitignorePath = path.join(workspaceRoot, '.gitignore');
        
        if (!await fileExists(gitignorePath)) {
            return [];
        }
        
        const content = await readFile(gitignorePath);
        return content
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0 && !line.startsWith('#'))
            .map(pattern => pattern.replace(/^\//, '')); // Remover / inicial
    }

### 22.2. Solo Archivos Tracked

    async getTrackedFiles(workspaceRoot: string): Promise<string[]> {
        try {
            const { stdout } = await execAsync('git ls-files', {
                cwd: workspaceRoot
            });
            
            return stdout
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.length > 0);
        } catch (error) {
            // No es un repo Git o git no está instalado
            return [];
        }
    }

---

## 23. Mejoras Futuras

### 23.1. IA para Selección Inteligente

Usar un modelo local pequeño para analizar archivos y sugerir cuáles son más relevantes para un intent específico:

    async suggestRelevantFiles(
        files: FileDescriptor[],
        intentDescription: string
    ): Promise<FileDescriptor[]> {
        // Analizar descripción del intent
        const keywords = this.extractKeywords(intentDescription);
        
        // Scoring basado en:
        // - Nombre del archivo contiene keywords
        // - Contenido del archivo menciona keywords
        // - Tipo de archivo es relevante
        
        const scored = await Promise.all(
            files.map(async file => ({
                file,
                score: await this.calculateRelevanceScore(file, keywords)
            }))
        );
        
        // Retornar top 20 más relevantes
        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, 20)
            .map(s => s.file);
    }

### 23.2. Templates de Intents por Tipo de Proyecto

Cada estrategia puede proporcionar templates específicos:

    export interface ICodebaseStrategy {
        // ... métodos existentes ...
        
        getIntentTemplates?(): IntentTemplate[];
    }
    
    // En AndroidStrategy
    getIntentTemplates(): IntentTemplate[] {
        return [
            {
                id: 'android-new-screen',
                name: 'Nueva Pantalla',
                description: 'Crear una nueva Activity/Fragment',
                fields: [
                    { name: 'screenName', label: 'Nombre de la pantalla' },
                    { name: 'navigation', label: 'Tipo de navegación' }
                ]
            },
            {
                id: 'android-fix-crash',
                name: 'Arreglar Crash',
                description: 'Solucionar un crash en la app',
                fields: [
                    { name: 'crashLog', label: 'Log del crash', type: 'textarea' },
                    { name: 'steps', label: 'Pasos para reproducir', type: 'list' }
                ]
            }
        ];
    }

### 23.3. Diff Viewer para Cambios Sugeridos

Al recibir respuesta de la IA, mostrar diff:

    async showDiff(originalFile: string, suggestedContent: string): Promise<void> {
        const originalUri = vscode.Uri.file(originalFile);
        const tempUri = vscode.Uri.file(originalFile + '.suggested');
        
        await vscode.workspace.fs.writeFile(
            tempUri,
            new TextEncoder().encode(suggestedContent)
        );
        
        await vscode.commands.executeCommand(
            'vscode.diff',
            originalUri,
            tempUri,
            `${path.basename(originalFile)}: Original ↔ Sugerido`
        );
    }

### 23.4. Historial de Cambios

Mantener historial de qué archivos se modificaron en cada intent:

    interface IntentHistory {
        intentId: string;
        timestamp: string;
        changes: FileChange[];
    }
    
    interface FileChange {
        file: string;
        action: 'created' | 'modified' | 'deleted';
        linesBefore?: number;
        linesAfter?: number;
        diff?: string;
    }

---

## 24. Seguridad y Privacidad

### 24.1. Detección de Secrets

Antes de generar codebase, escanear por secrets:

    async detectSecrets(files: FileDescriptor[]): Promise<SecretWarning[]> {
        const warnings: SecretWarning[] = [];
        const patterns = [
            /(?:api[_-]?key|apikey)[\s:=]["']([^"']+)["']/gi,
            /(?:password|passwd|pwd)[\s:=]["']([^"']+)["']/gi,
            /(?:token|auth)[\s:=]["']([^"']+)["']/gi,
            /sk-[a-zA-Z0-9]{48}/g, // OpenAI keys
            /ghp_[a-zA-Z0-9]{36}/g // GitHub tokens
        ];
        
        for (const file of files) {
            const content = await readFile(file.absolutePath);
            
            for (const pattern of patterns) {
                const matches = content.matchAll(pattern);
                for (const match of matches) {
                    warnings.push({
                        file: file.relativePath,
                        line: this.getLineNumber(content, match.index!),
                        type: 'potential-secret',
                        value: match[0].substring(0, 20) + '...'
                    });
                }
            }
        }
        
        return warnings;
    }
    
    interface SecretWarning {
        file: string;
        line: number;
        type: string;
        value: string;
    }

### 24.2. Confirmación de Usuario

Si se detectan secrets:

    const warnings = await detectSecrets(files);
    
    if (warnings.length > 0) {
        const message = `Se detectaron ${warnings.length} posibles secrets en los archivos seleccionados`;
        const action = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Ver Detalles',
            'Continuar de todos modos',
            'Cancelar'
        );
        
        if (action === 'Ver Detalles') {
            await showSecretsReport(warnings);
            return;
        }
        
        if (action !== 'Continuar de todos modos') {
            return;
        }
    }

---

## 25. Conclusión

El Codebase Generator transforma la experiencia de crear intents al:

1. **Automatizar la selección** de archivos relevantes mediante detección inteligente
2. **Categorizar y priorizar** archivos según su importancia
3. **Generar dos formatos** de salida según las necesidades del usuario:
   - **codebase.md**: Formato legible para versión gratis
   - **codebase.tar.gz**: Formato comprimido para versión API
4. **Soportar múltiples tipos** de proyecto con estrategias extensibles
5. **Integrarse perfectamente** con el Intent Manager
6. **Optimizar performance** mediante caché y búsqueda paralela
7. **Garantizar seguridad** detectando secrets antes de generar
8. **Proporcionar flexibilidad** con modo manual, automático e híbrido

El sistema está diseñado para:
- ✅ Ser extensible (agregar nuevas estrategias fácilmente)
- ✅ Ser mantenible (código modular y bien estructurado)
- ✅ Ser testeable (cobertura completa de tests)
- ✅ Ser performante (optimizaciones de caché y paralelización)
- ✅ Ser seguro (detección de secrets, validaciones)
- ✅ Ser usable (UX intuitiva con Quick Pick inteligente)

---

Fin del documento.