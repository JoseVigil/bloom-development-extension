"""
Regression: on Windows with redirected stdout, importing brain.shared.context
after brain/__main__.py has wrapped stdout/stderr must not close the shared
buffer. JSON output must stay pure and UTF-8.
"""

import json
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]

SCRIPT = r"""
import gc, io, sys
import typer  # loaded with the real platform
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')  # as brain/__main__.py
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
before = (sys.stdout, sys.stderr)
real = sys.platform
sys.platform = 'win32'  # take the Windows branch of brain/shared/context.py
from brain.shared.context import GlobalContext
sys.platform = real
assert (sys.stdout, sys.stderr) == before, "streams must be reconfigured, not replaced"
gc.collect()
GlobalContext(json_mode=True).output({"status": "success", "texto": "año ñ — ✓"})
sys.stderr.write("stderr sigue abierto\n")
"""


def test_windows_branch_keeps_streams_open_and_json_utf8():
    proc = subprocess.run(
        [sys.executable, "-c", SCRIPT],
        cwd=REPO_ROOT,
        env={"PYTHONPATH": str(REPO_ROOT), "PATH": ""},
        capture_output=True,
    )
    assert proc.returncode == 0, proc.stderr.decode("utf-8", "replace")
    lines = proc.stdout.decode("utf-8").splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0]) == {"status": "success", "texto": "año ñ — ✓"}
    assert proc.stderr.decode("utf-8").splitlines() == ["stderr sigue abierto"]
