"""
Profile Launcher - Lógica aislada de lanzamiento de perfiles.
Versión spec-driven pura: Solo acepta especificaciones JSON.
Convention mode eliminado - deprecated desde v2.0.

CHANGELOG v2.3:
- Agregado soporte para page_config (discovery/landing)
- Generación automática de target_url según page_config.type
- Retrocompatibilidad con specs sin page_config
"""
import sys
import json
import subprocess
import os
import uuid
import platform
import time
from pathlib import Path
from typing import Dict, Any, Optional
from datetime import datetime

from brain.shared.logger import get_logger
logger = get_logger("brain.profile.launcher")


class ProfileLauncher:
    """
    Lanzador de perfiles con handoff estandarizado a Sentinel.
    SOLO soporta spec-driven mode - todos los parámetros vienen del JSON.
    """
    
    def __init__(self, paths, chrome_resolver):
        """
        Args:
            paths: PathResolver instance
            chrome_resolver: ChromeResolver instance (unused en spec-driven)
        """
        self.paths = paths
        self.resolver = chrome_resolver
        logger.debug("ProfileLauncher inicializado (spec-driven only)")
    
    def launch(
        self,
        profile: Dict[str, Any],
        url: Optional[str] = None,
        spec_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Lanza un perfil usando especificación JSON.
        
        Args:
            profile: Datos del perfil (id, alias, path)
            url: IGNORADO - deprecated
            spec_data: Especificación completa (REQUERIDO)
        
        Returns:
            Resultado del handoff (nunca llega, os._exit antes)
            
        Raises:
            ValueError: Si no se provee spec_data
        """
        logger.info(f"🚀 Lanzando perfil: {profile['id'][:8]}...")
        
        if not spec_data:
            logger.error("✗ Spec-driven mode requerido")
            raise ValueError(
                "Spec-driven mode required. "
                "Convention mode deprecated since v2.0. "
                "Use: brain profile launch <id> --spec /path/to/spec.json"
            )
        
        logger.info("📋 Modo SPEC-DRIVEN")
        return self._launch_spec_driven(profile, spec_data)
    
    def _launch_spec_driven(self, profile: Dict[str, Any], spec: Dict[str, Any]) -> Dict[str, Any]:
        """
        Lanzamiento spec-driven: JSON define TODO (executable, paths, flags, url).
        
        El spec controla:
        - engine.type: "chrome" | "chromium"
        - engine.executable: Ruta al binario
        - paths.user_data: Manejo de user-data-dir
        - paths.extension: Ruta a extensión
        - paths.logs_base: Directorio de logs
        - target_url: URL a abrir (puede ser "auto")
        - page_config: Configuración de página (discovery/landing)
        - engine_flags: Flags del motor
        - custom_flags: Flags personalizados
        
        NO hay lógica hardcoded - todo viene del JSON.
        """
        logger.info("🎯 Ejecutando spec-driven v2.3 (con page_config)")
        
        # Extracción de configuración
        engine_config = spec.get('engine', {})
        paths_config = spec.get('paths', {})
        page_config = spec.get('page_config', {})
        
        engine_type = engine_config.get('type')
        exe = engine_config.get('executable')
        u_data = paths_config.get('user_data')
        ext = paths_config.get('extension')
        logs_base = paths_config.get('logs_base')
        target_url_raw = spec.get('target_url')
        
        logger.debug(f"📋 Spec recibido:")
        logger.debug(f"   Engine Type: {engine_type}")
        logger.debug(f"   Executable: {exe}")
        logger.debug(f"   User Data: {u_data}")
        logger.debug(f"   Extension: {ext}")
        logger.debug(f"   Target URL (raw): {target_url_raw}")
        logger.debug(f"   Page Config: {page_config}")
        
        # ====================================================================
        # 🆕 RESOLUCIÓN DE target_url SEGÚN page_config
        # ====================================================================
        target_url = self._resolve_target_url(target_url_raw, page_config)
        
        page_type = page_config.get('type', 'custom')
        if page_type == 'discovery':
            logger.info(f"🔎 Lanzando en modo DISCOVERY")
            logger.info(f"   → Onboarding y validación inicial")
        elif page_type == 'landing':
            logger.info(f"🏠 Lanzando en modo LANDING")
            logger.info(f"   → Dashboard del perfil")
        else:
            logger.info(f"🎯 Lanzando en modo CUSTOM")
        
        logger.info(f"🎯 Target URL resuelto: {target_url}")
        
        # Validación de campos requeridos
        if not all([engine_type, exe, u_data, ext, target_url]):
            logger.error("✗ Spec incompleto: faltan campos requeridos")
            raise ValueError(
                "Spec incompleto. Campos requeridos: "
                "engine.type, engine.executable, paths.user_data, paths.extension, target_url"
            )
        
        # Validación de engine type
        if engine_type not in ['chrome', 'chromium']:
            logger.error(f"✗ Engine type inválido: {engine_type}")
            raise ValueError(f"Engine type debe ser 'chrome' o 'chromium', recibido: {engine_type}")
        
        # Resolución de rutas (relativas a base_dir o absolutas)
        exec_path = self.paths.base_dir / exe if not os.path.isabs(exe) else Path(exe)
        user_data_path = self.paths.base_dir / u_data if not os.path.isabs(u_data) else Path(u_data)
        extension_path = self.paths.base_dir / ext if not os.path.isabs(ext) else Path(ext)
        
        logger.debug(f"🔧 Rutas resueltas:")
        logger.debug(f"   Executable: {exec_path}")
        logger.debug(f"   User Data: {user_data_path}")
        logger.debug(f"   Extension: {extension_path}")
        
        # Validación de existencia
        if not exec_path.exists():
            logger.error(f"✗ Ejecutable no encontrado: {exec_path}")
            raise FileNotFoundError(f"Ejecutable no encontrado: {exec_path}")
        
        # Generación de logs granulares (opcional)
        debug_log = None
        net_log = None
        launch_id = None
        log_files = {}
        
        if logs_base:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            short_uuid = str(uuid.uuid4())[:8]
            launch_id = f"{timestamp}_{short_uuid}"
            
            logs_dir = self.paths.base_dir / logs_base if not os.path.isabs(logs_base) else Path(logs_base)
            logs_dir.mkdir(parents=True, exist_ok=True)
            
            debug_log = logs_dir / f"{launch_id}_chrome_debug.log"
            net_log = logs_dir / f"{launch_id}_chrome_net.log"
            
            # Construcción del objeto log_files con rutas absolutas
            log_files = {
                "debug_log": str(debug_log.absolute()),
                "net_log": str(net_log.absolute()),
                "logs_dir": str(logs_dir.absolute())
            }
            
            logger.info(f"📁 Launch ID: {launch_id}")
            logger.debug(f"   Debug Log: {debug_log}")
            logger.debug(f"   Net Log: {net_log}")
        
        # Construcción de argumentos del navegador
        chrome_args = [
            str(exec_path),
            f"--user-data-dir={user_data_path}",
            "--profile-directory=Default",
            f"--load-extension={extension_path}",
            f"--app={target_url}",            
            "--app-id=bloom-synapse"
        ]
        
        # Logs opcionales
        if debug_log:
            chrome_args.append(f"--log-file={debug_log}")
        if net_log:
            chrome_args.append(f"--log-net-log={net_log}")
        
        # Flags desde spec (sin hardcoded)
        chrome_args.extend(spec.get('engine_flags', []))
        chrome_args.extend(spec.get('custom_flags', []))
        
        logger.debug(f"🔧 Chrome args construidos: {len(chrome_args)} argumentos")
        logger.debug(f"   Engine flags: {len(spec.get('engine_flags', []))}")
        logger.debug(f"   Custom flags: {len(spec.get('custom_flags', []))}")
        
        # Handoff estándar a Sentinel (ahora incluye log_files)
        return self._execute_handoff(chrome_args, profile['id'], log_files, launch_id)
    
    def _resolve_target_url(
        self, 
        target_url_raw: Optional[str], 
        page_config: Dict[str, Any]
    ) -> str:
        """
        Resuelve target_url según page_config.
        
        Lógica:
        1. Si target_url == "auto" → Generar según page_config.type
        2. Si no hay page_config → Usar target_url tal cual (retrocompatibilidad)
        3. Si page_config.type existe → Validar y generar
        
        Page types:
        - discovery: extension/discovery/index.html (onboarding, registro)
        - landing: extension/landing/index.html (dashboard, stats)
        - custom: URL manual especificada
        
        Args:
            target_url_raw: URL del spec (puede ser "auto", URL completa, o None)
            page_config: Diccionario con {type: "discovery"|"landing"|"custom", auto_generate_url: bool}
        
        Returns:
            URL final a usar
            
        Raises:
            ValueError: Si page_config.type es inválido o target_url falta
        """
        # Caso 1: No hay page_config → Modo retrocompatible
        if not page_config:
            logger.debug("📄 No hay page_config, usando target_url directo (retrocompatibilidad)")
            if not target_url_raw:
                raise ValueError("target_url es requerido cuando no hay page_config")
            return target_url_raw
        
        # Caso 2: page_config existe → Validar type
        page_type = page_config.get('type', 'custom')
        auto_generate = page_config.get('auto_generate_url', False)
        
        logger.debug(f"📄 page_config detectado:")
        logger.debug(f"   type: {page_type}")
        logger.debug(f"   auto_generate_url: {auto_generate}")
        
        # Validar page_type
        valid_types = ['discovery', 'landing', 'custom']
        if page_type not in valid_types:
            raise ValueError(
                f"page_config.type inválido: '{page_type}'. "
                f"Valores permitidos: {valid_types}"
            )
        
        # Caso 3: target_url == "auto" → Generar según page_type
        if target_url_raw == "auto" or auto_generate:
            if page_type == 'custom':
                raise ValueError(
                    "No se puede usar target_url='auto' con page_config.type='custom'. "
                    "Especifica 'discovery' o 'landing', o provee target_url manual."
                )
            
            extension_id = self.paths.get_extension_id()
            
            if page_type == 'discovery':
                url = f"chrome-extension://{extension_id}/discovery/index.html"
                logger.info(f"🔎 Modo DISCOVERY: {url}")
                logger.info("   → Página de onboarding y validación inicial")
            elif page_type == 'landing':
                url = f"chrome-extension://{extension_id}/landing/index.html"
                logger.info(f"🏠 Modo LANDING: {url}")
                logger.info("   → Dashboard del perfil (panel de control)")
            
            return url
        
        # Caso 4: target_url manual especificado
        if target_url_raw:
            logger.info(f"🎯 Modo CUSTOM: Usando target_url manual")
            logger.debug(f"   URL: {target_url_raw}")
            return target_url_raw
        
        # Caso 5: Ni auto ni manual → Error
        raise ValueError(
            "target_url no especificado. Use 'auto' para generación automática "
            "o provea URL manual."
        )
    
    def _execute_handoff(
        self, 
        args: list, 
        profile_id: str, 
        log_files: Dict[str, str],
        launch_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Handoff estándar a Sentinel (Go).
        Implementa el contrato Python -> Go v2.0.
        """
        logger.info(f"🚀 Iniciando handoff a Sentinel")
        logger.debug(f"  → Args count: {len(args)}")
        logger.debug(f"  → Executable: {args[0]}")

        # ==========================================================
        # FIX DEFINITIVO – LOCK ATÓMICO A NIVEL SO
        # ==========================================================

        # Extraer --user-data-dir
        user_data_arg = next(
            (a for a in args if a.startswith("--user-data-dir=")),
            None
        )

        if not user_data_arg:
            raise RuntimeError("No se encontró --user-data-dir en args")

        user_data_path = Path(user_data_arg.split("=", 1)[1])
        lock_file = user_data_path / ".chrome_app.lock"

        try:
            # CREACIÓN ATÓMICA: solo UN proceso puede pasar
            fd = os.open(
                lock_file,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY
            )
            with os.fdopen(fd, "w") as f:
                f.write(
                    f"pid={os.getpid()}\n"
                    f"time={datetime.now().isoformat()}\n"
                )

            logger.debug("🔒 Lock de app creado correctamente")

        except FileExistsError:
            logger.warning("🚫 Launch abortado: la app ya está en ejecución")
            return {
                "status": "already_running",
                "data": {
                    "profile_id": profile_id,
                    "reason": "atomic_lock_present"
                }
            }

        # ==========================================================
        # Kill preventivo de bloom-host (Windows only)
        # ==========================================================
        if platform.system() == 'Windows':
            logger.debug("🔪 Matando procesos bloom-host.exe previos")
            os.system('taskkill /f /im bloom-host.exe >nul 2>&1')

        try:
            # ======================================================
            # 1. SILENCIO TOTAL EN STDOUT
            # ======================================================
            import logging
            logging.disable(logging.CRITICAL)

            # ======================================================
            # 2. LANZAMIENTO DESACOPLADO
            # ======================================================
            flags = 0x00000008 | 0x00000200 if platform.system() == 'Windows' else 0

            logger.info("🚀 Spawning proceso desacoplado...")
            proc = subprocess.Popen(
                args,
                creationflags=flags,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                stdin=subprocess.DEVNULL,
                close_fds=True,
                shell=False
            )

            # ======================================================
            # 3. CONTRATO JSON
            # ======================================================
            if not launch_id:
                launch_id = datetime.now().strftime("%Y%m%d_%H%M%S")

            result = {
                "status": "success",
                "data": {
                    "profile_id": profile_id,
                    "launch": {
                        "pid": proc.pid,
                        "launch_id": launch_id
                    },
                    "log_files": log_files
                }
            }

            # ======================================================
            # 4. ENTREGA Y CIERRE QUIRÚRGICO
            # ======================================================
            sys.stdout.write(json.dumps(result) + "\n")
            sys.stdout.flush()

            time.sleep(0.5)
            os._exit(0)

        except Exception as e:
            logger.error(f"✗ Error fatal en handoff: {str(e)}", exc_info=True)
            sys.stderr.write(f"FATAL_ERROR: {str(e)}\n")
            sys.stderr.flush()
            os._exit(1)