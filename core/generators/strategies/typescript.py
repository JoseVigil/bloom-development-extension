import json
import os
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Optional

class TypeScriptNodeStrategy:
    """
    Estrategia de análisis para proyectos Node.js / TypeScript.
    """
    def __init__(self, project_root: Path):
        self.project_root = project_root
        self.package_json = self.project_root / "package.json"

    def is_applicable(self) -> bool:
        """Verifica si es un proyecto Node válido."""
        return self.package_json.exists()

    def generate(self) -> str:
        data = self.analyze()
        generator = TypeScriptContextGenerator(data)
        return generator.generate()

    def analyze(self) -> Dict:
        return {
            "basic_info": self._extract_basic_info(),
            "dependencies": self._extract_dependencies(),
            "typescript_config": self._extract_typescript_config(),
            "scripts": self._extract_scripts(),
            "structure": self._analyze_structure(),
            "database": self._detect_database(),
            "framework": self._detect_framework(),
        }

    def _extract_basic_info(self) -> Dict:
        info = {"name": "ts-project", "version": "1.0.0"}
        try:
            data = json.loads(self.package_json.read_text(encoding='utf-8'))
            info["name"] = data.get("name", info["name"])
            info["version"] = data.get("version", info["version"])
        except: pass
        return info

    def _extract_dependencies(self) -> Dict:
        deps = {"dependencies": [], "frameworks": set()}
        try:
            data = json.loads(self.package_json.read_text(encoding='utf-8'))
            all_deps = list(data.get("dependencies", {}).keys()) + list(data.get("devDependencies", {}).keys())
            deps["dependencies"] = all_deps
            
            for d in all_deps:
                if "react" in d: deps["frameworks"].add("React")
                if "next" in d: deps["frameworks"].add("Next.js")
                if "express" in d: deps["frameworks"].add("Express")
                if "nestjs" in d: deps["frameworks"].add("NestJS")
                if "prisma" in d: deps["frameworks"].add("Prisma")
        except: pass
        return deps

    def _extract_typescript_config(self) -> Dict:
        config = {"exists": False}
        ts = self.project_root / "tsconfig.json"
        if ts.exists():
            config["exists"] = True
            # Parseo simple
        return config

    def _extract_scripts(self) -> Dict:
        scripts = {}
        try:
            data = json.loads(self.package_json.read_text(encoding='utf-8'))
            scripts = data.get("scripts", {})
        except: pass
        return scripts

    def _analyze_structure(self) -> Dict:
        return {"src_exists": (self.project_root / "src").exists()}

    def _detect_database(self) -> Dict:
        return {"type": "Unknown"}

    def _detect_framework(self) -> Dict:
        return {"name": "Unknown"}


class TypeScriptContextGenerator:
    def __init__(self, data: Dict):
        self.data = data

    def generate(self) -> str:
        d = self.data
        lines = []
        lines.append(f"# ARQUITECTURA TÉCNICA (Auto-generated)\n")
        lines.append(f"## Información General\n- **Proyecto:** {d['basic_info']['name']}\n- **Versión:** {d['basic_info']['version']}")
        
        lines.append(f"\n## Frameworks Detectados")
        for fw in d['dependencies']['frameworks']:
            lines.append(f"- {fw}")
            
        lines.append(f"\n## Scripts Disponibles")
        for k, v in d['scripts'].items():
            lines.append(f"- `{k}`: {v}")
            
        return "\n".join(lines)