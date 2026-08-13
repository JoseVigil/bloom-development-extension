#!/usr/bin/env python3
"""
Genera aitap_help.json y aitap_help.txt LOCALMENTE en installer/aitap/help/.

IMPORTANTE: a proposito NO escribe en installer/help/ (el directorio
compartido con nucleus/sentinel/metamorph/sensor). Esa es la convencion a la
que aitap deberia migrar eventualmente (ver installer/nucleus/scripts/build-darwin.sh:
`nucleus --json-help > installer/help/nucleus_help.json`), pero todavia no se
decidio como/cuando aitap entra al pipeline de build compartido. Hasta que se
decida, el output queda local para no ensuciar ese directorio con contenido
prematuro.

Para aitap, en vez de invocar un binario compilado, se captura render_help()
in-process (mismo truco que brain/core/system/help_docs_manager.py) para no
depender de subprocess ni de que el paquete este instalado como script global.

Uso:
    python scripts/generate_help.py
"""
import io
import sys
from contextlib import redirect_stdout
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
AITAP_ROOT = SCRIPT_DIR.parent
HELP_DIR = AITAP_ROOT / "help"

sys.path.insert(0, str(AITAP_ROOT / "src"))


def _capture(fn, *args, **kwargs) -> str:
    buf = io.StringIO()
    with redirect_stdout(buf):
        fn(*args, **kwargs)
    return buf.getvalue()


def main():
    from aitap.cli.help_renderer import render_help
    from aitap.commands import discover_commands

    registry = discover_commands()
    HELP_DIR.mkdir(parents=True, exist_ok=True)

    json_output = _capture(render_help, registry, json_mode=True, ai_native=True, full_help=True)
    (HELP_DIR / "aitap_help.json").write_text(json_output, encoding="utf-8")

    text_output = _capture(render_help, registry, json_mode=False, ai_native=False, full_help=True)
    (HELP_DIR / "aitap_help.txt").write_text(text_output, encoding="utf-8")

    print(f"OK: escrito {HELP_DIR / 'aitap_help.json'}")
    print(f"OK: escrito {HELP_DIR / 'aitap_help.txt'}")


if __name__ == "__main__":
    main()
