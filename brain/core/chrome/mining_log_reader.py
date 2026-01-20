"""
Chrome mining log reader - Pure business logic.
Processes engine_mining.log files with bloom filtering.
"""

import json
from pathlib import Path
from collections import deque
from datetime import datetime
from typing import Dict, Any, Optional

# ✅ Solo importar logger, evitar importaciones circulares
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class MiningLogReader:
    """
    Reads and filters Chrome mining logs with context extraction.
    Specifically designed for engine_mining.log files.
    """
    
    def __init__(self):
        """Initialize mining log reader with path resolver."""
        # ✅ Lazy import - Solo importar cuando se instancia la clase
        from brain.core.profile.path_resolver import PathResolver
        self.paths = PathResolver()
        logger.debug(f"Initialized MiningLogReader with base_dir: {self.paths.base_dir}")
    
    def read_and_filter(
        self,
        profile_id: str,
        keyword: str = "bloom",
        before_lines: int = 5,
        after_lines: int = 5,
        launch_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Read engine_mining.log and filter by keyword with context.
        
        Args:
            profile_id: Chrome profile UUID
            keyword: Search keyword (case-insensitive)
            before_lines: Number of context lines before match
            after_lines: Number of context lines after match
            launch_id: Optional launch ID to create separate output file
            
        Returns:
            Dictionary with results and metadata
            
        Raises:
            FileNotFoundError: If source log file doesn't exist
            ValueError: If profile_id is empty
        """
        if not profile_id or not profile_id.strip():
            raise ValueError("profile_id cannot be empty")
        
        # Load profiles.json to get debug_log path
        profiles_json = Path(self.paths.base_dir) / "config" / "profiles.json"
        
        if not profiles_json.exists():
            raise FileNotFoundError(f"profiles.json not found: {profiles_json}")
        
        with open(profiles_json, 'r', encoding='utf-8') as f:
            profiles_data = json.load(f)
        
        # Find profile
        profile = None
        for p in profiles_data.get('profiles', []):
            if p['id'] == profile_id:
                profile = p
                break
        
        if not profile:
            raise ValueError(f"Profile {profile_id} not found in profiles.json")
        
        # Get debug_log path
        debug_log_path = profile.get('log_files', {}).get('debug_log')
        if not debug_log_path:
            raise ValueError(f"debug_log not found for profile {profile_id}")
        
        source_file = Path(debug_log_path)
        
        logger.debug(f"Source file: {source_file}")
        
        if not source_file.exists():
            logger.error(f"Source file not found: {source_file}")
            raise FileNotFoundError(f"Engine mining log not found: {source_file}")
        
        # Output file in the same directory
        logs_dir = Path(self.paths.base_dir) / "logs" / "profiles" / profile_id
        logs_dir.mkdir(parents=True, exist_ok=True)
        
        # Use launch_id as suffix if provided
        if launch_id:
            output_file = logs_dir / f"{launch_id}_engine_mining.log"
        else:
            output_file = logs_dir / "engine_mining.log"
        
        logger.info(f"Processing mining log file: {source_file}")
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
        
        logger.info(f"✅ Processed {total_lines} lines, found {matches_found} matches")
        
        return {
            "profile_id": profile_id,
            "launch_id": launch_id,
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