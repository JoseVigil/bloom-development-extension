import typer

from aitap.cli.base import BaseCommand, CommandMetadata
from aitap.cli.categories import CommandCategory


class KeysListCommand(BaseCommand):
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="list",
            category=CommandCategory.KEYS,
            description="Lista referencias de keys registradas por proveedor (placeholder)",
            examples=["aitap keys list"],
            requires_vault=True,
        )

    def register(self, app: typer.Typer):
        @app.command("list")
        def list_keys():
            """
            Placeholder: todavia no llama a Nucleus Vault (via el mismo VaultClient
            que usa brain/shared/credentials/vault.py) para leer key_ids reales.
            Cuando se implemente, esto solo mostrara referencias (key_id, provider,
            priority) — nunca el valor real de la key.
            """
            typer.echo("aitap keys list: no implementado todavia. Pendiente integrar VaultClient (nucleus vault).")
