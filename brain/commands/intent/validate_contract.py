"""
Intent validate-contract command - Validate a BSIP-Response (Contrato D) payload.

This command reads a BSIP-Response JSON (create/edit/patch/delete operations
with per-operation checksums) and validates it against Contrato D v0.1: shape
(JSON Schema) and, optionally, scope (authorized path prefixes).

This is unrelated to `brain intent validate` (Gemini semantic analysis of
staged files) and unrelated to the legacy dev/doc pipeline
(ResponseParser -> StagingManager -> MergeManager). Contrato D / BSIP-Response
has no producer or consumer wired into the codebase yet — this command exists
to validate synthetic/test payloads ahead of the future OpenCode adapter.
"""

import json as json_module

import typer
from pathlib import Path
from typing import List, Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class ValidateContractCommand(BaseCommand):
    """
    Validate a BSIP-Response (Contrato D) payload against the v0.1 schema.

    Reads a BSIP-Response from a JSON file, validates its shape against
    Contrato D v0.1, and — if authorized prefixes are provided — validates
    that every operation's path stays within the authorized scope.
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="validate-contract",
            category=CommandCategory.INTENT,
            version="1.0.0",
            description="Validate a BSIP-Response (Contrato D) payload against the v0.1 schema",
            examples=[
                "brain intent validate-contract --input-file response.json",
                "brain intent validate-contract --input-file response.json --scope-prefix src/app",
                "brain intent validate-contract --input-file response.json --scope-prefix src/app --scope-prefix docs",
                "brain intent validate-contract --input-file response.json --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        """
        Registers the validate-contract command in the Typer application.
        """
        @app.command(name=self.metadata().name)
        def execute(
            ctx: typer.Context,
            input_file: Path = typer.Option(
                ...,
                "--input-file",
                help="Path to a BSIP-Response JSON file to validate"
            ),
            scope_prefix: Optional[List[str]] = typer.Option(
                None,
                "--scope-prefix",
                help=(
                    "Authorized path prefix for this intent. Repeatable "
                    "(--scope-prefix a --scope-prefix b) or comma-separated "
                    "(--scope-prefix a,b). If omitted, only shape is validated."
                )
            )
        ):
            """
            Validate a BSIP-Response (Contrato D) payload.

            This command:
            1. Reads the BSIP-Response JSON from --input-file
            2. Validates its shape against Contrato D v0.1 (JSON Schema)
            3. If --scope-prefix is provided, validates that every operation's
               path stays within the authorized prefixes
            4. Reports valid/invalid plus a list of violations (json_pointer + hint)
            """

            # 1. Recover GlobalContext
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            # 2. Read input file
            if not input_file.exists():
                self._handle_error(gc, f"Input file not found: {input_file}")

            try:
                raw_text = input_file.read_text(encoding="utf-8")
            except OSError as e:
                self._handle_error(gc, f"Could not read input file: {e}")

            try:
                # 3. Lazy import of core logic
                from brain.core.intent.fs_contracts import (
                    validate_business_shape,
                    format_correction_prompt,
                    ContractViolation,
                    MalformedInputError,
                )

                # 4. Normalize --scope-prefix (repeatable and/or comma-separated)
                authorized_prefixes = self._flatten_prefixes(scope_prefix)

                # 5. Verbose logging
                if gc.verbose:
                    typer.echo(f"📄 Validating BSIP-Response: {input_file}", err=True)
                    if authorized_prefixes:
                        typer.echo(f"🔒 Scope prefixes: {authorized_prefixes}", err=True)
                    else:
                        typer.echo("🔓 No scope prefixes provided — shape-only validation", err=True)

                # 6. Execute core logic (never raise here — we want the full
                #    violation list even when invalid, not just the first one)
                payload, violations = validate_business_shape(
                    raw_text,
                    authorized_prefixes=authorized_prefixes,
                    raise_on_violation=False,
                )

                # 7. Package result
                result = {
                    "status": "success",
                    "operation": "intent_validate_contract",
                    "data": {
                        "input_file": str(input_file),
                        "valid": len(violations) == 0,
                        "scope_checked": authorized_prefixes is not None,
                        "operations_count": len(payload.get("operations", [])) if isinstance(payload, dict) else 0,
                        "violations": [
                            {
                                "code": v.code,
                                "message": v.message,
                                "json_pointer": v.json_pointer,
                                "hint": v.hint,
                            }
                            for v in violations
                        ],
                        "correction_prompt": format_correction_prompt(violations) if violations else None,
                    }
                }

                # 8. Dual output
                gc.output(result, self._render_success)

                # 9. Non-zero exit code when invalid, so this composes in scripts/CI
                if violations:
                    raise typer.Exit(code=1)

            except MalformedInputError as e:
                self._handle_error(gc, f"Malformed BSIP-Response: {e}")
            except ContractViolation as e:
                # Shouldn't happen with raise_on_violation=False, but kept for safety
                self._handle_error(gc, f"Contract violation: {e}")
            except typer.Exit:
                raise
            except Exception as e:
                self._handle_error(gc, f"Validation failed: {e}")

    @staticmethod
    def _flatten_prefixes(scope_prefix: Optional[List[str]]) -> Optional[List[str]]:
        """Accepts --scope-prefix repeated and/or comma-separated, returns a
        flat list, or None if no prefixes were provided at all (shape-only)."""
        if not scope_prefix:
            return None
        flat: List[str] = []
        for raw in scope_prefix:
            flat.extend(p.strip() for p in raw.split(",") if p.strip())
        return flat or None

    def _render_success(self, data: dict):
        """Human-friendly output for the validation result."""
        result = data["data"]

        typer.echo(f"\n📄 BSIP-Response Contract Validation")
        typer.echo(f"━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
        typer.echo(f"Input file: {result['input_file']}")
        typer.echo(f"Operations: {result['operations_count']}")
        typer.echo(f"Scope checked: {'Yes' if result['scope_checked'] else 'No (shape-only)'}")
        typer.echo()

        if result["valid"]:
            typer.echo("✅ Valid — payload conforms to Contrato D v0.1")
        else:
            violations = result["violations"]
            typer.echo(f"❌ Invalid — {len(violations)} violation(s)")
            typer.echo()
            for v in violations:
                pointer = v["json_pointer"] or "(root)"
                typer.echo(f"   • [{v['code']}] {pointer}: {v['message']}")
                if v["hint"]:
                    typer.echo(f"     → {v['hint']}")
            if result.get("correction_prompt"):
                typer.echo()
                typer.echo("📝 Correction prompt:")
                typer.echo("   " + result["correction_prompt"].replace("\n", "\n   "))

        typer.echo()

    def _handle_error(self, gc, message: str):
        """Unified error handling."""
        if gc.json_mode:
            typer.echo(json_module.dumps({
                "status": "error",
                "operation": "intent_validate_contract",
                "message": message
            }))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)
