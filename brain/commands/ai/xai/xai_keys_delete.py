"""xAI keys delete command."""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class XAIKeysDeleteCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="keys-delete",
            category=CommandCategory.XAI,
            version="1.0.0",
            description="Delete xAI API key",
            examples=["brain xai keys-delete --profile 'Grok'"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("keys-delete")
        def delete(
            ctx: typer.Context,
            profile: str = typer.Option(..., "--profile", "-p", help="Profile name to delete")
        ):
            """Delete an xAI API key profile."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.shared.credentials.unified_manager import UnifiedCredentialManager
                
                if gc.verbose:
                    typer.echo(f"🗑️  Deleting xAI key for profile '{profile}'...", err=True)
                
                manager = UnifiedCredentialManager()
                manager.delete_key("xai", profile)
                
                result = {
                    "status": "success",
                    "operation": "delete",
                    "profile": profile
                }
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps(result))
                else:
                    typer.echo(f"✅ xAI key deleted: {profile}")
                
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
                    typer.echo(f"❌ Failed to delete key: {e}", err=True)
                raise typer.Exit(code=1)
