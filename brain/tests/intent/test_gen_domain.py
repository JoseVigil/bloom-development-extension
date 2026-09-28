"""The proposal must stay bound to the signed input set."""

import hashlib
import json
import unittest

from brain.core.intent.gen_domain import GenDomainError, generate_domain


class GenDomainTest(unittest.TestCase):
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
