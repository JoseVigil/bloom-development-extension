#!/usr/bin/env python3
"""
Bloom TypeScript/Node.js Context Generator
Genera archivo .context.bl completo analizando proyecto TypeScript/Node.js
Compatible con: macOS, Linux, Windows
"""

import os
import re
import json
import argparse
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Set
import sys


class TypeScriptProjectAnalyzer:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root).resolve()
        
    def analyze(self) -> Dict:
        """Análisis completo del proyecto"""
        print("🔍 Analizando proyecto TypeScript/Node.js...")
        
        data = {
            "basic_info": self._extract_basic_info(),
            "dependencies": self._extract_dependencies(),
            "typescript_config": self._extract_typescript_config(),
            "scripts": self._extract_scripts(),
            "structure": self._analyze_structure(),
            "environment": self._detect_environment_vars(),
            "database": self._detect_database(),
            "apis": self._detect_apis(),
            "testing": self._detect_testing(),
            "build_tools": self._detect_build_tools(),
            "framework": self._detect_framework(),
            "docker": self._detect_docker(),
        }
        
        print("✅ Análisis completado")
        return data
    
    def _extract_basic_info(self) -> Dict:
        """Extrae información básica del package.json"""
        print("  [1/12] Información básica...")
        
        info = {
            "name": "typescript-project",
            "version": "1.0.0",
            "description": "",
            "author": "",
            "license": "ISC",
            "engines": {}
        }
        
        package_json = self.project_root / "package.json"
        if package_json.exists():
            try:
                with open(package_json, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    info["name"] = data.get("name", info["name"])
                    info["version"] = data.get("version", info["version"])
                    info["description"] = data.get("description", "")
                    info["author"] = data.get("author", "")
                    info["license"] = data.get("license", info["license"])
                    info["engines"] = data.get("engines", {})
            except:
                pass
        
        return info
    
    def _extract_dependencies(self) -> Dict:
        """Extrae dependencias del proyecto"""
        print("  [2/12] Dependencias...")
        
        deps = {
            "dependencies": [],
            "dev_dependencies": [],
            "frameworks": set(),
            "total_count": 0
        }
        
        package_json = self.project_root / "package.json"
        if not package_json.exists():
            return deps
        
        try:
            with open(package_json, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
                # Dependencies
                if "dependencies" in data:
                    deps["dependencies"] = list(data["dependencies"].keys())
                    deps["total_count"] += len(deps["dependencies"])
                
                # DevDependencies
                if "devDependencies" in data:
                    deps["dev_dependencies"] = list(data["devDependencies"].keys())
                    deps["total_count"] += len(deps["dev_dependencies"])
                
                # Detectar frameworks
                all_deps = deps["dependencies"] + deps["dev_dependencies"]
                
                for dep in all_deps:
                    if "express" in dep:
                        deps["frameworks"].add("Express.js")
                    if "nestjs" in dep or "@nestjs" in dep:
                        deps["frameworks"].add("NestJS")
                    if "fastify" in dep:
                        deps["frameworks"].add("Fastify")
                    if "koa" in dep:
                        deps["frameworks"].add("Koa")
                    if "next" == dep:
                        deps["frameworks"].add("Next.js")
                    if "react" == dep:
                        deps["frameworks"].add("React")
                    if "vue" == dep:
                        deps["frameworks"].add("Vue")
                    if "angular" in dep or "@angular" in dep:
                        deps["frameworks"].add("Angular")
                    if "prisma" in dep or "@prisma" in dep:
                        deps["frameworks"].add("Prisma ORM")
                    if "typeorm" in dep:
                        deps["frameworks"].add("TypeORM")
                    if "mongoose" in dep:
                        deps["frameworks"].add("Mongoose")
                    if "sequelize" in dep:
                        deps["frameworks"].add("Sequelize")
                    if "axios" in dep:
                        deps["frameworks"].add("Axios")
                    if "graphql" in dep:
                        deps["frameworks"].add("GraphQL")
                    if "apollo" in dep:
                        deps["frameworks"].add("Apollo")
                    if "socket.io" in dep:
                        deps["frameworks"].add("Socket.IO")
                    if "passport" in dep:
                        deps["frameworks"].add("Passport")
                    if "jwt" in dep or "jsonwebtoken" in dep:
                        deps["frameworks"].add("JWT")
                    if "redis" in dep:
                        deps["frameworks"].add("Redis")
                    if "bull" in dep:
                        deps["frameworks"].add("Bull Queue")
                    if "winston" in dep:
                        deps["frameworks"].add("Winston Logger")
        
        except Exception as e:
            print(f"    ⚠️  Error: {e}")
        
        deps["frameworks"] = sorted(list(deps["frameworks"]))
        return deps
    
    def _extract_typescript_config(self) -> Dict:
        """Extrae configuración de TypeScript"""
        print("  [3/12] TypeScript config...")
        
        config = {
            "exists": False,
            "target": "ES6",
            "module": "commonjs",
            "strict": False,
            "out_dir": "./dist",
            "root_dir": "./src",
            "lib": [],
            "paths": {}
        }
        
        tsconfig = self.project_root / "tsconfig.json"
        if not tsconfig.exists():
            return config
        
        config["exists"] = True
        
        try:
            with open(tsconfig, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
                if "compilerOptions" in data:
                    opts = data["compilerOptions"]
                    config["target"] = opts.get("target", config["target"])
                    config["module"] = opts.get("module", config["module"])
                    config["strict"] = opts.get("strict", False)
                    config["out_dir"] = opts.get("outDir", config["out_dir"])
                    config["root_dir"] = opts.get("rootDir", config["root_dir"])
                    config["lib"] = opts.get("lib", [])
                    config["paths"] = opts.get("paths", {})
        
        except Exception as e:
            print(f"    ⚠️  Error: {e}")
        
        return config
    
    def _extract_scripts(self) -> Dict:
        """Extrae scripts de package.json"""
        print("  [4/12] Scripts...")
        
        scripts = {
            "all": {},
            "has_dev": False,
            "has_build": False,
            "has_start": False,
            "has_test": False
        }
        
        package_json = self.project_root / "package.json"
        if not package_json.exists():
            return scripts
        
        try:
            with open(package_json, 'r', encoding='utf-8') as f:
                data = json.load(f)
                
                if "scripts" in data:
                    scripts["all"] = data["scripts"]
                    scripts["has_dev"] = "dev" in data["scripts"]
                    scripts["has_build"] = "build" in data["scripts"]
                    scripts["has_start"] = "start" in data["scripts"]
                    scripts["has_test"] = "test" in data["scripts"]
        
        except:
            pass
        
        return scripts
    
    def _analyze_structure(self) -> Dict:
        """Analiza estructura del proyecto"""
        print("  [5/12] Estructura...")
        
        structure = {
            "src_exists": False,
            "src_tree": [],
            "main_files": [],
            "ts_count": 0,
            "js_count": 0,
            "directories": []
        }
        
        src_dir = self.project_root / "src"
        if src_dir.exists():
            structure["src_exists"] = True
            structure["src_tree"] = self._generate_tree(src_dir, src_dir, max_depth=4)
            
            # Contar archivos
            for file in src_dir.rglob("*.ts"):
                structure["ts_count"] += 1
            for file in src_dir.rglob("*.js"):
                structure["js_count"] += 1
            
            # Directorios principales
            for item in src_dir.iterdir():
                if item.is_dir():
                    structure["directories"].append(item.name)
        
        # Archivos principales en raíz
        main_candidates = ["index.ts", "index.js", "main.ts", "app.ts", "server.ts"]
        for candidate in main_candidates:
            file_path = src_dir / candidate if src_dir.exists() else self.project_root / candidate
            if file_path.exists():
                structure["main_files"].append(candidate)
        
        return structure
    
    def _detect_environment_vars(self) -> Dict:
        """Detecta variables de entorno"""
        print("  [6/12] Variables de entorno...")
        
        env_info = {
            "has_env_file": False,
            "has_env_example": False,
            "variables": []
        }
        
        env_file = self.project_root / ".env"
        env_example = self.project_root / ".env.example"
        
        env_info["has_env_file"] = env_file.exists()
        env_info["has_env_example"] = env_example.exists()
        
        # Leer variables de .env.example si existe
        if env_example.exists():
            try:
                with open(env_example, 'r', encoding='utf-8') as f:
                    for line in f:
                        line = line.strip()
                        if line and not line.startswith('#'):
                            if '=' in line:
                                key = line.split('=')[0].strip()
                                env_info["variables"].append(key)
            except:
                pass
        
        return env_info
    
    def _detect_database(self) -> Dict:
        """Detecta configuración de base de datos"""
        print("  [7/12] Base de datos...")
        
        db = {
            "type": "Unknown",
            "orm": None,
            "migrations": False,
            "seeds": False
        }
        
        package_json = self.project_root / "package.json"
        if package_json.exists():
            try:
                with open(package_json, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    all_deps = list(data.get("dependencies", {}).keys()) + \
                              list(data.get("devDependencies", {}).keys())
                    
                    for dep in all_deps:
                        if "mongodb" in dep or "mongoose" in dep:
                            db["type"] = "MongoDB"
                            if "mongoose" in dep:
                                db["orm"] = "Mongoose"
                        elif "pg" == dep or "postgres" in dep:
                            db["type"] = "PostgreSQL"
                        elif "mysql" in dep:
                            db["type"] = "MySQL"
                        elif "sqlite" in dep:
                            db["type"] = "SQLite"
                        elif "redis" in dep:
                            if db["type"] == "Unknown":
                                db["type"] = "Redis"
                        
                        if "prisma" in dep:
                            db["orm"] = "Prisma"
                        elif "typeorm" in dep:
                            db["orm"] = "TypeORM"
                        elif "sequelize" in dep:
                            db["orm"] = "Sequelize"
            except:
                pass
        
        # Detectar migraciones
        migrations_dirs = [
            self.project_root / "prisma" / "migrations",
            self.project_root / "src" / "migrations",
            self.project_root / "migrations"
        ]
        for mdir in migrations_dirs:
            if mdir.exists():
                db["migrations"] = True
                break
        
        # Detectar seeds
        seeds_dirs = [
            self.project_root / "prisma" / "seeds",
            self.project_root / "src" / "seeds",
            self.project_root / "seeds"
        ]
        for sdir in seeds_dirs:
            if sdir.exists():
                db["seeds"] = True
                break
        
        return db
    
    def _detect_apis(self) -> Dict:
        """Detecta endpoints y APIs"""
        print("  [8/12] APIs...")
        
        apis = {
            "rest": False,
            "graphql": False,
            "routes_dirs": [],
            "controllers_dirs": []
        }
        
        src_dir = self.project_root / "src"
        if not src_dir.exists():
            return apis
        
        # Buscar directorios de rutas
        route_candidates = ["routes", "router", "api", "endpoints"]
        for candidate in route_candidates:
            route_dir = src_dir / candidate
            if route_dir.exists():
                apis["routes_dirs"].append(candidate)
                apis["rest"] = True
        
        # Buscar directorios de controladores
        controller_candidates = ["controllers", "handlers"]
        for candidate in controller_candidates:
            controller_dir = src_dir / candidate
            if controller_dir.exists():
                apis["controllers_dirs"].append(candidate)
        
        # Detectar GraphQL
        graphql_files = list(src_dir.rglob("*.graphql")) + \
                       list(src_dir.rglob("*schema*.ts")) + \
                       list(src_dir.rglob("*resolver*.ts"))
        if graphql_files:
            apis["graphql"] = True
        
        return apis
    
    def _detect_testing(self) -> Dict:
        """Detecta configuración de testing"""
        print("  [9/12] Testing...")
        
        testing = {
            "framework": None,
            "has_tests": False,
            "test_dirs": [],
            "coverage": False
        }
        
        package_json = self.project_root / "package.json"
        if package_json.exists():
            try:
                with open(package_json, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    all_deps = list(data.get("dependencies", {}).keys()) + \
                              list(data.get("devDependencies", {}).keys())
                    
                    if "jest" in all_deps:
                        testing["framework"] = "Jest"
                    elif "mocha" in all_deps:
                        testing["framework"] = "Mocha"
                    elif "vitest" in all_deps:
                        testing["framework"] = "Vitest"
                    elif "ava" in all_deps:
                        testing["framework"] = "AVA"
                    
                    if "scripts" in data:
                        scripts = data["scripts"]
                        if any("coverage" in s for s in scripts.values()):
                            testing["coverage"] = True
            except:
                pass
        
        # Buscar directorios de tests
        test_candidates = [
            self.project_root / "test",
            self.project_root / "tests",
            self.project_root / "__tests__",
            self.project_root / "src" / "__tests__"
        ]
        
        for test_dir in test_candidates:
            if test_dir.exists():
                testing["has_tests"] = True
                testing["test_dirs"].append(str(test_dir.relative_to(self.project_root)))
        
        # Buscar archivos .test.ts o .spec.ts
        src_dir = self.project_root / "src"
        if src_dir.exists():
            test_files = list(src_dir.rglob("*.test.ts")) + \
                        list(src_dir.rglob("*.spec.ts")) + \
                        list(src_dir.rglob("*.test.js")) + \
                        list(src_dir.rglob("*.spec.js"))
            if test_files:
                testing["has_tests"] = True
        
        return testing
    
    def _detect_build_tools(self) -> Dict:
        """Detecta herramientas de build"""
        print("  [10/12] Build tools...")
        
        tools = {
            "bundler": None,
            "linter": None,
            "formatter": None
        }
        
        # Webpack
        if (self.project_root / "webpack.config.js").exists() or \
           (self.project_root / "webpack.config.ts").exists():
            tools["bundler"] = "Webpack"
        
        # Vite
        elif (self.project_root / "vite.config.js").exists() or \
             (self.project_root / "vite.config.ts").exists():
            tools["bundler"] = "Vite"
        
        # Rollup
        elif (self.project_root / "rollup.config.js").exists():
            tools["bundler"] = "Rollup"
        
        # ESBuild
        package_json = self.project_root / "package.json"
        if package_json.exists():
            try:
                with open(package_json, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    all_deps = list(data.get("dependencies", {}).keys()) + \
                              list(data.get("devDependencies", {}).keys())
                    
                    if "esbuild" in all_deps and not tools["bundler"]:
                        tools["bundler"] = "ESBuild"
            except:
                pass
        
        # ESLint
        if (self.project_root / ".eslintrc.js").exists() or \
           (self.project_root / ".eslintrc.json").exists() or \
           (self.project_root / "eslint.config.js").exists():
            tools["linter"] = "ESLint"
        
        # Prettier
        if (self.project_root / ".prettierrc").exists() or \
           (self.project_root / ".prettierrc.json").exists() or \
           (self.project_root / "prettier.config.js").exists():
            tools["formatter"] = "Prettier"
        
        return tools
    
    def _detect_framework(self) -> Dict:
        """Detecta framework principal del proyecto"""
        print("  [11/12] Framework principal...")
        
        framework = {
            "type": "Node.js API",
            "name": None,
            "version": None
        }
        
        package_json = self.project_root / "package.json"
        if not package_json.exists():
            return framework
        
        try:
            with open(package_json, 'r', encoding='utf-8') as f:
                data = json.load(f)
                deps = data.get("dependencies", {})
                
                # Next.js
                if "next" in deps:
                    framework["type"] = "Full-stack Framework"
                    framework["name"] = "Next.js"
                    framework["version"] = deps["next"]
                
                # NestJS
                elif "@nestjs/core" in deps:
                    framework["type"] = "Backend Framework"
                    framework["name"] = "NestJS"
                    framework["version"] = deps.get("@nestjs/core")
                
                # Express
                elif "express" in deps:
                    framework["type"] = "Backend Framework"
                    framework["name"] = "Express.js"
                    framework["version"] = deps["express"]
                
                # Fastify
                elif "fastify" in deps:
                    framework["type"] = "Backend Framework"
                    framework["name"] = "Fastify"
                    framework["version"] = deps["fastify"]
                
                # React (sin Next)
                elif "react" in deps:
                    framework["type"] = "Frontend Library"
                    framework["name"] = "React"
                    framework["version"] = deps["react"]
                
                # Vue
                elif "vue" in deps:
                    framework["type"] = "Frontend Framework"
                    framework["name"] = "Vue"
                    framework["version"] = deps["vue"]
        
        except:
            pass
        
        return framework
    
    def _detect_docker(self) -> Dict:
        """Detecta configuración de Docker"""
        print("  [12/12] Docker...")
        
        docker = {
            "has_dockerfile": False,
            "has_compose": False,
            "has_dockerignore": False
        }
        
        docker["has_dockerfile"] = (self.project_root / "Dockerfile").exists()
        docker["has_compose"] = (self.project_root / "docker-compose.yml").exists() or \
                               (self.project_root / "docker-compose.yaml").exists()
        docker["has_dockerignore"] = (self.project_root / ".dockerignore").exists()
        
        return docker
    
    def _generate_tree(self, root_dir: Path, current_dir: Path, prefix: str = "", max_depth: int = 4) -> List[str]:
        """Genera árbol de directorios"""
        if max_depth <= 0:
            return []
        
        tree = []
        
        try:
            items = sorted(current_dir.iterdir(), key=lambda x: (not x.is_dir(), x.name))
        except PermissionError:
            return tree
        
        # Filtrar node_modules y dist
        items = [i for i in items if i.name not in ["node_modules", "dist", ".git", "build"]]
        
        for i, item in enumerate(items):
            is_last = (i == len(items) - 1)
            connector = "└── " if is_last else "├── "
            
            if item.is_dir():
                tree.append(f"{prefix}{connector}{item.name}/")
                extension = "    " if is_last else "│   "
                tree.extend(self._generate_tree(root_dir, item, prefix + extension, max_depth - 1))
            else:
                tree.append(f"{prefix}{connector}{item.name}")
        
        return tree


class ContextGenerator:
    def __init__(self, data):
        self.data = data
    
    def generate(self):
        """Genera el contenido completo del archivo de contexto"""
        basic_info = self.data["basic_info"]
        deps = self.data["dependencies"]
        ts_config = self.data["typescript_config"]
        scripts = self.data["scripts"]
        structure = self.data["structure"]
        env = self.data["environment"]
        db = self.data["database"]
        apis = self.data["apis"]
        testing = self.data["testing"]
        docker = self.data["docker"]
        
        sections = []
        
        # Header
        sections.append(f"# Contexto Técnico - Proyecto TypeScript/Node.js")
        sections.append(f"\n## Información General")
        sections.append(f"**Nombre del proyecto:** {basic_info['name']}")
        sections.append(f"**Versión:** {basic_info['version']}")
        if basic_info['description']:
            sections.append(f"**Descripción:** {basic_info['description']}")
        
        # Dependencias
        sections.append("\n## Dependencias")
        sections.append(f"**Total de dependencias:** {deps['total_count']}")
        sections.append(f"- Production: {len(deps['dependencies'])}")
        sections.append(f"- Development: {len(deps['dev_dependencies'])}")
        
        if deps['frameworks']:
            sections.append("\n**Frameworks y librerías principales:**")
            for framework in deps['frameworks']:
                sections.append(f"- {framework}")
        
        # Configuración TypeScript
        if ts_config['exists']:
            sections.append("\n## Configuración TypeScript")
            sections.append(f"- Target: {ts_config['target']}")
            sections.append(f"- Module: {ts_config['module']}")
            sections.append(f"- Strict mode: {'Sí' if ts_config['strict'] else 'No'}")
            sections.append(f"- Directorio de salida: {ts_config['out_dir']}")
            sections.append(f"- Directorio raíz: {ts_config['root_dir']}")
        
        # Estructura
        sections.append("\n## Estructura del Proyecto")
        sections.append(f"**Archivos TypeScript:** {structure['ts_count']}")
        sections.append(f"**Archivos JavaScript:** {structure['js_count']}")
        
        # Base de datos
        sections.append(f"\n## Base de Datos")
        sections.append(f"**Tipo:** {db['type']}")
        if db['orm']:
            sections.append(f"**ORM:** {db['orm']}")
        
        # Variables de entorno
        sections.append("\n## Variables de Entorno")
        sections.append(f"**Archivo .env presente:** {'Sí' if env['has_env_file'] else 'No'}")
        if env['variables']:
            sections.append(f"**Variables detectadas:** {len(env['variables'])}")
        
        # Scripts
        sections.append("\n## Scripts Principales")
        key_scripts = ['dev', 'start', 'build', 'test', 'lint']
        for script_name in key_scripts:
            if script_name in scripts['all']:
                sections.append(f"**{script_name}:** {scripts['all'][script_name]}")
        
        # Testing
        if testing['framework']:
            sections.append(f"\n## Testing")
            sections.append(f"**Framework:** {testing['framework']}")
        
        # Docker
        if docker['has_dockerfile'] or docker['has_compose']:
            sections.append("\n## Docker")
            sections.append(f"**Dockerfile:** {'Sí' if docker['has_dockerfile'] else 'No'}")
            sections.append(f"**Docker Compose:** {'Sí' if docker['has_compose'] else 'No'}")
        
        # Footer
        sections.append("\n---")
        sections.append("bloom/v1")
        sections.append('context_version: "1.0"')
        sections.append(f'Generado automáticamente: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
        
        return "\n".join(sections)  
    
# Mover la función main() fuera de la clase ContextGenerator
def main():
    """Función principal"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Genera el archivo de contexto para proyectos TypeScript/Node.js")
    
    parser.add_argument(
        '--project-root',
        default='.',
        help='Directorio raíz del proyecto que contiene package.json'
    )
    
    parser.add_argument(
        '--output-dir',
        required=True,
        help='Directorio donde se generará el archivo de contexto'
    )
    
    args = parser.parse_args()
    
    # Determinar las rutas
    project_root = Path(args.project_root).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_file = output_dir / ".dev.typescript-node.context.bl"
    
    print("\n" + "="*60)
    print("🌸 BLOOM - TypeScript/Node.js Context Generator")
    print("="*60)
    print(f"\n📁 Proyecto: {project_root}")
    print(f"📄 Output: {output_file}\n")
    
    # Validar package.json
    package_json = project_root / "package.json"
    if not package_json.exists():
        print("❌ Error: No se encontró package.json")
        print(f"   Ruta buscada: {package_json}")
        sys.exit(1)
    
    try:
        # Analizar el proyecto
        analyzer = TypeScriptProjectAnalyzer(str(project_root))
        data = analyzer.analyze()
        
        # Generar el contenido
        print("\n📝 Generando archivo .dev.typescript-node.context.bl...")
        generator = ContextGenerator(data)
        content = generator.generate()
        
        # Crear directorio de salida y escribir el archivo
        output_dir.mkdir(parents=True, exist_ok=True)
        output_file.write_text(content, encoding='utf-8')
        
        # Resumen
        print("\n" + "="*60)
        print("✅ Archivo generado exitosamente")
        print("="*60)
        print(f"\n📍 Ubicación: {output_file}")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()