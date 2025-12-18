import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List

class DotNetStrategy:
    def __init__(self, project_root: Path):
        self.root = project_root

    def is_applicable(self) -> bool:
        return any(self.root.glob("*.csproj")) or any(self.root.glob("*.fsproj"))

    def analyze(self) -> Dict:
        data = self._analyze()
        config_files = [str(f.relative_to(self.root)) for f in list(self.root.glob("*.csproj")) + list(self.root.glob("*.fsproj"))]
        dependencies = list(set(pkg for details in data.values() for pkg in details.get('packages', [])))
        language = 'C#' if all(p.endswith('.csproj') for p in config_files) else 'F#' if all(p.endswith('.fsproj') for p in config_files) else '.NET'
        return {
            'language': language,
            'framework': '.NET',
            'dependencies': dependencies,
            'config_files': config_files,
            'raw_data': {'projects': data}
        }

    def _analyze(self) -> Dict:
        projects = {}
        # Find all project files
        files = list(self.root.glob("*.csproj")) + list(self.root.glob("*.fsproj"))
        
        for f in files:
            try:
                content = f.read_text(encoding='utf-8')
                # Remove namespaces usually works better for simple parsing
                root = ET.fromstring(content)
                
                framework = root.findtext(".//TargetFramework") or root.findtext(".//TargetFrameworks")
                
                packages = []
                for pkg in root.findall(".//PackageReference"):
                    name = pkg.get("Include")
                    ver = pkg.get("Version")
                    if name:
                        packages.append(f"{name} ({ver})" if ver else name)
                
                projects[f.name] = {
                    'framework': framework,
                    'packages': packages
                }
            except Exception:
                projects[f.name] = {'error': 'Failed to parse'}
        
        return projects