"""
Intent management core logic - Pure business logic layer.
Handles intent lifecycle operations without CLI dependencies.
"""

import uuid
import json
import re
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone


class IntentManager:
    """
    Manager for intent lifecycle operations in Bloom projects.
    
    This class provides pure business logic for creating, managing,
    and tracking intents (both development and documentation types).
    """
    
    # Namespace UUID for generating deterministic intent IDs
    INTENT_NAMESPACE = uuid.UUID('6ba7b810-9dad-11d1-80b4-00c04fd430c8')
    
    def __init__(self):
        """Initialize the IntentManager."""
        pass
    
    def create_intent(
        self,
        intent_type: str,
        name: str,
        initial_files: Optional[List[str]] = None,
        nucleus_path: Optional[Path] = None
    ) -> Dict[str, Any]:
        """
        Create a new intent with complete directory structure.
        
        This is the first step (CREATE/Genesis) in the Intent lifecycle.
        Creates all necessary directories and the initial state file.
        
        Args:
            intent_type: Type of intent - "dev" or "doc"
            name: Human-readable name for the intent
            initial_files: Optional list of file paths to include in initial context
            nucleus_path: Optional explicit path to Bloom project root
            
        Returns:
            Dictionary containing:
                - intent_id: Generated UUID3 for the intent
                - intent_path: Absolute path to intent directory
                - folder_name: Folder name (.{slugified-name}-{uuid3})
                - name: Intent name
                - type: Intent type
                - initial_files: List of initial files (empty if none)
                - project_path: Bloom project root path
                - created_at: ISO timestamp
                - message: Success message
                
        Raises:
            ValueError: If intent_type is invalid or name is empty
            FileNotFoundError: If Bloom project not found or initial files don't exist
        """
        # Validate inputs
        if intent_type not in ["dev", "doc"]:
            raise ValueError(f"Invalid intent type: {intent_type}")
        
        if not name or not name.strip():
            raise ValueError("Intent name cannot be empty")
        
        # Find or validate Bloom project
        project_root = self._find_bloom_project(nucleus_path)
        
        # Validate and normalize initial files
        validated_files = []
        if initial_files:
            validated_files = self._validate_initial_files(initial_files, project_root)
        
        # Generate deterministic UUID3 based on intent name
        intent_id = str(uuid.uuid3(self.INTENT_NAMESPACE, name.strip()))
        
        # Generate slugified name for folder
        slug = self._slugify(name)
        folder_name = f".{slug}-{intent_id[:8]}"
        
        # Create directory structure
        intent_path = self._create_directory_structure(
            project_root,
            intent_type,
            folder_name
        )
        
        # Create initial state file
        timestamp = datetime.now(timezone.utc).isoformat()
        state_data = self._create_initial_state(
            intent_id,
            intent_type,
            name,
            timestamp,
            validated_files
        )
        
        state_file = intent_path / (
            ".dev_state.json" if intent_type == "dev" else ".doc_state.json"
        )
        
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
        
        # Return structured result
        return {
            "intent_id": intent_id,
            "intent_path": str(intent_path),
            "folder_name": folder_name,
            "name": name,
            "type": intent_type,
            "initial_files": validated_files,
            "project_path": str(project_root),
            "created_at": timestamp,
            "message": f"Intent '{name}' ({intent_type}) created successfully"
        }
    
    def _slugify(self, text: str) -> str:
        """
        Convert text to slug format for folder names.
        
        Args:
            text: Text to slugify
            
        Returns:
            Slugified text (lowercase, hyphens, alphanumeric only)
        """
        # Convert to lowercase
        text = text.lower()
        # Replace spaces and underscores with hyphens
        text = re.sub(r'[\s_]+', '-', text)
        # Remove non-alphanumeric characters (except hyphens)
        text = re.sub(r'[^a-z0-9-]', '', text)
        # Remove multiple consecutive hyphens
        text = re.sub(r'-+', '-', text)
        # Remove leading/trailing hyphens
        text = text.strip('-')
        # Limit length
        if len(text) > 50:
            text = text[:50].rstrip('-')
        
        return text if text else "unnamed"
    
    def _find_bloom_project(self, explicit_path: Optional[Path] = None) -> Path:
        """
        Find the Bloom project root by looking for .bloom directory.
        
        Args:
            explicit_path: Optional explicit path to check first
            
        Returns:
            Path to Bloom project root
            
        Raises:
            FileNotFoundError: If no valid Bloom project found
        """
        if explicit_path:
            bloom_dir = explicit_path / ".bloom"
            if bloom_dir.exists() and bloom_dir.is_dir():
                return explicit_path.resolve()
            raise FileNotFoundError(
                f"No valid Bloom project found at {explicit_path}"
            )
        
        # Search upward from current directory
        current = Path.cwd()
        while current != current.parent:
            bloom_dir = current / ".bloom"
            if bloom_dir.exists() and bloom_dir.is_dir():
                return current.resolve()
            current = current.parent
        
        raise FileNotFoundError(
            "No Bloom project found. Please run this command from within a Bloom project "
            "or specify --nucleus-path"
        )
    
    def _validate_initial_files(
        self,
        file_paths: List[str],
        project_root: Path
    ) -> List[str]:
        """
        Validate that initial files exist and convert to relative paths.
        
        Args:
            file_paths: List of file paths (can be absolute or relative)
            project_root: Bloom project root for relativization
            
        Returns:
            List of validated relative paths
            
        Raises:
            FileNotFoundError: If any file doesn't exist
        """
        validated = []
        
        for file_str in file_paths:
            file_path = Path(file_str)
            
            # Try as absolute path first
            if file_path.is_absolute():
                if not file_path.exists():
                    raise FileNotFoundError(f"File not found: {file_path}")
                # Convert to relative from project root
                try:
                    relative = file_path.relative_to(project_root)
                    validated.append(str(relative))
                except ValueError:
                    # File is outside project, use absolute
                    validated.append(str(file_path))
            else:
                # Try relative to project root
                full_path = project_root / file_path
                if not full_path.exists():
                    # Try relative to cwd
                    cwd_path = Path.cwd() / file_path
                    if not cwd_path.exists():
                        raise FileNotFoundError(f"File not found: {file_str}")
                    # Convert cwd-relative to project-relative
                    try:
                        relative = cwd_path.relative_to(project_root)
                        validated.append(str(relative))
                    except ValueError:
                        validated.append(str(cwd_path))
                else:
                    validated.append(str(file_path))
        
        return validated
    
    def _create_directory_structure(
        self,
        project_root: Path,
        intent_type: str,
        folder_name: str
    ) -> Path:
        """
        Create the complete directory structure for an intent.
        
        Args:
            project_root: Bloom project root
            intent_type: "dev" or "doc"
            folder_name: Folder name (.{slug}-{uuid3})
            
        Returns:
            Path to the created intent directory
        """
        intents_base = project_root / ".bloom" / ".intents"
        intents_base.mkdir(parents=True, exist_ok=True)
        
        type_dir = intents_base / f".{intent_type}"
        type_dir.mkdir(exist_ok=True)
        
        intent_dir = type_dir / folder_name
        intent_dir.mkdir(parents=True, exist_ok=True)
        
        if intent_type == "dev":
            # Development intent structure
            subdirs = [
                ".briefing",
                ".briefing/.files",
                ".execution",
                ".execution/.files",
                ".refinement",
                ".pipeline",
                ".pipeline/.briefing",
                ".pipeline/.briefing/.response",
                ".pipeline/.briefing/.response/.staging",
                ".pipeline/.execution",
                ".pipeline/.execution/.response",
                ".pipeline/.execution/.response/.staging",
                ".pipeline/.refinement"
            ]
        else:
            # Documentation intent structure
            subdirs = [
                ".context",
                ".context/.files",
                ".curation",
                ".pipeline",
                ".pipeline/.context",
                ".pipeline/.context/.response",
                ".pipeline/.context/.response/.staging",
                ".pipeline/.curation"
            ]
        
        for subdir in subdirs:
            (intent_dir / subdir).mkdir(parents=True, exist_ok=True)
        
        return intent_dir
    
    def _create_initial_state(
        self,
        intent_id: str,
        intent_type: str,
        name: str,
        timestamp: str,
        initial_files: List[str]
    ) -> Dict[str, Any]:
        """
        Create the initial state data structure.
        
        Args:
            intent_id: UUID3 of the intent
            intent_type: "dev" or "doc"
            name: Human-readable name
            timestamp: ISO timestamp
            initial_files: List of validated file paths
            
        Returns:
            Dictionary with initial state structure
        """
        if intent_type == "dev":
            return {
                "status": "created",
                "name": name,
                "type": "dev",
                "uuid": intent_id,
                "created_at": timestamp,
                "initial_files": initial_files,
                "steps": {
                    "create": True,
                    "hydrate": False,
                    "plan": False,
                    "build": False,
                    "submit": False,
                    "merge": False
                }
            }
        else:
            return {
                "status": "created",
                "name": name,
                "type": "doc",
                "uuid": intent_id,
                "created_at": timestamp,
                "initial_files": initial_files,
                "steps": {
                    "create": True,
                    "hydrate": False,
                    "curate": False,
                    "publish": False
                }
            }

    def update_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        new_name: Optional[str] = None,
        replace_files: Optional[List[str]] = None,
        add_files: Optional[List[str]] = None,
        remove_files: Optional[List[str]] = None,
        nucleus_path: Optional[Path] = None,
        # Extended fields for future use:
        user_input: Optional[str] = None,
        api_config: Optional[Dict[str, Any]] = None,
        profile_settings: Optional[Dict[str, Any]] = None,
        custom_metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Update an existing intent's properties.
        
        This method handles updating intent metadata, renaming (with folder rename),
        and file list modifications. It's designed to be extensible for future fields.
        
        Args:
            intent_id: UUID of the intent to update
            folder_name: Folder name of the intent (alternative to intent_id)
            new_name: New human-readable name (triggers UUID3 regeneration and folder rename)
            replace_files: Complete replacement list for initial_files
            add_files: Files to add to existing initial_files
            remove_files: Files to remove from initial_files
            nucleus_path: Optional explicit path to Bloom project root
            
            Extended fields (for future implementation):
            user_input: User-provided input content
            api_config: API configuration dictionary
            profile_settings: Profile settings dictionary
            custom_metadata: Custom metadata dictionary
            
        Returns:
            Dictionary containing:
                - intent_id: UUID of the intent (may be new if name changed)
                - intent_path: Absolute path to intent directory
                - folder_name: Current folder name
                - name: Current name
                - type: Intent type
                - initial_files: Current file list
                - project_path: Bloom project root path
                - updated_at: ISO timestamp
                - changes: Dictionary of what changed
                - message: Success message
                
        Raises:
            ValueError: If validation fails or intent not found
            FileNotFoundError: If project or files not found
        """
        # Find Bloom project
        project_root = self._find_bloom_project(nucleus_path)
        
        # Locate the intent
        intent_path, state_data, state_file = self._locate_intent(
            project_root,
            intent_id,
            folder_name
        )
        
        # Track changes for reporting
        changes = {}
        old_intent_id = state_data["uuid"]
        old_name = state_data["name"]
        old_folder = intent_path.name
        
        # Handle name change (requires folder rename due to UUID3)
        if new_name and new_name.strip() != old_name:
            # Generate new UUID3 from new name
            new_intent_id = str(uuid.uuid3(self.INTENT_NAMESPACE, new_name.strip()))
            new_slug = self._slugify(new_name)
            new_folder_name = f".{new_slug}-{new_intent_id[:8]}"
            
            # Rename folder
            new_intent_path = intent_path.parent / new_folder_name
            intent_path.rename(new_intent_path)
            
            # Update state
            state_data["name"] = new_name.strip()
            state_data["uuid"] = new_intent_id
            
            # Track changes
            changes["name_changed"] = True
            changes["old_name"] = old_name
            changes["new_name"] = new_name.strip()
            changes["old_folder"] = old_folder
            changes["new_folder"] = new_folder_name
            changes["old_uuid"] = old_intent_id
            changes["new_uuid"] = new_intent_id
            
            # Update references
            intent_path = new_intent_path
            state_file = intent_path / state_file.name
        
        # Handle file operations
        current_files = state_data.get("initial_files", [])
        
        if replace_files is not None:
            # Validate and replace entire file list
            validated = self._validate_initial_files(replace_files, project_root)
            state_data["initial_files"] = validated
            changes["files_replaced"] = True
        
        elif add_files or remove_files:
            # Modify existing file list
            file_set = set(current_files)
            
            if add_files:
                validated_add = self._validate_initial_files(add_files, project_root)
                added_count = 0
                for f in validated_add:
                    if f not in file_set:
                        file_set.add(f)
                        added_count += 1
                changes["files_added"] = added_count
            
            if remove_files:
                removed_count = 0
                for f in remove_files:
                    # Normalize path for comparison
                    normalized = str(Path(f))
                    if normalized in file_set:
                        file_set.remove(normalized)
                        removed_count += 1
                changes["files_removed"] = removed_count
            
            state_data["initial_files"] = list(file_set)
        
        # Handle extended fields (for future use)
        # These are designed to be easily extended without breaking existing functionality
        if user_input is not None:
            if "extended" not in state_data:
                state_data["extended"] = {}
            state_data["extended"]["user_input"] = user_input
            changes["user_input_updated"] = True
        
        if api_config is not None:
            if "extended" not in state_data:
                state_data["extended"] = {}
            state_data["extended"]["api_config"] = api_config
            changes["api_config_updated"] = True
        
        if profile_settings is not None:
            if "extended" not in state_data:
                state_data["extended"] = {}
            state_data["extended"]["profile_settings"] = profile_settings
            changes["profile_settings_updated"] = True
        
        if custom_metadata is not None:
            if "extended" not in state_data:
                state_data["extended"] = {}
            state_data["extended"]["custom_metadata"] = custom_metadata
            changes["custom_metadata_updated"] = True
        
        # Update timestamp
        timestamp = datetime.now(timezone.utc).isoformat()
        state_data["updated_at"] = timestamp
        
        # Write updated state
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
        
        # Return structured result
        return {
            "intent_id": state_data["uuid"],
            "intent_path": str(intent_path),
            "folder_name": intent_path.name,
            "name": state_data["name"],
            "type": state_data["type"],
            "initial_files": state_data.get("initial_files", []),
            "project_path": str(project_root),
            "updated_at": timestamp,
            "changes": changes,
            "message": f"Intent '{state_data['name']}' updated successfully"
        }


    def _locate_intent(
        self,
        project_root: Path,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None
    ) -> tuple[Path, Dict[str, Any], Path]:
        """
        Locate an intent by ID or folder name.
        
        Args:
            project_root: Bloom project root
            intent_id: Optional UUID to search for
            folder_name: Optional folder name to search for
            
        Returns:
            Tuple of (intent_path, state_data, state_file)
            
        Raises:
            ValueError: If intent not found or multiple matches
        """
        intents_base = project_root / ".bloom" / ".intents"
        
        if not intents_base.exists():
            raise ValueError("No intents directory found in project")
        
        # Search in both .dev and .doc
        search_dirs = [intents_base / ".dev", intents_base / ".doc"]
        matches = []
        
        for search_dir in search_dirs:
            if not search_dir.exists():
                continue
            
            for intent_dir in search_dir.iterdir():
                if not intent_dir.is_dir():
                    continue
                
                # Check by folder name
                if folder_name and intent_dir.name == folder_name:
                    matches.append(intent_dir)
                    continue
                
                # Check by intent_id
                if intent_id:
                    # Try both state files
                    for state_name in [".dev_state.json", ".doc_state.json"]:
                        state_file = intent_dir / state_name
                        if state_file.exists():
                            try:
                                with open(state_file, "r", encoding="utf-8") as f:
                                    state = json.load(f)
                                if state.get("uuid") == intent_id:
                                    matches.append(intent_dir)
                                    break
                            except (json.JSONDecodeError, IOError):
                                continue
        
        if not matches:
            search_term = folder_name if folder_name else intent_id
            raise ValueError(f"Intent not found: {search_term}")
        
        if len(matches) > 1:
            raise ValueError(f"Multiple intents found matching criteria")
        
        intent_path = matches[0]
        
        # Load state file
        state_file = None
        state_data = None
        
        for state_name in [".dev_state.json", ".doc_state.json"]:
            candidate = intent_path / state_name
            if candidate.exists():
                state_file = candidate
                with open(state_file, "r", encoding="utf-8") as f:
                    state_data = json.load(f)
                break
        
        if not state_data:
            raise ValueError(f"No valid state file found in {intent_path}")
        
        return intent_path, state_data, state_file        