import json
import os
from pathlib import Path

import typer

from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory
from aitap.accounting.store import AccountingStore
from aitap.intelligence.service import IntelligenceService
from aitap.providers.base import SupplyError
from aitap.routing.engine import RoutingEngine
from aitap.runtime_paths import resource_root


class IntelligenceSupplyCommand(BaseCommand):
    def metadata(self):
        return CommandMetadata(name="supply", category=CommandCategory.ROUTE,
            description="Invoke Intelligence Supply with durable accounting and replay",
            examples=["aitap --json route supply --request request.json"])

    def register(self, app):
        @app.command("supply")
        def execute(request: Path = typer.Option(..., "--request", exists=True, help="Transport request"),
                    state_dir: Path = typer.Option(None, "--state-dir", help="AITAP accounting directory"),
                    policy: Path = typer.Option(None, "--policy", help="Routing policy"),
                    registry: Path = typer.Option(None, "--registry", help="Approved provider registry")):
            root = resource_root()
            try:
                state_dir = state_dir or Path(os.environ.get("AITAP_STATE_DIR", ""))
                if str(state_dir) == ".":
                    raise SupplyError("INVALID_REQUEST", "configuration", "AITAP_STATE_DIR is required")
                # Accounting is never placed inside a codebase, including AITAP itself.
                resolved = state_dir.resolve()
                if any((p / ".git").exists() or (p / "pyproject.toml").exists()
                       for p in [resolved, *resolved.parents]):
                    raise SupplyError("INVALID_REQUEST", "configuration", "State directory must be outside projects")
                engine = RoutingEngine.from_files(policy or root / "policies/genesis-runtime-intelligence-v2.json",
                    registry or root / "registry/genesis-pilot-v2.json")
                result = IntelligenceService(engine, AccountingStore(resolved)).supply(
                    json.loads(request.read_text(encoding="utf-8")))
            except SupplyError as exc:
                typer.echo(json.dumps(exc.envelope()))
                raise typer.Exit(1)
            except (OSError, ValueError, KeyError, TypeError):
                typer.echo(json.dumps(SupplyError("INVALID_REQUEST", "configuration").envelope()))
                raise typer.Exit(1)
            typer.echo(json.dumps(result, ensure_ascii=True))
