"""Gemini keys list command."""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class GeminiKeysListCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="keys-list",
            category=CommandCategory.GEMINI,
            version="1.0.0",
            description="List all Gemini API keys",
            examples=["brain gemini keys-list"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("keys-list")
        def list_keys(ctx: typer.Context):
            """List all Gemini API keys with status."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.shared.credentials import GeminiKeyManager
                
                manager = GeminiKeyManager()
                profiles = manager.list_keys()
                
                if not profiles:
                    result = {"status": "success", "profiles": [], "count": 0}
                    if gc.json_mode:
                        import json
                        typer.echo(json.dumps(result))
                    else:
                        typer.echo("📭 No Gemini keys configured")
                    return
                
                result = {
                    "status": "success",
                    "profiles": [
                        {
                            "name": name,
                            "priority": info.priority,
                            "is_active": info.is_active,
                            "total_tokens": info.total_tokens,
                            "used_tokens": info.used_tokens,
                            "available_tokens": info.available_tokens,
                            "usage_percentage": round(info.usage_percentage, 1),
                            "last_used": info.last_used,
                            "consecutive_errors": info.consecutive_errors
                        }
                        for name, info in profiles.items()
                    ],
                    "count": len(profiles)
                }
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps(result))
                else:
                    typer.echo(f"🔑 Gemini API Keys ({result['count']}):\n")
                    
                    for profile in result["profiles"]:
                        if not profile["is_active"]:
                            icon = "🔴"
                            status = "Disabled"
                        elif profile["consecutive_errors"] > 0:
                            icon = "🟡"
                            status = f"Active (⚠️ {profile['consecutive_errors']} errors)"
                        elif profile["usage_percentage"] > 90:
                            icon = "🟠"
                            status = "Active (Low tokens)"
                        else:
                            icon = "🟢"
                            status = "Active"
                        
                        priority_labels = {1: "⭐ Preferred", 0: "Normal", -1: "🔵 Reserve"}
                        priority_label = priority_labels.get(profile["priority"], "Normal")
                        
                        typer.echo(f"{icon} {profile['name']} ({priority_label})")
                        typer.echo(f"   Used: {self._format_tokens(profile['used_tokens'])}/{self._format_tokens(profile['total_tokens'])} tokens ({profile['usage_percentage']}%)")
                        typer.echo(f"   Available: {self._format_tokens(profile['available_tokens'])} tokens")
                        
                        if profile["last_used"]:
                            typer.echo(f"   Last used: {profile['last_used']}")
                        else:
                            typer.echo(f"   Never used")
                        
                        typer.echo(f"   Status: {status}")
                        typer.echo()
                
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ Failed to list keys: {e}", err=True)
                raise typer.Exit(code=1)
    
    def _format_tokens(self, tokens: int) -> str:
        """Format token count for display."""
        if tokens >= 1_000_000:
            return f"{tokens / 1_000_000:.1f}M"
        elif tokens >= 1_000:
            return f"{tokens / 1_000:.0f}K"
        return str(tokens)