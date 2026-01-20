"""
Profile Launcher - Lógica aislada de lanzamiento de perfiles.
Versión spec-driven pura: Solo acepta especificaciones JSON.
Convention mode eliminado - deprecated desde v2.0.
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
        - target_url: URL a abrir
        - engine_flags: Flags del motor
        - custom_flags: Flags personalizados
        
        NO hay lógica hardcoded - todo viene del JSON.
        """
        logger.info("🎯 Ejecutando spec-driven v2.2")
        
        # Extracción de configuración
        engine_config = spec.get('engine', {})
        paths_config = spec.get('paths', {})
        
        engine_type = engine_config.get('type')
        exe = engine_config.get('executable')
        u_data = paths_config.get('user_data')
        ext = paths_config.get('extension')
        logs_base = paths_config.get('logs_base')
        url = spec.get('target_url')
        
        logger.debug(f"📋 Spec recibido:")
        logger.debug(f"   Engine Type: {engine_type}")
        logger.debug(f"   Executable: {exe}")
        logger.debug(f"   User Data: {u_data}")
        logger.debug(f"   Extension: {ext}")
        logger.debug(f"   Target URL: {url}")
        
        # Validación de campos requeridos
        if not all([engine_type, exe, u_data, ext, url]):
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
            
            logger.info(f"📝 Launch ID: {launch_id}")
            logger.debug(f"   Debug Log: {debug_log}")
            logger.debug(f"   Net Log: {net_log}")
        
        # Construcción de argumentos del navegador
        chrome_args = [
            str(exec_path),
            f"--user-data-dir={user_data_path}",
            f"--load-extension={extension_path}",
            f"--app={url}",
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
        
        Estándar de Lanzamiento Atómico:
        1. Silencio total en stdout (evita contaminar pipe de Go)
        2. Lanzamiento desacoplado (proceso hijo independiente)
        3. Contrato JSON (única salida permitida en stdout)
        4. Entrega y cierre quirúrgico (os._exit para evitar cleanup)
        
        CRÍTICO: NO MODIFICAR sin coordinar con Sentinel.
        
        Args:
            args: Argumentos para el proceso Chrome
            profile_id: ID del perfil a lanzar
            log_files: Diccionario con rutas de archivos de log
            launch_id: ID único del lanzamiento
        """
        logger.info(f"🚀 Iniciando handoff a Sentinel")
        logger.debug(f"  → Args count: {len(args)}")
        logger.debug(f"  → Executable: {args[0]}")
        
        # Kill preventivo de bloom-host (Windows only)
        if platform.system() == 'Windows':
            logger.debug("🔪 Matando procesos bloom-host.exe previos")
            os.system('taskkill /f /im bloom-host.exe >nul 2>&1')
        
        try:
            # 1. SILENCIO TOTAL EN STDOUT
            # Deshabilita todos los logs que puedan contaminar stdout
            import logging
            logging.disable(logging.CRITICAL)
            
            # 2. LANZAMIENTO DESACOPLADO
            # Flags para Windows: DETACHED_PROCESS (0x08) + CREATE_NEW_PROCESS_GROUP (0x200)
            # Flags para Unix: 0 (comportamiento por defecto es suficiente)
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
            
            # 3. CONTRATO JSON (Única salida permitida en stdout)
            # Generación del launch_id si no se proveyó
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
            
            logger.info(f"✅ Proceso lanzado exitosamente")
            logger.debug(f"  → PID: {proc.pid}")
            logger.debug(f"  → Profile ID: {profile_id[:8]}")
            logger.debug(f"  → Log files: {len(log_files)} archivos")
            
            # 4. ENTREGA Y CIERRE QUIRÚRGICO
            sys.stdout.write(json.dumps(result) + "\n")
            sys.stdout.flush()
            
            # Margen para que el buffer del SO entregue el dato a Go
            time.sleep(0.5)
            
            # Muerte inmediata: evita que Python espere al navegador
            # os._exit(0) en vez de sys.exit() para saltear cleanup handlers
            os._exit(0)
            
        except Exception as e:
            logger.error(f"✗ Error fatal en handoff: {str(e)}", exc_info=True)
            sys.stderr.write(f"FATAL_ERROR: {str(e)}\n")
            sys.stderr.flush()
            os._exit(1)