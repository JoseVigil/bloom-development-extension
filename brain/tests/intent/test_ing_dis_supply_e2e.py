"""Real subprocess/HTTP/restart test; the remote provider is explicitly controlled."""
import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from brain.core.intelligence_supply import persist, read_json
from brain.core.intent_state_manager import IntentStateManager
from test_ing_lifecycle import setup_lifecycle, cluster


AITAP_BOOTSTRAP = r'''
import os, subprocess, sys
from aitap.providers.anthropic import AnthropicProvider
from aitap.vault.client import VaultClient
AnthropicProvider.endpoint = os.environ['CONTROLLED_PROVIDER_URL']
original = VaultClient.__init__
def initialize(self, *args, **kwargs):
    original(self, *args, **kwargs)
    def run(command, **options):
        script = "import json,sys; assert sys.argv[1:] == ['--json','vault','request','anthropic-key:default']; print(json.dumps({'key_id':'anthropic-key:default','key':'controlled-test-secret'}))"
        return subprocess.run([sys.executable, '-B', '-c', script, *command[1:]], **options)
    self.runner = run
VaultClient.__init__ = initialize
from aitap.__main__ import main
main()
'''

BRAIN_WORKER = r'''
import json, os, sys
from pathlib import Path
from brain.core.intelligence_supply import IntelligenceSupplyClient, read_json
from brain.core.intent.genesis_intelligence import GenesisIntelligence
client = IntelligenceSupplyClient(command=[sys.executable, '-B', '-c', os.environ['AITAP_BOOTSTRAP']])
original = client.obtain
def obtain(directory, request):
    result = original(directory, request)
    if os.environ.get('CRASH_AFTER_RAW') == '1':
        os._exit(71)
    return result
client.obtain = obtain
root, index, operation = sys.argv[1:]
flow = GenesisIntelligence(root, index, client)
if operation == 'approve':
    value = flow.run(decisions=[{'cluster_id':'c1','human_decision':'approved'}])
elif operation == 'mapping':
    value = flow.run(ing_result=Path(root).parent/'ing'/'ing_result.json')
else:
    value = flow.run()
print(json.dumps(value))
'''


def test_ing_dis_subprocess_http_crash_and_replay(tmp_path):
    lifecycle, _, _ = setup_lifecycle(tmp_path)
    calls = []
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            assert self.headers['x-api-key'] == 'controlled-test-secret'
            request = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
            payload = json.loads(request['messages'][0]['content'])
            calls.append(payload)
            if 'inventory' in payload['context']:
                response = {'clusters': [cluster()]}
            else:
                domain_id = next(iter(payload['context']['graph_snapshot']['domains']))
                response = {'operations': [{'type':'rename_domain',
                    'proposal':{'domain_id':domain_id,'new_name':'Reviewed knowledge'},
                    'evidence':{'reason':'Controlled source evidence'},'human_decision':None,'override':None}]}
            body = json.dumps({'model':request['model'],'stop_reason':'end_turn',
                'content':[{'type':'text','text':json.dumps(response)}],
                'usage':{'input_tokens':30,'output_tokens':60}}).encode()
            self.send_response(200)
            self.send_header('Content-Type','application/json')
            self.send_header('Content-Length',str(len(body)))
            self.send_header('request-id','controlled-' + str(len(calls)))
            self.end_headers()
            self.wfile.write(body)
    server = ThreadingHTTPServer(('127.0.0.1',0),Handler)
    thread = threading.Thread(target=server.serve_forever,daemon=True)
    thread.start()
    env = {**os.environ, 'CONTROLLED_PROVIDER_URL':f'http://127.0.0.1:{server.server_port}/v1/messages',
           'AITAP_BOOTSTRAP':AITAP_BOOTSTRAP, 'AITAP_STATE_DIR':str(tmp_path/'aitap-state'),
           'PYTHONDONTWRITEBYTECODE':'1'}
    def run(root, operation, crash=False):
        child = subprocess.run([sys.executable,'-B','-c',BRAIN_WORKER,str(root),str(lifecycle.index),operation],
            capture_output=True,text=True,encoding='utf-8',env={**env,'CRASH_AFTER_RAW':'1' if crash else '0'},timeout=45)
        if crash:
            assert child.returncode == 71, child.stderr
            return
        assert child.returncode == 0, child.stderr + child.stdout
        return json.loads(child.stdout)
    try:
        run(lifecycle.root,'classify',crash=True)
        assert len(calls) == 1
        assert run(lifecycle.root,'classify')['status'] == 'awaiting_human_decision'
        completed = run(lifecycle.root,'approve')
        assert completed['status'] == 'done'
        assert run(lifecycle.root,'resume') == completed
        dis_root = tmp_path/'dis'
        IntentStateManager.create(dis_root,'dis','MND-CONTROLLED')
        before = lifecycle.index.read_bytes()
        mapping = run(dis_root,'mapping')
        assert len(mapping['operations']) == 1
        assert mapping['operations'][0]['human_decision'] is None
        assert run(dis_root,'mapping') == mapping
        assert len(calls) == 2
        assert lifecycle.index.read_bytes() == before
        assert IntentStateManager.load(dis_root).phase_active == 'mapping'
        journals = list((tmp_path/'aitap-state').glob('*.json'))
        assert len(journals) == 2
        assert all(len(read_json(p)['journal']['attempts']) == 1 for p in journals)
        assert all('controlled-test-secret' not in p.read_text() for p in journals)
        persist(tmp_path/'controlled-evidence.json',{'provider':'controlled HTTP server, not Anthropic',
            'ing_result':completed,'mapping_proposal':mapping,'provider_calls':len(calls),
            'restart_after_raw':True,'replay_identical':True,'secrets_in_journals':False})
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
