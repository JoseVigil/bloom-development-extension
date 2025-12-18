import re
from pathlib import Path
from typing import Dict, List

class RustStrategy:
    def __init__(self, project_root: Path):
        self.root = project_root
        self.marker_file = self.root / "Cargo.toml"

    def is_applicable(self) -> bool:
        return self.marker_file.exists()

    def analyze(self) -> Dict:
        data = self._analyze()
        return {
            'language': 'Rust',
            'project_name': data.get('name', 'Unknown'),
            'dependencies': data.get('dependencies', []),
            'config_files': ['Cargo.toml'],
            'raw_data': {'version': data.get('version', 'Unknown')}
        }

    def _analyze(self) -> Dict:
        info = {'name': 'Unknown', 'version': 'Unknown', 'dependencies': []}
        try:
            content = self.marker_file.read_text(encoding='utf-8')
            
            # Extract basic info from [package]
            name_match = re.search(r'\[package\][\s\S]*?name\s*=\s*["\'](.*?)["\']', content)
            if name_match:
                info['name'] = name_match.group(1)
                
            version_match = re.search(r'\[package\][\s\S]*?version\s*=\s*["\'](.*?)["\']', content)
            if version_match:
                info['version'] = version_match.group(1)

            # Extract dependencies (Simulando un parser simple de TOML)
            # Busca la sección [dependencies] y lee hasta la siguiente sección [...]
            deps_section = re.search(r'\[dependencies\]([\s\S]*?)(?=\n\[|$)', content)
            if deps_section:
                deps_block = deps_section.group(1)
                # Matches: crate = "1.0" or crate = { ... }
                deps = re.findall(r'^([a-zA-Z0-9_-]+)\s*=', deps_block, re.MULTILINE)
                info['dependencies'] = deps

        except Exception as e:
            print(f"Error parsing Rust strategy: {e}")
        
        return info