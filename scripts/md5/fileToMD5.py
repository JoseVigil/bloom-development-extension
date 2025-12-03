#!/usr/bin/env python3
"""
Script para descargar archivos remotos y calcular su hash MD5.
Soporta URLs HTTP y HTTPS, con validación de errores completa.
"""

import argparse
import hashlib
import os
import sys
import tempfile
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError
from urllib.parse import urlparse


def validate_url(url):
    """
    Valida que la URL sea válida y use protocolo HTTP o HTTPS.
    
    Args:
        url (str): URL a validar
        
    Returns:
        bool: True si es válida, False en caso contrario
    """
    try:
        result = urlparse(url)
        return all([result.scheme, result.netloc]) and result.scheme in ['http', 'https']
    except Exception:
        return False


def download_file(url, timeout=30):
    """
    Descarga un archivo desde una URL a un directorio temporal.
    
    Args:
        url (str): URL del archivo a descargar
        timeout (int): Tiempo máximo de espera en segundos
        
    Returns:
        tuple: (ruta_archivo, nombre_archivo, tamaño) o (None, None, None) si falla
    """
    if not validate_url(url):
        print(f"Error: URL inválida: {url}")
        return None, None, None
    
    # Extraer nombre del archivo de la URL
    filename = os.path.basename(urlparse(url).path)
    if not filename:
        filename = "downloaded_file"
    
    try:
        # Crear petición con user-agent para evitar bloqueos
        req = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        
        print(f"Descargando archivo desde: {url}")
        print("Por favor espere...")
        
        with urlopen(req, timeout=timeout) as response:
            # Verificar código de respuesta
            if response.status != 200:
                print(f"Error: El servidor respondió con código {response.status}")
                return None, None, None
            
            # Crear archivo temporal
            temp_dir = tempfile.gettempdir()
            temp_path = os.path.join(temp_dir, filename)
            
            # Descargar archivo
            file_size = 0
            with open(temp_path, 'wb') as f:
                while True:
                    chunk = response.read(8192)
                    if not chunk:
                        break
                    f.write(chunk)
                    file_size += len(chunk)
            
            # Verificar que el archivo no esté vacío
            if file_size == 0:
                print("Error: El archivo descargado está vacío")
                os.remove(temp_path)
                return None, None, None
            
            print(f"Descarga completada: {format_size(file_size)}")
            return temp_path, filename, file_size
            
    except HTTPError as e:
        print(f"Error HTTP: {e.code} - {e.reason}")
        return None, None, None
    except URLError as e:
        print(f"Error de conexión: {e.reason}")
        return None, None, None
    except TimeoutError:
        print(f"Error: Tiempo de espera agotado ({timeout}s)")
        return None, None, None
    except Exception as e:
        print(f"Error inesperado al descargar: {str(e)}")
        return None, None, None


def compute_md5(filepath, block_size=8192):
    """
    Calcula el hash MD5 de un archivo.
    
    Args:
        filepath (str): Ruta del archivo
        block_size (int): Tamaño del bloque de lectura en bytes
        
    Returns:
        str: Hash MD5 en formato hexadecimal o None si falla
    """
    try:
        md5_hash = hashlib.md5()
        
        with open(filepath, 'rb') as f:
            while True:
                data = f.read(block_size)
                if not data:
                    break
                md5_hash.update(data)
        
        return md5_hash.hexdigest()
        
    except FileNotFoundError:
        print(f"Error: Archivo no encontrado: {filepath}")
        return None
    except PermissionError:
        print(f"Error: Sin permisos para leer el archivo: {filepath}")
        return None
    except Exception as e:
        print(f"Error al calcular MD5: {str(e)}")
        return None


def format_size(size_bytes):
    """
    Formatea el tamaño de bytes a una representación legible.
    
    Args:
        size_bytes (int): Tamaño en bytes
        
    Returns:
        str: Tamaño formateado
    """
    for unit in ['B', 'KB', 'MB', 'GB']:
        if size_bytes < 1024.0:
            return f"{size_bytes:.2f} {unit}"
        size_bytes /= 1024.0
    return f"{size_bytes:.2f} TB"


def main():
    """
    Función principal del script.
    """
    parser = argparse.ArgumentParser(
        description='Descarga un archivo remoto y calcula su hash MD5.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog='''
Ejemplos de uso:
  %(prog)s https://ejemplo.com/archivo.zip
  %(prog)s http://ejemplo.com/imagen.jpg
  %(prog)s --help

Descripción:
  Este script descarga un archivo desde una URL HTTP/HTTPS a un directorio
  temporal, calcula su hash MD5 y muestra la información del archivo.

Dependencias:
  - Python 3.x
  - Librerías estándar: urllib, hashlib, argparse, tempfile, os, sys

Notas:
  - El archivo se descarga en el directorio temporal del sistema
  - Soporta archivos de cualquier tamaño
  - Incluye validación completa de errores
  - Timeout de descarga: 30 segundos
        '''
    )
    
    parser.add_argument(
        'url',
        help='URL del archivo a descargar (HTTP o HTTPS)'
    )
    
    parser.add_argument(
        '--timeout',
        type=int,
        default=30,
        help='Tiempo máximo de espera en segundos (default: 30)'
    )
    
    args = parser.parse_args()
    
    print("=" * 70)
    print("DESCARGADOR DE ARCHIVOS CON HASH MD5")
    print("=" * 70)
    print()
    
    # Descargar archivo
    filepath, filename, filesize = download_file(args.url, args.timeout)
    
    if filepath is None:
        print("\n❌ La descarga falló. Revise los errores anteriores.")
        sys.exit(1)
    
    print()
    print("Calculando hash MD5...")
    
    # Calcular MD5
    md5_hash = compute_md5(filepath)
    
    if md5_hash is None:
        print("\n❌ No se pudo calcular el hash MD5.")
        sys.exit(1)
    
    # Mostrar resultados
    print()
    print("=" * 70)
    print("RESULTADO")
    print("=" * 70)
    print(f"Nombre del archivo: {filename}")
    print(f"Tamaño:             {format_size(filesize)}")
    print(f"Hash MD5:           {md5_hash}")
    print(f"Ubicación:          {filepath}")
    print("=" * 70)
    print()
    print("✓ Proceso completado exitosamente")
    
    # Limpiar archivo temporal (opcional)
    try:
        # Descomentar la siguiente línea si desea eliminar el archivo automáticamente
        # os.remove(filepath)
        pass
    except Exception:
        pass


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️  Proceso interrumpido por el usuario")
        sys.exit(130)
    except Exception as e:
        print(f"\n❌ Error fatal: {str(e)}")
        sys.exit(1)