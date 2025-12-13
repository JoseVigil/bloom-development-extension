import re
from pathlib import Path
from typing import Dict

class InfraStrategy:
    def __init__(self, project_root: Path):
        self.root = project_root

    def is_applicable(self) -> bool:
        has_docker = (self.root / "Dockerfile").exists()
        has_compose = (self.root / "docker-compose.yml").exists()
        has_tf = any(self.root.glob("*.tf"))
        return has_docker or has_compose or has_tf

    def generate(self) -> str:
        data = self._analyze()
        md = f"## ☁️ Infrastructure as Code\n\n"
        
        if data.get('docker_image'):
            md += f"**Dockerfile Base:** `{data['docker_image']}`\n\n"
            
        if data.get('compose_services'):
            md += "### Docker Compose Services\n"
            for svc in data['compose_services']:
                md += f"- `{svc}`\n"
            md += "\n"
                
        if data.get('terraform_providers'):
            md += "### Terraform Providers\n"
            for prov in data['terraform_providers']:
                md += f"- `{prov}`\n"
                
        return md

    def _analyze(self) -> Dict:
        info = {}
        
        # Dockerfile
        dockerfile = self.root / "Dockerfile"
        if dockerfile.exists():
            try:
                content = dockerfile.read_text(encoding='utf-8')
                match = re.search(r'^FROM\s+([^\s]+)', content, re.MULTILINE)
                if match:
                    info['docker_image'] = match.group(1)
            except Exception:
                pass

        # Docker Compose
        compose = self.root / "docker-compose.yml"
        if compose.exists():
            try:
                content = compose.read_text(encoding='utf-8')
                # Find services block and indented keys
                services_match = re.search(r'^services:\s*\n([\s\S]*?)^\S', content + "\nEND", re.MULTILINE)
                if services_match:
                    block = services_match.group(1)
                    # Services are lines with 2 spaces indentation and a colon
                    services = re.findall(r'^  ([a-zA-Z0-9_-]+):', block, re.MULTILINE)
                    info['compose_services'] = services
            except Exception:
                pass

        # Terraform
        tf_files = list(self.root.glob("*.tf"))
        if tf_files:
            providers = set()
            for tf in tf_files:
                try:
                    content = tf.read_text(encoding='utf-8')
                    # Very basic regex for required_providers block keys
                    provs = re.findall(r'source\s*=\s*["\']hashicorp/([a-z]+)["\']', content)
                    providers.update(provs)
                except Exception:
                    pass
            info['terraform_providers'] = list(providers)

        return info