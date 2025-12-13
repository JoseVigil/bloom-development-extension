import json
from pathlib import Path
from typing import Dict

class PhpStrategy:
    def __init__(self, project_root: Path):
        self.root = project_root
        self.marker_file = self.root / "composer.json"

    def is_applicable(self) -> bool:
        return self.marker_file.exists()

    def generate(self) -> str:
        data = self._analyze()
        md = f"## 🐘 PHP Project\n\n"
        md += f"- **Name:** `{data.get('name', 'Unknown')}`\n"
        if data.get('description'):
            md += f"- **Description:** {data.get('description')}\n"
        
        if data.get('require'):
            md += "\n### Requirements\n"
            for pkg, ver in data['require'].items():
                md += f"- `{pkg}`: {ver}\n"
        
        if data.get('scripts'):
            md += "\n### Scripts\n"
            for name in data['scripts'].keys():
                md += f"- `{name}`\n"
                
        return md

    def _analyze(self) -> Dict:
        info = {}
        try:
            with open(self.marker_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                info['name'] = data.get('name', 'Unknown')
                info['description'] = data.get('description', '')
                info['require'] = data.get('require', {})
                info['scripts'] = data.get('scripts', {})
        except Exception:
            pass
        return info