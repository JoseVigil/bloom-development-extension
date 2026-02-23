"""
Logs Manager — business logic for log stream operations.

Handles three operations:
  - read_stream:          Read and filter a single telemetry stream
  - generate_launch_trace: Full correlated synapse trace for a launch_id
  - get_summary:          Dashboard stats for all active streams
"""

import json
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from brain.shared.logger import get_logger, BrainLogger

logger = get_logger(__name__)


# ── Constants ─────────────────────────────────────────────────────────────────

STARTUP_NOISE_PATTERNS = [
    "_setup_specialized_namespaces",
    "SPECIALIZED LOGGER INITIALIZED",
    "Log File:",
    "Propagate to root:",
    "Telemetry registered:",
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_startup_noise(line: str) -> bool:
    for pattern in STARTUP_NOISE_PATTERNS:
        if pattern in line:
            return True
    stripped = line.strip()
    if len(stripped) > 3:
        if all(c == "=" for c in stripped) or all(c == "-" for c in stripped):
            return True
    return False


def _parse_since(since: str) -> timedelta:
    """Parse '5m', '2h', '30s' into a timedelta."""
    since = since.strip().lower()
    if since.endswith("m"):
        return timedelta(minutes=int(since[:-1]))
    if since.endswith("h"):
        return timedelta(hours=int(since[:-1]))
    if since.endswith("s"):
        return timedelta(seconds=int(since[:-1]))
    raise ValueError(f"Invalid duration '{since}' — use formats like 5m, 2h, 30s")


def _parse_line_timestamp(line: str) -> Optional[datetime]:
    """
    Try to extract a timestamp from the start of a log line.
    Supports Go logger format (2006/01/02 15:04:05) and ISO8601.
    Returns None on failure.
    """
    formats = [
        "%Y/%m/%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%SZ",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%fZ",
        "%Y-%m-%dT%H:%M:%S.%f",
    ]
    candidate = line.strip()
    for fmt in formats:
        try:
            n = len(datetime.now().strftime(fmt))
            # Use a fixed-length approximation since format length varies slightly
            for end in range(min(35, len(candidate)), 10, -1):
                try:
                    return datetime.strptime(candidate[:end], fmt)
                except ValueError:
                    continue
        except Exception:
            continue
    return None


def _format_ago(seconds: float) -> str:
    if seconds < 60:
        return f"hace {int(seconds)}s"
    if seconds < 3600:
        return f"hace {int(seconds // 60)}min"
    return f"hace {seconds / 3600:.1f}h"


def _stream_symbol(stream: str, text: str) -> str:
    upper = text.upper()
    if "ERROR" in upper:
        return "❌"
    if "WARNING" in upper:
        return "⚠️ "
    if "SUCCESS" in upper or "✅" in text:
        return "✅"
    if "synapse" in stream:
        return "🚀"
    if "sentinel" in stream:
        return "🛡️ "
    if "brain" in stream:
        return "🧠"
    return "  "


# ── Manager ───────────────────────────────────────────────────────────────────

class LogsManager:
    """
    Business logic for log stream reading, synapse trace generation,
    and summary dashboard.
    """

    def __init__(self):
        from brain.shared.paths import Paths
        self.paths = Paths()
        self._telemetry: Optional[Dict] = None
        logger.debug(f"Initialized LogsManager with base_dir: {self.paths.base_dir}")

    # ── Telemetry ─────────────────────────────────────────────────────────────

    def _load_telemetry(self) -> Dict:
        """Load and cache telemetry.json."""
        if self._telemetry is not None:
            return self._telemetry

        telemetry_path = Path(self.paths.logs_dir) / "telemetry.json"
        if not telemetry_path.exists():
            raise FileNotFoundError(f"telemetry.json not found: {telemetry_path}")

        with open(telemetry_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        self._telemetry = data
        return data

    def _get_active_streams(self) -> Dict[str, Dict]:
        return self._load_telemetry().get("active_streams", {})

    def _resolve_stream_path(self, stream_name: str) -> Path:
        streams = self._get_active_streams()
        if stream_name not in streams:
            valid = sorted(streams.keys())
            raise ValueError(
                f"Unknown stream '{stream_name}'.\n"
                f"Available streams:\n  " + "\n  ".join(valid)
            )
        return Path(streams[stream_name]["path"])

    # ── Stream Reader ─────────────────────────────────────────────────────────

    def read_stream(
        self,
        stream_name: str,
        since: Optional[str] = None,
        errors_only: bool = False,
        no_startup: bool = False,
    ) -> Dict[str, Any]:
        """
        Read and filter a single telemetry stream.

        Args:
            stream_name:  Key in telemetry.json active_streams
            since:        Duration string ('5m', '2h') — filter by time
            errors_only:  Only return WARNING/ERROR lines
            no_startup:   Exclude Brain startup noise patterns

        Returns:
            Dict with lines, lines_count, stream_name, path
        """
        log_path = self._resolve_stream_path(stream_name)

        cutoff: Optional[datetime] = None
        if since:
            cutoff = datetime.now() - _parse_since(since)

        if not log_path.exists():
            return {
                "stream_name": stream_name,
                "path": str(log_path),
                "lines": [],
                "lines_count": 0,
                "note": "file does not exist (stream inactive)",
            }

        filtered: List[str] = []

        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            for line in f:
                line = line.rstrip("\r\n")

                if no_startup and _is_startup_noise(line):
                    continue

                if errors_only:
                    upper = line.upper()
                    if "WARNING" not in upper and "ERROR" not in upper:
                        continue

                if cutoff:
                    ts = _parse_line_timestamp(line)
                    if ts and ts < cutoff:
                        continue

                filtered.append(f"[{stream_name}] {line}")

        return {
            "stream_name": stream_name,
            "path": str(log_path),
            "lines": filtered,
            "lines_count": len(filtered),
        }

    def tail_stream(
        self,
        stream_name: str,
        errors_only: bool = False,
        no_startup: bool = False,
    ) -> None:
        """
        Follow a stream file in real time (blocking).
        Prints matching lines to stdout as they arrive.
        """
        import sys

        log_path = self._resolve_stream_path(stream_name)

        print(f"Following [{stream_name}] — {log_path}  (Ctrl+C to stop)\n")

        if not log_path.exists():
            print(f"[{stream_name}] Waiting for file to appear...")
            while not log_path.exists():
                time.sleep(0.5)

        with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
            f.seek(0, 2)  # seek to end
            while True:
                line = f.readline()
                if not line:
                    time.sleep(0.2)
                    continue
                line = line.rstrip("\r\n")
                if no_startup and _is_startup_noise(line):
                    continue
                if errors_only:
                    upper = line.upper()
                    if "WARNING" not in upper and "ERROR" not in upper:
                        continue
                print(f"[{stream_name}] {line}", flush=True)

    # ── Synapse Trace ─────────────────────────────────────────────────────────

    def generate_launch_trace(
        self,
        launch_id: str,
        profile_id: Optional[str] = None,
        out_path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Generate a full correlated synapse trace for a given launch_id.

        Steps:
          1. Find launch timestamp in nucleus_synapse stream
          2. Collect all stream lines within the time window
          3. Invoke Chrome readers via core managers (if profile_id given)
          4. Write self-contained digest file
          5. Register trace file in telemetry

        Args:
            launch_id:   Launch identifier to trace
            profile_id:  Chrome profile UUID (enables Chrome log analysis)
            out_path:    Override default output path

        Returns:
            Dict with output_file, window, stats
        """
        if not launch_id or not launch_id.strip():
            raise ValueError("launch_id cannot be empty")

        streams = self._get_active_streams()

        # ── Step 1: Calculate window from telemetry metadata ─────────────
        # Window = min(first_seen) → max(last_update) across ALL streams.
        # This guarantees no registered stream is cut off by an arbitrary window.
        window_start, window_end = self._calculate_window_from_telemetry(streams)

        logger.info(f"Window: {window_start.isoformat()} → {window_end.isoformat()}")

        # ── Step 2: Collect ALL lines from ALL registered streams ──────────
        # Rule: a stream is excluded ONLY if its physical file doesn't exist on disk.
        # Lines with unparseable timestamps are always included.
        all_lines, missing_streams = self._collect_all_stream_lines(streams)

        # ── Step 3: Chrome analysis via core managers ──────────────────────
        chrome = {"read": None, "network": None, "mining": None}
        chrome_errors = {}

        if profile_id:
            logger.info("Invoking Chrome core readers...")
            chrome, chrome_errors = self._run_chrome_analysis(profile_id, launch_id)

        # ── Step 4: Build digest file ──────────────────────────────────────
        synapse_dir = Path(self.paths.logs_dir) / "synapse"
        synapse_dir.mkdir(parents=True, exist_ok=True)

        output_file = Path(out_path) if out_path else synapse_dir / f"trace_{launch_id}.log"
        output_file.parent.mkdir(parents=True, exist_ok=True)

        stats = self._extract_summary_stats(all_lines)

        self._write_trace_file(
            output_file=output_file,
            launch_id=launch_id,
            profile_id=profile_id,
            window_start=window_start,
            window_end=window_end,
            all_lines=all_lines,
            missing_streams=missing_streams,
            chrome=chrome,
            chrome_errors=chrome_errors,
            stats=stats,
        )

        # ── Step 5: Register in telemetry ──────────────────────────────────
        short_id = launch_id[:8] if len(launch_id) > 8 else launch_id
        BrainLogger()._register_telemetry_stream(
            stream_id=f"synapse_trace_{launch_id.replace('_', '')}",
            label=f"🔍 SYNAPSE TRACE ({short_id})",
            log_path=output_file,
            priority=2,
            category="synapse",
            description=(
                f"Synapse trace autocontenido para launch {launch_id} — "
                f"correlación temporal de todos los streams"
            ),
        )

        logger.info(f"✅ Trace written: {output_file}")

        return {
            "launch_id": launch_id,
            "profile_id": profile_id,
            "output_file": str(output_file),
            "window_start": window_start.isoformat(),
            "window_end": window_end.isoformat(),
            "streams_analyzed": len({l["stream"] for l in all_lines}),
            "total_lines": stats["total_lines"],
            "errors": stats["error_count"],
            "warnings": stats["warning_count"],
            "chrome_pid": stats["chrome_pid"],
            "extension_loaded": stats["extension_loaded"],
            "timestamp": datetime.now().isoformat(),
        }

    def _calculate_window_from_telemetry(
        self, streams: Dict
    ) -> tuple:
        """
        Calculate trace window as min(first_seen) → max(last_update) across
        all streams in telemetry.json.

        Falls back to now-30min → now if timestamps are missing or unparseable.
        """
        ISO_FORMATS = [
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%S",
        ]

        def parse_iso(s: Optional[str]) -> Optional[datetime]:
            if not s:
                return None
            for fmt in ISO_FORMATS:
                try:
                    return datetime.strptime(s, fmt)
                except ValueError:
                    continue
            return None

        first_seen_values = []
        last_update_values = []

        for stream_data in streams.values():
            fs = parse_iso(stream_data.get("first_seen"))
            lu = parse_iso(stream_data.get("last_update"))
            if fs:
                first_seen_values.append(fs)
            if lu:
                last_update_values.append(lu)

        if not first_seen_values or not last_update_values:
            logger.warning("No parseable timestamps in telemetry — using now-30min fallback")
            return datetime.now() - timedelta(minutes=30), datetime.now()

        window_start = min(first_seen_values)
        window_end = max(last_update_values)

        # Safety: ensure window_end is at least 1 minute after window_start
        if window_end <= window_start:
            window_end = window_start + timedelta(minutes=1)

        return window_start, window_end

    def _collect_all_stream_lines(
        self, streams: Dict
    ) -> tuple:
        """
        Collect ALL lines from ALL registered streams.

        A stream is skipped only if its physical file does not exist on disk.
        Lines with unparseable timestamps are included as-is.

        Returns:
            (all_lines, missing_streams) where:
            - all_lines: List[Dict] sorted by timestamp
            - missing_streams: List[str] of stream_ids whose file is missing
        """
        result = []
        missing = []

        for stream_id, stream_data in streams.items():
            path = Path(stream_data["path"])
            if not path.exists():
                missing.append(f"- {stream_id} (archivo no encontrado en disco: {path})")
                continue

            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    line = line.rstrip("\r\n")
                    ts = _parse_line_timestamp(line)
                    result.append({"ts": ts, "stream": stream_id, "text": line})

        # Sort by timestamp; lines without timestamp go to the end grouped by stream
        result.sort(
            key=lambda l: (l["ts"] is None, l["ts"] or datetime.min, l["stream"])
        )
        return result, sorted(missing)

    def _run_chrome_analysis(
        self, profile_id: str, launch_id: str
    ) -> tuple:
        """
        Run the three Chrome core readers and return their output content.
        Uses direct manager imports — no subprocess needed (same process).
        """
        chrome = {"read": None, "network": None, "mining": None}
        errors = {}

        # read-log
        try:
            from brain.core.chrome.log_reader import ChromeLogReader
            reader = ChromeLogReader()
            result = reader.read_and_filter(profile_id=profile_id, launch_id=launch_id)
            chrome["read"] = Path(result["output_file"]).read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            errors["read"] = str(e)
            logger.warning(f"Chrome read-log failed: {e}")

        # read-net-log
        try:
            from brain.core.chrome.net_log_analyzer import NetLogAnalyzer
            analyzer = NetLogAnalyzer()
            result = analyzer.analyze(profile_id=profile_id, launch_id=launch_id)
            chrome["network"] = Path(result["output_file"]).read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            errors["network"] = str(e)
            logger.warning(f"Chrome read-net-log failed: {e}")

        # mining-log
        try:
            from brain.core.chrome.mining_log_reader import MiningLogReader
            reader = MiningLogReader()
            result = reader.read_and_filter(
                profile_id=profile_id, launch_id=launch_id, keyword="bloom"
            )
            chrome["mining"] = Path(result["output_file"]).read_text(encoding="utf-8", errors="ignore")
        except Exception as e:
            errors["mining"] = str(e)
            logger.warning(f"Chrome mining-log failed: {e}")

        return chrome, errors

    def _extract_summary_stats(self, lines: List[Dict]) -> Dict:
        stats = {
            "total_lines": len(lines),
            "error_count": 0,
            "warning_count": 0,
            "chrome_pid": "unknown",
            "extension_loaded": "unknown",
        }
        for l in lines:
            upper = l["text"].upper()
            if "ERROR" in upper:
                stats["error_count"] += 1
            elif "WARNING" in upper:
                stats["warning_count"] += 1

            if stats["chrome_pid"] == "unknown" and "PID=" in l["text"]:
                idx = l["text"].index("PID=")
                rest = l["text"][idx + 4:].split()[0]
                stats["chrome_pid"] = rest.strip()

            if stats["extension_loaded"] == "unknown":
                if "extension loaded" in l["text"].lower():
                    stats["extension_loaded"] = "true"
                elif "EXTENSION" in upper and "ERROR" in upper:
                    stats["extension_loaded"] = "false"

        return stats

    def _write_trace_file(
        self,
        output_file: Path,
        launch_id: str,
        profile_id: Optional[str],
        window_start: datetime,
        window_end: datetime,
        all_lines: List[Dict],
        missing_streams: List[str],
        chrome: Dict,
        chrome_errors: Dict,
        stats: Dict,
    ) -> None:
        sep = "=" * 80
        dash = "-" * 80

        launch_time = (
            all_lines[0]["ts"].strftime("%H:%M:%S")
            if all_lines and all_lines[0]["ts"]
            else "unknown"
        )

        with open(output_file, "w", encoding="utf-8") as f:

            # Header
            f.write(f"{sep}\n")
            f.write(f"SYNAPSE TRACE — launch_id: {launch_id}\n")
            f.write(f"Generado: {datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')}\n")
            f.write(f"Ventana:  {window_start.isoformat()} → {window_end.isoformat()}\n")
            if profile_id:
                f.write(f"Profile:  {profile_id}\n")
            f.write(f"{sep}\n\n")

            # Resumen ejecutivo
            f.write("[RESUMEN EJECUTIVO]\n")
            f.write(f"- Launch iniciado:     {launch_time}\n")
            f.write(f"- Chrome PID:          {stats['chrome_pid']}\n")
            f.write(f"- Extension loaded:    {stats['extension_loaded']}\n")
            f.write(f"- Errores detectados:  {stats['error_count']}\n")
            f.write(f"- Warnings detectados: {stats['warning_count']}\n")
            f.write(f"- Streams analizados:  {len({l['stream'] for l in all_lines})}\n")
            f.write(f"- Líneas totales:      {stats['total_lines']}\n")
            f.write(f"\n{sep}\n")

            # Línea de tiempo unificada
            f.write("\n[LÍNEA DE TIEMPO UNIFICADA]\n\n")
            for l in all_lines:
                ts_str = l["ts"].strftime("%H:%M:%S") if l["ts"] else "??:??:??"
                sym = _stream_symbol(l["stream"], l["text"])
                stream_label = f"[{l['stream']}]"
                f.write(f"{ts_str}  {stream_label:<30}  {sym}  {l['text']}\n")
            f.write(f"\n{sep}\n")

            # Errores detectados
            f.write("\n[ERRORES DETECTADOS]\n\n")
            error_lines = [
                l for l in all_lines
                if "ERROR" in l["text"].upper() or "WARNING" in l["text"].upper()
            ]
            if not error_lines:
                f.write("(ningún error o warning encontrado en la ventana)\n")
            else:
                for l in error_lines:
                    ts_str = l["ts"].strftime("%H:%M:%S") if l["ts"] else "??:??:??"
                    f.write(f"{ts_str}  [{l['stream']}]  {l['text']}\n")
            f.write(f"\n{sep}\n")

            # Chrome analysis sections
            for section_key, section_title in [
                ("read",    "ANÁLISIS CHROME — read-log"),
                ("network", "ANÁLISIS CHROME — network"),
                ("mining",  "ANÁLISIS CHROME — mining bloom"),
            ]:
                f.write(f"\n[{section_title}]\n\n")
                if section_key in chrome_errors:
                    f.write(f"ERROR: {chrome_errors[section_key]}\n")
                elif chrome.get(section_key):
                    f.write(chrome[section_key])
                    f.write("\n")
                else:
                    f.write("(no se proveyó --profile, análisis Chrome omitido)\n")
                f.write(f"\n{dash}\n")

            # Streams sin archivo en disco
            f.write("\n[STREAMS SIN ARCHIVO EN DISCO]\n\n")
            if not missing_streams:
                f.write("(todos los streams registrados en telemetry.json tienen archivo en disco)\n")
            else:
                for s in missing_streams:
                    f.write(f"{s}\n")
            f.write(f"\n{sep}\n")

    # ── Summary Dashboard ─────────────────────────────────────────────────────

    def get_summary(self, since: str = "10m") -> Dict[str, Any]:
        """
        Return stats for all active streams in telemetry.json.

        Args:
            since: Duration window for error/warning counting ('10m', '1h')

        Returns:
            Dict with list of stream stats
        """
        streams = self._get_active_streams()
        cutoff = datetime.now() - _parse_since(since)

        result = []
        for stream_id, stream_data in sorted(streams.items()):
            path = Path(stream_data["path"])

            if not path.exists():
                result.append({
                    "stream_id": stream_id,
                    "last_seen_ago": "(archivo no existe)",
                    "errors": 0,
                    "warnings": 0,
                    "file_exists": False,
                })
                continue

            mtime = path.stat().st_mtime
            last_seen_ago = _format_ago(time.time() - mtime)

            errors = 0
            warnings = 0
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                for line in f:
                    ts = _parse_line_timestamp(line)
                    if ts and ts < cutoff:
                        continue
                    upper = line.upper()
                    if "ERROR" in upper:
                        errors += 1
                    elif "WARNING" in upper:
                        warnings += 1

            result.append({
                "stream_id": stream_id,
                "last_seen_ago": last_seen_ago,
                "errors": errors,
                "warnings": warnings,
                "file_exists": True,
            })

        return {
            "since": since,
            "streams": result,
            "timestamp": datetime.now().isoformat(),
        }