#Requires -Version 5.1
# =========================================
# BLOOM BRAIN - BUILD SCRIPT
# =========================================
# Output moderno y limpio
# Integración fluida con build.py
# =========================================

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# =========================================
# EMOJIS MODERNOS
# =========================================
$EMO = @{
    brain    = [char]::ConvertFromUtf32(0x1F9E0)  # 🧠
    clean    = [char]::ConvertFromUtf32(0x1F9F9)  # 🧹
    build    = [char]::ConvertFromUtf32(0x1F528)  # 🔨
    rocket   = [char]::ConvertFromUtf32(0x1F680)  # 🚀
    box      = [char]::ConvertFromUtf32(0x1F4E6)  # 📦
    doc      = [char]::ConvertFromUtf32(0x1F4C4)  # 📄
    ok       = [char]::ConvertFromUtf32(0x2705)   # ✅
    warn     = [char]::ConvertFromUtf32(0x26A0)   # ⚠️
    fail     = [char]::ConvertFromUtf32(0x274C)   # ❌
    progress = [char]::ConvertFromUtf32(0x23F3)   # ⏳
}

# Spinner frames
$SPINNER = @("|", "/", "-", "\", "|", "/", "-", "\")

# =========================================
# FUNCIONES DE OUTPUT
# =========================================
function Write-Header($title) {
    $line = "=" * 43
    Write-Host ""
    Write-Host $line -ForegroundColor Cyan
    Write-Host "  $title" -ForegroundColor Cyan
    Write-Host $line -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step($msg) { 
    Write-Host "   $($EMO.progress) $msg" -ForegroundColor Cyan
}

function Write-Success($msg) { 
    Write-Host "   $($EMO.ok) $msg" -ForegroundColor Green 
}

function Write-Warning($msg) { 
    Write-Host "   $($EMO.warn) $msg" -ForegroundColor Yellow 
}

function Write-Error($msg) { 
    Write-Host "   $($EMO.fail) $msg" -ForegroundColor Red
    Write-Host ""
    exit 1 
}

function Write-Separator() {
    Write-Host ""
    Write-Host ("-" * 70) -ForegroundColor DarkGray
    Write-Host ""
}

# =========================================
# INICIO
# =========================================
Clear-Host
Write-Header "$($EMO.brain) BLOOM BRAIN BUILD"

# =========================================
# CONFIGURAR LOG
# =========================================
$logDir = Join-Path $env:LOCALAPPDATA "BloomNucleus\logs\build"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$logFile = Join-Path $logDir "brain.build.log"

# =========================================
# LIMPIEZA INICIAL
# =========================================
Write-Step "Limpiando entorno..."

# Detener procesos
Get-Process -Name "brain" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# Limpiar cache
$dirsToClean = @("build", "dist", "__pycache__")
foreach ($dir in $dirsToClean) {
    if (Test-Path $dir) { 
        Remove-Item $dir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Write-Success "Entorno limpio"

# =========================================
# EJECUTAR BUILD.PY
# =========================================
Write-Host ""
Write-Step "Ejecutando compilacion..."

# Verificar Python
$pythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $pythonExe) {
    Write-Error "Python no encontrado en PATH"
}

# Verificar build.py
if (-not (Test-Path "build.py")) {
    Write-Error "build.py no encontrado"
}

Write-Separator

# Mostrar spinner mientras compila
Write-Host "   $($EMO.progress) Compilando con PyInstaller..." -NoNewline

# Iniciar proceso en background
$buildJob = Start-Job -ScriptBlock {
    param($pythonPath, $workingDir, $logPath)
    Set-Location $workingDir
    $env:BUILD_LOG_PATH = $logPath
    & $pythonPath "build.py" 2>&1
} -ArgumentList $pythonExe, $PWD, $logFile

# Spinner animation
$spinnerIndex = 0
while ($buildJob.State -eq "Running") {
    Write-Host "`r   $($SPINNER[$spinnerIndex]) Compilando con PyInstaller..." -NoNewline -ForegroundColor Cyan
    $spinnerIndex = ($spinnerIndex + 1) % $SPINNER.Count
    Start-Sleep -Milliseconds 100
}

# Limpiar línea del spinner
Write-Host "`r   $($EMO.progress) Compilando con PyInstaller...               " -NoNewline
Write-Host "`r" -NoNewline

# Obtener resultado
$buildOutput = Receive-Job -Job $buildJob
$buildExitCode = if ($buildJob.ChildJobs[0].State -eq "Completed") { 0 } else { 1 }
Remove-Job -Job $buildJob -Force

# Procesar output para mostrar solo mensajes importantes
$importantLines = $buildOutput | Where-Object {
    $_ -match "VERSION file creado" -or
    $_ -match "Completado:" -or
    $_ -match "Archivos copiados" -or
    $_ -match "Ejecutable creado" -or
    $_ -match "Ejecutable funciona" -or
    $_ -match "Generando archivos de ayuda" -or
    $_ -match "Generando arboles" -or
    $_ -match "BUILD COMPLETADO"
}

$projectRoot = (Get-Location).Path
foreach ($line in $importantLines) {
    $cleanLine = $line -replace '\[.*?\]\s*', '' -replace '^\s+', ''
    
    if ($cleanLine -match "BUILD COMPLETADO EXITOSAMENTE") {
        Write-Host "      BUILD COMPLETADO EXITOSAMENTE" -ForegroundColor Yellow
    }
    elseif ($cleanLine -match "VERSION file creado") {
        Write-Host "      VERSION file creado:" -NoNewline -ForegroundColor White
        $version = $cleanLine -replace '.*VERSION file creado:\s*', ''
        Write-Host " $version" -ForegroundColor Gray
    }
    elseif ($cleanLine -match "Archivos copiados a:") {
        Write-Host "      Archivos copiados a:" -NoNewline -ForegroundColor White
        $fullPath = $cleanLine -replace '.*Archivos copiados a:\s*', ''
        $relativePath = $fullPath -replace [regex]::Escape($projectRoot + "\"), ''
        Write-Host " $relativePath" -ForegroundColor Green
    }
    elseif ($cleanLine -match "Ejecutable creado:") {
        Write-Host "      Ejecutable creado:" -NoNewline -ForegroundColor White
        $fullPath = $cleanLine -replace '.*Ejecutable creado:\s*', ''
        $relativePath = $fullPath -replace [regex]::Escape($projectRoot + "\"), ''
        Write-Host " $relativePath" -ForegroundColor Green
    }
    elseif ($cleanLine -match "Generando archivos de ayuda") {
        Write-Host "      Generando archivos de ayuda..." -ForegroundColor Gray
    }
    elseif ($cleanLine -match "Generando arboles") {
        Write-Host "      Generando arboles de directorios..." -ForegroundColor Gray
    }
    elseif ($cleanLine -match "Completado:") {
        # Dividir en "Completado:" (blanco) y el resto (verde)
        $parts = $cleanLine -split "Completado:", 2
        if ($parts.Count -eq 2) {
            Write-Host "      Completado:" -NoNewline -ForegroundColor White
            Write-Host $parts[1] -ForegroundColor Green
        }
    }
    else {
        Write-Host "      $cleanLine" -ForegroundColor Gray
    }
}

Write-Separator

# Verificar resultado
if ($buildExitCode -ne 0) {
    Write-Host ""
    Write-Error "Build fallo (ver $logFile)"
}

# =========================================
# VERIFICAR EJECUTABLE
# =========================================
Write-Step "Localizando ejecutable..."

$possiblePaths = @(
    "installer\native\bin\win32\brain\brain.exe",
    "dist\brain\brain.exe"
)

$exePath = $null
foreach ($path in $possiblePaths) {
    if (Test-Path $path) {
        $exePath = $path
        break
    }
}

if (-not $exePath) {
    Write-Error "brain.exe no encontrado"
}

Write-Success "Ejecutable: $exePath"

# =========================================
# VERIFICAR FUNCIONALIDAD
# =========================================
Write-Step "Verificando ejecutable..."

$testResult = & $exePath --help 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Success "Ejecutable funcional"
} else {
    Write-Warning "Ejecutable no responde correctamente"
}

# =========================================
# DEPLOY LOCAL
# =========================================
Write-Host ""
Write-Step "Desplegando localmente..."

$deployBin = Join-Path $env:LOCALAPPDATA "BloomNucleus\bin\brain"

# Limpiar destino
if (Test-Path $deployBin) {
    try {
        Remove-Item $deployBin -Recurse -Force -ErrorAction Stop
    } catch {
        Get-Process -Name "brain" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Remove-Item $deployBin -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Copiar archivos
try {
    New-Item -ItemType Directory -Path $deployBin -Force | Out-Null
    $sourceDir = Split-Path $exePath -Parent
    Copy-Item "$sourceDir\*" $deployBin -Recurse -Force
    Write-Success "Binario desplegado"
} catch {
    Write-Error "Error copiando archivos: $_"
}

# =========================================
# CONFIGURAR PATH
# =========================================
Write-Host ""
Write-Step "Configurando PATH..."

$userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
$bloomBinPath = Join-Path $env:LOCALAPPDATA "BloomNucleus\bin"

if ($userPath -notlike "*BloomNucleus\bin*") {
    try {
        $newPath = "$userPath;$bloomBinPath"
        [Environment]::SetEnvironmentVariable("PATH", $newPath, "User")
        Write-Success "PATH actualizado (reinicia terminal)"
    } catch {
        Write-Warning "No se pudo actualizar PATH automaticamente"
        Write-Host "      Anade manualmente: $bloomBinPath" -ForegroundColor Yellow
    }
} else {
    Write-Success "PATH ya configurado"
}

# =========================================
# RESUMEN FINAL
# =========================================
Write-Host ""
Write-Header "$($EMO.ok) BUILD COMPLETADO"

Write-Host "   $($EMO.box) Ejecutable:" -NoNewline
Write-Host "  $deployBin\brain.exe" -ForegroundColor Yellow
Write-Host ""
Write-Host "   $($EMO.doc) Log:" -NoNewline
Write-Host "         $logFile" -ForegroundColor Yellow
Write-Host ""

# =========================================
# ACTUALIZAR TELEMETRY.JSON
# =========================================
Write-Step "Actualizando telemetry..."

$pythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
if (-not $pythonExe) {
    Write-Warning "Python no encontrado en el PATH. Telemetry no se actualizó."
} else {
    # Ruta relativa directa: desde la carpeta donde está build.ps1
    $updateScript = Join-Path $PSScriptRoot "scripts\python\update_build_telemetry.py"

    if (-not (Test-Path $updateScript)) {
        Write-Warning "No se encontró el script de telemetry"
        Write-Warning "Ruta buscada: $updateScript"
        Write-Warning "Directorio actual: $PWD"
        Write-Warning "PSScriptRoot   : $PSScriptRoot"
    } else {
        $telemetryKey   = "brain_build"
        $emojiBox       = [char]::ConvertFromUtf32(0x1F4E6)   # 📦
        $telemetryLabel = "$emojiBox BRAIN BUILD"             # ← exactamente como lo querés
        $telemetryPath  = $logFile -replace '\\', '/'

        try {
            # Llamada al script Python
            & $pythonExe $updateScript $telemetryKey $telemetryLabel $telemetryPath

            if ($LASTEXITCODE -eq 0) {
                Write-Success "Telemetry actualizado correctamente"
                Write-Host "      Label: $telemetryLabel" -ForegroundColor White
                Write-Host "      Path : $telemetryPath"  -ForegroundColor Gray
            } else {
                Write-Warning "El script de telemetry terminó con código $LASTEXITCODE"
            }
        }
        catch {
            Write-Warning "Error al ejecutar el script de telemetry: $_"
        }
    }
}

# =========================================
# RESUMEN FINAL
# =========================================
Write-Host ""
Write-Header "$($EMO.ok) BUILD COMPLETADO"

Write-Host "   $($EMO.box) Ejecutable:" -NoNewline
Write-Host "  $deployBin\brain.exe" -ForegroundColor Yellow
Write-Host ""
Write-Host "   $($EMO.doc) Log:" -NoNewline
Write-Host "         $logFile" -ForegroundColor Yellow
Write-Host ""
Write-Host "   Prueba con:" -ForegroundColor Cyan
Write-Host "   > brain --help" -ForegroundColor White
Write-Host "   > brain --help --full" -ForegroundColor Green
Write-Host ""

exit 0