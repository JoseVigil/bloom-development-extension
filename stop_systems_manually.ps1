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
# MATAR bloom-launcher.exe
# ==============================
$bloomLauncher = Get-Process -Name "bloom-launcher" -ErrorAction SilentlyContinue

foreach ($proc in $bloomLauncher) {
    Write-Host "Matando bloom-launcher (PID $($proc.Id))"
    Stop-Process -Id $proc.Id -Force
}

Start-Sleep -Seconds 2

# ==============================
# MATAR SOLO chrome HIJOS DE bloom-launcher
# ==============================
$chromeProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq "chrome.exe"
}

foreach ($chrome in $chromeProcesses) {
    $parent = Get-Process -Id $chrome.ParentProcessId -ErrorAction SilentlyContinue

    if ($parent -and $parent.ProcessName -like "*bloom*") {
        Write-Host "Matando chrome hijo de bloom-launcher (PID $($chrome.ProcessId))"
        Stop-Process -Id $chrome.ProcessId -Force
    }
}

Write-Host ""
Write-Host "======================================" -ForegroundColor DarkCyan
Write-Host " SISTEMA DETENIDO CORRECTAMENTE" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor DarkCyan
Pause