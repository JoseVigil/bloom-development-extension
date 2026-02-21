"""
Comando para consultar el historial de lanzamientos de un perfil de Chrome.
Lee archivos YYYYMMDD.ndjson del directorio de historial y reconstruye el estado
final de cada lanzamiento agrupando eventos por launch_id.

Uso:
    brain profile launches <profile_id>
    brain profile launches <profile_id> --date 20240115
    brain profile launches <profile_id> --json
"""

import typer
import json
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory
from brain.shared.logger import get_logger

logger = get_logger("brain.profile.launches.cli")


class ProfileLaunchesCommand(BaseCommand):
    """Lista el historial de lanzamientos de un perfil de Chrome Worker."""

    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="launches",
            category=CommandCategory.PROFILE,
            version="1.0.0",
            description="Muestra el historial de lanzamientos de un perfil",
            examples=[
                "brain profile launches <profile_id>",
                "brain profile launches <profile_id> --date 20240115",
                "brain profile launches <profile_id> --json",
                "brain profile launches <profile_id> --date 20240115 --json",
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="launches")
        def launches(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="ID del perfil"),
            date: Optional[str] = typer.Option(
                None,
                "--date",
                "-d",
                help="Filtrar por fecha en formato YYYYMMDD (ej: 20240115). Si no se especifica, muestra todos los días."
            ),
        ):
            """Muestra el historial de lanzamientos de un perfil de Chrome."""
            logger.info(f"🚀 Comando: profile launches - ID: {profile_id[:8]}, Fecha: {date or 'todas'}")

            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()

            logger.debug(f"  → Modo JSON: {gc.json_mode}")
            logger.debug(f"  → Verbose: {gc.verbose}")

            try:
                from brain.core.profile.launch_history_reader import LaunchHistoryReader

                if gc.verbose:
                    date_info = f" para el día {date}" if date else " (todos los días)"
                    typer.echo(f"🔍 Leyendo historial de lanzamientos del perfil {profile_id[:8]}...{date_info}", err=True)

                logger.debug("Inicializando LaunchHistoryReader...")
                reader = LaunchHistoryReader()

                logger.info(f"Leyendo historial del perfil {profile_id[:8]}...")
                history_data = reader.get_launches(profile_id, date=date)
                logger.info(f"✅ Historial obtenido: {history_data['total']} lanzamientos")

                result = {
                    "status": "success",
                    "operation": "launches",
                    "data": history_data
                }

                gc.output(result, self._render_launches)
                logger.info("✅ Comando profile launches completado")

            except FileNotFoundError as e:
                logger.warning(f"⚠️ Directorio de historial no encontrado: {e}")
                self._handle_error(gc, f"No se encontró historial para el perfil '{profile_id}': {e}")
            except ValueError as e:
                logger.warning(f"⚠️ Argumento inválido: {e}")
                self._handle_error(gc, str(e))
            except Exception as e:
                logger.error(f"❌ Error al leer historial de lanzamientos: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al leer historial: {e}")

    def _render_launches(self, data: dict) -> None:
        """Renderiza el historial de lanzamientos en formato humano."""
        payload = data.get("data", {})
        launches = payload.get("launches", [])
        total = payload.get("total", 0)
        profile_id = payload.get("profile_id", "N/A")
        date_filter = payload.get("date_filter", None)
        files_read = payload.get("files_read", [])

        date_info = f" — Día: {date_filter}" if date_filter else f" — {len(files_read)} archivo(s)"
        typer.echo(f"\n🚀 Historial de lanzamientos — Perfil: {profile_id[:8]}...{date_info}")
        typer.echo(f"   Total: {total} lanzamiento(s)\n")

        if not launches:
            typer.echo("   📭 Sin lanzamientos registrados para este filtro.")
            typer.echo("   💡 Prueba sin --date para ver todos los días.\n")
            return

        # Cabecera de tabla
        typer.echo(
            f"  {'Launch ID':<36}  {'Fecha/Hora':<20}  {'Modo':<12}  "
            f"{'PID':<8}  {'Resultado':<12}  {'Duración'}"
        )
        typer.echo("  " + "-" * 115)

        for launch in launches:
            launch_id = launch.get("launch_id", "N/A")
            ts = launch.get("ts", "N/A")[:19].replace("T", " ")  # ISO → legible
            mode = launch.get("mode", "-") or "-"
            pid = str(launch.get("chrome_pid", "-") or "-")
            result_val = launch.get("result", "-") or "-"
            duration = launch.get("duration_seconds")
            duration_str = f"{duration:.1f}s" if duration is not None else "-"

            # Indicador visual del resultado
            result_icon = "✅" if result_val == "success" else ("❌" if result_val == "error" else "⏳")
            result_display = f"{result_icon} {result_val}"

            # Estado si aún no tiene cierre
            if launch.get("_status") == "open":
                result_display = "⏳ abierto"
                duration_str = "en curso"

            typer.echo(
                f"  {launch_id:<36}  {ts:<20}  {mode:<12}  "
                f"{pid:<8}  {result_display:<14}  {duration_str}"
            )

        typer.echo()

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)