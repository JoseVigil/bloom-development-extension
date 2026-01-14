"""
Comandos para gestión de perfiles de Chrome (Workers).
Organiza los comandos de creación, listado, lanzamiento y destrucción de perfiles.
"""

import typer
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
            version="1.1.0",
            description="Lanza Chrome con un perfil de Worker",
            examples=[
                "brain profile launch <id>",
                "brain profile launch <id> --discovery",
                "brain profile launch <id> --cockpit"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="launch")
        def launch_profile(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="ID del perfil a lanzar"),
            url: Optional[str] = typer.Option(None, "--url", help="URL inicial explícita"),
            cockpit: bool = typer.Option(False, "--cockpit", help="Modo cockpit (landing page)"),
            discovery: bool = typer.Option(False, "--discovery", help="Modo de validación de conexión")
        ):
            """Lanza Chrome con el perfil especificado y la extensión Bloom."""
            logger.info(f"🚀 Iniciando comando profile launch")
            logger.debug(f"Profile ID: {profile_id[:8]}..., Discovery: {discovery}, Cockpit: {cockpit}")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                # Determinar modo y construir URL correspondiente
                if discovery:
                    mode = "discovery"
                    mode_label = "🔍 Discovery Check"
                    target_url = pm.get_discovery_url(profile_id)
                elif cockpit:
                    mode = "normal"
                    mode_label = "🏠 Cockpit"
                    target_url = pm.get_landing_url(profile_id)
                elif url:
                    mode = "normal"
                    mode_label = "Custom URL"
                    target_url = url
                else:
                    # Default: cockpit (landing)
                    mode = "normal"
                    mode_label = "🏠 Cockpit"
                    target_url = pm.get_landing_url(profile_id)

                if gc.verbose:
                    typer.echo(f"🚀 Lanzando perfil en modo: {mode_label}", err=True)

                logger.info(f"Lanzando perfil {profile_id[:8]}... en modo: {mode}")
                logger.debug(f"Target URL: {target_url}")

                # Lanzar el perfil con la URL correcta
                result = pm.launch_profile(profile_id, url=target_url, mode=mode)
                
            except Exception as e:
                logger.error(f"❌ Error al lanzar perfil {profile_id[:8]}...: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al lanzar perfil: {str(e)}")

    def _render_launch(self, data: dict) -> None:
        """Renderiza la confirmación de lanzamiento."""
        # Extraemos el payload
        payload = data.get("data", {})
        
        typer.echo(f"\n🚀 Chrome lanzado exitosamente")
        typer.echo(f"   Perfil: {payload.get('alias', 'N/A')}")
        typer.echo(f"   Modo:   {payload.get('mode', 'Standard')}")
        typer.echo(f"   PID:    {payload.get('pid')}")
        
        if payload.get('extension_loaded'):
            typer.echo("   ✅ Extensión Bloom inyectada")
        typer.echo()

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class ProfilesDestroyCommand(BaseCommand):
    """Elimina un perfil y sus datos del disco."""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="destroy",
            category=CommandCategory.PROFILE,
            version="1.0.0",
            description="Elimina un perfil y todos sus datos",
            examples=[
                "brain profile destroy <profile-id>",
                "brain profile destroy <profile-id> --force"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="destroy")
        def destroy_profile(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="ID del perfil a eliminar"),
            force: bool = typer.Option(False, "--force", "-f", help="Forzar sin confirmación")
        ):
            """Elimina un perfil y sus datos. Requiere confirmación a menos que se use --force."""
            logger.info(f"🗑️  Iniciando comando profile destroy")
            logger.debug(f"Profile ID: {profile_id[:8]}..., Force: {force}")
            
            gc = ctx.obj
            if gc is None:
                from brain.shared.context import GlobalContext
                gc = GlobalContext()
            
            logger.debug(f"Modo JSON: {gc.json_mode}, Verbose: {gc.verbose}")
            
            try:
                from brain.core.profile.profile_manager import ProfileManager
                
                logger.debug("Inicializando ProfileManager...")
                pm = ProfileManager()
                
                if not force and not gc.json_mode:
                    if gc.verbose:
                        typer.echo(f"⚠️  Preparando eliminación de perfil {profile_id}...", err=True)
                    
                    logger.debug("Solicitando confirmación al usuario...")
                    confirm = typer.confirm(
                        f"⚠️  ¿Eliminar perfil {profile_id}? Esta acción es IRREVERSIBLE"
                    )
                    if not confirm:
                        logger.info("❌ Operación cancelada por el usuario")
                        typer.echo("❌ Operación cancelada por el usuario")
                        raise typer.Exit(0)
                    logger.debug("Confirmación recibida, procediendo con eliminación")
                
                if gc.verbose:
                    typer.echo(f"🗑️  Eliminando perfil...", err=True)
                
                logger.info(f"Eliminando perfil {profile_id[:8]}...")
                destroy_data = pm.destroy_profile(profile_id)
                logger.info(f"✅ Perfil eliminado: {destroy_data.get('deleted_files', 0)} archivos eliminados")
                logger.debug(f"Datos de eliminación: {destroy_data}")
                
                result = {
                    "status": "success",
                    "operation": "destroy",
                    "data": destroy_data
                }
                
                gc.output(result, self._render_destroy)
                logger.info("✅ Comando profile destroy completado exitosamente")
                
            except typer.Exit:
                raise
            except Exception as e:
                logger.error(f"❌ Error al eliminar perfil {profile_id[:8]}...: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al eliminar perfil: {str(e)}")

    def _render_destroy(self, data: dict) -> None:
        """Renderiza la confirmación de eliminación."""
        typer.echo(f"\n🗑️  Perfil eliminado correctamente")
        typer.echo(f"   ID:       {data.get('profile_id')}")
        typer.echo(f"   Alias:    {data.get('alias', 'N/A')}")
        typer.echo(f"   Archivos: {data.get('deleted_files', 0)} eliminados\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class ProfilesLinkCommand(BaseCommand):
    """Vincula una cuenta de email a un perfil de Chrome (DEPRECATED - usar accounts-register)."""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="link",
            category=CommandCategory.PROFILE,
            version="1.0.0",
            description="Vincula una cuenta de email a un perfil de Chrome",
            examples=[
                "brain profile link <profile-id> <email>"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="link")
        def link_profile(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="ID del perfil"),
            email: str = typer.Argument(..., help="Email de la cuenta a vincular")
        ):
            """Vincula una cuenta de email a un perfil (DEPRECATED - usar accounts-register)."""
            logger.warning(f"🔗 Comando DEPRECATED 'link' usado. Recomendar usar 'accounts-register'")
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
                
                logger.info(f"Vinculando cuenta {email} al perfil {profile_id[:8]}...")
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
                logger.error(f"❌ Error al vincular cuenta {email} al perfil {profile_id[:8]}...: {str(e)}", exc_info=True)
                self._handle_error(gc, f"Error al vincular cuenta: {str(e)}")

    def _render_link(self, data: dict) -> None:
        """Renderiza la confirmación de vinculación."""
        typer.echo(f"\n🔗 Cuenta vinculada exitosamente")
        typer.echo(f"   Perfil: {data.get('profile_id')[:8]}...")
        typer.echo(f"   Email:  {data.get('email')}\n")

    def _handle_error(self, gc, message: str):
        """Manejo unificado de errores."""
        if gc.json_mode:
            import json
            typer.echo(json.dumps({"status": "error", "message": message}))
        else:
            typer.echo(f"❌ {message}", err=True)
        raise typer.Exit(code=1)


class ProfilesUnlinkCommand(BaseCommand):
    """Desvincula la cuenta asociada a un perfil (DEPRECATED - usar accounts-remove)."""
    
    def metadata(self) -> CommandMetadata:
        return CommandMetadata(
            name="unlink",
            category=CommandCategory.PROFILE,
            version="1.0.0",
            description="Desvincula la cuenta asociada a un perfil",
            examples=[
                "brain profile unlink <profile-id>"
            ]
        )

    def register(self, app: typer.Typer) -> None:
        @app.command(name="unlink")
        def unlink_profile(
            ctx: typer.Context,
            profile_id: str = typer.Argument(..., help="ID del perfil")
        ):
            """Desvincula la cuenta asociada a un perfil (DEPRECATED - usar accounts-remove)."""
            logger.warning(f"🔓 Comando DEPRECATED 'unlink' usado. Recomendar usar 'accounts-remove'")
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