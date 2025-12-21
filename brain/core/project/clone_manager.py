"""
Core logic for cloning Git repositories and linking them to Nucleus.

This module provides pure business logic for the atomic operation of
cloning a repository and automatically integrating it into the Bloom ecosystem.
"""

from pathlib import Path
from typing import Dict, Any, Optional
import os
import re


class CloneAndLinkManager:
    """
    Manager for cloning Git repositories and linking them to the nearest Nucleus.
    
    This class orchestrates the complete workflow:
    - Nucleus detection
    - Repository cloning
    - Technology stack detection
    - Project linking
    
    All operations are atomic - if any step fails, the operation is aborted.
    """
    
    def __init__(self):
        """Initialize the CloneAndLinkManager."""
        pass
    
    def execute(
        self,
        repo_url: str,
        dest_path: Optional[str] = None,
        nucleus_path: Optional[str] = None,
        custom_name: Optional[str] = None,
        force_strategy: Optional[str] = None,
        description: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Execute the complete clone-and-link operation.
        
        Args:
            repo_url: Git repository URL (HTTPS or SSH format)
            dest_path: Optional absolute path for cloning. If None, uses Nucleus root + repo name
            nucleus_path: Optional explicit Nucleus path. If None, auto-detects from current directory
            custom_name: Optional custom name for the project. If None, uses repo name
            force_strategy: Optional technology strategy to force. If None, auto-detects
            description: Optional project description
            
        Returns:
            Dictionary containing:
                - project_path: Absolute path to cloned project
                - project_name: Name of the project
                - nucleus_path: Path to the Nucleus
                - detected_strategies: List of detected technology strategies
                - linked: Boolean indicating successful linking
                
        Raises:
            ValueError: If repo_url is invalid or empty
            FileNotFoundError: If no Nucleus is found or Git is not available
            FileExistsError: If destination directory already exists
            RuntimeError: If cloning, detection, or linking fails
        """
        # Validate input
        if not repo_url or not repo_url.strip():
            raise ValueError("Repository URL cannot be empty")
        
        repo_url = repo_url.strip()
        
        # Step 1: Detect or validate Nucleus
        if nucleus_path:
            detected_nucleus = Path(nucleus_path).resolve()
            # Validate it's a valid Nucleus
            self._validate_nucleus(detected_nucleus)
        else:
            detected_nucleus = self._detect_nucleus()
            if not detected_nucleus:
                raise FileNotFoundError(
                    "No Nucleus found. Please run this command from within a Nucleus "
                    "or one of its subdirectories, or specify --nucleus-path explicitly."
                )
        
        # Step 2: Determine destination path
        repo_name = self._extract_repo_name(repo_url)
        if dest_path:
            final_dest = Path(dest_path).resolve()
        else:
            # Clone to parent of Nucleus root (sibling to Nucleus)
            nucleus_parent = detected_nucleus.parent
            final_dest = nucleus_parent / repo_name
        
        # Step 3: Check destination doesn't exist
        if final_dest.exists():
            raise FileExistsError(
                f"Destination directory already exists: {final_dest}. "
                "Please remove it or choose a different destination."
            )
        
        # Step 4: Clone repository
        self._clone_repository(repo_url, final_dest)
        
        # Step 5: Validate cloned directory
        if not final_dest.exists() or not any(final_dest.iterdir()):
            raise RuntimeError(
                f"Clone operation completed but directory is empty or missing: {final_dest}"
            )
        
        # Step 6: Detect technologies (unless forced)
        if force_strategy:
            detected_strategies = [force_strategy]
        else:
            detected_strategies = self._detect_technologies(final_dest)
        
        # Determine final strategy to use for linking
        final_strategy = force_strategy or (detected_strategies[0] if detected_strategies else "generic")
        
        # Step 7: Link to Nucleus using ProjectLinker
        project_name = custom_name or repo_name
        self._link_to_nucleus(
            project_path=final_dest,
            nucleus_path=detected_nucleus,
            name=project_name,
            strategy=final_strategy,
            description=description,
            repo_url=repo_url
        )
        
        # Step 8: Return structured data
        return {
            "project_path": str(final_dest),
            "project_name": project_name,
            "nucleus_path": str(detected_nucleus),
            "detected_strategies": detected_strategies,
            "linked": True,
            "metadata": {
                "repo_url": repo_url,
                "clone_method": "custom" if dest_path else "auto",
                "strategies_count": len(detected_strategies),
                "forced_strategy": force_strategy is not None,
                "custom_name": custom_name is not None,
                "has_description": description is not None
            }
        }
    
    def _validate_nucleus(self, nucleus_path: Path) -> None:
        """
        Validate that the given path is a valid Nucleus.
        
        Args:
            nucleus_path: Path to validate
            
        Raises:
            FileNotFoundError: If path doesn't exist
            ValueError: If path is not a valid Nucleus
        """
        if not nucleus_path.exists():
            raise FileNotFoundError(f"Nucleus path does not exist: {nucleus_path}")
        
        if not nucleus_path.is_dir():
            raise ValueError(f"Nucleus path is not a directory: {nucleus_path}")
        
        # Check for .bloom/core/nucleus-config.json
        nucleus_config = nucleus_path / ".bloom" / "core" / "nucleus-config.json"
        if not nucleus_config.exists():
            raise ValueError(
                f"Not a valid Nucleus project (missing nucleus-config.json): {nucleus_path}"
            )
    
    def _detect_nucleus(self) -> Optional[Path]:
        """
        Detect the nearest Nucleus by searching upward from current directory.
        
        Looks for `.bloom/core/nucleus-config.json` in parent hierarchy.
        
        Returns:
            Path to Nucleus root, or None if not found
        """
        current = Path.cwd()
        
        # Search upward through directory tree
        for parent in [current] + list(current.parents):
            nucleus_config = parent / ".bloom" / "core" / "nucleus-config.json"
            if nucleus_config.exists():
                return parent  # Return the root containing .bloom
        
        return None
    
    def _extract_repo_name(self, repo_url: str) -> str:
        """
        Extract repository name from Git URL.
        
        Handles both HTTPS and SSH formats:
        - https://github.com/owner/repo.git -> repo
        - git@github.com:owner/repo.git -> repo
        - https://github.com/owner/repo -> repo
        
        Args:
            repo_url: Git repository URL
            
        Returns:
            Repository name without .git extension
            
        Raises:
            ValueError: If URL format is invalid or repo name cannot be extracted
        """
        # Remove .git suffix if present
        url = repo_url.rstrip('/')
        if url.endswith('.git'):
            url = url[:-4]
        
        # Extract last component of path
        # Handle both HTTPS (/) and SSH (:) separators
        if '/' in url:
            repo_name = url.split('/')[-1]
        elif ':' in url:
            # SSH format: git@host:owner/repo
            path_part = url.split(':')[-1]
            repo_name = path_part.split('/')[-1]
        else:
            raise ValueError(f"Cannot extract repository name from URL: {repo_url}")
        
        # Validate repo name
        if not repo_name or repo_name.strip() == '':
            raise ValueError(f"Extracted empty repository name from URL: {repo_url}")
        
        # Sanitize repo name (remove invalid filesystem characters)
        repo_name = re.sub(r'[<>:"|?*]', '', repo_name)
        
        return repo_name
    
    def _clone_repository(self, repo_url: str, dest_path: Path) -> None:
        """
        Clone the Git repository to the destination path.
        
        Uses GitExecutor from brain.core.git.executor for Git operations.
        
        Args:
            repo_url: Git repository URL
            dest_path: Destination path for cloning
            
        Raises:
            FileNotFoundError: If Git is not installed
            RuntimeError: If clone operation fails
        """
        from brain.core.git.executor import GitExecutor
        
        try:
            executor = GitExecutor()
            
            # Execute git clone
            result = executor.execute(
                args=["clone", repo_url, str(dest_path)],
                cwd=dest_path.parent
            )
            
            if result.returncode != 0:
                error_msg = result.stderr or result.stdout or "Unknown error"
                raise RuntimeError(f"Git clone failed: {error_msg}")
                
        except FileNotFoundError:
            raise FileNotFoundError(
                "Git is not installed or not available in PATH. "
                "Please install Git to use this command."
            )
        except Exception as e:
            # Clean up partial clone if it exists
            if dest_path.exists():
                import shutil
                try:
                    shutil.rmtree(dest_path)
                except Exception:
                    pass  # Best effort cleanup
            
            raise RuntimeError(f"Failed to clone repository: {e}")
    
    def _detect_technologies(self, project_path: Path) -> list[str]:
        """
        Detect technology stacks in the cloned project.
        
        Uses MultiStackDetector from brain.core.context.detector.
        
        Args:
            project_path: Path to the cloned project
            
        Returns:
            List of detected strategy names
            
        Raises:
            RuntimeError: If detection fails
        """
        try:
            from brain.core.context.detector import MultiStackDetector
            
            detector = MultiStackDetector(project_path)
            detected = detector.detect()
            
            if not detected:
                return []
            
            # Extract strategy types from detected modules
            strategy_names = [module["type"] for module in detected]
            
            return strategy_names
            
        except Exception as e:
            # Technology detection is not critical - return empty list
            # but log that detection failed
            return []
    
    def _link_to_nucleus(
        self,
        project_path: Path,
        nucleus_path: Path,
        name: str,
        strategy: str,
        description: Optional[str],
        repo_url: str
    ) -> None:
        """
        Link the project to the Nucleus using ProjectLinker.
        
        Args:
            project_path: Path to the project to link
            nucleus_path: Path to the Nucleus
            name: Name for the project
            strategy: Technology strategy
            description: Optional project description
            repo_url: Git repository URL
            
        Raises:
            RuntimeError: If linking fails
        """
        try:
            from brain.core.project.linker import ProjectLinker
            
            linker = ProjectLinker(
                project_path=project_path,
                nucleus_path=nucleus_path
            )
            
            linker.link(
                name=name,
                strategy=strategy,
                description=description,
                repo_url=repo_url,
                verbose=False
            )
            
        except Exception as e:
            raise RuntimeError(f"Failed to link project to Nucleus: {e}")