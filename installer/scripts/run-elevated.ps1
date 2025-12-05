# Script para ejecutar el instalador con privilegios de administrador en modo dev

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootPath = Split-Path -Parent $scriptPath

# Verificar si ya estamos corriendo como administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Solicitando permisos de administrador..." -ForegroundColor Yellow
    
    # Relanzar el script con privilegios elevados
    $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$($MyInvocation.MyCommand.Path)`""
    Start-Process powershell.exe -Verb RunAs -ArgumentList $arguments
    exit
}

Write-Host "Ejecutando con privilegios de administrador..." -ForegroundColor Green
Write-Host ""

# Cambiar al directorio del proyecto
Set-Location $rootPath

# Verificar que node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "Instalando dependencias..." -ForegroundColor Yellow
    npm install
    Write-Host ""
}

# Ejecutar el instalador en modo dev
Write-Host "Iniciando Bloom Nucleus Installer (Dev Mode)..." -ForegroundColor Cyan
npm run dev

# Mantener la ventana abierta si hay error
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Error al ejecutar el instalador. Presiona cualquier tecla para cerrar..." -ForegroundColor Red
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}