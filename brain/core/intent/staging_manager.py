"""
Staging manager - Pure business logic for preparing files for merge.

This module handles reading files from .files/, creating directory structure
in .staging/, and generating manifest files for validation.
"""

import json
import shutil
import hashlib
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone


class StagingManager:
    """
    Manager for staging intent files ready for merge.
    
    This class prepares files from .files/ directory into .staging/ directory,
    mirroring the final target structure. It also generates a manifest file
    for validation and tracking.
    """
    
    def __init__(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        nucleus_path: Optional[Path] = None
    ):
        """
        Initialize the StagingManager.
        
        Args:
            intent_id: UUID of the intent (optional if folder_name provided)
            folder_name: Folder name of the intent (optional if intent_id provided)
            nucleus_path: Path to Bloom project root (auto-detected if None)
            
        Raises:
            ValueError: If neither intent_id nor folder_name is provided
        """
        if not intent_id and not folder_name:
            raise ValueError("Either intent_id or folder_name must be provided")
        
        self.intent_id = intent_id
        self.folder_name = folder_name
        self.nucleus_path = self._find_bloom_project(nucleus_path)
        self.intent_path = None
        self.state_data = None
    
    def stage(
        self,
        stage_name: Optional[str] = None,
        dry_run: bool = False,
        overwrite: bool = True,
        verbose: bool = False
    ) -> Dict[str, Any]:
        """
        Prepare files in .staging/ directory for merge.
        
        This method:
        1. Locates the intent and validates required directories
        2. Reads metadata from .raw_output.json
        3. Creates .staging/ directory structure
        4. Copies files from .files/ to .staging/ with proper paths
        5. Generates .staging_manifest.json for tracking
        
        Args:
            stage_name: Pipeline stage (briefing, execution, refinement_X).
                       Auto-detects latest stage if not provided.
            dry_run: If True, shows what would be staged without writing files
            overwrite: If True, overwrites existing .staging/ directory
            verbose: If True, shows detailed progress
            
        Returns:
            Dictionary containing:
                - intent_id: Intent UUID
                - stage: Stage name used
                - staging_dir: Path to staging directory
                - files_staged: Number of files staged
                - files_info: List of file staging details
                - manifest_path: Path to manifest file (if not dry_run)
                - dry_run: Whether this was a dry run
                
        Raises:
            FileNotFoundError: If required directories or files don't exist
            ValueError: If raw_output.json is invalid or missing files metadata
        """
        # 1. Locate intent and load state
        self._locate_and_validate_intent()
        
        # 2. Determine stage if not provided
        if not stage_name:
            stage_name = self._detect_latest_stage()
            if verbose:
                print(f"🔍 Auto-detected stage: {stage_name}")
        
        # 3. Get response directory and validate paths
        response_dir = self._get_response_dir(stage_name)
        raw_path = response_dir / ".raw_output.json"
        files_dir = response_dir / ".files"
        staging_dir = response_dir / ".staging"
        
        if not raw_path.exists():
            raise FileNotFoundError(
                f".raw_output.json not found in {response_dir}. "
                f"Run 'brain intent download' first."
            )
        
        if not files_dir.exists():
            raise FileNotFoundError(
                f".files/ directory not found in {response_dir}. "
                f"Run 'brain intent download' first."
            )
        
        # 4. Read metadata from raw_output.json
        with open(raw_path, 'r', encoding='utf-8') as f:
            response_data = json.load(f)
        
        # Extract files metadata
        files_meta = self._extract_files_metadata(response_data)
        
        if not files_meta:
            raise ValueError(
                f"No files metadata found in .raw_output.json. "
                f"The AI response may not contain file operations."
            )
        
        if verbose or dry_run:
            print(f"📦 Staging {len(files_meta)} file(s)...")
        
        # 5. Clean staging directory if overwrite
        if staging_dir.exists() and overwrite and not dry_run:
            shutil.rmtree(staging_dir)
        
        if not dry_run:
            staging_dir.mkdir(parents=True, exist_ok=True)
        
        # 6. Process each file
        staged_files = []
        files_info = []
        
        for file_meta in files_meta:
            file_ref = file_meta.get("file_ref", "")
            target_path = file_meta.get("path", "")
            action = file_meta.get("action", "unknown")
            hash_after = file_meta.get("hash_after", "")
            
            if not file_ref or not target_path:
                if verbose:
                    print(f"⚠️  Skipping invalid file metadata: {file_meta}")
                continue
            
            source_file = files_dir / file_ref
            
            if not source_file.exists():
                if verbose:
                    print(f"⚠️  Missing source file: {file_ref}")
                continue
            
            # Create directory structure in staging
            target_full = staging_dir / target_path
            
            if dry_run:
                print(f"   [DRY RUN] Would copy: {file_ref} → {target_path}")
            else:
                target_full.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_file, target_full)
                if verbose:
                    print(f"   ✅ {target_path}")
            
            # Track staged file
            staged_file_info = {
                "source": str(source_file.relative_to(response_dir)),
                "target": str(target_full.relative_to(response_dir)) if not dry_run else f".staging/{target_path}",
                "target_path": target_path,
                "action": action,
                "hash": hash_after,
                "size": source_file.stat().st_size if source_file.exists() else 0
            }
            
            staged_files.append(staged_file_info)
            files_info.append({
                "target_path": target_path,
                "action": action,
                "size": staged_file_info["size"]
            })
        
        # 7. Generate staging manifest
        manifest = {
            "staged_at": datetime.now(timezone.utc).isoformat(),
            "intent_id": self.intent_id or self.state_data.get("uuid", "unknown"),
            "intent_name": self.state_data.get("name", "unknown"),
            "stage": stage_name,
            "files": staged_files,
            "total_files": len(staged_files),
            "total_size_bytes": sum(f["size"] for f in staged_files),
            "dry_run": dry_run,
            "overwrite": overwrite
        }
        
        manifest_path = None
        if not dry_run:
            manifest_path = staging_dir / ".staging_manifest.json"
            with open(manifest_path, 'w', encoding='utf-8') as f:
                json.dump(manifest, f, indent=2, ensure_ascii=False)
        
        if verbose and not dry_run:
            print(f"\n✅ Staged {len(staged_files)} file(s)")
            print(f"✅ Manifest: {manifest_path}")
        
        # 8. Return structured result
        return {
            "intent_id": self.intent_id or self.state_data.get("uuid", "unknown"),
            "intent_name": self.state_data.get("name", "unknown"),
            "stage": stage_name,
            "staging_dir": str(staging_dir),
            "files_staged": len(staged_files),
            "files_info": files_info,
            "manifest_path": str(manifest_path) if manifest_path else None,
            "total_size_bytes": manifest["total_size_bytes"],
            "dry_run": dry_run,
            "overwrite": overwrite
        }
    
    def _find_bloom_project(self, start_path: Optional[Path] = None) -> Path:
        """
        Find the Bloom project root by looking for .bloom/ directory.
        
        Args:
            start_path: Starting path for search (uses cwd if None)
            
        Returns:
            Path to Bloom project root
            
        Raises:
            FileNotFoundError: If .bloom/ directory not found
        """
        current = Path(start_path) if start_path else Path.cwd()
        current = current.resolve()
        
        # Search up to 10 levels
        for _ in range(10):
            bloom_dir = current / ".bloom"
            if bloom_dir.exists() and bloom_dir.is_dir():
                return current
            
            parent = current.parent
            if parent == current:  # Reached filesystem root
                break
            current = parent
        
        raise FileNotFoundError(
            "Bloom project not found. Make sure you're inside a Bloom project "
            "or specify --nucleus-path/-p"
        )
    
    def _locate_and_validate_intent(self):
        """
        Locate intent directory and load state file.
        
        Sets self.intent_path and self.state_data.
        
        Raises:
            FileNotFoundError: If intent not found
            ValueError: If state file is invalid
        """
        intents_dir = self.nucleus_path / ".bloom" / ".intents"
        
        if not intents_dir.exists():
            raise FileNotFoundError(
                f"Intents directory not found: {intents_dir}"
            )
        
        # Search for intent
        found_path = None
        found_state = None
        
        for intent_type_dir in [".dev", ".doc"]:
            type_path = intents_dir / intent_type_dir
            if not type_path.exists():
                continue
            
            for intent_dir in type_path.iterdir():
                if not intent_dir.is_dir():
                    continue
                
                # Match by folder name or UUID
                if self.folder_name and intent_dir.name == self.folder_name:
                    found_path = intent_dir
                elif self.intent_id:
                    # Check state file for UUID match
                    for state_file in [".dev_state.json", ".doc_state.json"]:
                        state_path = intent_dir / state_file
                        if state_path.exists():
                            try:
                                with open(state_path, 'r', encoding='utf-8') as f:
                                    state = json.load(f)
                                if state.get("uuid", "").startswith(self.intent_id[:8]):
                                    found_path = intent_dir
                                    found_state = state
                                    break
                            except (json.JSONDecodeError, KeyError):
                                continue
                
                if found_path:
                    break
            
            if found_path:
                break
        
        if not found_path:
            raise FileNotFoundError(
                f"Intent not found with "
                f"{'folder=' + self.folder_name if self.folder_name else 'id=' + self.intent_id}"
            )
        
        # Load state if not already loaded
        if not found_state:
            for state_file in [".dev_state.json", ".doc_state.json"]:
                state_path = found_path / state_file
                if state_path.exists():
                    with open(state_path, 'r', encoding='utf-8') as f:
                        found_state = json.load(f)
                    break
        
        if not found_state:
            raise ValueError(f"State file not found in {found_path}")
        
        self.intent_path = found_path
        self.state_data = found_state
        
        # Set intent_id if it was None
        if not self.intent_id:
            self.intent_id = found_state.get("uuid", "unknown")
    
    def _detect_latest_stage(self) -> str:
        """
        Detect the latest pipeline stage with a .response/ directory.
        
        Returns:
            Stage name (e.g., "briefing", "execution", "refinement_1")
            
        Raises:
            FileNotFoundError: If no valid stage found
        """
        pipeline_dir = self.intent_path / ".pipeline"
        
        if not pipeline_dir.exists():
            raise FileNotFoundError(
                f"Pipeline directory not found: {pipeline_dir}"
            )
        
        # Check stages in order: briefing -> execution -> refinement_X
        stages_to_check = [".briefing", ".execution"]
        
        # Add refinement stages (check up to 10)
        for i in range(1, 11):
            stages_to_check.append(f".refinement_{i}")
        
        # Check in reverse order (latest first)
        for stage in reversed(stages_to_check):
            stage_dir = pipeline_dir / stage
            response_dir = stage_dir / ".response"
            
            if response_dir.exists() and response_dir.is_dir():
                # Remove leading dot
                return stage.lstrip(".")
        
        raise FileNotFoundError(
            f"No pipeline stage with .response/ found in {pipeline_dir}. "
            f"Run 'brain intent download' first."
        )
    
    def _get_response_dir(self, stage_name: str) -> Path:
        """
        Get the .response/ directory for a given stage.
        
        Args:
            stage_name: Stage name (with or without leading dot)
            
        Returns:
            Path to .response/ directory
            
        Raises:
            FileNotFoundError: If response directory doesn't exist
        """
        # Normalize stage name (add dot if missing)
        if not stage_name.startswith("."):
            stage_name = f".{stage_name}"
        
        response_dir = self.intent_path / ".pipeline" / stage_name / ".response"
        
        if not response_dir.exists():
            raise FileNotFoundError(
                f"Response directory not found: {response_dir}. "
                f"Run 'brain intent download' for stage '{stage_name}'"
            )
        
        return response_dir
    
    def _extract_files_metadata(self, response_data: dict) -> List[Dict[str, Any]]:
        """
        Extract files metadata from .raw_output.json.
        
        Args:
            response_data: Parsed JSON from .raw_output.json
            
        Returns:
            List of file metadata dictionaries
            
        Raises:
            ValueError: If files metadata structure is invalid
        """
        # Try different possible structures
        
        # Structure 1: response_data["content"]["files"]
        if "content" in response_data and isinstance(response_data["content"], dict):
            files = response_data["content"].get("files", [])
            if files:
                return files
        
        # Structure 2: response_data["files"]
        if "files" in response_data:
            files = response_data["files"]
            if files:
                return files
        
        # Structure 3: response_data["data"]["files"]
        if "data" in response_data and isinstance(response_data["data"], dict):
            files = response_data["data"].get("files", [])
            if files:
                return files
        
        return []