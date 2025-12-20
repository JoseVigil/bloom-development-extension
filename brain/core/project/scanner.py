"""
Pure business logic for scanning directories and detecting projects.
"""

from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional


@dataclass
class DetectedProject:
    """
    Detected project with metadata.
    
    Attributes:
        path: Absolute path to the project directory
        name: Project directory name
        strategy: Detected strategy type (e.g., 'android', 'typescript')
        confidence: Confidence level ('high', 'medium', 'low')
        indicators_found: List of indicator files that confirmed detection
    """
    path: Path
    name: str
    strategy: str
    confidence: str
    indicators_found: List[str]


class ProjectScanner:
    """
    Scans directories looking for detectable projects.
    
    Uses the existing MultiStackDetector system to identify project types
    and calculates confidence based on the number of indicators found.
    """
    
    def __init__(self):
        """
        Initialize the scanner with detector and strategy loader.
        
        Uses lazy imports to avoid circular dependencies.
        """
        from brain.core.context.detector import MultiStackDetector
        from brain.core.context.strategy_loader import StrategyLoader
        
        self.detector = MultiStackDetector()
        self.loader = StrategyLoader()
    
    def scan(
        self,
        parent_path: Path,
        max_depth: int = 3,
        strategy_filter: Optional[str] = None
    ) -> List[DetectedProject]:
        """
        Scan parent_path looking for projects.
        
        Args:
            parent_path: Parent directory to scan
            max_depth: Maximum depth for recursive search
            strategy_filter: Only detect this strategy (optional)
            
        Returns:
            List of detected projects, sorted by confidence (high -> medium -> low)
            
        Raises:
            FileNotFoundError: If parent_path does not exist
            NotADirectoryError: If parent_path is not a directory
        """
        # Validations
        if not parent_path.exists():
            raise FileNotFoundError(f"Path does not exist: {parent_path}")
        
        if not parent_path.is_dir():
            raise NotADirectoryError(f"Path is not a directory: {parent_path}")
        
        projects = []
        
        # Scan recursively
        for subdir in self._walk_directories(parent_path, max_depth):
            # Detect strategy
            strategy = self.detector.detect(subdir)
            
            if strategy:
                # Apply filter if exists
                if strategy_filter and strategy != strategy_filter:
                    continue
                
                # Calculate confidence
                confidence = self._calculate_confidence(subdir, strategy)
                
                # Get found indicators
                indicators = self._get_found_indicators(subdir, strategy)
                
                project = DetectedProject(
                    path=subdir,
                    name=subdir.name,
                    strategy=strategy,
                    confidence=confidence,
                    indicators_found=indicators
                )
                
                projects.append(project)
        
        # Sort by confidence
        return sorted(projects, key=lambda p: self._confidence_rank(p.confidence))
    
    def _walk_directories(self, root: Path, max_depth: int) -> List[Path]:
        """
        Traverse directories up to max_depth.
        
        Args:
            root: Root directory to start from
            max_depth: Maximum depth to traverse
            
        Returns:
            List of all directories found (excluding skipped ones)
        """
        directories = []
        
        def recurse(path: Path, depth: int):
            if depth > max_depth:
                return
            
            try:
                for item in path.iterdir():
                    if item.is_dir() and not self._should_skip(item):
                        directories.append(item)
                        recurse(item, depth + 1)
            except PermissionError:
                # Skip directories without permission
                pass
        
        recurse(root, 0)
        return directories
    
    def _should_skip(self, path: Path) -> bool:
        """
        Determine if this directory should be skipped.
        
        Skips common directories that are unlikely to be projects:
        - Version control (.git)
        - Dependencies (node_modules, venv)
        - Build artifacts (build, dist)
        - IDE configs (.idea, .vscode)
        - Python cache (__pycache__)
        
        Args:
            path: Directory path to check
            
        Returns:
            True if directory should be skipped, False otherwise
        """
        skip_patterns = [
            'node_modules',
            '.git',
            '__pycache__',
            'venv',
            '.venv',
            'env',
            '.env',
            'build',
            'dist',
            '.idea',
            '.vscode',
            'target',
            '.gradle',
            '.next',
            '.nuxt',
            'vendor',
            'packages',
            'out',
            '.cache'
        ]
        return path.name in skip_patterns or path.name.startswith('.')
    
    def _calculate_confidence(self, project_path: Path, strategy: str) -> str:
        """
        Calculate confidence level of detection.
        
        Confidence is based on the number of indicator files found:
        - High: 3+ indicators
        - Medium: 2 indicators
        - Low: 1 indicator
        
        Args:
            project_path: Path to the project directory
            strategy: Detected strategy name
            
        Returns:
            Confidence level: 'high', 'medium', or 'low'
        """
        indicators = self._get_found_indicators(project_path, strategy)
        
        if len(indicators) >= 3:
            return "high"
        elif len(indicators) == 2:
            return "medium"
        else:
            return "low"
    
    def _get_found_indicators(self, project_path: Path, strategy: str) -> List[str]:
        """
        Return list of indicator files found in the project.
        
        Args:
            project_path: Path to the project directory
            strategy: Strategy name to get indicators from
            
        Returns:
            List of indicator file names that exist in the project
        """
        try:
            strategy_class = self.loader.get_strategy_class(strategy)
            strategy_instance = strategy_class()
            
            found = []
            for indicator in strategy_instance.detect_indicators():
                if (project_path / indicator).exists():
                    found.append(indicator)
            
            return found
        except Exception:
            # If strategy cannot be loaded, return empty list
            return []
    
    def _confidence_rank(self, confidence: str) -> int:
        """
        Numerical ranking for sorting by confidence.
        
        Args:
            confidence: Confidence level string
            
        Returns:
            Numerical rank (0 = highest, 999 = unknown)
        """
        ranks = {"high": 0, "medium": 1, "low": 2}
        return ranks.get(confidence, 999)