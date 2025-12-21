"""
Nucleus Manager V2.0 - Meta-Sistema de Gobernanza y Descubrimiento
ENHANCED VERSION - Solo los métodos modificados/agregados
"""

# ============================================================================
# AGREGAR ESTOS MÉTODOS A LA CLASE NucleusManager EXISTENTE
# ============================================================================

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
    
    REEMPLAZA el método _create_nucleus_config() original
    """
    
    # Calculate project statistics
    strategies_count = {}
    for proj in projects:
        strategy = proj.get("strategy", "generic")
        strategies_count[strategy] = strategies_count.get(strategy, 0) + 1
    
    config = {
        "type": "nucleus",
        "version": "2.0",
        "id": str(uuid4()),
        
        # Organization metadata
        "organization": {
            "name": org_name,
            "url": org_url,
            "slug": self._slugify(org_name)
        },
        
        # Enhanced nucleus information
        "nucleus": {
            "name": nucleus_name,
            "createdAt": timestamp,
            "lastUpdatedAt": timestamp,
            
            # Physical location
            "path": str(nucleus_dir.absolute()),
            "rootPath": str(self.root_path.absolute()),
            
            # Structure metadata
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
            
            # Operational status
            "status": {
                "initialized": True,
                "syncStatus": "synced",
                "lastSync": timestamp,
                "healthStatus": "healthy"
            },
            
            # Statistics
            "statistics": {
                "totalProjects": len(projects),
                "activeProjects": len([p for p in projects if p.get("status") == "active"]),
                "totalIntents": 0,
                "totalFindings": 0,
                "strategiesDistribution": strategies_count
            }
        },
        
        # Detailed project configurations
        "projects": [],
        
        # Relations mapping
        "relations": [],
        
        # Feature flags
        "features": {
            "explorationIntents": True,
            "crossProjectAnalysis": True,
            "semanticIndexing": True,
            "governanceEnforcement": True,
            "githubIntegration": bool(org_url)
        },
        
        # Metadata for tooling
        "metadata": {
            "configVersion": "2.0.0",
            "generatedBy": "NucleusManager",
            "compatibleCliVersion": ">=2.0.0",
            "lastModifiedBy": "create_command",
            "tags": ["governance", "discovery", "meta-system"]
        }
    }
    
    # Add detailed project configurations
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
    
    MÉTODO NUEVO - Agregar a la clase
    """
    import hashlib
    
    # Sort by name for consistent ordering
    sorted_names = sorted([p["name"] for p in projects])
    checksum_input = "|".join(sorted_names)
    
    return hashlib.md5(checksum_input.encode()).hexdigest()


# ============================================================================
# MODIFICAR EL MÉTODO create() - LÍNEAS A CAMBIAR
# ============================================================================

def create(self, ...):
    """
    BUSCAR estas líneas en el método create() existente:
    
    # LÍNEA ~103 - CAMBIAR DE:
    nucleus_config = self._create_nucleus_config(
        organization_name,
        repo_url or organization_url,
        nucleus_name,
        projects
    )
    
    # A:
    nucleus_config = self._create_enhanced_nucleus_config(
        organization_name,
        repo_url or organization_url,
        nucleus_name,
        nucleus_dir,
        projects,
        timestamp
    )
    
    
    # LÍNEA ~170 - CAMBIAR DE:
    self._write_json(cache_dir / ".projects-snapshot.json", {
        "generated_at": timestamp,
        "projects": projects
    })
    
    # A:
    self._write_json(cache_dir / ".projects-snapshot.json", {
        "scanned_at": timestamp,
        "project_names": [p["name"] for p in projects],
        "checksum": self._calculate_projects_checksum(projects)
    })
    """
    pass