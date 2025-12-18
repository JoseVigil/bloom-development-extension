# core/strategies/android.py
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, Any

class AndroidStrategy:
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.app_dir = self.project_root / "app"
        self.src_main = self.app_dir / "src" / "main"

    def analyze(self) -> Dict[str, Any]:
        """Devuelve un diccionario con datos puros para el generador de contexto."""
        
        # 1. Información Básica
        basic_info = self._extract_basic_info()
        
        # 2. SDKs
        sdks = self._extract_sdk_versions()
        
        # 3. Dependencias
        deps = self._extract_dependencies()
        
        # 4. Manifest
        manifest = self._extract_manifest_info()

        # Retornamos estructura normalizada para Bloom
        return {
            "platform": "Android",
            "language": "Java/Kotlin",
            "framework": "Native Android SDK",
            "package_name": basic_info.get("package", "unknown"),
            "min_sdk": sdks.get("min_sdk"),
            "target_sdk": sdks.get("target_sdk"),
            "dependencies": deps.get("libraries", []),
            "permissions": manifest.get("permissions", []),
            "key_features": list(deps.get("frameworks", [])),
            "entry_points": manifest.get("activities", [])[:5] # Solo las primeras 5
        }

    # --- MÉTODOS PRIVADOS DE EXTRACCIÓN (Tu lógica original intacta) ---
    def _extract_basic_info(self) -> Dict:
        info = {"name": "Android App", "package": "com.example.app"}
        # Build gradle logic...
        bg = self._find_app_build_gradle()
        if bg:
            content = bg.read_text(encoding='utf-8', errors='ignore')
            match = re.search(r'applicationId\s+["\'](.+?)["\']', content) # Ojo: applicationId es más común que package en gradle
            if match: info["package"] = match.group(1)
        
        # Manifest logic...
        manifest = self.src_main / "AndroidManifest.xml"
        if manifest.exists():
            try:
                root = ET.parse(manifest).getroot()
                if root.get('package'): info["package"] = root.get('package')
            except: pass
        return info

    def _extract_sdk_versions(self) -> Dict:
        versions = {"min_sdk": "XX", "target_sdk": "XX"}
        bg = self._find_app_build_gradle()
        if not bg: return versions
        content = bg.read_text(encoding='utf-8', errors='ignore')
        if m := re.search(r'minSdk(?:Version)?\s+(\d+)', content): versions["min_sdk"] = m.group(1)
        if m := re.search(r'targetSdk(?:Version)?\s+(\d+)', content): versions["target_sdk"] = m.group(1)
        return versions

    def _extract_dependencies(self) -> Dict:
        deps = {"libraries": [], "frameworks": set()}
        bg = self._find_app_build_gradle()
        if not bg: return deps
        content = bg.read_text(encoding='utf-8', errors='ignore')
        
        for m in re.finditer(r'(?:implementation|api)\s+["\'](.+?)["\']', content):
            dep = m.group(1)
            deps["libraries"].append(dep)
            if "retrofit" in dep: deps["frameworks"].add("Retrofit")
            if "room" in dep: deps["frameworks"].add("Room")
            if "hilt" in dep or "dagger" in dep: deps["frameworks"].add("Hilt/Dagger")
            if "compose" in dep: deps["frameworks"].add("Jetpack Compose")
        return deps

    def _extract_manifest_info(self) -> Dict:
        info = {"permissions": [], "activities": []}
        manifest = self.src_main / "AndroidManifest.xml"
        if not manifest.exists(): return info
        try:
            root = ET.parse(manifest).getroot()
            ns = {'android': 'http://schemas.android.com/apk/res/android'} # Namespace handling es necesario
            # Simplificación para evitar errores de namespace si no se parsea bien
            content = manifest.read_text(encoding='utf-8', errors='ignore')
            info["permissions"] = re.findall(r'<uses-permission[^>]*android:name="([^"]+)"', content)
            info["activities"] = re.findall(r'<activity[^>]*android:name="([^"]+)"', content)
        except: pass
        return info

    def _find_app_build_gradle(self) -> Path:
        for c in [self.app_dir / "build.gradle", self.app_dir / "build.gradle.kts"]:
            if c.exists(): return c
        return None