import re
from pathlib import Path
from typing import Dict

class GoStrategy:
    def __init__(self, project_root: Path):
        self.root = project_root
        self.marker_file = self.root / "go.mod"

    def is_applicable(self) -> bool:
        return self.marker_file.exists()

    def analyze(self) -> Dict:
        data = self._analyze()
        return {
            'language': 'Go',
            'project_name': data.get('module', 'Unknown'),
            'dependencies': data.get('requirements', []),
            'config_files': ['go.mod'],
            'raw_data': {'go_version': data.get('go_version', 'Unknown')}
        }

    def _analyze(self) -> Dict:
        info = {'module': 'Unknown', 'go_version': 'Unknown', 'requirements': []}
        try:
            content = self.marker_file.read_text(encoding='utf-8')
            
            # Module name
            mod_match = re.search(r'^module\s+(.*)', content, re.MULTILINE)
            if mod_match:
                info['module'] = mod_match.group(1).strip()

            # Go version
            go_match = re.search(r'^go\s+([0-9.]+)', content, re.MULTILINE)
            if go_match:
                info['go_version'] = go_match.group(1).strip()

            # Requirements (Simple regex, handles inline 'require name v1.0')
            # Does not fully parse block require (...) robustly without state machine, 
            # but captures single lines well.
            reqs = re.findall(r'^\s*([a-zA-Z0-9.\/-]+)\s+v[0-9.]+', content, re.MULTILINE)
            
            # Attempt to capture inside require (...) blocks
            blocks = re.findall(r'require\s*\(([\s\S]*?)\)', content)
            for block in blocks:
                block_reqs = re.findall(r'^\s*([a-zA-Z0-9.\/-]+)\s+v[0-9.]+', block, re.MULTILINE)
                reqs.extend(block_reqs)
            
            info['requirements'] = sorted(list(set(reqs))) # Unique

        except Exception:
            pass
        return info