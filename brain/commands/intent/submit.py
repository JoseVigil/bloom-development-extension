"""
Intent submission command - CLI Layer.
Handles the submission of intent payloads to AI providers through the native host bridge.
"""

import typer
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class SubmitCommand(BaseCommand):
    """
    Command to submit an intent payload to AI providers via native host.
    
    This is the fifth step (SUBMIT/Execution) in the Intent lifecycle.
    Sends the built payload to the configured AI provider (Claude, Gemini, etc.)
    through the native host TCP bridge.
    """
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="submit",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Submit an intent payload to AI provider through native host bridge",
            examples=[
                "brain intent submit --intent-id abc-123-def",
                "brain intent submit --folder-name .fix-login-a1b2c3d4",
                "brain intent submit --intent-id abc-123-def --provider claude --json",
                "brain intent submit -i abc-123-def -p /path/to/project --verbose"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Registers the intent submit command with the Typer application.
        """
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            intent_id: Optional[str] = typer.Option(
                None,
                "--intent-id",
                "-i",
                help="UUID of the intent to submit"
            ),
            folder_name: Optional[str] = typer.Option(
                None,
                "--folder-name",
                "-f",
                help="Folder name of the intent (e.g., .fix-login-a1b2c3d4)"
            ),
            provider: str = typer.Option(
                "claude",
                "--provider",
                help="AI provider to use: 'claude', 'gemini', etc."
            ),
            nucleus_path: Optional[Path] = typer.Option(
                None,
                "--nucleus-path",
                "-p",
                help="Path to the Nucleus (Bloom project root). Auto-detected if not provided."
            ),
            profile_path: Optional[str] = typer.Option(
                None,
                "--profile-path",
                help="Chrome profile path for the AI provider (optional)"
            ),
            host: str = typer.Option(
                "127.0.0.1",
                "--host",
                help="Native host IP address"
            ),
            port: int = typer.Option(
                5678,
                "--port",
                help="Native host TCP port"
            ),
            timeout: int = typer.Option(
                30,
                "--timeout",
                help="Connection timeout in seconds"
            )
        ):
            """
            Submit an intent payload to an AI provider through the native host bridge.
            
            This command locates the intent, reads the built payload and index files,
            then sends them to the native host (bloom-host.exe) via TCP connection.
            The native host forwards the request to the appropriate browser extension.
            
            Either --intent-id or --folder-name must be provided to identify the intent.
            """
            
            # 1. Recuperar GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 2. Validar que se proporcione al menos un identificador
                if not intent_id and not folder_name:
                    self._handle_error(
                        gc,
                        "Either --intent-id or --folder-name must be provided"
                    )
                
                # 3. Validar provider
                valid_providers = ["claude", "gemini", "openai", "custom"]
                if provider.lower() not in valid_providers:
                    if gc.verbose:
                        typer.echo(
                            f"⚠️  Warning: Unknown provider '{provider}'. Proceeding anyway...",
                            err=True
                        )
                
                # 4. Verbose logging
                if gc.verbose:
                    typer.echo(f"🔍 Locating intent...", err=True)
                    if intent_id:
                        typer.echo(f"   Intent ID: {intent_id}", err=True)
                    if folder_name:
                        typer.echo(f"   Folder: {folder_name}", err=True)
                    if nucleus_path:
                        typer.echo(f"   Nucleus: {nucleus_path}", err=True)
                    typer.echo(f"   Provider: {provider}", err=True)
                    typer.echo(f"   Host: {host}:{port}", err=True)
                
                # 5. Lazy Import del Core
                from brain.core.intent_manager import IntentManager
                
                # 6. Ejecutar lógica del Core
                manager = IntentManager()
                data = manager.submit_intent(
                    intent_id=intent_id,
                    folder_name=folder_name,
                    provider=provider,
                    nucleus_path=nucleus_path,
                    profile_path=profile_path,
                    host=host,
                    port=port,
                    timeout=timeout
                )
                
                # 7. Empaquetar resultado
                result = {
                    "status": "success",
                    "operation": "intent_submit",
                    "data": data
                }
                
                # 8. Output dual
                gc.output(result, self._render_success)
                
            except ValueError as e:
                self._handle_error(gc, f"Validation error: {e}")
            except FileNotFoundError as e:
                self._handle_error(gc, f"File not found: {e}")
            except ConnectionError as e:
                self._handle_error(gc, f"Connection error: {e}")
            except TimeoutError as e:
                self._handle_error(gc, f"Timeout error: {e}")
            except Exception as e:
                self._handle_error(gc, f"Unexpected error: {e}")
    
    def _render_success(self, data: dict):
        """
        Renders human-readable success output.
        
        Args:
            data: Result data from the operation
        """
        submit_data = data.get("data", {})
        
        typer.echo(f"\n✅ Intent submitted successfully")
        typer.echo(f"🆔 Intent ID: {submit_data['intent_id']}")
        typer.echo(f"📝 Name: {submit_data['intent_name']}")
        typer.echo(f"🤖 Provider: {submit_data['provider']}")
        typer.echo(f"📡 Command ID: {submit_data['command_id']}")
        
        # Host response information
        host_response = submit_data.get("host_response", {})
        if host_response:
            typer.echo(f"\n🖥️  Host Response:")
            typer.echo(f"   Status: {host_response.get('status', 'unknown')}")
            if host_response.get('message'):
                typer.echo(f"   Message: {host_response['message']}")
        
        # Payload info
        if submit_data.get("payload_size"):
            typer.echo(f"\n📦 Payload Size: {submit_data['payload_size']} bytes")
        
        # Timestamp
        if submit_data.get("submitted_at"):
            typer.echo(f"⏰ Submitted: {submit_data['submitted_at']}")
        
        typer.echo(f"\n💡 The AI provider is now processing your request...")
        typer.echo(f"💡 Use 'brain intent get --intent-id {submit_data['intent_id']}' to check status")
    
    def _handle_error(self, gc, message: str):
        """
        Unified error handling for CLI.
        
        Args:
            gc: GlobalContext instance
            message: Error message to display
        """
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)