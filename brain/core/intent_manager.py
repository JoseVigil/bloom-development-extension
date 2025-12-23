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
import socket
import shutil
import hashlib
from brain.core.filesystem.code_compressor import CodeCompressor


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
    
    def hydrate_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        briefing: str = "",
        files: Optional[List[str]] = None,
        nucleus_path: Optional[Path] = None,
        verbose: bool = False
    ) -> Dict[str, Any]:
        """
        Populate the intent with files and briefing instructions.
        Generates .codebase.json and .codebase_index.json.
        """
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        intent_type = state_data["type"]
       
        if intent_type == "dev":
            content_dir = intent_path / ".briefing"
            content_file = content_dir / ".briefing.json"
            content_key = "instruction"
        else:
            content_dir = intent_path / ".context"
            content_file = content_dir / ".context.json"
            content_key = "instruction"
       
        files_dir = content_dir / ".files"
        files_dir.mkdir(parents=True, exist_ok=True)
        # 3. Process Briefing
        briefing_updated = False
        if briefing:
            briefing_data = {
                content_key: briefing,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            with open(content_file, 'w', encoding="utf-8") as f:
                json.dump(briefing_data, f, indent=2)
            briefing_updated = True
        # 4. Process Files (The Hydration)
        stats = {"total_files": 0, "total_size_kb": 0.0}
       
        # Load existing files from state or args
        files_to_process = set(files) if files else set()
        files_to_process.update(state_data.get("initial_files", []))
       
        if files_to_process:
            compressor = CodeCompressor(preserve_comments=False)
           
            codebase_entries = []
            index_entries = []
           
            for file_path_str in files_to_process:
                full_path = project_root / file_path_str
                if not full_path.exists():
                    if verbose: print(f"⚠️ Warning: File skipped (not found): {file_path_str}")
                    continue
               
                # Determine language (simple extension check)
                ext = full_path.suffix.lower().replace('.', '')
                lang_map = {'py': 'python', 'js': 'javascript', 'ts': 'typescript', 'md': 'markdown'}
                language = lang_map.get(ext, 'text')
                content = full_path.read_text(encoding='utf-8', errors='ignore')
               
                # Compress
                compressed_data = compressor.compress_file(content, language)
               
                # Metadata
                file_hash = hashlib.md5(content.encode()).hexdigest()
               
                # Entry for .codebase.json (Content)
                codebase_entries.append({
                    "path": file_path_str,
                    "content": compressed_data, # {'c': 'gz:...', 'stats': ...}
                    "hash": file_hash
                })
               
                # Entry for .codebase_index.json (Structure/Meta)
                index_entries.append({
                    "path": file_path_str,
                    "hash": file_hash,
                    "size": len(content),
                    "language": language,
                    "tokens_est": len(content) // 4 # Rough estimate
                })
               
                stats["total_files"] += 1
                stats["total_size_kb"] += len(content) / 1024
            # Write .codebase.json
            with open(files_dir / ".codebase.json", 'w', encoding="utf-8") as f:
                json.dump({"files": codebase_entries}, f)
            # Write .codebase_index.json
            with open(files_dir / ".codebase_index.json", 'w', encoding="utf-8") as f:
                json.dump({"index": index_entries}, f, indent=2)
        # 5. Update State
        state_data["status"] = "hydrated" # or "briefing_completed"
        state_data["updated_at"] = datetime.now(timezone.utc).isoformat()
        if "steps" in state_data:
            state_data["steps"]["hydrate"] = True
        with open(state_file, 'w', encoding="utf-8") as f:
            json.dump(state_data, f, indent=2)
        return {
            "intent_id": state_data.get("uuid"),
            "status": state_data["status"],
            "briefing_updated": briefing_updated,
            "stats": {
                "total_files": stats["total_files"],
                "total_size_kb": round(stats["total_size_kb"], 2)
            }
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

    def list_intents(
        self,
        nucleus_path: Optional[Path] = None,
        intent_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        List all intents in a Bloom project.
       
        Args:
            nucleus_path: Optional path to Bloom project
            intent_type: Optional filter by type ("dev", "doc", or None for all)
           
        Returns:
            Dictionary with list of intents and metadata
           
        Raises:
            FileNotFoundError: If project not found
        """
        project_root = self._find_bloom_project(nucleus_path)
        intents_base = project_root / ".bloom" / ".intents"
       
        if not intents_base.exists():
            return {
                "project_path": str(project_root),
                "intents": [],
                "total": 0
            }
       
        intents = []
       
        # Determinar qué directorios escanear
        scan_dirs = []
        if intent_type is None or intent_type == "dev":
            scan_dirs.append((".dev", "dev"))
        if intent_type is None or intent_type == "doc":
            scan_dirs.append((".doc", "doc"))
       
        for dir_name, type_name in scan_dirs:
            type_dir = intents_base / dir_name
            if not type_dir.exists():
                continue
           
            for intent_dir in type_dir.iterdir():
                if not intent_dir.is_dir():
                    continue
               
                # Leer estado
                state_file_name = f".{type_name}_state.json"
                state_file = intent_dir / state_file_name
               
                if not state_file.exists():
                    continue
               
                try:
                    with open(state_file, "r", encoding="utf-8") as f:
                        state = json.load(f)
                   
                    intents.append({
                        "id": state.get("uuid", ""),
                        "name": state.get("name", ""),
                        "type": state.get("type", type_name),
                        "status": state.get("status", "unknown"),
                        "folder": intent_dir.name,
                        "created_at": state.get("created_at", ""),
                        "updated_at": state.get("updated_at", ""),
                        "locked": state.get("locked", False),
                        "initial_files_count": len(state.get("initial_files", []))
                    })
                except (json.JSONDecodeError, IOError):
                    continue
       
        return {
            "project_path": str(project_root),
            "intents": intents,
            "total": len(intents)
        }
    def get_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        nucleus_path: Optional[Path] = None
    ) -> Dict[str, Any]:
        """
        Get complete information about a specific intent.
       
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            nucleus_path: Optional path to Bloom project
           
        Returns:
            Complete intent information including state, files, turns
           
        Raises:
            ValueError: If intent not found
        """
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        # Cargar información adicional
        intent_type = state_data.get("type", "dev")
       
        # Contar turns si es dev
        turns_count = 0
        if intent_type == "dev":
            refinement_dir = intent_path / ".refinement"
            if refinement_dir.exists():
                turns_count = len([d for d in refinement_dir.iterdir() if d.is_dir()])
        elif intent_type == "doc":
            curation_dir = intent_path / ".curation"
            if curation_dir.exists():
                turns_count = len([d for d in curation_dir.iterdir() if d.is_dir()])
       
        return {
            "id": state_data.get("uuid", ""),
            "name": state_data.get("name", ""),
            "type": intent_type,
            "status": state_data.get("status", "unknown"),
            "folder": intent_path.name,
            "path": str(intent_path),
            "created_at": state_data.get("created_at", ""),
            "updated_at": state_data.get("updated_at", ""),
            "locked": state_data.get("locked", False),
            "locked_by": state_data.get("locked_by", ""),
            "locked_at": state_data.get("locked_at", ""),
            "initial_files": state_data.get("initial_files", []),
            "steps": state_data.get("steps", {}),
            "turns_count": turns_count,
            "project_path": str(project_root),
            "full_state": state_data
        }
    def lock_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        nucleus_path: Optional[Path] = None
    ) -> Dict[str, Any]:
        """
        Lock an intent to mark it as in-use (determinism P5).
        Only one intent can be active at a time.
       
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            nucleus_path: Optional path to Bloom project
           
        Returns:
            Lock status information
           
        Raises:
            ValueError: If intent already locked or not found
        """
       
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        # Verificar si ya está locked
        if state_data.get("locked", False):
            locked_by = state_data.get("locked_by", "unknown")
            locked_at = state_data.get("locked_at", "unknown")
            raise ValueError(
                f"Intent is already locked by {locked_by} at {locked_at}"
            )
       
        # Lock the intent
        timestamp = datetime.now(timezone.utc).isoformat()
        hostname = socket.gethostname()
       
        state_data["locked"] = True
        state_data["locked_by"] = f"{hostname}"
        state_data["locked_at"] = timestamp
       
        # Guardar
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
       
        return {
            "locked": True,
            "locked_by": hostname,
            "locked_at": timestamp,
            "intent_id": state_data.get("uuid", ""),
            "name": state_data.get("name", "")
        }
    def unlock_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        nucleus_path: Optional[Path] = None,
        force: bool = False
    ) -> Dict[str, Any]:
        """
        Unlock an intent to free it for use.
       
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            nucleus_path: Optional path to Bloom project
            force: Force unlock even if locked by another host
           
        Returns:
            Unlock status information
           
        Raises:
            ValueError: If intent not found
        """
       
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        # Unlock
        state_data["locked"] = False
        state_data["locked_by"] = ""
        state_data["locked_at"] = ""
        state_data["unlocked_at"] = datetime.now(timezone.utc).isoformat()
       
        # Guardar
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
       
        return {
            "locked": False,
            "intent_id": state_data.get("uuid", ""),
            "name": state_data.get("name", ""),
            "unlocked_at": state_data["unlocked_at"]
        }
    def add_turn(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        actor: str = "user",
        content: str = "",
        nucleus_path: Optional[Path] = None
    ) -> Dict[str, Any]:
        """
        Add a conversation turn to an intent's chat.
       
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            actor: Who is speaking ("user" or "ai")
            content: Content of the message
            nucleus_path: Optional path to Bloom project
           
        Returns:
            Turn information
           
        Raises:
            ValueError: If intent not found or invalid actor
        """
       
        if actor not in ["user", "ai"]:
            raise ValueError(f"Invalid actor '{actor}'. Must be 'user' or 'ai'")
       
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        intent_type = state_data.get("type", "dev")
       
        # Determinar el número del siguiente turn
        if intent_type == "dev":
            refinement_dir = intent_path / ".refinement"
            refinement_dir.mkdir(exist_ok=True)
            turn_num = len([d for d in refinement_dir.iterdir() if d.is_dir()]) + 1
            turn_dir = refinement_dir / f".turn_{turn_num}"
        else:
            curation_dir = intent_path / ".curation"
            curation_dir.mkdir(exist_ok=True)
            turn_num = len([d for d in curation_dir.iterdir() if d.is_dir()]) + 1
            turn_dir = curation_dir / f".turn_{turn_num}"
       
        turn_dir.mkdir(exist_ok=True)
        (turn_dir / ".files").mkdir(exist_ok=True)
       
        # Crear turn.json
        timestamp = datetime.now(timezone.utc).isoformat()
        turn_data = {
            "turn_id": turn_num,
            "actor": actor,
            "content": content,
            "timestamp": timestamp
        }
       
        turn_file = turn_dir / ".turn.json"
        with open(turn_file, "w", encoding="utf-8") as f:
            json.dump(turn_data, f, indent=2, ensure_ascii=False)
       
        return {
            "turn_id": turn_num,
            "actor": actor,
            "timestamp": timestamp,
            "turn_path": str(turn_dir),
            "intent_id": state_data.get("uuid", ""),
            "intent_name": state_data.get("name", "")
        }
    def finalize_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        nucleus_path: Optional[Path] = None
    ) -> Dict[str, Any]:
        """
        Finalize an intent, marking it as completed.
        This closes the intent and applies changes to the codebase.
       
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            nucleus_path: Optional path to Bloom project
           
        Returns:
            Finalization status
           
        Raises:
            ValueError: If intent not found or locked
        """
       
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        # Verificar que no esté locked por otro
        if state_data.get("locked", False):
            raise ValueError(
                f"Cannot finalize: Intent is locked by {state_data.get('locked_by', 'unknown')}"
            )
       
        # Marcar como completado
        timestamp = datetime.now(timezone.utc).isoformat()
        state_data["status"] = "completed"
        state_data["finalized_at"] = timestamp
        state_data["locked"] = False
       
        # Actualizar steps
        if "steps" in state_data:
            if state_data["type"] == "dev":
                state_data["steps"]["merge"] = True
            else:
                state_data["steps"]["publish"] = True
       
        # Guardar
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
       
        # Contar archivos modificados (simulado)
        files_modified = len(state_data.get("initial_files", []))
       
        return {
            "status": "completed",
            "intent_id": state_data.get("uuid", ""),
            "name": state_data.get("name", ""),
            "finalized_at": timestamp,
            "files_modified": files_modified,
            "message": f"Intent '{state_data.get('name', 'unknown')}' finalized successfully"
        }
    def delete_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        nucleus_path: Optional[Path] = None,
        force: bool = False
    ) -> Dict[str, Any]:
        """
        Delete an intent completely.
       
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            nucleus_path: Optional path to Bloom project
            force: Force deletion without confirmation
           
        Returns:
            Deletion status
           
        Raises:
            ValueError: If intent not found or locked
        """
       
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
       
        # Verificar lock
        if not force and state_data.get("locked", False):
            raise ValueError(
                f"Cannot delete: Intent is locked by {state_data.get('locked_by', 'unknown')}. Use --force to override."
            )
       
        # Guardar info antes de borrar
        intent_name = state_data.get("name", "unknown")
        intent_uuid = state_data.get("uuid", "")
       
        # Eliminar directorio completo
        shutil.rmtree(intent_path)
       
        return {
            "deleted": True,
            "intent_id": intent_uuid,
            "name": intent_name,
            "path": str(intent_path),
            "message": f"Intent '{intent_name}' deleted successfully"
        }    
    def submit_intent(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        provider: str = "claude",
        nucleus_path: Optional[Path] = None,
        profile_path: Optional[str] = None,
        host: str = "127.0.0.1",
        port: int = 5678,
        timeout: int = 30
    ) -> Dict[str, Any]:
        """
        Submit an intent payload to AI provider through native host bridge.
        
        This is the SUBMIT step (Step 5) in the Intent lifecycle.
        Reads the built payload and sends it to the native host via TCP.
        
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            provider: AI provider to use ("claude", "gemini", etc.)
            nucleus_path: Optional path to Bloom project
            profile_path: Optional Chrome profile path for the AI provider
            host: Native host IP address (default: 127.0.0.1)
            port: Native host TCP port (default: 5678)
            timeout: Connection timeout in seconds (default: 30)
            
        Returns:
            Dictionary containing:
                - intent_id: Intent UUID
                - intent_name: Intent name
                - provider: AI provider used
                - command_id: Generated command ID for tracking
                - host_response: Response from native host
                - payload_size: Size of payload in bytes
                - submitted_at: ISO timestamp
                
        Raises:
            ValueError: If intent not found or payload files missing
            FileNotFoundError: If payload or index files don't exist
            ConnectionError: If cannot connect to native host
            TimeoutError: If connection times out
        """
        import struct
        import time
        
        # 1. Locate intent
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
        
        intent_type = state_data.get("type", "dev")
        intent_uuid = state_data.get("uuid", "")
        intent_name = state_data.get("name", "unknown")
        
        # 2. Locate payload and index files in .pipeline/.briefing/
        pipeline_dir = intent_path / ".pipeline" / ".briefing"
        
        if not pipeline_dir.exists():
            raise FileNotFoundError(
                f"Pipeline directory not found. Has the payload been built? "
                f"Run 'brain intent build-payload' first."
            )
        
        # Look for payload.json and index.json (or .payload.json and .index.json)
        payload_file = None
        index_file = None
        
        for name in ["payload.json", ".payload.json"]:
            test_path = pipeline_dir / name
            if test_path.exists():
                payload_file = test_path
                break
        
        for name in ["index.json", ".index.json"]:
            test_path = pipeline_dir / name
            if test_path.exists():
                index_file = test_path
                break
        
        if not payload_file:
            raise FileNotFoundError(
                f"Payload file not found in {pipeline_dir}. "
                f"Run 'brain intent build-payload' first."
            )
        
        if not index_file:
            raise FileNotFoundError(
                f"Index file not found in {pipeline_dir}. "
                f"Run 'brain intent build-payload' first."
            )
        
        # 3. Read payload and index
        with open(index_file, "r", encoding="utf-8") as f:
            index_data = json.load(f)
        
        with open(payload_file, "r", encoding="utf-8") as f:
            payload_data = json.load(f)
        
        # 4. Generate command ID (use intent UUID or generate new one)
        command_id = index_data.get("intent_id", intent_uuid)
        if not command_id:
            command_id = str(uuid.uuid4())
        
        # 5. Build message for native host (following protocol from ai_submit_main.py)
        timestamp = time.time()
        message = {
            "id": command_id,
            "command": f"{provider}.submit",  # e.g., "claude.submit"
            "payload": {
                "provider": provider,
                "text": payload_data.get("content", ""),
                "context_files": payload_data.get("context_files", []),
                "parameters": payload_data.get("parameters", {}),
                "profile": profile_path or index_data.get("profile_path", "")
            },
            "timestamp": timestamp
        }
        
        # 6. Send to native host via TCP
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(timeout)
                s.connect((host, port))
                
                # Serialize JSON
                json_str = json.dumps(message)
                json_bytes = json_str.encode('utf-8')
                
                # Create 4-byte header (Little Endian) with size
                header = struct.pack('<I', len(json_bytes))
                
                # Send header + payload
                s.sendall(header + json_bytes)
                
                # Wait for response
                resp_header = s.recv(4)
                if not resp_header:
                    raise ConnectionError("No response header from native host")
                
                resp_len = struct.unpack('<I', resp_header)[0]
                
                # Receive response data
                chunks = []
                bytes_recd = 0
                while bytes_recd < resp_len:
                    chunk = s.recv(min(resp_len - bytes_recd, 4096))
                    if not chunk:
                        break
                    chunks.append(chunk)
                    bytes_recd += len(chunk)
                
                resp_data = b''.join(chunks).decode('utf-8')
                host_response = json.loads(resp_data)
                
        except socket.timeout:
            raise TimeoutError(
                f"Connection to native host timed out after {timeout} seconds. "
                f"Is bloom-host running at {host}:{port}?"
            )
        except ConnectionRefusedError:
            raise ConnectionError(
                f"Could not connect to native host at {host}:{port}. "
                f"Is bloom-host.exe running?"
            )
        except Exception as e:
            raise ConnectionError(f"Communication error with native host: {e}")
        
        # 7. Update intent state
        submitted_at = datetime.now(timezone.utc).isoformat()
        
        if "steps" in state_data:
            state_data["steps"]["submit"] = True
        
        state_data["last_submitted_at"] = submitted_at
        state_data["last_provider"] = provider
        
        # Save state
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
        
        # 8. Return structured result
        return {
            "intent_id": intent_uuid,
            "intent_name": intent_name,
            "provider": provider,
            "command_id": command_id,
            "host_response": host_response,
            "payload_size": len(json_bytes),
            "submitted_at": submitted_at,
            "message": f"Intent '{intent_name}' submitted to {provider} successfully"
        }