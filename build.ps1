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
Write-Separator

$pythonExe = (Get-Command python -ErrorAction SilentlyContinue).Source
$buildJob = Start-Job -ScriptBlock {
    param($pythonPath, $workingDir, $logPath)
    Set-Location $workingDir
    $env:BUILD_LOG_PATH = $logPath
    & $pythonPath -u "build.py" 2>&1
} -ArgumentList $pythonExe, $PWD, $logFile

$spinnerIndex = 0
$currentPercent = 0

while ($buildJob.State -eq "Running") {
    # 1. Recibir salida
    $jobOutput = Receive-Job -Job $buildJob -Keep
    
    # 2. Buscar último progreso reportado
    if ($jobOutput) {
        $lastProg = $jobOutput | Where-Object { $_ -match "\[PROG:(\d+)\]" } | Select-Object -Last 1
        if ($lastProg -and $lastProg -match "\[PROG:(\d+)\]") {
            $currentPercent = [int]$matches[1]
        }
    }

    # 3. Dibujar Spinner. Si el progreso es 0, mostramos que está iniciando.
    $frame = $SPINNER[$spinnerIndex]

    Write-Host "`r   " -NoNewline
    Write-Host $frame -NoNewline -ForegroundColor Yellow
    Write-Host " Compilando con PyInstaller... " -NoNewline -ForegroundColor Cyan
    Write-Host "[$currentPercent%]" -NoNewline -ForegroundColor Magenta
    Write-Host " ".PadRight(10) -NoNewline
    
    $spinnerIndex = ($spinnerIndex + 1) % $SPINNER.Count
    Start-Sleep -Milliseconds 150
}

# 4. Obtener resultado final ANTES de imprimir el 100%
$buildOutput = Receive-Job -Job $buildJob
$buildExitCode = if ($buildJob.ChildJobs[0].State -eq "Completed") { 0 } else { 1 }

# Verificar si realmente terminó bien leyendo la última línea de progreso del output total
$finalProg = $buildOutput | Where-Object { $_ -match "\[PROG:(\d+)\]" } | Select-Object -Last 1
if ($finalProg -match "\[PROG:100\]" -and $buildExitCode -eq 0) {
    Write-Host "`r   $($EMO.ok) Compilando con PyInstaller... [100%]" -ForegroundColor Green
} else {
    Write-Host "`r   $($EMO.fail) Compilacion interrumpida o fallida [$currentPercent%]" -ForegroundColor Red
}
Write-Host ""

Remove-Job -Job $buildJob -Force

# --- RESUMEN DE HITOS ---
Write-Host ""
Write-Host "   HITOS IMPORTANTES" -ForegroundColor Cyan

$basePath = (Get-Location).Path

$importantLines = $buildOutput | Where-Object {
    $_ -and
    $_ -notmatch "\[PROG:" -and
    (
        $_ -match "VERSION file creado" -or
        $_ -match "Completado:" -or
        $_ -match "Archivos copiados" -or
        $_ -match "Ejecutable creado"
    )
}

foreach ($rawLine in $importantLines) {

    $line = ([string]$rawLine).Trim()
    $line = $line -replace "`e\[[\d;]*m", ""

    # Rutas relativas
    if ($line -match ":\\" ) {
        $line = $line -replace [regex]::Escape($basePath), "."
    }

    Write-Host "        $line" -ForegroundColor Green
}


Write-Separator

if ($buildExitCode -ne 0) { Write-Error "Build fallo catastróficamente." }

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

$ErrorActionPreference = "Continue"  # Temporalmente permitir errores
$testResult = & $exePath --help 2>&1
$testExitCode = $LASTEXITCODE
$ErrorActionPreference = "Stop"  # Restaurar

if ($testExitCode -eq 0) {
    Write-Success "Ejecutable funcional"
} else {
    Write-Warning "No se pudo verificar ejecutable (código: $testExitCode)"
    Write-Host "      Continuando de todas formas..." -ForegroundColor Yellow
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