#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE_URL = "http://localhost:8787"
ORG_ID = "86cc32b9-3c6d-4208-ad57-a2a507a5c090"
SUBJECT = "runner:elias-repos:32dc2743-4fdf-4d8a-ac63-322845a61acd"
SERVICE_TOKEN = "236a3663651dc049f8376f014f19c2fe4d8b6af8111f5fa0854247fcabc27251"


def find_nucleus_bin() -> str:
    which = shutil.which("nucleus")
    if which:
        return which
    installed = Path.home() / "AppData" / "Local" / "BloomNucleus" / "bin" / "nucleus" / "nucleus.exe"
    if installed.exists():
        return str(installed)
    repo_bin = Path(__file__).resolve().parent.parent / "installer" / "nucleus" / "nucleus.exe"
    if repo_bin.exists():
        return str(repo_bin)
    return "nucleus"


def get_cookie(headers, name: str) -> str:
    set_cookies = headers.get_all("Set-Cookie") or []
    for sc in set_cookies:
        for part in sc.split(";"):
            part = part.strip()
            if part.startswith(f"{name}="):
                return part
    return ""


def main():
    print("[*] 1. Login Master...")
    req = urllib.request.Request(
        f"{BASE_URL}/v1/authority/human/login",
        data=json.dumps({"organizationId": ORG_ID}).encode("utf-8"),
        headers={"Content-Type": "application/json", "Origin": BASE_URL},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        flow_cookie = get_cookie(resp.headers, "__Host-authority-flow")
        auth_url = json.loads(resp.read().decode())["authorizationUrl"]

    state = urllib.parse.parse_qs(urllib.parse.urlparse(auth_url).query)["state"][0]

    cb_req = urllib.request.Request(
        f"{BASE_URL}/v1/authority/human/callback?state={state}&code={SUBJECT}",
        headers={"Cookie": flow_cookie},
        method="GET",
    )
    with urllib.request.urlopen(cb_req) as resp:
        cb_data = json.loads(resp.read().decode())
        session_cookie = get_cookie(resp.headers, "__Host-authority-session")
        csrf = cb_data["csrf"]

    print("[*] 2. Renovando emisión en /v1/authority/initial-emission...")
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
    with urllib.request.urlopen(renew_req) as resp:
        renew_data = json.loads(resp.read().decode())
        v = renew_data.get("authorityVersion")
        print(f"[+] Emisión renovada a versión: {v}")

    print("[*] 3. Sincronizando Nucleus productivo...")
    nucleus_bin = find_nucleus_bin()
    env = os.environ.copy()
    env["AUTHORITY_SERVICE_TOKEN"] = SERVICE_TOKEN
    res = subprocess.run([nucleus_bin, "--json", "authority", "sync"], env=env, capture_output=True, text=True)
    print(res.stdout)
    if res.returncode != 0:
        print("[-] Error en sync:", res.stderr)
        return

    print("[*] 4. Evaluando decisión W4...")
    res2 = subprocess.run(
        [nucleus_bin, "--json", "authority", "decision", "mandate.resources.confirm", "63b53c33-d60c-40c1-8fb4-27ca884c1501", "mandate", "94cb7ee2-6377-4fb6-a695-da0566f9093f"],
        capture_output=True,
        text=True,
    )
    print(res2.stdout)


if __name__ == "__main__":
    main()
