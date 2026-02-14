"""Claude keys stats command."""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class ClaudeKeysStatsCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="keys-stats",
            category=CommandCategory.CLAUDE,
            version="1.0.0",
            description="Show Claude API keys statistics",
            examples=["brain claude keys-stats", "brain claude keys-stats --json"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("keys-stats")
        def stats(ctx: typer.Context):
            """Display statistics for all Claude API keys."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.shared.credentials.unified_manager import UnifiedCredentialManager
                
                if gc.verbose:
                    typer.echo("📊 Calculating Claude key statistics...", err=True)
                
                manager = UnifiedCredentialManager()
                claude_manager = manager.get_manager("claude")
                stats_data = claude_manager.get_stats()
                
                result = {
                    "status": "success",
                    "operation": "stats",
                    "stats": stats_data
                }
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps(result))
                else:
                    typer.echo("📊 Claude API Keys Statistics\n")
                    typer.echo(f"Total Keys: {stats_data['total_keys']}")
                    typer.echo(f"Active Keys: {stats_data['active_keys']}")
                    typer.echo(f"Total Quota: {stats_data['total_quota']:,} {claude_manager.QUOTA_UNIT}")
                    typer.echo(f"Used Quota: {stats_data['used_quota']:,} {claude_manager.QUOTA_UNIT}")
                    typer.echo(f"Available Quota: {stats_data['available_quota']:,} {claude_manager.QUOTA_UNIT}")
                    typer.echo(f"Usage: {stats_data['usage_percentage']}%")
                    
                    if stats_data['total_keys'] == 0:
                        typer.echo("\nℹ️  No Claude keys configured")
                    elif stats_data['active_keys'] == 0:
                        typer.echo("\n⚠️  No active keys available")
                    elif stats_data['available_quota'] < 10000:
                        typer.echo("\n⚠️  Low quota remaining")
                
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ Failed to get stats: {e}", err=True)
                raise typer.Exit(code=1)
