# Auto elevar a admin si no lo es
if (-not ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {

    Start-Process powershell "-ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "Deteniendo servicios..." -ForegroundColor Cyan

$services = @(
    "BloomBrainService",
    "BloomNucleusService"
)

foreach ($service in $services) {
    if (Get-Service -Name $service -ErrorAction SilentlyContinue) {
        Stop-Service -Name $service -Force -ErrorAction SilentlyContinue
        Write-Host "Servicio $service detenido."
    }
}

Start-Sleep -Seconds 3

Write-Host "Cerrando procesos..." -ForegroundColor Cyan

$processes = @(
    "temporal",
    "bloom-launcher",
    "chrommium"
)

foreach ($proc in $processes) {
    Get-Process -Name $proc -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Host "Proceso $proc detenido."
}

Write-Host "Sistema detenido correctamente." -ForegroundColor Green
Pause