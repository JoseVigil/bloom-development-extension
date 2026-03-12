"""
Synapse Host Init CLI.
Comando para inicializar la estructura de logs del host antes del lanzamiento de Chrome.
Invocado por Sentinel via Brain para garantizar autoridad de escritura sobre nucleus.
"""

import typer
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory


class SynapseHostInitCommand(BaseCommand):
    """
    Inicializa el host Synapse para una sesión específica.

    Responsabilidad: ejecutar bloom-host.exe --init con la autoridad del proceso
    Brain (servicio), resolviendo el problema de permisos cuando Sentinel
    (no-servicio) intentaba spawnearlo directamente sin autoridad sobre nucleus.
    """

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="host-init",
            category=CommandCategory.SYNAPSE,
            version="1.0.0",
            description="Inicializa estructura de logs del host para una sesión Synapse",
            examples=[
                "brain synapse host-init --profile-id <UUID> --launch-id <LAUNCH_ID>",
                "brain synapse host-init --profile-id 99bbdaf0-fc8f-4e6f-8284-216482f2675a --launch-id 001_99bbdaf0_161909 --json",
            ],
        )

    def register(self, app: typer.Typer) -> None:
        """Registra el comando host-init en la categoría synapse."""

        @app.command(name="host-init")
        def host_init(
            ctx: typer.Context,
            profile_id: str = typer.Option(
                ...,
                "--profile-id",
                "-p",
                help="UUID del perfil Chrome a inicializar",
            ),
            launch_id: str = typer.Option(
                ...,
                "--launch-id",
                "-l",
                help="Launch ID de la sesión (ej: 001_99bbdaf0_161909)",
            ),
            bloom_root: str = typer.Option(
                None,
                "--bloom-root",
                help="Ruta raíz de BloomNucleus (requerido cuando Brain corre como servicio SYSTEM)",
            ),
        ):
            """
            Inicializa la estructura de logs del host Synapse para una sesión.

            Ejecuta bloom-host.exe --init con autoridad de Brain (servicio),
            garantizando que nucleus pueda registrar telemetry correctamente.
            Debe llamarse antes de lanzar Chrome.
            """
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            try:
                from brain.core.synapse.synapse_host_init_manager import SynapseHostInitManager

                if gc.verbose:
                    typer.echo(
                        f"🔍 Inicializando host para profile={profile_id} launch={launch_id}...",
                        err=True,
                    )

                manager = SynapseHostInitManager()
                data = manager.init_host(profile_id=profile_id, launch_id=launch_id, bloom_root=bloom_root)

                result = {
                    "status": "success",
                    "operation": "host_init",
                    "data": data,
                }

                gc.output(result, self._render_success)

            except Exception as e:
                self._handle_error(gc, str(e))

    def _render_success(self, data: dict):
        """Output humano para éxito."""
        inner = data.get("data", {})
        typer.echo(
            f"✅ Host inicializado — profile={inner.get('profile_id')} "
            f"launch={inner.get('launch_id')}"
        )
        log_dir = inner.get("log_directory", "")
        if log_dir:
            typer.echo(f"   📁 Logs: {log_dir}")
        host_log  = inner.get("host_log")
        ext_log   = inner.get("extension_log")
        boot_log  = inner.get("boot_log")
        diag_log  = inner.get("diag_log")
        if host_log:
            typer.echo(f"   📄 host_log:      {host_log}")
        if ext_log:
            typer.echo(f"   📄 extension_log: {ext_log}")
        if boot_log:
            typer.echo(f"   📄 boot_log:      {boot_log}")
        if diag_log:
            typer.echo(f"   📄 diag_log:      {diag_log}")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)