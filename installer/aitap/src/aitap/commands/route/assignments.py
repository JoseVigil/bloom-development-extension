"""Read-only manual Intelligence Supply listing and validation."""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import typer
from jsonschema import Draft202012Validator, FormatChecker

from aitap.cli import output
from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory
from aitap.routing.engine import RoutingEngine
from aitap.health.backend_snapshot import observe_backend_health
from aitap.routing.manual_assignments import ManualAssignmentError, evaluate_manual_assignments
from aitap.runtime_paths import resource_root


class IntentSupplyAssignmentsCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="assignments",
            category=CommandCategory.ROUTE,
            description="Lista destinos elegibles o valida asignaciones manuales de Intelligence Supply por "
                        "action_id. Solo lectura: observa health sin inferencia, no consume tokens y no escribe Accounting",
            requires_vault=True,
            examples=[
                "aitap --json route assignments --mode list --request request.json",
                "aitap --json route assignments --mode validate --request request.json",
            ],
        )

    def register(self, app: typer.Typer):
        @app.command("assignments")
        def assignments(
            ctx: typer.Context,
            mode: str = typer.Option(..., "--mode", help="list o validate"),
            request: str = typer.Option(..., "--request", help="Ruta JSON o '-' para stdin"),
            policy: Optional[Path] = typer.Option(None, "--policy", help="Policy vinculada al contrato preparado"),
            registry: Optional[Path] = typer.Option(None, "--registry", help="Registry vinculado al contrato preparado"),
            state_dir: Optional[Path] = typer.Option(
                None, "--state-dir", help="Raiz de estado de AITAP (por defecto AITAP_STATE_DIR)"),
        ):
            if mode not in {"list", "validate"}:
                output.fail(ctx, "INVALID_OPERATION", "--mode debe ser list o validate", stage="request")
            try:
                raw = sys.stdin.read() if request == "-" else Path(request).read_text(encoding="utf-8")
                payload = json.loads(raw)
            except (OSError, ValueError):
                output.fail(ctx, "INVALID_REQUEST", "el pedido no es JSON legible", stage="request")
            root = resource_root()
            try:
                schema = json.loads((root / "contracts/v2/intent-supply-assignments-operation.schema.json")
                                    .read_text(encoding="utf-8"))
                errors = sorted(Draft202012Validator(schema, format_checker=FormatChecker()).iter_errors(payload),
                                key=lambda item: list(item.absolute_path))
                if errors:
                    first = errors[0]
                    location = "/".join(str(item) for item in first.absolute_path) or "$"
                    output.fail(ctx, "INVALID_REQUEST", "el pedido no cumple bloom.intent-supply-assignments/v1",
                                stage="request", details={"path": location, "reason": first.message})
                if mode == "list" and "assignments" in payload:
                    output.fail(ctx, "INVALID_REQUEST", "list no acepta assignments", stage="request")
                if mode == "validate" and "assignments" not in payload:
                    output.fail(ctx, "ASSIGNMENTS_REQUIRED", "validate requiere assignments", stage="request")
                engine = RoutingEngine.from_files(
                    policy or root / "policies/mandate-gen-v1.json",
                    registry or root / "registry/genesis-pilot-v2.json",
                )
                effective_state = state_dir or (Path(os.environ["AITAP_STATE_DIR"])
                                                if os.environ.get("AITAP_STATE_DIR") else None)
                current_time = datetime.now(timezone.utc)
                health = observe_backend_health(effective_state, engine.registry, now=current_time)
                result = evaluate_manual_assignments(
                    mode, payload, policy=engine.policy, registry=engine.registry,
                    policy_sha256=engine.policy_sha256 or "", registry_sha256=engine.registry_sha256 or "",
                    health_evidence=health.evidence, health_source_status=health.status,
                    health_source_reason=health.reason, health_snapshot_id=health.snapshot_id,
                    now=current_time,
                )
            except ManualAssignmentError as exc:
                output.fail(ctx, exc.code, str(exc), stage="assignments",
                            details={"action_id": exc.subject} if exc.subject else None)
            except (OSError, ValueError, KeyError, TypeError):
                output.fail(ctx, "INVALID_CONFIGURATION", "policy o registry no son utilizables", stage="configuration")

            def human(data):
                typer.echo(f"{data['mandate_id']}: {data['status']}")
                for action in data["actions"]:
                    if mode == "list":
                        typer.echo(f"  {action['action_id']}: {len(action['destinations'])} destino/s elegible/s")
                    else:
                        errors = ", ".join(action["errors"]) or "valida"
                        typer.echo(f"  {action['action_id']}: {errors}")

            output.emit(ctx, "route.assignments", result, human)
