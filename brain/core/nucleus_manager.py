"""
Nucleus Manager V2.0 - Meta-Sistema de Gobernanza y Descubrimiento
Manages Nucleus creation, linking, and cross-project intelligence.
"""

import json
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Optional, Callable
from uuid import uuid4


class NucleusManager:
    """
    Manages Bloom Nucleus structure and lifecycle.
    Nucleus = Centro de Control + Motor de Descubrimiento + Archivo Histórico
    """
    
    NUCLEUS_CONFIG_FILE = ".core/.nucleus-config.json"
    
    def __init__(self, root_path: Path):
        """
        Initialize the Nucleus Manager.
        Args:
            root_path: Root directory of the nucleus
        """
        self.root_path = Path(root_path).resolve()
        self.org_name = None

    def create(
        self,
        organization_name: str,
        organization_url: str = "",
        output_dir: str = ".bloom",
        private: bool = False,
        force: bool = False,
        on_progress: Optional[Callable[[str], None]] = None
    ) -> Dict[str, Any]:
        """
        Create a complete Nucleus V2.0 structure with enhanced configuration.
        """
        self.org_name = organization_name
        nucleus_name = f"nucleus-{self._slugify(organization_name)}"
        
        if on_progress:
            on_progress(f"Creating Nucleus V2.0 for {organization_name}...")
        
        repo_url = ""
        is_git_repo = False
        
        try:
            from brain.core.github.api_client import GitHubAPIClient
            from brain.core.git.executor import GitExecutor
            
            client = GitHubAPIClient()
            git = GitExecutor()
            
            if on_progress:
                on_progress(f"Checking GitHub for {organization_name}/{nucleus_name}...")
            
            if not client.repo_exists(organization_name, nucleus_name):
                if on_progress:
                    on_progress(f"Creating repository {organization_name}/{nucleus_name}...")
                
                repo = client.create_repo(
                    name=nucleus_name,
                    description=f"Bloom Nucleus - {organization_name} Governance & Discovery",
                    private=private,
                    auto_init=True,
                    org=organization_name if organization_name != client.get_current_user()["login"] else None
                )
                repo_url = repo.html_url
                
                if on_progress:
                    on_progress(f"Cloning to {self.root_path}...")
                
                if self.root_path.exists() and force:
                    import shutil
                    shutil.rmtree(self.root_path)
                
                git.clone(repo.clone_url, self.root_path)
                is_git_repo = True
                
        except (ImportError, Exception):
            pass

        if on_progress:
            on_progress("Generating Nucleus V2.0 structure...")
        
        if self.root_path.exists() and any(self.root_path.iterdir()) and not is_git_repo and not force:
            raise FileExistsError(
                f"Directory '{self.root_path}' already exists and is not empty. Use --force to overwrite."
            )
        
        self.root_path.mkdir(parents=True, exist_ok=True)
        
        bloom_dir = self.root_path / ".bloom"
        nucleus_dir = bloom_dir / f".{nucleus_name}"
        
        self._create_directory_tree(nucleus_dir, {
            ".core": {},
            ".governance": {
                "architecture": {".decisions": {}},
                "security": {},
                "quality": {}
            },
            ".intents": {".exp": {}},
            ".cache": {},
            ".relations": {},
            "findings": {},
            "reports": {"exports": {}}
        })
        
        projects = self._detect_sibling_projects()
        
        timestamp = datetime.now().isoformat()
        files_created = []
        
        nucleus_config = self._create_enhanced_nucleus_config(
            organization_name,
            repo_url or organization_url,
            nucleus_name,
            nucleus_dir,
            projects,
            timestamp
        )
        
        core_dir = nucleus_dir / ".core"
        self._write_json(core_dir / ".nucleus-config.json", nucleus_config)
        files_created.append(".core/.nucleus-config.json")
        
        self._write_file(core_dir / ".rules.bl", self._get_nucleus_rules())
        files_created.append(".core/.rules.bl")
        
        self._write_file(core_dir / ".standards.bl", self._get_nucleus_standards())
        files_created.append(".core/.standards.bl")
        
        self._write_file(core_dir / ".policies.bl", self._get_nucleus_policies())
        files_created.append(".core/.policies.bl")
        
        self._write_json(core_dir / ".meta.json", {
            "type": "nucleus",
            "version": "2.0",
            "created_at": timestamp,
            "organization": organization_name
        })
        files_created.append(".core/.meta.json")
        
        arch_dir = nucleus_dir / ".governance" / "architecture"
        self._write_file(arch_dir / ".principles.bl", self._get_architecture_principles())
        files_created.append(".governance/architecture/.principles.bl")
        
        self._write_file(arch_dir / ".patterns.bl", self._get_architecture_patterns())
        files_created.append(".governance/architecture/.patterns.bl")
        
        security_dir = nucleus_dir / ".governance" / "security"
        self._write_file(security_dir / ".security-standards.bl", self._get_security_standards())
        files_created.append(".governance/security/.security-standards.bl")
        
        self._write_file(security_dir / ".compliance-requirements.bl", self._get_compliance_requirements())
        files_created.append(".governance/security/.compliance-requirements.bl")
        
        quality_dir = nucleus_dir / ".governance" / "quality"
        self._write_file(quality_dir / ".code-standards.bl", self._get_code_standards())
        files_created.append(".governance/quality/.code-standards.bl")
        
        self._write_file(quality_dir / ".testing-requirements.bl", self._get_testing_requirements())
        files_created.append(".governance/quality/.testing-requirements.bl")
        
        cache_dir = nucleus_dir / ".cache"
        
        self._write_json(cache_dir / ".projects-snapshot.json", {
            "scanned_at": timestamp,
            "project_names": [p["name"] for p in projects],
            "checksum": self._calculate_projects_checksum(projects)
        })
        files_created.append(".cache/.projects-snapshot.json")
        
        self._write_json(cache_dir / ".semantic-index.json", {
            "indexed_at": timestamp,
            "entries": []
        })
        files_created.append(".cache/.semantic-index.json")
        
        self._write_json(cache_dir / ".last-sync.json", {
            "last_sync": timestamp,
            "projects_synced": len(projects)
        })
        files_created.append(".cache/.last-sync.json")
        
        relations_dir = nucleus_dir / ".relations"
        self._write_json(relations_dir / ".project-links.json", {
            "relations": []
        })
        files_created.append(".relations/.project-links.json")
        
        findings_dir = nucleus_dir / "findings"
        self._write_file(findings_dir / "README.md", self._get_findings_readme(organization_name))
        files_created.append("findings/README.md")
        
        reports_dir = nucleus_dir / "reports"
        self._write_json(reports_dir / "health-dashboard.json", {
            "generated_at": timestamp,
            "organization": organization_name,
            "total_projects": len(projects),
            "status": "healthy"
        })
        files_created.append("reports/health-dashboard.json")

        return {
            "nucleus_name": nucleus_name,
            "path": str(nucleus_dir.absolute()),
            "organization": {
                "name": organization_name,
                "url": repo_url
            },
            "files_created": files_created,
            "projects_detected": len(projects),
            "is_git_repo": is_git_repo,
            "timestamp": timestamp
        }

    def _create_enhanced_nucleus_config(
        self,
        org_name: str,
        org_url: str,
        nucleus_name: str,
        nucleus_dir: Path,
        projects: List[Dict[str, Any]],
        timestamp: str
    ) -> Dict[str, Any]:
        """
        Generate enhanced nucleus-config.json with comprehensive metadata.
        This is the single source of truth for nucleus state.
        """
        
        strategies_count = {}
        for proj in projects:
            strategy = proj.get("strategy", "generic")
            strategies_count[strategy] = strategies_count.get(strategy, 0) + 1
        
        config = {
            "type": "nucleus",
            "version": "2.0",
            "id": str(uuid4()),
            
            "organization": {
                "name": org_name,
                "url": org_url,
                "slug": self._slugify(org_name)
            },
            
            "nucleus": {
                "name": nucleus_name,
                "createdAt": timestamp,
                "lastUpdatedAt": timestamp,
                
                "path": str(nucleus_dir.absolute()),
                "rootPath": str(self.root_path.absolute()),
                
                "structureVersion": "2.0",
                "directorySchema": {
                    "core": ".core",
                    "governance": ".governance",
                    "intents": ".intents/.exp",
                    "cache": ".cache",
                    "relations": ".relations",
                    "findings": "findings",
                    "reports": "reports"
                },
                
                "status": {
                    "initialized": True,
                    "syncStatus": "synced",
                    "lastSync": timestamp,
                    "healthStatus": "healthy"
                },
                
                "statistics": {
                    "totalProjects": len(projects),
                    "activeProjects": len([p for p in projects if p.get("status") == "active"]),
                    "totalIntents": 0,
                    "totalFindings": 0,
                    "strategiesDistribution": strategies_count
                }
            },
            
            "projects": [],
            
            "relations": [],
            
            "features": {
                "explorationIntents": True,
                "crossProjectAnalysis": True,
                "semanticIndexing": True,
                "governanceEnforcement": True,
                "githubIntegration": bool(org_url)
            },
            
            "metadata": {
                "configVersion": "2.0.0",
                "generatedBy": "NucleusManager",
                "compatibleCliVersion": ">=2.0.0",
                "lastModifiedBy": "create_command",
                "tags": ["governance", "discovery", "meta-system"]
            }
        }
        
        for proj in projects:
            config["projects"].append({
                "id": str(uuid4()),
                "name": proj["name"],
                "strategy": proj.get("strategy", "generic"),
                "localPath": proj.get("localPath", f"../{proj['name']}"),
                "absolutePath": proj.get("path", ""),
                "status": "active",
                "discoveredAt": timestamp,
                "lastScannedAt": timestamp,
                "metadata": {
                    "hasBloomConfig": False,
                    "isGitRepo": False,
                    "estimatedSize": 0
                }
            })
        
        return config
    
    def _calculate_projects_checksum(self, projects: List[Dict[str, Any]]) -> str:
        """
        Calculate a simple checksum for projects list.
        Used by cache to detect if projects have changed.
        """
        import hashlib
        
        sorted_names = sorted([p["name"] for p in projects])
        checksum_input = "|".join(sorted_names)
        
        return hashlib.md5(checksum_input.encode()).hexdigest()
    
    def _create_directory_tree(self, base: Path, structure: Dict[str, Any]) -> None:
        """Recursively create directory structure."""
        for name, children in structure.items():
            dir_path = base / name
            dir_path.mkdir(parents=True, exist_ok=True)
            if isinstance(children, dict) and children:
                self._create_directory_tree(dir_path, children)
    
    def _slugify(self, text: str) -> str:
        """Convert text to slug format."""
        return text.lower().replace(" ", "-").replace("_", "-")
    
    def _write_file(self, path: Path, content: str) -> None:
        """Write text file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
    
    def _write_json(self, path: Path, data: Dict[str, Any]) -> None:
        """Write JSON file."""
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    
    def _detect_sibling_projects(self) -> List[Dict[str, Any]]:
        """Detect sibling projects for linking."""
        projects = []
        parent_dir = self.root_path.parent
        
        if not parent_dir.exists():
            return projects
        
        try:
            for item in parent_dir.iterdir():
                if (not item.is_dir() or 
                    item.name.startswith(".") or 
                    item == self.root_path or 
                    item.name.startswith("nucleus-")):
                    continue
                
                strategy = self._detect_project_strategy(item)
                if strategy != "skip":
                    projects.append({
                        "name": item.name,
                        "path": str(item),
                        "localPath": f"../{item.name}",
                        "strategy": strategy
                    })
        except Exception:
            pass
        
        return projects
    
    def _detect_project_strategy(self, project_path: Path) -> str:
        """Detect project type/strategy."""
        if (project_path / "app" / "build.gradle").exists():
            return "android"
        if (project_path / "package.json").exists():
            return "typescript"
        if (project_path / "requirements.txt").exists() or (project_path / "pyproject.toml").exists():
            return "python"
        if (project_path / "go.mod").exists():
            return "go"
        if (project_path / "Cargo.toml").exists():
            return "rust"
        
        ignore_names = ["node_modules", "vendor", "build", "dist", ".git", "__pycache__"]
        if project_path.name in ignore_names:
            return "skip"
        
        return "generic"

    def _get_nucleus_rules(self) -> str:
        return """# BLOOM NUCLEUS RULES V2.0

## META-INSTRUCCIONES

Este Nucleus es el **Meta-Sistema de Gobernanza y Descubrimiento** de la organización.

### Propósito
- Centro de Control estratégico
- Motor de Descubrimiento cross-project
- Archivo Histórico de decisiones

### Principios
1. **No Duplicar**: Lee en tiempo real de proyectos hijos
2. **Gobernar**: Define estándares y políticas organizacionales
3. **Descubrir**: Explora patrones y oportunidades cross-project
4. **Archivar**: Mantiene historial de decisiones arquitectónicas

### Estructura
- `.core/` - Configuración y metadatos
- `.governance/` - Políticas, estándares, compliance
- `.intents/.exp/` - Intents de exploración (Inquiry → Discovery → Findings)
- `.cache/` - Índices sincronizados de proyectos
- `.relations/` - Mapeo de relaciones entre proyectos
- `findings/` - Exportaciones visibles de descubrimientos
- `reports/` - Reportes operacionales visibles
"""
    
    def _get_nucleus_standards(self) -> str:
        return """# TECHNICAL STANDARDS

## Coding Standards
- Follow language-specific best practices
- Maintain consistent code style across projects
- Document all public APIs

## Architecture Standards
- Microservices over monoliths where appropriate
- API-first design
- Event-driven architecture for async workflows

## Testing Standards
- Minimum 80% code coverage
- Integration tests for all APIs
- E2E tests for critical paths
"""
    
    def _get_nucleus_policies(self) -> str:
        return """# DEVELOPMENT POLICIES

## Security
- No secrets in code
- Regular dependency updates
- Security reviews for all PRs

## Quality
- Code review required for all changes
- CI/CD pipeline must pass
- Documentation must be updated

## Compliance
- GDPR compliance required
- Accessibility standards (WCAG 2.1)
- Performance budgets enforced
"""
    
    def _get_architecture_principles(self) -> str:
        return """# ARCHITECTURE PRINCIPLES

1. **Simplicity**: Choose the simplest solution that works
2. **Modularity**: Build loosely coupled components
3. **Scalability**: Design for growth from day one
4. **Resilience**: Fail gracefully and recover automatically
5. **Observability**: Monitor everything, alert intelligently
"""
    
    def _get_architecture_patterns(self) -> str:
        return """# APPROVED ARCHITECTURE PATTERNS

## Backend
- REST API with OpenAPI specs
- Event-driven microservices (Kafka/RabbitMQ)
- CQRS for complex domains

## Frontend
- Component-based architecture (React/Vue)
- State management (Redux/Vuex)
- Progressive Web Apps

## Data
- Database per service
- Event sourcing for audit trails
- Caching strategies (Redis)
"""
    
    def _get_security_standards(self) -> str:
        return """# SECURITY STANDARDS

## Authentication
- OAuth 2.0 / OpenID Connect
- Multi-factor authentication required
- JWT tokens with short expiry

## Authorization
- Role-based access control (RBAC)
- Principle of least privilege
- Regular access reviews

## Data Protection
- Encryption at rest and in transit
- PII anonymization
- Regular security audits
"""
    
    def _get_compliance_requirements(self) -> str:
        return """# COMPLIANCE REQUIREMENTS

## Data Privacy
- GDPR compliance mandatory
- Data retention policies enforced
- Right to erasure implemented

## Accessibility
- WCAG 2.1 Level AA minimum
- Keyboard navigation support
- Screen reader compatibility

## Performance
- Core Web Vitals targets met
- API response times < 200ms
- Page load times < 2s
"""
    
    def _get_code_standards(self) -> str:
        return """# CODE STANDARDS

## General
- Meaningful variable/function names
- No magic numbers
- DRY principle
- SOLID principles

## Documentation
- JSDoc/PyDoc for all functions
- README in every project
- API documentation auto-generated

## Version Control
- Semantic versioning
- Conventional commits
- Feature branch workflow
"""
    
    def _get_testing_requirements(self) -> str:
        return """# TESTING REQUIREMENTS

## Coverage
- Minimum 80% code coverage
- 100% coverage for critical paths
- No untested public APIs

## Types
- Unit tests for all business logic
- Integration tests for APIs
- E2E tests for user flows

## Performance
- Load testing for all endpoints
- Stress testing for critical services
- Regression testing automated
"""
    
    def _get_findings_readme(self, org_name: str) -> str:
        return f"""# {org_name} - Findings

This directory contains exportable findings from Exploration Intents.

## Structure
```
findings/
├── README.md (this file)
└── {{intent-name}}/
    ├── report.pdf
    ├── report.md
    └── data.json
```

## Usage
Each exploration intent generates findings that are exported here for sharing with stakeholders.

### Intent Lifecycle
1. **Inquiry**: Define strategic question
2. **Discovery**: Iterative exploration (turns)
3. **Findings**: Exportable results (this directory)

## Latest Findings
(This section will be auto-updated by the system)
"""

    def _find_nucleus_dir(self) -> Optional[Path]:
        """Find the nucleus directory."""
        bloom_dir = self.root_path / ".bloom"
        if not bloom_dir.exists():
            return None
        
        for item in bloom_dir.iterdir():
            if item.is_dir() and item.name.startswith(".nucleus-"):
                return item
        
        return None