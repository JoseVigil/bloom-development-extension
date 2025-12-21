"""
Nucleus Inspector - Core logic for reading and analyzing nucleus metadata.

Path: brain/core/nucleus_inspector.py
Action: CREATE NEW FILE
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional, List


class NucleusInspector:
    """
    Inspects Nucleus projects and extracts comprehensive metadata.
    Pure business logic without CLI dependencies.
    """
    
    def __init__(self, root_path: Path):
        """
        Initialize the inspector.
        
        Args:
            root_path: Root directory where nucleus might exist
        """
        self.root_path = Path(root_path).resolve()
        self.nucleus_dir = self._find_nucleus_dir()
    
    def _find_nucleus_dir(self) -> Optional[Path]:
        """
        Find the nucleus directory in the given root path.
        
        Returns:
            Path to nucleus directory or None if not found
        """
        bloom_dir = self.root_path / ".bloom"
        if not bloom_dir.exists():
            return None
        
        # Look for .nucleus-* directories
        for item in bloom_dir.iterdir():
            if item.is_dir() and item.name.startswith(".nucleus-"):
                return item
        
        return None
    
    def get_comprehensive_info(self) -> Dict[str, Any]:
        """
        Get comprehensive nucleus information.
        
        Returns:
            Dictionary with all nucleus metadata
            
        Raises:
            FileNotFoundError: If nucleus directory or config not found
            ValueError: If config is invalid
        """
        if not self.nucleus_dir:
            raise FileNotFoundError(
                f"No nucleus directory found in {self.root_path}/.bloom/"
            )
        
        config_path = self.nucleus_dir / ".core" / "nucleus-config.json"
        
        if not config_path.exists():
            raise FileNotFoundError(
                f"Nucleus config not found at {config_path}"
            )
        
        # Load and validate config
        with open(config_path, 'r', encoding='utf-8') as f:
            config = json.load(f)
        
        if config.get("type") != "nucleus":
            raise ValueError("Invalid nucleus config: type must be 'nucleus'")
        
        # Extract all relevant information
        return {
            "id": config.get("id"),
            "version": config.get("version"),
            "organization": config.get("organization", {}),
            "nucleus": config.get("nucleus", {}),
            "projects": config.get("projects", []),
            "relations": config.get("relations", []),
            "features": config.get("features", {}),
            "metadata": config.get("metadata", {}),
            "nucleus_path": str(self.nucleus_dir),
            "config_path": str(config_path)
        }
    
    def get_projects_list(self, filter_strategy: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get list of projects in the nucleus with optional filtering.
        
        Args:
            filter_strategy: Optional strategy to filter by (e.g., 'python', 'typescript')
            
        Returns:
            List of project dictionaries
            
        Raises:
            FileNotFoundError: If nucleus not found
        """
        info = self.get_comprehensive_info()
        projects = info.get("projects", [])
        
        if filter_strategy:
            projects = [
                p for p in projects 
                if p.get("strategy") == filter_strategy
            ]
        
        return projects
    
    def get_project_info(self, project_name: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific project.
        
        Args:
            project_name: Name of the project
            
        Returns:
            Project information dictionary
            
        Raises:
            FileNotFoundError: If nucleus or project not found
            ValueError: If project name not found in nucleus
        """
        info = self.get_comprehensive_info()
        projects = info.get("projects", [])
        
        # Find project by name
        project = next(
            (p for p in projects if p.get("name") == project_name),
            None
        )
        
        if not project:
            available = [p.get("name") for p in projects]
            raise ValueError(
                f"Project '{project_name}' not found in nucleus. "
                f"Available projects: {', '.join(available)}"
            )
        
        # Enhance with filesystem info if project exists
        project_path = Path(project.get("absolutePath", ""))
        
        if project_path.exists():
            project["filesystem"] = {
                "exists": True,
                "is_directory": project_path.is_dir(),
                "has_bloom": (project_path / ".bloom").exists(),
                "has_git": (project_path / ".git").exists()
            }
            
            # Try to read project's own bloom config if it exists
            bloom_project_meta = project_path / ".bloom" / ".project" / ".project.meta.json"
            if bloom_project_meta.exists():
                try:
                    with open(bloom_project_meta, 'r', encoding='utf-8') as f:
                        project["bloom_metadata"] = json.load(f)
                except Exception:
                    project["bloom_metadata"] = None
        else:
            project["filesystem"] = {
                "exists": False,
                "note": "Project path does not exist on filesystem"
            }
        
        return project
    
    def get_statistics(self) -> Dict[str, Any]:
        """
        Get nucleus statistics.
        
        Returns:
            Statistics dictionary
            
        Raises:
            FileNotFoundError: If nucleus not found
        """
        info = self.get_comprehensive_info()
        nucleus = info.get("nucleus", {})
        
        return nucleus.get("statistics", {})
    
    def get_intents_list(self) -> List[Dict[str, Any]]:
        """
        Get list of exploration intents in the nucleus.
        
        Returns:
            List of intent summaries
            
        Raises:
            FileNotFoundError: If nucleus not found
        """
        if not self.nucleus_dir:
            raise FileNotFoundError("Nucleus directory not found")
        
        intents_dir = self.nucleus_dir / ".intents" / ".exp"
        
        if not intents_dir.exists():
            return []
        
        intents = []
        
        for intent_dir in intents_dir.iterdir():
            if not intent_dir.is_dir() or not intent_dir.name.startswith("."):
                continue
            
            state_file = intent_dir / ".exp_state.json"
            if not state_file.exists():
                continue
            
            try:
                with open(state_file, 'r', encoding='utf-8') as f:
                    state = json.load(f)
                
                # Extract summary info
                intents.append({
                    "intent_id": state.get("intent_id"),
                    "intent_name": state.get("intent_name"),
                    "slug": state.get("slug"),
                    "status": state.get("status"),
                    "created_at": state.get("created_at"),
                    "updated_at": state.get("updated_at"),
                    "current_phase": state.get("status"),
                    "discovery_turns": len(state.get("phases", {}).get("discovery", {}).get("turns", [])),
                    "projects_included": state.get("metadata", {}).get("projects_included", [])
                })
            except Exception:
                # Skip invalid intent directories
                continue
        
        return sorted(intents, key=lambda x: x.get("created_at", ""), reverse=True)
    
    def validate_structure(self) -> Dict[str, Any]:
        """
        Validate nucleus directory structure integrity.
        
        Returns:
            Validation results with missing/present directories
            
        Raises:
            FileNotFoundError: If nucleus not found
        """
        if not self.nucleus_dir:
            raise FileNotFoundError("Nucleus directory not found")
        
        expected_structure = {
            ".core": True,
            ".governance": True,
            ".governance/architecture": True,
            ".governance/security": True,
            ".governance/quality": True,
            ".intents": True,
            ".intents/.exp": True,
            ".cache": True,
            ".relations": True,
            "findings": True,
            "reports": True
        }
        
        validation = {
            "valid": True,
            "present": [],
            "missing": []
        }
        
        for path_str, required in expected_structure.items():
            full_path = self.nucleus_dir / path_str
            exists = full_path.exists()
            
            if exists:
                validation["present"].append(path_str)
            else:
                validation["missing"].append(path_str)
                if required:
                    validation["valid"] = False
        
        return validation