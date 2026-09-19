"""Brain-owned durable CLI client. Never resolves credentials."""
import hashlib
import json
import os
import subprocess
import tempfile
from contextlib import contextmanager
from pathlib import Path


class SupplyError(ValueError):
    def __init__(self, code, stage, message=None):
        self.code, self.stage = code, stage
        super().__init__(message or code)

    def envelope(self):
        return {"status": "error", "error": {"code": self.code, "stage": self.stage,
            "message": str(self), "retryable": self.code in {
                "PROVIDER_TIMEOUT", "PROVIDER_RATE_LIMITED", "PROVIDER_UNAVAILABLE"}, "details": {}}}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def digest(value):
    return text_digest(canonical(value))


def text_digest(value):
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()


def read_json(path):
    try:
        return strict_json(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise SupplyError("STATE_CONFLICT", "read", "Required artifact absent or invalid") from None


def strict_json(text):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("Duplicate JSON key")
            result[key] = value
        return result
    return json.loads(text, object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite JSON")))


def atomic_text(path, text):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def persist(path, value):
    """Immutable checkpoint: exact replay is allowed, replacement is not."""
    path = Path(path)
    if path.exists():
        if digest(read_json(path)) != digest(value):
            raise SupplyError("STATE_CONFLICT", "persist", "Checkpoint content differs")
    else:
        atomic_text(path, canonical(value))


@contextmanager
def locked(path):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as stream:
        stream.seek(0, 2)
        if not stream.tell():
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
            raise SupplyError("STATE_CONFLICT", "lock", "Concurrent lifecycle operation") from None
        try:
            yield
        finally:
            stream.seek(0)
            if os.name == "nt":
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream, fcntl.LOCK_UN)


def make_request(state, phase, turn, payload, policy_version):
    input_digest = digest(payload)
    logical = digest([state["intent_id"], phase, str(turn), input_digest, policy_version])
    return {"schema_version": "cognituum.intelligence-supply/v1",
        "request_id": "isr-" + logical[7:39], "logical_inference_id": logical, "consumer_id": "brain",
        "intent": {"intent_id": state["intent_id"], "intent_type": state["intent_type"],
                   "mandate_id": state["mandate_id"], "phase": phase, "turn_id": str(turn)},
        "input_digest": input_digest, "payload": payload,
        "routing": {"mode": "policy", "policy_version": policy_version,
                    "required_capabilities": ["text.generate", "structured_output"], "privacy": "approved_cloud"}}


class IntelligenceSupplyClient:
    def __init__(self, command=None, runner=None):
        self.command = command or [os.environ.get("AITAP_BIN", "aitap")]
        self.runner = runner or subprocess.run

    def obtain(self, directory, request):
        directory = Path(directory)
        persist(directory / ".request.json", request)
        result_path = directory / ".supply_result.json"
        if result_path.exists():
            result = read_json(result_path)
        else:
            try:
                process = self.runner([*self.command, "--json", "route", "supply", "--request",
                                       str(directory / ".request.json")],
                    capture_output=True, text=True, encoding="utf-8", timeout=200)
                result = strict_json(process.stdout)
            except subprocess.TimeoutExpired:
                raise SupplyError("PROVIDER_TIMEOUT", "aitap") from None
            except (OSError, ValueError):
                raise SupplyError("INVALID_REQUEST", "aitap", "AITAP returned no transport envelope") from None
            if process.returncode or result.get("status") == "error":
                error = result.get("error", {})
                raise SupplyError(error.get("code", "INVALID_REQUEST"), error.get("stage", "aitap"))
        try:
            required = {"schema_version", "request_id", "logical_inference_id", "outcome", "routing_decision_id",
                        "routing_decision", "raw_response", "raw_response_digest", "usage", "provider", "model",
                        "latency_ms", "accounting_ref"}
            if set(result) != required:
                raise ValueError()
            if (result["schema_version"] != "cognituum.intelligence-supply-result/v1"
                    or result["request_id"] != request["request_id"]
                    or result["logical_inference_id"] != request["logical_inference_id"]
                    or result["outcome"] != "completed"
                    or result["raw_response_digest"] != text_digest(result["raw_response"])
                    or result["routing_decision"]["logical_inference_id"] != request["logical_inference_id"]
                    or result["routing_decision"]["routing_decision_id"] != result["routing_decision_id"]
                    or result["accounting_ref"] != "accounting://inference/" + request["logical_inference_id"][7:]
                    or result["routing_decision"]["policy_version"] != request["routing"]["policy_version"]
                    or result["provider"] != result["routing_decision"]["effective_intelligence"]["provider"]
                    or result["model"] != result["routing_decision"]["effective_intelligence"]["model"]
                    or type(result["latency_ms"]) is not int or result["latency_ms"] < 0):
                raise ValueError()
            for key in ("input_tokens", "output_tokens"):
                if type(result["usage"][key]) is not int or result["usage"][key] < 0:
                    raise ValueError()
        except (KeyError, TypeError, ValueError):
            raise SupplyError("RAW_RESPONSE_MISMATCH", "transport") from None
        persist(result_path, result)
        raw_path = directory / ".raw_response.txt"
        if raw_path.exists() and text_digest(raw_path.read_text(encoding="utf-8")) != result["raw_response_digest"]:
            raise SupplyError("RAW_RESPONSE_MISMATCH", "persist")
        if not raw_path.exists():
            atomic_text(raw_path, result["raw_response"])
        persist(directory / ".routing_decision.json", result["routing_decision"])
        return result
