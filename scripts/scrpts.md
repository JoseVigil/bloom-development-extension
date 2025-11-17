README: Herramientas para Gestión de Codebase
Metadata del Artifact:

Versión: 1.0
Fecha: 16 de noviembre de 2025
Propósito: Documento técnico para scripts de gestión de codebase en VSCode extensions.

Scripts en Python 3.x para reconciliación de codebases en plugins VSCode con actualizaciones IA. Usan módulos estándar: os, shutil, argparse, hashlib, difflib. Portables en Windows/Linux/macOS.
1. generate_codebase.py
Funcionalidad
Genera snapshot Markdown de directorio:

Preámbulo.
Índice jerárquico (os.walk-based).
Por archivo: path como header, metadatos (lenguaje por ext, MD5 hash), contenido en code block.
Modo diff: compara dirs, diffs con difflib.ndiff, índices/contenidos de ambos.

Ignora hidden files y output file. Maneja UTF-8/latin-1.
Uso Técnico
Argumentos (argparse):

--dir / posicional: root dir (default: .).
--output / posicional: Markdown out (default: codebase_{basename}.md).
--diff: segundo dir para comparación.

Ejemplos:
python generate_codebase.py src/ codebase.md  # Snapshot simple
python generate_codebase.py src_orig/ --diff src_upd/ diff.md  # Con diff
Interno:

Parse args, priorizando flags.
collect_files(): dict rel_path:content via os.walk.
generate_index(): lista MD jerárquica.
write_contents(): MD con headers, metadatos, code blocks.
Diff: sets para paths, ndiff para mods.

Output extracto:
Snapshot de Codebase
Índice de Archivos

commands/
changeIntentStatus.ts


Contenidos de Archivos
commands/changeIntentStatus.ts
Metadatos: Lenguaje: typescript, Hash MD5: abc123...
// Código aquí...
Notas: Debug prints, errores si dirs inválidos. Extensible vía LANGUAGE_MAP.
2. sync_codebase.py
Funcionalidad
Copia origen a destino con overwrite. --sync: elimina extras en dest (mirror). Preserva metadata (shutil.copy2). Logging de acciones. Dry-run para simulación.
Uso Técnico
Argumentos:

--origin: source dir (req).
--dest: target dir (req).
--sync: bool, elimina no en origin.
--dry-run: bool, simula.

Ejemplos:
python sync_codebase.py --origin src_orig/ --dest src_dest/  # Overwrite
python sync_codebase.py --origin src_orig/ --dest src_dest/ --sync  # Mirror
Interno:

os.walk(origin) para copy/create dirs.
Si sync: set origin_paths, os.walk(dest, topdown=False) para remove/rmtree extras.
logging.basicConfig(INFO).

Logging ejemplo:
2025-11-16 22:02:00 - INFO - Copiado/Sobrescrito: /dest/commands/file.ts
2025-11-16 22:02:02 - INFO - Eliminado: /dest/extra.ts
Notas: Errores si dirs inválidos. Recomendar backups para --sync.
Integración VSCode
En extension.ts:
vscode.commands.registerCommand('generateCodebase', () => {
child_process.exec(python generate_codebase.py ${workspace.uri.fsPath}/src codebase.md);
});
Similar para sync. Útil en workflows IA: snapshot pre/post-sync.