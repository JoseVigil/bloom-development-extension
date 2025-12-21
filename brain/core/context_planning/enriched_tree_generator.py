"""
summary: Generates enriched directory trees with semantic metadata for AI context planning
keywords: tree, metadata, semantic, analysis, centrality, summary, bloom-meta

Enriched Tree Generator for Context Planning.
Extends standard tree generation with semantic metadata extracted from file headers.
"""

import re
import ast
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Any, Set
from collections import defaultdict


class EnrichedTreeGenerator:
    """
    Generates directory trees enriched with semantic metadata.
    
    Extracts metadata from [BLOOM-META] headers in files and calculates
    structural importance metrics (centrality, size penalty).
    """
    
    def __init__(self, root_path: Path):
        """
        Initialize the generator.
        
        Args:
            root_path: Root directory to analyze
        """
        self.root = root_path
        self.file_metadata = {}
        self.dependency_graph = defaultdict(set)
        self.reverse_deps = defaultdict(set)
    
    def generate(
        self,
        targets: Optional[List[str]] = None,
        include_hash: bool = False
    ) -> str:
        """
        Generate enriched tree structure.
        
        Args:
            targets: Specific paths to include (None = all)
            include_hash: Include MD5 hashes
            
        Returns:
            Enriched tree as string
        """
        # 1. Collect files
        resolved_paths = self._resolve_paths(targets)
        files = []
        for path in resolved_paths:
            files.extend(self._collect_files(Path(path)))
        
        # 2. Extract metadata from all files
        for file_path in files:
            self._extract_file_metadata(file_path)
        
        # 3. Build dependency graph
        self._build_dependency_graph()
        
        # 4. Calculate centrality scores
        centrality_scores = self._calculate_centrality()
        
        # 5. Generate tree output
        tree_output = self._build_tree_output(
            resolved_paths,
            centrality_scores,
            include_hash
        )
        
        return tree_output
    
    def _resolve_paths(self, paths: Optional[List[str]]) -> List[Path]:
        """Resolve relative paths to absolute."""
        if not paths:
            return [self.root]
        
        resolved = []
        for p in paths:
            path = Path(p)
            if not path.is_absolute():
                path = self.root / path
            resolved.append(path)
        return resolved
    
    def _collect_files(self, path: Path) -> List[Path]:
        """Recursively collect all files in path."""
        if path.is_file():
            return [path]
        
        files = []
        try:
            for item in path.rglob('*'):
                if item.is_file() and not self._should_skip(item):
                    files.append(item)
        except PermissionError:
            pass
        
        return files
    
    def _should_skip(self, path: Path) -> bool:
        """Check if path should be skipped."""
        skip_dirs = {
            'node_modules', '.git', '__pycache__', '.venv', 'venv',
            'dist', 'build', '.next', '.idea', '.vscode'
        }
        
        return any(skip_dir in path.parts for skip_dir in skip_dirs)
    
    def _extract_file_metadata(self, file_path: Path) -> None:
        """
        Extract metadata from file.
        
        Reads [BLOOM-META] header:
        summary: One-line description
        keywords: comma, separated, keywords
        """
        try:
            content = file_path.read_text(encoding='utf-8')
        except (UnicodeDecodeError, PermissionError):
            return
        
        # Extract header metadata
        summary = None
        keywords = []
        
        # Check for [BLOOM-META] format in docstring
        docstring = self._extract_docstring(content, file_path.suffix)
        if docstring:
            summary_match = re.search(r'^summary:\s*(.+)$', docstring, re.MULTILINE)
            keywords_match = re.search(r'^keywords:\s*(.+)$', docstring, re.MULTILINE)
            
            if summary_match:
                summary = summary_match.group(1).strip()
            if keywords_match:
                keywords = [k.strip() for k in keywords_match.group(1).split(',')]
        
        # Calculate metrics
        loc = len([line for line in content.split('\n') if line.strip()])
        size_penalty = self._calculate_size_penalty(loc)
        
        # Extract imports for dependency graph
        imports = self._extract_imports(content, file_path.suffix)
        
        # Store metadata
        rel_path = str(file_path.relative_to(self.root))
        self.file_metadata[rel_path] = {
            'summary': summary or self._generate_fallback_summary(file_path),
            'keywords': keywords,
            'loc': loc,
            'size_penalty': size_penalty,
            'imports': imports,
            'language': self._detect_language(file_path.suffix)
        }
    
    def _extract_docstring(self, content: str, suffix: str) -> Optional[str]:
        """Extract docstring from file content."""
        if suffix == '.py':
            try:
                tree = ast.parse(content)
                return ast.get_docstring(tree)
            except SyntaxError:
                pass
        
        elif suffix in ['.ts', '.tsx', '.js', '.jsx']:
            # Extract JSDoc or first multi-line comment
            match = re.search(r'/\*\*(.*?)\*/', content, re.DOTALL)
            if match:
                return match.group(1)
        
        return None
    
    def _generate_fallback_summary(self, file_path: Path) -> str:
        """Generate basic summary from filename."""
        name = file_path.stem
        # Convert snake_case or camelCase to readable
        readable = re.sub(r'[_-]', ' ', name)
        readable = re.sub(r'([a-z])([A-Z])', r'\1 \2', readable)
        return f"{readable.title()} module"
    
    def _calculate_size_penalty(self, loc: int) -> float:
        """
        Calculate penalty based on file size.
        
        <200 LOC = 1.0 (no penalty)
        200-500 = 0.9
        500-1000 = 0.7
        1000-2000 = 0.5
        >2000 = 0.3
        """
        if loc < 200:
            return 1.0
        elif loc < 500:
            return 0.9
        elif loc < 1000:
            return 0.7
        elif loc < 2000:
            return 0.5
        else:
            return 0.3
    
    def _extract_imports(self, content: str, suffix: str) -> List[str]:
        """Extract import statements to build dependency graph."""
        imports = []
        
        if suffix == '.py':
            # Python imports
            import_pattern = r'(?:from\s+([.\w]+)\s+import|import\s+([.\w]+))'
            for match in re.finditer(import_pattern, content):
                imp = match.group(1) or match.group(2)
                if imp and imp.startswith('.'):  # Relative import
                    imports.append(imp)
        
        elif suffix in ['.ts', '.tsx', '.js', '.jsx']:
            # TypeScript/JavaScript imports
            import_pattern = r'import\s+.*?\s+from\s+[\'"]([^\'"]+)[\'"]'
            for match in re.finditer(import_pattern, content):
                imp = match.group(1)
                if imp.startswith('.'):  # Relative import
                    imports.append(imp)
        
        return imports
    
    def _detect_language(self, suffix: str) -> str:
        """Detect language from file extension."""
        lang_map = {
            '.py': 'python',
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript',
            '.jsx': 'javascript',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.go': 'go',
            '.rs': 'rust',
            '.rb': 'ruby',
            '.php': 'php',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.md': 'markdown',
            '.json': 'json',
            '.yaml': 'yaml',
            '.yml': 'yaml'
        }
        return lang_map.get(suffix, 'text')
    
    def _build_dependency_graph(self) -> None:
        """Build dependency graph from imports."""
        for file_path, metadata in self.file_metadata.items():
            for imp in metadata['imports']:
                # Resolve relative import to file path
                resolved = self._resolve_import(file_path, imp)
                if resolved and resolved in self.file_metadata:
                    self.dependency_graph[file_path].add(resolved)
                    self.reverse_deps[resolved].add(file_path)
    
    def _resolve_import(self, from_file: str, import_path: str) -> Optional[str]:
        """Resolve relative import to actual file path."""
        from_dir = Path(from_file).parent
        
        # Handle relative imports
        if import_path.startswith('.'):
            # Remove leading dots and build path
            levels_up = len(import_path) - len(import_path.lstrip('.'))
            import_path_clean = import_path.lstrip('.')
            
            target_dir = from_dir
            for _ in range(levels_up - 1):
                target_dir = target_dir.parent
            
            # Try various extensions
            for ext in ['.py', '.ts', '.tsx', '.js', '.jsx']:
                resolved = target_dir / f"{import_path_clean}{ext}"
                if str(resolved) in self.file_metadata:
                    return str(resolved)
        
        return None
    
    def _calculate_centrality(self) -> Dict[str, float]:
        """
        Calculate PageRank-style centrality scores.
        
        Returns:
            Dict mapping file paths to centrality scores (0.0-1.0)
        """
        if not self.reverse_deps:
            return {}
        
        # Simple centrality: normalize in-degree
        max_deps = max(len(deps) for deps in self.reverse_deps.values()) or 1
        
        centrality = {}
        for file_path in self.file_metadata.keys():
            in_degree = len(self.reverse_deps.get(file_path, set()))
            centrality[file_path] = in_degree / max_deps
        
        return centrality
    
    def _build_tree_output(
        self,
        root_paths: List[Path],
        centrality: Dict[str, float],
        include_hash: bool
    ) -> str:
        """Build the enriched tree output string."""
        lines = []
        
        # Header
        lines.append("=" * 80)
        lines.append("BLOOM ENRICHED CODEBASE TREE")
        lines.append("=" * 80)
        lines.append("")
        lines.append(f"Total Files: {len(self.file_metadata)}")
        lines.append("")
        lines.append("LEGEND:")
        lines.append("  [CORE] = High centrality (many files depend on this)")
        lines.append("  [LEAF] = Low centrality (isolated file)")
        lines.append("  [LARGE] = >1000 LOC (size penalty applied)")
        lines.append("")
        lines.append("=" * 80)
        lines.append("")
        
        # Group files by directory
        by_directory = defaultdict(list)
        for file_path, metadata in self.file_metadata.items():
            dir_name = str(Path(file_path).parent)
            by_directory[dir_name].append((file_path, metadata))
        
        # Render each directory
        for dir_name in sorted(by_directory.keys()):
            lines.append(f"📁 {dir_name}/")
            lines.append("")
            
            for file_path, metadata in sorted(by_directory[dir_name]):
                lines.extend(self._render_file_entry(
                    file_path,
                    metadata,
                    centrality.get(file_path, 0.0),
                    include_hash
                ))
                lines.append("")
        
        return '\n'.join(lines)
    
    def _render_file_entry(
        self,
        file_path: str,
        metadata: Dict[str, Any],
        centrality: float,
        include_hash: bool
    ) -> List[str]:
        """Render a single file entry with metadata."""
        lines = []
        
        filename = Path(file_path).name
        badges = self._generate_badges(metadata, centrality)
        
        # File line
        file_line = f"  📄 {filename} {badges}"
        lines.append(file_line)
        
        # Summary
        summary = metadata['summary']
        loc = metadata['loc']
        lang = metadata['language']
        lines.append(f"     └─ {summary} ({loc} LOC, {lang})")
        
        # Additional details if keywords present
        if metadata['keywords']:
            keywords_str = ', '.join(metadata['keywords'][:5])
            lines.append(f"     └─ Keywords: {keywords_str}")
        
        # Hash if requested
        if include_hash:
            try:
                full_path = self.root / file_path
                file_hash = self._compute_md5(full_path)
                lines.append(f"     └─ Hash: {file_hash[:16]}")
            except Exception:
                pass
        
        return lines
    
    def _generate_badges(self, metadata: Dict[str, Any], centrality: float) -> str:
        """Generate visual badges for file."""
        badges = []
        
        # Centrality
        if centrality >= 0.7:
            badges.append("[CORE]")
        elif centrality == 0.0:
            badges.append("[LEAF]")
        
        # Size
        if metadata['loc'] > 1000:
            badges.append("[LARGE]")
        
        # Keywords
        keywords = metadata.get('keywords', [])
        if 'api' in keywords or 'endpoint' in keywords:
            badges.append("[API]")
        if 'async' in keywords:
            badges.append("[ASYNC]")
        if 'database' in keywords or 'orm' in keywords:
            badges.append("[DB]")
        
        return ' '.join(badges)
    
    def _compute_md5(self, filepath: Path) -> str:
        """Compute MD5 hash of file."""
        md5_hash = hashlib.md5()
        with open(filepath, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b""):
                md5_hash.update(chunk)
        return md5_hash.hexdigest()
