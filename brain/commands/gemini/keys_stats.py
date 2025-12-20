"""Gemini keys stats command."""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory

class GeminiKeysStatsCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="keys-stats",
            category=CommandCategory.GEMINI,
            version="1.0.0",
            description="Show Gemini keys statistics",
            examples=["brain gemini keys-stats"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("keys-stats")
        def stats(ctx: typer.Context):
            """Show global Gemini keys statistics."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.shared.credentials import GeminiKeyManager
                
                manager = GeminiKeyManager()
                stats_data = manager.get_stats()
                
                result = {"status": "success", "stats": stats_data}
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps(result))
                else:
                    typer.echo(f"📊 Gemini Keys Statistics")
                    typer.echo(f"   Total keys: {stats_data['total_keys']}")
                    typer.echo(f"   Active: {stats_data['active_keys']}")
                    typer.echo(f"   Total quota: {self._format_tokens(stats_data['total_quota'])} tokens/day")
                    typer.echo(f"   Used today: {self._format_tokens(stats_data['used_tokens'])} tokens ({stats_data['usage_percentage']}%)")
                    typer.echo(f"   Available: {self._format_tokens(stats_data['available_tokens'])} tokens")
                    typer.echo(f"   Strategy: {stats_data['strategy'].replace('_', ' ').title()}")
                
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ Failed to get stats: {e}", err=True)
                raise typer.Exit(code=1)
    
    def _format_tokens(self, tokens: int) -> str:
        """Format token count for display."""
        if tokens >= 1_000_000:
            return f"{tokens / 1_000_000:.1f}M"
        elif tokens >= 1_000:
            return f"{tokens / 1_000:.0f}K"
        return str(tokens)