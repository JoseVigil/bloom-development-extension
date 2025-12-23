"""
Intent download command - Receives AI responses via TCP socket.

This command listens for responses from the native Host C++ bridge,
validates them, and writes them to the appropriate .response/ directory.
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class DownloadCommand(BaseCommand):
    """
    Download AI response and save to .response/ directory.
    
    This command receives the processed AI response through the Native Host C++
    bridge and writes it to disk in the correct pipeline structure. It supports
    both socket-based communication (normal mode) and file-based input (testing mode).
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="download",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Download AI response and save to .response/ directory",
            examples=[
                "brain intent download --intent-id abc-123",
                "brain intent download --socket-mode",
                "brain intent download --input-file response.json",
                "brain intent download --intent-id abc-123 --timeout 600"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Register the download command in the Typer application.
        """
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            intent_id: Optional[str] = typer.Option(
                None,
                "--intent-id", "-i",
                help="Intent UUID to download response for"
            ),
            folder_name: Optional[str] = typer.Option(
                None,
                "--folder",
                help="Intent folder name (alternative to intent-id)"
            ),
            socket_mode: bool = typer.Option(
                False,
                "--socket-mode",
                help="Listen on TCP socket for Host connection"
            ),
            input_file: Optional[Path] = typer.Option(
                None,
                "--input-file",
                help="Read response from file (for testing)"
            ),
            host: str = typer.Option(
                "127.0.0.1",
                "--host",
                help="Host IP to listen on"
            ),
            port: int = typer.Option(
                5679,
                "--port",
                help="Port to listen on (different from Host's 5678)"
            ),
            timeout: int = typer.Option(
                300,
                "--timeout",
                help="Socket timeout in seconds"
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "--nucleus-path",
                help="Path to Bloom project (auto-detected if omitted)"
            )
        ):
            """
            Download AI response from Native Host or file.
            
            This command receives AI responses and saves them to the intent's
            .response/ directory with proper structure and file extraction.
            
            Modes:
            - Socket mode (default with --socket-mode): Listen for Host connection
            - File mode (--input-file): Read from JSON file for testing
            
            The response must follow the Bloom protocol v1.0 format.
            """
            
            # 1. Recover GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            # 2. Validate inputs
            if not socket_mode and not input_file:
                self._handle_error(
                    gc,
                    "Must specify either --socket-mode or --input-file"
                )
            
            if socket_mode and input_file:
                self._handle_error(
                    gc,
                    "Cannot use both --socket-mode and --input-file"
                )
            
            if not intent_id and not folder_name:
                self._handle_error(
                    gc,
                    "Must specify either --intent-id or --folder"
                )
            
            try:
                # 3. Lazy Import of Core
                from brain.core.intent.download_manager import DownloadManager
                
                # 4. Verbose logging
                if gc.verbose:
                    typer.echo(
                        f"🎧 Initializing download for intent: {intent_id or folder_name}",
                        err=True
                    )
                
                # 5. Initialize manager
                manager = DownloadManager(
                    intent_id=intent_id,
                    folder_name=folder_name,
                    nucleus_path=nucleus_path
                )
                
                # 6. Download response (from socket or file)
                if socket_mode:
                    if gc.verbose:
                        typer.echo(
                            f"🎧 Listening on {host}:{port} for response...",
                            err=True
                        )
                    
                    response_data = manager.download_from_socket(
                        host=host,
                        port=port,
                        timeout=timeout,
                        verbose=gc.verbose
                    )
                else:
                    if gc.verbose:
                        typer.echo(
                            f"📂 Reading response from file: {input_file}",
                            err=True
                        )
                    
                    response_data = manager.download_from_file(input_file)
                
                # 7. Save response to disk
                if gc.verbose:
                    typer.echo("💾 Saving response to disk...", err=True)
                
                save_result = manager.save_response(response_data)
                
                # 8. Package result
                result = {
                    "status": "success",
                    "operation": "intent_download",
                    "data": save_result
                }
                
                # 9. Output dual
                gc.output(result, self._render_success)
                
            except FileNotFoundError as e:
                self._handle_error(gc, f"File not found: {e}")
            except ValueError as e:
                self._handle_error(gc, f"Validation error: {e}")
            except ConnectionError as e:
                self._handle_error(gc, f"Connection error: {e}")
            except TimeoutError as e:
                self._handle_error(gc, f"Timeout: {e}")
            except Exception as e:
                self._handle_error(gc, f"Unexpected error: {e}")
    
    def _render_success(self, data: dict):
        """Human-readable output for successful download."""
        download_data = data.get("data", {})
        
        typer.echo(f"\n✅ Download completed successfully")
        typer.echo(f"📋 Intent ID: {download_data.get('intent_id', 'unknown')}")
        typer.echo(f"🎯 Pipeline Stage: {download_data.get('stage', 'unknown')}")
        typer.echo(f"📄 Raw Output: {download_data.get('raw_output_path', 'unknown')}")
        typer.echo(f"📁 Files Directory: {download_data.get('files_dir', 'unknown')}")
        typer.echo(f"📦 Files Saved: {download_data.get('files_saved', 0)}")
        typer.echo(f"✓ Status: {download_data.get('completion_status', 'unknown')}")
        
        # List saved files if any
        if download_data.get('files_saved', 0) > 0 and download_data.get('file_list'):
            typer.echo("\n📝 Extracted Files:")
            for file_name in download_data['file_list']:
                typer.echo(f"   {file_name}")
        
        typer.echo(f"\n💡 Next: brain intent parse --intent-id {download_data.get('intent_id', '')}")
    
    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({
                "status": "error",
                "operation": "intent_download",
                "message": message
            }))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)