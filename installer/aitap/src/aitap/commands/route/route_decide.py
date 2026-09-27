import json
from pathlib import Path

import typer

from aitap.cli import output
from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory
from aitap.routing import RoutingEngine, RoutingError
from aitap.runtime_paths import resource_root


class RouteDecideCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="decide",
            category=CommandCategory.ROUTE,
            description="Produce una decisión abstracta, determinística y auditable",
            examples=["aitap route decide --request request.json",
                      "aitap --json route decide --request request.json"],
        )

    def register(self, app: typer.Typer):
        @app.command("decide")
        def route_decide(
            ctx: typer.Context,
            request: Path = typer.Option(..., "--request", exists=True, readable=True),
            policy: Path | None = typer.Option(None, "--policy", exists=True, readable=True),
            registry: Path | None = typer.Option(None, "--registry", exists=True, readable=True),
        ):
            root = resource_root()
            policy_path = policy or root / "policies" / "genesis-runtime-intelligence-v2.json"
            registry_path = registry or root / "registry" / "genesis-pilot-v2.json"
            try:
                engine = RoutingEngine.from_files(policy_path, registry_path)
                decision = engine.decide(json.loads(request.read_text(encoding="utf-8")))
            except (OSError, json.JSONDecodeError):
                output.fail(ctx, "INVALID_REQUEST", "request, policy o registry ilegible o JSON invalido", stage="routing")
            except RoutingError as exc:
                output.fail(ctx, "ROUTING_REJECTED", str(exc), stage="routing")
            except (KeyError, TypeError, AttributeError):
                output.fail(ctx, "INVALID_REQUEST", "request con estructura invalida", stage="routing")
            if output.json_mode(ctx):
                # Contrato vigente: la decision cognituum.routing/v2 se emite tal cual.
                typer.echo(json.dumps(decision, ensure_ascii=False, sort_keys=True))
                return
            runtime, intelligence = decision["runtime"], decision["effective_intelligence"]
            typer.echo(f"decision   {decision['routing_decision_id']}")
            typer.echo(f"stage      {decision['stage']} · policy {decision['policy_version']}")
            typer.echo(f"runtime    {runtime['runtime_id']} ({runtime['runtime_kind']}, health {runtime['health']})")
            typer.echo(f"inteligencia {intelligence['backend_id']} · {intelligence['provider']} · {intelligence['model']}")
            typer.echo(f"credencial {intelligence['credential_ref'] or '-'}")
            typer.echo(f"huella     {decision['fingerprint']}")
