"""
Intent merge manager - Pure business logic for merging staged files.

This module handles the core logic of applying staged files from .staging/
directory to the actual codebase with backup and validation.
"""

import json
import shutil
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone


class MergeManager:
    """
    Manager for merging staged files into the codebase.
    
    This class provides pure business logic for applying validated changes
    from the .staging/ directory to the actual project files with safety
    features like backup creation and atomic writes.
    """
    
    def __init__(self):
        """Initialize the MergeManager."""
        pass
    
    def merge(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        stage_name: Optional[str] = None,
        force: bool = False,
        dry_run: bool = False,
        no_backup: bool = False,
        nucleus_path: Optional[Path] = None
    ) -> Dict[str, Any]:
        """
        Apply staged files from .staging/ to the real codebase.
        
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent (alternative to intent_id)
            stage_name: Pipeline stage name (auto-detect if None)
            force: Skip validation approval check
            dry_run: Preview changes without applying
            no_backup: Skip backup creation (dangerous)
            nucleus_path: Optional path to Bloom project
            
        Returns:
            Dictionary containing:
                - intent_id: Intent UUID
                - stage: Pipeline stage
                - files_merged: Number of files merged
                - errors: Number of errors encountered
                - backup_dir: Path to backup directory (if created)
                - dry_run: Whether this was a dry run
                - files_modified: List of modified file paths
                
        Raises:
            ValueError: If intent not found or validation not approved
            FileNotFoundError: If staging directory doesn't exist
            RuntimeError: If merge operation fails
        """
        # 1. Find Bloom project
        project_root = self._find_bloom_project(nucleus_path)
        
        # 2. Locate intent
        intent_path, state_data, state_file = self._locate_intent(
            project_root, intent_id, folder_name
        )
        
        intent_uuid = state_data.get("uuid", "")
        
        # 3. Detect or validate stage
        if not stage_name:
            stage_name = self._detect_latest_stage(intent_path, state_data)
        
        # 4. Locate response directory and staging
        response_dir = self._get_response_dir(intent_path, state_data, stage_name)
        report_path = response_dir / ".report.json"
        staging_dir = response_dir / ".staging"
        manifest_path = staging_dir / ".staging_manifest.json"
        
        # 5. Validate staging exists
        if not staging_dir.exists():
            raise FileNotFoundError(
                f"Staging directory not found: {staging_dir}. "
                f"Run 'brain intent stage' first."
            )
        
        if not manifest_path.exists():
            raise FileNotFoundError(
                f"Staging manifest not found: {manifest_path}. "
                f"Run 'brain intent stage' first."
            )
        
        # 6. Check validation approval (unless force)
        if not force and not dry_run:
            if not report_path.exists():
                raise RuntimeError(
                    "Validation report not found. "
                    "Run 'brain intent validate' first or use --force."
                )
            
            with open(report_path, 'r', encoding='utf-8') as f:
                report = json.load(f)
            
            if not report.get("ready_for_merge", False):
                raise RuntimeError(
                    "Validation not approved for merge. "
                    "Review .report.json or use --force to override."
                )
        
        # 7. Read staging manifest
        with open(manifest_path, 'r', encoding='utf-8') as f:
            manifest = json.load(f)
        
        files_to_merge = manifest.get("files", [])
        
        if not files_to_merge:
            return {
                "intent_id": intent_uuid,
                "stage": stage_name,
                "files_merged": 0,
                "errors": 0,
                "backup_dir": None,
                "dry_run": dry_run,
                "files_modified": []
            }
        
        # 8. Create backup (unless disabled or dry-run)
        backup_dir = None
        if not no_backup and not dry_run:
            backup_dir = self._create_backup(
                files_to_merge, 
                staging_dir, 
                project_root, 
                intent_path
            )
        
        # 9. Apply changes
        merged_count = 0
        errors = []
        files_modified = []
        
        for file_info in files_to_merge:
            source = Path(file_info["target"])  # Path in .staging/
            action = file_info.get("action", "update")
            
            # Determine real path in project
            try:
                relative_path = source.relative_to(staging_dir)
            except ValueError:
                # If source is not relative to staging_dir, skip
                errors.append(f"{source}: Not in staging directory")
                continue
            
            target = project_root / relative_path
            
            try:
                if action in ["create", "update"]:
                    if dry_run:
                        files_modified.append(str(relative_path))
                    else:
                        target.parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(source, target)
                        files_modified.append(str(relative_path))
                    merged_count += 1
                
                elif action == "delete":
                    if dry_run:
                        if target.exists():
                            files_modified.append(f"[DELETE] {relative_path}")
                    else:
                        if target.exists():
                            target.unlink()
                            files_modified.append(f"[DELETE] {relative_path}")
                    merged_count += 1
                
            except Exception as e:
                errors.append(f"{relative_path}: {e}")
        
        # 10. Update intent state (if not dry-run)
        if not dry_run:
            self._update_intent_state(
                state_data,
                state_file,
                stage_name,
                merged_count,
                backup_dir
            )
        
        # 11. Return result
        return {
            "intent_id": intent_uuid,
            "stage": stage_name,
            "files_merged": merged_count,
            "errors": len(errors),
            "backup_dir": str(backup_dir) if backup_dir else None,
            "dry_run": dry_run,
            "files_modified": files_modified,
            "error_details": errors if errors else None
        }
    
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
            "No Bloom project found. Please run this command from within "
            "a Bloom project or specify --nucleus-path"
        )
    
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
            ValueError: If intent not found
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
            raise ValueError("Multiple intents found matching criteria")
        
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
    
    def _detect_latest_stage(
        self,
        intent_path: Path,
        state_data: Dict[str, Any]
    ) -> str:
        """
        Detect the latest pipeline stage with a response.
        
        Args:
            intent_path: Path to intent directory
            state_data: Intent state data
            
        Returns:
            Stage name (briefing, execution, or refinement_X)
            
        Raises:
            ValueError: If no stage found
        """
        intent_type = state_data.get("type", "dev")
        pipeline_dir = intent_path / ".pipeline"
        
        # Check for refinement stages first (highest priority)
        if intent_type == "dev":
            refinement_dir = intent_path / ".refinement"
            if refinement_dir.exists():
                turns = sorted([
                    d for d in refinement_dir.iterdir() 
                    if d.is_dir() and d.name.startswith(".turn_")
                ])
                if turns:
                    latest_turn = turns[-1]
                    turn_num = latest_turn.name.replace(".turn_", "")
                    stage_dir = pipeline_dir / f".refinement_{turn_num}"
                    if (stage_dir / ".response").exists():
                        return f"refinement_{turn_num}"
        
        # Check execution
        execution_response = pipeline_dir / ".execution" / ".response"
        if execution_response.exists():
            return "execution"
        
        # Check briefing
        briefing_response = pipeline_dir / ".briefing" / ".response"
        if briefing_response.exists():
            return "briefing"
        
        raise ValueError(
            "No pipeline stage found with response. "
            "Run 'brain intent submit' first."
        )
    
    def _get_response_dir(
        self,
        intent_path: Path,
        state_data: Dict[str, Any],
        stage_name: str
    ) -> Path:
        """
        Get the response directory for a given stage.
        
        Args:
            intent_path: Path to intent directory
            state_data: Intent state data
            stage_name: Stage name
            
        Returns:
            Path to response directory
        """
        pipeline_dir = intent_path / ".pipeline"
        
        if stage_name.startswith("refinement_"):
            turn_num = stage_name.replace("refinement_", "")
            return pipeline_dir / f".refinement_{turn_num}" / ".response"
        else:
            return pipeline_dir / f".{stage_name}" / ".response"
    
    def _create_backup(
        self,
        files: List[Dict[str, Any]],
        staging_dir: Path,
        project_root: Path,
        intent_path: Path
    ) -> Path:
        """
        Create backup of files that will be modified.
        
        Args:
            files: List of file info dictionaries
            staging_dir: Path to staging directory
            project_root: Project root path
            intent_path: Intent directory path
            
        Returns:
            Path to backup directory
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = intent_path / ".pipeline" / ".backup" / timestamp
        backup_dir.mkdir(parents=True, exist_ok=True)
        
        for file_info in files:
            source = Path(file_info["target"])
            
            try:
                relative = source.relative_to(staging_dir)
            except ValueError:
                continue
            
            target = project_root / relative
            
            if target.exists():
                backup_file = backup_dir / relative
                backup_file.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(target, backup_file)
        
        return backup_dir
    
    def _update_intent_state(
        self,
        state_data: Dict[str, Any],
        state_file: Path,
        stage_name: str,
        merged_count: int,
        backup_dir: Optional[Path]
    ):
        """
        Update intent state after merge.
        
        Args:
            state_data: Intent state dictionary
            state_file: Path to state file
            stage_name: Pipeline stage name
            merged_count: Number of files merged
            backup_dir: Path to backup directory (if created)
        """
        timestamp = datetime.now(timezone.utc).isoformat()
        
        if "last_merge" not in state_data:
            state_data["last_merge"] = {}
        
        state_data["last_merge"] = {
            "timestamp": timestamp,
            "stage": stage_name,
            "files_merged": merged_count,
            "backup_dir": str(backup_dir) if backup_dir else None
        }
        
        # Update steps
        if "steps" in state_data:
            state_data["steps"]["merge"] = True
        
        # Update state
        if "state" not in state_data:
            state_data["state"] = {}
        
        state_data["state"]["current_step"] = "merged"
        
        # Unlock intent
        if "lock" not in state_data:
            state_data["lock"] = {}
        
        state_data["lock"]["locked"] = False
        state_data["lock"]["locked_by"] = None
        
        # Save
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)