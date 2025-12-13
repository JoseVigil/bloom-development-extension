import re
from pathlib import Path
from typing import Dict

class RubyStrategy:
    def __init__(self, project_root: Path):
        self.root = project_root
        self.marker_file = self.root / "Gemfile"

    def is_applicable(self) -> bool:
        return self.marker_file.exists()

    def generate(self) -> str:
        data = self._analyze()
        md = f"## 💎 Ruby Project\n\n"
        md += f"- **Ruby Version:** `{data.get('ruby_version', 'Not specified')}`\n\n"
        
        if data.get('gems'):
            md += "### Gems\n"
            for gem in data['gems']:
                md += f"- `{gem}`\n"
        return md

    def _analyze(self) -> Dict:
        info = {'ruby_version': None, 'gems': []}
        try:
            content = self.marker_file.read_text(encoding='utf-8')
            
            # Ruby version
            ruby_match = re.search(r'^ruby\s+[\'"](.*?)[\'"]', content, re.MULTILINE)
            if ruby_match:
                info['ruby_version'] = ruby_match.group(1)
            
            # Gems (simple regex)
            # Matches: gem 'rails', '~> 5.0' -> captures 'rails'
            gems = re.findall(r'^gem\s+[\'"](.*?)[\'"]', content, re.MULTILINE)
            info['gems'] = gems
            
        except Exception:
            pass
        return info