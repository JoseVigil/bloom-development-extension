"""The proposal must stay bound to the signed input set."""

import hashlib
import json
import unittest

from brain.core.intent.gen_domain import GenDomainError, generate_domain


class GenDomainTest(unittest.TestCase):
    def test_local_selection_and_structural_proposal(self):
        content = "# Billing\n"
        fingerprint = lambda value: value * 64
        intelligence = {"policyVersion": "mandate-gen-local/v1", "policyRef": "policy.json", "registryRef": "registry.json",
                        "policySha256": fingerprint("a"), "registrySha256": fingerprint("b"),
                        "accessPolicySha256": fingerprint("c"), "modelManifestSha256": fingerprint("d"),
                        "registrySnapshotId": "test-snapshot", "model": "test:tag", "backendId": "local.ollama.test-id",
                        "credentialRef": None, "privacy": "local"}
        contract = {"contractVersion": 3, "mandateId": "test-mandate", "objective": "Define Billing",
                    "domain": {"id": "billing", "name": "Billing"},
                    "action": {"actionId": "test-action", "type": "run_intent", "intentType": "gen", "domainId": "billing", "artifactRef": "domain_definition.json"},
                    "intelligence": intelligence,
                    "inputs": [{"ref": "inputs/source.md", "sha256": hashlib.sha256(content.encode()).hexdigest(), "size": len(content.encode())}]}
        request = {"contract": contract, "contractDigest": "signed", "sources": [{"ref": "inputs/source.md", "content": content}],
                   "supply": {"directory": "unused", "policyRef": "policy.json", "registryRef": "registry.json"}}
        fingerprints = {"supply_policy_sha256": fingerprint("a"), "registry_sha256": fingerprint("b"),
                        "access_policy_sha256": fingerprint("c"), "model_manifest_sha256": fingerprint("d")}
        decision = {"registry_snapshot_id": "test-snapshot", "resource_fingerprints": fingerprints,
                    "effective_intelligence": {"backend_id": "local.ollama.test-id", "provider": "ollama", "model": "test:tag",
                                               "credential_ref": None, "privacy": "local", "model_digest": fingerprint("d"), "health": "healthy"}}
        proposal = {"purpose": "Payments", "boundaries": {"inScope": ["payments"], "outOfScope": []},
                    "concepts": ["Billing"], "decisions": []}
        class Supply:
            def obtain(self, _directory, transport, **_kwargs):
                assert transport["routing"]["privacy"] == "local"
                return {"raw_response": json.dumps(proposal), "provider": "ollama", "model": "test:tag", "routing_decision": decision}
        self.assertEqual(generate_domain(request, Supply())["domainId"], "billing")
        decision["resource_fingerprints"] = {**fingerprints, "access_policy_sha256": fingerprint("e")}
        with self.assertRaises(GenDomainError):
            generate_domain(request, Supply())
        decision["resource_fingerprints"] = fingerprints
        proposal["boundaries"] = {}
        with self.assertRaises(GenDomainError):
            generate_domain(request, Supply())

    def test_rejects_added_or_altered_files(self):
        content = "# Billing\nRecords payments.\n"
        encoded = content.encode()
        contract = {
            "mandateId": "m1", "objective": "Define Billing",
            "domain": {"id": "d1", "name": "Billing"},
            "action": {"actionId": "a1", "type": "run_intent", "intentType": "gen", "domainId": "d1",
                       "artifactRef": "domain_definition.json"},
            "intelligence": {"policyVersion": "mandate-gen/v1", "policyRef": "policy.json", "registryRef": "registry.json", "model": "test-model", "backendId": "anthropic_api", "credentialRef": "credential-ref://anthropic/default"},
            "inputs": [{"ref": "inputs/source.md", "sha256": hashlib.sha256(encoded).hexdigest(),
                        "size": len(encoded)}],
        }
        request = {"contract": contract, "contractDigest": "digest",
                   "sources": [{"ref": "inputs/source.md", "content": content}],
                   "supply": {"directory": "unused", "policyRef": "policy.json", "registryRef": "registry.json"}}
        class Supply:
            def obtain(self, *_args, **_kwargs):
                return {"raw_response": json.dumps({"purpose": "Payments", "boundaries": {"scope": "one domain"}, "concepts": ["Billing"], "decisions": []}),
                        "model": "test-model", "routing_decision": {"effective_intelligence": {"backend_id": "anthropic_api", "credential_ref": "credential-ref://anthropic/default"}}}
        result = generate_domain(request, Supply())
        self.assertEqual(result["domainId"], "d1")
        self.assertEqual(result["concepts"], ["Billing"])
        with self.assertRaises(GenDomainError):
            generate_domain({**request, "sources": request["sources"] + request["sources"]}, Supply())
        with self.assertRaises(GenDomainError):
            generate_domain({**request, "sources": [{"ref": "inputs/source.md", "content": "altered"}]}, Supply())
