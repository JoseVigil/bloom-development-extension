"""OpenAI keys validate command."""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class OpenAIKeysValidateCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="keys-validate",
            category=CommandCategory.OPENAI,
            version="1.0.0",
            description="Validate OpenAI API key",
            examples=["brain openai keys-validate --profile 'GPT4'"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("keys-validate")
        def validate(
            ctx: typer.Context,
            profile: str = typer.Option(..., "--profile", "-p", help="Profile name to validate")
        ):
            """Validate an OpenAI API key by making a test API call."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.shared.credentials.unified_manager import UnifiedCredentialManager
                
                if gc.verbose:
                    typer.echo(f"🔍 Validating OpenAI key for profile '{profile}'...", err=True)
                
                manager = UnifiedCredentialManager()
                validation_result = manager.validate_key("openai", profile)
                
                result = {
                    "status": "success",
                    "operation": "validate",
                    "profile": profile,
                    "validation": validation_result
                }
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps(result))
                else:
                    if validation_result.get("valid", False):
                        typer.echo(f"✅ OpenAI key is valid: {profile}")
                        
                        if "model" in validation_result:
                            typer.echo(f"   Model: {validation_result['model']}")
                        
                        if "message" in validation_result:
                            typer.echo(f"   Response: {validation_result['message']}")
                    else:
                        typer.echo(f"❌ OpenAI key validation failed: {profile}")
                        if "error" in validation_result:
                            typer.echo(f"   Error: {validation_result['error']}")
                
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
                    typer.echo(f"❌ Failed to validate key: {e}", err=True)
                raise typer.Exit(code=1)
