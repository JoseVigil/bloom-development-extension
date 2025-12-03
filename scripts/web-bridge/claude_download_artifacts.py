#!/usr/bin/env python3
"""
quick_download_fixed.py
Script completo y bien formateado para descargar artifacts de Claude usando tu perfil REAL de Chrome.
Corrección central: Playwright debe abrir el *User Data root* + usar --profile-directory="Profile X".
"""

import argparse
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
import time
import sys


def resolve_profile(user_data_dir: str, profile_input: str) -> dict:
    """
    Resuelve correctamente el profile-directory de Chrome
    (Display name → Profile X)
    """
    user_data = Path(os.path.expandvars(user_data_dir))

    if not user_data.exists():
        return {"success": False, "error": f"User Data no encontrado: {user_data}"}

    local_state_file = user_data / "Local State"
    if not local_state_file.exists():
        return {"success": False, "error": f"Local State no encontrado: {local_state_file}"}

    try:
        with open(local_state_file, "r", encoding="utf-8") as f:
            local_state = json.load(f)

        profiles = local_state.get("profile", {}).get("info_cache", {})

        # Buscar por display name (ej: "Los Nenes")
        for directory_name, profile_data in profiles.items():
            if profile_data.get("name") == profile_input:
                return {
                    "success": True,
                    "input": profile_input,
                    "directory_name": directory_name,
                    "display_name": profile_data.get("name", directory_name),
                    "path": str(user_data / directory_name),
                }

        # Buscar por directory_name directo (ej: "Profile 7" o "Default")
        direct_path = user_data / profile_input
        if direct_path.exists():
            return {
                "success": True,
                "input": profile_input,
                "directory_name": profile_input,
                "display_name": profile_input,
                "path": str(direct_path),
            }

        return {"success": False, "error": f"Perfil '{profile_input}' no encontrado en {user_data}"}

    except Exception as e:
        return {"success": False, "error": f"Error resolviendo perfil: {e}"}


def download_artifacts(user_data_dir: str, profile_name: str, chat_url: str, output_dir: str = "./downloads"):
    """
    Abre Chrome con Playwright usando el User Data root + --profile-directory para utilizar
    exactamente el perfil del usuario y descargar artifacts.
    """
    print("🔍 Resolviendo perfil...")
    profile_info = resolve_profile(user_data_dir, profile_name)

    if not profile_info["success"]:
        raise Exception(profile_info["error"])

    profile_dir_name = profile_info["directory_name"]
    profile_display = profile_info["display_name"]

    # Playwright necesita el User Data root (no la carpeta del perfil directo)
    user_data_root = Path(os.path.expandvars(user_data_dir))

    # Directorio de salida
    chat_id = chat_url.split("/chat/")[-1].split("?")[0] if "/chat/" in chat_url else "unknown"
    output = Path(output_dir) / f"chat_{chat_id}"
    output.mkdir(parents=True, exist_ok=True)

    print("\n" + "=" * 70)
    print(f"👤 Perfil display: {profile_display}")
    print(f"📂 Profile directory: {profile_dir_name}")
    print(f"📁 User Data root: {user_data_root}")
    print(f"🌐 URL: {chat_url}")
    print(f"📁 Salida: {output}")
    print("=" * 70 + "\n")

    with sync_playwright() as p:
        print("🚀 Lanzando navegador Chromium (Playwright) con perfil real...")

        context = p.chromium.launch_persistent_context(
            user_data_dir=str(user_data_root),
            headless=False,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                f'--profile-directory={profile_dir_name}',
            ],
        )

        # Obtener la página inicial (si existe) o crear nueva
        if context.pages:
            page = context.pages[0]
        else:
            page = context.new_page()

        print("🌐 Navegando a la URL...")
        try:
            page.goto(chat_url, wait_until="networkidle", timeout=30000)
        except Exception as e:
            print(f"⚠️ Error navegando a {chat_url}: {e}")

        # Pequeña espera para que la sesión cargue correctamente
        time.sleep(2)

        # Verificar si Playwright abrió la página de login
        current_url = page.url or ""
        if "/login" in current_url or "signin" in current_url.lower():
            print("❌ Parece que la sesión no se cargó (está pidiendo login).")
            print("   Asegurate de que Chrome esté cerrado o que el perfil no esté bloqueado por otra instancia.")
            input("\n⏸️ Presioná Enter para cerrar el navegador...")
            context.close()
            return

        print("✅ Página cargada, comenzando extracción...\n")

        # Guardar contenido completo de la conversación
        try:
            html_path = output / "conversation.html"
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(page.content())
            print(f"📄 Guardado: {html_path.name}")
        except Exception as e:
            print(f"⚠️ Error guardando conversation.html: {e}")

        # Extraer bloques <pre><code> como artifacts; si no hay, devolver solo 1 archivo con todo el HTML
        try:
            code_blocks = page.locator("pre code").all()
            if code_blocks:
                artifacts = []
                for idx, block in enumerate(code_blocks):
                    try:
                        content = block.inner_text()
                        if not content.strip():
                            continue
                        class_name = block.get_attribute("class") or ""
                        ext = "txt"
                        if "language-" in class_name:
                            ext = class_name.split("language-")[-1].split()[0]
                        file_path = output / f"artifact_{idx+1}.{ext}"
                        with open(file_path, "w", encoding="utf-8") as f:
                            f.write(content)
                        artifacts.append(str(file_path.name))
                        print(f"  ✓ {file_path.name}")
                    except Exception as e:
                        print(f"  ⚠️ Error al extraer bloque {idx+1}: {e}")
                # Si extrajo varios, crear metadata y salir
                metadata = {
                    "chat_id": chat_id,
                    "url": chat_url,
                    "profile": profile_display,
                    "profile_directory": profile_dir_name,
                    "downloaded_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "artifacts": artifacts,
                }
                with open(output / "metadata.json", "w", encoding="utf-8") as f:
                    json.dump(metadata, f, indent=2, ensure_ascii=False)
                print("\n✅ Extracción completada.")
                input("\n⏸️ Presioná Enter para cerrar...")
                context.close()
                return
            else:
                # No encontró blocks; guardar todo el HTML como único artifact (requerimiento tuyo: 1 solo artifact)
                single_path = output / "artifact_1.html"
                with open(single_path, "w", encoding="utf-8") as f:
                    f.write(page.content())
                print(f"📦 No se encontraron bloques <pre><code>. Se creó un único artifact: {single_path.name}")
                metadata = {
                    "chat_id": chat_id,
                    "url": chat_url,
                    "profile": profile_display,
                    "profile_directory": profile_dir_name,
                    "downloaded_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "artifacts": [str(single_path.name)],
                }
                with open(output / "metadata.json", "w", encoding="utf-8") as f:
                    json.dump(metadata, f, indent=2, ensure_ascii=False)
                input("\n⏸️ Presioná Enter para cerrar...")
                context.close()
                return
        except Exception as e:
            print(f"⚠️ Error durante la extracción: {e}")
            input("\n⏸️ Presioná Enter para cerrar...")
            context.close()
            return


def main():
    parser = argparse.ArgumentParser(description="Descarga artifacts de Claude con profile real de Chrome")
    parser.add_argument("--user-data", required=True, help="Ruta a User Data de Chrome (ej: C:/Users/tuuser/AppData/Local/Google/Chrome/User Data)")
    parser.add_argument("--profile", required=True, help="Display name del perfil o directory name (ej: \"Los Nenes\" o \"Profile 7\")")
    parser.add_argument("--url", required=True, help="URL del chat (ej: https://claude.ai/chat/...)")
    parser.add_argument("--output", default="./downloads", help="Directorio de salida")
    args = parser.parse_args()

    try:
        download_artifacts(args.user_data, args.profile, args.url, args.output)
    except Exception as e:
        print(f"\n❌ ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
