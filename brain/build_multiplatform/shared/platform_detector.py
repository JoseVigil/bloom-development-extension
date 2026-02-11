#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Brain CLI - Platform Detector
==============================
Detecta plataforma y arquitectura automáticamente.
Usado por todos los scripts de build multiplataforma.
"""
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
        """Retorna el directorio de destino según plataforma/arquitectura."""
        if self.is_windows:
            # En Windows, sys.platform siempre es 'win32' incluso en 64-bit
            # Usamos platform.machine() para detectar la arquitectura real
            if self.machine in ("amd64", "x86_64"):
                return "win64"
            elif self.machine in ("x86", "i386", "i686"):
                return "win32"
            else:
                # Por defecto asumimos 64-bit (es el estándar moderno)
                return "win64"
        
        elif self.is_linux:
            if self.machine in ("x86_64", "amd64"):
                return "linux64"
            elif self.machine in ("aarch64", "arm64"):
                return "linux_arm64"
            else:
                raise RuntimeError(
                    f"Arquitectura Linux no soportada: {self.machine}\n"
                    f"Arquitecturas soportadas: x86_64, arm64"
                )
        
        elif self.is_darwin:
            if self.machine in ("x86_64", "amd64"):
                return "macos64"
            elif self.machine in ("arm64", "aarch64"):
                return "macos_arm64"
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
    
    def get_log_directory(self) -> Path:
        """Retorna directorio de logs según BloomNucleus Spec."""
        if self.is_windows:
            # Windows: %LOCALAPPDATA%\BloomNucleus\logs\build
            local_appdata = Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData/Local'))
            return local_appdata / "BloomNucleus/logs/build"
        
        elif self.is_linux:
            # Linux: ~/.local/share/BloomNucleus/logs/build
            return Path.home() / ".local/share/BloomNucleus/logs/build"
        
        elif self.is_darwin:
            # macOS: ~/Library/Logs/BloomNucleus/logs/build
            return Path.home() / "Library/Logs/BloomNucleus/logs/build"
        
        else:
            # Fallback
            return Path.home() / ".bloom/logs/build"
    
    def get_log_filename(self) -> str:
        """Retorna nombre de archivo de log según BloomNucleus Spec."""
        if self.is_windows:
            return "brain.build.log"
        elif self.is_linux:
            return "brain_build_linux.log"
        elif self.is_darwin:
            return "brain_build_darwin.log"
        else:
            return "brain_build.log"
    
    def get_executable_name(self) -> str:
        """Retorna nombre del ejecutable según plataforma."""
        return "brain.exe" if self.is_windows else "brain"
    
    def get_nucleus_path(self, project_root: Path) -> Path:
        """Retorna ruta a Nucleus CLI según plataforma."""
        nucleus_dir = project_root / "installer/native/bin" / self.platform_dir / "nucleus"
        
        if self.is_windows:
            return nucleus_dir / "nucleus.exe"
        else:
            return nucleus_dir / "nucleus"
    
    def __str__(self) -> str:
        """Representación string."""
        return (
            f"Platform: {self.system}\n"
            f"Machine: {self.machine}\n"
            f"Platform Dir: {self.platform_dir}\n"
            f"OS Name: {self.os_name}"
        )


# Instancia global para fácil importación
import os
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
    print("=" * 60)