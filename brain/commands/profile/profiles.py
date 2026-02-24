"""
Comandos para gestión de perfiles de Chrome (Workers).
Versión refactorizada con logger dedicado para perfiles.
Launch mode actualizado: Solo acepta --spec (v2.0+).

CHANGELOG v2.4:
- Error handling estructurado desde ProfileLauncher
- Manejo de LaunchError con códigos y data
- Clasificación de errores fatales vs recuperables
"""

import typer
import json
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory
from brain.shared.logger import get_logger
logger = get_logger("brain.profile.cli")

class ProfilesListCommand(BaseCommand):
    """Lista todos los perfiles de Workers existentes."""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="list",
            category=CommandCategory.PROFILE,
            version="1.0.0",
            description="Lista todos los perfiles de Chrome Workers",
            examples=[
                "brain profile list",
                "brain profile list --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="list")
        def list_profiles(ctx: typer.Context):
            """MOSTRAR AL USUARIO (CLI)."""
            logger.info("📋 Comando: profile list")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"  → Modo JSON: {gc.json_mode}")
            logger.debug(f"  → Verbose: {gc.verbose}")
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                logger.info("Obteniendo lista de perfiles...")
                data = pm.list_profiles() 
                logger.info(f"✅ Lista obtenida: {len(data)} perfiles")
                
                result = {
                    "status": "success",
                    "operation": "list",
                    "data": {"profiles": data, "count": len(data)}
                }
                
                gc.output(result, self._render_list)
                logger.info("✅ Comando profile list completado")
                
            except Exception as e:
                logger.error(f"❌ Error al listar perfiles: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al listar perfiles: {e}")

    def _render_list(self, data: dict) -> None:
        """Renderiza la lista de perfiles en formato humano."""
        payload = data.get("data", {})
        profiles = payload.get("profiles", [])
        count = payload.get("count", 0)
        
        logger.debug(f"Renderizando {len(profiles)} perfiles")
        
        if not profiles:
            typer.echo("\n📋 No hay perfiles creados")
            typer.echo("💡 Crea uno con: brain profile create <alias>\n")
            return
        
        typer.echo(f"\n📋 Perfiles de Workers ({count} total)\n")
        typer.echo(f"{'Estado':<8} {'ID':<38} {'Alias':<20} {'Cuenta':<30} {'Creado'}")
        typer.echo("-" * 130)
        
        for p in profiles:
            status = "✓ Activo" if p.get('exists') else "✗ Borrado"
            profile_id = p.get('id', 'N/A')
            
            # ✅ Agregar badge visual para perfiles master
            alias = p.get('alias', 'N/A')[:18]
            is_master = p.get('master_profile', False)
            if is_master:
                alias = f"👑 {alias}"  # Añadir corona para perfiles master
            
            account = p.get('linked_account') or '-'
            created = p.get('created_at', 'N/A')[:10]
            
            typer.echo(f"{status:<8} {profile_id} {alias:<20} {account:<30} {created}")
        
        typer.echo()

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class ProfilesCreateCommand(BaseCommand):
    """Crea un nuevo perfil de Chrome Worker."""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="create",
            category=CommandCategory.PROFILE,
            version="1.1.0",  # Version bump por nueva feature
            description="Crea un nuevo perfil de Chrome aislado",
            examples=[
                "brain profile create 'ChatGPT Work'",
                "brain profile create 'Claude Personal' --master",
                "brain profile create 'Main Profile' --master --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="create")
        def create_profile(
            ctx: typer.Context,
            alias: str = typer.Argument(..., help="Nombre descriptivo del perfil"),
            master: bool = typer.Option(False, "--master", help="Marcar como perfil master")
        ):
            """Crea un nuevo perfil con el alias especificado."""
            logger.info(f"🔨 Comando: profile create - Alias: '{alias}', Master: {master}")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"  → Modo JSON: {gc.json_mode}")
            logger.debug(f"  → Verbose: {gc.verbose}")
            logger.debug(f"  → Master flag: {master}")
            
            try:
                import socket as _socket
                import struct

                if gc.verbose and not gc.json_mode:
                    master_indicator = " (MASTER)" if master else ""
                    typer.echo(f"🔨 Creando perfil '{alias}'{master_indicator}...", err=True)

                logger.debug("Conectando al servidor Brain (127.0.0.1:5678)...")
                try:
                    sock = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
                    sock.settimeout(10)
                    sock.connect(("127.0.0.1", 5678))
                except (ConnectionRefusedError, OSError) as conn_err:
                    raise RuntimeError(
                        f"Brain server no está corriendo en 127.0.0.1:5678. "
                        f"Iniciá el servicio antes de crear perfiles. ({conn_err})"
                    )

                try:
                    payload = json.dumps({
                        "type": "PROFILE_CREATE",
                        "name": alias,
                        "master": master
                    }, ensure_ascii=False).encode("utf-8")
                    sock.sendall(struct.pack(">I", len(payload)) + payload)
                    logger.debug("→ PROFILE_CREATE enviado al servidor")

                    raw_len = sock.recv(4)
                    if len(raw_len) < 4:
                        raise RuntimeError("Respuesta inválida del servidor Brain")
                    msg_len = struct.unpack(">I", raw_len)[0]
                    raw_body = b""
                    while len(raw_body) < msg_len:
                        chunk = sock.recv(msg_len - len(raw_body))
                        if not chunk:
                            break
                        raw_body += chunk
                    ack = json.loads(raw_body.decode("utf-8"))
                finally:
                    sock.close()

                if ack.get("status") != "ok":
                    raise RuntimeError(ack.get("message", "Error desconocido en servidor"))

                profile = ack.get("profile", {})
                profile_data = {
                    "id": profile.get("id"),
                    "alias": profile.get("name"),
                    "path": profile.get("profile_dir"),
                    "master_profile": profile.get("master")
                }
                logger.info(f"✅ Perfil creado: ID={profile_data.get('id', 'N/A')[:8]}, Master={profile_data.get('master_profile', False)}")

                if gc.json_mode:
                    result = {
                        "uuid": profile_data.get('id'),
                        "master_profile": profile_data.get('master_profile', False),
                        "status": "success"
                    }
                    typer.echo(json.dumps(result, ensure_ascii=False))
                    logger.info("✅ Comando profile create completado (JSON)")
                else:
                    result = {
                        "status": "success",
                        "operation": "create",
                        "data": profile_data
                    }
                    gc.output(result, self._render_create)
                    logger.info("✅ Comando profile create completado")

            except Exception as e:
                logger.error(f"❌ Error al crear perfil '{alias}': {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al crear perfil: {str(e)}")

    def _render_create(self, data: dict) -> None:
        """Renderiza la confirmación de creación."""
        profile = data.get('data', {})
        is_master = profile.get('master_profile', False)
        master_badge = " 👑 MASTER" if is_master else ""
        
        typer.echo(f"\n✅ Perfil creado exitosamente{master_badge}")
        typer.echo(f"   ID:    {profile.get('id', 'N/A')}")
        typer.echo(f"   Alias: {profile.get('alias', 'N/A')}")
        typer.echo(f"   Ruta:  {profile.get('path', 'N/A')}")
        
        if is_master:
            typer.echo(f"   🔐 Tipo:  Perfil Master")
        
        profile_id = profile.get('id')
        launch_id = (profile_id[:8] + '...') if isinstance(profile_id, str) and profile_id else 'N/A'
        typer.echo(f"\n💡 Lanza con: brain profile launch {launch_id} --spec <spec.json>\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class ProfilesLaunchCommand(BaseCommand):
    """Lanza Chrome con un perfil específico (solo spec-driven mode)."""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="launch",
            category=CommandCategory.PROFILE,
            version="2.4.0",  # Version bump por error handling
            description="Lanza Chrome con un perfil de Worker usando spec-driven mode",
            examples=[
                "brain profile launch <id> --spec /path/to/spec.json --mode discovery",
                "brain profile launch abc12345 --spec ignition_spec.json --mode landing",
                "brain profile launch abc12345 --spec spec.json -m discovery --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="launch")
        def launch_profile(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="ID del perfil a lanzar"),
            spec: str = typer.Option(..., "--spec", "-s", help="Archivo JSON con especificación completa de lanzamiento (REQUERIDO)"),
            mode: str = typer.Option("discovery", "--mode", "-m", help="Modo de página: 'discovery' (onboarding) o 'landing' (dashboard)")
        ):
            """Lanza Chrome con el perfil especificado usando spec-driven mode."""
            logger.info(f"🚀 Comando: profile launch - ID: {profile_id[:8]}, Mode: {mode}")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"  → Modo JSON: {gc.json_mode}")
            logger.debug(f"  → Verbose: {gc.verbose}")
            logger.debug(f"  → Spec: {spec}")
            logger.debug(f"  → Mode: {mode}")
            
            # Validación de mode
            valid_modes = ['discovery', 'landing']
            if mode not in valid_modes:
                logger.error(f"❌ Modo inválido: {mode}")
                error_msg = (
                    f"⚙️ Modo '{mode}' no es válido\n\n"
                    "Modos disponibles:\n"
                    "  • discovery - Página de onboarding y validación inicial\n"
                    "  • landing   - Dashboard del perfil (panel de control)\n\n"
                    "Ejemplo:\n"
                    "  brain profile launch abc12345 --spec spec.json --mode discovery\n"
                )
                self._handle_error(gc, error_msg)
            
            # Validación temprana del spec
            if not spec:
                logger.error("❌ Flag --spec es obligatorio")
                error_msg = (
                    "⚙️ Launch requiere el flag --spec (spec-driven mode)\n\n"
                    "Convention mode deprecated desde v2.0\n\n"
                    "Uso correcto:\n"
                    f"  brain profile launch <id> --spec /path/to/spec.json --mode {mode}\n\n"
                    "Ejemplo:\n"
                    "  brain profile launch abc12345 --spec ignition_spec.json --mode discovery\n"
                )
                self._handle_error(gc, error_msg)
            
            spec_path = Path(spec)
            if not spec_path.exists():
                logger.error(f"❌ Archivo spec no encontrado: {spec}")
                self._handle_error(gc, f"Archivo spec no encontrado: {spec}")
            
            try:
                # Cargar spec JSON
                with open(spec_path, 'r', encoding='utf-8') as f:
                    spec_data = json.load(f)
                logger.debug("✓ Spec cargado exitosamente")
                
                # 🆕 INYECTAR MODE EN EL SPEC
                # Si no existe page_config, crear estructura vacía
                if 'page_config' not in spec_data:
                    spec_data['page_config'] = {}
                
                # Sobrescribir type con el mode del CLI
                spec_data['page_config']['type'] = mode
                spec_data['page_config']['auto_generate_url'] = True
                
                logger.info(f"✓ Mode '{mode}' inyectado en page_config")
                logger.debug(f"  → page_config: {spec_data['page_config']}")
                
            except json.JSONDecodeError as e:
                logger.error(f"❌ JSON inválido en spec: {e}")
                self._handle_error(gc, f"JSON inválido en spec: {e}")
            except Exception as e:
                logger.error(f"❌ Error al leer spec: {e}")
                self._handle_error(gc, f"Error al leer spec: {e}")
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                from brain.core.profile.profile_launcher import LaunchError
                
                if gc.verbose:
                    mode_desc = "ONBOARDING" if mode == "discovery" else "DASHBOARD"
                    typer.echo(f"📋 Lanzando con spec: {spec_path}", err=True)
                    typer.echo(f"📄 Página: {mode} ({mode_desc})", err=True)
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                logger.info(f"Lanzando perfil {profile_id[:8]} con spec (mode: {mode})...")
                result_data = pm.launch_profile(
                    profile_id=profile_id,
                    spec_data=spec_data
                )
                
                logger.info(f"✅ Perfil lanzado exitosamente en modo {mode}")
                
                result = {
                    "status": "success",
                    "operation": "launch",
                    "data": result_data,
                    "mode": mode
                }
                
                gc.output(result, self._render_launch)
                logger.info("✅ Comando profile launch completado")
                
            except LaunchError as e:
                # ✅ Error estructurado desde ProfileLauncher
                logger.error(f"❌ Launch error [{e.code}]: {e}", exc_info=False)
                
                error_result = {
                    "status": "error",
                    "message": str(e),
                    "code": e.code,
                    "data": e.data
                }
                
                if gc.json_mode:
                    typer.echo(json.dumps(error_result))
                else:
                    typer.echo(f"❌ {e}", err=True)
                    if gc.verbose and e.data:
                        typer.echo(f"   Details: {json.dumps(e.data, indent=2)}", err=True)
                
                raise typer.Exit(code=1)
                
            except FileNotFoundError as e:
                logger.error(f"❌ Archivo no encontrado: {str(e)}")
                self._handle_error(gc, str(e))
            except ValueError as e:
                logger.error(f"❌ Error de validación: {str(e)}")
                self._handle_error(gc, str(e))
            except Exception as e:
                logger.error(f"❌ Error inesperado: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Unexpected error: {str(e)}")

    def _render_launch(self, data: dict) -> None:
        """Renderiza la confirmación de lanzamiento."""
        launch_data = data.get('data', {}).get('data', {})
        profile_id = launch_data.get('profile_id', 'N/A')
        mode = data.get('mode', 'unknown')
        
        mode_emoji = "🔎" if mode == "discovery" else "🏠"
        mode_desc = "ONBOARDING" if mode == "discovery" else "DASHBOARD"
        
        typer.echo(f"\n✅ Perfil lanzado exitosamente")
        typer.echo(f"   ID:     {profile_id}")
        typer.echo(f"   Página: {mode_emoji} {mode} ({mode_desc})")
        typer.echo(f"   Estado: {launch_data.get('engine', 'unknown')}\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class ProfilesDestroyCommand(BaseCommand):
    """Elimina un perfil de Chrome Worker."""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="destroy",
            category=CommandCategory.PROFILE,
            version="1.0.0",
            description="Elimina completamente un perfil de Worker",
            examples=[
                "brain profile destroy <id>",
                "brain profile destroy <id> --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="destroy")
        def destroy_profile(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="ID del perfil a eliminar")
        ):
            """Elimina un perfil y todos sus datos."""
            logger.info(f"🗑️ Comando: profile destroy - ID: {profile_id[:8]}")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"  → Modo JSON: {gc.json_mode}")
            logger.debug(f"  → Verbose: {gc.verbose}")
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                if gc.verbose:
                    typer.echo(f"🗑️ Eliminando perfil {profile_id[:8]}...", err=True)
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                logger.info(f"Eliminando perfil {profile_id[:8]}...")
                destroy_data = pm.destroy_profile(profile_id)
                logger.info(f"✅ Perfil eliminado exitosamente")
                
                result = {
                    "status": "success",
                    "operation": "destroy",
                    "data": destroy_data
                }
                
                gc.output(result, self._render_destroy)
                logger.info("✅ Comando profile destroy completado")
                
            except Exception as e:
                logger.error(f"❌ Error al eliminar perfil: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al eliminar perfil: {str(e)}")

    def _render_destroy(self, data: dict) -> None:
        """Renderiza la confirmación de eliminación."""
        profile_id = data.get('data', {}).get('profile_id', 'N/A')
        typer.echo(f"\n🗑️ Perfil eliminado exitosamente")
        typer.echo(f"   ID: {profile_id}\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class ProfilesLinkCommand(BaseCommand):
    """Vincula una cuenta a un perfil de Chrome."""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="link",
            category=CommandCategory.PROFILE,
            version="1.0.0",
            description="Vincula una cuenta de email a un perfil",
            examples=[
                "brain profile link <profile-id> user@example.com",
                "brain profile link <profile-id> admin@company.com --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="link")
        def link_account(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="ID del perfil"),
            email: str = typer.Argument(..., help="Email a vincular")
        ):
            """Vincula un email a un perfil."""
            logger.info(f"🔗 Comando: profile link - ID: {profile_id[:8]}, Email: {email}")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"  → Modo JSON: {gc.json_mode}")
            logger.debug(f"  → Verbose: {gc.verbose}")
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                if gc.verbose:
                    typer.echo(f"🔗 Vinculando {email} a {profile_id}...", err=True)
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                logger.info(f"Vinculando {email} al perfil {profile_id[:8]}...")
                link_data = pm.link_account(profile_id, email)
                logger.info(f"✅ Cuenta vinculada exitosamente")
                
                result = {
                    "status": "success",
                    "operation": "link",
                    "data": link_data
                }
                
                gc.output(result, self._render_link)
                logger.info("✅ Comando profile link completado")
                
            except Exception as e:
                logger.error(f"❌ Error al vincular cuenta: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al vincular cuenta: {str(e)}")

    def _render_link(self, data: dict) -> None:
        """Renderiza la confirmación de vinculación."""
        typer.echo(f"\n🔗 Cuenta vinculada exitosamente")
        typer.echo(f"   Email: {data.get('email')}\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class ProfilesUnlinkCommand(BaseCommand):
    """Desvincula la cuenta de un perfil de Chrome."""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="unlink",
            category=CommandCategory.PROFILE,
            version="1.0.0",
            description="Desvincula la cuenta de email de un perfil",
            examples=[
                "brain profile unlink <profile-id>",
                "brain profile unlink <profile-id> --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="unlink")
        def unlink_account(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="ID del perfil")
        ):
            """Desvincula la cuenta de un perfil."""
            logger.info(f"🔓 Comando: profile unlink - ID: {profile_id[:8]}")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"  → Modo JSON: {gc.json_mode}")
            logger.debug(f"  → Verbose: {gc.verbose}")
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                if gc.verbose:
                    typer.echo(f"🔓 Desvinculando cuenta de {profile_id}...", err=True)
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                logger.info(f"Desvinculando cuenta del perfil {profile_id[:8]}...")
                unlink_data = pm.unlink_account(profile_id)
                logger.info(f"✅ Cuenta desvinculada exitosamente")
                
                result = {
                    "status": "success",
                    "operation": "unlink",
                    "data": unlink_data
                }
                
                gc.output(result, self._render_unlink)
                logger.info("✅ Comando profile unlink completado")
                
            except Exception as e:
                logger.error(f"❌ Error al desvincular cuenta: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al desvincular cuenta: {str(e)}")

    def _render_unlink(self, data: dict) -> None:
        """Renderiza la confirmación de desvinculación."""
        typer.echo(f"\n🔓 Cuenta desvinculada exitosamente")
        typer.echo(f"   Perfil: {data.get('profile_id')[:8]}...\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class ProfilesAccountsRegisterCommand(BaseCommand):
    """Registra una nueva cuenta en un perfil de Chrome."""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="accounts-register",
            category=CommandCategory.PROFILE,
            version="1.0.0",
            description="Registra una cuenta (Google, OpenAI, etc) en un perfil",
            examples=[
                "brain profile accounts-register <profile-id> google user@gmail.com",
                "brain profile accounts-register <profile-id> openai user@example.com",
                "brain profile accounts-register <profile-id> anthropic user@company.com"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="accounts-register")
        def register_account(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="ID del perfil"),
            provider: str = typer.Argument(..., help="Proveedor (google, openai, anthropic, etc)"),
            email: str = typer.Argument(..., help="Email o identificador de la cuenta")
        ):
            """Registra una nueva cuenta en un perfil."""
            logger.info(f"📝 Comando: profile accounts-register - ID: {profile_id[:8]}, Provider: {provider}, Email: {email}")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"  → Modo JSON: {gc.json_mode}")
            logger.debug(f"  → Verbose: {gc.verbose}")
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                if gc.verbose:
                    typer.echo(f"📝 Registrando {provider} ({email}) en {profile_id}...", err=True)
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                logger.info(f"Registrando cuenta {provider}/{email} en perfil {profile_id[:8]}...")
                result_data = pm.register_account(profile_id, provider, email)
                logger.info(f"✅ Cuenta registrada exitosamente")
                
                result = {
                    "status": "success",
                    "operation": "accounts-register",
                    "data": result_data
                }
                
                gc.output(result, self._render_register)
                logger.info("✅ Comando profile accounts-register completado")
                
            except Exception as e:
                logger.error(f"❌ Error al registrar cuenta: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al registrar cuenta: {str(e)}")

    def _render_register(self, data: dict) -> None:
        """Renderiza la confirmación de registro."""
        typer.echo(f"\n📝 Cuenta registrada exitosamente")
        typer.echo(f"   Perfil:   {data.get('profile_alias')} ({data.get('profile_id')[:8]}...)")
        typer.echo(f"   Provider: {data.get('provider')}")
        typer.echo(f"   Cuenta:   {data.get('identifier')}\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class ProfilesAccountsRemoveCommand(BaseCommand):
    """Remueve una cuenta de un perfil de Chrome."""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="accounts-remove",
            category=CommandCategory.PROFILE,
            version="1.0.0",
            description="Remueve una cuenta registrada de un perfil",
            examples=[
                "brain profile accounts-remove <profile-id> google",
                "brain profile accounts-remove <profile-id> openai"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="accounts-remove")
        def remove_account(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="ID del perfil"),
            provider: str = typer.Argument(..., help="Proveedor a remover")
        ):
            """Remueve una cuenta registrada de un perfil."""
            logger.info(f"🗑️ Comando: profile accounts-remove - ID: {profile_id[:8]}, Provider: {provider}")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"  → Modo JSON: {gc.json_mode}")
            logger.debug(f"  → Verbose: {gc.verbose}")
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                if gc.verbose:
                    typer.echo(f"🗑️ Removiendo {provider} de {profile_id}...", err=True)
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                logger.info(f"Removiendo cuenta {provider} del perfil {profile_id[:8]}...")
                result_data = pm.remove_account(profile_id, provider)
                logger.info(f"✅ Cuenta removida exitosamente, {len(result_data.get('remaining_accounts', []))} cuentas restantes")
                
                result = {
                    "status": "success",
                    "operation": "accounts-remove",
                    "data": result_data
                }
                
                gc.output(result, self._render_remove)
                logger.info("✅ Comando profile accounts-remove completado")
                
            except Exception as e:
                logger.error(f"❌ Error al remover cuenta: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al remover cuenta: {str(e)}")

    def _render_remove(self, data: dict) -> None:
        """Renderiza la confirmación de remoción."""
        typer.echo(f"\n🗑️ Cuenta removida exitosamente")
        typer.echo(f"   Perfil:   {data.get('profile_id')[:8]}...")
        typer.echo(f"   Provider: {data.get('provider')}")
        typer.echo(f"   Cuentas restantes: {len(data.get('remaining_accounts', []))}\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)