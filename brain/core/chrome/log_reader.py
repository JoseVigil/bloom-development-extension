"""
Chrome debug log reader - Pure business logic.
No CLI dependencies, fully testable.
"""

from pathlib import Path
from collections import deque
from datetime import datetime
from typing import Dict, Any, Optional
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class ChromeLogReader:
    """
    Reads and filters Chrome debug logs with context extraction.
    """
    
    def __init__(self):
        """Initialize log reader with path resolver."""
        from brain.core.profile.path_resolver import PathResolver
        self.paths = PathResolver()
        logger.debug(f"Initialized ChromeLogReader with base_dir: {self.paths.base_dir}")
    
    def read_and_filter(
        self,
        profile_id: str,
        keyword: str = "bloom",
        before_lines: int = 5,
        after_lines: int = 5
    ) -> Dict[str, Any]:
        """
        Read Chrome debug log and filter by keyword with context.
        
        Args:
            profile_id: Chrome profile UUID
            keyword: Search keyword (case-insensitive)
            before_lines: Number of context lines before match
            after_lines: Number of context lines after match
            
        Returns:
            Dictionary with results and metadata
            
        Raises:
            FileNotFoundError: If source log file doesn't exist
            ValueError: If profile_id is empty
        """
        if not profile_id or not profile_id.strip():
            raise ValueError("profile_id cannot be empty")
        
        # Construct source file path
        source_file = Path(self.paths.base_dir) / "profiles" / profile_id / "chrome_debug.log"
        
        logger.debug(f"Source file: {source_file}")
        
        if not source_file.exists():
            logger.error(f"Source file not found: {source_file}")
            raise FileNotFoundError(f"Chrome debug log not found: {source_file}")
        
        # Construct output directory and file
        timestamp = datetime.now().strftime("%Y%m%d")
        output_dir = Path(self.paths.base_dir) / "logs" / "profiles" / profile_id
        output_dir.mkdir(parents=True, exist_ok=True)
        
        output_file = output_dir / f"chrome_bloom_log_{timestamp}.log"
        
        logger.info(f"Processing log file: {source_file}")
        logger.info(f"Output will be saved to: {output_file}")
        
        # Process log file
        matches_found = 0
        total_lines = 0
        output_lines = 0
        
        buffer = deque(maxlen=before_lines)
        after_count = 0
        
        with open(source_file, "r", errors="ignore") as f_in, \
             open(output_file, "w", encoding="utf-8") as f_out:
            
            for line in f_in:
                total_lines += 1
                
                # If in "after" mode, write and decrement counter
                if after_count > 0:
                    f_out.write(line)
                    output_lines += 1
                    after_count -= 1
                    continue
                
                # Check for keyword match
                if keyword.lower() in line.lower():
                    matches_found += 1
                    
                    # Write context header
                    f_out.write("----- CONTEXT -----\n")
                    output_lines += 1
                    
                    # Write buffered "before" lines
                    for buffered_line in buffer:
                        f_out.write(buffered_line)
                        output_lines += 1
                    
                    # Write matching line
                    f_out.write(line)
                    output_lines += 1
                    
                    # Set after counter
                    after_count = after_lines
                    
                    # Write footer
                    f_out.write("--------------------\n")
                    output_lines += 1
                    
                    logger.debug(f"Match #{matches_found} found at line {total_lines}")
                
                # Always add to buffer
                buffer.append(line)
        
        logger.info(f"âœ… Processed {total_lines} lines, found {matches_found} matches")
        
        return {
            "profile_id": profile_id,
            "keyword": keyword,
            "source_file": str(source_file),
            "output_file": str(output_file),
            "matches_found": matches_found,
            "total_lines": total_lines,
            "output_lines": output_lines,
            "before_context": before_lines,
            "after_context": after_lines,
            "timestamp": datetime.now().isoformat()
        }