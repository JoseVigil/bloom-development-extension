"""Chrome mining log reader - Pure business logic.
Processes engine_mining.log files with bloom filtering.
"""
import json
from pathlib import Path
from collections import deque
from datetime import datetime
from typing import Dict, Any, Optional
from brain.shared.logger import get_logger, BrainLogger

logger = get_logger(__name__)


class MiningLogReader:
    """
    Reads and filters Chrome mining logs with context extraction.
    Specifically designed for engine_mining.log files.
    """

    def __init__(self):
        """Initialize mining log reader with Paths singleton."""
        from brain.shared.paths import Paths
        self.paths = Paths()
        logger.debug(f"Initialized MiningLogReader with base_dir: {self.paths.base_dir}")

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
            raise FileNotFoundError(f"Engine mining log not found: {source_file}")

        raw_logs_dir = profile.get('logs_dir')
        logs_dir = Path(raw_logs_dir) if raw_logs_dir else (
            self.paths.logs_dir / "profiles" / profile_id
        )
        logs_dir.mkdir(parents=True, exist_ok=True)

        if launch_id:
            output_file = logs_dir / f"chrome_{launch_id}_engine_mining.log"
        else:
            output_file = logs_dir / "engine_mining.log"

        logger.info(f"Processing mining log file: {source_file}")
        logger.info(f"Output will be saved to: {output_file}")

        matches_found = 0
        total_lines = 0
        output_lines = 0
        buffer = deque(maxlen=before_lines)
        after_count = 0

        with open(source_file, "r", errors="ignore") as f_in, \
             open(output_file, "w", encoding="utf-8") as f_out:

            for line in f_in:
                total_lines += 1

                if after_count > 0:
                    f_out.write(line)
                    output_lines += 1
                    after_count -= 1
                    continue

                if keyword.lower() in line.lower():
                    matches_found += 1
                    f_out.write("----- CONTEXT -----\n")
                    output_lines += 1

                    for buffered_line in buffer:
                        f_out.write(buffered_line)
                        output_lines += 1

                    f_out.write(line)
                    output_lines += 1
                    after_count = after_lines

                    f_out.write("--------------------\n")
                    output_lines += 1

                    logger.debug(f"Match #{matches_found} found at line {total_lines}")

                buffer.append(line)

        # Registrar en telemetría via BrainLogger
        if launch_id:
            short_id = launch_id[:8] if len(launch_id) > 8 else launch_id
            BrainLogger()._register_telemetry_stream(
                stream_id=f"chrome_engine_mining_{short_id}",
                label=f"⛏️ CHROME ENGINE MINING ({short_id})",
                log_path=output_file,
                priority=2,
                category="synapse",
                description=f"Chrome mining log for launch {launch_id} — bloom keyword extraction with context from engine debug output",
            )

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