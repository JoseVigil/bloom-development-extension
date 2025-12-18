"""
TreeManager - Business Logic for Tree Generation
Refactored from legacy generate_tree.py to be headless-compatible.
"""

import os
import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any


class TreeManager:
    """
    Generates directory tree structures with intelligent exclusions.
    Returns pure data structures instead of printing to stdout.
    """

    EXCLUDED_DIRS = {
        'node_modules': '[... dependencies]',
        '.git': '[... git data]',
        '__pycache__': '[... cache]',
        '.next': '[... build cache]',
        '.svelte-kit': '[... svelte build]', 
        'dist': '[... build output]',
        'build': '[... build output]',
        'out': '[... output files]',
        '.venv': '[... virtual env]',
        'venv': '[... virtual env]',
        '.idea': '[... ide]',
        '.vscode': '[... ide]'
    }

    def __init__(self, root_path: Path):
        self.root = str(root_path.resolve())

    def generate(
        self, 
        targets: Optional[List[str]], 
        output_file: Path, 
        use_hash: bool = False, 
        use_json: bool = False
    ) -> Dict[str, Any]:
        """
        Generate tree structure and write to file.
        
        Returns:
            Dictionary with metadata about the generation process:
            {
                "project_hash": str (if use_hash),
                "timestamp": str,
                "statistics": {
                    "total_files": int,
                    "total_directories": int
                },
                "output_written": bool
            }
        """
        
        resolved_paths = self._resolve_paths(targets)
        file_hashes = {} if use_hash else None
        dir_hashes = {} if use_hash else None
        final_output = ""

        root_name = os.path.basename(self.root)
        final_output += f"{root_name}/\n"

        # Build tree structure
        for i, p in enumerate(resolved_paths):
            is_last = (i == len(resolved_paths) - 1)
            final_output += self._build_tree(
                p, prefix="", is_last=is_last, 
                use_hash=use_hash, file_hashes=file_hashes, 
                base_path=self.root
            )

        # Calculate hashes and add header
        project_hash = None
        if use_hash and file_hashes:
            dir_hashes = self._calculate_directory_hashes(file_hashes)
            project_hash = self._compute_directory_hash(file_hashes)
            
            header = f"\nPROJECT_HASH: {project_hash}\n"
            header += f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            header += f"Total files: {len(file_hashes)}\n"
            header += f"Total directories: {len(dir_hashes)}\n"
            header += "=" * 70 + "\n\n"
            
            final_output = header + final_output
            
            # Add directory hashes footer
            if dir_hashes:
                final_output += "\n" + "=" * 70 + "\n"
                final_output += "DIRECTORY HASHES:\n"
                for dir_path, dir_hash in sorted(dir_hashes.items()):
                    rel_dir = os.path.relpath(dir_path, self.root)
                    display_dir = rel_dir if rel_dir != '.' else root_name
                    final_output += f"  {display_dir}/ → {dir_hash}\n"

        # Clean up output
        final_output = "\n".join([line for line in final_output.split("\n")])

        # Write main tree file
        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(final_output)

        # Write JSON file if requested
        if use_hash and use_json and file_hashes:
            json_file = output_file.with_suffix('.json')
            clean_files = {k.replace('\\', '/'): v for k, v in file_hashes.items()}
            
            json_data = {
                "snapshot": {
                    "project_hash": project_hash,
                    "timestamp": datetime.now().isoformat(),
                    "root": root_name,
                    "base_path": self.root
                },
                "files": clean_files,
                "statistics": {
                    "total_files": len(file_hashes),
                    "total_directories": len(dir_hashes)
                }
            }
            
            with open(json_file, "w", encoding="utf-8") as f:
                json.dump(json_data, f, indent=2, ensure_ascii=False)

        # Return metadata (pure data)
        return {
            "project_hash": project_hash,
            "timestamp": datetime.now().isoformat(),
            "statistics": {
                "total_files": len(file_hashes) if file_hashes else 0,
                "total_directories": len(dir_hashes) if dir_hashes else 0
            },
            "output_written": True
        }

    # --- INTERNAL METHODS ---

    def _resolve_paths(self, paths: Optional[List[str]]) -> List[str]:
        """Resolve relative paths to absolute paths."""
        if not paths:
            return [self.root]
        resolved = []
        for p in paths:
            if os.path.isabs(p):
                resolved.append(p)
            else:
                resolved.append(os.path.join(self.root, p))
        return resolved

    def _compute_md5(self, filepath: str, block_size: int = 8192) -> Optional[str]:
        """Compute MD5 hash of a file."""
        try:
            md5_hash = hashlib.md5()
            with open(filepath, 'rb') as f:
                while True:
                    data = f.read(block_size)
                    if not data:
                        break
                    md5_hash.update(data)
            return md5_hash.hexdigest()
        except (FileNotFoundError, PermissionError, Exception):
            return None

    def _is_python_dependency_dir(self, path: str) -> bool:
        """
        Detect if a folder contains Python vendored libraries.
        Criterion: Contains folders ending in .dist-info (pip fingerprint).
        """
        try:
            with os.scandir(path) as it:
                for entry in it:
                    if entry.is_dir() and entry.name.endswith('.dist-info'):
                        return True
        except OSError:
            pass
        return False

    def _build_tree(
        self, 
        path: str, 
        prefix: str = "", 
        is_last: bool = True, 
        use_hash: bool = False, 
        file_hashes: Optional[Dict[str, str]] = None, 
        base_path: str = ""
    ) -> str:
        """
        Recursively build tree structure string.
        Returns the tree representation as a string.
        """
        name = os.path.basename(path.rstrip(os.sep))
        connector = "└── " if is_last else "├── "
        
        if use_hash and base_path:
            try:
                rel_path = os.path.relpath(path, base_path)
            except ValueError:
                rel_path = path
        else:
            rel_path = path

        tree_str = prefix + connector + name
        
        if os.path.isdir(path):
            tree_str += "/"
            
            # 1. Standard Exclusions (Exact name match)
            if name in self.EXCLUDED_DIRS:
                tree_str += f" {self.EXCLUDED_DIRS[name]}\n"
                return tree_str
            
            # 2. Intelligent Python Library Detection
            # Collapse if named 'libs', 'lib', or 'site-packages' with pip fingerprint
            if name in ('libs', 'lib', 'site-packages'):
                if self._is_python_dependency_dir(path):
                    tree_str += " [... python vendored dependencies]\n"
                    return tree_str

            if use_hash and file_hashes is not None:
                tree_str += " [DIR]"
        else:
            if use_hash and file_hashes is not None:
                file_hash = self._compute_md5(path)
                if file_hash:
                    file_hashes[rel_path] = file_hash
                    padding = max(0, 50 - len(prefix) - len(connector) - len(name))
                    tree_str += " " + "." * padding + " " + file_hash[:16]
        
        tree_str += "\n"

        if not os.path.isdir(path):
            return tree_str

        # List directory contents
        try:
            entries = sorted(os.listdir(path))
        except Exception:
            return tree_str

        new_prefix = prefix + ("    " if is_last else "│   ")

        # Recursively process entries
        for i, entry in enumerate(entries):
            full = os.path.join(path, entry)
            is_last_entry = (i == len(entries) - 1)
            tree_str += self._build_tree(
                full, new_prefix, is_last_entry, 
                use_hash, file_hashes, base_path
            )

        return tree_str

    def _calculate_directory_hashes(self, file_hashes: Dict[str, str]) -> Dict[str, str]:
        """Calculate MD5 hashes for each directory based on its files."""
        dir_hashes = {}
        dir_files = {}
        
        for file_path, file_hash in file_hashes.items():
            dir_name = os.path.dirname(file_path)
            if dir_name == '.':
                dir_name = ''
            if dir_name:
                if dir_name not in dir_files:
                    dir_files[dir_name] = {}
                dir_files[dir_name][file_path] = file_hash
        
        for dir_path, files in dir_files.items():
            dir_hashes[dir_path] = self._compute_directory_hash(files)
        
        return dir_hashes

    def _compute_directory_hash(self, files_dict: Dict[str, str]) -> str:
        """Compute hash for a directory based on all file hashes."""
        combined = "".join(sorted(files_dict.values()))
        return hashlib.md5(combined.encode()).hexdigest()