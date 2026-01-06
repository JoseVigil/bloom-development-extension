# -*- mode: python ; coding: utf-8 -*-
"""
Brain PyInstaller Spec File
Configuración para compilar Brain CLI a ejecutable standalone

Este archivo está en brain/build_deploy/ pero PyInstaller lo ejecuta desde la raíz
"""
import sys
import io
from pathlib import Path

# Forzar UTF-8 en Windows para evitar errores de codificación
if sys.platform == "win32":
    if hasattr(sys.stdout, 'buffer'):
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# SPECPATH es la carpeta donde está este .spec (brain/build_deploy/)
# Necesitamos ir a la raíz del proyecto
PROJECT_ROOT = Path(SPECPATH).parent.parent

block_cipher = None

# Imports ocultos necesarios para Brain
# IMPORTANTE: Actualizar esta lista después de ejecutar generate_command_loader.py
hiddenimports = [
    # Core Brain
    'brain',
    'brain.cli',
    'brain.cli.base',
    'brain.cli.registry',
    'brain.cli.command_loader',
    'brain.cli.categories',
    'brain.cli.help_renderer',
    'brain.shared',
    'brain.shared.context',
    'brain.commands',

    # Typer y dependencias
    'typer',
    'click',
    'rich',
    'rich.console',
    'rich.table',
    'rich.markdown',

    # Comandos (Auto-generado por update_spec_hiddenimports.py)
    'brain.commands.context.generate',
    'brain.commands.extension.backups',
    'brain.commands.extension.install',
    'brain.commands.extension.update',
    'brain.commands.extension.verify',
    'brain.commands.filesystem.compress',
    'brain.commands.filesystem.tree',
    'brain.commands.gemini.keys_add',
    'brain.commands.gemini.keys_delete',
    'brain.commands.gemini.keys_list',
    'brain.commands.gemini.keys_stats',
    'brain.commands.gemini.keys_validate',
    'brain.commands.github.auth',
    'brain.commands.github.auth_login',
    'brain.commands.github.auth_logout',
    'brain.commands.github.auth_status',
    'brain.commands.github.clone',
    'brain.commands.github.orgs',
    'brain.commands.github.orgs_list',
    'brain.commands.github.repos',
    'brain.commands.github.repos_list',
    'brain.commands.health.dev_check',
    'brain.commands.health.full_stack',
    'brain.commands.health.native_ping',
    'brain.commands.health.onboarding_status',
    'brain.commands.health.websocket_status',
    'brain.commands.intent.add_turn',
    'brain.commands.intent.build_payload',
    'brain.commands.intent.create',
    'brain.commands.intent.delete',
    'brain.commands.intent.download',
    'brain.commands.intent.finalize',
    'brain.commands.intent.get',
    'brain.commands.intent.hydrate',
    'brain.commands.intent.list',
    'brain.commands.intent.lock',
    'brain.commands.intent.merge',
    'brain.commands.intent.parse',
    'brain.commands.intent.plan',
    'brain.commands.intent.recover',
    'brain.commands.intent.stage',
    'brain.commands.intent.submit',
    'brain.commands.intent.unlock',
    'brain.commands.intent.update',
    'brain.commands.intent.validate',
    'brain.commands.nucleus.create',
    'brain.commands.nucleus.create_exp_intent',
    'brain.commands.nucleus.delete',
    'brain.commands.nucleus.exp_discovery_turn',
    'brain.commands.nucleus.exp_export_findings',
    'brain.commands.nucleus.get',
    'brain.commands.nucleus.info',
    'brain.commands.nucleus.link',
    'brain.commands.nucleus.list',
    'brain.commands.nucleus.list_projects',
    'brain.commands.nucleus.onboarding_complete',
    'brain.commands.nucleus.onboarding_status',
    'brain.commands.nucleus.project_info',
    'brain.commands.nucleus.status',
    'brain.commands.nucleus.sync',
    'brain.commands.profile.accounts',
    'brain.commands.profile.profiles',
    'brain.commands.project.add',
    'brain.commands.project.clone_and_add',
    'brain.commands.project.detect',
    'brain.commands.project.load',
    'brain.commands.project.nucleus',
    'brain.commands.service.service',
]

# Datos adicionales que deben incluirse (configs, templates, etc.)
datas = [
    # Ejemplo: ('brain/config/templates', 'brain/config/templates'),
    # Ejemplo: ('brain/assets', 'brain/assets'),
]

# Binarios adicionales (DLLs, .so, etc.)
binaries = []

a = Analysis(
    [str(PROJECT_ROOT / 'brain' / '__main__.py')],
    pathex=[str(PROJECT_ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Excluir paquetes innecesarios para reducir tamaño
        'matplotlib',
        'numpy',
        'scipy',
        'pandas',
        'PIL',
        'tkinter',
        'test',
        'unittest',
        'pytest',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(
    a.pure,
    a.zipped_data,
    cipher=block_cipher
)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='brain',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,  # Comprimir con UPX (opcional, reduce tamaño)
    console=True,  # True para CLI, False para GUI
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,  # Opcional: 'brain/assets/icon.ico'
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='brain'
)

# Configurar directorio de salida personalizado
import shutil
import os

# Directorio destino
DIST_DIR = PROJECT_ROOT / 'installer' / 'native' / 'bin' / 'win32' / 'brain'

# Crear directorio si no existe
DIST_DIR.mkdir(parents=True, exist_ok=True)

# Copiar archivos compilados al directorio correcto
SOURCE_DIR = PROJECT_ROOT / 'dist' / 'brain'
if SOURCE_DIR.exists():
    print(f"\n{'='*70}")
    print(f"Copiando archivos a: {DIST_DIR}")
    print(f"{'='*70}\n")
    
    # Limpiar destino
    if DIST_DIR.exists():
        for item in DIST_DIR.iterdir():
            if item.is_file():
                item.unlink()
            elif item.is_dir():
                shutil.rmtree(item)
    
    # Copiar todo
    for item in SOURCE_DIR.iterdir():
        dest_item = DIST_DIR / item.name
        if item.is_dir():
            shutil.copytree(item, dest_item, dirs_exist_ok=True)
        else:
            shutil.copy2(item, dest_item)
    
    print(f"[OK] Compilacion completada en: {DIST_DIR}\n")