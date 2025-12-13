import re
from pathlib import Path
from typing import Dict, List

class MacOsStrategy:
    def __init__(self, project_root: Path):
        self.root = project_root
        self.podfile = self.root / "Podfile"
        self.spm = self.root / "Package.swift"
        # Busca cualquier archivo .xcodeproj
        self.xcode_projects = list(self.root.glob("*.xcodeproj"))

    def is_applicable(self) -> bool:
        # Es aplicable si existen los archivos Y detectamos indicadores de macOS
        # para no confundirlo con un proyecto puro de iOS.
        return self._check_is_macos()

    def generate(self) -> str:
        data = self._analyze()
        md = f"## 🖥️ macOS Desktop Project\n\n"
        
        if data.get('app_name'):
            md += f"- **App Name:** `{data['app_name']}`\n"
            
        if data.get('deployment_target'):
            md += f"- **Target OS:** macOS {data['deployment_target']}\n"
            
        if data.get('sdk_type'):
             md += f"- **SDK:** {data['sdk_type']}\n"

        if data.get('deps'):
            md += "\n### Dependencies\n"
            for dep in data['deps']:
                md += f"- `{dep}`\n"
                
        return md

    def _check_is_macos(self) -> bool:
        """Verifica superficialmente si hay indicios de macOS (osx, macosx, platform :macos)."""
        try:
            # 1. Chequear Podfile por 'platform :osx' o ':macos'
            if self.podfile.exists():
                content = self.podfile.read_text(encoding='utf-8')
                if re.search(r'platform\s+:(?:osx|macos)', content):
                    return True

            # 2. Chequear Package.swift por '.macOS'
            if self.spm.exists():
                content = self.spm.read_text(encoding='utf-8')
                if '.macOS' in content:
                    return True

            # 3. Chequear project.pbxproj interno por 'SDKROOT = macosx'
            for proj in self.xcode_projects:
                pbxproj = proj / "project.pbxproj"
                if pbxproj.exists():
                    content = pbxproj.read_text(encoding='utf-8', errors='ignore')
                    if 'SDKROOT = macosx' in content or 'MACOSX_DEPLOYMENT_TARGET' in content:
                        return True
        except Exception:
            return False
            
        return False

    def _analyze(self) -> Dict:
        info = {'deps': [], 'app_name': 'Unknown', 'sdk_type': 'Cocoa/AppKit/SwiftUI'}
        
        try:
            # --- Analizar Xcode Project (project.pbxproj) ---
            for proj in self.xcode_projects:
                pbxproj = proj / "project.pbxproj"
                if pbxproj.exists():
                    content = pbxproj.read_text(encoding='utf-8', errors='ignore')
                    
                    # Intentar extraer el Deployment Target
                    # MACOSX_DEPLOYMENT_TARGET = 11.0;
                    target_match = re.search(r'MACOSX_DEPLOYMENT_TARGET\s*=\s*([\d\.]+)', content)
                    if target_match:
                        info['deployment_target'] = target_match.group(1)
                        
                    # Intentar extraer nombre del producto (aproximado)
                    product_match = re.search(r'PRODUCT_NAME\s*=\s*"?([^";]+)"?', content)
                    if product_match and info['app_name'] == 'Unknown':
                        # Limpiar variables como $(TARGET_NAME) si aparecen
                        name = product_match.group(1).replace('$(TARGET_NAME)', proj.stem)
                        info['app_name'] = name

            # --- Analizar Podfile (CocoaPods) ---
            if self.podfile.exists():
                content = self.podfile.read_text(encoding='utf-8')
                # Extraer Pods
                pods = re.findall(r'pod\s+[\'"](.*?)[\'"]', content)
                info['deps'].extend([f"Pod: {p}" for p in pods])

            # --- Analizar Package.swift (SPM) ---
            if self.spm.exists():
                content = self.spm.read_text(encoding='utf-8')
                # Extraer dependencias SPM
                # .package(url: "https://github.com/Alamofire/Alamofire.git", .upToNextMajor(from: "5.0.0"))
                spm_deps = re.findall(r'\.package\(.*url:\s*"(.*?)".*\)', content)
                clean_deps = [d.split('/')[-1].replace('.git', '') for d in spm_deps]
                info['deps'].extend([f"SPM: {d}" for d in clean_deps])
                
                # Refinar Target version desde Swift Package
                if 'deployment_target' not in info:
                    ver_match = re.search(r'\.macOS\((.*?)\)', content)
                    if ver_match:
                        info['deployment_target'] = ver_match.group(1).replace('.v', '')

        except Exception:
            pass
            
        return info