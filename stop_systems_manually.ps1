# ==============================
# AUTO ELEVAR A ADMIN
# ==============================
if (-not ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {

    Start-Process powershell "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host ""
Write-Host "======================================" -ForegroundColor DarkCyan
Write-Host " DETENIENDO SERVICIOS" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor DarkCyan

# ==============================
# DETENER SERVICIOS
# ==============================
$services = @(
    "BloomBrainService",
    "BloomNucleusService"
)

foreach ($service in $services) {
    if (Get-Service -Name $service -ErrorAction SilentlyContinue) {
        Write-Host "Deteniendo servicio $service..."
        Stop-Service -Name $service -Force -ErrorAction SilentlyContinue
    }
}

Start-Sleep -Seconds 3

Write-Host ""
Write-Host "======================================" -ForegroundColor DarkCyan
Write-Host " DETENIENDO APLICACIONES" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor DarkCyan

# ==============================
# MATAR temporal.exe
# ==============================
taskkill /F /T /IM temporal.exe 2>$null

# ==============================
# MATAR bloom-sensor.exe
# ==============================
$bloomSensor = Get-Process -Name "bloom-sensor" -ErrorAction SilentlyContinue

foreach ($proc in $bloomSensor) {
    Write-Host "Matando bloom-sensor (PID $($proc.Id))"
    Stop-Process -Id $proc.Id -Force
}

Start-Sleep -Seconds 2

# ==============================
# MATAR SOLO chrome HIJOS DE bloom-sensor
# ==============================
$chromeProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "chrome.exe"
}

foreach ($chrome in $chromeProcesses) {
    $parent = Get-Process -Id $chrome.ParentProcessId -ErrorAction SilentlyContinue

    if ($parent -and $parent.ProcessName -like "*bloom*") {
        Write-Host "Matando chrome hijo de bloom-sensor (PID $($chrome.ProcessId))"
        Stop-Process -Id $chrome.ProcessId -Force
    }
}

# ==============================
# CERRAR CHROMIUM (NO CHROME)
# Identifica por ruta de instalacion para no tocar Chrome
# Mata el arbol completo de procesos con /T
# ==============================
Write-Host ""
Write-Host "Cerrando Chromium..."

$allChromium = Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and
    $_.ExecutablePath -like "*Chromium*" -and
    $_.ExecutablePath -notlike "*Google\Chrome*"
}

if ($allChromium) {
    # Obtener solo los PIDs raiz (cuyo padre NO es tambien Chromium)
    $chromiumPids = $allChromium | Select-Object -ExpandProperty ProcessId
    
    $rootProcesses = $allChromium | Where-Object {
        $chromiumPids -notcontains $_.ParentProcessId
    }

    foreach ($root in $rootProcesses) {
        Write-Host "Matando arbol Chromium desde PID raiz $($root.ProcessId) - $($root.ExecutablePath)"
        taskkill /F /T /PID $root.ProcessId 2>$null
    }
    Start-Sleep -Seconds 2

    # Verificacion: matar cualquier remanente por ruta
    $remanentes = Get-CimInstance Win32_Process | Where-Object {
        $_.ExecutablePath -and
        $_.ExecutablePath -like "*Chromium*" -and
        $_.ExecutablePath -notlike "*Google\Chrome*"
    }
    foreach ($rem in $remanentes) {
        Write-Host "Matando remanente Chromium PID $($rem.ProcessId)"
        Stop-Process -Id $rem.ProcessId -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "No se encontraron procesos de Chromium en ejecucion."
}

# ==============================
# BORRAR CARPETAS DE BloomNucleus
# ==============================
Write-Host ""
Write-Host "======================================" -ForegroundColor DarkCyan
Write-Host " LIMPIANDO CARPETAS BloomNucleus" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor DarkCyan

$bloomNucleusPath = "C:\Users\josev\AppData\Local\BloomNucleus"

if (Test-Path $bloomNucleusPath) {
    $subFolders = Get-ChildItem -Path $bloomNucleusPath -Directory -ErrorAction SilentlyContinue

    if ($subFolders) {
        foreach ($folder in $subFolders) {
            Write-Host "Borrando carpeta: $($folder.FullName)"
            Remove-Item -Path $folder.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
        Write-Host "Carpetas eliminadas correctamente." -ForegroundColor Green
    } else {
        Write-Host "No se encontraron subcarpetas en BloomNucleus."
    }
} else {
    Write-Host "La ruta $bloomNucleusPath no existe."
}

Write-Host ""
Write-Host "======================================" -ForegroundColor DarkCyan
Write-Host " SISTEMA DETENIDO CORRECTAMENTE" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor DarkCyan
Pause