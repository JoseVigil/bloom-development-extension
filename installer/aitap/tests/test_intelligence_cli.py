import json
import os
import subprocess
import sys


def test_cli_invalid_request_is_machine_readable(tmp_path):
    request = tmp_path / 'invalid.json'
    request.write_text('{}')
    command = [sys.executable, '-B', '-m', 'aitap', '--json', 'route', 'supply',
               '--request', str(request), '--state-dir', str(tmp_path / 'accounting')]
    result = subprocess.run(command, capture_output=True, text=True, timeout=20)
    assert result.returncode == 1
    assert json.loads(result.stdout)['error']['code'] == 'INVALID_REQUEST'


def test_cli_help_exposes_supply():
    result = subprocess.run([sys.executable, '-B', '-m', 'aitap', '--json-help'],
                            capture_output=True, text=True, encoding='utf-8',timeout=20,
                            env={**os.environ, 'PYTHONIOENCODING':'utf-8'})
    assert result.returncode == 0
    assert 'supply' in result.stdout
    json.loads(result.stdout)
