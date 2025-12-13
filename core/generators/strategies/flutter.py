import re
from pathlib import Path
from typing import Dict

class FlutterStrategy:
    def __init__(self, project_root: Path):
        self.root = project_root
        self.marker_file = self.root / "pubspec.yaml"

    def is_applicable(self) -> bool:
        return self.marker_file.exists()

    def generate(self) -> str:
        data = self._analyze()
        md = f"## 💙 Flutter/Dart Project\n\n"
        md += f"- **Name:** `{data.get('name', 'Unknown')}`\n"
        md += f"- **Description:** {data.get('description', '')}\n"
        md += f"- **SDK:** `{data.get('sdk', 'Unknown')}`\n\n"
        
        if data.get('dependencies'):
            md += "### Dependencies\n"
            for dep in data['dependencies']:
                md += f"- `{dep}`\n"
        
        return md

    def _analyze(self) -> Dict:
        info = {'name': 'Unknown', 'dependencies': []}
        try:
            content = self.marker_file.read_text(encoding='utf-8')
            
            # Simple Key Value Regex
            name_match = re.search(r'^name:\s*(.*)', content, re.MULTILINE)
            if name_match: info['name'] = name_match.group(1).strip()
            
            desc_match = re.search(r'^description:\s*(.*)', content, re.MULTILINE)
            if desc_match: info['description'] = desc_match.group(1).strip()
            
            # Try to find SDK version
            sdk_match = re.search(r'sdk:\s*[\'"]?(.*?)[\'"]?$', content, re.MULTILINE)
            if sdk_match: info['sdk'] = sdk_match.group(1)

            # Dependencies: Very brittle with Regex for YAML, but attempting to catch root level deps
            # Logic: Find 'dependencies:', then capture lines starting with 2 spaces ending in colon
            dep_section = re.search(r'^dependencies:\s*\n([\s\S]*?)(?=\n[a-z]|$)', content, re.MULTILINE)
            if dep_section:
                block = dep_section.group(1)
                deps = re.findall(r'^  ([a-zA-Z0-9_]+):', block, re.MULTILINE)
                info['dependencies'] = deps

        except Exception:
            pass
        return info