"""
Bloom Project Inspector - Core logic for reading individual project metadata.

Path: brain/core/bloom_project_inspector.py
Action: CREATE NEW FILE
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional, List


class BloomProjectInspector:
    """
    Inspects individual Bloom projects (.bloom/.project/) and extracts metadata.
    Pure business logic without CLI dependencies.
    """
    
    def __init__(self, project_root: Path):
        """
        Initialize the inspector.
        
        Args:
            project_root: Root directory of the project
        """
        self.project_root = Path(project_root).resolve()
        self.bloom_dir = self.project_root / ".bloom"
        self.project_dir = self.bloom_dir / ".project"
    
    def get_project_info(self) -> Dict[str, Any]:
        """
        Get comprehensive project information.
        
        Returns:
            Dictionary with project metadata
            
        Raises:
            FileNotFoundError: If .bloom/.project/ directory not found
            ValueError: If metadata is invalid
        """
        if not self.bloom_dir.exists():
            raise FileNotFoundError(
                f"No .bloom directory found at {self.project_root}"
            )
        
        if not self.project_dir.exists():
            raise FileNotFoundError(
                f"No .bloom/.project directory found at {self.project_root}"
            )
        
        # Load project metadata
        meta_path = self.project_dir / ".project.meta.json"
        
        if not meta_path.exists():
            raise FileNotFoundError(
                f"Project metadata not found at {meta_path}"
            )
        
        with open(meta_path, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
        
        # Build comprehensive info
        info = {
            "name": self.project_root.name,
            "path": str(self.project_root),
            "bloom_path": str(self.bloom_dir),
            "project_path": str(self.project_dir),
            "metadata": metadata,
            "strategy": metadata.get("strategy", "unknown"),
            "version": metadata.get("version", "unknown")
        }
        
        # Add strategy-specific info
        strategy = metadata.get("strategy", "")
        info["strategy_info"] = self._get_strategy_info(strategy)
        
        # Validate structure
        info["structure_validation"] = self.validate_structure()
        
        return info
    
    def _get_strategy_info(self, strategy: str) -> Dict[str, Any]:
        """
        Get strategy-specific file information.
        
        Args:
            strategy: Project strategy type
            
        Returns:
            Dictionary with strategy files info
        """
        strategy_info = {
            "type": strategy,
            "context_file": None,
            "standards_file": None
        }
        
        # Check for strategy-specific files
        context_file = self.project_dir / f".{strategy}.strategy.context.bl"
        standards_file = self.project_dir / f".{strategy}.strategy.standards.bl"
        
        if context_file.exists():
            strategy_info["context_file"] = str(context_file.name)
            strategy_info["context_size"] = context_file.stat().st_size
        
        if standards_file.exists():
            strategy_info["standards_file"] = str(standards_file.name)
            strategy_info["standards_size"] = standards_file.stat().st_size
        
        return strategy_info
    
    def get_intents_list(self) -> List[Dict[str, Any]]:
        """
        Get list of intents in the project.
        
        Returns:
            List of intent summaries from both .dev and .doc
        """
        intents = []
        intents_dir = self.bloom_dir / ".intents"
        
        if not intents_dir.exists():
            return intents
        
        # Check .dev intents
        dev_dir = intents_dir / ".dev"
        if dev_dir.exists():
            intents.extend(self._scan_intents(dev_dir, "dev"))
        
        # Check .doc intents
        doc_dir = intents_dir / ".doc"
        if doc_dir.exists():
            intents.extend(self._scan_intents(doc_dir, "doc"))
        
        return sorted(intents, key=lambda x: x.get("created_at", ""), reverse=True)
    
    def _scan_intents(self, intents_dir: Path, intent_type: str) -> List[Dict[str, Any]]:
        """
        Scan a specific intent type directory.
        
        Args:
            intents_dir: Directory containing intents
            intent_type: Type of intent ('dev' or 'doc')
            
        Returns:
            List of intent summaries
        """
        intents = []
        state_file_name = f".{intent_type}_state.json"
        
        for intent_dir in intents_dir.iterdir():
            if not intent_dir.is_dir() or not intent_dir.name.startswith("."):
                continue
            
            state_file = intent_dir / state_file_name
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
                    "type": intent_type,
                    "status": state.get("status"),
                    "created_at": state.get("created_at"),
                    "updated_at": state.get("updated_at")
                })
            except Exception:
                # Skip invalid intent directories
                continue
        
        return intents
    
    def get_tree_structure(self) -> str:
        """
        Get a simple tree representation of the .bloom directory.
        
        Returns:
            String with tree structure
        """
        if not self.bloom_dir.exists():
            return "No .bloom directory found"
        
        lines = [".bloom/"]
        self._build_tree_recursive(self.bloom_dir, lines, "", max_depth=3)
        
        return "\n".join(lines)
    
    def _build_tree_recursive(
        self,
        directory: Path,
        lines: List[str],
        prefix: str,
        max_depth: int,
        current_depth: int = 0
    ):
        """
        Recursively build tree structure.
        
        Args:
            directory: Current directory
            lines: List to append tree lines to
            prefix: Current line prefix
            max_depth: Maximum recursion depth
            current_depth: Current recursion level
        """
        if current_depth >= max_depth:
            return
        
        try:
            items = sorted(directory.iterdir(), key=lambda x: (not x.is_dir(), x.name))
        except PermissionError:
            return
        
        for i, item in enumerate(items):
            is_last = i == len(items) - 1
            current_prefix = "└── " if is_last else "├── "
            next_prefix = "    " if is_last else "│   "
            
            item_name = item.name
            if item.is_dir():
                item_name += "/"
            
            lines.append(f"{prefix}{current_prefix}{item_name}")
            
            if item.is_dir():
                self._build_tree_recursive(
                    item,
                    lines,
                    prefix + next_prefix,
                    max_depth,
                    current_depth + 1
                )
    
    def validate_structure(self) -> Dict[str, Any]:
        """
        Validate project directory structure.
        
        Returns:
            Validation results
        """
        expected_dirs = {
            ".core": False,  # Optional
            ".project": True,  # Required
            ".intents": False  # Optional
        }
        
        validation = {
            "valid": True,
            "present": [],
            "missing": []
        }
        
        for dir_name, required in expected_dirs.items():
            dir_path = self.bloom_dir / dir_name
            exists = dir_path.exists()
            
            if exists:
                validation["present"].append(dir_name)
            else:
                validation["missing"].append(dir_name)
                if required:
                    validation["valid"] = False
        
        return validation