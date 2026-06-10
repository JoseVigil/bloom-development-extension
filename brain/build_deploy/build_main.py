#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brain CLI - Build Script Principal
Genera command_loader, actualiza spec, compila y copia al destino correcto.

Este script está en brain/build_deploy/ pero se ejecuta desde la raíz via build.py
"""
import os
import sys
import shutil
import subprocess
from pathlib import Path

# Forzar UTF-8 en Windows
if sys.platform == "win32":
    import io
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


# Obtener rutas
SCRIPT_DIR = Path(__file__).parent.resolve()  # brain/build_deploy/
PROJECT_ROOT = SCRIPT_DIR.parent.parent       # raíz del proyecto

# ========================================
# DETECCIÓN DE PLATAFORMA
# Delegamos en platform_detector.py (fuente de verdad compartida).
# build_main.py tenia su propia detect_platform_dir() con "linux64"
# hardcodeado, lo que causaba que el ejecutable se copiara a la
# carpeta incorrecta en Linux x64.
# ========================================
try:
    from shared.platform_detector import PLATFORM as _PLATFORM
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent.parent / "build_multiplatform"))
    from shared.platform_detector import PLATFORM as _PLATFORM

PLATFORM_DIR = _PLATFORM.platform_dir
EXE_NAME     = _PLATFORM.get_executable_name()

print(f"[INFO] Plataforma detectada: {PLATFORM_DIR}")
print(f"[INFO] Ejecutable: {EXE_NAME}")

class Colors:
    """Colores para terminal"""
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def run_update_version():
    script = Path(__file__).parent / "update_version.py"
    subprocess.run([sys.executable, str(script)], check=True)

def print_step(msg):
    """Imprime un paso del proceso"""
    print(f"\n{Colors.OKBLUE}{'='*70}{Colors.ENDC}")
    print(f"{Colors.BOLD}{msg}{Colors.ENDC}")
    print(f"{Colors.OKBLUE}{'='*70}{Colors.ENDC}\n")


def print_success(msg):
    """Imprime mensaje de éxito"""
    print(f"{Colors.OKGREEN}[OK] {msg}{Colors.ENDC}")


def print_error(msg):
    """Imprime mensaje de error"""
    print(f"{Colors.FAIL}[ERROR] {msg}{Colors.ENDC}")


def print_warning(msg):
    """Imprime advertencia"""
    print(f"{Colors.WARNING}[WARNING] {msg}{Colors.ENDC}")

def create_version_file():
    """Crea archivo VERSION desde pyproject.toml para embeder en frozen exe."""
    print_step("CREANDO VERSION FILE")
    
    import re
    
    pyproject = PROJECT_ROOT / "brain" / "pyproject.toml"
    
    if not pyproject.exists():
        print_warning(f"pyproject.toml no encontrado en {pyproject}")
        return False
    
    content = pyproject.read_text(encoding='utf-8')
    match = re.search(r'version\s*=\s*["\']([^"\']+)["\']', content)
    
    if not match:
        print_error("Version no encontrada en pyproject.toml")
        return False
    
    version = match.group(1)
    version_file = PROJECT_ROOT / "brain" / "VERSION"
    version_file.write_text(version, encoding='utf-8')
    
    print_success(f"VERSION file creado: v{version}")
    return True


def increment_build_number():
    """Incrementa el build number y genera __build__.py"""
    print_step("INCREMENTANDO BUILD NUMBER")
    
    script = SCRIPT_DIR / "generate_build_module.py"
    
    if not script.exists():
        print_warning(f"Script no encontrado: {script}")
        return False
    
    return run_command(
        [sys.executable, str(script)],
        "Incremento de build number"
    )


def update_spec_metadata():
    """Actualiza brain.spec para incluir VERSION y __build__.py"""
    print_step("ACTUALIZANDO SPEC CON METADATA")
    
    script = SCRIPT_DIR / "update_spec_metadata.py"
    
    if not script.exists():
        print_warning(f"Script no encontrado: {script}")
        return False
    
    return run_command(
        [sys.executable, str(script)],
        "Actualización de spec con metadata"
    )


def run_command(cmd, description):
    """
    Ejecuta un comando y maneja errores.

    Usa Popen + lectura línea a línea en lugar de capture_output=True para
    evitar el deadlock de pipe-buffer que congela PyInstaller a 0%:
    con capture_output=True, subprocess espera a que el proceso termine
    antes de leer el pipe, pero PyInstaller llena el buffer del pipe (~65 KB)
    y se bloquea esperando que alguien lo drene → deadlock.
    """
    print(f"Ejecutando: {description}")
    print(f"  $ {' '.join(str(c) for c in cmd)}")

    stdout_lines: list[str] = []
    stderr_lines: list[str] = []

    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
            cwd=PROJECT_ROOT,
        )

        # Drenar stdout y stderr en paralelo para evitar deadlock
        import threading

        def _read_stream(stream, accumulator: list[str]) -> None:
            for line in stream:
                line = line.rstrip("\n")
                accumulator.append(line)
                # Emitir [PROG:N] si la línea viene de build.py (pasamos la señal hacia arriba)
                if line.startswith("[PROG:"):
                    print(line, flush=True)

        t_out = threading.Thread(target=_read_stream, args=(proc.stdout, stdout_lines), daemon=True)
        t_err = threading.Thread(target=_read_stream, args=(proc.stderr, stderr_lines), daemon=True)
        t_out.start()
        t_err.start()
        proc.wait()
        t_out.join()
        t_err.join()

    except Exception as exc:
        print_error(f"No se pudo lanzar '{description}': {exc}")
        return False

    rc = proc.returncode
    combined_out = "\n".join(stdout_lines)
    combined_err = "\n".join(stderr_lines)

    if rc != 0:
        print_error(f"Error en: {description}")
        # Mostrar las últimas 40 líneas de stderr para diagnóstico
        tail = stderr_lines[-40:] if stderr_lines else stdout_lines[-40:]
        for line in tail:
            print(f"  {line}")
        return False

    print_success(f"Completado: {description}")
    return True


def clean_build_dirs():
    """Limpia directorios de build previos"""
    print_step("LIMPIANDO DIRECTORIOS DE BUILD")
    
    dirs_to_clean = [PROJECT_ROOT / 'build', PROJECT_ROOT / 'dist']
    
    for dir_path in dirs_to_clean:
        if dir_path.exists():
            print(f"Eliminando: {dir_path}")
            shutil.rmtree(dir_path)
            print_success(f"Eliminado: {dir_path}")
        else:
            print(f"No existe: {dir_path} (ok)")


def generate_command_loader():
    """Genera command_loader.py"""
    print_step("GENERANDO COMMAND_LOADER.PY")
    
    script = SCRIPT_DIR / "generate_command_loader.py"
    
    if not script.exists():
        print_error(f"No existe: {script}")
        return False
    
    return run_command(
        [sys.executable, str(script)],
        "Generación de command_loader.py"
    )


def update_spec_hiddenimports():
    """Actualiza brain.spec con hiddenimports"""
    print_step("ACTUALIZANDO BRAIN.SPEC")
    
    script = SCRIPT_DIR / "update_spec_hiddenimports.py"
    
    if not script.exists():
        print_error(f"No existe: {script}")
        return False
    
    return run_command(
        [sys.executable, str(script)],
        "Actualización de hiddenimports"
    )


def compile_with_pyinstaller(clean=False):
    """Compila con PyInstaller"""
    print_step("COMPILANDO CON PYINSTALLER")
    
    spec_file = SCRIPT_DIR / "brain.spec"
    
    if not spec_file.exists():
        print_error(f"No existe: {spec_file}")
        return False
    
    cmd = ["pyinstaller", str(spec_file), "--noconfirm"]
    if clean:
        cmd.append("--clean")
    
    return run_command(cmd, "Compilación con PyInstaller")


def copy_to_installer_dir():
    """Copia los archivos compilados al directorio installer"""
    print_step("COPIANDO A DIRECTORIO FINAL")
    
    source_dir = PROJECT_ROOT / "dist/brain"
    dest_dir = PROJECT_ROOT / "installer/native/bin" / PLATFORM_DIR / "brain"
    
    if not source_dir.exists():
        print_error(f"No existe el directorio compilado: {source_dir}")
        return False
    
    # Crear directorio destino
    dest_dir.mkdir(parents=True, exist_ok=True)
    
    # Limpiar destino
    print(f"Limpiando: {dest_dir}")
    for item in dest_dir.iterdir():
        if item.is_file():
            item.unlink()
        elif item.is_dir():
            shutil.rmtree(item)
    
    # Copiar archivos
    print(f"Copiando desde: {source_dir}")
    print(f"           a: {dest_dir}")
    
    for item in source_dir.iterdir():
        dest_item = dest_dir / item.name
        if item.is_dir():
            shutil.copytree(item, dest_item, dirs_exist_ok=True)
        else:
            shutil.copy2(item, dest_item)
    
    print_success(f"Archivos copiados a: {dest_dir}")
    
    # Verificar que el ejecutable existe
    exe_path = dest_dir / EXE_NAME
    if exe_path.exists():
        print_success(f"Ejecutable creado: {exe_path}")
        return True
    else:
        print_error(f"No se encontró {EXE_NAME} en {dest_dir}")
        return False


def verify_build():
    """Verifica que la compilación fue exitosa"""
    print_step("VERIFICANDO COMPILACIÓN")
    
    exe_path = PROJECT_ROOT / "installer/native/bin" / PLATFORM_DIR / "brain" / EXE_NAME
    
    if not exe_path.exists():
        print_error(f"No existe: {exe_path}")
        return False
    
    print_success(f"Ejecutable encontrado: {exe_path}")
    
    # Verificar tamaño del archivo (debe ser > 1MB)
    size_mb = exe_path.stat().st_size / 1024 / 1024
    if size_mb < 1:
        print_error(f"Ejecutable muy pequeño: {size_mb:.1f} MB")
        return False
    
    print_success(f"Tamaño: {size_mb:.1f} MB")
    print_success("Verificación completada")
    return True


def main():
    """Proceso principal de compilación."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Build script para Brain CLI")
    parser.add_argument("--clean", action="store_true", help="Limpiar directorios antes de compilar")
    parser.add_argument("--skip-gen", action="store_true", help="Saltar generación de command_loader")
    parser.add_argument("--no-copy", action="store_true", help="No copiar a installer/ (usar solo dist/)")
    
    args = parser.parse_args()
    
    print(f"{Colors.HEADER}")
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║           BRAIN CLI - BUILD SCRIPT                                ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    print(f"{Colors.ENDC}")

    # 🔥 0. Aplicar versión si existe solicitud
    run_update_version()
    
    # ✅ NUEVO: 0.5. Incrementar build number
    if not increment_build_number():
        print_error("Falló el incremento de build number")
        sys.exit(1)
    
    # Paso 1: Limpiar (opcional)
    if args.clean:
        clean_build_dirs()
    
    # Paso 1.5: Crear VERSION file
    if not create_version_file():
        print_error("Falló la creación del VERSION file")
        sys.exit(1)
    
    # Paso 2: Generar command_loader (opcional)
    if not args.skip_gen:
        if not generate_command_loader():
            print_error("Falló la generación de command_loader.py")
            sys.exit(1)
        
        # ✅ NUEVO: Actualizar spec con metadata
        if not update_spec_metadata():
            print_error("Falló la actualización de spec con metadata")
            sys.exit(1)
        
        if not update_spec_hiddenimports():
            print_error("Falló la actualización de brain.spec")
            sys.exit(1)
    else:
        print_warning("Saltando generación de command_loader (--skip-gen)")
    
    # Paso 3: Compilar
    if not compile_with_pyinstaller(clean=args.clean):
        print_error("Falló la compilación con PyInstaller")
        sys.exit(1)
    
    # Paso 4: Copiar a installer (opcional)
    if not args.no_copy:
        if not copy_to_installer_dir():
            print_error("Falló la copia al directorio final")
            sys.exit(1)
    else:
        print_warning("Saltando copia a installer/ (--no-copy)")
    
    # Paso 5: Verificar
    if not args.no_copy:
        if not verify_build():
            print_error("La verificación falló")
            sys.exit(1)
    
    # ¡Éxito!
    print(f"\n{Colors.OKGREEN}")
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║               [OK] BUILD COMPLETADO EXITOSAMENTE                  ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    print(f"{Colors.ENDC}\n")
    
    if not args.no_copy:
        exe_path = PROJECT_ROOT / "installer/native/bin" / PLATFORM_DIR / "brain" / EXE_NAME
        print(f"Ejecutable: {exe_path}")
        print(f"\nPrueba con: {exe_path} --help")


if __name__ == "__main__":
    main()