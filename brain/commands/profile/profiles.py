"""
Comandos para gestión de perfiles de Chrome (Workers).
Organiza los comandos de creación, listado, lanzamiento y destrucción de perfiles.
Versión refactorizada con soporte para spec-driven launch.
"""

import typer
import json
from pathlib import Path
from typing import Optional
from brain.cli.base import BaseCommand, CommandMetadata
from brain.cli.categories import CommandCategory
from brain.shared.logger import get_logger

# Logger para este módulo
logger = get_logger(__name__)


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
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                # 1. Importar el manager
                from brain.core.profile.profile_manager import ProfileManager
                
                # 2. Llamar a la lógica (el método que acabamos de limpiar)
                pm = ProfileManager()
                data = pm.list_profiles() 
                
                # 3. Preparar el resultado para la salida
                result = {
                    "status": "success",
                    "operation": "list",
                    "data": {"profiles": data, "count": len(data)}
                }
                
                # 4. Imprimir (Humano o JSON)
                gc.output(result, self._render_list)
                
            except Exception as e:
                self._handle_error(gc, f"Error al listar perfiles: {e}")

    def _render_list(self, data: dict) -> None:
        """Renderiza la lista de perfiles en formato humano."""
        # Extraemos el contenido de 'data' que es lo que envió el comando
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
            alias = p.get('alias', 'N/A')[:18]
            account = p.get('linked_account') or '-'
            created = p.get('created_at', 'N/A')[:10]
            typer.echo(f"{status:<8} {profile_id} {alias:<20} {account:<30} {created}")
        
        typer.echo()

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
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
            version="1.0.0",
            description="Crea un nuevo perfil de Chrome aislado",
            examples=[
                "brain profile create 'ChatGPT Work'",
                "brain profile create 'Claude Personal' --json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="create")
        def create_profile(
            ctx: typer.Context,
            alias: str = typer.Argument(..., help="Nombre descriptivo del perfil")
        ):
            """Crea un nuevo perfil con el alias especificado."""
            logger.info(f"🔨 Iniciando comando profile create con alias: '{alias}'")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"Modo JSON: {gc.json_mode}, Verbose: {gc.verbose}")
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                if gc.verbose:
                    typer.echo(f"🔨 Creando perfil '{alias}'...", err=True)
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                logger.info(f"Creando perfil con alias '{alias}'...")
                profile_data = pm.create_profile(alias)
                logger.info(f"✅ Perfil creado: ID={profile_data.get('id', 'N/A')[:8]}...")
                logger.debug(f"Datos del perfil: {profile_data}")
                
                result = {
                    "status": "success",
                    "operation": "create",
                    "data": profile_data
                }
                
                gc.output(result, self._render_create)
                logger.info("✅ Comando profile create completado exitosamente")
                
            except Exception as e:
                logger.error(f"❌ Error al crear perfil '{alias}': {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al crear perfil: {str(e)}")

    def _render_create(self, data: dict) -> None:
        """Renderiza la confirmación de creación."""
        profile = data.get('data', {})
        typer.echo(f"\n✅ Perfil creado exitosamente")
        typer.echo(f"   ID:    {profile.get('id', 'N/A')}")
        typer.echo(f"   Alias: {profile.get('alias', 'N/A')}")
        typer.echo(f"   Ruta:  {profile.get('path', 'N/A')}")
        
        profile_id = profile.get('id')
        launch_id = (profile_id[:8] + '...') if isinstance(profile_id, str) and profile_id else 'N/A'
        typer.echo(f"\n💡 Lanza con: brain profile launch {launch_id}\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class ProfilesLaunchCommand(BaseCommand):
    """Lanza Chrome con un perfil específico."""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="launch",
            category=CommandCategory.PROFILE,
            version="2.0.0",
            description="Lanza Chrome con un perfil de Worker (soporta spec-driven mode)",
            examples=[
                "brain profile launch <id>",
                "brain profile launch <id> --discovery",
                "brain profile launch <id> --cockpit",
                "brain profile launch <id> --spec /path/to/spec.json"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="launch")
        def launch_profile(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="ID del perfil a lanzar"),
            url: Optional[str] = typer.Option(None, "--url", help="URL inicial explícita"),
            cockpit: bool = typer.Option(False, "--cockpit", help="Modo cockpit (landing page)"),
            discovery: bool = typer.Option(False, "--discovery", help="Modo de validación de conexión"),
            spec: Optional[str] = typer.Option(None, "--spec", "-s", help="Archivo JSON con especificación completa de lanzamiento")
        ):
            """
            Lanza Chrome con el perfil especificado.
            
            Soporta dos modos:
            1. LEGACY: Usa estrategias predefinidas (--discovery, --cockpit, --url)
            2. SPEC-DRIVEN: Usa un archivo JSON con configuración completa (--spec)
            
            El modo SPEC-DRIVEN tiene prioridad sobre cualquier otro parámetro.
            """
            logger.info(f"🚀 Iniciando comando profile launch")
            logger.debug(f"Profile ID: {profile_id[:8]}..., Spec: {spec}")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                # MODO SPEC-DRIVEN (prioridad máxima)
                if spec:
                    logger.info("📋 Modo SPEC-DRIVEN activado")
                    
                    # Validar que el archivo existe
                    spec_path = Path(spec)
                    if not spec_path.exists():
                        raise FileNotFoundError(f"Archivo spec no encontrado: {spec}")
                    
                    # Cargar y validar JSON
                    try:
                        with open(spec_path, 'r', encoding='utf-8') as f:
                            spec_data = json.load(f)
                        logger.debug(f"Spec cargado exitosamente: {spec_path}")
                    except json.JSONDecodeError as e:
                        raise ValueError(f"JSON inválido en spec: {e}")
                    
                    if gc.verbose:
                        typer.echo(f"📋 Lanzando con spec: {spec_path}", err=True)
                    
                    # Lanzar con spec
                    logger.info(f"Lanzando perfil {profile_id[:8]} con spec...")
                    result_data = pm.launch_profile(
                        profile_id=profile_id,
                        spec_data=spec_data
                    )
                    
                else:
                    # MODO LEGACY (estrategias predefinidas)
                    logger.info("🔧 Modo LEGACY activado")
                    
                    # Determinar modo y construir URL correspondiente
                    if discovery:
                        mode_label = "🔍 Discovery Check"
                        target_url = pm.get_discovery_url(profile_id)
                    elif cockpit:
                        mode_label = "🏠 Cockpit"
                        target_url = pm.get_landing_url(profile_id)
                    elif url:
                        mode_label = "Custom URL"
                        target_url = url
                    else:
                        # Default: cockpit (landing)
                        mode_label = "🏠 Cockpit"
                        target_url = pm.get_landing_url(profile_id)

                    if gc.verbose:
                        typer.echo(f"🚀 Lanzando perfil en modo: {mode_label}", err=True)

                    logger.info(f"Lanzando perfil {profile_id[:8]} en modo legacy...")
                    logger.debug(f"Target URL: {target_url}")
                    
                    result_data = pm.launch_profile(
                        profile_id=profile_id,
                        url=target_url
                    )
                
                logger.info(f"✅ Perfil lanzado exitosamente")
                logger.debug(f"Resultado: {result_data}")
                
                result = {
                    "status": "success",
                    "operation": "launch",
                    "data": result_data
                }
                
                gc.output(result, self._render_launch)
                logger.info("✅ Comando profile launch completado exitosamente")
                
            except FileNotFoundError as e:
                logger.error(f"❌ Archivo no encontrado: {str(e)}", exc_info=True)
                self._handle_error(gc, str(e))
            except ValueError as e:
                logger.error(f"❌ Error de validación: {str(e)}", exc_info=True)
                self._handle_error(gc, str(e))
            except Exception as e:
                logger.error(f"❌ Error al lanzar perfil {profile_id[:8]}...: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al lanzar perfil: {str(e)}")

    def _render_launch(self, data: dict) -> None:
        """Renderiza la confirmación de lanzamiento."""
        launch_data = data.get('data', {}).get('data', {})
        profile_id = launch_data.get('profile_id', 'N/A')
        
        typer.echo(f"\n✅ Perfil lanzado exitosamente")
        typer.echo(f"   ID:     {profile_id}")
        typer.echo(f"   Estado: {launch_data.get('engine', 'unknown')}\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
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
            logger.info(f"🗑️ Iniciando comando profile destroy")
            logger.debug(f"Profile ID: {profile_id[:8]}...")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"Modo JSON: {gc.json_mode}, Verbose: {gc.verbose}")
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                if gc.verbose:
                    typer.echo(f"🗑️ Eliminando perfil {profile_id[:8]}...", err=True)
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                logger.info(f"Eliminando perfil {profile_id[:8]}...")
                destroy_data = pm.destroy_profile(profile_id)
                logger.info(f"✅ Perfil eliminado exitosamente")
                logger.debug(f"Datos de eliminación: {destroy_data}")
                
                result = {
                    "status": "success",
                    "operation": "destroy",
                    "data": destroy_data
                }
                
                gc.output(result, self._render_destroy)
                logger.info("✅ Comando profile destroy completado exitosamente")
                
            except Exception as e:
                logger.error(f"❌ Error al eliminar perfil {profile_id[:8]}...: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al eliminar perfil: {str(e)}")

    def _render_destroy(self, data: dict) -> None:
        """Renderiza la confirmación de eliminación."""
        profile_id = data.get('data', {}).get('profile_id', 'N/A')
        typer.echo(f"\n🗑️ Perfil eliminado exitosamente")
        typer.echo(f"   ID: {profile_id}\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
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
            logger.info(f"🔗 Iniciando comando profile link")
            logger.debug(f"Profile ID: {profile_id[:8]}..., Email: {email}")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"Modo JSON: {gc.json_mode}, Verbose: {gc.verbose}")
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                if gc.verbose:
                    typer.echo(f"🔗 Vinculando {email} a {profile_id}...", err=True)
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                logger.info(f"Vinculando {email} al perfil {profile_id[:8]}...")
                link_data = pm.link_account(profile_id, email)
                logger.info(f"✅ Cuenta vinculada exitosamente")
                logger.debug(f"Datos de vinculación: {link_data}")
                
                result = {
                    "status": "success",
                    "operation": "link",
                    "data": link_data
                }
                
                gc.output(result, self._render_link)
                logger.info("✅ Comando profile link completado exitosamente")
                
            except Exception as e:
                logger.error(f"❌ Error al vincular cuenta al perfil {profile_id[:8]}...: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al vincular cuenta: {str(e)}")

    def _render_link(self, data: dict) -> None:
        """Renderiza la confirmación de vinculación."""
        typer.echo(f"\n🔗 Cuenta vinculada exitosamente")
        typer.echo(f"   Email: {data.get('email')}\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
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
            logger.info(f"🔓 Iniciando comando profile unlink")
            logger.debug(f"Profile ID: {profile_id[:8]}...")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"Modo JSON: {gc.json_mode}, Verbose: {gc.verbose}")
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                if gc.verbose:
                    typer.echo(f"🔓 Desvinculando cuenta de {profile_id}...", err=True)
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                logger.info(f"Desvinculando cuenta del perfil {profile_id[:8]}...")
                unlink_data = pm.unlink_account(profile_id)
                logger.info(f"✅ Cuenta desvinculada exitosamente")
                logger.debug(f"Datos de desvinculación: {unlink_data}")
                
                result = {
                    "status": "success",
                    "operation": "unlink",
                    "data": unlink_data
                }
                
                gc.output(result, self._render_unlink)
                logger.info("✅ Comando profile unlink completado exitosamente")
                
            except Exception as e:
                logger.error(f"❌ Error al desvincular cuenta del perfil {profile_id[:8]}...: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al desvincular cuenta: {str(e)}")

    def _render_unlink(self, data: dict) -> None:
        """Renderiza la confirmación de desvinculación."""
        typer.echo(f"\n🔓 Cuenta desvinculada exitosamente")
        typer.echo(f"   Perfil: {data.get('profile_id')[:8]}...\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
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
            logger.info(f"🔗 Iniciando comando profile accounts-register")
            logger.debug(f"Profile ID: {profile_id[:8]}..., Provider: {provider}, Email: {email}")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"Modo JSON: {gc.json_mode}, Verbose: {gc.verbose}")
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                if gc.verbose:
                    typer.echo(f"🔗 Registrando {provider} ({email}) en {profile_id}...", err=True)
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                logger.info(f"Registrando cuenta {provider}/{email} en perfil {profile_id[:8]}...")
                result_data = pm.register_account(profile_id, provider, email)
                logger.info(f"✅ Cuenta registrada exitosamente")
                logger.debug(f"Datos de registro: {result_data}")
                
                result = {
                    "status": "success",
                    "operation": "accounts-register",
                    "data": result_data
                }
                
                gc.output(result, self._render_register)
                logger.info("✅ Comando profile accounts-register completado exitosamente")
                
            except Exception as e:
                logger.error(f"❌ Error al registrar cuenta {provider}/{email} en perfil {profile_id[:8]}...: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al registrar cuenta: {str(e)}")

    def _render_register(self, data: dict) -> None:
        """Renderiza la confirmación de registro."""
        typer.echo(f"\n🔗 Cuenta registrada exitosamente")
        typer.echo(f"   Perfil:   {data.get('profile_alias')} ({data.get('profile_id')[:8]}...)")
        typer.echo(f"   Provider: {data.get('provider')}")
        typer.echo(f"   Cuenta:   {data.get('identifier')}\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
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
            logger.info(f"🔓 Iniciando comando profile accounts-remove")
            logger.debug(f"Profile ID: {profile_id[:8]}..., Provider: {provider}")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"Modo JSON: {gc.json_mode}, Verbose: {gc.verbose}")
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                if gc.verbose:
                    typer.echo(f"🔓 Removiendo {provider} de {profile_id}...", err=True)
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                logger.info(f"Removiendo cuenta {provider} del perfil {profile_id[:8]}...")
                result_data = pm.remove_account(profile_id, provider)
                logger.info(f"✅ Cuenta removida exitosamente, {len(result_data.get('remaining_accounts', []))} cuentas restantes")
                logger.debug(f"Datos de remoción: {result_data}")
                
                result = {
                    "status": "success",
                    "operation": "accounts-remove",
                    "data": result_data
                }
                
                gc.output(result, self._render_remove)
                logger.info("✅ Comando profile accounts-remove completado exitosamente")
                
            except Exception as e:
                logger.error(f"❌ Error al remover cuenta {provider} del perfil {profile_id[:8]}...: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al remover cuenta: {str(e)}")

    def _render_remove(self, data: dict) -> None:
        """Renderiza la confirmación de remoción."""
        typer.echo(f"\n🔓 Cuenta removida exitosamente")
        typer.echo(f"   Perfil:   {data.get('profile_id')[:8]}...")
        typer.echo(f"   Provider: {data.get('provider')}")
        typer.echo(f"   Cuentas restantes: {len(data.get('remaining_accounts', []))}\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)