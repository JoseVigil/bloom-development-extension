#!/usr/bin/env python3
"""
Renovación de emisión de Authority para desarrollo local.

Autentica la sesión de Master mediante el proveedor fixture local y
solicita a /v1/authority/initial-emission la emisión de un nuevo snapshot
vigente para la organización especificada.
"""

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_BASE_URL = "http://localhost:8787"
DEFAULT_ORG_ID = "86cc32b9-3c6d-4208-ad57-a2a507a5c090"
DEFAULT_SUBJECT = "runner:elias-repos:32dc2743-4fdf-4d8a-ac63-322845a61acd"


def get_cookie(headers, name: str) -> str:
    """Extrae el valor del cookie de los headers Set-Cookie sin depender del jar."""
    set_cookies = headers.get_all("Set-Cookie") or []
    for sc in set_cookies:
        for part in sc.split(";"):
            part = part.strip()
            if part.startswith(f"{name}="):
                return part
    return ""


def renew_authority(base_url: str, org_id: str, subject: str) -> dict:
    print(f"[*] Comprobando Backend en {base_url}...")
    try:
        req = urllib.request.Request(f"{base_url}/")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            print(f"[+] Backend activo: {data}")
    except Exception as e:
        print(f"[-] Backend no responde en {base_url}: {e}")
        sys.exit(1)

    # 1. Iniciar login de la organización
    print(f"[*] 1/3 Iniciando login humano como Master para org {org_id}...")
    login_body = json.dumps({"organizationId": org_id}).encode("utf-8")
    login_req = urllib.request.Request(
        f"{base_url}/v1/authority/human/login",
        data=login_body,
        headers={
            "Content-Type": "application/json",
            "Origin": base_url,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(login_req) as resp:
            login_data = json.loads(resp.read().decode())
            auth_url = login_data.get("authorizationUrl", "")
            flow_cookie = get_cookie(resp.headers, "__Host-authority-flow")
            print(f"[+] Login iniciado. URL de autorización obtenida.")
    except urllib.error.HTTPError as e:
        print(f"[-] Error en /v1/authority/human/login ({e.code}): {e.read().decode()}")
        sys.exit(1)

    if not flow_cookie:
        print("[-] No se recibió cookie __Host-authority-flow en respuesta de login")
        sys.exit(1)

    parsed_url = urllib.parse.urlparse(auth_url)
    params = urllib.parse.parse_qs(parsed_url.query)
    state = params.get("state", [""])[0]
    if not state:
        print("[-] No se pudo extraer el parámetro 'state' de authorizationUrl")
        sys.exit(1)

    # 2. Callback de autenticación fixture
    print(f"[*] 2/3 Ejecutando callback con identidad Master ({subject})...")
    cb_query = urllib.parse.urlencode({"state": state, "code": subject})
    cb_req = urllib.request.Request(
        f"{base_url}/v1/authority/human/callback?{cb_query}",
        headers={
            "Cookie": flow_cookie,
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(cb_req) as resp:
            cb_data = json.loads(resp.read().decode())
            csrf = cb_data.get("csrf")
            principal_id = cb_data.get("principalId")
            session_cookie = get_cookie(resp.headers, "__Host-authority-session")
            print(f"[+] Sesión Master autenticada: principal_id={principal_id}")
    except urllib.error.HTTPError as e:
        print(f"[-] Error en callback ({e.code}): {e.read().decode()}")
        sys.exit(1)

    if not session_cookie:
        print("[-] No se recibió cookie __Host-authority-session en respuesta del callback")
        sys.exit(1)

    if not csrf:
        print("[-] No se recibió token CSRF en la respuesta del callback")
        sys.exit(1)

    # 3. Solicitar renovación de emisión a /v1/authority/initial-emission
    print(f"[*] 3/3 Solicitando renovación de emisión en /v1/authority/initial-emission...")
    emission_body = json.dumps({"organizationId": org_id}).encode("utf-8")
    emission_req = urllib.request.Request(
        f"{base_url}/v1/authority/initial-emission",
        data=emission_body,
        headers={
            "Content-Type": "application/json",
            "Origin": base_url,
            "Cookie": session_cookie,
            "X-Authority-CSRF": csrf,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(emission_req) as resp:
            emission_data = json.loads(resp.read().decode())
            print(f"[+] ¡Emisión de Authority renovada con éxito!")
            print(f"    - Versión de Authority: {emission_data.get('authorityVersion')}")
            print(f"    - Digest de estado: {emission_data.get('stateDigest')}")
            return emission_data
    except urllib.error.HTTPError as e:
        err_body = e.read().decode()
        print(f"[-] Error en /v1/authority/initial-emission ({e.code}): {err_body}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Renueva la emisión de Authority en desarrollo local.")
    parser.add_argument("--url", default=DEFAULT_BASE_URL, help=f"URL del Backend (default: {DEFAULT_BASE_URL})")
    parser.add_argument("--org", default=DEFAULT_ORG_ID, help=f"Organization ID (default: {DEFAULT_ORG_ID})")
    parser.add_argument("--subject", default=DEFAULT_SUBJECT, help=f"Sujeto fixture Master (default: {DEFAULT_SUBJECT})")
    args = parser.parse_args()

    renew_authority(args.url, args.org, args.subject)


if __name__ == "__main__":
    main()
