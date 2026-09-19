import json

import pytest
from aitap.accounting.store import AccountingStore, digest
from aitap.providers.base import SupplyError


def test_journal_integrity_and_process_lock(tmp_path):
    store = AccountingStore(tmp_path)
    identity = digest("inference")
    with store.lock(identity):
        with pytest.raises(SupplyError):
            with store.lock(identity):
                pass
        store.write(identity, {"state": "completed"})
    assert store.read(identity) == {"state": "completed"}
    data = json.loads(store.path(identity).read_text())
    data["journal"]["state"] = "tampered"
    store.path(identity).write_text(json.dumps(data))
    with pytest.raises(SupplyError):
        store.read(identity)
