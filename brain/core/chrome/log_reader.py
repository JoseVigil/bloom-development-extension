"""Chrome debug log reader - Engine Auditor (Synapse v2.0).
Auditoría de integridad del motor Chromium para diagnosticar fallos de sistema y bloqueos de seguridad.
"""
import re
import json
from pathlib import Path
from collections import deque
from datetime import datetime
from typing import Dict, Any, Optional, List, Pattern
from brain.shared.logger import get_logger, BrainLogger

logger = get_logger(__name__)


class ChromeLogReader:
    """
    Reads and filters Chrome debug logs with Chromium error pattern detection.
    Focused on system-level failures and security blocks.
    """

    CHROMIUM_ERROR_PATTERNS: List[Pattern] = [
        re.compile(r'Access is denied', re.IGNORECASE),
        re.compile(r'0x5', re.IGNORECASE),
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
        """Initialize log reader with Paths singleton."""
        from brain.shared.paths import Paths
        self.paths = Paths()
        logger.debug(f"Initialized ChromeLogReader (Engine Auditor) with base_dir: {self.paths.base_dir}")

    def _resolve_latest_log(self, logs_dir: Path, glob_pattern: str) -> Path:
        matches = sorted(logs_dir.glob(glob_pattern), reverse=True)
        if not matches:
            raise FileNotFoundError(
                f"No files matching '{glob_pattern}' found in: {logs_dir}"
            )
        latest = matches[0]
        logger.debug(f"Resolved latest log ({glob_pattern}): {latest}")
        return latest

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

        profiles_json = self.paths.profiles_json
        if not profiles_json.exists():
            raise FileNotFoundError(f"profiles.json not found: {profiles_json}")

        with open(profiles_json, 'r', encoding='utf-8') as f:
            profiles_data = json.load(f)

        profile = next(
            (p for p in profiles_data.get('profiles', []) if p['id'] == profile_id),
            None
        )
        if not profile:
            raise ValueError(f"Profile {profile_id} not found in profiles.json")

        debug_log_path = profile.get('log_files', {}).get('debug_log')
        if debug_log_path:
            source_file = Path(debug_log_path)
        else:
            raw_logs_dir = profile.get('logs_dir')
            if not raw_logs_dir:
                raise ValueError(
                    f"Neither 'log_files.debug_log' nor 'logs_dir' found for profile {profile_id}"
                )
            if launch_id:
                source_file = Path(raw_logs_dir) / f"chrome_{launch_id}_debug.log"
            else:
                source_file = self._resolve_latest_log(Path(raw_logs_dir), 'chrome_*_debug.log')

        logger.debug(f"Source file: {source_file}")

        if not source_file.exists():
            logger.error(f"Source file not found: {source_file}")
            raise FileNotFoundError(f"Chrome debug log not found: {source_file}")

        raw_logs_dir = profile.get('logs_dir')
        logs_dir = Path(raw_logs_dir) if raw_logs_dir else (
            self.paths.logs_dir / "profiles" / profile_id
        )
        logs_dir.mkdir(parents=True, exist_ok=True)

        if launch_id:
            output_file = logs_dir / f"chrome_{launch_id}_engine_read.log"
        else:
            output_file = logs_dir / "default_engine_read.log"

        logger.info(f"[INFO] Generando auditoría de motor para sesión {launch_id or 'default'}")
        logger.info(f"Processing engine log file: {source_file}")
        logger.info(f"Output will be saved to: {output_file}")

        matches_found = 0
        total_lines = 0
        output_lines = 0
        error_types = {}
        buffer = deque(maxlen=before_lines)
        after_count = 0

        with open(source_file, "r", errors="ignore") as f_in, \
             open(output_file, "w", encoding="utf-8") as f_out:

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

                if after_count > 0:
                    f_out.write(line)
                    output_lines += 1
                    after_count -= 1
                    continue

                matched_pattern = self._check_error_patterns(line)
                if matched_pattern:
                    matches_found += 1
                    error_types[matched_pattern] = error_types.get(matched_pattern, 0) + 1

                    f_out.write(f"----- ERROR #{matches_found}: {matched_pattern} -----\n")
                    output_lines += 1

                    for buffered_line in buffer:
                        f_out.write(buffered_line)
                        output_lines += 1

                    f_out.write(f">>> {line}")
                    output_lines += 1
                    after_count = after_lines

                    f_out.write("-" * 80 + "\n\n")
                    output_lines += 1

                    logger.debug(f"Match #{matches_found} ({matched_pattern}) found at line {total_lines}")

                buffer.append(line)

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

        # Registrar en telemetría via BrainLogger
        if launch_id:
            short_id = launch_id[:8] if len(launch_id) > 8 else launch_id
            BrainLogger()._register_telemetry_stream(
                stream_id=f"chrome_engine_read_{short_id}",
                label=f"� CHROME ENGINE AUDIT ({short_id})",
                log_path=output_file,
                priority=2,
                category="synapse",
                description=f"Chrome engine audit for launch {launch_id} — Chromium error pattern detection and security block analysis",
            )

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
        for pattern in self.CHROMIUM_ERROR_PATTERNS:
            if pattern.search(line):
                p = pattern.pattern
                if 'Access is denied' in p:   return 'ACCESS_DENIED'
                if '0x5' in p:                return 'PERMISSION_ERROR_0x5'
                if 'ERR_BLOCKED' in p:        return 'BLOCKED_BY_CLIENT'
                if 'sandbox_win' in p:        return 'SANDBOX_WIN_ERROR'
                if 'Sandbox' in p:            return 'SANDBOX_ERROR'
                if 'SingletonLock' in p:      return 'SINGLETON_LOCK'
                if 'SingletonCookie' in p:    return 'SINGLETON_COOKIE'
                if 'Failed to move' in p:     return 'FILE_MOVE_FAILED'
                if 'Native Messaging' in p:   return 'NATIVE_MESSAGING_ERROR'
                if 'FATAL' in p:              return 'FATAL_ERROR'
                if 'CRITICAL' in p:           return 'CRITICAL_ERROR'
        return None