import typer

from aitap.access.policy import AccessPolicyError, load_access_policy
from aitap.cli import output
from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory
from aitap.local.catalog import CatalogError, load_catalog


class RoutePolicyCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="policy",
            category=CommandCategory.ROUTE,
            description="Muestra la politica vigente de acceso de grifo y cuotas por modelo local (solo lectura; aun no se aplica en supply)",
            examples=["aitap route policy", "aitap --json route policy"],
        )

    def register(self, app: typer.Typer):
        @app.command("policy")
        def policy(ctx: typer.Context):
            """Politica por defecto empaquetada. Su modificacion requerira authorization_ref de Nucleus."""
            try:
                catalog = load_catalog()
                loaded = load_access_policy(catalog)
            except (CatalogError, AccessPolicyError) as exc:
                output.fail(ctx, exc.code, str(exc), stage="policy")
            data = {"policy_version": loaded.version, "fingerprint": loaded.fingerprint,
                    "enforced": False, "policy": loaded.document}

            def human(result):
                document = result["policy"]
                typer.echo(f"{result['policy_version']} ({document['status']}, decision por defecto: "
                           f"{document['default_decision']}, aplicada en supply: no)")
                for rule in document["models"]:
                    quotas = rule["quotas"]
                    consumers = ", ".join(rule["allowed_consumers"]) or "(ninguno todavia)"
                    typer.echo(f"  {rule['model_id']:<20} {'habilitado' if rule['enabled'] else 'deshabilitado'}"
                               f" · consumidores: {consumers}")
                    typer.echo(f"      ventana {quotas['window_seconds']}s · {quotas['max_inferences']} inferencias · "
                               f"{quotas['max_input_tokens']} tok entrada · {quotas['max_output_tokens']} tok salida · "
                               f"concurrencia {quotas['max_concurrency']} · timeout {quotas['timeout_seconds']}s")

            output.emit(ctx, "route.policy", data, human)
