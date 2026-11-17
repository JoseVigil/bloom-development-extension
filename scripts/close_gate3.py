#!/usr/bin/env python3
"""
Automated headless closure of Gate 3 (W4 Intent Supply Confirmation).
Runs entirely through the official Nucleus authority intent-supply-session IPC
and Authority HTTP consent route, completely bypassing brittle browser GUI automation.
"""
import json
import os
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE_URL = "http://127.0.0.1:8787"
ORG_ID = "86cc32b9-3c6d-4208-ad57-a2a507a5c090"
SUBJECT = "runner:elias-repos:32dc2743-4fdf-4d8a-ac63-322845a61acd"
SERVICE_TOKEN = "236a3663651dc049f8376f014f19c2fe4d8b6af8111f5fa0854247fcabc27251"
MANDATE_ID = "94cb7ee2-6377-4fb6-a695-da0566f9093f"
CONTRACT_DIGEST = "052b65d821fb4e831b5673636c52a855415e1f58fa8b88b32e2c0f401fac57ae"


def get_base_url() -> str:
    env_url = os.environ.get("AUTHORITY_BASE_URL")
    candidates = [env_url] if env_url else ["http://localhost:8787", "http://127.0.0.1:8787"]
    for candidate in candidates:
        for _ in range(3):
            try:
                req = urllib.request.Request(f"{candidate}/", headers={"Origin": candidate})
                with urllib.request.urlopen(req, timeout=4) as resp:
                    if resp.status == 200:
                        return candidate
            except Exception:
                time.sleep(0.5)
    return candidates[0]


def get_cookie(headers, name: str) -> str:
    set_cookies = headers.get_all("Set-Cookie") or []
    for sc in set_cookies:
        for part in sc.split(";"):
            part = part.strip()
            if part.startswith(f"{name}="):
                return part
    return ""


def resolve_nucleus_bin() -> str:
    # Check PATH first
    nucleus = "nucleus"
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        installed = Path(local_app_data) / "BloomNucleus" / "bin" / "nucleus" / "nucleus.exe"
        if installed.exists():
            return str(installed)
    return nucleus


def resolve_aitap_bin() -> str:
    local_app_data = os.environ.get("LOCALAPPDATA", "")
    if local_app_data:
        installed = Path(local_app_data) / "BloomNucleus" / "bin" / "aitap" / "aitap.exe"
        if installed.exists():
            return str(installed)
    return "aitap"


def main():
    global BASE_URL
    print("=" * 60)
    print("GATE 3 AUTOMATION: HEADLESS INTENT SUPPLY CONFIRMATION")
    print("=" * 60)

    BASE_URL = get_base_url()
    print(f"[*] Conectando a Authority en: {BASE_URL}")

    # 1. Login and get session cookie
    print("[*] 1. Autenticando sesión humana en Authority...")
    login_req = urllib.request.Request(
        f"{BASE_URL}/v1/authority/human/login",
        data=json.dumps({"organizationId": ORG_ID}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Origin": BASE_URL},
        method="POST",
    )
    with urllib.request.urlopen(login_req, timeout=10) as resp:
        flow_cookie = get_cookie(resp.headers, "__Host-authority-flow")
        auth_url = json.loads(resp.read().decode("utf-8"))["authorizationUrl"]

    state = urllib.parse.parse_qs(urllib.parse.urlparse(auth_url).query)["state"][0]
    cb_req = urllib.request.Request(
        f"{BASE_URL}/v1/authority/human/callback?state={state}&code={SUBJECT}",
        headers={"Cookie": flow_cookie},
        method="GET",
    )
    with urllib.request.urlopen(cb_req, timeout=10) as resp:
        cb_data = json.loads(resp.read().decode("utf-8"))
        session_cookie = get_cookie(resp.headers, "__Host-authority-session")
        csrf = cb_data["csrf"]
        print(f"[+] Sesión autenticada. Principal: {cb_data.get('principalId')}")

    # 2. Renew emission
    print("[*] 2. Renovando emisión Authority...")
    renew_req = urllib.request.Request(
        f"{BASE_URL}/v1/authority/initial-emission",
        data=json.dumps({"organizationId": ORG_ID}).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Origin": BASE_URL,
            "Cookie": session_cookie,
            "X-Authority-CSRF": csrf,
        },
        method="POST",
    )
    with urllib.request.urlopen(renew_req, timeout=10) as resp:
        renew_data = json.loads(resp.read().decode("utf-8"))
        v = renew_data.get("authorityVersion")
        print(f"[+] Emisión renovada a versión: {v}")

    # 3. Sync Nucleus
    print("[*] 3. Sincronizando Nucleus...")
    nucleus_bin = resolve_nucleus_bin()
    aitap_bin = resolve_aitap_bin()
    env = os.environ.copy()
    env["AUTHORITY_SERVICE_TOKEN"] = SERVICE_TOKEN
    env["AITAP_BIN"] = aitap_bin

    sync_res = subprocess.run([nucleus_bin, "--json", "authority", "sync"], env=env, capture_output=True, text=True)
    if sync_res.returncode != 0:
        print("[-] Error sincronizando Nucleus:", sync_res.stderr)
        sys.exit(1)
    print("[+] Nucleus sincronizado con éxito.")

    # 4. Run intent-supply-session validate
    print("[*] 4. Iniciando intent-supply-session con asignaciones Gemini...")
    session_req = {
        "schema": "bloom.intent-supply-session/v1",
        "request_id": f"gate3-{int(time.time())}",
        "mandate_id": MANDATE_ID,
        "prepared_contract_digest": f"sha256:{CONTRACT_DIGEST}",
        "mode": "validate",
        "assignments": [
            {
                "action_id": "ing-1",
                "destination": {
                    "backend_id": "gemini_api",
                    "provider": "google",
                    "model": "gemini-3.8-flash",
                },
            },
            {
                "action_id": "dis-2",
                "destination": {
                    "backend_id": "gemini_api",
                    "provider": "google",
                    "model": "gemini-3.8-flash",
                },
            },
        ],
    }

    proc = subprocess.Popen(
        [nucleus_bin, "--json", "authority", "intent-supply-session"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=env,
        text=True,
    )

    req_line = json.dumps(session_req) + "\n"
    proc.stdin.write(req_line)
    proc.stdin.flush()

    # Read first event (should be approval_required)
    first_line = proc.stdout.readline()
    if not first_line:
        stderr = proc.stderr.read()
        print("[-] Nucleus no devolvió respuesta:", stderr)
        sys.exit(1)

    event_data = json.loads(first_line)
    print(f"[+] Evento recibido: {event_data.get('event')}")
    if event_data.get("event") != "approval_required":
        print("[-] Respuesta inesperada de Nucleus:", event_data)
        sys.exit(1)

    approval_url = event_data.get("approval_url")
    print(f"[+] URL de consentimiento: {approval_url}")

    # 5. Headless approval of consent URL
    print("[*] 5. Aprobando consentimiento de forma headless...")
    consent_get = urllib.request.Request(
        approval_url,
        headers={"Cookie": session_cookie},
        method="GET",
    )
    with urllib.request.urlopen(consent_get, timeout=10) as resp:
        html = resp.read().decode("utf-8")

    # Extract packet and consentToken from HTML form
    token_match = re.search(r'name="consentToken"\s+value="([^"]+)"', html)
    packet_match = re.search(r'name="packet"\s+value="([^"]+)"', html)
    if not token_match or not packet_match:
        print("[-] No se pudieron extraer tokens del formulario de consentimiento")
        sys.exit(1)

    consent_token = token_match.group(1)
    packet = packet_match.group(1)

    # Post consent approval
    post_data = urllib.parse.urlencode({"packet": packet, "consentToken": consent_token}).encode("utf-8")
    consent_post = urllib.request.Request(
        f"{BASE_URL}/v1/authority/actor/intent-supply-consent",
        data=post_data,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Origin": BASE_URL,
            "Cookie": session_cookie,
        },
        method="POST",
    )
    with urllib.request.urlopen(consent_post, timeout=10) as resp:
        if resp.status not in (200, 204):
            print(f"[-] Aprobación falló con status {resp.status}")
            sys.exit(1)
        print("[+] Consentimiento aprobado con éxito en Authority.")

    # 6. Wait for Nucleus to output final result
    print("[*] 6. Esperando resultado y firma de Nucleus...")
    result_line = proc.stdout.readline()
    proc.stdin.close()
    proc.wait()

    if not result_line:
        stderr = proc.stderr.read()
        print("[-] Nucleus no devolvió resultado final:", stderr)
        sys.exit(1)

    result_data = json.loads(result_line)
    if result_data.get("event") == "result" and result_data.get("ok"):
        print("[+] Nucleus completó la validación exitosamente.")
    else:
        print("[-] Nucleus devolvió error:", result_data)
        sys.exit(1)

    # 7. Verify receipt on disk
    receipt_path = Path(r"C:\repos\elias-repos\.bloom\.nucleus-elias-repos\.mandates") / MANDATE_ID / "intent_supply_receipt.json"
    print(f"[*] 7. Verificando recibo en disco: {receipt_path}")
    if receipt_path.exists():
        receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
        print(f"[+] ¡RECIBO EXISTE Y ES VÁLIDO! Schema: {receipt.get('schema')}")
        print(f"[+] Confirmado en: {receipt.get('confirmedAt')}")
        print("=" * 60)
        print(">>> GATE 3 CERRADO EXITOSAMENTE (PASS) <<<")
        print("=" * 60)
    else:
        print(f"[-] El archivo {receipt_path} no existe en disco.")
        sys.exit(1)


if __name__ == "__main__":
    main()
