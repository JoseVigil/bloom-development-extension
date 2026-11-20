"""CLI surface for deterministic EXP evaluation."""

from pathlib import Path
from typing import Optional

import typer

from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class EvaluateExpCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="evaluate-exp",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Evaluate EXP evidence and isolated project unit tests",
            examples=[
                "brain --json intent evaluate-exp --nucleus-path C:/org/.bloom/.nucleus-org "
                "--mandate-id MND-1 --action-id exp-1 --project-path C:/project "
                "--ing-ref ing.json --ing-sha256 sha256:<digest> "
                "--dis-ref dis.json --dis-sha256 sha256:<digest> "
                "--doc-ref doc.json --doc-sha256 sha256:<digest>",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            nucleus_path: Path = typer.Option(..., "--nucleus-path", help="Nucleus root that owns the EXP artifact"),
            mandate_id: str = typer.Option(..., "--mandate-id", help="Mandate identifier correlated with this EXP"),
            action_id: str = typer.Option(..., "--action-id", help="Mandate Action identifier for this EXP"),
            project_path: Path = typer.Option(..., "--project-path", help="Project whose unit tests are evaluated on an isolated copy"),
            ing_ref: str = typer.Option(..., "--ing-ref", help="Absolute or Nucleus-relative ING evidence file"),
            ing_sha256: str = typer.Option(..., "--ing-sha256", help="Expected ING digest as sha256:<64 lowercase hex>"),
            dis_ref: str = typer.Option(..., "--dis-ref", help="Absolute or Nucleus-relative DIS evidence file"),
            dis_sha256: str = typer.Option(..., "--dis-sha256", help="Expected DIS digest as sha256:<64 lowercase hex>"),
            doc_ref: str = typer.Option(..., "--doc-ref", help="Absolute or Nucleus-relative DOC evidence file"),
            doc_sha256: str = typer.Option(..., "--doc-sha256", help="Expected DOC digest as sha256:<64 lowercase hex>"),
            dev_ref: Optional[str] = typer.Option(None, "--dev-ref", help="Optional absolute or Nucleus-relative DEV evidence file"),
            dev_sha256: Optional[str] = typer.Option(None, "--dev-sha256", help="Expected optional DEV digest as sha256:<64 lowercase hex>"),
        ) -> None:
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            try:
                if bool(dev_ref) != bool(dev_sha256):
                    raise ValueError("--dev-ref and --dev-sha256 must be supplied together")
                evidence = {
                    "ing": (ing_ref, ing_sha256),
                    "dis": (dis_ref, dis_sha256),
                    "doc": (doc_ref, doc_sha256),
                }
                if dev_ref and dev_sha256:
                    evidence["dev"] = (dev_ref, dev_sha256)
                if gc.verbose:
                    typer.echo(f"Evaluating EXP action {action_id} on an isolated Project copy...", err=True)
                from brain.core.intent.experiment import evaluate_exp
                result = evaluate_exp(
                    nucleus_path=nucleus_path,
                    mandate_id=mandate_id,
                    action_id=action_id,
                    project_path=project_path,
                    evidence_refs=evidence,
                )
                gc.output({
                    "status": "success",
                    "operation": "intent_evaluate_exp",
                    "data": result,
                }, self._render_success)
            except Exception as error:
                gc.error(str(error), exit_code=1)

    def _render_success(self, payload: dict) -> None:
        result = payload["data"]
        typer.echo(f"EXP {result['status']}: {result['result_ref']}")
        if result["findings"]:
            typer.echo(f"Findings: {len(result['findings'])}")
