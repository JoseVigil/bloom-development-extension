#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brain CLI - Platform Detector
==============================
Detecta plataforma y arquitectura automáticamente.
Usado por todos los scripts de build multiplataforma.
"""
import os
import platform
import sys
from pathlib import Path
from typing import Tuple


class PlatformInfo:
    """Información de la plataforma actual."""
    
    def __init__(self):
        self.system = platform.system().lower()
        self.machine = platform.machine().lower()
        self.is_windows = self.system == "windows"
        self.is_linux = self.system == "linux"
        self.is_darwin = self.system == "darwin"
        
        # Detectar directorio de destino según arquitectura
        self.platform_dir = self._detect_platform_dir()
        self.os_name = self._detect_os_name()
        
    def _detect_platform_dir(self) -> str:
        """
        Retorna el directorio de destino según plataforma/arquitectura.

        Convención (alineada con build-all.py y build-component.sh):
          Windows x64  → win64
          macOS x64    → darwin_x64
          macOS arm64  → darwin_arm64
          Linux x64    → linux_x64
          Linux arm64  → linux_arm64
        """
        if self.is_windows:
            if self.machine in ("amd64", "x86_64"):
                return "win64"
            elif self.machine in ("x86", "i386", "i686"):
                return "win32"
            else:
                return "win64"
        
        elif self.is_linux:
            if self.machine in ("x86_64", "amd64"):
                return "linux_x64"       # corregido: era "linux64"
            elif self.machine in ("aarch64", "arm64"):
                return "linux_arm64"
            else:
                raise RuntimeError(
                    f"Arquitectura Linux no soportada: {self.machine}\n"
                    f"Arquitecturas soportadas: x86_64, arm64"
                )
        
        elif self.is_darwin:
            if self.machine in ("x86_64", "amd64"):
                return "darwin_x64"      # corregido: era "macos64"
            elif self.machine in ("arm64", "aarch64"):
                return "darwin_arm64"    # corregido: era "macos_arm64"
            else:
                raise RuntimeError(
                    f"Arquitectura macOS no soportada: {self.machine}\n"
                    f"Arquitecturas soportadas: x86_64 (Intel), arm64 (Apple Silicon)"
                )
        
        else:
            raise RuntimeError(
                f"Sistema operativo no soportado: {self.system}\n"
                f"Sistemas soportados: Windows, Linux, macOS"
            )
    
    def _detect_os_name(self) -> str:
        """Retorna nombre canónico del OS."""
        if self.is_windows:
            return "windows"
        elif self.is_linux:
            return "linux"
        elif self.is_darwin:
            return "darwin"
        else:
            return self.system

    def _get_nucleus_home(self) -> Path:
        """
        Retorna la raíz canónica de BloomNucleus para la plataforma actual.
        Respeta BLOOM_NUCLEUS_HOME si está definida en el entorno.

          Windows → %LOCALAPPDATA%\\BloomNucleus
          macOS   → ~/Library/BloomNucleus
          Linux   → $XDG_DATA_HOME/BloomNucleus  (default ~/.local/share/BloomNucleus)
        """
        if self.is_windows:
            local_appdata = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData/Local"))
            return Path(os.environ.get("BLOOM_NUCLEUS_HOME", local_appdata / "BloomNucleus"))
        elif self.is_darwin:
            return Path(os.environ.get(
                "BLOOM_NUCLEUS_HOME",
                Path.home() / "Library" / "BloomNucleus"
            ))
        else:  # Linux
            xdg = os.environ.get("XDG_DATA_HOME", str(Path.home() / ".local/share"))
            return Path(os.environ.get("BLOOM_NUCLEUS_HOME", Path(xdg) / "BloomNucleus"))

    def get_log_directory(self) -> Path:
        """
        Retorna directorio de logs bajo la raíz canónica de BloomNucleus.

          Windows → %LOCALAPPDATA%\\BloomNucleus\\logs\\build
          macOS   → ~/Library/BloomNucleus/logs/build       (corregido: era ~/Library/Logs/BloomNucleus/logs/build)
          Linux   → ~/.local/share/BloomNucleus/logs/build
        """
        return self._get_nucleus_home() / "logs" / "build"
    
    def get_log_filename(self) -> str:
        """
        Retorna nombre de archivo de log con sufijo de arquitectura.
        El nombre incluye platform_dir para que coincida con lo que escribe
        build-brain.sh (ej: brain_build_darwin_x64.log) y build-all.py
        pueda appendear el log individual al log central sin errores.

          Windows      → brain_build_win64.log     (era: brain.build.log)
          macOS x64    → brain_build_darwin_x64.log (era: brain_build_darwin.log)
          macOS arm64  → brain_build_darwin_arm64.log
          Linux x64    → brain_build_linux_x64.log  (era: brain_build_linux.log)
        """
        return f"brain_build_{self.platform_dir}.log"
    
    def get_executable_name(self) -> str:
        """Retorna nombre del ejecutable según plataforma."""
        return "brain.exe" if self.is_windows else "brain"
    
    def get_nucleus_path(self, project_root: Path) -> Path:
        """
        Retorna la ruta al binario de Nucleus CLI.

        Prioridad:
          1. NUCLEUS_HOME/bin/nucleus/nucleus  — instalación via rollout (siempre
             disponible si hubo al menos un build completo previo, independiente
             del orden de pasos en la corrida actual).
          2. project_root/installer/native/bin/<platform_dir>/nucleus/nucleus —
             fallback al repo (puede no existir si brain corre antes que nucleus).

        Antes buscaba directamente en el repo con el arch incorrecto "macos64",
        lo que causaba el error:
          ⚠️  Nucleus CLI no encontrado: .../bin/macos64/nucleus/nucleus
        """
        nucleus_exe = "nucleus.exe" if self.is_windows else "nucleus"

        # Opción 1: NUCLEUS_HOME (rollout de build previo — más estable)
        candidate_home = self._get_nucleus_home() / "bin" / "nucleus" / nucleus_exe
        if candidate_home.exists():
            return candidate_home

        # Opción 2: repo con arch correcto (build de esta misma corrida)
        return project_root / "installer/native/bin" / self.platform_dir / "nucleus" / nucleus_exe
    
    def __str__(self) -> str:
        """Representación string."""
        return (
            f"Platform: {self.system}\n"
            f"Machine: {self.machine}\n"
            f"Platform Dir: {self.platform_dir}\n"
            f"OS Name: {self.os_name}"
        )


# Instancia global para fácil importación
PLATFORM = PlatformInfo()


def get_platform_info() -> PlatformInfo:
    """Retorna información de plataforma."""
    return PLATFORM


if __name__ == "__main__":
    # Test del detector
    print("=" * 60)
    print("BRAIN CLI - Platform Detector")
    print("=" * 60)
    print(PLATFORM)
    print()
    print(f"Log Directory: {PLATFORM.get_log_directory()}")
    print(f"Log Filename:  {PLATFORM.get_log_filename()}")
    print(f"Executable:    {PLATFORM.get_executable_name()}")
    print(f"Nucleus Path:  {PLATFORM.get_nucleus_path(Path('.'))}")
    print("=" * 60)
