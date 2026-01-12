[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   BLOOM BRAIN: BUILD & DEPLOY SYSTEM" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# ---------------------------------------------------------
# FUNCION: Encontrar procesos que usan un archivo
# ---------------------------------------------------------
function Get-ProcessUsingFile {
    param([string]$FilePath)
    
    try {
        $processes = @()
        Get-Process | ForEach-Object {
            try {
                $_.Modules | ForEach-Object {
                    if ($_.FileName -eq $FilePath) {
                        $processes += $_.ProcessName
                    }
                }
            } catch {}
        }
        return $processes
    } catch {
        return @()
    }
}

# ---------------------------------------------------------
# FUNCION: Eliminar archivos con Handle.exe (si existe)
# ---------------------------------------------------------
function Unlock-FileWithHandle {
    param([string]$FilePath)
    
    # Buscar handle.exe en ubicaciones comunes
    $handlePaths = @(
        "C:\Sysinternals\handle.exe",
        "$env:USERPROFILE\Downloads\handle.exe",
        "C:\Program Files\Sysinternals\handle.exe"
    )
    
    $handleExe = $handlePaths | Where-Object { Test-Path $_ } | Select-Object -First 1
    
    if ($handleExe) {
        Write-Host "   -> Usando handle.exe para liberar archivo..." -ForegroundColor Gray
        $output = & $handleExe -accepteula -nobanner $FilePath 2>&1
        
        # Parsear el output para encontrar PIDs
        $output | ForEach-Object {
            if ($_ -match "pid:\s*(\d+)") {
                $pid = $matches[1]
                Write-Host "   -> Cerrando handle del proceso PID $pid..." -ForegroundColor Gray
                & $handleExe -accepteula -c $matches[0] -p $pid -y 2>&1 | Out-Null
            }
        }
        return $true
    }
    return $false
}

# ---------------------------------------------------------
# PASO 1: MATAR PROCESOS (Limpieza AGRESIVA)
# ---------------------------------------------------------
Write-Host "1. Deteniendo procesos brain.exe activos..." -ForegroundColor Yellow

$killAttempts = 0
$maxAttempts = 3

while ($killAttempts -lt $maxAttempts) {
    $killAttempts++
    
    $brainProcesses = Get-Process -Name "brain" -ErrorAction SilentlyContinue
    
    if ($brainProcesses) {
        Write-Host "   -> Intento $killAttempts de $maxAttempts..." -ForegroundColor Gray
        
        $brainProcesses | ForEach-Object { 
            Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue 
        }
        
        Start-Sleep -Milliseconds 500
    } else {
        Write-Host "   -> Sistema limpio (no hay procesos brain.exe)" -ForegroundColor Gray
        break
    }
}

# Verificacion final
$remainingProcesses = Get-Process -Name "brain" -ErrorAction SilentlyContinue
if ($remainingProcesses) {
    Write-Host "   ERROR: No se pudieron matar todos los procesos brain.exe" -ForegroundColor Red
    Write-Host "   Por favor cierra manualmente todas las terminales con brain.exe" -ForegroundColor Red
    exit 1
}

Write-Host "   -> Esperando liberacion de archivos..." -ForegroundColor Gray
Start-Sleep -Seconds 2

# ---------------------------------------------------------
# PASO 1.5: LIMPIAR CACHÉ DE PYINSTALLER
# ---------------------------------------------------------
Write-Host "1.5. Limpiando caché de compilación..." -ForegroundColor Yellow

@("build", "dist") | ForEach-Object {
    if (Test-Path $_) {
        Remove-Item -Recurse -Force $_ -ErrorAction SilentlyContinue
        Write-Host "   -> Eliminado: $_" -ForegroundColor Gray
    }
}

Get-ChildItem -Recurse -Filter "__pycache__" -ErrorAction SilentlyContinue | 
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

Get-ChildItem -Recurse -Filter "*.pyc" -ErrorAction SilentlyContinue | 
    Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "   -> Caché limpiado" -ForegroundColor Green

# ---------------------------------------------------------
# PASO 2: COMPILAR (Delegar a Python)
# ---------------------------------------------------------
Write-Host "2. Ejecutando build.py..." -ForegroundColor Yellow
python build.py

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR CRITICO: El build de Python fallo." -ForegroundColor Red
    exit 1
}

Write-Host "   -> Compilacion exitosa." -ForegroundColor Green

# ---------------------------------------------------------
# PASO 3: DEPLOY (Copiar TODA la carpeta con reintentos)
# ---------------------------------------------------------
$SourceDir = "dist\brain"
$DestDir = "$env:LOCALAPPDATA\BloomNucleus\bin"

Write-Host "3. Desplegando a: $DestDir" -ForegroundColor Yellow

if (!(Test-Path $SourceDir)) {
    Write-Host "ERROR: No encuentro la carpeta compilada en: $SourceDir" -ForegroundColor Red
    exit 1
}

# Limpiar destino con reintentos MEJORADOS
if (Test-Path -Path $DestDir) {
    Write-Host "   -> Limpiando destino..." -ForegroundColor Gray
    
    $cleanAttempts = 0
    $cleanSuccess = $false
    
    while ($cleanAttempts -lt 3 -and -not $cleanSuccess) {
        $cleanAttempts++
        
        try {
            # Intentar eliminar recursivamente
            Get-ChildItem -Path $DestDir -Recurse | Remove-Item -Force -Recurse -ErrorAction Stop
            Remove-Item -Path $DestDir -Force -Recurse -ErrorAction Stop
            $cleanSuccess = $true
            Write-Host "   -> Destino limpiado exitosamente" -ForegroundColor Gray
        }
        catch {
            # Capturar el archivo problemático
            $errorMessage = $_.Exception.Message
            
            if ($errorMessage -match "'([^']+)'") {
                $lockedFile = $matches[1]
                Write-Host "   -> Archivo bloqueado: $lockedFile" -ForegroundColor Yellow
                
                # Intentar desbloquear con handle.exe
                if (Unlock-FileWithHandle -FilePath $lockedFile) {
                    Write-Host "   -> Archivo desbloqueado, reintentando..." -ForegroundColor Gray
                    Start-Sleep -Seconds 1
                    continue
                }
                
                # Si no funciona, intentar renombrar el directorio
                if ($cleanAttempts -eq 2) {
                    Write-Host "   -> Intentando mover directorio en lugar de eliminar..." -ForegroundColor Yellow
                    $backupDir = "$DestDir.old_$(Get-Date -Format 'yyyyMMdd_HHmmss')"
                    
                    try {
                        Move-Item -Path $DestDir -Destination $backupDir -Force -ErrorAction Stop
                        Write-Host "   -> Directorio antiguo movido a: $backupDir" -ForegroundColor Gray
                        Write-Host "   -> Puedes eliminarlo manualmente mas tarde" -ForegroundColor Gray
                        $cleanSuccess = $true
                        break
                    } catch {
                        Write-Host "   -> No se pudo mover el directorio tampoco" -ForegroundColor Red
                    }
                }
            }
            
            if ($cleanAttempts -lt 3) {
                Write-Host "   -> Reintento $cleanAttempts/3..." -ForegroundColor Gray
                Start-Sleep -Seconds 2
            } else {
                Write-Host "" -ForegroundColor Red
                Write-Host "   ================================================" -ForegroundColor Red
                Write-Host "   ERROR: No se pudo limpiar el destino" -ForegroundColor Red
                Write-Host "   ================================================" -ForegroundColor Red
                Write-Host "   Archivo bloqueado: $lockedFile" -ForegroundColor Yellow
                Write-Host "" -ForegroundColor Red
                Write-Host "   SOLUCIONES:" -ForegroundColor Yellow
                Write-Host "   1. Cierra TODAS las terminales y ventanas" -ForegroundColor White
                Write-Host "   2. Busca procesos de Brain en el Administrador de tareas" -ForegroundColor White
                Write-Host "   3. Reinicia el PC si nada funciona" -ForegroundColor White
                Write-Host "" -ForegroundColor Red
                Write-Host "   ALTERNATIVA RAPIDA:" -ForegroundColor Yellow
                Write-Host "   Ejecuta este comando para encontrar el proceso:" -ForegroundColor White
                Write-Host "   Get-Process | Where-Object { `$_.Path -like '*BloomNucleus*' }" -ForegroundColor Cyan
                Write-Host "" -ForegroundColor Red
                
                # Intentar mostrar qué procesos podrían estar usando el archivo
                $possibleProcesses = Get-Process | Where-Object { 
                    $_.Path -and $_.Path -like "*BloomNucleus*" 
                }
                
                if ($possibleProcesses) {
                    Write-Host "   PROCESOS SOSPECHOSOS ENCONTRADOS:" -ForegroundColor Yellow
                    $possibleProcesses | ForEach-Object {
                        Write-Host "   - PID: $($_.Id) | Nombre: $($_.ProcessName) | Path: $($_.Path)" -ForegroundColor White
                    }
                    Write-Host "" -ForegroundColor Red
                    Write-Host "   Ejecuta: Stop-Process -Id <PID> -Force" -ForegroundColor Cyan
                }
                
                exit 1
            }
        }
    }
}

# Crear directorio destino
New-Item -ItemType Directory -Force -Path $DestDir | Out-Null

# Copiar con reintentos
Write-Host "   -> Copiando archivos..." -ForegroundColor Gray

$copyAttempts = 0
$copySuccess = $false

while ($copyAttempts -lt 3 -and -not $copySuccess) {
    $copyAttempts++
    
    try {
        Copy-Item -Path "$SourceDir\*" -Destination $DestDir -Recurse -Force -ErrorAction Stop
        $copySuccess = $true
        Write-Host "   -> Archivos copiados exitosamente" -ForegroundColor Gray
    }
    catch {
        if ($copyAttempts -lt 3) {
            Write-Host "   -> Reintento $copyAttempts/3..." -ForegroundColor Gray
            Start-Sleep -Seconds 2
        } else {
            Write-Host "   ERROR: No se pudo copiar despues de 3 intentos" -ForegroundColor Red
            Write-Host "   Mensaje: $($_.Exception.Message)" -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host "CICLO COMPLETADO: Brain actualizado." -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ejecutable: $DestDir\brain.exe" -ForegroundColor Cyan

Write-Host "5. Procesando actualizaciones de versión..." -ForegroundColor Yellow
python update_version.py  # Asume que estás en el fuente; ajusta path si necesario
if ($LASTEXITCODE -ne 0) {
    Write-Host "WARN: Fallo en update_version.py - Revisa update_version.log" -ForegroundColor Yellow
} else {
    Write-Host "   -> Versiones y commit procesados." -ForegroundColor Green
}

# ---------------------------------------------------------
# PASO 4: GESTION INTELIGENTE DEL PATH (DOBLE IMPACTO)
# ---------------------------------------------------------
Write-Host "4. Actualizando Variables de Entorno..." -ForegroundColor Yellow

$OldPath = "$env:LOCALAPPDATA\BloomNucleus\bin"
$NewPath = "$env:LOCALAPPDATA\BloomNucleus\bin\brain"

# --- A. ACTUALIZAR REGISTRO (Para futuras terminales) ---
$RegistryPath = [Environment]::GetEnvironmentVariable("Path", "User")

# 1. Limpiar ruta vieja en registro
if ($RegistryPath -like "*$OldPath*" -and $RegistryPath -notlike "*$OldPath\brain*") {
    $RegistryPath = $RegistryPath.Replace(";$OldPath", "").Replace($OldPath, "")
    Write-Host "   -> Ruta obsoleta eliminada del Registro" -ForegroundColor Gray
}

# 2. Agregar nueva ruta al registro
if ($RegistryPath -notlike "*$NewPath*") {
    [Environment]::SetEnvironmentVariable("Path", "$RegistryPath;$NewPath", "User")
    Write-Host "   [OK] Registro de Windows actualizado." -ForegroundColor Green
} else {
    Write-Host "   [OK] El Registro ya estaba correcto." -ForegroundColor Gray
}

# --- B. ACTUALIZAR SESIÓN ACTUAL (Para que ande YA) ---
# Esto es lo que te faltaba: Inyectar la ruta en la memoria de ESTA terminal
if ($env:Path -notlike "*$NewPath*") {
    $env:Path += ";$NewPath"
    Write-Host "   [OK] Sesión actual actualizada (Ya puedes escribir 'brain')" -ForegroundColor Green
}

# Al final de build.ps1
Write-Host "4. Actualizando Sesión..."
$env:Path = "$env:LOCALAPPDATA\BloomNucleus\bin;" + $env:Path
Write-Host "✅ Ya puedes escribir 'brain' en esta terminal." -ForegroundColor Green