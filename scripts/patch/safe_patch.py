#!/usr/bin/env python3
"""
Safe Patch Applier - Sistema integrado de normalización y aplicación de patches
Funciona con patches de cualquier IA (ChatGPT, Claude, Grok, etc.)

Uso:
    python safe_patch.py <patch_file> [proyecto_dir] [opciones]
"""

import sys
import os
import subprocess
import shutil
import argparse
from pathlib import Path
from datetime import datetime


class SafePatchApplier:
    """Sistema integrado para normalizar y aplicar patches de forma segura."""
    
    def __init__(self, verbose=False, auto_backup=True):
        self.verbose = verbose
        self.auto_backup = auto_backup
        self.archivos_modificados = []
        self.backup_dir = None
    
    def log(self, mensaje, nivel="INFO"):
        """Imprime mensajes con formato."""
        simbolos = {
            "INFO": "ℹ️",
            "SUCCESS": "✅",
            "WARNING": "⚠️",
            "ERROR": "❌",
            "DEBUG": "🔍"
        }
        simbolo = simbolos.get(nivel, "•")
        print(f"{simbolo} {mensaje}")
    
    def crear_backup(self, patch_path, proyecto_path):
        """Crea backup de archivos que serán modificados."""
        if not self.auto_backup:
            return True
        
        self.log("Creando backup de archivos...", "INFO")
        
        # Crear directorio de backup con timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        self.backup_dir = Path(proyecto_path) / ".patch_backups" / timestamp
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        
        # Leer patch para identificar archivos
        try:
            with open(patch_path, 'r', encoding='utf-8') as f:
                contenido = f.read()
            
            # Extraer nombres de archivos del patch
            import re
            archivos = re.findall(r'^\+\+\+ b/(.+)$', contenido, re.MULTILINE)
            
            # Hacer backup de cada archivo
            for archivo_rel in archivos:
                archivo_full = Path(proyecto_path) / archivo_rel
                if archivo_full.exists():
                    backup_path = self.backup_dir / archivo_rel
                    backup_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(archivo_full, backup_path)
                    self.archivos_modificados.append(archivo_rel)
                    if self.verbose:
                        self.log(f"  Backup: {archivo_rel}", "DEBUG")
            
            self.log(f"Backup creado en: {self.backup_dir}", "SUCCESS")
            return True
            
        except Exception as e:
            self.log(f"Error creando backup: {e}", "ERROR")
            return False
    
    def restaurar_backup(self, proyecto_path):
        """Restaura archivos desde el backup."""
        if not self.backup_dir or not self.backup_dir.exists():
            self.log("No hay backup para restaurar", "WARNING")
            return False
        
        self.log("Restaurando archivos desde backup...", "INFO")
        
        try:
            for archivo_rel in self.archivos_modificados:
                backup_path = self.backup_dir / archivo_rel
                archivo_full = Path(proyecto_path) / archivo_rel
                
                if backup_path.exists():
                    shutil.copy2(backup_path, archivo_full)
                    if self.verbose:
                        self.log(f"  Restaurado: {archivo_rel}", "DEBUG")
            
            self.log("Archivos restaurados exitosamente", "SUCCESS")
            return True
            
        except Exception as e:
            self.log(f"Error restaurando backup: {e}", "ERROR")
            return False
    
    def normalizar_patch(self, patch_path):
        """Normaliza el patch usando el normalizador."""
        self.log("Normalizando patch...", "INFO")
        
        try:
            # Ejecutar el normalizador
            resultado = subprocess.run(
                [sys.executable, 'scripts/normalize_patch.py', 
                 str(patch_path), '--fix-all'],
                capture_output=True,
                text=True,
                check=False
            )
            
            if resultado.returncode == 0:
                self.log("Patch normalizado", "SUCCESS")
                if self.verbose and resultado.stdout:
                    print(resultado.stdout)
                return True
            else:
                self.log("Advertencias durante normalización", "WARNING")
                if resultado.stderr:
                    print(resultado.stderr)
                # Continuar de todos modos
                return True
                
        except FileNotFoundError:
            self.log("normalize_patch.py no encontrado, omitiendo normalización", "WARNING")
            return True
        except Exception as e:
            self.log(f"Error normalizando: {e}", "WARNING")
            return True
    
    def validar_patch(self, patch_path, proyecto_path):
        """Valida el patch con dry-run."""
        self.log("Validando patch (simulación)...", "INFO")
        
        patch_abs = os.path.abspath(patch_path)
        proyecto_abs = os.path.abspath(proyecto_path)
        
        try:
            resultado = subprocess.run(
                ['patch', '-p1', '-i', patch_abs, '--dry-run', '--silent'],
                cwd=proyecto_abs,
                capture_output=True,
                text=True,
                check=False
            )
            
            if resultado.returncode == 0:
                self.log("Validación exitosa ✓", "SUCCESS")
                return True
            else:
                self.log("Validación falló:", "ERROR")
                print(resultado.stderr)
                return False
                
        except FileNotFoundError:
            self.log("Comando 'patch' no encontrado en el sistema", "ERROR")
            return False
        except Exception as e:
            self.log(f"Error en validación: {e}", "ERROR")
            return False
    
    def aplicar_patch(self, patch_path, proyecto_path):
        """Aplica el patch real."""
        self.log("Aplicando patch...", "INFO")
        
        patch_abs = os.path.abspath(patch_path)
        proyecto_abs = os.path.abspath(proyecto_path)
        
        try:
            resultado = subprocess.run(
                ['patch', '-p1', '-i', patch_abs],
                cwd=proyecto_abs,
                capture_output=True,
                text=True,
                check=False
            )
            
            if resultado.returncode == 0:
                self.log("Patch aplicado exitosamente ✓", "SUCCESS")
                if self.verbose and resultado.stdout:
                    print(resultado.stdout)
                return True
            else:
                self.log("Error aplicando patch:", "ERROR")
                print(resultado.stderr)
                return False
                
        except Exception as e:
            self.log(f"Error aplicando patch: {e}", "ERROR")
            return False
    
    def mostrar_resumen(self):
        """Muestra resumen de la operación."""
        print("\n" + "=" * 60)
        print("RESUMEN")
        print("=" * 60)
        
        if self.archivos_modificados:
            print(f"\n📝 Archivos modificados: {len(self.archivos_modificados)}")
            for archivo in self.archivos_modificados:
                print(f"   • {archivo}")
        
        if self.backup_dir:
            print(f"\n💾 Backup guardado en: {self.backup_dir}")
            print("   Para restaurar manualmente:")
            print(f"   cp -r {self.backup_dir}/* .")


def main():
    parser = argparse.ArgumentParser(
        description='Sistema seguro de aplicación de patches de cualquier IA',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos:
  %(prog)s patches/cambios.patch
  %(prog)s grok-patch.patch /ruta/proyecto
  %(prog)s fix.patch --no-backup
  %(prog)s changes.patch --verbose

Este script:
  1. Normaliza el patch automáticamente
  2. Valida con simulación (dry-run)
  3. Crea backup de archivos
  4. Aplica el patch
  5. Permite restaurar si algo falla

Funciona con patches de: ChatGPT, Claude, Grok, Gemini, Copilot, etc.
        """
    )
    
    parser.add_argument(
        'patch_file',
        help='Archivo .patch a aplicar'
    )
    
    parser.add_argument(
        'proyecto',
        nargs='?',
        default='.',
        help='Directorio del proyecto (por defecto: actual)'
    )
    
    parser.add_argument(
        '--no-backup',
        action='store_true',
        help='No crear backup automático'
    )
    
    parser.add_argument(
        '--skip-normalize',
        action='store_true',
        help='Omitir normalización (no recomendado)'
    )
    
    parser.add_argument(
        '--skip-validate',
        action='store_true',
        help='Omitir validación (no recomendado)'
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Modo verbose con más detalles'
    )
    
    parser.add_argument(
        '--restore',
        metavar='BACKUP_DIR',
        help='Restaurar desde un directorio de backup específico'
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("SAFE PATCH APPLIER")
    print("Sistema integrado para patches de cualquier IA")
    print("=" * 60)
    
    # Modo restauración
    if args.restore:
        applier = SafePatchApplier(verbose=args.verbose)
        applier.backup_dir = Path(args.restore)
        
        # Detectar archivos en el backup
        if applier.backup_dir.exists():
            for root, dirs, files in os.walk(applier.backup_dir):
                for file in files:
                    rel_path = Path(root).relative_to(applier.backup_dir) / file
                    applier.archivos_modificados.append(str(rel_path))
            
            if applier.restaurar_backup(args.proyecto):
                print("\n✅ Restauración completada")
                sys.exit(0)
            else:
                print("\n❌ Error en restauración")
                sys.exit(1)
        else:
            print(f"\n❌ Directorio de backup no existe: {args.restore}")
            sys.exit(1)
    
    # Validar entrada
    patch_path = Path(args.patch_file)
    if not patch_path.exists():
        print(f"\n❌ Error: Archivo patch no existe: {patch_path}")
        sys.exit(1)
    
    proyecto_path = Path(args.proyecto)
    if not proyecto_path.is_dir():
        print(f"\n❌ Error: Directorio no existe: {proyecto_path}")
        sys.exit(1)
    
    print(f"\n📄 Patch: {patch_path}")
    print(f"📁 Proyecto: {proyecto_path.absolute()}")
    
    # Inicializar applier
    applier = SafePatchApplier(
        verbose=args.verbose,
        auto_backup=not args.no_backup
    )
    
    # Pipeline de aplicación
    try:
        # Paso 1: Normalizar
        if not args.skip_normalize:
            if not applier.normalizar_patch(patch_path):
                print("\n⚠️  Normalización falló, continuando...")
        
        # Paso 2: Crear backup
        if not args.no_backup:
            if not applier.crear_backup(patch_path, proyecto_path):
                respuesta = input("\n⚠️  No se pudo crear backup. ¿Continuar? (s/N): ")
                if respuesta.lower() not in ['s', 'si', 'sí', 'y', 'yes']:
                    print("Operación cancelada")
                    sys.exit(0)
        
        # Paso 3: Validar
        if not args.skip_validate:
            if not applier.validar_patch(patch_path, proyecto_path):
                print("\n❌ El patch no es válido")
                print("\n💡 Intenta normalizar manualmente:")
                print(f"   python scripts/normalize_patch.py {patch_path} --fix-all --verbose")
                sys.exit(1)
        
        # Paso 4: Confirmar
        print("\n⚠️  El patch está listo para aplicarse.")
        respuesta = input("¿Continuar? (s/N): ")
        if respuesta.lower() not in ['s', 'si', 'sí', 'y', 'yes']:
            print("Operación cancelada")
            sys.exit(0)
        
        # Paso 5: Aplicar
        if applier.aplicar_patch(patch_path, proyecto_path):
            applier.mostrar_resumen()
            print("\n✅ ÉXITO: Patch aplicado correctamente")
            sys.exit(0)
        else:
            print("\n❌ ERROR: Fallo al aplicar patch")
            
            if not args.no_backup:
                respuesta = input("\n¿Restaurar desde backup? (S/n): ")
                if respuesta.lower() not in ['n', 'no']:
                    applier.restaurar_backup(proyecto_path)
            
            sys.exit(1)
    
    except KeyboardInterrupt:
        print("\n\n⚠️  Operación interrumpida por el usuario")
        if not args.no_backup and applier.backup_dir:
            respuesta = input("¿Restaurar desde backup? (S/n): ")
            if respuesta.lower() not in ['n', 'no']:
                applier.restaurar_backup(proyecto_path)
        sys.exit(1)
    
    except Exception as e:
        print(f"\n❌ Error inesperado: {e}")
        if args.verbose:
            import traceback
            traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()