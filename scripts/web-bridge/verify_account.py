#!/usr/bin/env python3
"""
Script para verificar si una cuenta está logueada en Claude.ai
Utiliza la infraestructura de sesiones persistentes para determinar el estado de login.
"""

import argparse
import json
import sys
import os
from pathlib import Path
from typing import Dict, Optional

from playwright.sync_api import sync_playwright, BrowserContext, Page

class AccountVerifier:
    """Clase para verificar el estado de login de una cuenta"""

    def __init__(self, profile_path: str):
        self.profile_path = Path(profile_path)
        self.session_dir = self.profile_path / "claude_bridge_data" / "sessions"

    def verify_login(self, provider: str) -> Dict:
        """Verifica si la cuenta está logueada usando Playwright"""
        
        if provider != "claude":
            return {
                "logged_in": False,
                "email": None,
                "error": f"Solo el proveedor 'claude' está soportado por este verificador"
            }

        # Verificar si existe el directorio de sesiones
        if not self.session_dir.exists():
            return {
                "logged_in": False,
                "email": None,
                "error": f"No se encontró el directorio de sesiones: {self.session_dir}"
            }

        # Buscar archivos de sesión válidos
        session_files = list(self.session_dir.glob("*.json"))
        if not session_files:
            return {
                "logged_in": False,
                "email": None,
                "error": "No se encontraron archivos de sesión en el directorio especificado"
            }

        try:
            with sync_playwright() as playwright:
                # Intentar cargar la primera sesión disponible
                session_file = session_files[0]
                
                with open(session_file, 'r') as f:
                    session_data = json.load(f)

                # Crear navegador y contexto con la sesión
                browser = playwright.chromium.launch(
                    headless=True,
                    args=['--disable-blink-features=AutomationControlled', '--no-sandbox']
                )
                
                context = browser.new_context(storage_state=session_data['storage'])
                page = context.new_page()

                try:
                    # Navegar a Claude.ai para verificar el estado de login
                    page.goto("https://claude.ai", wait_until="networkidle", timeout=15000)
                    
                    # Verificar si está logueado comparando la URL
                    current_url = page.url
                    is_logged_in = "/chat" in current_url

                    # Intentar obtener información del usuario si está logueado
                    email = None
                    if is_logged_in:
                        try:
                            # Buscar elementos que contengan información del usuario
                            selectors = [
                                'div[data-testid="user-menu"]',
                                'button[aria-label*="account"]',
                                'div[class*="user"]',
                                'div[class*="account"]',
                                '[data-testid="user-profile"]'
                            ]
                            
                            for selector in selectors:
                                try:
                                    elements = page.locator(selector).all()
                                    for element in elements:
                                        text = element.inner_text().strip()
                                        if "@" in text and "." in text.split("@")[-1]:
                                            email = text.strip()
                                            break
                                    if email:
                                        break
                                except:
                                    continue

                        except Exception:
                            # Si no se puede obtener el email, no es crítico
                            pass

                    result = {
                        "logged_in": is_logged_in,
                        "email": email,
                        "session_file": str(session_file),
                        "error": None
                    }

                    return result

                finally:
                    browser.close()

        except Exception as e:
            return {
                "logged_in": False,
                "email": None,
                "error": f"Error durante la verificación: {str(e)}"
            }

def main():
    parser = argparse.ArgumentParser(
        description="Verifica si una cuenta está logueada en Claude.ai utilizando sesiones persistentes.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos de uso:
  python verify_account.py --profile "/ruta/al/perfil" --provider claude
  python verify_account.py --profile "./perfil_usuario" --provider claude
        """
    )
    
    parser.add_argument(
        "--profile", 
        required=True,
        help="Ruta al directorio del perfil que contiene la carpeta claude_bridge_data/sessions"
    )
    
    parser.add_argument(
        "--provider",
        required=True,
        choices=["claude"],
        help="Proveedor de la cuenta a verificar (solo claude está soportado)"
    )
    
    args = parser.parse_args()

    verifier = AccountVerifier(args.profile)
    result = verifier.verify_login(args.provider)

    # Imprimir resultado en formato JSON
    print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()