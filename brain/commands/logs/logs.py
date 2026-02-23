"""
Log stream reading, synapse trace generation and diagnostics dashboard.
"""

import typer
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class LogsCommand(BaseCommand):
    """
    Log stream reading, synapse trace and diagnostics.
    Groups stream, launch-trace, and summary subcommands.
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="logs",
            category=CommandCategory.LOGS,
            version="1.0.0",
            description="Log stream reading, synapse trace generation and diagnostics dashboard",
            examples=[
                "brain logs stream nucleus_synapse --since 5m",
                "brain logs stream sentinel_core --errors-only --no-startup",
                "brain logs stream brain_server --tail",
                "brain logs launch-trace --launch-id 001_0b31f2fa_033803 --profile 0b31f2fa-1463-4919-b63e-96db6e36744c",
                "brain logs summary --since 10m",
                "brain --json logs launch-trace --launch-id 001_0b31f2fa_033803 --profile 0b31f2fa-1463-4919-b63e-96db6e36744c",
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """Register logs subcommands in the provided app."""

        # ==================== SUBCOMMAND: stream ====================
        @app.command(name="stream")
        def stream(
            ctx: typer.Context,
            stream_name: str = typer.Argument(..., help="Stream name (key in telemetry.json active_streams)"),
            since: Optional[str] = typer.Option(None, "--since", help="Only lines from last X minutes/hours (e.g. 5m, 2h)"),
            errors_only: bool = typer.Option(False, "--errors-only", help="Only show WARNING or ERROR lines"),
            no_startup: bool = typer.Option(False, "--no-startup", help="Exclude Brain startup noise patterns"),
            tail: bool = typer.Option(False, "--tail", help="Live tail mode — follow the file"),
        ):
            """
            Read a single named log stream with optional filters.

            Stream names are the keys in telemetry.json active_streams.
            Use 'brain logs summary' to see all available streams.

            Input:  telemetry.json → active_streams[stream_name].path
            Output: filtered lines to stdout
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            try:
                from brain.core.logs.logs_manager import LogsManager

                logger.info(f"📖 Reading stream: {stream_name}")

                if gc.verbose:
                    typer.echo(f"📺 Stream: {stream_name}", err=True)
                    if since:
                        typer.echo(f"⏱️  Since: {since}", err=True)
                    typer.echo(f"🚨 Errors only: {errors_only}", err=True)
                    typer.echo(f"🔇 No startup: {no_startup}", err=True)
                    typer.echo(f"👁️  Tail: {tail}", err=True)

                manager = LogsManager()

                if tail:
                    # Tail mode — blocking, streams to stdout directly
                    manager.tail_stream(
                        stream_name=stream_name,
                        errors_only=errors_only,
                        no_startup=no_startup,
                    )
                    return

                result = manager.read_stream(
                    stream_name=stream_name,
                    since=since,
                    errors_only=errors_only,
                    no_startup=no_startup,
                )

                logger.info(f"✅ Stream read: {result['lines_count']} lines")

                data = {
                    "status": "success",
                    "operation": "logs_stream",
                    "data": result,
                }

                gc.output(data, self._render_stream_success)

            except FileNotFoundError as e:
                logger.error(f"❌ Stream not found: {e}")
                self._handle_error(gc, f"Stream not found: {e}")
            except ValueError as e:
                logger.error(f"❌ Invalid argument: {e}")
                self._handle_error(gc, str(e))
            except Exception as e:
                logger.error(f"❌ Error reading stream: {e}", exc_info=True)
                self._handle_error(gc, f"Error reading stream: {e}")

        # ==================== SUBCOMMAND: launch-trace ====================
        @app.command(name="launch-trace")
        def launch_trace(
            ctx: typer.Context,
            launch_id: str = typer.Option(..., "--launch-id", "-l", help="Launch ID to trace"),
            profile_id: Optional[str] = typer.Option(None, "--profile", "-p", help="Profile UUID (enables Chrome log analysis)"),
            out: Optional[str] = typer.Option(None, "--out", help="Output file path (default: logs/synapse/trace_<launch_id>.log)"),
        ):
            """
            Produce a full correlated trace for a synapse launch.

            Correlates all telemetry streams by time window anchored to the
            launch_id. Optionally invokes Chrome log analysis via Brain core
            readers. Writes a self-contained digest file ready to share with
            any AI for diagnosis without additional context.

            Output: logs/synapse/trace_<launch_id>.log
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            try:
                from brain.core.logs.logs_manager import LogsManager

                logger.info(f"🔍 Generating synapse trace for launch: {launch_id}")

                if gc.verbose:
                    typer.echo(f"🚀 Launch ID: {launch_id}", err=True)
                    if profile_id:
                        typer.echo(f"📁 Profile: {profile_id}", err=True)
                    if out:
                        typer.echo(f"💾 Output: {out}", err=True)

                manager = LogsManager()
                result = manager.generate_launch_trace(
                    launch_id=launch_id,
                    profile_id=profile_id,
                    out_path=out,
                )

                logger.info(f"✅ Trace generated: {result['output_file']}")

                data = {
                    "status": "success",
                    "operation": "logs_launch_trace",
                    "data": result,
                }

                gc.output(data, self._render_launch_trace_success)

            except FileNotFoundError as e:
                logger.error(f"❌ Required file not found: {e}")
                self._handle_error(gc, f"Required file not found: {e}")
            except ValueError as e:
                logger.error(f"❌ Invalid argument: {e}")
                self._handle_error(gc, str(e))
            except Exception as e:
                logger.error(f"❌ Error generating trace: {e}", exc_info=True)
                self._handle_error(gc, f"Error generating trace: {e}")

        # ==================== SUBCOMMAND: summary ====================
        @app.command(name="summary")
        def summary(
            ctx: typer.Context,
            since: str = typer.Option("10m", "--since", help="Window for error/warning count (e.g. 10m, 1h)"),
        ):
            """
            Dashboard of all active log streams.

            Shows last activity time, error count and warning count for each
            stream registered in telemetry.json within the --since window.

            Output: table to stdout
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            try:
                from brain.core.logs.logs_manager import LogsManager

                logger.info(f"📊 Generating logs summary (since: {since})")

                if gc.verbose:
                    typer.echo(f"⏱️  Since: {since}", err=True)

                manager = LogsManager()
                result = manager.get_summary(since=since)

                logger.info(f"✅ Summary ready: {len(result['streams'])} streams")

                data = {
                    "status": "success",
                    "operation": "logs_summary",
                    "data": result,
                }

                gc.output(data, self._render_summary_success)

            except Exception as e:
                logger.error(f"❌ Error generating summary: {e}", exc_info=True)
                self._handle_error(gc, f"Error generating summary: {e}")

    # ==================== RENDER METHODS ====================

    def _render_stream_success(self, data: dict):
        """Human-readable output for stream command."""
        result = data.get("data", {})
        lines = result.get("lines", [])

        if not lines:
            typer.echo(f"[{result.get('stream_name')}] (no matching lines)")
            return

        for line in lines:
            typer.echo(line)

    def _render_launch_trace_success(self, data: dict):
        """Human-readable output for launch-trace command."""
        result = data.get("data", {})

        typer.echo("\n🔍 Synapse Trace Generated")
        typer.echo("=" * 70)
        typer.echo(f"\n🚀 Launch ID:  {result.get('launch_id')}")
        if result.get("profile_id"):
            typer.echo(f"📁 Profile:    {result.get('profile_id')}")
        typer.echo(f"\n⏱️  Window:     {result.get('window_start')} → {result.get('window_end')}")
        typer.echo(f"\n💾 Output:     {result.get('output_file')}")
        typer.echo(f"\n📊 Stats:")
        typer.echo(f"   Streams analyzed: {result.get('streams_analyzed', 0)}")
        typer.echo(f"   Total lines:      {result.get('total_lines', 0)}")
        typer.echo(f"   Errors:           {result.get('errors', 0)}")
        typer.echo(f"   Warnings:         {result.get('warnings', 0)}")

        if result.get("errors", 0) > 0:
            typer.echo(f"\n⚠️  {result['errors']} error(s) detected — review the trace file for details")
        else:
            typer.echo(f"\n✅ No errors detected in the analysis window")

    def _render_summary_success(self, data: dict):
        """Human-readable output for summary command."""
        result = data.get("data", {})
        streams = result.get("streams", [])
        since = result.get("since", "10m")

        typer.echo(f"\n📊 Log Streams Summary (window: {since})")
        typer.echo("=" * 80)
        typer.echo(
            f"\n{'stream':<32}  {'última actividad':<18}  {'errores':<14}  {'warnings'}"
        )
        typer.echo("-" * 80)

        for s in streams:
            stream_id = s.get("stream_id", "")
            last_seen = s.get("last_seen_ago", "(file not found)")
            errors = s.get("errors", 0)
            warnings = s.get("warnings", 0)
            file_exists = s.get("file_exists", False)

            err_str = f"{errors}  ←" if errors > 0 else str(errors)
            warn_str = str(warnings)

            if not file_exists:
                typer.echo(f"{stream_id:<32}  {'(archivo no existe)':<18}  -               -")
            else:
                typer.echo(f"{stream_id:<32}  {last_seen:<18}  {err_str:<14}  {warn_str}")

        total_errors = sum(s.get("errors", 0) for s in streams)
        typer.echo(f"\n{'─' * 80}")
        typer.echo(f"{'TOTAL':<32}  {'':<18}  {total_errors:<14}  {sum(s.get('warnings', 0) for s in streams)}")
        typer.echo()

    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)