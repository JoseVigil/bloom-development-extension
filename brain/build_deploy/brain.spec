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
    'brain.commands.chrome.chrome',
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
    'brain.commands.runtime.run',
    'brain.commands.service.service',
    'brain.commands.synapse.synapse_host_cli',
    'brain.commands.system.info',
    'brain.commands.twitter.auth',
    'brain.core',
    'brain.core.bloom_project_inspector',
    'brain.core.chrome',
    'brain.core.chrome.log_reader',
    'brain.core.chrome.mining_log_reader',
    'brain.core.chrome.net_log_analyzer',
    'brain.core.context',
    'brain.core.context.detector',
    'brain.core.context.generate',
    'brain.core.context.manager',
    'brain.core.context.strategies.android',
    'brain.core.context.strategies.cicd',
    'brain.core.context.strategies.cpp',
    'brain.core.context.strategies.dotnet',
    'brain.core.context.strategies.flutter',
    'brain.core.context.strategies.go',
    'brain.core.context.strategies.iac',
    'brain.core.context.strategies.ios',
    'brain.core.context.strategies.jvm',
    'brain.core.context.strategies.macos',
    'brain.core.context.strategies.php',
    'brain.core.context.strategies.python',
    'brain.core.context.strategies.ruby',
    'brain.core.context.strategies.rust',
    'brain.core.context.strategies.typescript',
    'brain.core.context.strategy_base',
    'brain.core.context.strategy_loader',
    'brain.core.context_planning.enriched_tree_generator',
    'brain.core.context_planning.gemini_router',
    'brain.core.context_planning.payload_builder',
    'brain.core.download_manager',
    'brain.core.extension',
    'brain.core.extension.manager',
    'brain.core.filesystem',
    'brain.core.filesystem.code_compressor',
    'brain.core.filesystem.files_compressor',
    'brain.core.filesystem.files_extractor',
    'brain.core.filesystem.tree_manager',
    'brain.core.git',
    'brain.core.git.executor',
    'brain.core.git.repository',
    'brain.core.github',
    'brain.core.github.api_client',
    'brain.core.github.models',
    'brain.core.health',
    'brain.core.health.dev_environment_manager',
    'brain.core.health.full_stack_manager',
    'brain.core.health.native_host_manager',
    'brain.core.health.onboarding_status_manager',
    'brain.core.health.websocket_status_manager',
    'brain.core.intent.merge_manager',
    'brain.core.intent.recovery_manager',
    'brain.core.intent.response_parser',
    'brain.core.intent.staging_manager',
    'brain.core.intent.validation_manager',
    'brain.core.intent_manager',
    'brain.core.nucleus_inspector',
    'brain.core.nucleus_manager',
    'brain.core.profile',
    'brain.core.profile.logic',
    'brain.core.profile.logic.chrome_resolver',
    'brain.core.profile.logic.profile_store',
    'brain.core.profile.logic.synapse_handler',
    'brain.core.profile.path_resolver',
    'brain.core.profile.profile_accounts',
    'brain.core.profile.profile_create',
    'brain.core.profile.profile_launcher',
    'brain.core.profile.profile_manager',
    'brain.core.profile.web',
    'brain.core.profile.web.discovery_generator',
    'brain.core.profile.web.landing_generator',
    'brain.core.profile.web.templates',
    'brain.core.profile.web.templates.discovery',
    'brain.core.profile.web.templates.landing',
    'brain.core.project',
    'brain.core.project.clone_manager',
    'brain.core.project.linker',
    'brain.core.project.models',
    'brain.core.project.scanner',
    'brain.core.project_manager',
    'brain.core.service.server_manager',
    'brain.core.synapse',
    'brain.core.synapse.synapse_exceptions',
    'brain.core.synapse.synapse_manager',
    'brain.core.synapse.synapse_protocol',
    'brain.core.system',
    'brain.core.system.info_manager',
    'brain.core.twitter.auth_manager',
]

# Datos adicionales que deben incluirse (configs, templates, etc.)
templates_src = PROJECT_ROOT / 'brain' / 'core' / 'profile' / 'web' / 'templates'

datas = [
    (str(PROJECT_ROOT / 'brain' / 'VERSION'), '.'),
    
    # Templates - Discovery
    (str(templates_src / 'discovery' / '__init__.py'), 'brain/core/profile/web/templates/discovery'),
    (str(templates_src / 'discovery' / 'index.html'), 'brain/core/profile/web/templates/discovery'),
    (str(templates_src / 'discovery' / 'script.js'), 'brain/core/profile/web/templates/discovery'),
    (str(templates_src / 'discovery' / 'styles.css'), 'brain/core/profile/web/templates/discovery'),
    (str(templates_src / 'discovery' / 'content-aistudio.js'), 'brain/core/profile/web/templates/discovery'),
    (str(templates_src / 'discovery' / 'discovery.js'), 'brain/core/profile/web/templates/discovery'),
    (str(templates_src / 'discovery' / 'discoveryProtocol.js'), 'brain/core/profile/web/templates/discovery'),
    (str(templates_src / 'discovery' / 'onboarding.js'), 'brain/core/profile/web/templates/discovery'),
    
    # Templates - Landing
    (str(templates_src / 'landing' / '__init__.py'), 'brain/core/profile/web/templates/landing'),
    (str(templates_src / 'landing' / 'index.html'), 'brain/core/profile/web/templates/landing'),
    (str(templates_src / 'landing' / 'data-loader.js'), 'brain/core/profile/web/templates/landing'),
    (str(templates_src / 'landing' / 'landing.js'), 'brain/core/profile/web/templates/landing'),
    (str(templates_src / 'landing' / 'landingProtocol.js'), 'brain/core/profile/web/templates/landing'),
    (str(templates_src / 'landing' / 'styles.css'), 'brain/core/profile/web/templates/landing'),
    
    # Templates - Base __init__.py
    (str(templates_src / '__init__.py'), 'brain/core/profile/web/templates'),
]

# Forzar la estructura física de core/profile para evitar el bug de colisión de nombres
core_profile_src = PROJECT_ROOT / 'brain' / 'core' / 'profile'

datas.extend([
    (str(core_profile_src / '__init__.py'), 'brain/core/profile'),
    (str(core_profile_src / 'profile_manager.py'), 'brain/core/profile'),
    (str(core_profile_src / 'profile_launcher.py'), 'brain/core/profile'),
    (str(core_profile_src / 'path_resolver.py'), 'brain/core/profile'),
    # No olvides la lógica interna y web (si no PyInstaller los ignorará)
    (str(core_profile_src / 'logic' / '__init__.py'), 'brain/core/profile/logic'),
    (str(core_profile_src / 'logic' / 'profile_store.py'), 'brain/core/profile/logic'),
    (str(core_profile_src / 'logic' / 'chrome_resolver.py'), 'brain/core/profile/logic'),
    (str(core_profile_src / 'logic' / 'synapse_handler.py'), 'brain/core/profile/logic'),
    (str(core_profile_src / 'web' / '__init__.py'), 'brain/core/profile/web'),
    (str(core_profile_src / 'web' / 'discovery_generator.py'), 'brain/core/profile/web'),
    (str(core_profile_src / 'web' / 'landing_generator.py'), 'brain/core/profile/web'),
])

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
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch='x86_64', 
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=False,
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