#!/usr/bin/env python3
"""
Chrome Profile Name Resolver
Resuelve display names ("UiTool") a directory names ("Profile 9")
"""

import json
import os
import sys
from pathlib import Path
from typing import Optional, Dict, List


class ChromeProfileResolver:
    """Resuelve nombres de perfiles de Chrome"""
    
    def __init__(self, user_data_dir: str):
        self.user_data_dir = Path(user_data_dir)
        self.local_state_path = self.user_data_dir / "Local State"
        self.profiles_info: Dict = {}
        self._load_local_state()
    
    def _load_local_state(self):
        """Carga el archivo Local State de Chrome"""
        if not self.local_state_path.exists():
            raise FileNotFoundError(f"Local State not found: {self.local_state_path}")
        
        try:
            with open(self.local_state_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.profiles_info = data.get('profile', {}).get('info_cache', {})
        except Exception as e:
            raise Exception(f"Error loading Local State: {e}")
    
    def resolve_profile_name(self, name: str) -> str:
        """
        Resuelve un nombre de perfil a su directory name
        
        Args:
            name: Puede ser display name ("UiTool"), directory name ("Profile 9"),
                  o username ("uitool@example.com")
        
        Returns:
            Directory name ("Profile 9", "Default", etc.)
        """
        # Caso 1: Ya es un directory name válido
        if self._is_valid_directory_name(name):
            return name
        
        # Caso 2: Es un display name
        dir_name = self._find_by_display_name(name)
        if dir_name:
            return dir_name
        
        # Caso 3: Es un username/email
        dir_name = self._find_by_username(name)
        if dir_name:
            return dir_name
        
        # Si no se encontró nada
        raise ValueError(f"Profile not found: {name}")
    
    def _is_valid_directory_name(self, name: str) -> bool:
        """Verifica si el nombre es un directory name válido"""
        if name == "Default":
            return True
        
        if name.startswith("Profile "):
            try:
                int(name.split()[1])
                return True
            except (IndexError, ValueError):
                pass
        
        return False
    
    def _find_by_display_name(self, display_name: str) -> Optional[str]:
        """Busca por display name (ej: "UiTool")"""
        for dir_name, info in self.profiles_info.items():
            if info.get('name') == display_name:
                return dir_name
        return None
    
    def _find_by_username(self, username: str) -> Optional[str]:
        """Busca por username/email"""
        for dir_name, info in self.profiles_info.items():
            if info.get('user_name') == username:
                return dir_name
        return None
    
    def get_display_name(self, directory_name: str) -> str:
        """Obtiene el display name de un directory name"""
        info = self.profiles_info.get(directory_name, {})
        return info.get('name', directory_name)
    
    def list_all_profiles(self) -> List[Dict[str, str]]:
        """Lista todos los perfiles"""
        profiles = []
        for dir_name, info in self.profiles_info.items():
            profiles.append({
                'directory': dir_name,
                'display_name': info.get('name', dir_name),
                'username': info.get('user_name', 'N/A'),
                'path': str(self.user_data_dir / dir_name)
            })
        return profiles
    
    def get_profile_path(self, name: str) -> Path:
        """Obtiene la ruta completa del perfil"""
        dir_name = self.resolve_profile_name(name)
        return self.user_data_dir / dir_name


# ============================================================================
# CLI PARA TESTING
# ============================================================================

def get_default_user_data_dir() -> str:
    """Auto-detecta el directorio User Data según el OS"""
    import platform
    
    system = platform.system()
    
    if system == 'Windows':
        local_app_data = os.getenv('LOCALAPPDATA')
        if not local_app_data:
            raise Exception("LOCALAPPDATA environment variable not found")
        return os.path.join(local_app_data, 'Google', 'Chrome', 'User Data')
    
    elif system == 'Darwin':  # macOS
        home = os.path.expanduser('~')
        return os.path.join(home, 'Library', 'Application Support', 'Google', 'Chrome')
    
    elif system == 'Linux':
        home = os.path.expanduser('~')
        return os.path.join(home, '.config', 'google-chrome')
    
    else:
        raise Exception(f"Unsupported OS: {system}")


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description='Chrome Profile Resolver')
    parser.add_argument('--user-data', help='Chrome User Data directory (auto-detected if not provided)')
    parser.add_argument('--profile', help='Profile name to resolve')
    parser.add_argument('--list', action='store_true', help='List all profiles')
    
    args = parser.parse_args()
    
    # Auto-detectar user-data si no se proporcionó
    user_data_dir = args.user_data
    if not user_data_dir:
        try:
            user_data_dir = get_default_user_data_dir()
            print(f"Auto-detected User Data: {user_data_dir}\n")
        except Exception as e:
            print(f"Error: {e}", file=sys.stderr)
            print("Please specify --user-data manually", file=sys.stderr)
            sys.exit(1)
    
    try:
        resolver = ChromeProfileResolver(args.user_data)
        
        if args.list:
            # Listar todos los perfiles
            profiles = resolver.list_all_profiles()
            print("\n=== Chrome Profiles ===\n")
            for p in profiles:
                print(f"Display Name: {p['display_name']}")
                print(f"Directory:    {p['directory']}")
                print(f"Username:     {p['username']}")
                print(f"Path:         {p['path']}")
                print("-" * 50)
        
        elif args.profile:
            # Resolver un nombre específico
            try:
                dir_name = resolver.resolve_profile_name(args.profile)
                display_name = resolver.get_display_name(dir_name)
                path = resolver.get_profile_path(args.profile)
                
                print(json.dumps({
                    'success': True,
                    'input': args.profile,
                    'directory_name': dir_name,
                    'display_name': display_name,
                    'path': str(path)
                }, indent=2))
                
            except ValueError as e:
                print(json.dumps({
                    'success': False,
                    'error': str(e)
                }), file=sys.stderr)
                sys.exit(1)
        
        else:
            parser.print_help()
    
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': str(e)
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()