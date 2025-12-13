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

    def generate(self) -> str:
        data = self._analyze()
        md = f"## 🍎 iOS / Swift Project\n\n"
        
        if data.get('platform'):
            md += f"- **Platform:** {data['platform']}\n"
            
        if data.get('pods'):
            md += "### CocoaPods\n"
            for pod in data['pods']:
                md += f"- `{pod}`\n"
        
        if data.get('spm_deps'):
            md += "### Swift Package Manager\n"
            for dep in data['spm_deps']:
                md += f"- `{dep}`\n"
                
        return md

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