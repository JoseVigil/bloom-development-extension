import re
from pathlib import Path
from typing import Dict

class CppStrategy:
    def __init__(self, project_root: Path):
        self.root = project_root
        self.cmake = self.root / "CMakeLists.txt"
        self.makefile = self.root / "Makefile"

    def is_applicable(self) -> bool:
        return self.cmake.exists() or self.makefile.exists()

    def generate(self) -> str:
        data = self._analyze()
        md = f"## ⚡ C++ Project\n\n"
        
        if data.get('cmake_min'):
            md += f"- **CMake Min Version:** `{data['cmake_min']}`\n"
        
        if data.get('project_name'):
            md += f"- **Project Name:** `{data['project_name']}`\n"
            
        if data.get('targets'):
            md += "\n### Defined Targets\n"
            for t in data['targets']:
                md += f"- `{t}`\n"
        elif data.get('makefile_targets'):
             md += "\n### Makefile Targets\n"
             for t in data['makefile_targets']:
                md += f"- `{t}`\n"
                
        return md

    def _analyze(self) -> Dict:
        info = {'targets': []}
        
        # Analyze CMake
        if self.cmake.exists():
            try:
                content = self.cmake.read_text(encoding='utf-8')
                
                # Min Version
                min_ver = re.search(r'cmake_minimum_required\(VERSION\s+([0-9.]+)', content, re.IGNORECASE)
                if min_ver: info['cmake_min'] = min_ver.group(1)
                
                # Project Name
                proj = re.search(r'project\(\s*([a-zA-Z0-9_-]+)', content, re.IGNORECASE)
                if proj: info['project_name'] = proj.group(1)
                
                # Executables & Libraries
                execs = re.findall(r'add_executable\(\s*([a-zA-Z0-9_-]+)', content, re.IGNORECASE)
                libs = re.findall(r'add_library\(\s*([a-zA-Z0-9_-]+)', content, re.IGNORECASE)
                info['targets'] = sorted(execs + libs)
            except Exception:
                pass
        
        # Analyze Makefile (simple target scan)
        if self.makefile.exists():
            try:
                content = self.makefile.read_text(encoding='utf-8')
                # Find lines starting with text and colon (clean targets)
                targets = re.findall(r'^([a-zA-Z0-9_-]+):', content, re.MULTILINE)
                # Filter common phony targets
                info['makefile_targets'] = [t for t in targets if t not in ['.PHONY', 'all', 'clean', 'test']]
            except Exception:
                pass
                
        return info