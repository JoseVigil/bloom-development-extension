import os
from pathlib import Path
from typing import Dict, List, Optional

class MultiStackDetector:
    """
    Escanea el árbol de directorios buscando 'Marcadores de Tecnología'.
    Identifica qué lenguajes/frameworks viven en qué carpetas.
    """

    # Carpetas a ignorar para optimizar el scan
    IGNORED_DIRS = {
        'node_modules', 'venv', '.venv', '__pycache__', '.git', 
        'dist', 'build', 'out', '.next', '.idea', '.vscode'
    }

    # Mapa heurístico: archivo marcador -> tipo de estrategia
    MARKERS = {
        # Web / JS / TS
        "package.json": "typescript",
        "tsconfig.json": "typescript",
        "vite.config.js": "typescript", 
        "vite.config.ts": "typescript",
        
        # Python
        "pyproject.toml": "python",
        "requirements.txt": "python",
        "setup.py": "python",
        "Pipfile": "python",
        
        # Mobile
        "AndroidManifest.xml": "android",
        "build.gradle": "android",
        "build.gradle.kts": "android",
        "Podfile": "ios",
        
        # PHP
        "composer.json": "php",
        "artisan": "php",
        
        # Otros
        "Dockerfile": "docker",
        "docker-compose.yml": "docker",
    }

    def __init__(self, root_path: Path):
        self.root = root_path.resolve()

    def detect(self) -> List[Dict]:
        """
        Retorna una lista de módulos detectados.
        """
        found_modules: Dict[str, Dict] = {}

        # Walk optimizado
        for root, dirs, files in os.walk(self.root):
            # Filtrar directorios ignorados in-place
            dirs[:] = [d for d in dirs if d not in self.IGNORED_DIRS]
            
            current_path = Path(root)
            
            for file in files:
                strategy_type = self._match_marker(file)
                
                if strategy_type:
                    try:
                        rel_path = current_path.relative_to(self.root)
                    except ValueError:
                        continue 

                    str_path = str(rel_path).replace('\\', '/')
                    if str_path == '.': str_path = ''

                    if str_path not in found_modules:
                        found_modules[str_path] = {
                            "type": strategy_type,
                            "path": str_path,
                            "abs_path": current_path,
                            "markers": set()
                        }
                    
                    # Refinamiento de estrategia (Android gana a Java)
                    if strategy_type == 'android' and found_modules[str_path]['type'] == 'java':
                         found_modules[str_path]['type'] = 'android'

                    found_modules[str_path]["markers"].add(file)

        # Convertir a lista y limpiar sets
        result = []
        for mod in found_modules.values():
            mod['markers'] = list(mod['markers'])
            result.append(mod)
            
        # Ordenar: Raíz primero
        return sorted(result, key=lambda x: (x['path'] != '', x['path']))

    def _match_marker(self, filename: str) -> Optional[str]:
        return self.MARKERS.get(filename)