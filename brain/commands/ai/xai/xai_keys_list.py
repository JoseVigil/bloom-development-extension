"""xAI keys list command."""
import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class XAIKeysListCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="keys-list",
            category=CommandCategory.XAI,
            version="1.0.0",
            description="List all xAI API keys",
            examples=["brain xai keys-list", "brain xai keys-list --json"]
        )
    
    def register(self, app: typer.Typer):
        @app.command("keys-list")
        def list_keys(ctx: typer.Context):
            """List all registered xAI API keys."""
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.shared.credentials.unified_manager import UnifiedCredentialManager
                
                if gc.verbose:
                    typer.echo("📋 Loading xAI keys...", err=True)
                
                manager = UnifiedCredentialManager()
                xai_manager = manager.get_manager("xai")
                keys = xai_manager.list_keys()
                
                if not keys:
                    result = {
                        "status": "success",
                        "operation": "list",
                        "keys": [],
                        "total": 0
                    }
                    
                    if gc.json_mode:
                        import json
                        typer.echo(json.dumps(result))
                    else:
                        typer.echo("ℹ️  No xAI keys configured")
                    return
                
                # Build result
                keys_data = []
                for profile_name, info in keys.items():
                    keys_data.append({
                        "profile": profile_name,
                        "priority": info.priority,
                        "is_active": info.is_active,
                        "total_quota": info.total_quota,
                        "used_quota": info.used_quota,
                        "available_quota": info.available_quota,
                        "usage_percentage": round(info.usage_percentage, 1),
                        "last_used": info.last_used,
                        "created_at": info.created_at
                    })
                
                result = {
                    "status": "success",
                    "operation": "list",
                    "keys": keys_data,
                    "total": len(keys_data)
                }
                
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps(result))
                else:
                    typer.echo(f"📊 xAI API Keys ({len(keys_data)} total)\n")
                    
                    for key_info in sorted(keys_data, key=lambda x: (-x["priority"], x["profile"])):
                        status_icon = "✅" if key_info["is_active"] else "⏸️"
                        priority_label = {1: "⭐ Preferred", 0: "Normal", -1: "🔄 Backup"}.get(key_info["priority"], "Normal")
                        
                        typer.echo(f"{status_icon} {key_info['profile']}")
                        typer.echo(f"   Priority: {priority_label}")
                        typer.echo(f"   Quota: {key_info['used_quota']:,} / {key_info['total_quota']:,} ({key_info['usage_percentage']}%)")
                        
                        if key_info["last_used"]:
                            typer.echo(f"   Last used: {key_info['last_used']}")
                        typer.echo()
                
            except Exception as e:
                if gc.json_mode:
                    import json
                    typer.echo(json.dumps({"status": "error", "message": str(e)}))
                else:
                    typer.echo(f"❌ Failed to list keys: {e}", err=True)
                raise typer.Exit(code=1)
