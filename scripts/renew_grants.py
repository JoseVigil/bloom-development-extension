#!/usr/bin/env python3
"""
Renovación de Intelligence Supply Grant, Rol W4 y Emisión de Authority.
"""

import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE_URL = "http://localhost:8787"
ORG_ID = "86cc32b9-3c6d-4208-ad57-a2a507a5c090"
SUBJECT = "runner:elias-repos:32dc2743-4fdf-4d8a-ac63-322845a61acd"
MANDATE_ID = "94cb7ee2-6377-4fb6-a695-da0566f9093f"
MEMBERSHIP_ID = "d5cd0f82-7a8c-48ab-adc5-afa012b12da9"


def get_cookie(headers, name: str) -> str:
    set_cookies = headers.get_all("Set-Cookie") or []
    for sc in set_cookies:
        for part in sc.split(";"):
            part = part.strip()
            if part.startswith(f"{name}="):
                return part
    return ""


def post_json(url: str, data: dict, cookie: str, csrf: str = "") -> tuple[dict, str]:
    body = json.dumps(data).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "Origin": BASE_URL,
    }
    if cookie:
        headers["Cookie"] = cookie
    if csrf:
        headers["X-Authority-CSRF"] = csrf

    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            resp_cookie = get_cookie(resp.headers, "__Host-authority-session") or cookie
            return json.loads(resp.read().decode()), resp_cookie
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"[-] HTTP {e.code} en {url}: {err_body}")
        raise RuntimeError(f"HTTP {e.code}: {err_body}")


def main():
    print("[*] Iniciando sesión humana Master...")
    # 1. Login
    login_body = json.dumps({"organizationId": ORG_ID}).encode("utf-8")
    login_req = urllib.request.Request(
        f"{BASE_URL}/v1/authority/human/login",
        data=login_body,
        headers={"Content-Type": "application/json", "Origin": BASE_URL},
        method="POST",
    )
    with urllib.request.urlopen(login_req) as resp:
        login_data = json.loads(resp.read().decode())
        flow_cookie = get_cookie(resp.headers, "__Host-authority-flow")
        auth_url = login_data["authorizationUrl"]

    state = urllib.parse.parse_qs(urllib.parse.urlparse(auth_url).query)["state"][0]

    # 2. Callback
    cb_req = urllib.request.Request(
        f"{BASE_URL}/v1/authority/human/callback?state={state}&code={SUBJECT}",
        headers={"Cookie": flow_cookie},
        method="GET",
    )
    with urllib.request.urlopen(cb_req) as resp:
        cb_data = json.loads(resp.read().decode())
        session_cookie = get_cookie(resp.headers, "__Host-authority-session")
        csrf = cb_data["csrf"]
        principal_id = cb_data["principalId"]
        print(f"[+] Sesión obtenida: principalId={principal_id}")

    # 3. Renew expired emission first!
    print("[*] Renovando emisión vencida en /v1/authority/initial-emission...")
    renew_body = {"organizationId": ORG_ID}
    renew_res, session_cookie = post_json(f"{BASE_URL}/v1/authority/initial-emission", renew_body, session_cookie, csrf)
    curr_v = renew_res["authorityVersion"]
    print(f"[+] Emisión renovada a versión: {curr_v}")

    # 4. Issue renewed intelligence-supply-grant
    grant_req_id = f"genesis-1.3.0-supply-{MANDATE_ID[:8]}-r{int(datetime.now(timezone.utc).timestamp())}"
    print(f"[*] Emitiendo nuevo Intelligence Supply Grant (replaces d88d82a7-9979-4b90-ae55-2cb2397d2c3f) en v{curr_v}...")
    grant_payload = {
        "organizationId": ORG_ID,
        "requestId": grant_req_id,
        "expectedVersion": curr_v,
        "command": {
            "kind": "issue",
            "actorPrincipalId": principal_id,
            "allowedCapabilities": ["text.generate"],
            "allowedDestinations": [
                {
                    "backendId": "anthropic_api",
                    "models": ["claude-sonnet-4-20250514"],
                    "provider": "anthropic",
                },
                {
                    "backendId": "gemini_api",
                    "models": ["gemini-3.8-flash"],
                    "provider": "google",
                },
            ],
            "allowedPrivacy": ["approved_cloud"],
            "consumerId": "brain",
            "installationIds": ["e6c24225-d766-4cd0-b8df-c9db8fe6beb8", "fcd01d96-d7b1-4398-a59c-e65a294b9df8"],
            "limits": {
                "maxInferences": 10,
                "maxOutputTokensPerInference": 4096,
                "maxTotalTokens": 50000,
                "maxUsd": "1.000000",
            },
            "purpose": "mandate_intelligence",
            "replacesGrantId": "d88d82a7-9979-4b90-ae55-2cb2397d2c3f",
            "validUntil": "2027-11-15T00:00:00Z",
        },
    }
    grant_res, session_cookie = post_json(f"{BASE_URL}/v1/authority/intelligence-supply-grant", grant_payload, session_cookie, csrf)
    print(f"[+] Grant emitido exitosamente: grantId={grant_res.get('grantId')} en versión {grant_res.get('authorityVersion')}")
    curr_v = grant_res["authorityVersion"]

    # 5. Propose assignment of w4-confirm role
    prop_id = f"w4-confirm-{MANDATE_ID[:8]}-jose-v{int(datetime.now(timezone.utc).timestamp())}"
    assign_id = f"w4-confirm-{MANDATE_ID[:8]}-jose-assign-{int(datetime.now(timezone.utc).timestamp())}"
    print(f"[*] Proponiendo asignación de rol w4-confirm en versión {curr_v}...")
    prop_payload = {
        "organizationId": ORG_ID,
        "requestId": f"req-prop-{prop_id}",
        "expectedVersion": curr_v,
        "command": {
            "kind": "propose_assignment",
            "proposalId": prop_id,
            "assignmentId": assign_id,
            "membershipId": MEMBERSHIP_ID,
            "roleId": "w4-confirm",
            "roleVersion": "1",
            "scope": {
                "type": "mandate",
                "id": MANDATE_ID,
            },
            "validFrom": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "validUntil": "2027-11-15T00:00:00Z",
        },
    }
    prop_res, session_cookie = post_json(f"{BASE_URL}/v1/authority/administration", prop_payload, session_cookie, csrf)
    print(f"[+] Propuesta creada en versión {prop_res.get('authorityVersion')}")
    curr_v = prop_res["authorityVersion"]

    # 6. Accept assignment
    print(f"[*] Aceptando asignación en versión {curr_v}...")
    accept_payload = {
        "organizationId": ORG_ID,
        "requestId": f"req-accept-{prop_id}",
        "expectedVersion": curr_v,
        "command": {
            "kind": "accept",
            "proposalId": prop_id,
        },
    }
    accept_res, session_cookie = post_json(f"{BASE_URL}/v1/authority/administration", accept_payload, session_cookie, csrf)
    print(f"[+] Asignación aceptada en versión {accept_res.get('authorityVersion')}")
    curr_v = accept_res["authorityVersion"]

    print(f"\n[+] Todo renovado en Authority. Versión resultante: {curr_v}")


if __name__ == "__main__":
    main()
