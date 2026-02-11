#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brain CLI - Telemetry Helper
=============================
Gestiona registro de telemetría según plataforma:
- Unix (Linux/macOS): Usa Nucleus CLI
- Windows: Usa script Python (compatibilidad con sistema actual)
"""
import subprocess
import sys
from pathlib import Path
from typing import Optional


def register_telemetry(
    log_file: Path,
    nucleus_bin: Optional[Path] = None,
    platform_name: str = "unknown"
) -> bool:
    """
    Registra telemetría según plataforma.
    
    Args:
        log_file: Ruta al archivo de log
        nucleus_bin: Ruta a Nucleus CLI (requerido en Unix)
        platform_name: Nombre de la plataforma (windows/linux/darwin)
    
    Returns:
        True si el registro fue exitoso, False si falló (no crítico)
    """
    is_windows = sys.platform == "win32"
    
    if is_windows:
        return _register_telemetry_windows(log_file)
    else:
        return _register_telemetry_unix(log_file, nucleus_bin, platform_name)


def _register_telemetry_windows(log_file: Path) -> bool:
    """
    Registra telemetría en Windows usando el script Python existente.
    Mantiene compatibilidad con el sistema actual.
    """
    print("\n   Actualizando telemetry...")
    
    # Buscar el script de telemetría
    # Asumiendo que estamos en brain/build_multiplatform/
    script_locations = [
        Path(__file__).parent.parent.parent / "scripts/python/update_build_telemetry.py",
        Path(__file__).parent.parent.parent / "update_build_telemetry.py",
    ]
    
    update_script = None
    for loc in script_locations:
        if loc.exists():
            update_script = loc
            break
    
    if not update_script:
        print(f"   ⚠️  Script de telemetría no encontrado")
        print(f"   ⚠️  Buscado en: {script_locations[0]}")
        return False
    
    # Parámetros para el script
    telemetry_key = "brain_build"
    telemetry_label = "📦 BRAIN BUILD"
    telemetry_path = str(log_file).replace('\\', '/')
    
    try:
        result = subprocess.run(
            [
                sys.executable,
                str(update_script),
                telemetry_key,
                telemetry_label,
                telemetry_path
            ],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            print(f"   ✅ Telemetry actualizado correctamente")
            print(f"      Label: {telemetry_label}")
            print(f"      Path : {telemetry_path}")
            return True
        else:
            print(f"   ⚠️  El script de telemetry terminó con código {result.returncode}")
            if result.stderr:
                print(f"      Error: {result.stderr}")
            return False
    
    except subprocess.TimeoutExpired:
        print(f"   ⚠️  Timeout al ejecutar script de telemetry")
        return False
    except Exception as e:
        print(f"   ⚠️  Error al ejecutar el script de telemetry: {e}")
        return False


def _register_telemetry_unix(
    log_file: Path,
    nucleus_bin: Optional[Path],
    platform_name: str
) -> bool:
    """
    Registra telemetría en Unix usando Nucleus CLI.
    Cumple con BloomNucleus Spec.
    """
    print("\n   Registrando telemetría en Nucleus...")
    
    # Verificar que se proporcionó la ruta a Nucleus
    if not nucleus_bin:
        print(f"   ⚠️  Ruta a Nucleus CLI no proporcionada")
        print(f"   ℹ️  Saltando registro de telemetría (opcional)")
        return False
    
    # Verificar que Nucleus existe
    if not nucleus_bin.exists():
        print(f"   ⚠️  Nucleus CLI no encontrado: {nucleus_bin}")
        print(f"   ℹ️  Saltando registro de telemetría (opcional)")
        return False
    
    # Dar permisos de ejecución si no los tiene
    import os
    if not os.access(nucleus_bin, os.X_OK):
        try:
            os.chmod(nucleus_bin, 0o755)
        except Exception as e:
            print(f"   ⚠️  No se pudo dar permisos de ejecución a Nucleus: {e}")
            return False
    
    # Ejecutar nucleus telemetry register
    try:
        result = subprocess.run(
            [
                str(nucleus_bin),
                "telemetry", "register",
                "--stream", "brain_build",
                "--label", "🧠 BRAIN BUILD",
                "--path", str(log_file),
                "--priority", "3"
            ],
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0:
            print(f"   ✅ Telemetría registrada exitosamente")
            print(f"      Stream:   brain_build")
            print(f"      Label:    🧠 BRAIN BUILD")
            print(f"      Path:     {log_file}")
            print(f"      Priority: 3")
            return True
        else:
            print(f"   ⚠️  No se pudo registrar telemetría (código: {result.returncode})")
            if result.stderr:
                print(f"      Error: {result.stderr}")
            return False
    
    except subprocess.TimeoutExpired:
        print(f"   ⚠️  Timeout al ejecutar Nucleus CLI")
        return False
    except Exception as e:
        print(f"   ⚠️  Error ejecutando Nucleus CLI: {e}")
        return False


if __name__ == "__main__":
    # Test del helper
    from platform_detector import PLATFORM
    
    print("=" * 60)
    print("BRAIN CLI - Telemetry Helper Test")
    print("=" * 60)
    print(f"Platform: {PLATFORM.os_name}")
    print(f"Log File: {PLATFORM.get_log_directory() / PLATFORM.get_log_filename()}")
    
    # Crear log de prueba
    log_dir = PLATFORM.get_log_directory()
    log_dir.mkdir(parents=True, exist_ok=True)
    test_log = log_dir / f"test_{PLATFORM.get_log_filename()}"
    test_log.write_text("Test log\n")
    
    print(f"\nRegistrando telemetría de prueba...")
    
    project_root = Path(__file__).parent.parent.parent
    nucleus_bin = PLATFORM.get_nucleus_path(project_root)
    
    success = register_telemetry(
        log_file=test_log,
        nucleus_bin=nucleus_bin,
        platform_name=PLATFORM.os_name
    )
    
    print(f"\nResultado: {'✅ Éxito' if success else '⚠️  Falló (no crítico)'}")
    print("=" * 60)