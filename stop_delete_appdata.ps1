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
# MATAR bloom-conductor.exe (TODAS LAS INSTANCIAS)
# ==============================
Write-Host ""
Write-Host "Cerrando bloom-conductor..."

$conductorProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "bloom-conductor.exe"
}

if ($conductorProcesses) {
    foreach ($proc in $conductorProcesses) {
        Write-Host "Matando bloom-conductor (PID $($proc.ProcessId)) - $($proc.ExecutablePath)"
        taskkill /F /T /PID $proc.ProcessId 2>$null
    }
    Start-Sleep -Seconds 2

    # Verificacion: matar remanentes por ruta exacta
    $remanentes = Get-CimInstance Win32_Process | Where-Object {
        $_.ExecutablePath -eq "C:\Users\josev\AppData\Local\BloomNucleus\bin\conductor\bloom-conductor.exe"
    }
    foreach ($rem in $remanentes) {
        Write-Host "Matando remanente bloom-conductor PID $($rem.ProcessId)"
        Stop-Process -Id $rem.ProcessId -Force -ErrorAction SilentlyContinue
    }
} else {
    Write-Host "No se encontraron instancias de bloom-conductor en ejecucion."
}

# ==============================
# MATAR Bloom Nucleus Workspace (TODAS LAS INSTANCIAS)
# Busca por nombre de proceso conocido y por ruta dentro de BloomNucleus
# ==============================
Write-Host ""
Write-Host "Cerrando Bloom Nucleus Workspace..."

# Intentar por nombres de proceso comunes
$workspaceNames = @("BloomNucleusWorkspace", "bloom-workspace", "BloomWorkspace")
foreach ($wName in $workspaceNames) {
    $found = Get-Process -Name $wName -ErrorAction SilentlyContinue
    foreach ($proc in $found) {
        Write-Host "Matando $wName (PID $($proc.Id))"
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    }
}

# Fallback: cualquier proceso cuya ruta sea dentro de BloomNucleus y no sea conductor ni sensor
$workspaceProcs = Get-CimInstance Win32_Process | Where-Object {
    $_.ExecutablePath -and
    $_.ExecutablePath -like "*BloomNucleus*" -and
    $_.Name -ne "bloom-conductor.exe" -and
    $_.Name -ne "bloom-sensor.exe"
}

if ($workspaceProcs) {
    foreach ($proc in $workspaceProcs) {
        Write-Host "Matando proceso BloomNucleus residual: $($proc.Name) (PID $($proc.ProcessId)) - $($proc.ExecutablePath)"
        taskkill /F /T /PID $proc.ProcessId 2>$null
    }
    Start-Sleep -Seconds 2
} else {
    Write-Host "No se encontraron instancias de Bloom Nucleus Workspace en ejecucion."
}

# ==============================
# MATAR node.exe (Svelte server de BloomNucleus)
# Identifica por ruta ejecutable o directorio de trabajo
# para no tocar otros procesos Node del sistema
# ==============================
Write-Host ""
Write-Host "Cerrando servidor Svelte (node.exe de BloomNucleus)..."

$nodeProcs = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "node.exe"
}

foreach ($node in $nodeProcs) {
    $isBloom = $false

    # Caso 1: el ejecutable node.exe esta dentro de la carpeta BloomNucleus
    if ($node.ExecutablePath -and $node.ExecutablePath -like "*BloomNucleus*") {
        $isBloom = $true
    }

    # Caso 2: el CommandLine apunta a BloomNucleus
    if (-not $isBloom -and $node.CommandLine -and $node.CommandLine -like "*BloomNucleus*") {
        $isBloom = $true
    }

    # Caso 3: servidor Vite/Svelte de bloom-development-extension
    if (-not $isBloom -and $node.CommandLine -and $node.CommandLine -like "*bloom-development-extension*") {
        $isBloom = $true
    }

    if ($isBloom) {
        Write-Host "Matando node.exe de BloomNucleus (PID $($node.ProcessId)) - $($node.CommandLine)"
        taskkill /F /T /PID $node.ProcessId 2>$null
    }
}

# Verificacion: remanentes por CommandLine
Start-Sleep -Seconds 2
$remanentesNode = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "node.exe" -and $_.CommandLine -and (
        $_.CommandLine -like "*BloomNucleus*" -or
        $_.CommandLine -like "*bloom-development-extension*"
    )
}
foreach ($rem in $remanentesNode) {
    Write-Host "Matando remanente node.exe PID $($rem.ProcessId)"
    Stop-Process -Id $rem.ProcessId -Force -ErrorAction SilentlyContinue
}

if (-not $nodeProcs) {
    Write-Host "No se encontraron instancias de node.exe de BloomNucleus en ejecucion."
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