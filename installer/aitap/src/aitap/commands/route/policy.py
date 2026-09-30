import typer

from aitap.access.enforcement import effective_grants, evaluate_grant
from aitap.access.policy import AccessPolicy, AccessPolicyError, load_access_policy
from aitap.cli import output
from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory
from aitap.local.catalog import CatalogError, load_catalog

CHECK_FIELDS = ("consumer", "intent_type", "policy_version", "model")


def describe(policy: AccessPolicy, check: dict | None = None) -> dict:
    """Datos de ``route policy``: politica aplicada, sus huellas y, opcionalmente, un permiso efectivo."""
    data = {"policy_version": policy.version, "fingerprint": policy.fingerprint,
            "file_sha256": policy.file_sha256, "enforced": True,
            "effective_grants": effective_grants(policy), "policy": policy.document}
    if check is not None:
        data["check"] = evaluate_grant(policy, model_id=check["model"], consumer_id=check["consumer"],
                                       intent_type=check["intent_type"], policy_version=check["policy_version"])
    return data


class RoutePolicyCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="policy",
            category=CommandCategory.ROUTE,
            description="Muestra la politica de acceso local que route supply aplica (decision por defecto deny, "
                        "permisos acotados, cuotas y file_sha256); con --consumer --intent-type --policy-version "
                        "--model evalua el permiso efectivo de esa combinacion (solo lectura)",
            examples=["aitap route policy", "aitap --json route policy",
                      "aitap --json route policy --consumer brain --intent-type gen "
                      "--policy-version mandate-gen-local/v1 --model functiongemma-270m"],
        )

    def register(self, app: typer.Typer):
        @app.command("policy")
        def policy(ctx: typer.Context,
                   consumer: str = typer.Option(None, "--consumer", help="Consumidor a evaluar (p. ej. brain)"),
                   intent_type: str = typer.Option(None, "--intent-type", help="ing, dis o gen"),
                   policy_version: str = typer.Option(None, "--policy-version", help="Version de politica de ruteo"),
                   model: str = typer.Option(None, "--model", help="model_id del catalogo")):
            """Politica por defecto empaquetada. Su modificacion requerira authorization_ref de Nucleus."""
            values = {"consumer": consumer, "intent_type": intent_type,
                      "policy_version": policy_version, "model": model}
            given = [k for k in CHECK_FIELDS if values[k] is not None]
            if given and len(given) != len(CHECK_FIELDS):
                output.fail(ctx, "INVALID_REQUEST", "la comprobacion requiere --consumer, --intent-type, "
                            "--policy-version y --model juntos", stage="policy")
            try:
                catalog = load_catalog()
                loaded = load_access_policy(catalog)
            except (CatalogError, AccessPolicyError) as exc:
                output.fail(ctx, exc.code, str(exc), stage="policy")
            data = describe(loaded, values if given else None)

            def human(result):
                document = result["policy"]
                typer.echo(f"{result['policy_version']} ({document['status']}, decision por defecto: "
                           f"{document['default_decision']}, aplicada en supply: si)")
                typer.echo(f"  file_sha256 {result['file_sha256']}")
                for rule in document["models"]:
                    quotas = rule["quotas"]
                    consumers = ", ".join(rule["allowed_consumers"]) or "(ninguno todavia)"
                    typer.echo(f"  {rule['model_id']:<20} {'habilitado' if rule['enabled'] else 'deshabilitado'}"
                               f" · consumidores: {consumers}")
                    typer.echo(f"      ventana {quotas['window_seconds']}s · {quotas['max_inferences']} inferencias · "
                               f"{quotas['max_input_tokens']} tok entrada · {quotas['max_output_tokens']} tok salida · "
                               f"concurrencia {quotas['max_concurrency']} · timeout {quotas['timeout_seconds']}s")
                grants = result["effective_grants"]
                typer.echo("  permisos efectivos: " + (", ".join(
                    f"{g['consumer_id']}/{g['intent_type']}/{g['policy_version']}/{g['model_id']}" for g in grants)
                    or "(ninguno)"))
                if "check" in result:
                    check = result["check"]
                    typer.echo(f"  comprobacion: {'PERMITIDO' if check['allowed'] else 'DENEGADO'} ({check['reason']})")

            output.emit(ctx, "route.policy", data, human)
