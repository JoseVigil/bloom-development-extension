"""
Chrome profile management and log analysis tools.
"""

import typer
from pathlib import Path
from typing import Optional, List
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory
from brain.shared.logger import get_logger

logger = get_logger(__name__)


class ChromeCommand(BaseCommand):
    """
    Chrome profile and debugging tools.
    Groups read-log, read-net-log, and chrome-mining subcommands.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="chrome",
            category=CommandCategory.CHROME,
            version="1.0.0",
            description="Chrome profile management and log analysis tools",
            examples=[
                "brain chrome read-log abc-123-def-456",
                "brain chrome read-log abc-123-def-456 --launch-id session-001",
                "brain chrome read-net-log abc-123-def-456 --filter-ai",
                "brain chrome read-net-log abc-123-def-456 --launch-id session-001",
                "brain chrome mining-log abc-123-def-456",
                "brain chrome mining-log abc-123-def-456 --launch-id session-001"
            ]
        )
    
    def register(self, app: typer.Typer) -> None:
        """Register Chrome subcommands directly in the provided app."""
        
        # ==================== SUBCOMMAND: read-log ====================
        @app.command(name="read-log")
        def read_log(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="Chrome profile UUID"),
            before: int = typer.Option(5, "--before", "-b", help="Lines of context before match"),
            after: int = typer.Option(5, "--after", "-a", help="Lines of context after match"),
            launch_id: Optional[str] = typer.Option(None, "--launch-id", "-l", help="Launch ID for separate output file")
        ):
            """
            Auditor de integridad del motor Chromium para diagnosticar fallos de sistema y bloqueos de seguridad.
            
            Detects critical Chromium errors: Sandbox failures, Permission errors, Client blocks, 
            Singleton conflicts, Native Messaging issues, and Fatal crashes.
            
            Input: BloomNucleus/profiles/[UUID]/engine_mining.log
            Output: BloomNucleus/logs/profiles/[UUID]/[LAUNCH_ID]_engine_read.log
            Without --launch-id: default_engine_read.log
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.chrome.log_reader import ChromeLogReader
                
                logger.info(f"🔍 Running engine audit for profile: {profile_id}")
                
                if gc.verbose:
                    typer.echo(f"🔍 Profile: {profile_id}", err=True)
                    typer.echo(f"📊 Context: {before} lines before, {after} lines after", err=True)
                    if launch_id:
                        typer.echo(f"🚀 Launch ID: {launch_id}", err=True)
                
                reader = ChromeLogReader()
                result = reader.read_and_filter(
                    profile_id=profile_id,
                    before_lines=before,
                    after_lines=after,
                    launch_id=launch_id
                )
                
                logger.info(f"✅ Engine audit complete: {result['matches_found']} errors detected")
                
                data = {
                    "status": "success",
                    "operation": "chrome_engine_audit",
                    "data": result
                }
                
                gc.output(data, self._render_read_log_success)
                
            except FileNotFoundError as e:
                logger.error(f"❌ Chrome log file not found: {e}")
                self._handle_error(gc, f"Chrome log file not found: {e}")
            except Exception as e:
                logger.error(f"❌ Error reading Chrome log: {e}", exc_info=True)
                self._handle_error(gc, f"Error reading Chrome log: {e}")
        
        # ==================== SUBCOMMAND: read-net-log ====================
        @app.command(name="read-net-log")
        def read_net_log(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="Chrome profile UUID"),
            filter_ai: bool = typer.Option(False, "--filter-ai", help="Filter for AI service requests only"),
            exclude: Optional[List[str]] = typer.Option(None, "--exclude", "-e", help="Exclude URL patterns"),
            include_quic: bool = typer.Option(False, "--include-quic", help="Include QUIC protocol events"),
            show_headers: bool = typer.Option(False, "--show-headers", help="Show HTTP headers in output"),
            launch_id: Optional[str] = typer.Option(None, "--launch-id", "-l", help="Launch ID for separate output file")
        ):
            """
            Analyze Chrome network logs with intelligent filtering.
            
            Parses Chrome's JSON net-log output and extracts:
            - URL requests (method, URL, status)
            - HTTP/2 headers (optional)
            - QUIC packets (optional)
            - AI service-specific traffic (with --filter-ai)
            
            Output: BloomNucleus/logs/profiles/[UUID]/chrome_bloom_net_log_YYYYMMDD.log
            With --launch-id: BloomNucleus/logs/profiles/[UUID]/[LAUNCH_ID]_engine_network.log
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.chrome.net_log_analyzer import NetLogAnalyzer
                
                logger.info(f"🌐 Analyzing Chrome network log for profile: {profile_id}")
                
                if gc.verbose:
                    typer.echo(f"🔍 Profile: {profile_id}", err=True)
                    typer.echo(f"🤖 AI filter: {filter_ai}", err=True)
                    typer.echo(f"🚫 Exclude: {exclude or 'None'}", err=True)
                    typer.echo(f"📦 Include QUIC: {include_quic}", err=True)
                    if launch_id:
                        typer.echo(f"🚀 Launch ID: {launch_id}", err=True)
                
                analyzer = NetLogAnalyzer()
                result = analyzer.analyze(
                    profile_id=profile_id,
                    filter_ai=filter_ai,
                    exclude_patterns=exclude or [],
                    include_quic=include_quic,
                    show_headers=show_headers,
                    launch_id=launch_id
                )
                
                logger.info(f"✅ Network log analyzed: {result['events_processed']} events")
                
                data = {
                    "status": "success",
                    "operation": "chrome_read_net_log",
                    "data": result
                }
                
                gc.output(data, self._render_net_log_success)
                
            except FileNotFoundError as e:
                logger.error(f"❌ Network log file not found: {e}")
                self._handle_error(gc, f"Network log file not found: {e}")
            except Exception as e:
                logger.error(f"❌ Error analyzing network log: {e}", exc_info=True)
                self._handle_error(gc, f"Error analyzing network log: {e}")
        
        # ==================== SUBCOMMAND: mining-log ====================
        @app.command(name="mining-log")
        def mining_log(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="Chrome profile UUID"),
            keyword: str = typer.Option("bloom", "--keyword", "-k", help="Keyword to search for"),
            before: int = typer.Option(5, "--before", "-b", help="Lines of context before match"),
            after: int = typer.Option(5, "--after", "-a", help="Lines of context after match"),
            launch_id: Optional[str] = typer.Option(None, "--launch-id", "-l", help="Launch ID for separate output file")
        ):
            """
            Read and filter engine_mining.log for a specific profile.
            
            Processes the engine_mining.log file and extracts bloom-related entries.
            Input: BloomNucleus/profiles/[UUID]/engine_mining.log
            Output: BloomNucleus/logs/profiles/[UUID]/engine_mining.log
            With --launch-id: BloomNucleus/logs/profiles/[UUID]/[LAUNCH_ID]_engine_mining.log
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.chrome.mining_log_reader import MiningLogReader
                
                logger.info(f"⛏️ Reading engine mining log for profile: {profile_id}")
                
                if gc.verbose:
                    typer.echo(f"🔍 Profile: {profile_id}", err=True)
                    typer.echo(f"🔑 Keyword: '{keyword}'", err=True)
                    typer.echo(f"📊 Context: {before} lines before, {after} lines after", err=True)
                    if launch_id:
                        typer.echo(f"🚀 Launch ID: {launch_id}", err=True)
                
                reader = MiningLogReader()
                result = reader.read_and_filter(
                    profile_id=profile_id,
                    keyword=keyword,
                    before_lines=before,
                    after_lines=after,
                    launch_id=launch_id
                )
                
                logger.info(f"✅ Mining log processed: {result['matches_found']} matches found")
                
                data = {
                    "status": "success",
                    "operation": "chrome_mining_log",
                    "data": result
                }
                
                gc.output(data, self._render_mining_log_success)
                
            except FileNotFoundError as e:
                logger.error(f"❌ Engine mining log file not found: {e}")
                self._handle_error(gc, f"Engine mining log file not found: {e}")
            except Exception as e:
                logger.error(f"❌ Error reading mining log: {e}", exc_info=True)
                self._handle_error(gc, f"Error reading mining log: {e}")
    
    # ==================== RENDER METHODS ====================
    
    def _render_read_log_success(self, data: dict):
        """Human-readable output for read-log success."""
        result = data.get("data", {})
        
        typer.echo("\n🔍 Chromium Engine Audit Results")
        typer.echo("=" * 70)
        typer.echo(f"\n🔍 Profile ID: {result.get('profile_id')}")
        if result.get('launch_id'):
            typer.echo(f"🚀 Launch ID: {result.get('launch_id')}")
        typer.echo(f"\n📄 Source: {result.get('source_file')}")
        typer.echo(f"💾 Output: {result.get('output_file')}")
        
        matches = result.get('matches_found', 0)
        if matches > 0:
            typer.echo(f"\n⚠️  Detected {matches} critical error{'s' if matches != 1 else ''}")
            
            # Show error distribution
            error_types = result.get('error_types', {})
            if error_types:
                typer.echo(f"\n📊 Error Distribution:")
                for error_type, count in sorted(error_types.items(), key=lambda x: x[1], reverse=True):
                    typer.echo(f"   • {error_type}: {count}")
        else:
            typer.echo(f"\n✅ No critical errors detected - Engine is healthy")
        
        typer.echo(f"\n📦 Total lines scanned: {result.get('total_lines', 0)}")
        typer.echo(f"✏️  Output lines: {result.get('output_lines', 0)}")
    
    def _render_net_log_success(self, data: dict):
        """Human-readable output for read-net-log success."""
        result = data.get("data", {})
        
        typer.echo("\n🌐 Chrome Network Log Analysis")
        typer.echo("=" * 70)
        typer.echo(f"\n🔍 Profile ID: {result.get('profile_id')}")
        if result.get('launch_id'):
            typer.echo(f"🚀 Launch ID: {result.get('launch_id')}")
        typer.echo(f"\n📄 Source: {result.get('source_file')}")
        typer.echo(f"💾 Output: {result.get('output_file')}")
        
        stats = result.get('statistics', {})
        typer.echo(f"\n📊 Statistics:")
        typer.echo(f"   Total events: {stats.get('total_events', 0)}")
        typer.echo(f"   URL requests: {stats.get('url_requests', 0)}")
        typer.echo(f"   HTTP/2 sessions: {stats.get('http2_sessions', 0)}")
        typer.echo(f"   QUIC packets: {stats.get('quic_packets', 0)}")
        
        if result.get('filter_ai'):
            typer.echo(f"   AI service requests: {stats.get('ai_requests', 0)}")
        
        filtered = result.get('filtered_requests', [])
        if filtered:
            typer.echo(f"\n📌 Sample requests (first 5):")
            for req in filtered[:5]:
                method = req.get('method', 'UNKNOWN')
                url = req.get('url', 'N/A')
                typer.echo(f"   {method} -> {url[:80]}...")
        
        typer.echo(f"\n✅ Analysis complete")
    
    def _render_mining_log_success(self, data: dict):
        """Human-readable output for mining-log success."""
        result = data.get("data", {})
        
        typer.echo("\n⛏️ Engine Mining Log Analysis Results")
        typer.echo("=" * 70)
        typer.echo(f"\n🔍 Profile ID: {result.get('profile_id')}")
        if result.get('launch_id'):
            typer.echo(f"🚀 Launch ID: {result.get('launch_id')}")
        typer.echo(f"🔑 Keyword: '{result.get('keyword')}'")
        typer.echo(f"\n📄 Source: {result.get('source_file')}")
        typer.echo(f"💾 Output: {result.get('output_file')}")
        
        matches = result.get('matches_found', 0)
        if matches > 0:
            typer.echo(f"\n✅ Found {matches} match{'es' if matches != 1 else ''}")
        else:
            typer.echo(f"\n⚠️ No matches found for keyword '{result.get('keyword')}'")
        
        typer.echo(f"\n📦 Total lines processed: {result.get('total_lines', 0)}")
        typer.echo(f"✏️ Output lines: {result.get('output_lines', 0)}")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)