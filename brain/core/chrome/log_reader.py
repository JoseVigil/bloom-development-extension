"""
Chrome debug log reader - Engine Auditor (Synapse v2.0).
Auditoría de integridad del motor Chromium para diagnosticar fallos de sistema y bloqueos de seguridad.
"""

import re
import json
from pathlib import Path
from collections import deque
from datetime import datetime
from typing import Dict, Any, Optional, List, Pattern

# ✅ Solo importar logger, evitar importaciones circulares
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class ChromeLogReader:
    """
    Reads and filters Chrome debug logs with Chromium error pattern detection.
    Focused on system-level failures and security blocks.
    """
    
    # Lista Maestra de Fallos de Chromium
    CHROMIUM_ERROR_PATTERNS: List[Pattern] = [
        re.compile(r'Access is denied', re.IGNORECASE),
        re.compile(r'0x5', re.IGNORECASE),  # Windows permission error code
        re.compile(r'ERR_BLOCKED_BY_CLIENT', re.IGNORECASE),
        re.compile(r'Sandbox', re.IGNORECASE),
        re.compile(r'sandbox_win\.cc', re.IGNORECASE),
        re.compile(r'SingletonLock', re.IGNORECASE),
        re.compile(r'SingletonCookie', re.IGNORECASE),
        re.compile(r'Failed to move file', re.IGNORECASE),
        re.compile(r'Native Messaging host', re.IGNORECASE),
        re.compile(r'\bFATAL\b', re.IGNORECASE),
        re.compile(r'\bCRITICAL\b', re.IGNORECASE),
    ]
    
    def __init__(self):
        """Initialize log reader with path resolver."""
        # ✅ Lazy import - Solo importar cuando se instancia la clase
        from brain.core.profile.path_resolver import PathResolver
        self.paths = PathResolver()
        logger.debug(f"Initialized ChromeLogReader (Engine Auditor) with base_dir: {self.paths.base_dir}")
    
    def read_and_filter(
        self,
        profile_id: str,
        before_lines: int = 5,
        after_lines: int = 5,
        launch_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Audit Chrome engine log for Chromium errors with context.
        
        Args:
            profile_id: Chrome profile UUID
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
            raise FileNotFoundError(f"Chrome debug log not found: {source_file}")
        
        # Construct output directory and file
        logs_dir = Path(self.paths.base_dir) / "logs" / "profiles" / profile_id
        logs_dir.mkdir(parents=True, exist_ok=True)
        
        # Use launch_id or default naming
        if launch_id:
            output_file = logs_dir / f"{launch_id}_engine_read.log"
        else:
            output_file = logs_dir / "default_engine_read.log"
        
        logger.info(f"[INFO] Generando auditoría de motor para sesión {launch_id or 'default'}")
        logger.info(f"Processing engine log file: {source_file}")
        logger.info(f"Output will be saved to: {output_file}")
        
        # Process log file
        matches_found = 0
        total_lines = 0
        output_lines = 0
        error_types = {}
        
        buffer = deque(maxlen=before_lines)
        after_count = 0
        
        with open(source_file, "r", errors="ignore") as f_in, \
             open(output_file, "w", encoding="utf-8") as f_out:
            
            # Write header
            f_out.write("=" * 80 + "\n")
            f_out.write("CHROMIUM ENGINE AUDIT REPORT\n")
            f_out.write("=" * 80 + "\n")
            f_out.write(f"Profile: {profile_id}\n")
            if launch_id:
                f_out.write(f"Launch ID: {launch_id}\n")
            f_out.write(f"Timestamp: {datetime.now().isoformat()}\n")
            f_out.write(f"Source: {source_file}\n")
            f_out.write("=" * 80 + "\n\n")
            
            for line in f_in:
                total_lines += 1
                
                # If in "after" mode, write and decrement counter
                if after_count > 0:
                    f_out.write(line)
                    output_lines += 1
                    after_count -= 1
                    continue
                
                # Check for Chromium error patterns
                matched_pattern = self._check_error_patterns(line)
                
                if matched_pattern:
                    matches_found += 1
                    
                    # Track error type
                    error_types[matched_pattern] = error_types.get(matched_pattern, 0) + 1
                    
                    # Write context header
                    f_out.write(f"----- ERROR #{matches_found}: {matched_pattern} -----\n")
                    output_lines += 1
                    
                    # Write buffered "before" lines
                    for buffered_line in buffer:
                        f_out.write(buffered_line)
                        output_lines += 1
                    
                    # Write matching line (highlighted)
                    f_out.write(f">>> {line}")
                    output_lines += 1
                    
                    # Set after counter
                    after_count = after_lines
                    
                    # Write footer
                    f_out.write("-" * 80 + "\n\n")
                    output_lines += 1
                    
                    logger.debug(f"Match #{matches_found} ({matched_pattern}) found at line {total_lines}")
                
                # Always add to buffer
                buffer.append(line)
            
            # Write summary
            f_out.write("\n" + "=" * 80 + "\n")
            f_out.write("AUDIT SUMMARY\n")
            f_out.write("=" * 80 + "\n")
            f_out.write(f"Total errors detected: {matches_found}\n")
            f_out.write(f"Total lines scanned: {total_lines}\n\n")
            
            if error_types:
                f_out.write("Error Distribution:\n")
                for error_type, count in sorted(error_types.items(), key=lambda x: x[1], reverse=True):
                    f_out.write(f"  - {error_type}: {count}\n")
            
            f_out.write("=" * 80 + "\n")
        
        logger.info(f"✅ Engine audit complete: {matches_found} errors detected")
        
        return {
            "profile_id": profile_id,
            "launch_id": launch_id,
            "source_file": str(source_file),
            "output_file": str(output_file),
            "matches_found": matches_found,
            "total_lines": total_lines,
            "output_lines": output_lines,
            "error_types": error_types,
            "before_context": before_lines,
            "after_context": after_lines,
            "timestamp": datetime.now().isoformat()
        }
    
    def _check_error_patterns(self, line: str) -> Optional[str]:
        """
        Check if line matches any Chromium error pattern.
        
        Returns:
            Name of matched pattern or None
        """
        for pattern in self.CHROMIUM_ERROR_PATTERNS:
            if pattern.search(line):
                # Return a readable pattern name
                pattern_str = pattern.pattern
                if 'Access is denied' in pattern_str:
                    return 'ACCESS_DENIED'
                elif '0x5' in pattern_str:
                    return 'PERMISSION_ERROR_0x5'
                elif 'ERR_BLOCKED_BY_CLIENT' in pattern_str:
                    return 'BLOCKED_BY_CLIENT'
                elif 'sandbox_win' in pattern_str:
                    return 'SANDBOX_WIN_ERROR'
                elif 'Sandbox' in pattern_str:
                    return 'SANDBOX_ERROR'
                elif 'SingletonLock' in pattern_str:
                    return 'SINGLETON_LOCK'
                elif 'SingletonCookie' in pattern_str:
                    return 'SINGLETON_COOKIE'
                elif 'Failed to move file' in pattern_str:
                    return 'FILE_MOVE_FAILED'
                elif 'Native Messaging host' in pattern_str:
                    return 'NATIVE_MESSAGING_ERROR'
                elif 'FATAL' in pattern_str:
                    return 'FATAL_ERROR'
                elif 'CRITICAL' in pattern_str:
                    return 'CRITICAL_ERROR'
        
        return None