#!/usr/bin/env python3
"""
Script para aplicar archivos .patch a un proyecto.
Maneja rutas relativas y absolutas tanto del patch como del proyecto.

Uso:
    python apply_patch.py <ruta_patch> [ruta_proyecto]
    
Ejemplos:
    python apply_patch.py cambios.patch
    python apply_patch.py /home/user/Downloads/fix.patch /home/user/proyecto
    python apply_patch.py ../patches/update.patch ./mi-app
"""

import sys
import os
import subprocess
import argparse
from pathlib import Path


def validar_archivo_patch(patch_path):
    """Valida que el archivo patch existe y es legible."""
    if not os.path.isfile(patch_path):
        raise FileNotFoundError(f"El archivo patch no existe: {patch_path}")
    
    if not os.access(patch_path, os.R_OK):
        raise PermissionError(f"No se puede leer el archivo: {patch_path}")
    
    return True


def validar_directorio_proyecto(proyecto_path):
    """Valida que el directorio del proyecto existe."""
    if not os.path.isdir(proyecto_path):
        raise NotADirectoryError(f"El directorio no existe: {proyecto_path}")
    
    if not os.access(proyecto_path, os.W_OK):
        raise PermissionError(f"No hay permisos de escritura en: {proyecto_path}")
    
    return True


def verificar_archivos_objetivo(patch_path, proyecto_path):
    """Lee el patch y verifica si los archivos objetivo existen."""
    archivos_encontrados = []
    archivos_faltantes = []
    
    with open(patch_path, 'r', encoding='utf-8') as f:
        for linea in f:
            # Buscar líneas que indican archivos: --- a/archivo o +++ b/archivo
            if linea.startswith('--- a/') or linea.startswith('+++ b/'):
                # Extraer ruta del archivo
                ruta_relativa = linea.split('/', 1)[1].strip()
                ruta_completa = os.path.join(proyecto_path, ruta_relativa)
                
                if linea.startswith('--- a/'):  # Archivo original
                    if os.path.exists(ruta_completa):
                        archivos_encontrados.append(ruta_relativa)
                    else:
                        archivos_faltantes.append(ruta_relativa)
    
    return archivos_encontrados, archivos_faltantes


def aplicar_patch(patch_path, proyecto_path, dry_run=False, verbose=False):
    """
    Aplica el patch usando el comando 'patch'.
    
    Args:
        patch_path: Ruta al archivo .patch
        proyecto_path: Ruta al directorio del proyecto
        dry_run: Si es True, solo simula sin aplicar cambios
        verbose: Si es True, muestra más información
    
    Returns:
        tuple: (éxito: bool, mensaje: str)
    """
    # Convertir a rutas absolutas
    patch_abs = os.path.abspath(patch_path)
    proyecto_abs = os.path.abspath(proyecto_path)
    
    # Construir comando
    cmd = ['patch', '-p1', '-i', patch_abs]
    
    if dry_run:
        cmd.append('--dry-run')
    
    if verbose:
        cmd.append('--verbose')
    else:
        cmd.append('--silent')
    
    try:
        resultado = subprocess.run(
            cmd,
            cwd=proyecto_abs,
            capture_output=True,
            text=True,
            check=False
        )
        
        if resultado.returncode == 0:
            return True, "Patch aplicado exitosamente"
        else:
            return False, f"Error al aplicar patch:\n{resultado.stderr}"
            
    except FileNotFoundError:
        return False, "Error: El comando 'patch' no está instalado en el sistema"
    except Exception as e:
        return False, f"Error inesperado: {str(e)}"


def main():
    parser = argparse.ArgumentParser(
        description="""
Aplica archivos .patch a un proyecto de forma segura y controlada.

Este script facilita la aplicación de parches (diff unificados) generados
por herramientas de control de versiones o IAs. Valida archivos, verifica
objetivos y permite simulaciones antes de aplicar cambios reales.
        """,
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Ejemplos de uso:
  
  Aplicar patch en el directorio actual:
    %(prog)s cambios.patch
  
  Aplicar patch en un directorio específico:
    %(prog)s cambios.patch /ruta/al/proyecto
    %(prog)s /tmp/fix.patch ~/mi-app
  
  Simular primero (RECOMENDADO - no hace cambios):
    %(prog)s cambios.patch --dry-run
  
  Ver información detallada durante la aplicación:
    %(prog)s cambios.patch --verbose
  
  Combinar opciones:
    %(prog)s updates.patch --dry-run --verbose
  
  Saltar verificación de archivos:
    %(prog)s cambios.patch --no-verify

Notas importantes:
  - Siempre usa --dry-run primero para verificar qué cambiará
  - El comando 'patch' debe estar instalado en tu sistema
  - Los archivos se modifican en su lugar (sin backup automático)
  - Usa control de versiones (git) antes de aplicar parches

Requisitos:
  - Python 3.6+
  - Comando 'patch' disponible en el PATH
        """
    )
    
    parser.add_argument(
        'patch',
        help='Ruta al archivo .patch'
    )
    
    parser.add_argument(
        'proyecto',
        nargs='?',
        default='.',
        help='Ruta al directorio del proyecto (por defecto: directorio actual)'
    )
    
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Simula la aplicación sin hacer cambios reales'
    )
    
    parser.add_argument(
        '-v', '--verbose',
        action='store_true',
        help='Muestra información detallada'
    )
    
    parser.add_argument(
        '--no-verify',
        action='store_true',
        help='No verifica archivos antes de aplicar el patch'
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("APLICADOR DE PARCHES")
    print("=" * 60)
    
    # Validar entradas
    try:
        print(f"\n📄 Archivo patch: {args.patch}")
        validar_archivo_patch(args.patch)
        print("   ✓ Archivo válido")
        
        print(f"\n📁 Directorio proyecto: {args.proyecto}")
        validar_directorio_proyecto(args.proyecto)
        print("   ✓ Directorio válido")
        
    except (FileNotFoundError, NotADirectoryError, PermissionError) as e:
        print(f"\n❌ ERROR: {e}")
        sys.exit(1)
    
    # Verificar archivos objetivo
    if not args.no_verify:
        print("\n🔍 Verificando archivos objetivo...")
        encontrados, faltantes = verificar_archivos_objetivo(args.patch, args.proyecto)
        
        if encontrados:
            print(f"   ✓ Archivos encontrados: {len(encontrados)}")
            if args.verbose:
                for archivo in encontrados:
                    print(f"     - {archivo}")
        
        if faltantes:
            print(f"\n   ⚠️  ADVERTENCIA: Archivos no encontrados: {len(faltantes)}")
            for archivo in faltantes:
                print(f"     - {archivo}")
            
            respuesta = input("\n¿Continuar de todos modos? (s/N): ")
            if respuesta.lower() not in ['s', 'si', 'sí', 'y', 'yes']:
                print("Operación cancelada")
                sys.exit(0)
    
    # Aplicar patch
    modo = "SIMULACIÓN" if args.dry_run else "APLICANDO"
    print(f"\n🔧 {modo} patch...")
    
    exito, mensaje = aplicar_patch(
        args.patch,
        args.proyecto,
        dry_run=args.dry_run,
        verbose=args.verbose
    )
    
    print()
    if exito:
        print(f"✅ {mensaje}")
        if args.dry_run:
            print("\n💡 Ejecuta sin --dry-run para aplicar los cambios realmente")
        sys.exit(0)
    else:
        print(f"❌ {mensaje}")
        sys.exit(1)


if __name__ == "__main__":
    main()