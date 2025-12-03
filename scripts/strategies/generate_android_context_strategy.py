#!/usr/bin/env python3
"""
Bloom Android Context Generator
Genera archivo .context.bl completo analizando proyecto Android
Compatible con: macOS, Linux
"""

import os
import re
import json
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional, Set, Tuple
import sys


class AndroidProjectAnalyzer:
    def __init__(self, project_root: str):
        self.project_root = Path(project_root).resolve()
        self.app_dir = self.project_root / "app"
        self.src_main = self.app_dir / "src" / "main"
        
    def analyze(self) -> Dict:
        """Análisis completo del proyecto"""
        print("🔍 Analizando proyecto Android...")
        
        data = {
            "basic_info": self._extract_basic_info(),
            "sdk_versions": self._extract_sdk_versions(),
            "dependencies": self._extract_dependencies(),
            "manifest": self._extract_manifest_info(),
            "strings": self._extract_strings(),
            "database": self._detect_database(),
            "endpoints": self._detect_endpoints(),
            "structure": self._analyze_structure(),
            "architecture": self._detect_architecture(),
            "gradle": self._extract_gradle_info(),
            "testing": self._detect_testing(),
            "assets": self._analyze_assets(),
        }
        
        print("✅ Análisis completado")
        return data
    
    def _extract_basic_info(self) -> Dict:
        """Extrae información básica del proyecto"""
        print("  [1/11] Información básica...")
        
        info = {
            "name": "Android App",
            "version": "1.0.0",
            "package": "com.example.app"
        }
        
        # Nombre del proyecto desde settings.gradle
        settings_files = [
            self.project_root / "settings.gradle",
            self.project_root / "settings.gradle.kts"
        ]
        
        for settings_file in settings_files:
            if settings_file.exists():
                content = settings_file.read_text(encoding='utf-8', errors='ignore')
                match = re.search(r'rootProject\.name\s*=\s*["\'](.+?)["\']', content)
                if match:
                    info["name"] = match.group(1)
                    break
        
        # Versión y package desde build.gradle
        build_gradle = self._find_app_build_gradle()
        if build_gradle:
            content = build_gradle.read_text(encoding='utf-8', errors='ignore')
            
            # Version
            version_match = re.search(r'versionName\s+["\'](.+?)["\']', content)
            if version_match:
                info["version"] = version_match.group(1)
        
        # Package desde Manifest
        manifest = self.src_main / "AndroidManifest.xml"
        if manifest.exists():
            try:
                tree = ET.parse(manifest)
                root = tree.getroot()
                package = root.get('package')
                if package:
                    info["package"] = package
            except:
                pass
        
        return info
    
    def _extract_sdk_versions(self) -> Dict:
        """Extrae versiones de SDK"""
        print("  [2/11] Versiones de SDK...")
        
        versions = {
            "min_sdk": 21,
            "target_sdk": 33,
            "compile_sdk": 33,
            "java_version": "8"
        }
        
        build_gradle = self._find_app_build_gradle()
        if not build_gradle:
            return versions
        
        content = build_gradle.read_text(encoding='utf-8', errors='ignore')
        
        # Min SDK
        min_match = re.search(r'minSdk(?:Version)?\s+(\d+)', content)
        if min_match:
            versions["min_sdk"] = int(min_match.group(1))
        
        # Target SDK
        target_match = re.search(r'targetSdk(?:Version)?\s+(\d+)', content)
        if target_match:
            versions["target_sdk"] = int(target_match.group(1))
        
        # Compile SDK
        compile_match = re.search(r'compileSdk(?:Version)?\s+(\d+)', content)
        if compile_match:
            versions["compile_sdk"] = int(compile_match.group(1))
        
        # Java Version
        java_patterns = [
            r'sourceCompatibility\s+JavaVersion\.VERSION_(\d+)',
            r'sourceCompatibility\s*=\s*["\'](\d+)["\']',
            r'JavaVersion\.VERSION_(\d+)'
        ]
        for pattern in java_patterns:
            match = re.search(pattern, content)
            if match:
                versions["java_version"] = match.group(1)
                break
        
        return versions
    
    def _extract_dependencies(self) -> Dict:
        """Extrae todas las dependencias"""
        print("  [3/11] Dependencias...")
        
        deps = {
            "libraries": [],
            "local_aars": [],
            "frameworks": set()
        }
        
        build_gradle = self._find_app_build_gradle()
        if not build_gradle:
            return deps
        
        content = build_gradle.read_text(encoding='utf-8', errors='ignore')
        
        # Dependencias implementation/api
        dep_pattern = r'(?:implementation|api)\s+["\'](.+?)["\']'
        for match in re.finditer(dep_pattern, content):
            dep = match.group(1)
            deps["libraries"].append(dep)
            
            # Detectar frameworks conocidos
            if "androidx" in dep:
                deps["frameworks"].add("AndroidX")
            if "material:" in dep:
                deps["frameworks"].add("Material Design Components")
            if "retrofit" in dep:
                deps["frameworks"].add("Retrofit")
            if "okhttp" in dep:
                deps["frameworks"].add("OkHttp")
            if "gson" in dep or "moshi" in dep:
                deps["frameworks"].add("JSON Parser")
            if "glide" in dep or "picasso" in dep or "coil" in dep:
                deps["frameworks"].add("Image Loading")
            if "auth0" in dep:
                deps["frameworks"].add("Auth0 SDK")
            if "lifecycle" in dep or "viewmodel" in dep:
                deps["frameworks"].add("Android Architecture Components")
            if "room" in dep:
                deps["frameworks"].add("Room Database")
            if "dagger" in dep or "hilt" in dep:
                deps["frameworks"].add("Dependency Injection")
            if "coroutines" in dep:
                deps["frameworks"].add("Kotlin Coroutines")
            if "rxjava" in dep or "rxandroid" in dep:
                deps["frameworks"].add("RxJava")
        
        # AAR locales
        aar_pattern = r'implementation\s+files\(["\'](.+?\.aar)["\']'
        for match in re.finditer(aar_pattern, content):
            aar = match.group(1)
            deps["local_aars"].append(aar)
            
            # Detectar frameworks por nombre de AAR
            if "ffmpeg" in aar.lower():
                deps["frameworks"].add("FFmpeg Kit")
        
        # Buscar AARs en app/libs
        libs_dir = self.app_dir / "libs"
        if libs_dir.exists():
            for aar_file in libs_dir.glob("*.aar"):
                aar_name = aar_file.name
                if aar_name not in deps["local_aars"]:
                    deps["local_aars"].append(f"libs/{aar_name}")
                
                if "ffmpeg" in aar_name.lower():
                    deps["frameworks"].add("FFmpeg Kit")
        
        deps["frameworks"] = sorted(list(deps["frameworks"]))
        return deps
    
    def _extract_manifest_info(self) -> Dict:
        """Extrae información del AndroidManifest.xml"""
        print("  [4/11] Manifest...")
        
        info = {
            "permissions": [],
            "activities": [],
            "services": [],
            "receivers": [],
            "providers": []
        }
        
        manifest = self.src_main / "AndroidManifest.xml"
        if not manifest.exists():
            return info
        
        try:
            tree = ET.parse(manifest)
            root = tree.getroot()
            
            # Namespace de Android
            ns = {'android': 'http://schemas.android.com/apk/res/android'}
            
            # Permisos
            for perm in root.findall('uses-permission', ns):
                name = perm.get('{http://schemas.android.com/apk/res/android}name')
                if name:
                    info["permissions"].append(name)
            
            # Application node
            app = root.find('application', ns)
            if app is not None:
                # Activities
                for activity in app.findall('activity', ns):
                    name = activity.get('{http://schemas.android.com/apk/res/android}name')
                    if name:
                        info["activities"].append(name)
                
                # Services
                for service in app.findall('service', ns):
                    name = service.get('{http://schemas.android.com/apk/res/android}name')
                    if name:
                        info["services"].append(name)
                
                # Receivers
                for receiver in app.findall('receiver', ns):
                    name = receiver.get('{http://schemas.android.com/apk/res/android}name')
                    if name:
                        info["receivers"].append(name)
                
                # Providers
                for provider in app.findall('provider', ns):
                    name = provider.get('{http://schemas.android.com/apk/res/android}name')
                    if name:
                        info["providers"].append(name)
        
        except Exception as e:
            print(f"    ⚠️  Error parseando Manifest: {e}")
        
        return info
    
    def _extract_strings(self) -> Dict:
        """Extrae strings relevantes"""
        print("  [5/11] Strings...")
        
        strings = {
            "app_description": None,
            "auth0_domain": None,
            "auth0_client_id": None
        }
        
        strings_xml = self.src_main / "res" / "values" / "strings.xml"
        if not strings_xml.exists():
            return strings
        
        try:
            tree = ET.parse(strings_xml)
            root = tree.getroot()
            
            for string in root.findall('string'):
                name = string.get('name')
                value = string.text
                
                if name in ['app_description', 'description']:
                    strings["app_description"] = value
                elif name == 'com_auth0_domain':
                    strings["auth0_domain"] = value
                elif name == 'com_auth0_client_id':
                    strings["auth0_client_id"] = value
        
        except Exception as e:
            print(f"    ⚠️  Error parseando strings.xml: {e}")
        
        return strings
    
    def _detect_database(self) -> Dict:
        """Detecta uso de base de datos"""
        print("  [6/11] Base de datos...")
        
        db_info = {
            "type": "SharedPreferences",
            "files": [],
            "orm": None
        }
        
        # Buscar archivos .db en assets
        assets_dir = self.src_main / "assets"
        if assets_dir.exists():
            for db_file in assets_dir.rglob("*.db"):
                db_name = db_file.name
                if db_name and db_name != ".db":  # Filtrar nombres vacíos
                    db_info["files"].append(db_name)
                    db_info["type"] = "SQLite"
        
        # Buscar referencias en código
        java_dir = self.src_main / "java"
        if java_dir.exists():
            for java_file in java_dir.rglob("*.java"):
                try:
                    content = java_file.read_text(encoding='utf-8', errors='ignore')
                    
                    # Referencias a .db con nombre válido
                    db_matches = re.findall(r'"([a-zA-Z0-9_\-]+\.db)"', content)
                    for db in db_matches:
                        if db and db not in db_info["files"]:
                            db_info["files"].append(db)
                            db_info["type"] = "SQLite"
                    
                    # Detectar Room
                    if '@Database' in content or 'RoomDatabase' in content:
                        db_info["orm"] = "Room"
                        db_info["type"] = "SQLite + Room"
                    
                    # Detectar Realm
                    if 'RealmObject' in content or 'Realm.getDefaultInstance' in content:
                        db_info["orm"] = "Realm"
                        db_info["type"] = "Realm"
                
                except:
                    continue
        
        # Eliminar duplicados y ordenar
        db_info["files"] = sorted(list(set(db_info["files"])))
        
        return db_info
    
    def _detect_endpoints(self) -> List[str]:
        """Detecta endpoints HTTP/HTTPS"""
        print("  [7/11] Endpoints...")
        
        endpoints = set()
        
        java_dir = self.src_main / "java"
        if not java_dir.exists():
            return []
        
        # Buscar en archivos específicos
        target_files = list(java_dir.rglob("*Endpoint*.java")) + \
                      list(java_dir.rglob("*Api*.java")) + \
                      list(java_dir.rglob("*Provider*.java")) + \
                      list(java_dir.rglob("*Client*.java"))
        
        url_pattern = r'"(https?://[^"]+)"'
        
        for java_file in target_files:
            try:
                content = java_file.read_text(encoding='utf-8', errors='ignore')
                urls = re.findall(url_pattern, content)
                endpoints.update(urls)
            except:
                continue
        
        # Buscar en BuildConfig
        build_gradle = self._find_app_build_gradle()
        if build_gradle:
            content = build_gradle.read_text(encoding='utf-8', errors='ignore')
            urls = re.findall(url_pattern, content)
            endpoints.update(urls)
        
        return sorted(list(endpoints))[:10]  # Limitar a 10
    
    def _analyze_structure(self) -> Dict:
        """Analiza estructura de archivos del proyecto"""
        print("  [8/11] Estructura de archivos...")
        
        structure = {
            "main_package": None,
            "full_tree": [],
            "models_tree": [],
            "file_count": 0,
            "package_structure": {},
            "all_directories": []
        }
        
        java_dir = self.src_main / "java"
        if not java_dir.exists():
            return structure
        
        # Encontrar paquete principal (el primer subdirectorio bajo java/)
        java_subdirs = [d for d in java_dir.iterdir() if d.is_dir()]
        if not java_subdirs:
            return structure
        
        # Buscar el paquete raíz (típicamente com/empresa/app)
        main_package_dir = java_subdirs[0]
        
        # Navegar hasta encontrar el nivel de paquete principal
        current = main_package_dir
        while True:
            subdirs = [d for d in current.iterdir() if d.is_dir()]
            if len(subdirs) != 1:
                break
            current = subdirs[0]
        
        # Este es el directorio del paquete principal
        structure["main_package"] = str(current.relative_to(java_dir))
        
        # Contar archivos Java
        all_java_files = list(current.rglob("*.java"))
        structure["file_count"] = len(all_java_files)
        
        # Generar árbol COMPLETO del paquete
        structure["full_tree"] = self._generate_complete_tree(current, current)
        
        # Buscar directorio de modelos específicamente
        model_dirs = [
            current / "model",
            current / "models",
            current / "data" / "model",
            current / "domain" / "model"
        ]
        
        for model_dir in model_dirs:
            if model_dir.exists():
                structure["models_tree"] = self._generate_complete_tree(model_dir, model_dir)
                break
        
        # Listar TODOS los directorios
        for item in current.rglob("*"):
            if item.is_dir():
                rel_path = str(item.relative_to(current))
                structure["all_directories"].append(rel_path)
        
        structure["all_directories"].sort()
        
        # Analizar estructura de paquetes
        for java_file in all_java_files:
            rel_path = java_file.relative_to(current)
            package = str(rel_path.parent).replace(os.sep, '.')
            
            if package not in structure["package_structure"]:
                structure["package_structure"][package] = []
            
            structure["package_structure"][package].append(java_file.name)
        
        return structure
    
    def _generate_complete_tree(self, root_dir: Path, current_dir: Path, prefix: str = "", max_depth: int = 10) -> List[str]:
        """Genera árbol COMPLETO de directorios y archivos"""
        if max_depth <= 0:
            return []
        
        tree = []
        
        try:
            items = sorted(current_dir.iterdir(), key=lambda x: (not x.is_dir(), x.name))
        except PermissionError:
            return tree
        
        for i, item in enumerate(items):
            is_last = (i == len(items) - 1)
            connector = "└── " if is_last else "├── "
            
            if item.is_dir():
                tree.append(f"{prefix}{connector}{item.name}/")
                extension = "    " if is_last else "│   "
                tree.extend(self._generate_complete_tree(root_dir, item, prefix + extension, max_depth - 1))
            else:
                tree.append(f"{prefix}{connector}{item.name}")
        
        return tree
    
    def _detect_architecture(self) -> Dict:
        """Detecta patrón arquitectónico"""
        print("  [9/11] Arquitectura...")
        
        arch = {
            "pattern": "MVC / Standard Android",
            "features": []
        }
        
        java_dir = self.src_main / "java"
        if not java_dir.exists():
            return arch
        
        # Buscar patrones arquitectónicos
        has_viewmodel = any(java_dir.rglob("*ViewModel*.java")) or \
                       any(java_dir.rglob("viewmodel"))
        has_presenter = any(java_dir.rglob("*Presenter*.java")) or \
                       any(java_dir.rglob("presenter"))
        has_domain = any(java_dir.rglob("domain"))
        has_data = any(java_dir.rglob("data"))
        has_usecase = any(java_dir.rglob("*UseCase*.java"))
        
        if has_viewmodel:
            arch["pattern"] = "MVVM (Model-View-ViewModel)"
            arch["features"].append("ViewModel")
        elif has_presenter:
            arch["pattern"] = "MVP (Model-View-Presenter)"
            arch["features"].append("Presenter")
        
        if has_domain and has_data and has_usecase:
            arch["pattern"] = "Clean Architecture"
            arch["features"].extend(["Domain Layer", "Data Layer", "Use Cases"])
        
        # Detectar otras características
        if any(java_dir.rglob("*Repository*.java")):
            arch["features"].append("Repository Pattern")
        
        if any(java_dir.rglob("di")) or any(java_dir.rglob("injection")):
            arch["features"].append("Dependency Injection")
        
        return arch
    
    def _extract_gradle_info(self) -> Dict:
        """Extrae información de Gradle"""
        print("  [10/11] Gradle...")
        
        gradle_info = {
            "version": "7.x",
            "agp_version": "7.x",
            "build_config_fields": []
        }
        
        # Gradle version
        wrapper_props = self.project_root / "gradle" / "wrapper" / "gradle-wrapper.properties"
        if wrapper_props.exists():
            content = wrapper_props.read_text(encoding='utf-8', errors='ignore')
            match = re.search(r'gradle-([0-9.]+)', content)
            if match:
                gradle_info["version"] = match.group(1)
        
        # AGP version
        root_gradle = self._find_root_build_gradle()
        if root_gradle:
            content = root_gradle.read_text(encoding='utf-8', errors='ignore')
            match = re.search(r'com\.android\.tools\.build:gradle:([0-9.]+)', content)
            if match:
                gradle_info["agp_version"] = match.group(1)
        
        # BuildConfig fields
        app_gradle = self._find_app_build_gradle()
        if app_gradle:
            content = app_gradle.read_text(encoding='utf-8', errors='ignore')
            fields = re.findall(r'buildConfigField\s+(.+)', content)
            gradle_info["build_config_fields"] = fields
        
        return gradle_info
    
    def _detect_testing(self) -> Dict:
        """Detecta configuración de testing"""
        print("  [11/11] Testing...")
        
        testing = {
            "has_unit_tests": False,
            "has_instrumentation_tests": False,
            "frameworks": []
        }
        
        # Unit tests
        test_dir = self.app_dir / "src" / "test"
        if test_dir.exists() and any(test_dir.rglob("*.java")):
            testing["has_unit_tests"] = True
        
        # Instrumentation tests
        android_test_dir = self.app_dir / "src" / "androidTest"
        if android_test_dir.exists() and any(android_test_dir.rglob("*.java")):
            testing["has_instrumentation_tests"] = True
        
        # Detectar frameworks de testing en dependencias
        app_gradle = self._find_app_build_gradle()
        if app_gradle:
            content = app_gradle.read_text(encoding='utf-8', errors='ignore')
            
            if 'junit' in content.lower():
                testing["frameworks"].append("JUnit")
            if 'espresso' in content.lower():
                testing["frameworks"].append("Espresso")
            if 'mockito' in content.lower():
                testing["frameworks"].append("Mockito")
            if 'robolectric' in content.lower():
                testing["frameworks"].append("Robolectric")
        
        return testing
    
    def _analyze_assets(self) -> Dict:
        """Analiza contenido del directorio assets"""
        print("  [12/12] Assets...")
        
        assets_info = {
            "exists": False,
            "tree": [],
            "file_count": 0,
            "files_by_type": {}
        }
        
        assets_dir = self.src_main / "assets"
        if not assets_dir.exists():
            return assets_info
        
        assets_info["exists"] = True
        
        # Generar árbol completo de assets
        assets_info["tree"] = self._generate_complete_tree(assets_dir, assets_dir)
        
        # Contar archivos y clasificar por tipo
        all_files = list(assets_dir.rglob("*"))
        assets_info["file_count"] = len([f for f in all_files if f.is_file()])
        
        for file in all_files:
            if file.is_file():
                ext = file.suffix.lower() or "sin_extension"
                if ext not in assets_info["files_by_type"]:
                    assets_info["files_by_type"][ext] = []
                assets_info["files_by_type"][ext].append(file.name)
        
        return assets_info
    
    def _find_app_build_gradle(self) -> Optional[Path]:
        """Encuentra build.gradle de la app"""
        candidates = [
            self.app_dir / "build.gradle",
            self.app_dir / "build.gradle.kts"
        ]
        
        for candidate in candidates:
            if candidate.exists():
                return candidate
        
        return None
    
    def _find_root_build_gradle(self) -> Optional[Path]:
        """Encuentra build.gradle raíz"""
        candidates = [
            self.project_root / "build.gradle",
            self.project_root / "build.gradle.kts"
        ]
        
        for candidate in candidates:
            if candidate.exists():
                return candidate
        
        return None


class ContextGenerator:
    def __init__(self, data: Dict):
        self.data = data
    
    def generate(self) -> str:
        """Genera el archivo .context.bl en formato markdown"""
        
        basic = self.data["basic_info"]
        sdk = self.data["sdk_versions"]
        deps = self.data["dependencies"]
        manifest = self.data["manifest"]
        strings = self.data["strings"]
        db = self.data["database"]
        endpoints = self.data["endpoints"]
        structure = self.data["structure"]
        arch = self.data["architecture"]
        gradle = self.data["gradle"]
        testing = self.data["testing"]
        assets = self.data["assets"]
        
        # Generar secciones
        sections = []
        
        # Header
        sections.append(f"# CONTEXT - {basic['name']}\n")
        
        # Información General
        sections.append("## Información General del Proyecto")
        sections.append(f"**Nombre:** {basic['name']}")
        sections.append(f"**Versión:** {basic['version']}")
        sections.append(f"**Tipo:** Android Mobile App")
        sections.append(f"**Plataforma:** Android")
        sections.append(f"**Package:** {basic['package']}")
        
        desc = strings.get("app_description") or "[Agregar descripción del proyecto]"
        sections.append(f"\n**Descripción:**\n{desc}\n")
        
        # Stack Tecnológico
        sections.append("\n## Stack Tecnológico\n")
        
        sections.append("### Lenguaje Principal")
        sections.append(f"- Java: {sdk['java_version']}\n")
        
        sections.append("### SDK de Android")
        sections.append(f"- Min SDK: API {sdk['min_sdk']}")
        sections.append(f"- Target SDK: API {sdk['target_sdk']}")
        sections.append(f"- Compile SDK: API {sdk['compile_sdk']}\n")
        
        sections.append("### Frameworks / Librerías Core")
        if deps["frameworks"]:
            for fw in deps["frameworks"]:
                sections.append(f"- {fw}")
        else:
            sections.append("- AndroidX Core")
        sections.append("")
        
        if deps["local_aars"]:
            sections.append("### Librerías AAR Locales")
            for aar in deps["local_aars"]:
                sections.append(f"- {aar}")
            sections.append("")
        
        sections.append("### Dependencias Principales")
        if deps["libraries"]:
            for lib in deps["libraries"][:15]:  # Top 15
                sections.append(f"- {lib}")
        sections.append("")
        
        sections.append("### Herramientas de Build / Gestión")
        sections.append(f"- Gradle: {gradle['version']}")
        sections.append(f"- Android Gradle Plugin: {gradle['agp_version']}")
        sections.append("- Package Manager: Gradle\n")
        
        # Arquitectura
        sections.append("\n## Arquitectura del Proyecto\n")
        
        sections.append("### Patrón de Arquitectura")
        sections.append(f"{arch['pattern']}\n")
        
        if arch["features"]:
            sections.append("**Características:**")
            for feature in arch["features"]:
                sections.append(f"- {feature}")
            sections.append("")
        
        sections.append("### Estructura de Carpetas Principal")
        sections.append("```")
        sections.append("/app")
        sections.append("  /src")
        sections.append("    /main")
        sections.append("      /java")
        if structure["main_package"]:
            sections.append(f"        /{structure['main_package']}")
        sections.append("      /res")
        sections.append("        /layout")
        sections.append("        /values")
        sections.append("        /drawable")
        if assets["exists"]:
            sections.append("      /assets")
        sections.append("```\n")
        
        # Árbol completo del paquete
        if structure["full_tree"]:
            sections.append("### Árbol Completo del Paquete")
            sections.append("```")
            sections.append(f"/{structure['main_package']}")
            for line in structure["full_tree"]:
                sections.append(line)
            sections.append("```")
            sections.append(f"\n**Total de archivos .java:** {structure['file_count']}")
            
            # Listar todos los directorios
            if structure["all_directories"]:
                sections.append(f"\n**Directorios encontrados:** {len(structure['all_directories'])}")
                sections.append("```")
                for dir_path in structure["all_directories"]:
                    sections.append(f"- {dir_path}")
                sections.append("```")
            sections.append("")
        
        # Árbol de modelos si existe
        if structure["models_tree"]:
            sections.append("### Estructura Detallada de los Modelos")
            sections.append("```")
            sections.append("/model")
            for line in structure["models_tree"]:
                sections.append(line)
            sections.append("```\n")
        
        # Base de Datos
        sections.append("\n## Base de Datos / Persistencia\n")
        sections.append("### Tipo")
        sections.append("Local\n")
        sections.append("### Sistema")
        sections.append(f"{db['type']}\n")
        
        if db["files"]:
            sections.append("### Archivos de Base de Datos")
            for db_file in db["files"]:
                sections.append(f"- {db_file}")
            sections.append("")
        
        if db["orm"]:
            sections.append(f"### ORM")
            sections.append(f"{db['orm']}\n")
        
        # Assets
        if assets["exists"]:
            sections.append("\n## Assets\n")
            sections.append(f"**Total de archivos:** {assets['file_count']}\n")
            
            sections.append("### Estructura de Assets")
            sections.append("```")
            sections.append("/assets")
            for line in assets["tree"]:
                sections.append(line)
            sections.append("```\n")
            
            if assets["files_by_type"]:
                sections.append("### Archivos por Tipo")
                for ext, files in sorted(assets["files_by_type"].items()):
                    sections.append(f"\n**{ext}** ({len(files)} archivos):")
                    for file in sorted(files)[:20]:  # Limitar a 20 por tipo
                        sections.append(f"- {file}")
                sections.append("")
        
        # APIs / Servicios Externos
        sections.append("\n## APIs / Servicios Externos\n")
        
        if endpoints:
            sections.append("### Endpoints Detectados")
            for ep in endpoints:
                sections.append(f"- {ep}")
            sections.append("")
        else:
            sections.append("### Endpoints")
            sections.append("[Verificar archivos *Api*.java o *Provider*.java]\n")
        
        sections.append("### Autenticación")
        if strings.get("auth0_domain"):
            sections.append("**Auth0** - Autenticación configurada\n")
            sections.append("Configuración:")
            sections.append(f"- Domain: {strings['auth0_domain']}")
            if strings.get("auth0_client_id"):
                sections.append(f"- Client ID: {strings['auth0_client_id']}")
            sections.append("- SDK: Auth0 Android")
        elif "Auth0 SDK" in deps["frameworks"]:
            sections.append("**Auth0** - SDK detectado")
        else:
            sections.append("[Completar método de autenticación]")
        sections.append("")
        
        # Configuración del Manifest
        sections.append("\n## Configuración del Manifest\n")
        
        sections.append("### Permisos")
        if manifest["permissions"]:
            for perm in manifest["permissions"]:
                sections.append(f"- {perm}")
        else:
            sections.append("[No se encontraron permisos]")
        sections.append("")
        
        sections.append("### Actividades Principales")
        if manifest["activities"]:
            for activity in manifest["activities"][:10]:
                sections.append(f"- {activity}")
        else:
            sections.append("[No se encontraron actividades]")
        sections.append("")
        
        if manifest["services"]:
            sections.append("### Servicios")
            for service in manifest["services"]:
                sections.append(f"- {service}")
            sections.append("")
        
        if manifest["receivers"]:
            sections.append("### Receivers")
            for receiver in manifest["receivers"]:
                sections.append(f"- {receiver}")
            sections.append("")
        
        # BuildConfig
        if gradle["build_config_fields"]:
            sections.append("\n## Variables de Configuración (BuildConfig)\n")
            sections.append("```")
            for field in gradle["build_config_fields"]:
                sections.append(f"buildConfigField {field}")
            sections.append("```\n")
        
        # Testing
        sections.append("\n## Testing\n")
        
        sections.append("### Framework de Testing")
        if testing["frameworks"]:
            for fw in testing["frameworks"]:
                sections.append(f"- {fw}")
        else:
            sections.append("- JUnit (default)")
        sections.append("")
        
        sections.append("### Tipos de Tests Implementados")
        unit_check = "[x]" if testing["has_unit_tests"] else "[ ]"
        instr_check = "[x]" if testing["has_instrumentation_tests"] else "[ ]"
        sections.append(f"- {unit_check} Tests Unitarios")
        sections.append(f"- {instr_check} Tests de Instrumentación (UI)")
        sections.append("- [ ] Tests de Integración")
        sections.append("- [ ] Tests E2E\n")
        
        # Notas importantes
        sections.append("\n## Notas Importantes\n")
        sections.append(f"- MinSDK {sdk['min_sdk']} - Considerar compatibilidad con versiones antiguas")
        sections.append("- Verificar permisos en AndroidManifest.xml antes de publicar")
        sections.append("- Configurar ProGuard/R8 para ofuscación en release")
        
        if "FFmpeg Kit" in deps["frameworks"]:
            sections.append("- **CRÍTICO:** El proyecto utiliza FFmpeg Kit para procesamiento multimedia")
        
        sections.append("")
        
        # Footer
        sections.append("\n---")
        sections.append("bloom/v1")
        sections.append('context_version: "1.0"')
        sections.append(f'Generado automáticamente: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}')
        
        return "\n".join(sections)


def main():
    """Función principal"""
    
    # Detectar directorio del proyecto
    script_dir = Path(__file__).parent.resolve()
    project_root = script_dir.parent.parent
    output_file = script_dir.parent / "project" / ".dev.android.context.bl"
    
    print("\n" + "="*60)
    print("🌸 BLOOM - Android Context Generator")
    print("="*60)
    print(f"\n📁 Proyecto: {project_root}")
    print(f"📄 Output: {output_file}")
    print(f"📂 Script dir: {script_dir}\n")
    
    # Validar que existe app/
    app_path = project_root / "app"
    print(f"🔍 Buscando directorio app/: {app_path}")
    print(f"   Existe: {app_path.exists()}\n")
    
    if not app_path.exists():
        print("❌ Error: No se encontró el directorio 'app/'")
        print("   Este no parece ser un proyecto Android válido")
        print(f"   Ruta buscada: {app_path}")
        sys.exit(1)
    
    try:
        # Analizar proyecto
        analyzer = AndroidProjectAnalyzer(project_root)
        data = analyzer.analyze()
        
        # Generar contexto
        print("\n📝 Generando archivo .dev.android.context.bl...")
        generator = ContextGenerator(data)
        content = generator.generate()
        
        # Crear directorio si no existe
        output_file.parent.mkdir(parents=True, exist_ok=True)
        
        # Escribir archivo
        print(f"💾 Escribiendo en: {output_file}")
        print(f"   Directorio padre: {output_file.parent}")
        print(f"   Existe directorio: {output_file.parent.exists()}\n")
        
        output_file.write_text(content, encoding='utf-8')
        
        print(f"✅ Archivo escrito: {output_file.exists()}")
        print(f"   Tamaño: {output_file.stat().st_size} bytes\n")
        
        # Resumen
        print("\n" + "="*60)
        print("✅ Archivo generado exitosamente")
        print("="*60)
        print(f"\n📍 Ubicación: {output_file.relative_to(project_root)}")
        print(f"📦 Proyecto: {data['basic_info']['name']} v{data['basic_info']['version']}")
        print(f"📱 Package: {data['basic_info']['package']}")
        print(f"🎯 Min SDK: {data['sdk_versions']['min_sdk']}")
        print(f"📚 Dependencias: {len(data['dependencies']['libraries'])}")
        print(f"🏗️  Arquitectura: {data['architecture']['pattern']}")
        print(f"📁 Archivos Java: {data['structure']['file_count']}")
        print(f"📂 Directorios: {len(data['structure']['all_directories'])}")
        
        if data['assets']['exists']:
            print(f"🗂️  Assets: {data['assets']['file_count']} archivos")
        
        if data['dependencies']['local_aars']:
            print(f"\n⚠️  AARs locales detectados:")
            for aar in data['dependencies']['local_aars']:
                print(f"   - {aar}")
        
        print("\n💡 Revisa las secciones marcadas con [Completar...] para info adicional")
        print("")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()