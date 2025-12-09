import os
import shutil
import sys
import ctypes
import subprocess
import time

def is_admin():
    """Verifica si el script se está ejecutando con privilegios de administrador"""
    try:
        return ctypes.windll.shell32.IsUserAnAdmin()
    except:
        return False

def kill_dll_locking_processes():
    """Mata procesos que puedan estar bloqueando archivos DLL"""
    print("[INFO] Buscando procesos que puedan bloquear DLLs...")
    
    # Procesos comunes que podrían estar usando DLLs
    processes_to_check = [
        "bloom-host.exe",
        "svchost.exe",  # Podría tener DLLs cargadas
        "explorer.exe", # Windows Explorer a veces bloquea archivos
    ]
    
    for process in processes_to_check:
        try:
            result = subprocess.run(
                ['tasklist', '/FI', f'IMAGENAME eq {process}', '/NH'],
                capture_output=True,
                text=True,
                shell=True
            )
            
            if process.lower() in result.stdout.lower():
                print(f"  Encontrado: {process}")
                
                # Usar handle.exe para ver qué archivos tiene abiertos
                try:
                    handle_result = subprocess.run(
                        ['handle.exe', '-p', process, 'libwinpthread-1.dll'],
                        capture_output=True,
                        text=True,
                        shell=True
                    )
                    
                    if 'libwinpthread-1.dll' in handle_result.stdout:
                        print(f"  ⚠  {process} tiene bloqueado libwinpthread-1.dll")
                        print(f"    Terminando proceso...")
                        subprocess.run(['taskkill', '/F', '/IM', process], 
                                     capture_output=True, shell=True)
                        time.sleep(1)
                except:
                    # Si handle.exe no está disponible, solo terminar el proceso
                    subprocess.run(['taskkill', '/F', '/IM', process], 
                                 capture_output=True, shell=True)
                    time.sleep(1)
                    
        except Exception as e:
            print(f"  ⚠  Error verificando {process}: {e}")

def unlock_file_with_powershell(file_path):
    """Intenta desbloquear un archivo usando PowerShell"""
    try:
        unlock_script = f"""
        $file = "{file_path}"
        if (Test-Path $file) {{
            try {{
                # Intentar quitar atributo de solo lectura
                Set-ItemProperty $file -Name IsReadOnly -Value $false -ErrorAction SilentlyContinue
                
                # Tomar ownership del archivo
                takeown /f $file /a 2>$null
                icacls $file /grant Administrators:F 2>$null
                
                return "SUCCESS"
            }} catch {{
                return "ERROR: $_"
            }}
        }} else {{
            return "FILE_NOT_FOUND"
        }}
        """
        
        result = subprocess.run(
            ['powershell', '-Command', unlock_script],
            capture_output=True,
            text=True,
            shell=True
        )
        
        return result.stdout.strip()
    except Exception as e:
        return f"EXCEPTION: {e}"

def force_copy_file(source, destination):
    """Fuerza la copia de un archivo con múltiples métodos"""
    print(f"  Forzando copia de {os.path.basename(source)}...")
    
    # Método 1: Intentar eliminar el archivo destino primero
    try:
        if os.path.exists(destination):
            print(f"    Intentando eliminar archivo destino existente...")
            
            # Quitar atributo de solo lectura
            subprocess.run(['attrib', '-R', destination], 
                          capture_output=True, shell=True)
            
            # Intentar eliminar
            os.remove(destination)
            print(f"    ✓ Archivo destino eliminado")
            time.sleep(0.5)
    except Exception as e:
        print(f"    ⚠  No se pudo eliminar: {e}")
    
    # Método 2: Usar robocopy con forzado
    try:
        print(f"    Copiando con robocopy forzado...")
        result = subprocess.run(
            ['robocopy', os.path.dirname(source), os.path.dirname(destination), 
             os.path.basename(source), 
             '/COPYALL',  # Copiar todos los atributos
             '/IS',       # Incluir archivos idénticos
             '/R:0',      # 0 reintentos
             '/W:0',      # 0 espera entre reintentos
             '/NP',       # No mostrar porcentaje
             '/LOG+:copy_log.txt'],  # Log para debugging
            capture_output=True,
            text=True,
            shell=True
        )
        
        if result.returncode <= 1:  # 0=éxito, 1=archivos copiados
            print(f"    ✓ Robocopy exitoso")
            return True
        else:
            print(f"    ✗ Robocopy falló: {result.stderr}")
    except Exception as e:
        print(f"    ✗ Error en robocopy: {e}")
    
    # Método 3: Usar copy de Windows con verificación
    try:
        print(f"    Intentando con copy de Windows...")
        result = subprocess.run(
            ['copy', '/Y', '/V', source, destination],
            capture_output=True,
            text=True,
            shell=True
        )
        
        if result.returncode == 0:
            print(f"    ✓ Copy exitoso")
            return True
        else:
            print(f"    ✗ Copy falló: {result.stderr}")
    except Exception as e:
        print(f"    ✗ Error en copy: {e}")
    
    # Método 4: Usar PowerShell
    try:
        print(f"    Intentando con PowerShell...")
        ps_script = f"""
        $source = "{source}"
        $dest = "{destination}"
        try {{
            Copy-Item $source $dest -Force -Confirm:$false
            if (Test-Path $dest) {{
                Write-Output "SUCCESS"
            }} else {{
                Write-Output "FAILED"
            }}
        }} catch {{
            Write-Output "ERROR: $_"
        }}
        """
        
        result = subprocess.run(
            ['powershell', '-Command', ps_script],
            capture_output=True,
            text=True,
            shell=True
        )
        
        if "SUCCESS" in result.stdout:
            print(f"    ✓ PowerShell exitoso")
            return True
        else:
            print(f"    ✗ PowerShell falló: {result.stdout}")
    except Exception as e:
        print(f"    ✗ Error en PowerShell: {e}")
    
    return False

def stop_and_remove_service():
    """Detiene y elimina el servicio Bloom Nucleus si existe"""
    service_name = "BloomNucleus"
    
    print("\n" + "="*60)
    print("GESTIÓN DEL SERVICIO BLOOM NUCLEUS")
    print("="*60)
    
    try:
        # Verificar si el servicio existe
        result = subprocess.run(
            ['sc', 'query', service_name],
            capture_output=True,
            text=True,
            shell=True
        )
        
        service_exists = "STATE" in result.stdout
        
        if not service_exists:
            print(f"[INFO] El servicio '{service_name}' no está instalado.")
            return True
            
        print(f"[INFO] Servicio '{service_name}' encontrado.")
        
        # 1. Detener el servicio si está ejecutándose
        print("[PASO 1] Verificando estado del servicio...")
        status_result = subprocess.run(
            ['sc', 'query', service_name],
            capture_output=True,
            text=True,
            shell=True
        )
        
        if "RUNNING" in status_result.stdout:
            print("[PASO 2] Deteniendo el servicio...")
            stop_result = subprocess.run(
                ['sc', 'stop', service_name],
                capture_output=True,
                text=True,
                shell=True
            )
            
            if stop_result.returncode == 0:
                print("  ✓ Servicio detenido exitosamente")
            else:
                print(f"  ⚠  No se pudo detener el servicio: {stop_result.stderr}")
            
            # Esperar a que el servicio se detenga completamente
            print("[PASO 3] Esperando a que el servicio se detenga...")
            for i in range(10):
                status_check = subprocess.run(
                    ['sc', 'query', service_name],
                    capture_output=True,
                    text=True,
                    shell=True
                )
                
                if "STOPPED" in status_check.stdout:
                    print("  ✓ Servicio completamente detenido")
                    break
                    
                print(f"  Esperando... ({i+1}/10)")
                time.sleep(1)
        
        # 2. Eliminar el servicio
        print("[PASO 4] Eliminando el servicio...")
        delete_result = subprocess.run(
            ['sc', 'delete', service_name],
            capture_output=True,
            text=True,
            shell=True
        )
        
        if delete_result.returncode == 0:
            print("  ✓ Servicio eliminado exitosamente")
            return True
        else:
            print(f"  ✗ Error eliminando servicio: {delete_result.stderr}")
            return False
            
    except Exception as e:
        print(f"  ✗ Error en gestión del servicio: {e}")
        return False

def kill_process_if_running(process_name):
    """Mata un proceso si está en ejecución"""
    try:
        result = subprocess.run(
            ['tasklist', '/FI', f'IMAGENAME eq {process_name}', '/NH'],
            capture_output=True,
            text=True,
            shell=True
        )
        
        if process_name.lower() in result.stdout.lower():
            print(f"[INFO] Proceso '{process_name}' encontrado en ejecución, terminando...")
            subprocess.run(['taskkill', '/F', '/IM', process_name], 
                         capture_output=True, shell=True)
            time.sleep(2)  # Dar más tiempo para que termine
            print(f"  ✓ Proceso terminado")
            
    except Exception as e:
        print(f"  ⚠  Error verificando proceso: {e}")

def verify_file_copy(source, destination):
    """Verifica que la copia fue exitosa comparando fechas y tamaños"""
    if not os.path.exists(source) or not os.path.exists(destination):
        return False
    
    source_stats = os.stat(source)
    dest_stats = os.stat(destination)
    
    source_mtime = source_stats.st_mtime
    dest_mtime = dest_stats.st_mtime
    
    source_size = source_stats.st_size
    dest_size = dest_stats.st_size
    
    # Convertir timestamps a formato legible
    from datetime import datetime
    source_time = datetime.fromtimestamp(source_mtime).strftime('%Y-%m-%d %H:%M:%S')
    dest_time = datetime.fromtimestamp(dest_mtime).strftime('%Y-%m-%d %H:%M:%S')
    
    print(f"    Verificación:")
    print(f"    - Origen:  {source_time}, Tamaño: {source_size} bytes")
    print(f"    - Destino: {dest_time}, Tamaño: {dest_size} bytes")
    
    if abs(source_mtime - dest_mtime) < 2 and source_size == dest_size:
        print(f"    ✓ Archivos idénticos (copiado exitoso)")
        return True
    else:
        print(f"    ✗ Archivos diferentes (copia falló)")
        return False

def copy_files():
    try:
        # Verificar si estamos ejecutando como administrador
        if not is_admin():
            print("❌ Este script requiere privilegios de administrador.")
            print("\nPor favor, ejecuta de una de estas formas:")
            print("1. Desde PowerShell como administrador:")
            print('   Start-Process python -ArgumentList "deploy_service.py" -Verb RunAs')
            print("\n2. Hacer doble click y seleccionar 'Ejecutar como administrador'")
            input("\nPresiona Enter para salir y volver a intentar...")
            return
        
        print("✅ Ejecutando con privilegios de administrador...")
        
        # Obtener la ruta del directorio donde está este script
        script_dir = os.path.dirname(os.path.abspath(__file__))
        
        # Ruta relativa desde scripts/deploy a installer/native/bin/win32
        origen_dir = os.path.join(script_dir, "..", "..", "installer", "native", "bin", "win32")
        origen_dir = os.path.normpath(origen_dir)
        
        # Archivos a copiar
        archivos = ["bloom-host.exe", "libwinpthread-1.dll"]
        
        # Ruta de destino absoluta
        destino_dir = r"C:\Program Files\BloomNucleus\native"
        
        print("\n" + "="*60)
        print("DESPLIEGUE DE BLOOM NUCLEUS (FORZADO)")
        print("="*60)
        print(f"Script ubicado en: {script_dir}")
        print(f"Buscando archivos en: {origen_dir}")
        print(f"Copiando a: {destino_dir}")
        
        # 1. Matar procesos que bloqueen DLLs
        print("\n[FASE 1] Terminando procesos bloqueadores...")
        kill_dll_locking_processes()
        kill_process_if_running("bloom-host.exe")
        
        # 2. Detener y eliminar el servicio
        print("\n[FASE 2] Gestionando servicio Windows...")
        if not stop_and_remove_service():
            print("⚠  Continuando con la copia a pesar de errores en el servicio...")
        
        # 3. Verificar archivos de origen
        print("\n[FASE 3] Verificando archivos de origen...")
        if not os.path.exists(origen_dir):
            print(f"❌ Error: La carpeta de origen no existe: {origen_dir}")
            input("Presiona Enter para salir...")
            return
        
        for archivo in archivos:
            origen_path = os.path.join(origen_dir, archivo)
            if not os.path.exists(origen_path):
                print(f"❌ Archivo no encontrado: {origen_path}")
                return
            else:
                # Mostrar información del archivo origen
                stats = os.stat(origen_path)
                from datetime import datetime
                mtime = datetime.fromtimestamp(stats.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
                print(f"  ✓ {archivo} - {mtime}, {stats.st_size} bytes")
        
        # 4. Preparar directorio destino
        print("\n[FASE 4] Preparando directorio destino...")
        os.makedirs(destino_dir, exist_ok=True)
        print(f"  ✓ Directorio destino: {destino_dir}")
        
        # 5. Verificar archivos existentes en destino
        print("\n[FASE 5] Verificando archivos existentes en destino...")
        for archivo in archivos:
            destino_path = os.path.join(destino_dir, archivo)
            if os.path.exists(destino_path):
                stats = os.stat(destino_path)
                from datetime import datetime
                mtime = datetime.fromtimestamp(stats.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
                print(f"  ⚠  {archivo} existe - {mtime}, {stats.st_size} bytes")
        
        # 6. Copiar archivos con método forzado
        print("\n[FASE 6] Copiando archivos (método forzado)...")
        copiados = 0
        
        for archivo in archivos:
            origen_path = os.path.join(origen_dir, archivo)
            destino_path = os.path.join(destino_dir, archivo)
            
            print(f"\n  {'='*40}")
            print(f"  ARCHIVO: {archivo}")
            print(f"  {'='*40}")
            
            # Desbloquear archivo destino si existe
            if os.path.exists(destino_path):
                print(f"  Desbloqueando archivo existente...")
                unlock_result = unlock_file_with_powershell(destino_path)
                if "SUCCESS" in unlock_result:
                    print(f"    ✓ Archivo desbloqueado")
            
            # Forzar copia
            if force_copy_file(origen_path, destino_path):
                if verify_file_copy(origen_path, destino_path):
                    copiados += 1
                else:
                    print(f"    ✗ Verificación falló para {archivo}")
            else:
                print(f"    ✗ Todos los métodos fallaron para {archivo}")
        
        # 7. Resumen final
        print("\n" + "="*60)
        print("RESUMEN DEL DESPLIEGUE")
        print("="*60)
        
        if copiados == len(archivos):
            print(f"✅ ¡ÉXITO! Se copiaron todos los archivos ({copiados}/{len(archivos)})")
            print("\nVerificación final:")
            for archivo in archivos:
                origen_path = os.path.join(origen_dir, archivo)
                destino_path = os.path.join(destino_dir, archivo)
                verify_file_copy(origen_path, destino_path)
        elif copiados > 0:
            print(f"⚠  PARCIAL: Se copiaron {copiados} de {len(archivos)} archivos")
        else:
            print("❌ FALLIDO: No se copió ningún archivo")
        
        print("\n" + "="*60)
            
    except Exception as e:
        print(f"\n❌ Error inesperado: {e}")
        import traceback
        traceback.print_exc()
    finally:
        input("\nPresiona Enter para salir...")

if __name__ == "__main__":
    copy_files()