"""Gemini keys validate command."""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class GeminiKeysValidateCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="keys-validate",
            category=CommandCategory.GEMINI,
            version="1.0.0",
            description="Validate Gemini API key",
            examples=["brain gemini keys-validate 'Personal'"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("keys-validate")
        def validate(
            ctx: typer.Context,
            profile: str = typer.Argument(..., help="Profile name to validate")
        ):
            """Validate a Gemini API key by testing connection."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.shared.credentials import GeminiKeyManager
                
                if gc.verbose:
                    typer.echo(f"🔍 Validating profile '{profile}'...", err=True)
                
                manager = GeminiKeyManager()
                validation = manager.validate_key(profile)
                
                result = {
                    "status": "success" if validation["valid"] else "error",
                    "profile": profile,
                    "validation": validation
                }
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps(result))
                else:
                    if validation["valid"]:
                        typer.echo(f"✅ Valid - Connected successfully")
                        typer.echo(f"   Profile: {profile}")
                        typer.echo(f"   Quota: {validation['usage_percentage']}% used ({self._format_tokens(validation['quota_available'])} remaining)")
                    else:
                        typer.echo(f"❌ Invalid")
                        typer.echo(f"   Profile: {profile}")
                        typer.echo(f"   Error: {validation['error']}")
                
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
                    typer.echo(f"❌ Validation failed: {e}", err=True)
                raise typer.Exit(code=1)
    
    def _format_tokens(self, tokens: int) -> str:
        """Format token count for display."""
        if tokens >= 1_000_000:
            return f"{tokens / 1_000_000:.1f}M"
        elif tokens >= 1_000:
            return f"{tokens / 1_000:.0f}K"
        return str(tokens)