# brain/core/ionpump/ionpump_registry.py
#
# Registry en memoria de paquetes Ion v2.0.
#
# CHANGELOG respecto a v4:
#   - _RegistryEntry eliminado — reemplazado por IonSitePackage (el nuevo modelo
#     contiene manifest + path + actions + pages + shared).
#   - register() → register_package() que acepta IonSitePackage directamente.
#   - get_manifest() y get_path() preservados para compatibilidad con el manager.
#   - get_recipe() / set_recipe() eliminados (acceso es via get_package() ahora).
#   - invalidate() → invalida eliminando el paquete (se recarga completo).
#   - Nuevo: get_package(), update_package().

from pathlib import Path
from typing import Dict, List, Optional

from brain.core.ionpump.ionpump_models import IonManifest, IonSitePackage


class IonRegistry:
    """
    Registry en memoria para paquetes Ion v2.0.

    Invariantes:
    - Cada entrada tiene siempre un IonSitePackage (cargado al startup o hot-reload).
    - El registry nunca escribe al filesystem.
    - Thread-safety: el manager es responsable de serializar accesos concurrentes
      (el registry en sí no añade locks para mantenerlo simple y testeable).
    """

    def __init__(self) -> None:
        self._packages: Dict[str, IonSitePackage] = {}

    # ------------------------------------------------------------------
    # Registro
    # ------------------------------------------------------------------

    def register_package(self, site: str, package: IonSitePackage) -> None:
        """Registra o reemplaza el paquete para un site."""
        self._packages[site] = package

    # ------------------------------------------------------------------
    # Acceso al paquete completo
    # ------------------------------------------------------------------

    def get_package(self, site: str) -> Optional[IonSitePackage]:
        """Retorna el IonSitePackage completo si está registrado, si no None."""
        return self._packages.get(site)

    def update_package(self, site: str, package: IonSitePackage) -> None:
        """
        Actualiza el paquete para un site (usado en hot-reload).
        No-op si el site no está registrado previamente — usa register_package() en ese caso.
        """
        if site in self._packages:
            self._packages[site] = package
        else:
            self._packages[site] = package

    # ------------------------------------------------------------------
    # Acceso a sub-componentes (compatibilidad con manager y watchdog)
    # ------------------------------------------------------------------

    def get_manifest(self, site: str) -> Optional[IonManifest]:
        """Retorna el manifest si el site está registrado, si no None."""
        package = self._packages.get(site)
        return package.manifest if package is not None else None

    def get_path(self, site: str) -> Optional[Path]:
        """Retorna el root_path del paquete si está registrado, si no None."""
        package = self._packages.get(site)
        return package.root_path if package is not None else None

    def invalidate(self, site: str) -> None:
        """
        Elimina el paquete del registry (usado por watchdog antes de recargar).
        No-op si el site no existe.
        """
        self._packages.pop(site, None)

    # ------------------------------------------------------------------
    # Enumeración
    # ------------------------------------------------------------------

    def list_sites(self) -> List[str]:
        """Retorna todos los nombres de sites registrados."""
        return list(self._packages.keys())

    def __len__(self) -> int:
        return len(self._packages)
