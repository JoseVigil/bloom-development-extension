import json
import os
import sys
from pathlib import Path
from typing import Optional

import typer

from aitap.cli import output
from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory
from aitap.local.catalog import CatalogError
from aitap.local.ensure import EnsureError, LocalEnsure
from aitap.local.preflight import PreflightError

FAILURE_STATES = ("failed", "rejected")


class LocalEnsureCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="ensure",
            category=CommandCategory.LOCAL,
            description="Aprovisionamiento local de un modelo del catalogo por Ollama: check observa sin escribir; "
                        "apply exige authorization_ref verificada por Nucleus, descarga solo si falta, verifica el "
                        "digest del catalogo y corre una prueba de humo contabilizada",
            examples=["aitap --json local ensure --mode check --model <model_id> --state-dir <dir>",
                      "aitap --json local ensure --mode apply --request - --state-dir <dir>"],
        )

    def register(self, app: typer.Typer):
        @app.command("ensure")
        def ensure(ctx: typer.Context,
                   mode: str = typer.Option("check", "--mode", help="check (solo lectura) o apply"),
                   model: Optional[str] = typer.Option(None, "--model", help="model_id del catalogo (modo check)"),
                   request: Optional[str] = typer.Option(None, "--request",
                                                         help="Pedido ensure-request/v1 (modo apply): ruta o '-' para stdin"),
                   state_dir: Optional[Path] = typer.Option(None, "--state-dir",
                                                            help="Raiz de estado de AITAP (por defecto AITAP_STATE_DIR)")):
            """Nunca registra servicios, nunca escribe pesos y nunca ejecuta lo que el modelo responda."""
            root = state_dir or (Path(os.environ["AITAP_STATE_DIR"]) if os.environ.get("AITAP_STATE_DIR") else None)
            if root is None:
                output.fail(ctx, "STATE_DIR_REQUIRED", "definir --state-dir o AITAP_STATE_DIR", stage="ensure")
            if mode not in ("check", "apply"):
                output.fail(ctx, "INVALID_REQUEST", "--mode debe ser check o apply", stage="request")
            ensure_service = LocalEnsure(state_root=root)
            try:
                if mode == "check":
                    if not model or request:
                        output.fail(ctx, "INVALID_REQUEST", "check requiere --model y no acepta --request", stage="request")
                    output.log(ctx, "ensure check: observando Ollama sin escribir")
                    data = ensure_service.check(model)
                else:
                    if not request or model:
                        output.fail(ctx, "INVALID_REQUEST", "apply requiere --request y toma el modelo del pedido",
                                    stage="request")
                    try:
                        raw = sys.stdin.read() if request == "-" else Path(request).read_text(encoding="utf-8")
                        payload = json.loads(raw)
                    except (OSError, ValueError):
                        output.fail(ctx, "INVALID_REQUEST", "el pedido no es JSON legible", stage="request")
                    output.log(ctx, "ensure apply: verificando autorizacion con Nucleus")
                    data = ensure_service.apply(payload)
            except EnsureError as exc:
                output.fail(ctx, exc.code, str(exc), stage=exc.stage, retryable=exc.retryable)
            except (CatalogError, PreflightError) as exc:
                output.fail(ctx, exc.code, str(exc), stage="catalog")

            if mode == "apply" and data["status"] in FAILURE_STATES:
                error = data["error"] or {"code": "ENSURE_FAILED", "stage": "ensure", "retryable": False, "details": {}}
                output.fail(ctx, error["code"], f"local ensure {data['status']}", stage=error["stage"],
                            retryable=error["retryable"], details={**error["details"], "result": data})

            def human(result):
                typer.echo(f"{result['model_id']} ({result['ollama_ref']}): {result['status']}"
                           + (f" · fase {result['phase']}" if result["phase"] else ""))
                digests = result["manifest_digest"]
                typer.echo(f"  digest esperado {digests['expected']} · observado {digests['observed'] or '-'}")
                if result["progress"]:
                    typer.echo(f"  progreso {result['progress']['bytes_completed']}/{result['progress']['bytes_total']} bytes")
                if result["smoke"]:
                    smoke = result["smoke"]
                    typer.echo(f"  prueba de humo: {'aprobada' if smoke['passed'] else 'no aprobada'} "
                               f"({smoke['attempts']} intento/s)")
                if result["action_required"]:
                    typer.echo(f"  accion requerida: {result['action_required']}")
                if result["error"]:
                    typer.echo(f"  error: {result['error']['code']}")

            output.emit(ctx, "local.ensure", data, human)
