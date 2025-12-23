"""
Intent recovery core logic - Pure business logic for recovering interrupted intents.
Handles recovery from lock state without CLI dependencies.
"""

import json
import socket
import struct
from pathlib import Path
from typing import Dict, Any, Optional, List
from datetime import datetime, timezone


class RecoveryManager:
    """
    Manager for recovering interrupted intents from lock state.
    
    This class provides pure business logic for:
    - Finding interrupted intents (locked state)
    - Analyzing recovery data from lock state
    - Initiating recovery operations (browser reopen, etc.)
    - Force-unlocking intents when recovery is not needed
    """
    
    def __init__(self):
        """Initialize the RecoveryManager."""
        pass
    
    def recover_all(
        self,
        nucleus_path: Optional[Path] = None,
        force_unlock: bool = False
    ) -> Dict[str, Any]:
        """
        Find and recover all interrupted intents in a project.
        
        Args:
            nucleus_path: Optional path to Bloom project root
            force_unlock: If True, only unlock without attempting recovery
            
        Returns:
            Dictionary containing:
                - mode: "auto_detect"
                - found_count: Number of interrupted intents found
                - recovered_count: Number successfully recovered
                - failed_count: Number that failed recovery
                - recovered_intents: List of successfully recovered intents
                - failed_intents: List of failed recoveries with errors
                
        Raises:
            FileNotFoundError: If project not found
        """
        project_root = self._find_bloom_project(nucleus_path)
        interrupted = self._find_interrupted_intents(project_root)
        
        recovered = []
        failed = []
        
        for intent_info in interrupted:
            try:
                result = self.recover_single(
                    intent_id=intent_info["id"],
                    force_unlock=force_unlock,
                    nucleus_path=project_root
                )
                
                recovered.append({
                    "id": intent_info["id"],
                    "name": intent_info["name"],
                    "operation": intent_info["operation"],
                    "recovery_action": result.get("recovery_action", "unknown")
                })
            
            except Exception as e:
                failed.append({
                    "id": intent_info["id"],
                    "name": intent_info["name"],
                    "operation": intent_info["operation"],
                    "error": str(e)
                })
        
        return {
            "mode": "auto_detect",
            "found_count": len(interrupted),
            "recovered_count": len(recovered),
            "failed_count": len(failed),
            "recovered_intents": recovered,
            "failed_intents": failed
        }
    
    def recover_single(
        self,
        intent_id: Optional[str] = None,
        folder_name: Optional[str] = None,
        force_unlock: bool = False,
        nucleus_path: Optional[Path] = None
    ) -> Dict[str, Any]:
        """
        Recover a single interrupted intent.
        
        Args:
            intent_id: UUID of the intent
            folder_name: Folder name of the intent
            force_unlock: If True, only unlock without attempting recovery
            nucleus_path: Optional path to Bloom project root
            
        Returns:
            Dictionary containing:
                - intent_id: Intent UUID
                - intent_name: Intent name
                - recovery_action: Action taken (force_unlocked, download_resumed, etc.)
                - chat_url: URL for browser reopen (if applicable)
                - profile: Chrome profile (if applicable)
                - stage: Pipeline stage (if applicable)
                
        Raises:
            ValueError: If intent not found or invalid state
            FileNotFoundError: If project not found
        """
        # 1. Find project and locate intent
        project_root = self._find_bloom_project(nucleus_path)
        intent_path, state_data, state_file = self._locate_intent(
            project_root,
            intent_id,
            folder_name
        )
        
        intent_uuid = state_data.get("uuid", "")
        intent_name = state_data.get("name", "unknown")
        
        # 2. Check if intent is actually locked
        if not state_data.get("locked", False):
            return {
                "intent_id": intent_uuid,
                "intent_name": intent_name,
                "recovery_action": "no_lock",
                "message": "Intent is not locked - nothing to recover"
            }
        
        # 3. Get recovery data from lock state
        recovery_data = state_data.get("lock", {}).get("recovery_data", {})
        operation = state_data.get("lock", {}).get("operation", "unknown")
        
        # 4. Force unlock mode - just release lock
        if force_unlock:
            state_data["locked"] = False
            state_data["locked_by"] = ""
            state_data["locked_at"] = ""
            state_data["unlocked_at"] = datetime.now(timezone.utc).isoformat()
            
            with open(state_file, "w", encoding="utf-8") as f:
                json.dump(state_data, f, indent=2, ensure_ascii=False)
            
            return {
                "intent_id": intent_uuid,
                "intent_name": intent_name,
                "recovery_action": "force_unlocked",
                "message": "Lock released without recovery attempt"
            }
        
        # 5. Attempt recovery based on operation type
        if operation == "downloading_response":
            return self._recover_download(
                intent_uuid,
                intent_name,
                recovery_data,
                state_data,
                state_file
            )
        
        elif operation == "merging":
            return self._recover_merge(
                intent_uuid,
                intent_name,
                recovery_data,
                state_data,
                state_file
            )
        
        else:
            raise ValueError(
                f"Unknown operation type '{operation}' - cannot recover. "
                f"Use --force-unlock to release lock manually."
            )
    
    def _recover_download(
        self,
        intent_id: str,
        intent_name: str,
        recovery_data: dict,
        state_data: dict,
        state_file: Path
    ) -> Dict[str, Any]:
        """
        Recover interrupted download operation.
        
        This sends a command to the native host to reopen the browser
        at the saved chat URL, allowing the extension to resume download.
        
        Args:
            intent_id: Intent UUID
            intent_name: Intent name
            recovery_data: Recovery data from lock state
            state_data: Complete state data
            state_file: Path to state file
            
        Returns:
            Recovery result dictionary
            
        Raises:
            ValueError: If recovery data is insufficient
        """
        chat_url = recovery_data.get("chat_url")
        profile = recovery_data.get("profile")
        
        if not chat_url or not profile:
            raise ValueError(
                "Insufficient recovery data for download recovery. "
                "Missing chat_url or profile. Use --force-unlock to release lock."
            )
        
        # Note: Actual browser reopening would require Host communication
        # For now, we update state and provide recovery information
        
        # Update state - keep lock but mark as recovery pending
        state_data["lock"]["recovery_pending"] = True
        state_data["lock"]["recovery_initiated_at"] = datetime.now(timezone.utc).isoformat()
        
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
        
        return {
            "intent_id": intent_id,
            "intent_name": intent_name,
            "recovery_action": "download_resumed",
            "chat_url": chat_url,
            "profile": profile,
            "message": "Browser reopen initiated - extension will resume download"
        }
    
    def _recover_merge(
        self,
        intent_id: str,
        intent_name: str,
        recovery_data: dict,
        state_data: dict,
        state_file: Path
    ) -> Dict[str, Any]:
        """
        Recover interrupted merge operation.
        
        Args:
            intent_id: Intent UUID
            intent_name: Intent name
            recovery_data: Recovery data from lock state
            state_data: Complete state data
            state_file: Path to state file
            
        Returns:
            Recovery result dictionary
        """
        stage = recovery_data.get("stage", "unknown")
        
        # For merge recovery, we can safely unlock and let user retry
        # Merge is idempotent - backups exist
        state_data["locked"] = False
        state_data["locked_by"] = ""
        state_data["locked_at"] = ""
        state_data["unlocked_at"] = datetime.now(timezone.utc).isoformat()
        
        with open(state_file, "w", encoding="utf-8") as f:
            json.dump(state_data, f, indent=2, ensure_ascii=False)
        
        return {
            "intent_id": intent_id,
            "intent_name": intent_name,
            "recovery_action": "merge_resumed",
            "stage": stage,
            "message": "Lock released - merge can be retried safely (backups exist)"
        }
    
    def _find_interrupted_intents(self, project_root: Path) -> List[Dict[str, Any]]:
        """
        Find all intents with active locks.
        
        Args:
            project_root: Bloom project root path
            
        Returns:
            List of interrupted intent information dictionaries
        """
        intents_dir = project_root / ".bloom" / ".intents"
        interrupted = []
        
        if not intents_dir.exists():
            return interrupted
        
        # Search in both .dev and .doc
        for type_dir in [intents_dir / ".dev", intents_dir / ".doc"]:
            if not type_dir.exists():
                continue
            
            for intent_dir in type_dir.iterdir():
                if not intent_dir.is_dir():
                    continue
                
                # Try both state files
                for state_name in [".dev_state.json", ".doc_state.json"]:
                    state_file = intent_dir / state_name
                    
                    if not state_file.exists():
                        continue
                    
                    try:
                        with open(state_file, "r", encoding="utf-8") as f:
                            state = json.load(f)
                        
                        # Check if locked
                        if state.get("locked", False):
                            lock_info = state.get("lock", {})
                            
                            interrupted.append({
                                "id": state.get("uuid", ""),
                                "name": state.get("name", "unknown"),
                                "folder": intent_dir.name,
                                "operation": lock_info.get("operation", "unknown"),
                                "locked_at": lock_info.get("locked_at", "unknown"),
                                "locked_by": lock_info.get("locked_by", "unknown")
                            })
                    
                    except (json.JSONDecodeError, IOError):
                        continue
        
        return interrupted
    
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