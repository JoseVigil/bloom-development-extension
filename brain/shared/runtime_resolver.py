"""
Runtime path resolver for Brain CLI.
Provides platform-specific paths for Brain runtime installation.
"""
import platform
import sys
from pathlib import Path
from typing import Optional


class RuntimeResolver:
    """Resolves platform-specific runtime paths for Brain CLI."""
    
    @staticmethod
    def get_home_dir() -> Path:
        """Get user home directory."""
        return Path.home()
    
    @staticmethod
    def get_platform() -> str:
        """Get current platform identifier."""
        return platform.system()
    
    @staticmethod
    def get_python_version() -> str:
        """Get Python version (e.g., '3.11')."""
        return f"{sys.version_info.major}.{sys.version_info.minor}"
    
    @staticmethod
    def get_runtime_base_dir() -> Path:
        """
        Get the base runtime directory for current platform.
        
        Returns:
            Path to BloomNucleus/engine/runtime directory
        
        Examples:
            Windows: C:/Users/<user>/AppData/Local/BloomNucleus/engine/runtime
            macOS: ~/Library/Application Support/BloomNucleus/engine/runtime
            Linux: ~/.local/share/BloomNucleus/engine/runtime
        """
        home = RuntimeResolver.get_home_dir()
        system = RuntimeResolver.get_platform()
        
        if system == "Windows":
            return home / "AppData" / "Local" / "BloomNucleus" / "engine" / "runtime"
        elif system == "Darwin":
            return home / "Library" / "Application Support" / "BloomNucleus" / "engine" / "runtime"
        else:  # Linux
            return home / ".local" / "share" / "BloomNucleus" / "engine" / "runtime"
    
    @staticmethod
    def get_site_packages_dir() -> Path:
        """
        Get the site-packages directory for current platform.
        
        Returns:
            Path to site-packages within runtime
        
        Examples:
            Windows: <runtime>/Lib/site-packages
            macOS: <runtime>/lib/python3.11/site-packages
            Linux: <runtime>/lib/python3.11/site-packages
        """
        base = RuntimeResolver.get_runtime_base_dir()
        system = RuntimeResolver.get_platform()
        
        if system == "Windows":
            return base / "Lib" / "site-packages"
        else:  # macOS and Linux
            py_version = RuntimeResolver.get_python_version()
            return base / "lib" / f"python{py_version}" / "site-packages"
    
    @staticmethod
    def get_brain_package_dir() -> Path:
        """
        Get the brain package directory.
        
        Returns:
            Path to brain package within site-packages
        """
        return RuntimeResolver.get_site_packages_dir() / "brain"
    
    @staticmethod
    def get_brain_main_path() -> Path:
        """
        Get the path to brain/__main__.py for direct execution.
        
        Returns:
            Path to brain/__main__.py
        
        Examples:
            Windows: <site-packages>/brain/__main__.py
            macOS: <site-packages>/brain/__main__.py
            Linux: <site-packages>/brain/__main__.py
        """
        return RuntimeResolver.get_brain_package_dir() / "__main__.py"
    
    @staticmethod
    def get_python_executable() -> Path:
        """
        Get the Python executable path within runtime.
        
        Returns:
            Path to python executable
        
        Examples:
            Windows: <runtime>/python.exe
            macOS: <runtime>/bin/python3
            Linux: <runtime>/bin/python3
        """
        base = RuntimeResolver.get_runtime_base_dir()
        system = RuntimeResolver.get_platform()
        
        if system == "Windows":
            return base / "python.exe"
        else:  # macOS and Linux
            return base / "bin" / "python3"
    
    @staticmethod
    def get_execution_command(brain_args: list[str]) -> list[str]:
        """
        Build the complete execution command for Brain CLI.
        
        Args:
            brain_args: Arguments to pass to brain (e.g., ['health', 'check'])
        
        Returns:
            Complete command as list for subprocess
        
        Example:
            >>> RuntimeResolver.get_execution_command(['health', 'check'])
            ['python', '/path/to/brain/__main__.py', '--json', 'health', 'check']
        """
        python_exe = str(RuntimeResolver.get_python_executable())
        brain_main = str(RuntimeResolver.get_brain_main_path())
        
        return [python_exe, brain_main, '--json'] + brain_args
    
    @staticmethod
    def get_execution_example(brain_args: list[str], use_relative: bool = False) -> str:
        """
        Get a formatted execution example for documentation.
        
        Args:
            brain_args: Brain command arguments
            use_relative: If True, use relative path from site-packages
        
        Returns:
            Formatted command string for display
        
        Example:
            >>> RuntimeResolver.get_execution_example(['nucleus', 'list'])
            'python <RUNTIME>/brain/__main__.py --json nucleus list'
        """
        system = RuntimeResolver.get_platform()
        
        if use_relative:
            brain_path = "brain/__main__.py"
        else:
            if system == "Windows":
                brain_path = "%LOCALAPPDATA%\\BloomNucleus\\engine\\runtime\\Lib\\site-packages\\brain\\__main__.py"
            elif system == "Darwin":
                brain_path = "~/Library/Application\\ Support/BloomNucleus/engine/runtime/lib/python3.x/site-packages/brain/__main__.py"
            else:
                brain_path = "~/.local/share/BloomNucleus/engine/runtime/lib/python3.x/site-packages/brain/__main__.py"
        
        args_str = " ".join(brain_args)
        return f"python {brain_path} --json {args_str}"
    
    @staticmethod
    def verify_runtime_exists() -> tuple[bool, Optional[str]]:
        """
        Verify that the runtime installation exists.
        
        Returns:
            Tuple of (exists: bool, error_message: Optional[str])
        """
        brain_main = RuntimeResolver.get_brain_main_path()
        
        if not brain_main.exists():
            return False, f"Brain runtime not found at: {brain_main}"
        
        python_exe = RuntimeResolver.get_python_executable()
        if not python_exe.exists():
            return False, f"Python executable not found at: {python_exe}"
        
        return True, None


# Convenience functions for common use cases
def get_runtime_example() -> str:
    """Get platform-specific runtime path example for documentation."""
    return RuntimeResolver.get_execution_example(['<command>', '<args>'], use_relative=False)


def get_brain_command(args: list[str]) -> list[str]:
    """
    Quick helper to build brain command.
    
    Example:
        >>> get_brain_command(['health', 'check'])
        ['python', '/path/to/__main__.py', '--json', 'health', 'check']
    """
    return RuntimeResolver.get_execution_command(args)


def format_command_for_display(args: list[str]) -> str:
    """
    Format command for user-facing display.
    
    Example:
        >>> format_command_for_display(['nucleus', 'list'])
        'python brain/__main__.py --json nucleus list'
    """
    return RuntimeResolver.get_execution_example(args, use_relative=True)


if __name__ == "__main__":
    # Demo/test when run directly
    print("=== Brain Runtime Resolver ===\n")
    
    print(f"Platform: {RuntimeResolver.get_platform()}")
    print(f"Python Version: {RuntimeResolver.get_python_version()}")
    print(f"\nRuntime Base: {RuntimeResolver.get_runtime_base_dir()}")
    print(f"Site Packages: {RuntimeResolver.get_site_packages_dir()}")
    print(f"Brain Package: {RuntimeResolver.get_brain_package_dir()}")
    print(f"Brain Main: {RuntimeResolver.get_brain_main_path()}")
    print(f"Python Exe: {RuntimeResolver.get_python_executable()}")
    
    print("\n=== Execution Examples ===\n")
    print("Relative path:")
    print(f"  {format_command_for_display(['health', 'check'])}")
    
    print("\nFull path:")
    print(f"  {RuntimeResolver.get_execution_example(['health', 'check'])}")
    
    print("\n=== Runtime Verification ===\n")
    exists, error = RuntimeResolver.verify_runtime_exists()
    if exists:
        print("✅ Runtime installation verified")
    else:
        print(f"❌ Runtime verification failed: {error}")