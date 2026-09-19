"""Explicitly enabled real provider smoke/replay. Never part of default tests.

The full acceptance E2E additionally requires a user-supplied Mandate, documents,
human decisions and a reviewed ING/DIS run. This test alone cannot close the Work.
"""
import os
from pathlib import Path

import pytest

from aitap.accounting.store import AccountingStore
from aitap.intelligence.service import IntelligenceService
from aitap.routing.engine import RoutingEngine
from test_intelligence_service import request


@pytest.mark.skipif(os.environ.get('AITAP_REAL_PROVIDER_OPT_IN') != '1', reason='Real provider requires explicit opt-in')
def test_real_provider_and_durable_replay():
    state = os.environ.get('AITAP_REAL_TEST_STATE_DIR')
    budget = int(os.environ.get('AITAP_REAL_TEST_MAX_OUTPUT_TOKENS', '0'))
    assert state and 1 <= budget <= 256, 'Explicit external evidence directory and output budget required'
    root = Path(__file__).resolve().parents[1]
    engine = RoutingEngine.from_files(root/'policies/genesis-runtime-intelligence-v2.json',
                                      root/'registry/genesis-pilot-v2.json')
    engine.policy['intelligence_supply'].update(max_attempts=1,max_output_tokens=budget)
    store = AccountingStore(state)
    first = IntelligenceService(engine,store).supply(request())
    assert first['outcome'] == 'completed' and first['provider'] == 'anthropic'
    assert IntelligenceService(engine,AccountingStore(state)).supply(request()) == first
    assert len(store.read(request()['logical_inference_id'])['attempts']) == 1
