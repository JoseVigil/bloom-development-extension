"""Gemini keys delete command."""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class GeminiKeysDeleteCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="keys-delete",
            category=CommandCategory.GEMINI,
            version="1.0.0",
            description="Delete Gemini API key",
            examples=["brain gemini keys-delete 'Personal'"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("keys-delete")
        def delete(
            ctx: typer.Context,
            profile: str = typer.Argument(..., help="Profile name to delete")
        ):
            """Delete a Gemini API key."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.shared.credentials import GeminiKeyManager
                
                manager = GeminiKeyManager()
                manager.delete_key(profile)
                
                result = {"status": "success", "profile": profile}
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps(result))
                else:
                    typer.echo(f"✅ Profile '{profile}' deleted")
                
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