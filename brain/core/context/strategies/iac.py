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

    def analyze(self) -> Dict:
        data = self._analyze()
        config_files = []
        if (self.root / "Dockerfile").exists():
            config_files.append('Dockerfile')
        if (self.root / "docker-compose.yml").exists():
            config_files.append('docker-compose.yml')
        tf_files = [str(f.relative_to(self.root)) for f in self.root.glob("*.tf")]
        config_files.extend(tf_files)
        return {
            'framework': 'Infrastructure as Code',
            'dependencies': data.get('terraform_providers', []),
            'config_files': config_files,
            'raw_data': {
                'docker_image': data.get('docker_image'),
                'compose_services': data.get('compose_services', [])
            }
        }

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