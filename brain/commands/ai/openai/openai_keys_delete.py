"""OpenAI keys delete command."""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class OpenAIKeysDeleteCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="keys-delete",
            category=CommandCategory.OPENAI,
            version="1.0.0",
            description="Delete OpenAI API key",
            examples=["brain openai keys-delete --profile 'GPT4'"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("keys-delete")
        def delete(
            ctx: typer.Context,
            profile: str = typer.Option(..., "--profile", "-p", help="Profile name to delete")
        ):
            """Delete an OpenAI API key profile."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.shared.credentials.unified_manager import UnifiedCredentialManager
                
                if gc.verbose:
                    typer.echo(f"🗑️  Deleting OpenAI key for profile '{profile}'...", err=True)
                
                manager = UnifiedCredentialManager()
                manager.delete_key("openai", profile)
                
                result = {
                    "status": "success",
                    "operation": "delete",
                    "profile": profile
                }
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps(result))
                else:
                    typer.echo(f"✅ OpenAI key deleted: {profile}")
                
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
