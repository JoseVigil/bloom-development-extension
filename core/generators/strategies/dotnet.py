import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict, List

class DotNetStrategy:
    def __init__(self, project_root: Path):
        self.root = project_root

    def is_applicable(self) -> bool:
        return any(self.root.glob("*.csproj")) or any(self.root.glob("*.fsproj"))

    def generate(self) -> str:
        data = self._analyze()
        if not data:
            return ""

        md = f"## 🟣 .NET Project\n\n"
        
        for proj_name, details in data.items():
            md += f"### Project: {proj_name}\n"
            md += f"- **Framework:** `{details.get('framework', 'Unknown')}`\n"
            
            if details.get('packages'):
                md += "**NuGet Packages:**\n"
                for pkg in details['packages']:
                    md += f"- {pkg}\n"
            md += "\n"
        
        return md

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