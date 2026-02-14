"""OpenAI keys add command."""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class OpenAIKeysAddCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="keys-add",
            category=CommandCategory.OPENAI,
            version="1.0.0",
            description="Add new OpenAI API key",
            examples=["brain openai keys-add --profile 'GPT4' --key sk-... --priority 1"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("keys-add")
        def add(
            ctx: typer.Context,
            profile: str = typer.Option(..., "--profile", "-p", help="Profile name"),
            key: str = typer.Option(..., "--key", "-k", help="OpenAI API key"),
            priority: int = typer.Option(0, "--priority", help="Priority: 1=preferred, 0=normal, -1=backup")
        ):
            """Add new OpenAI API key with profile."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.shared.credentials.unified_manager import UnifiedCredentialManager
                
                if gc.verbose:
                    typer.echo(f"🔑 Adding OpenAI key for profile '{profile}'...", err=True)
                
                manager = UnifiedCredentialManager()
                manager.add_key("openai", profile, key, priority)
                
                priority_label = {1: "Preferred", 0: "Normal", -1: "Backup"}.get(priority, "Normal")
                
                result = {
                    "status": "success",
                    "operation": "add",
                    "profile": profile,
                    "priority": priority
                }
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps(result))
                else:
                    typer.echo(f"✅ OpenAI key added")
                    typer.echo(f"   Profile: {profile}")
                    typer.echo(f"   Priority: {priority_label} ({priority})")
                
            except ValueError as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ {e}", err=True)
                raise typer.Exit(code=1)
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ Failed to add key: {e}", err=True)
                raise typer.Exit(code=1)
