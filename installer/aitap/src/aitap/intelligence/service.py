import json
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path

from jsonschema import Draft202012Validator

from aitap.accounting.store import AccountingStore, canonical, digest, text_digest
from aitap.providers.anthropic import AnthropicProvider
from aitap.providers.base import SupplyError
from aitap.routing.engine import RoutingError
from aitap.runtime_paths import resource_root
from aitap.vault.client import VaultClient


ROOT = resource_root()


def validate_contract(name, value):
    schema = json.loads((ROOT / "contracts" / "v2" / name).read_text(encoding="utf-8"))
    if next(Draft202012Validator(schema).iter_errors(value), None):
        raise SupplyError("INVALID_REQUEST", "envelope", "Transport schema validation failed")


class LocalSupplyContext:
    """Dependencias de la ruta ``privacy: local``. Se resuelven solo ante un pedido local.

    - politica de acceso: siempre la empaquetada (no hay override por CLI);
    - elegibilidad: veredicto estable del catalogo para el modelo del backend;
    - proveedor: Ollama en el host loopback observado por el colector.
    """

    def __init__(self, *, access_policy=None, provider=None, eligibility=None, catalog=None,
                 collector=None, base=None, clock=time.time):
        self._access, self._provider, self._eligibility = access_policy, provider, eligibility
        self._catalog, self._collector, self._base, self._observed = catalog, collector, base, None
        self.clock = clock

    def catalog(self):
        if self._catalog is None:
            from aitap.local.catalog import load_catalog
            self._catalog = load_catalog()
        return self._catalog

    def observed(self):
        if self._observed is None:
            from aitap.local.catalog import bloom_base_dir
            from aitap.local.preflight import default_collector
            self._observed = (self._collector or default_collector())(self._base or bloom_base_dir())
        return self._observed

    def access_policy(self):
        if self._access is None:
            from aitap.access.policy import AccessPolicyError, load_access_policy
            try:
                self._access = load_access_policy(self.catalog())
            except AccessPolicyError as exc:
                raise SupplyError("INVALID_REQUEST", "access", str(exc)) from None
        return self._access

    def provider(self):
        if self._provider is None:
            from aitap.providers.ollama import OllamaProvider
            self._provider = OllamaProvider(self.observed().get("ollama_host"))
        return self._provider

    def verdict(self, backend):
        """Veredicto estable (APTO, APTO_CON_SALVEDADES o BLOQUEADO) del modelo del backend."""
        if self._eligibility is not None:
            return self._eligibility(backend)
        from aitap.local.preflight import common
        catalog = self.catalog()
        model = next((m for m in catalog.models if m["backend"]["backend_id"] == backend["backend_id"]), None)
        if model is None or model["runtime"] != "ollama" or model["source"].get("ollama_ref") != backend["model"]:
            return {"verdict": "BLOQUEADO", "reasons": ["MODEL_NOT_IN_CATALOG"]}
        return common.evaluate_model(model, self.observed()["stable"], catalog, [model["model_id"]])


class IntelligenceService:
    def __init__(self, engine, store, vault=None, provider=None, local=None):
        self.engine, self.store = engine, store
        self.vault, self.provider = vault or VaultClient(), provider or AnthropicProvider()
        self.local = local or LocalSupplyContext()

    def supply(self, request):
        validate_contract("intelligence-supply-request.schema.json", request)
        if request["routing"]["privacy"] == "local":
            # privacy local es un techo: esta rama nunca llega a Vault ni a un proveedor de nube.
            return self._supply_local(request)
        rule = self.engine.policy["intelligence_supply"]
        budget = rule.get("budget")
        if request["intent"]["intent_type"] == "gen":
            try:
                ceiling = Decimal(str(budget["max_usd"]))
                if (budget.get("per_mandate") is not True or not ceiling.is_finite()
                        or not Decimal(0) < ceiling <= Decimal(1)
                        or type(budget["max_total_tokens"]) is not int
                        or not 1 <= budget["max_total_tokens"] <= 50000
                        or budget.get("max_inferences") != 1
                        or rule["max_attempts"] != 1 or rule.get("fallback")
                        or type(rule["max_output_tokens"]) is not int
                        or not 1 <= rule["max_output_tokens"] <= 8192):
                    raise ValueError()
            except (KeyError, TypeError, ValueError, ArithmeticError):
                raise SupplyError("INVALID_REQUEST", "budget", "Explicit Mandate gen budget required") from None
        if budget and (request["intent"]["mandate_id"] == budget.get("mandate_id")
                       or (budget.get("per_mandate") is True and request["intent"]["intent_type"] == "gen")):
            store = AccountingStore(self.store.root / "budgets")
            identity = digest(["budget", request["intent"]["mandate_id"]])
            with store.lock(identity):
                return self._supply(request, (store, identity, budget))
        return self._supply(request)

    def _reserve(self, context, request, backend, rule, secret):
        store, identity, limits = context
        try:
            ceiling = Decimal(str(limits["max_usd"]))
            if (not ceiling.is_finite() or not Decimal(0) < ceiling <= Decimal(1)
                    or type(limits["max_total_tokens"]) is not int or not 1 <= limits["max_total_tokens"] <= 50000
                    or type(limits["max_inferences"]) is not int or not 1 <= limits["max_inferences"] <= 2
                    or type(limits.get("input_margin_tokens", 1024)) is not int
                    or not 0 <= limits.get("input_margin_tokens", 1024) <= 4096):
                raise ValueError()
        except (KeyError, ArithmeticError, ValueError, TypeError):
            raise SupplyError("INVALID_REQUEST", "budget", "Invalid approved budget ceiling") from None
        if rule["max_attempts"] != 1 or rule.get("fallback"):
            raise SupplyError("INVALID_REQUEST", "budget", "Budgeted E2E forbids retries and failover")
        rates = backend.get("cost_per_million_tokens_usd")
        if not rates or any(Decimal(str(rates[k])) <= 0 for k in ("input", "output")):
            raise SupplyError("INVALID_REQUEST", "budget", "Approved tariff required")
        document = store.read(identity) or {"limits": limits, "reservations": {}}
        if document.get("halted"):
            raise SupplyError("BUDGET_EXCEEDED", "budget", "Budget halted after unexpected provider usage")
        if document["limits"] != limits:
            raise SupplyError("STATE_CONFLICT", "budget", "Durable budget limits cannot change")
        inference = request["logical_inference_id"]
        if inference in document["reservations"]:
            raise SupplyError("STATE_CONFLICT", "budget", "Existing reservation requires reconciliation")
        if len(document["reservations"]) >= limits["max_inferences"]:
            raise SupplyError("BUDGET_EXCEEDED", "budget")
        for previous_id in document["reservations"]:
            previous = self.store.read(previous_id)
            if not previous or previous.get("state") != "completed":
                raise SupplyError("STATE_CONFLICT", "budget", "Prior reservation is unresolved; reconciliation required")
        count = self.provider.count_input_tokens(payload=request["payload"], model=backend["model"],
                                                secret=secret, timeout=rule["timeout_seconds"])
        if type(count) is not int or count < 0:
            raise SupplyError("TOKEN_COUNT_FAILED", "budget")
        # Count API estimates can differ from generation usage. Reserve a margin,
        # retain reservations after success/failure, and never recycle uncertain spend.
        reserved_input = count + limits.get("input_margin_tokens", 1024)
        tokens = reserved_input + rule["max_output_tokens"]
        usd = (Decimal(reserved_input) * Decimal(str(rates["input"])) +
               Decimal(rule["max_output_tokens"]) * Decimal(str(rates["output"]))) / Decimal(1000000)
        entries = list(document["reservations"].values())
        if (len(entries) >= limits["max_inferences"]
                or sum(e["tokens"] for e in entries) + tokens > limits["max_total_tokens"]
                or sum((Decimal(e["usd"]) for e in entries), Decimal(0)) + usd > Decimal(str(limits["max_usd"]))):
            raise SupplyError("BUDGET_EXCEEDED", "budget")
        reservation = {"tokens": tokens, "usd": str(usd), "counted_input_tokens": count,
                       "reserved_input_tokens": reserved_input, "max_output_tokens": rule["max_output_tokens"],
                       "provider": backend["provider"], "model": backend["model"]}
        document["reservations"][inference] = reservation
        store.write(identity, document)
        return reservation

    def _supply(self, request, budget_context=None):
        if digest(request["payload"]) != request["input_digest"]:
            raise SupplyError("INPUT_DIGEST_MISMATCH", "envelope")
        intent = request["intent"]
        expected = digest([intent["intent_id"], intent["phase"], intent["turn_id"],
                           request["input_digest"], request["routing"]["policy_version"]])
        if expected != request["logical_inference_id"]:
            raise SupplyError("STATE_CONFLICT", "envelope", "Logical inference identity mismatch")
        identity = request["logical_inference_id"]
        binding = digest({k: v for k, v in request.items() if k != "request_id"})
        with self.store.lock(identity):
            journal = self.store.read(identity)
            if journal and journal["request_digest"] != binding:
                raise SupplyError("INPUT_DIGEST_MISMATCH", "journal")
            if journal and journal["state"] == "completed":
                result = journal["result"]
                validate_contract("intelligence-supply-result.schema.json", result)
                if text_digest(result["raw_response"]) != result["raw_response_digest"]:
                    raise SupplyError("RAW_RESPONSE_MISMATCH", "journal")
                return {**result, "request_id": request["request_id"]}
            if journal and journal["state"] == "in_flight":
                # A crash may occur after remote acceptance, before local persistence.
                # No provider idempotency guarantee: never silently bill a second call.
                raise SupplyError("STATE_CONFLICT", "journal", "Remote outcome uncertain; reconciliation required")
            if journal and journal["state"] == "failed":
                error = journal["error"]
                raise SupplyError(error["code"], error["stage"], error["message"],
                                  uncertain=error["details"].get("delivery_uncertain", False))
            try:
                routes = self.engine.supply_routes(request)
            except RoutingError:
                raise SupplyError("NO_ELIGIBLE_ROUTE", "routing") from None
            rule = self.engine.policy["intelligence_supply"]
            attempts_limit = rule["max_attempts"]
            if type(attempts_limit) is not int or not 1 <= attempts_limit <= 3:
                raise SupplyError("INVALID_REQUEST", "policy")
            if (type(rule["max_output_tokens"]) is not int or not 1 <= rule["max_output_tokens"] <= 8192
                    or not 1 <= rule["timeout_seconds"] <= 120
                    or len(canonical(request["payload"]).encode("utf-8")) > rule.get("max_input_bytes", 131072)):
                raise SupplyError("INVALID_REQUEST", "policy", "Inference exceeds policy bounds")
            journal = journal or {"schema_version": "cognituum.inference-accounting/v1",
                "logical_inference_id": identity, "request_digest": binding,
                "consumer_id": request["consumer_id"], "intent": intent,
                "input_digest": request["input_digest"], "attempts": [], "state": "pending"}
            self.store.write(identity, journal)
            for number in range(len(journal["attempts"]), attempts_limit):
                route = routes[min(number, len(routes) - 1)]
                backend = route["effective_intelligence"]
                try:
                    purpose = ("mandate_gen_intelligence" if budget_context
                               and intent["intent_type"] == "gen" and intent["phase"] == "generation"
                               else "mandate_genesis_intelligence" if budget_context
                               and intent["intent_type"] == "ing" and intent["phase"] == "classification" else None)
                    secret = self.vault.resolve(backend["credential_ref"], purpose=purpose)
                except SupplyError as exc:
                    journal.update(state="failed", error=exc.envelope()["error"])
                    self.store.write(identity, journal)
                    raise
                attempt = {"number": number + 1, "routing_decision": route,
                    "started_at": datetime.now(timezone.utc).isoformat(), "outcome": "in_flight"}
                if budget_context:
                    try:
                        attempt["budget_reservation"] = self._reserve(budget_context, request, backend, rule, secret)
                    except SupplyError as exc:
                        secret = None
                        journal.update(state="failed", error=exc.envelope()["error"])
                        self.store.write(identity, journal)
                        raise
                journal["attempts"].append(attempt)
                journal["state"] = "in_flight"
                self.store.write(identity, journal)
                start = time.monotonic()
                try:
                    output = self.provider.generate(payload=request["payload"], model=backend["model"],
                        secret=secret, max_tokens=rule["max_output_tokens"], timeout=rule["timeout_seconds"])
                except SupplyError as exc:
                    attempt.update(outcome="error", error=exc.envelope()["error"],
                                   finished_at=datetime.now(timezone.utc).isoformat(),
                                   latency_ms=int((time.monotonic() - start) * 1000))
                    can_retry = exc.retryable and not exc.uncertain and number + 1 < attempts_limit
                    journal.update(state="pending" if can_retry else "failed", error=exc.envelope()["error"])
                    self.store.write(identity, journal)
                    if can_retry:
                        time.sleep(min(rule.get("retry_delay_seconds", 1), 10))
                        continue
                    raise
                finally:
                    secret = None
                latency = int((time.monotonic() - start) * 1000)
                result = {"schema_version": "cognituum.intelligence-supply-result/v1",
                    "request_id": request["request_id"], "logical_inference_id": identity,
                    "routing_decision_id": route["routing_decision_id"], "routing_decision": route,
                    "provider": backend["provider"], "model": output.model,
                    "raw_response": output.raw_response, "raw_response_digest": text_digest(output.raw_response),
                    "usage": {"input_tokens": output.input_tokens, "output_tokens": output.output_tokens},
                    "latency_ms": latency, "accounting_ref": "accounting://inference/" + identity[7:],
                    "outcome": "completed"}
                validate_contract("intelligence-supply-result.schema.json", result)
                if output.model != backend["model"]:
                    raise SupplyError("RAW_RESPONSE_MISMATCH", "provider")
                rates = backend.get("cost_per_million_tokens_usd")
                cost = None if rates is None else (
                    output.input_tokens * rates["input"] + output.output_tokens * rates["output"]) / 1000000
                attempt.update(outcome="completed", usage=result["usage"], latency_ms=latency,
                               cost_usd=cost, cost_status="unconfigured" if rates is None else "calculated",
                               provider_request_id=output.provider_request_id,
                               finished_at=datetime.now(timezone.utc).isoformat())
                journal.update(state="completed", result=result)
                if budget_context:
                    reservation = attempt["budget_reservation"]
                    if (output.input_tokens > reservation["reserved_input_tokens"]
                            or output.output_tokens > reservation["max_output_tokens"]):
                        error = SupplyError("BUDGET_EXCEEDED", "accounting", "Provider usage exceeded reservation")
                        journal.update(state="failed", error=error.envelope()["error"])
                        self.store.write(identity, journal)
                        budget_store, budget_id, _ = budget_context
                        budget_document = budget_store.read(budget_id)
                        budget_document["halted"] = True
                        budget_store.write(budget_id, budget_document)
                        raise error
                self.store.write(identity, journal)
                return result
            raise SupplyError("STATE_CONFLICT", "journal", "Retry budget exhausted")

    # ------------------------------------------------------------------ ruta local (Ollama)

    def _identity(self, request):
        if digest(request["payload"]) != request["input_digest"]:
            raise SupplyError("INPUT_DIGEST_MISMATCH", "envelope")
        intent = request["intent"]
        expected = digest([intent["intent_id"], intent["phase"], intent["turn_id"],
                           request["input_digest"], request["routing"]["policy_version"]])
        if expected != request["logical_inference_id"]:
            raise SupplyError("STATE_CONFLICT", "envelope", "Logical inference identity mismatch")
        return request["logical_inference_id"], digest({k: v for k, v in request.items() if k != "request_id"})

    def _replay(self, request, journal, binding):
        """Estado durable previo. Devuelve el resultado guardado o levanta; None si no hay journal."""
        if not journal:
            return None
        if journal["request_digest"] != binding:
            raise SupplyError("INPUT_DIGEST_MISMATCH", "journal")
        if journal["state"] == "completed":
            result = journal["result"]
            validate_contract("intelligence-supply-result.schema.json", result)
            if text_digest(result["raw_response"]) != result["raw_response_digest"]:
                raise SupplyError("RAW_RESPONSE_MISMATCH", "journal")
            return {**result, "request_id": request["request_id"]}
        if journal["state"] == "in_flight":
            raise SupplyError("STATE_CONFLICT", "journal", "Remote outcome uncertain; reconciliation required")
        if journal["state"] == "failed":
            error = journal["error"]
            failed = SupplyError(error["code"], error["stage"], error["message"],
                                 uncertain=error["details"].get("delivery_uncertain", False))
            failed.retryable = False
            raise failed
        raise SupplyError("STATE_CONFLICT", "journal", "Unexpected local journal state")

    def _reserve_local(self, request, rule, input_bound):
        """Presupuesto por Mandate en tokens (costo local cero). Chequeo previo: sin journal."""
        limits = rule["budget"]
        store = AccountingStore(self.store.root / "budgets")
        identity = digest(["budget", request["intent"]["mandate_id"]])
        inference = request["logical_inference_id"]
        tokens = input_bound + rule["max_output_tokens"]
        with store.lock(identity):
            document = store.read(identity) or {"limits": limits, "reservations": {}}
            if document.get("halted"):
                raise SupplyError("BUDGET_EXCEEDED", "budget", "Budget halted after unexpected usage")
            if document["limits"] != limits:
                raise SupplyError("STATE_CONFLICT", "budget", "Durable budget limits cannot change")
            if inference in document["reservations"]:
                raise SupplyError("STATE_CONFLICT", "budget", "Existing reservation requires reconciliation")
            for previous_id in document["reservations"]:
                previous = self.store.read(previous_id)
                if not previous or previous.get("state") != "completed":
                    raise SupplyError("STATE_CONFLICT", "budget", "Prior reservation is unresolved; reconciliation required")
            entries = list(document["reservations"].values())
            if (len(entries) + 1 > limits["max_inferences"]
                    or sum(e["tokens"] for e in entries) + tokens > limits["max_total_tokens"]):
                raise SupplyError("BUDGET_EXCEEDED", "budget")
            reservation = {"tokens": tokens, "usd": "0", "reserved_input_tokens": input_bound,
                           "max_output_tokens": rule["max_output_tokens"], "provider": "ollama"}
            document["reservations"][inference] = reservation
            store.write(identity, document)
        return reservation, (store, identity)

    def _supply_local(self, request):
        from aitap.access import enforcement

        identity, binding = self._identity(request)
        intent = request["intent"]
        with self.store.lock(identity):
            # 1. Estado durable antes de cualquier llamada: in_flight -> STATE_CONFLICT sin tocar Ollama.
            replay = self._replay(request, self.store.read(identity), binding)
            if replay is not None:
                return replay
            # 2. Ruteo: sólo backends privacy local servidos por Ollama; la politica local se valida.
            try:
                routes = self.engine.supply_routes(request)
            except RoutingError:
                raise SupplyError("NO_ELIGIBLE_ROUTE", "routing") from None
            route, rule = routes[0], self.engine.policy["intelligence_supply"]
            backend = route["effective_intelligence"]
            if self.engine.policy_sha256 is None or self.engine.registry_sha256 is None:
                raise SupplyError("INVALID_REQUEST", "configuration", "Local supply requires file-backed policy and registry")
            input_bytes = len(canonical(request["payload"]).encode("utf-8"))
            if input_bytes > rule["max_input_bytes"]:
                raise SupplyError("INVALID_REQUEST", "policy", "Inference exceeds policy bounds")
            # 3. Acceso: permiso acotado consumidor + intent_type + version de politica + modelo.
            access = self.local.access_policy()
            if access.file_sha256 is None:
                raise SupplyError("INVALID_REQUEST", "access", "Access policy bytes unavailable")
            quotas = enforcement.authorize(access, backend_id=backend["backend_id"],
                                           consumer_id=request["consumer_id"], intent_type=intent["intent_type"],
                                           policy_version=request["routing"]["policy_version"],
                                           input_bytes=input_bytes)
            # 4. Elegibilidad estable del modelo en esta maquina.
            verdict = self.local.verdict(backend)
            if verdict.get("verdict") == "BLOQUEADO":
                raise SupplyError("LOCAL_MODEL_BLOCKED", "eligibility",
                                  "Local model blocked: " + ",".join(verdict.get("reasons", [])))
            timeout = min(rule["timeout_seconds"], quotas["timeout_seconds"])
            provider = self.local.provider()
            with enforcement.concurrency_slot(self.store.root, backend["backend_id"], quotas["max_concurrency"]):
                # 5. Digest del manifest observado inmediatamente antes del POST.
                observed = provider.inspect(model=backend["model"], timeout=min(timeout, 10))
                if observed != backend["model_digest"]:
                    raise SupplyError("MODEL_DIGEST_MISMATCH", "provider", "Installed model differs from pinned digest")
                # 6. Cuotas de acceso y presupuesto por Mandate (reservas previas al envio).
                input_bound = input_bytes + rule["budget"].get("input_margin_tokens", 1024)
                ledger = enforcement.QuotaLedger(self.store.root, backend["backend_id"], request["consumer_id"],
                                                 quotas, clock=self.local.clock)
                ledger.reserve(identity, input_bound, rule["max_output_tokens"])
                try:
                    reservation, budget_ref = self._reserve_local(request, rule, input_bound)
                except SupplyError:
                    ledger.release(identity)
                    raise
                fingerprints = {"supply_policy_sha256": self.engine.policy_sha256,
                                "registry_sha256": self.engine.registry_sha256,
                                "access_policy_sha256": access.file_sha256,
                                "model_manifest_sha256": observed}
                route = self.engine.bind_fingerprints(route, fingerprints)
                # 7. Intento in_flight: desde aca todo fallo es incierto y nunca se reenvia.
                attempt = {"number": 1, "routing_decision": route, "model_digest": observed,
                           "budget_reservation": reservation,
                           "started_at": datetime.now(timezone.utc).isoformat(), "outcome": "in_flight"}
                journal = {"schema_version": "cognituum.inference-accounting/v1",
                           "logical_inference_id": identity, "request_digest": binding,
                           "consumer_id": request["consumer_id"], "intent": intent,
                           "input_digest": request["input_digest"], "attempts": [attempt], "state": "in_flight"}
                self.store.write(identity, journal)
                local = rule.get("local", {})
                start = time.monotonic()
                try:
                    output = provider.generate(payload=request["payload"], model=backend["model"],
                                               max_tokens=rule["max_output_tokens"], timeout=timeout,
                                               options=local.get("options"), response_format=local.get("format"),
                                               keep_alive=local.get("keep_alive"))
                    if output.model != backend["model"]:
                        raise SupplyError("RAW_RESPONSE_MISMATCH", "provider", uncertain=True)
                    latency = int((time.monotonic() - start) * 1000)
                    result = {"schema_version": "cognituum.intelligence-supply-result/v1",
                              "request_id": request["request_id"], "logical_inference_id": identity,
                              "routing_decision_id": route["routing_decision_id"], "routing_decision": route,
                              "provider": backend["provider"], "model": output.model,
                              "raw_response": output.raw_response,
                              "raw_response_digest": text_digest(output.raw_response),
                              "usage": {"input_tokens": output.input_tokens, "output_tokens": output.output_tokens},
                              "latency_ms": latency, "accounting_ref": "accounting://inference/" + identity[7:],
                              "outcome": "completed"}
                    validate_contract("intelligence-supply-result.schema.json", result)
                    if (output.input_tokens > reservation["reserved_input_tokens"]
                            or output.output_tokens > reservation["max_output_tokens"]):
                        budget_store, budget_id = budget_ref
                        with budget_store.lock(budget_id):
                            document = budget_store.read(budget_id)
                            document["halted"] = True
                            budget_store.write(budget_id, document)
                        raise SupplyError("BUDGET_EXCEEDED", "accounting", "Local usage exceeded reservation")
                except SupplyError as exc:
                    exc.retryable = False
                    if exc.code != "BUDGET_EXCEEDED":
                        exc.uncertain = True  # criterio conservador: todo fallo tras iniciar el POST es incierto
                    attempt.update(outcome="error", error=exc.envelope()["error"],
                                   finished_at=datetime.now(timezone.utc).isoformat(),
                                   latency_ms=int((time.monotonic() - start) * 1000))
                    journal.update(state="failed", error=exc.envelope()["error"])
                    self.store.write(identity, journal)
                    raise
                attempt.update(outcome="completed", usage=result["usage"], latency_ms=latency,
                               cost_usd=0, cost_status="local_zero", provider_request_id=output.provider_request_id,
                               finished_at=datetime.now(timezone.utc).isoformat())
                journal.update(state="completed", result=result)
                self.store.write(identity, journal)
                ledger.settle(identity, output.input_tokens, output.output_tokens)
                return result
