import json
import os
from pathlib import Path

import typer

from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory
from aitap.accounting.store import AccountingStore
from aitap.intelligence.service import IntelligenceService, LocalSupplyContext
from aitap.providers.base import SupplyError
from aitap.routing.engine import RoutingEngine, RoutingError
from aitap.runtime_paths import resource_root


class IntelligenceSupplyCommand(BaseCommand):
    def metadata(self):
        return CommandMetadata(name="supply", category=CommandCategory.ROUTE,
            description="Invoca Intelligence Supply: con privacy approved_cloud resuelve la credencial via Nucleus Vault; con privacy local aplica la politica de acceso empaquetada y consulta a Ollama por loopback con el digest del modelo verificado antes del envio. Registra contabilidad durable con replay",
            examples=["aitap --json route supply --request request.json"],
            requires_vault=True)

    def register(self, app):
        @app.command("supply")
        def execute(ctx: typer.Context,
                    request: Path = typer.Option(..., "--request", exists=True, help="Transport request"),
                    state_dir: Path = typer.Option(None, "--state-dir", help="AITAP accounting directory"),
                    policy: Path = typer.Option(None, "--policy", help="Routing policy"),
                    registry: Path = typer.Option(None, "--registry", help="Approved provider registry")):
            root = resource_root()
            json_mode = bool(getattr(ctx.obj, "json_mode", False))

            def fail(exc):
                if json_mode:
                    typer.echo(json.dumps(exc.envelope(), ensure_ascii=True, sort_keys=True))
                else:
                    typer.echo(f"Error [{exc.code}/{exc.stage}]: {exc}", err=True)
                raise typer.Exit(1)

            try:
                request_value = json.loads(request.read_text(encoding="utf-8"))
                state_dir = state_dir or Path(os.environ.get("AITAP_STATE_DIR", ""))
                if str(state_dir) == ".":
                    raise SupplyError("INVALID_REQUEST", "configuration", "AITAP_STATE_DIR is required")
                # Accounting is never placed inside a codebase, including AITAP itself.
                resolved = state_dir.resolve()
                if any((p / ".git").exists() or (p / "pyproject.toml").exists()
                       for p in [resolved, *resolved.parents]):
                    raise SupplyError("INVALID_REQUEST", "configuration", "State directory must be outside projects")
                policy_version = request_value.get("routing", {}).get("policy_version")
                default_policy = (root / "policies/mandate-gen-v1.json" if policy_version == "mandate-gen/v1"
                                  else root / "policies/genesis-runtime-intelligence-v2.json")
                engine = RoutingEngine.from_files(policy or default_policy,
                    registry or root / "registry/genesis-pilot-v2.json")
                # La ruta local usa siempre la politica de acceso empaquetada, el catalogo
                # y el host loopback de Ollama observado por el colector de la plataforma.
                result = IntelligenceService(engine, AccountingStore(resolved), local=LocalSupplyContext()).supply(
                    request_value)
            except SupplyError as exc:
                fail(exc)
            except RoutingError as exc:
                fail(SupplyError("INVALID_REQUEST", "policy", str(exc)))
            except (OSError, ValueError, KeyError, TypeError):
                fail(SupplyError("INVALID_REQUEST", "configuration"))
            if json_mode:
                typer.echo(json.dumps(result, ensure_ascii=True, sort_keys=True))
            else:
                typer.echo(
                    f"supply completed: provider={result['provider']} model={result['model']} "
                    f"outcome={result['outcome']} inference={result['logical_inference_id']}"
                )
