import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Dict

class JvmStrategy:
    def __init__(self, project_root: Path):
        self.root = project_root
        self.pom = self.root / "pom.xml"
        self.gradle = self.root / "build.gradle"
        self.gradle_kts = self.root / "build.gradle.kts"

    def is_applicable(self) -> bool:
        return self.pom.exists() or self.gradle.exists() or self.gradle_kts.exists()

    def generate(self) -> str:
        data = self._analyze()
        md = f"## ☕ JVM Project ({data.get('type', 'Unknown')})\n\n"
        
        if 'groupId' in data:
            md += f"- **Artifact:** `{data.get('groupId')}:{data.get('artifactId')}`\n"
        
        if data.get('plugins'):
            md += "### Plugins\n" + "\n".join([f"- {p}" for p in data['plugins']]) + "\n\n"

        if data.get('dependencies'):
            md += "### Dependencies\n"
            # Limitar a las primeras 15 para no saturar
            for dep in data['dependencies'][:15]:
                md += f"- {dep}\n"
            if len(data['dependencies']) > 15:
                md += f"- *...and {len(data['dependencies']) - 15} more*\n"
                
        return md

    def _analyze(self) -> Dict:
        info = {'type': 'Unknown', 'dependencies': []}
        
        # Strategy 1: Maven
        if self.pom.exists():
            info['type'] = 'Maven'
            try:
                # Remove namespaces for easier parsing
                content = self.pom.read_text(encoding='utf-8')
                content = re.sub(r'\sxmlns="[^"]+"', '', content, count=1)
                root = ET.fromstring(content)
                
                info['groupId'] = root.findtext('groupId') or root.findtext('parent/groupId')
                info['artifactId'] = root.findtext('artifactId')
                
                deps = []
                for dep in root.findall(".//dependency"):
                    g = dep.findtext("groupId")
                    a = dep.findtext("artifactId")
                    if g and a:
                        deps.append(f"{g}:{a}")
                info['dependencies'] = deps
            except Exception:
                pass
            return info

        # Strategy 2: Gradle
        gradle_file = self.gradle if self.gradle.exists() else self.gradle_kts
        if gradle_file.exists():
            info['type'] = 'Gradle'
            try:
                content = gradle_file.read_text(encoding='utf-8')
                
                # Plugins regex
                plugins = re.findall(r'id\s*[\(\'"]([a-zA-Z0-9\.-]+)[\)\'"]', content)
                info['plugins'] = list(set(plugins))

                # Dependencies regex (implementation/api "group:artifact:ver")
                # Matches: implementation "com.google:gson:2.8" or implementation("...")
                raw_deps = re.findall(r'(?:implementation|api|compileOnly)\s*\(?[\'"]([^:\'"\s]+:[^:\'"\s]+:[^:\'"\s]+)[\'"]', content)
                info['dependencies'] = sorted(list(set(raw_deps)))
            except Exception:
                pass

        return info