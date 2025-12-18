import re
from pathlib import Path
from typing import Dict

class IosStrategy:
    def __init__(self, project_root: Path):
        self.root = project_root
        self.podfile = self.root / "Podfile"
        self.spm = self.root / "Package.swift"

    def is_applicable(self) -> bool:
        return self.podfile.exists() or self.spm.exists() or list(self.root.glob("*.xcodeproj"))

    def analyze(self) -> Dict:
        data = self._analyze()
        config_files = []
        if self.podfile.exists():
            config_files.append('Podfile')
        if self.spm.exists():
            config_files.append('Package.swift')
        xcode_projects = [str(p.relative_to(self.root)) for p in self.root.glob("*.xcodeproj")]
        config_files.extend(xcode_projects)
        dependencies = data.get('pods', []) + data.get('spm_deps', [])
        return {
            'language': 'Swift',
            'framework': 'iOS',
            'dependencies': dependencies,
            'config_files': config_files,
            'raw_data': {'platform': data.get('platform')}
        }

    def _analyze(self) -> Dict:
        info = {'pods': [], 'spm_deps': []}
        
        # Analyze Podfile
        if self.podfile.exists():
            try:
                content = self.podfile.read_text(encoding='utf-8')
                
                # Platform
                plat_match = re.search(r'platform\s+:ios\s*,\s*[\'"](.*?)[\'"]', content)
                if plat_match:
                    info['platform'] = f"iOS {plat_match.group(1)}"
                
                # Pods
                pods = re.findall(r'pod\s+[\'"](.*?)[\'"]', content)
                info['pods'] = pods
            except Exception:
                pass

        # Analyze Package.swift (Regex parsing Swift syntax is hard, trying basic)
        if self.spm.exists():
            try:
                content = self.spm.read_text(encoding='utf-8')
                # Look for .package(url: "...", ...)
                deps = re.findall(r'\.package\(.*url:\s*"(.*?)".*\)', content)
                info['spm_deps'] = [d.split('/')[-1].replace('.git', '') for d in deps]
            except Exception:
                pass
                
        return info