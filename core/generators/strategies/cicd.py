import re
from pathlib import Path
from typing import Dict

class CiCdStrategy:
    def __init__(self, project_root: Path):
        self.root = project_root

    def is_applicable(self) -> bool:
        gh = (self.root / ".github/workflows").exists()
        gl = (self.root / ".gitlab-ci.yml").exists()
        jenkins = (self.root / "Jenkinsfile").exists()
        return gh or gl or jenkins

    def generate(self) -> str:
        data = self._analyze()
        md = f"## 🚀 CI/CD Pipelines\n\n"
        
        for platform, details in data.items():
            md += f"### {platform}\n"
            if details:
                for job in details:
                    md += f"- `{job}`\n"
            else:
                md += "- *Configuration detected*\n"
            md += "\n"
        return md

    def _analyze(self) -> Dict:
        info = {}
        
        # GitHub Actions
        gh_dir = self.root / ".github/workflows"
        if gh_dir.exists():
            jobs = []
            for yml in gh_dir.glob("*.yml"):
                try:
                    content = yml.read_text(encoding='utf-8')
                    # Extract 'name' or job keys under 'jobs:'
                    # Regex for job keys: 2 spaces indentation under jobs:
                    jobs_block = re.search(r'^jobs:\s*\n([\s\S]*?)^\S', content + "\nEND", re.MULTILINE)
                    if jobs_block:
                        found = re.findall(r'^  ([a-zA-Z0-9_-]+):', jobs_block.group(1), re.MULTILINE)
                        jobs.extend(found)
                except Exception:
                    pass
            info['GitHub Actions'] = list(set(jobs))

        # GitLab CI
        gitlab = self.root / ".gitlab-ci.yml"
        if gitlab.exists():
            try:
                content = gitlab.read_text(encoding='utf-8')
                # Find top level keys that are likely jobs (not stages, variables, cache)
                keys = re.findall(r'^([a-zA-Z0-9_-]+):', content, re.MULTILINE)
                filtered = [k for k in keys if k not in ['stages', 'variables', 'before_script', 'image', 'services', 'cache']]
                info['GitLab CI'] = filtered
            except Exception:
                info['GitLab CI'] = []

        # Jenkins
        jenkins = self.root / "Jenkinsfile"
        if jenkins.exists():
            try:
                content = jenkins.read_text(encoding='utf-8')
                # Extract stages
                stages = re.findall(r'stage\s*\([\'"](.*?)[\'"]\)', content)
                info['Jenkins'] = stages
            except Exception:
                info['Jenkins'] = []

        return info