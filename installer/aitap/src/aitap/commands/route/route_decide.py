import json
from pathlib import Path

import typer

from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory
from aitap.routing import RoutingEngine, RoutingError


class RouteDecideCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="decide",
            category=CommandCategory.ROUTE,
            description="Produce una decisión abstracta, determinística y auditable",
            examples=["aitap route decide --request request.json"],
        )

    def register(self, app: typer.Typer):
        @app.command("decide")
        def route_decide(
            request: Path = typer.Option(..., "--request", exists=True, readable=True),
            policy: Path | None = typer.Option(None, "--policy", exists=True, readable=True),
            registry: Path | None = typer.Option(None, "--registry", exists=True, readable=True),
        ):
            root = Path(__file__).resolve().parents[4]
            policy_path = policy or root / "policies" / "genesis-cross-cli-proof-v1.json"
            registry_path = registry or root / "registry" / "genesis-pilot-v1.json"
            try:
                engine = RoutingEngine.from_files(policy_path, registry_path)
                decision = engine.decide(json.loads(request.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError, RoutingError) as exc:
                typer.echo(json.dumps({"status": "error", "message": str(exc)}, ensure_ascii=False))
                raise typer.Exit(code=1)
            typer.echo(json.dumps(decision, ensure_ascii=False, sort_keys=True))
