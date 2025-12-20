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
    
    NUCLEUS_CONFIG_FILE = ".core/nucleus-config.json"
    
    def __init__(self, root_path: Path):
        """
        Initialize the Nucleus Manager.
        Args:
            root_path: Root directory of the nucleus
        """
        self.root_path = Path(root_path).resolve()
        self.org_name = None

    # =========================================================================
    # LIFECYCLE METHODS
    # =========================================================================

    def create(
        self,
        organization_name: str,
        organization_url: str = "",
        output_dir: str = ".bloom",  # Ignored, kept for compatibility
        private: bool = False,
        force: bool = False,
        on_progress: Optional[Callable[[str], None]] = None
    ) -> Dict[str, Any]:
        """
        Create a complete Nucleus V2.0 structure.
        
        Structure:
        .bloom/.nucleus-{org}/
            ├── .core/
            ├── .governance/
            ├── .intents/.exp/
            ├── .cache/
            ├── .relations/
            ├── findings/     (visible)
            └── reports/      (visible)
        """
        self.org_name = organization_name
        nucleus_name = f"nucleus-{self._slugify(organization_name)}"
        
        if on_progress:
            on_progress(f"Creating Nucleus V2.0 for {organization_name}...")
        
        # =====================================================================
        # 1. GITHUB INTEGRATION (Optional)
        # =====================================================================
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

        # =====================================================================
        # 2. LOCAL SCAFFOLDING
        # =====================================================================
        if on_progress:
            on_progress("Generating Nucleus V2.0 structure...")
        
        # Check if directory exists
        if self.root_path.exists() and any(self.root_path.iterdir()) and not is_git_repo and not force:
            raise FileExistsError(
                f"Directory '{self.root_path}' already exists and is not empty. Use --force to overwrite."
            )
        
        self.root_path.mkdir(parents=True, exist_ok=True)
        
        # Create .bloom/.nucleus-{org}/ structure
        bloom_dir = self.root_path / ".bloom"
        nucleus_dir = bloom_dir / f".{nucleus_name}"
        
        # Hidden directories
        core_dir = nucleus_dir / ".core"
        governance_dir = nucleus_dir / ".governance"
        intents_dir = nucleus_dir / ".intents"
        cache_dir = nucleus_dir / ".cache"
        relations_dir = nucleus_dir / ".relations"
        
        # Visible directories
        findings_dir = nucleus_dir / "findings"
        reports_dir = nucleus_dir / "reports"
        
        # Create directory tree
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
        
        # Detect sibling projects
        projects = self._detect_sibling_projects()
        
        timestamp = datetime.now().isoformat()
        files_created = []
        
        # =====================================================================
        # 3. GENERATE CORE FILES
        # =====================================================================
        
        # nucleus-config.json
        nucleus_config = self._create_nucleus_config(
            organization_name,
            repo_url or organization_url,
            nucleus_name,
            projects
        )
        self._write_json(core_dir / "nucleus-config.json", nucleus_config)
        files_created.append(".core/nucleus-config.json")
        
        # Core templates
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
        
        # =====================================================================
        # 4. GOVERNANCE FILES
        # =====================================================================
        
        # Architecture
        arch_dir = governance_dir / "architecture"
        self._write_file(arch_dir / ".principles.bl", self._get_architecture_principles())
        files_created.append(".governance/architecture/.principles.bl")
        
        self._write_file(arch_dir / ".patterns.bl", self._get_architecture_patterns())
        files_created.append(".governance/architecture/.patterns.bl")
        
        # Security
        security_dir = governance_dir / "security"
        self._write_file(security_dir / ".security-standards.bl", self._get_security_standards())
        files_created.append(".governance/security/.security-standards.bl")
        
        self._write_file(security_dir / ".compliance-requirements.bl", self._get_compliance_requirements())
        files_created.append(".governance/security/.compliance-requirements.bl")
        
        # Quality
        quality_dir = governance_dir / "quality"
        self._write_file(quality_dir / ".code-standards.bl", self._get_code_standards())
        files_created.append(".governance/quality/.code-standards.bl")
        
        self._write_file(quality_dir / ".testing-requirements.bl", self._get_testing_requirements())
        files_created.append(".governance/quality/.testing-requirements.bl")
        
        # =====================================================================
        # 5. CACHE & RELATIONS
        # =====================================================================
        
        self._write_json(cache_dir / ".projects-snapshot.json", {
            "generated_at": timestamp,
            "projects": projects
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
        
        self._write_json(relations_dir / ".project-links.json", {
            "relations": []
        })
        files_created.append(".relations/.project-links.json")
        
        # =====================================================================
        # 6. VISIBLE FILES
        # =====================================================================
        
        # findings/README.md
        self._write_file(findings_dir / "README.md", self._get_findings_readme(organization_name))
        files_created.append("findings/README.md")
        
        # reports/health-dashboard.json
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

    # =========================================================================
    # PRIVATE HELPERS
    # =========================================================================
    
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
                # Skip hidden, nucleus, and non-directories
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
        
        # Skip common ignore patterns
        ignore_names = ["node_modules", "vendor", "build", "dist", ".git", "__pycache__"]
        if project_path.name in ignore_names:
            return "skip"
        
        return "generic"
    
    def _create_nucleus_config(
        self,
        org_name: str,
        org_url: str,
        nucleus_name: str,
        projects: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Generate nucleus-config.json structure."""
        now = datetime.now().isoformat() + "Z"
        
        config = {
            "type": "nucleus",
            "version": "2.0",
            "id": str(uuid4()),
            "organization": {
                "name": org_name,
                "url": org_url
            },
            "nucleus": {
                "name": nucleus_name,
                "createdAt": now
            },
            "projects": [],
            "relations": []
        }
        
        # Add detected projects
        for proj in projects:
            config["projects"].append({
                "id": str(uuid4()),
                "name": proj["name"],
                "strategy": proj.get("strategy", "generic"),
                "localPath": proj.get("localPath", f"../{proj['name']}"),
                "status": "active"
            })
        
        return config

    # =========================================================================
    # TEMPLATE GENERATORS
    # =========================================================================
    
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

def create_exp_intent(
        self,
        name: str,
        inquiry: Optional[str] = None,
        description: Optional[str] = None,
        projects: Optional[List[str]] = None,
        on_progress: Optional[Callable[[str], None]] = None
    ) -> Dict[str, Any]:
        """
        Create a new exploration intent in the nucleus.
        
        Args:
            name: Intent name (will be slugified)
            inquiry: Initial inquiry question
            description: Intent description
            projects: List of project names to include (None = all projects)
            on_progress: Progress callback
            
        Returns:
            Dict with intent creation results
            
        Raises:
            FileNotFoundError: If nucleus directory not found
            ValueError: If name is invalid
        """
        timestamp = datetime.now().isoformat()
        
        # Validate name
        if not name or len(name.strip()) == 0:
            raise ValueError("Intent name cannot be empty")
        
        slugified_name = self._slugify(name)
        intent_id = str(uuid4())[:8]  # Short UUID for readability
        intent_dirname = f".{slugified_name}-{intent_id}"
        
        if on_progress:
            on_progress(f"Creating exploration intent '{name}'...")
        
        # Find nucleus directory
        nucleus_dir = self._find_nucleus_dir()
        if not nucleus_dir:
            raise FileNotFoundError(
                "Nucleus directory not found. Ensure you're in a nucleus directory or specify --path"
            )
        
        # Load nucleus config
        config_path = nucleus_dir / ".core" / "nucleus-config.json"
        if not config_path.exists():
            raise FileNotFoundError(f"Nucleus config not found at {config_path}")
        
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        # Determine which projects to include
        all_projects = config.get("projects", [])
        
        if projects:
            # Filter by provided list
            included_projects = [
                p for p in all_projects 
                if p["name"] in projects
            ]
            if len(included_projects) == 0:
                raise ValueError(f"No projects found matching: {', '.join(projects)}")
        else:
            # Include all active projects
            included_projects = [
                p for p in all_projects 
                if p.get("status") == "active"
            ]
        
        if on_progress:
            on_progress(f"Including {len(included_projects)} projects in intent context")
        
        # Create intent directory structure
        intents_dir = nucleus_dir / ".intents" / ".exp"
        intent_dir = intents_dir / intent_dirname
        
        if intent_dir.exists():
            raise FileExistsError(f"Intent directory already exists: {intent_dir}")
        
        # Build directory tree
        if on_progress:
            on_progress("Creating intent directory structure...")
        
        self._create_directory_tree(intent_dir, {
            ".inquiry": {".files": {}},
            ".discovery": {},
            ".findings": {".files": {}},
            ".pipeline": {
                ".inquiry": {".response": {}},
                ".discovery": {}
            }
        })
        
        files_created = []
        
        # =====================================================================
        # 1. CREATE .exp_state.json
        # =====================================================================
        exp_state = {
            "intent_id": intent_id,
            "intent_name": name,
            "slug": slugified_name,
            "type": "exploration",
            "status": "inquiry",
            "created_at": timestamp,
            "updated_at": timestamp,
            "phases": {
                "inquiry": {
                    "status": "pending",
                    "started_at": None,
                    "completed_at": None
                },
                "discovery": {
                    "status": "not_started",
                    "turns": [],
                    "current_turn": 0
                },
                "findings": {
                    "status": "not_started",
                    "exported": False
                }
            },
            "metadata": {
                "description": description or "",
                "projects_included": [p["name"] for p in included_projects]
            }
        }
        
        self._write_json(intent_dir / ".exp_state.json", exp_state)
        files_created.append(".exp_state.json")
        
        # =====================================================================
        # 2. CREATE .inquiry/.inquiry.json
        # =====================================================================
        inquiry_dir = intent_dir / ".inquiry"
        
        inquiry_data = {
            "intent_id": intent_id,
            "intent_name": name,
            "phase": "inquiry",
            "inquiry": inquiry or f"Exploration inquiry for {name}",
            "created_at": timestamp,
            "projects": [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "strategy": p["strategy"],
                    "localPath": p["localPath"]
                }
                for p in included_projects
            ],
            "context": {
                "organization": config.get("organization", {}).get("name", ""),
                "total_projects": len(all_projects),
                "selected_projects": len(included_projects)
            }
        }
        
        self._write_json(inquiry_dir / ".inquiry.json", inquiry_data)
        files_created.append(".inquiry/.inquiry.json")
        
        # =====================================================================
        # 3. CREATE .inquiry/.context_exp_plan.json
        # =====================================================================
        context_exp_plan = {
            "intent_id": intent_id,
            "phase": "inquiry",
            "generated_at": timestamp,
            "projects_context": [
                {
                    "project_name": p["name"],
                    "priority": "high",
                    "files_to_include": [],
                    "reasoning": f"Core project for {name} analysis"
                }
                for p in included_projects
            ],
            "total_files": 0,
            "estimated_tokens": 0,
            "gemini_prioritized": False
        }
        
        self._write_json(inquiry_dir / ".context_exp_plan.json", context_exp_plan)
        files_created.append(".inquiry/.context_exp_plan.json")
        
        # =====================================================================
        # 4. CREATE .inquiry/.files/.expbase.json
        # =====================================================================
        files_dir = inquiry_dir / ".files"
        
        expbase = {
            "intent_id": intent_id,
            "phase": "inquiry",
            "generated_at": timestamp,
            "projects": [p["name"] for p in included_projects],
            "files": [],
            "total_size": 0,
            "compression_ratio": 0.0
        }
        
        self._write_json(files_dir / ".expbase.json", expbase)
        files_created.append(".inquiry/.files/.expbase.json")
        
        # =====================================================================
        # 5. CREATE .inquiry/.files/.expbase_index.json
        # =====================================================================
        expbase_index = {
            "intent_id": intent_id,
            "phase": "inquiry",
            "indexed_at": timestamp,
            "total_files": 0,
            "index": []
        }
        
        self._write_json(files_dir / ".expbase_index.json", expbase_index)
        files_created.append(".inquiry/.files/.expbase_index.json")
        
        # =====================================================================
        # 6. CREATE .findings/.findings.json (template)
        # =====================================================================
        findings_dir = intent_dir / ".findings"
        
        findings = {
            "intent_id": intent_id,
            "intent_name": name,
            "status": "pending",
            "created_at": timestamp,
            "summary": "",
            "key_discoveries": [],
            "recommendations": [],
            "cross_project_insights": []
        }
        
        self._write_json(findings_dir / ".findings.json", findings)
        files_created.append(".findings/.findings.json")
        
        # =====================================================================
        # 7. CREATE README in findings export (for later)
        # =====================================================================
        findings_export_dir = nucleus_dir / "findings" / slugified_name
        findings_export_dir.mkdir(parents=True, exist_ok=True)
        
        readme_content = f"""# {name}

**Intent ID**: {intent_id}
**Created**: {timestamp}
**Status**: In Progress

## Inquiry
{inquiry or 'To be defined'}

## Projects Included
{chr(10).join(f'- {p["name"]}' for p in included_projects)}

## Findings
Results will be exported here once the exploration is complete.
"""
        
        self._write_file(findings_export_dir / "README.md", readme_content)
        files_created.append(f"findings/{slugified_name}/README.md")
        
        if on_progress:
            on_progress("✅ Intent structure created successfully")
        
        return {
            "intent_id": intent_id,
            "intent_name": name,
            "intent_slug": slugified_name,
            "intent_path": str(intent_dir.absolute()),
            "intent_dir": intent_dirname,
            "inquiry": inquiry,
            "description": description,
            "projects_included": [p["name"] for p in included_projects],
            "files_created": files_created,
            "inquiry_file": str((inquiry_dir / ".inquiry.json").absolute()),
            "findings_export_dir": str(findings_export_dir.absolute()),
            "timestamp": timestamp
        }

def add_discovery_turn(
        self,
        intent_id: str,
        notes: Optional[str] = None,
        analysis: Optional[str] = None,
        on_progress: Optional[Callable[[str], None]] = None
    ) -> Dict[str, Any]:
        """
        Add a discovery turn to an exploration intent.
        
        Args:
            intent_id: Intent ID or slug
            notes: Turn notes/observations
            analysis: Analysis summary
            on_progress: Progress callback
            
        Returns:
            Dict with turn creation results
            
        Raises:
            FileNotFoundError: If intent not found
            ValueError: If intent not in discovery phase
        """
        timestamp = datetime.now().isoformat()
        
        if on_progress:
            on_progress(f"Locating intent '{intent_id}'...")
        
        # Find nucleus and intent
        nucleus_dir = self._find_nucleus_dir()
        if not nucleus_dir:
            raise FileNotFoundError("Nucleus directory not found")
        
        intent_dir = self._find_intent_dir(nucleus_dir, intent_id)
        if not intent_dir:
            raise FileNotFoundError(f"Intent '{intent_id}' not found")
        
        # Load intent state
        state_path = intent_dir / ".exp_state.json"
        with open(state_path, 'r', encoding='utf-8') as f:
            state = json.load(f)
        
        # Check if we can add discovery turns
        current_status = state.get("status")
        if current_status == "inquiry":
            # First turn - transition to discovery
            state["status"] = "discovery"
            state["phases"]["inquiry"]["status"] = "completed"
            state["phases"]["inquiry"]["completed_at"] = timestamp
            state["phases"]["discovery"]["status"] = "active"
            state["phases"]["discovery"]["started_at"] = timestamp
            if on_progress:
                on_progress("Transitioning from inquiry to discovery phase...")
        elif current_status != "discovery":
            raise ValueError(f"Cannot add discovery turn: intent is in '{current_status}' phase")
        
        # Determine turn number
        discovery_dir = intent_dir / ".discovery"
        existing_turns = [
            d for d in discovery_dir.iterdir() 
            if d.is_dir() and d.name.startswith(".turn_")
        ]
        turn_number = len(existing_turns) + 1
        turn_dirname = f".turn_{turn_number}"
        
        if on_progress:
            on_progress(f"Creating discovery turn {turn_number}...")
        
        # Create turn directory
        turn_dir = discovery_dir / turn_dirname
        self._create_directory_tree(turn_dir, {
            ".files": {}
        })
        
        files_created = []
        
        # =====================================================================
        # 1. CREATE .turn.json
        # =====================================================================
        turn_data = {
            "intent_id": state["intent_id"],
            "intent_name": state["intent_name"],
            "turn_number": turn_number,
            "phase": "discovery",
            "created_at": timestamp,
            "notes": notes or "",
            "analysis": analysis or "",
            "previous_turn": turn_number - 1 if turn_number > 1 else None
        }
        
        self._write_json(turn_dir / ".turn.json", turn_data)
        files_created.append(f".discovery/{turn_dirname}/.turn.json")
        
        # =====================================================================
        # 2. CREATE .context_exp_plan.json
        # =====================================================================
        context_plan = {
            "intent_id": state["intent_id"],
            "phase": "discovery",
            "turn": turn_number,
            "generated_at": timestamp,
            "projects_context": [],
            "total_files": 0,
            "estimated_tokens": 0,
            "gemini_prioritized": False
        }
        
        self._write_json(turn_dir / ".context_exp_plan.json", context_plan)
        files_created.append(f".discovery/{turn_dirname}/.context_exp_plan.json")
        
        # =====================================================================
        # 3. CREATE .files/.expbase.json
        # =====================================================================
        files_dir = turn_dir / ".files"
        
        expbase = {
            "intent_id": state["intent_id"],
            "phase": "discovery",
            "turn": turn_number,
            "generated_at": timestamp,
            "files": [],
            "total_size": 0,
            "compression_ratio": 0.0
        }
        
        self._write_json(files_dir / ".expbase.json", expbase)
        files_created.append(f".discovery/{turn_dirname}/.files/.expbase.json")
        
        # =====================================================================
        # 4. CREATE .files/.expbase_index.json
        # =====================================================================
        expbase_index = {
            "intent_id": state["intent_id"],
            "phase": "discovery",
            "turn": turn_number,
            "indexed_at": timestamp,
            "total_files": 0,
            "index": []
        }
        
        self._write_json(files_dir / ".expbase_index.json", expbase_index)
        files_created.append(f".discovery/{turn_dirname}/.files/.expbase_index.json")
        
        # =====================================================================
        # 5. CREATE PIPELINE DIRECTORY
        # =====================================================================
        pipeline_dir = intent_dir / ".pipeline" / ".discovery" / turn_dirname
        self._create_directory_tree(pipeline_dir, {
            ".response": {}
        })
        
        # Pipeline placeholder files
        self._write_json(pipeline_dir / ".payload.json", {
            "turn": turn_number,
            "created_at": timestamp,
            "status": "pending"
        })
        files_created.append(f".pipeline/.discovery/{turn_dirname}/.payload.json")
        
        self._write_json(pipeline_dir / ".index.json", {
            "turn": turn_number,
            "indexed_at": timestamp,
            "entries": []
        })
        files_created.append(f".pipeline/.discovery/{turn_dirname}/.index.json")
        
        # =====================================================================
        # 6. UPDATE STATE
        # =====================================================================
        state["phases"]["discovery"]["turns"].append({
            "turn": turn_number,
            "created_at": timestamp,
            "status": "active"
        })
        state["phases"]["discovery"]["current_turn"] = turn_number
        state["updated_at"] = timestamp
        
        self._write_json(state_path, state)
        
        if on_progress:
            on_progress(f"✅ Turn {turn_number} created successfully")
        
        return {
            "intent_id": state["intent_id"],
            "intent_name": state["intent_name"],
            "turn_number": turn_number,
            "turn_path": str(turn_dir.absolute()),
            "turn_file": str((turn_dir / ".turn.json").absolute()),
            "notes": notes,
            "analysis": analysis,
            "previous_turns": turn_number - 1,
            "files_created": files_created,
            "timestamp": timestamp
        }

    def export_findings(
        self,
        intent_id: str,
        export_format: str = "markdown",
        include_raw: bool = False,
        on_progress: Optional[Callable[[str], None]] = None
    ) -> Dict[str, Any]:
        """
        Export findings from an exploration intent.
        
        Args:
            intent_id: Intent ID or slug
            export_format: Export format (markdown, json, pdf)
            include_raw: Include raw turn data
            on_progress: Progress callback
            
        Returns:
            Dict with export results
            
        Raises:
            FileNotFoundError: If intent not found
        """
        timestamp = datetime.now().isoformat()
        
        if on_progress:
            on_progress(f"Locating intent '{intent_id}'...")
        
        # Find nucleus and intent
        nucleus_dir = self._find_nucleus_dir()
        if not nucleus_dir:
            raise FileNotFoundError("Nucleus directory not found")
        
        intent_dir = self._find_intent_dir(nucleus_dir, intent_id)
        if not intent_dir:
            raise FileNotFoundError(f"Intent '{intent_id}' not found")
        
        # Load intent state
        state_path = intent_dir / ".exp_state.json"
        with open(state_path, 'r', encoding='utf-8') as f:
            state = json.load(f)
        
        intent_name = state["intent_name"]
        intent_slug = state["slug"]
        
        if on_progress:
            on_progress(f"Loading findings for '{intent_name}'...")
        
        # Load inquiry
        inquiry_path = intent_dir / ".inquiry" / ".inquiry.json"
        with open(inquiry_path, 'r', encoding='utf-8') as f:
            inquiry_data = json.load(f)
        
        # Load discovery turns
        discovery_dir = intent_dir / ".discovery"
        turns = []
        
        if discovery_dir.exists():
            turn_dirs = sorted(
                [d for d in discovery_dir.iterdir() if d.is_dir() and d.name.startswith(".turn_")],
                key=lambda x: int(x.name.split("_")[1])
            )
            
            for turn_dir in turn_dirs:
                turn_file = turn_dir / ".turn.json"
                if turn_file.exists():
                    with open(turn_file, 'r', encoding='utf-8') as f:
                        turn_data = json.load(f)
                    turns.append(turn_data)
        
        # Load findings
        findings_path = intent_dir / ".findings" / ".findings.json"
        with open(findings_path, 'r', encoding='utf-8') as f:
            findings_data = json.load(f)
        
        if on_progress:
            on_progress(f"Generating export files ({export_format})...")
        
        # Create export directory
        export_dir = nucleus_dir / "findings" / intent_slug
        export_dir.mkdir(parents=True, exist_ok=True)
        
        exported_files = []
        
        # =====================================================================
        # 1. EXPORT JSON DATA
        # =====================================================================
        export_data = {
            "intent_id": state["intent_id"],
            "intent_name": intent_name,
            "inquiry": inquiry_data.get("inquiry"),
            "created_at": state["created_at"],
            "exported_at": timestamp,
            "total_turns": len(turns),
            "projects": inquiry_data.get("projects", []),
            "key_discoveries": findings_data.get("key_discoveries", []),
            "recommendations": findings_data.get("recommendations", []),
            "cross_project_insights": findings_data.get("cross_project_insights", []),
            "summary": findings_data.get("summary", "")
        }
        
        if include_raw:
            export_data["raw_turns"] = turns
        
        json_path = export_dir / "data.json"
        self._write_json(json_path, export_data)
        
        json_size = json_path.stat().st_size
        exported_files.append({
            "name": "data.json",
            "path": str(json_path),
            "size": f"{json_size / 1024:.1f} KB"
        })
        
        # =====================================================================
        # 2. EXPORT MARKDOWN REPORT
        # =====================================================================
        if export_format in ["markdown", "pdf"]:
            markdown_content = self._generate_markdown_report(
                intent_name,
                inquiry_data,
                turns,
                findings_data,
                timestamp
            )
            
            md_path = export_dir / "report.md"
            self._write_file(md_path, markdown_content)
            
            md_size = md_path.stat().st_size
            exported_files.append({
                "name": "report.md",
                "path": str(md_path),
                "size": f"{md_size / 1024:.1f} KB"
            })
        
        # =====================================================================
        # 3. EXPORT PDF (if requested and markdown-to-pdf available)
        # =====================================================================
        if export_format == "pdf":
            if on_progress:
                on_progress("PDF export would require external library (markdown2pdf)")
            # TODO: Implement PDF generation with markdown2pdf or weasyprint
            # pdf_path = export_dir / "report.pdf"
            # exported_files.append({"name": "report.pdf", ...})
        
        # =====================================================================
        # 4. UPDATE FINDINGS STATE
        # =====================================================================
        state["phases"]["findings"]["status"] = "completed"
        state["phases"]["findings"]["exported"] = True
        state["phases"]["findings"]["exported_at"] = timestamp
        state["status"] = "completed"
        state["updated_at"] = timestamp
        
        self._write_json(state_path, state)
        
        findings_data["status"] = "exported"
        findings_data["exported_at"] = timestamp
        self._write_json(findings_path, findings_data)
        
        if on_progress:
            on_progress("✅ Findings exported successfully")
        
        return {
            "intent_id": state["intent_id"],
            "intent_name": intent_name,
            "export_dir": str(export_dir.absolute()),
            "export_format": export_format,
            "total_turns": len(turns),
            "exported_files": exported_files,
            "key_discoveries": findings_data.get("key_discoveries", []),
            "timestamp": timestamp
        }
    
    # =========================================================================
    # HELPER METHODS FOR EXPLORATION INTENTS
    # =========================================================================
    
    def _find_intent_dir(self, nucleus_dir: Path, intent_id: str) -> Optional[Path]:
        """Find intent directory by ID or slug."""
        intents_dir = nucleus_dir / ".intents" / ".exp"
        
        if not intents_dir.exists():
            return None
        
        # Try exact match first
        for item in intents_dir.iterdir():
            if item.is_dir():
                # Match by full dirname or by ID/slug
                if intent_id in item.name:
                    return item
        
        return None
    
    def _generate_markdown_report(
        self,
        intent_name: str,
        inquiry_data: Dict[str, Any],
        turns: List[Dict[str, Any]],
        findings_data: Dict[str, Any],
        timestamp: str
    ) -> str:
        """Generate markdown report from findings."""
        
        # Header
        md = f"# {intent_name}\n\n"
        md += f"**Exported**: {timestamp}\n\n"
        md += "---\n\n"
        
        # Inquiry
        md += "## 🎯 Inquiry\n\n"
        md += f"{inquiry_data.get('inquiry', 'N/A')}\n\n"
        
        # Projects
        projects = inquiry_data.get('projects', [])
        if projects:
            md += "## 📦 Projects Analyzed\n\n"
            for proj in projects:
                md += f"- **{proj['name']}** ({proj['strategy']})\n"
            md += "\n"
        
        # Discovery Process
        if turns:
            md += f"## 🔍 Discovery Process ({len(turns)} turns)\n\n"
            for turn in turns:
                md += f"### Turn {turn['turn_number']}\n\n"
                if turn.get('notes'):
                    md += f"**Notes**: {turn['notes']}\n\n"
                if turn.get('analysis'):
                    md += f"**Analysis**: {turn['analysis']}\n\n"
        
        # Key Discoveries
        discoveries = findings_data.get('key_discoveries', [])
        if discoveries:
            md += "## 💡 Key Discoveries\n\n"
            for i, discovery in enumerate(discoveries, 1):
                md += f"{i}. {discovery}\n"
            md += "\n"
        
        # Recommendations
        recommendations = findings_data.get('recommendations', [])
        if recommendations:
            md += "## 🎯 Recommendations\n\n"
            for i, rec in enumerate(recommendations, 1):
                md += f"{i}. {rec}\n"
            md += "\n"
        
        # Cross-Project Insights
        insights = findings_data.get('cross_project_insights', [])
        if insights:
            md += "## 🔗 Cross-Project Insights\n\n"
            for insight in insights:
                md += f"- {insight}\n"
            md += "\n"
        
        # Summary
        summary = findings_data.get('summary', '')
        if summary:
            md += "## 📋 Summary\n\n"
            md += f"{summary}\n\n"
        
        md += "---\n\n"
        md += "*Generated by Bloom Nucleus Exploration System*\n"
        
        return md        