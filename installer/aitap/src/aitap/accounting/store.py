import hashlib
import json
import os
import re
import tempfile
from contextlib import contextmanager
from pathlib import Path

from aitap.providers.base import SupplyError


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def digest(value):
    return "sha256:" + hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def text_digest(value):
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def atomic_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write(canonical(value))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


@contextmanager
def file_lock(path):
    """OS-released process lock; stale PID files cannot block recovery."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as stream:
        stream.seek(0, 2)
        if stream.tell() == 0:
            stream.write(b"0")
            stream.flush()
        stream.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            raise SupplyError("STATE_CONFLICT", "lock", "Another process owns the inference") from None
        try:
            yield
        finally:
            stream.seek(0)
            if os.name == "nt":
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream, fcntl.LOCK_UN)


class AccountingStore:
    def __init__(self, root):
        self.root = Path(root).resolve()

    def path(self, identity):
        if not re.fullmatch(r"sha256:[0-9a-f]{64}", identity):
            raise SupplyError("INVALID_REQUEST", "accounting")
        return self.root / (identity[7:] + ".json")

    def lock(self, identity):
        return file_lock(self.path(identity).with_suffix(".lock"))

    def read(self, identity):
        path = self.path(identity)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data["journal_digest"] != digest(data["journal"]):
                raise ValueError()
            return data["journal"]
        except (OSError, ValueError, KeyError, TypeError):
            raise SupplyError("STATE_CONFLICT", "accounting", "Invalid durable journal") from None

    def write(self, identity, journal):
        try:
            atomic_json(self.path(identity), {"journal": journal, "journal_digest": digest(journal)})
        except OSError:
            raise SupplyError("ACCOUNTING_PERSIST_FAILED", "accounting") from None
