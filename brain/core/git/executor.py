"""
Git Command Executor
Subprocess wrapper for Git operations with cross-platform support.
"""

import subprocess
import shutil
import sys
from pathlib import Path
from typing import Optional, Callable, List, Tuple


class GitExecutor:
    """
    Cross-platform Git command executor.
    
    Pure business logic - raises exceptions on errors.
    Progress callbacks for long operations.
    """
    
    def __init__(self, cwd: Optional[Path] = None):
        """
        Initialize executor.
        
        Args:
            cwd: Working directory for git commands
        """
        self.cwd = cwd or Path.cwd()
        self._git_path: Optional[str] = None
    
    @property
    def git_path(self) -> str:
        """
        Get git executable path (cached).
        
        Returns:
            Path to git executable
            
        Raises:
            FileNotFoundError: If git not found
        """
        if self._git_path:
            return self._git_path
        
        # Try to find git in PATH
        git = shutil.which("git")
        if git:
            self._git_path = git
            return git
        
        # Platform-specific search
        if sys.platform == "win32":
            common_paths = [
                r"C:\Program Files\Git\cmd\git.exe",
                r"C:\Program Files (x86)\Git\cmd\git.exe",
            ]
            for path in common_paths:
                if Path(path).exists():
                    self._git_path = path
                    return path
        
        raise FileNotFoundError(
            "Git not found. Please install Git from https://git-scm.com/downloads"
        )
    
    def run(
        self,
        args: List[str],
        cwd: Optional[Path] = None,
        capture_output: bool = True,
        timeout: int = 30,
        check: bool = True
    ) -> Tuple[str, str]:
        """
        Run git command.
        
        Args:
            args: Git command arguments (without 'git' prefix)
            cwd: Working directory (overrides instance cwd)
            capture_output: Capture stdout/stderr
            timeout: Command timeout in seconds
            check: Raise exception on non-zero exit
            
        Returns:
            Tuple of (stdout, stderr)
            
        Raises:
            subprocess.CalledProcessError: On command failure
            subprocess.TimeoutExpired: On timeout
        """
        cmd = [self.git_path] + args
        work_dir = cwd or self.cwd
        
        result = subprocess.run(
            cmd,
            cwd=str(work_dir),
            capture_output=capture_output,
            text=True,
            timeout=timeout,
            check=check
        )
        
        return result.stdout, result.stderr
    
    def run_with_progress(
        self,
        args: List[str],
        cwd: Optional[Path] = None,
        on_output: Optional[Callable[[str], None]] = None,
        timeout: int = 300
    ) -> None:
        """
        Run git command with real-time output streaming.
        
        Useful for long operations like clone/fetch.
        
        Args:
            args: Git command arguments
            cwd: Working directory
            on_output: Callback for each line of output
            timeout: Command timeout in seconds
            
        Raises:
            subprocess.CalledProcessError: On command failure
        """
        cmd = [self.git_path] + args
        work_dir = cwd or self.cwd
        
        process = subprocess.Popen(
            cmd,
            cwd=str(work_dir),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1
        )
        
        try:
            if process.stdout:
                for line in process.stdout:
                    line = line.rstrip()
                    if on_output:
                        on_output(line)
            
            exit_code = process.wait(timeout=timeout)
            
            if exit_code != 0:
                raise subprocess.CalledProcessError(
                    exit_code,
                    cmd,
                    output="See output above"
                )
                
        except subprocess.TimeoutExpired:
            process.kill()
            raise
    
    def is_repository(self, path: Optional[Path] = None) -> bool:
        """
        Check if path is a git repository.
        
        Args:
            path: Path to check (defaults to cwd)
            
        Returns:
            True if git repository, False otherwise
        """
        check_path = path or self.cwd
        
        try:
            self.run(
                ["rev-parse", "--git-dir"],
                cwd=check_path,
                timeout=5
            )
            return True
        except (subprocess.CalledProcessError, FileNotFoundError):
            return False
    
    def init(self, path: Optional[Path] = None) -> None:
        """
        Initialize new git repository.
        
        Args:
            path: Path to initialize (defaults to cwd)
            
        Raises:
            subprocess.CalledProcessError: On failure
        """
        init_path = path or self.cwd
        init_path.mkdir(parents=True, exist_ok=True)
        
        self.run(["init"], cwd=init_path)
    
    def clone(
        self,
        url: str,
        target: Path,
        on_progress: Optional[Callable[[str], None]] = None
    ) -> None:
        """
        Clone repository.
        
        Args:
            url: Repository URL
            target: Target directory
            on_progress: Progress callback
            
        Raises:
            subprocess.CalledProcessError: On failure
        """
        # Ensure parent directory exists
        target.parent.mkdir(parents=True, exist_ok=True)
        
        args = ["clone", url, str(target)]
        
        if on_progress:
            self.run_with_progress(
                args,
                cwd=target.parent,
                on_output=on_progress,
                timeout=600  # 10 minutes for large repos
            )
        else:
            self.run(args, cwd=target.parent, timeout=600)
    
    def add_remote(
        self,
        name: str,
        url: str,
        path: Optional[Path] = None
    ) -> None:
        """
        Add remote to repository.
        
        Args:
            name: Remote name (e.g., 'origin')
            url: Remote URL
            path: Repository path
            
        Raises:
            subprocess.CalledProcessError: On failure
        """
        self.run(["remote", "add", name, url], cwd=path)
    
    def get_remote_url(
        self,
        name: str = "origin",
        path: Optional[Path] = None
    ) -> Optional[str]:
        """
        Get remote URL.
        
        Args:
            name: Remote name
            path: Repository path
            
        Returns:
            Remote URL or None if not found
        """
        try:
            stdout, _ = self.run(
                ["remote", "get-url", name],
                cwd=path,
                check=False
            )
            return stdout.strip() or None
        except subprocess.CalledProcessError:
            return None
    
    def has_remote(
        self,
        name: str = "origin",
        path: Optional[Path] = None
    ) -> bool:
        """
        Check if remote exists.
        
        Args:
            name: Remote name
            path: Repository path
            
        Returns:
            True if remote exists
        """
        try:
            stdout, _ = self.run(["remote"], cwd=path)
            remotes = stdout.strip().split("\n")
            return name in remotes
        except subprocess.CalledProcessError:
            return False
    
    def get_status(
        self,
        path: Optional[Path] = None,
        porcelain: bool = True
    ) -> str:
        """
        Get repository status.
        
        Args:
            path: Repository path
            porcelain: Use porcelain format (machine-readable)
            
        Returns:
            Status output
        """
        args = ["status"]
        if porcelain:
            args.append("--porcelain")
        
        stdout, _ = self.run(args, cwd=path)
        return stdout
    
    def add_all(self, path: Optional[Path] = None) -> None:
        """
        Stage all changes.
        
        Args:
            path: Repository path
        """
        self.run(["add", "."], cwd=path)
    
    def commit(
        self,
        message: str,
        path: Optional[Path] = None
    ) -> None:
        """
        Commit staged changes.
        
        Args:
            message: Commit message
            path: Repository path
            
        Raises:
            subprocess.CalledProcessError: On failure
        """
        self.run(["commit", "-m", message], cwd=path)
    
    def push(
        self,
        remote: str = "origin",
        branch: Optional[str] = None,
        path: Optional[Path] = None,
        set_upstream: bool = False
    ) -> None:
        """
        Push commits to remote.
        
        Args:
            remote: Remote name
            branch: Branch name (current branch if None)
            path: Repository path
            set_upstream: Set upstream tracking
            
        Raises:
            subprocess.CalledProcessError: On failure
        """
        args = ["push"]
        
        if set_upstream:
            args.extend(["-u", remote])
            if branch:
                args.append(branch)
        else:
            args.append(remote)
            if branch:
                args.append(branch)
        
        self.run(args, cwd=path, timeout=300)
    
    def get_current_branch(
        self,
        path: Optional[Path] = None
    ) -> Optional[str]:
        """
        Get current branch name.
        
        Args:
            path: Repository path
            
        Returns:
            Branch name or None
        """
        try:
            stdout, _ = self.run(
                ["rev-parse", "--abbrev-ref", "HEAD"],
                cwd=path
            )
            return stdout.strip() or None
        except subprocess.CalledProcessError:
            return None