import os
import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import List, Optional

class TreeManager:
    """
    Port directo del script 'generate_tree.py' legacy.
    Mantiene la lógica exacta de visualización y hashing.
    Incluye detección inteligente de librerías vendored de Python.
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

    def generate(self, targets: List[str], output_file: Path, 
                 use_hash: bool = False, use_json: bool = False):
        
        resolved_paths = self._resolve_paths(targets)
        file_hashes = {} if use_hash else None
        dir_hashes = {} if use_hash else None
        final_output = ""

        root_name = os.path.basename(self.root)
        final_output += f"{root_name}/\n"

        for i, p in enumerate(resolved_paths):
            is_last = (i == len(resolved_paths) - 1)
            final_output += self._build_tree(
                p, prefix="", is_last=is_last, 
                use_hash=use_hash, file_hashes=file_hashes, 
                base_path=self.root
            )

        if use_hash and file_hashes:
            dir_hashes = self._calculate_directory_hashes(file_hashes)
            project_hash = self._compute_directory_hash(file_hashes)
            
            header = f"\nPROJECT_HASH: {project_hash}\n"
            header += f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n"
            header += f"Total files: {len(file_hashes)}\n"
            header += f"Total directories: {len(dir_hashes)}\n"
            header += "=" * 70 + "\n\n"
            
            final_output = header + final_output
            
            if dir_hashes:
                final_output += "\n" + "=" * 70 + "\n"
                final_output += "DIRECTORY HASHES:\n"
                for dir_path, dir_hash in sorted(dir_hashes.items()):
                    rel_dir = os.path.relpath(dir_path, self.root)
                    display_dir = rel_dir if rel_dir != '.' else root_name
                    final_output += f"  {display_dir}/ → {dir_hash}\n"

        final_output = "\n".join([line for line in final_output.split("\n")])

        output_file.parent.mkdir(parents=True, exist_ok=True)
        with open(output_file, "w", encoding="utf-8") as f:
            f.write(final_output)

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

    # --- MÉTODOS INTERNOS ---

    def _resolve_paths(self, paths: Optional[List[str]]) -> List[str]:
        if not paths:
            return [self.root]
        resolved = []
        for p in paths:
            if os.path.isabs(p):
                resolved.append(p)
            else:
                resolved.append(os.path.join(self.root, p))
        return resolved

    def _compute_md5(self, filepath, block_size=8192):
        try:
            md5_hash = hashlib.md5()
            with open(filepath, 'rb') as f:
                while True:
                    data = f.read(block_size)
                    if not data: break
                    md5_hash.update(data)
            return md5_hash.hexdigest()
        except (FileNotFoundError, PermissionError, Exception):
            return None

    def _is_python_dependency_dir(self, path: str) -> bool:
        """
        Detecta si una carpeta es una colección de librerías de Python vendored.
        Criterio: Contiene carpetas que terminan en .dist-info (huella de pip).
        """
        try:
            with os.scandir(path) as it:
                for entry in it:
                    if entry.is_dir() and entry.name.endswith('.dist-info'):
                        return True
        except OSError:
            pass
        return False

    def _build_tree(self, path, prefix="", is_last=True, use_hash=False, file_hashes=None, base_path=""):
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
            
            # 1. Exclusiones Estándar (Nombre exacto)
            if name in self.EXCLUDED_DIRS:
                tree_str += f" {self.EXCLUDED_DIRS[name]}\n"
                return tree_str
            
            # 2. Exclusión Inteligente de Python Libs
            # Si se llama 'libs', 'lib' o 'site-packages' y tiene huella de pip -> Colapsar
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

        try:
            entries = sorted(os.listdir(path))
        except Exception:
            return tree_str

        new_prefix = prefix + ("    " if is_last else "│   ")

        for i, entry in enumerate(entries):
            full = os.path.join(path, entry)
            is_last_entry = (i == len(entries) - 1)
            tree_str += self._build_tree(full, new_prefix, is_last_entry, use_hash, file_hashes, base_path)

        return tree_str

    def _calculate_directory_hashes(self, file_hashes):
        dir_hashes = {}
        dir_files = {}
        for file_path, file_hash in file_hashes.items():
            dir_name = os.path.dirname(file_path)
            if dir_name == '.': dir_name = ''
            if dir_name:
                if dir_name not in dir_files: dir_files[dir_name] = {}
                dir_files[dir_name][file_path] = file_hash
        
        for dir_path, files in dir_files.items():
            dir_hashes[dir_path] = self._compute_directory_hash(files)
        return dir_hashes

    def _compute_directory_hash(self, files_dict):
        combined = "".join(sorted(files_dict.values()))
        return hashlib.md5(combined.encode()).hexdigest()