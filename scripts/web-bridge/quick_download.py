#!/usr/bin/env python3
"""
Script para descargar artifacts de Claude usando perfil de Chrome
Incluye resolver de perfiles integrado
"""

import argparse
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
import time

def resolve_profile(user_data_dir: str, profile_input: str) -> dict:
    """
    Resuelve el nombre del perfil a su directorio real
    Basado en chrome_profile_resolver.py
    """
    user_data = Path(os.path.expandvars(user_data_dir))
    
    if not user_data.exists():
        return {
            "success": False,
            "error": f"User Data no encontrado: {user_data}"
        }
    
    # Leer Local State para mapear perfiles
    local_state_file = user_data / "Local State"
    if not local_state_file.exists():
        return {
            "success": False,
            "error": f"Local State no encontrado: {local_state_file}"
        }
    
    try:
        with open(local_state_file, 'r', encoding='utf-8') as f:
            local_state = json.load(f)
        
        profiles = local_state.get('profile', {}).get('info_cache', {})
        
        # Buscar el perfil por nombre
        for directory_name, profile_data in profiles.items():
            display_name = profile_data.get('name', '')
            
            if display_name == profile_input or directory_name == profile_input:
                profile_path = user_data / directory_name
                
                if profile_path.exists():
                    return {
                        "success": True,
                        "input": profile_input,
                        "directory_name": directory_name,
                        "display_name": display_name,
                        "path": str(profile_path)
                    }
        
        # Si no se encontró, intentar como ruta directa
        direct_path = user_data / profile_input
        if direct_path.exists():
            return {
                "success": True,
                "input": profile_input,
                "directory_name": profile_input,
                "display_name": profile_input,
                "path": str(direct_path)
            }
        
        return {
            "success": False,
            "error": f"Perfil '{profile_input}' no encontrado en {user_data}"
        }
    
    except Exception as e:
        return {
            "success": False,
            "error": f"Error resolviendo perfil: {e}"
        }

def download_artifacts(user_data_dir: str, profile_name: str, chat_url: str, output_dir: str = "./downloads"):
    """Descarga artifacts usando User Data dir + nombre del perfil"""
    
    # Resolver perfil
    print("🔍 Resolviendo perfil...")
    profile_info = resolve_profile(user_data_dir, profile_name)
    
    if not profile_info["success"]:
        raise Exception(profile_info["error"])
    
    print(f"  ✓ Perfil encontrado: {profile_info['display_name']} -> {profile_info['directory_name']}")
    
    profile_path = Path(profile_info["path"])
    
    # Extraer chat ID
    chat_id = chat_url.split("/chat/")[-1].split("?")[0] if "/chat/" in chat_url else "unknown"
    
    # Crear directorio de salida
    output = Path(output_dir) / f"chat_{chat_id}"
    output.mkdir(parents=True, exist_ok=True)
    
    print(f"\n{'='*70}")
    print(f"👤 Perfil: {profile_info['display_name']}")
    print(f"📂 Directorio: {profile_info['directory_name']}")
    print(f"📍 Ruta: {profile_path}")
    print(f"🌐 URL: {chat_url}")
    print(f"📁 Salida: {output}")
    print(f"{'='*70}\n")
    
    with sync_playwright() as p:
        print("🚀 Lanzando Chrome...")
        
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_path),
            headless=False,
            args=[
                '--no-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage'
            ]
        )
        
        # Obtener página
        if context.pages:
            page = context.pages[0]
        else:
            page = context.new_page()
        
        print("🌐 Navegando al chat...")
        page.goto(chat_url, wait_until="networkidle", timeout=30000)
        time.sleep(3)
        
        # Verificar login
        if "/login" in page.url:
            print("❌ Sesión expirada. Vuelve a loguearte.")
            input("\n⏸️ Enter para cerrar...")
            context.close()
            return
        
        print("✅ Cargado\n")
        
        # Guardar HTML
        print("📄 Guardando HTML...")
        with open(output / "conversation.html", 'w', encoding='utf-8') as f:
            f.write(page.content())
        print("  ✓ conversation.html")
        
        # Extraer artifacts
        print("\n🔍 Buscando artifacts...")
        code_blocks = page.locator('pre code').all()
        print(f"📦 Bloques: {len(code_blocks)}\n")
        
        artifacts = []
        for idx, block in enumerate(code_blocks):
            try:
                content = block.inner_text()
                if not content.strip():
                    continue
                
                # Detectar lenguaje
                class_name = block.get_attribute('class') or ''
                ext = 'txt'
                
                if 'language-' in class_name:
                    ext = class_name.split('language-')[-1].split()[0]
                
                # Guardar
                file_path = output / f"artifact_{idx + 1}.{ext}"
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                
                artifacts.append({
                    "index": idx + 1,
                    "file": file_path.name,
                    "language": ext,
                    "size": len(content)
                })
                
                print(f"  ✓ artifact_{idx + 1}.{ext} ({len(content):,} chars)")
                
            except Exception as e:
                print(f"  ⚠️ Error bloque {idx + 1}: {e}")
        
        # Metadata
        print("\n💾 Metadata...")
        metadata = {
            "chat_id": chat_id,
            "url": chat_url,
            "profile": profile_info['display_name'],
            "profile_directory": profile_info['directory_name'],
            "downloaded_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "artifacts_count": len(artifacts),
            "artifacts": artifacts
        }
        
        with open(output / "metadata.json", 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        print("  ✓ metadata.json")
        
        print(f"\n{'='*70}")
        print(f"✅ COMPLETADO - {len(artifacts)} artifacts")
        print(f"📁 {output}")
        print(f"{'='*70}\n")
        
        input("⏸️ Enter para cerrar...")
        context.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Descarga artifacts de Claude con resolver de perfiles integrado",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  # Por nombre de perfil
  python quick_download.py --user-data "%LOCALAPPDATA%\\Google\\Chrome\\User Data" --profile "UiTool" --url "https://claude.ai/chat/xxx"
  
  # Por directorio
  python quick_download.py --user-data "%LOCALAPPDATA%\\Google\\Chrome\\User Data" --profile "Profile 20" --url "https://claude.ai/chat/xxx"
  
  # Default profile
  python quick_download.py --user-data "%LOCALAPPDATA%\\Google\\Chrome\\User Data" --profile "Default" --url "https://claude.ai/chat/xxx"
        """
    )
    
    parser.add_argument(
        "--user-data",
        required=True,
        help="Ruta a User Data de Chrome"
    )
    parser.add_argument(
        "--profile",
        required=True,
        help="Nombre o directorio del perfil (ej: UiTool, Profile 20, Default)"
    )
    parser.add_argument(
        "--url",
        required=True,
        help="URL del chat"
    )
    parser.add_argument(
        "--output",
        default="./downloads",
        help="Directorio de salida"
    )
    
    args = parser.parse_args()
    
    try:
        download_artifacts(args.user_data, args.profile, args.url, args.output)
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        exit(1)