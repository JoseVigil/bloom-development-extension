# Bloom Nucleus - Extension Registry Installer
# Usage: .\hkcu.ps1 -ExtId "xxx" -CrxPath "C:\path\to\extension.crx"

param(
    [Parameter(Mandatory=$true)]
    [string]$ExtId,
    
    [Parameter(Mandatory=$true)]
    [string]$CrxPath
)

$ErrorActionPreference = 'Stop'

# Convertir path a file:// URL
$CrxUrl = "file:///" + $CrxPath.Replace("\", "/")

Write-Host "=== BLOOM REGISTRY INSTALLER ===" -ForegroundColor Cyan
Write-Host "Extension ID: $ExtId"
Write-Host "CRX Path: $CrxPath"
Write-Host "CRX URL: $CrxUrl"
Write-Host ""

$PolicyPath = "HKCU:\Software\Policies\Google\Chrome"

# ========================================================================
# [1/5] ExtensionInstallForcelist
# ========================================================================

Write-Host "[1/5] Configurando Forcelist..." -ForegroundColor Yellow
$ForcelistKey = "$PolicyPath\ExtensionInstallForcelist"

if (!(Test-Path $ForcelistKey)) { 
    New-Item -Path $ForcelistKey -Force | Out-Null 
}

New-ItemProperty -Path $ForcelistKey -Name "1" -Value "$ExtId;$CrxUrl" -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null
Write-Host "  OK" -ForegroundColor Green

# ========================================================================
# [2/5] ExtensionSettings
# ========================================================================

Write-Host "[2/5] Configurando ExtensionSettings..." -ForegroundColor Yellow
$SettingsKey = "$PolicyPath\ExtensionSettings"

if (!(Test-Path $SettingsKey)) { 
    New-Item -Path $SettingsKey -Force | Out-Null 
}

$ExtSettingsKey = "$SettingsKey\$ExtId"
if (!(Test-Path $ExtSettingsKey)) { 
    New-Item -Path $ExtSettingsKey -Force | Out-Null 
}

New-ItemProperty -Path $ExtSettingsKey -Name "installation_mode" -Value "force_installed" -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null
New-ItemProperty -Path $ExtSettingsKey -Name "update_url" -Value "$CrxUrl" -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null
Write-Host "  OK" -ForegroundColor Green

# ========================================================================
# [3/5] External Extensions
# ========================================================================

Write-Host "[3/5] Configurando External Extensions..." -ForegroundColor Yellow
$ExtPath = "HKCU:\Software\Google\Chrome\Extensions\$ExtId"

if (!(Test-Path $ExtPath)) { 
    New-Item -Path $ExtPath -Force | Out-Null 
}

New-ItemProperty -Path $ExtPath -Name "path" -Value "$CrxPath" -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null
New-ItemProperty -Path $ExtPath -Name "version" -Value "1.0.0" -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null
Write-Host "  OK" -ForegroundColor Green

# ========================================================================
# [4/5] ExtensionInstallAllowlist
# ========================================================================

Write-Host "[4/5] Configurando Allowlist..." -ForegroundColor Yellow
$AllowlistKey = "$PolicyPath\ExtensionInstallAllowlist"

if (!(Test-Path $AllowlistKey)) { 
    New-Item -Path $AllowlistKey -Force | Out-Null 
}

New-ItemProperty -Path $AllowlistKey -Name "1" -Value "$ExtId" -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null
Write-Host "  OK" -ForegroundColor Green

# ========================================================================
# [5/5] ExtensionInstallSources
# ========================================================================

Write-Host "[5/5] Configurando InstallSources..." -ForegroundColor Yellow
$SourcesKey = "$PolicyPath\ExtensionInstallSources"

if (!(Test-Path $SourcesKey)) { 
    New-Item -Path $SourcesKey -Force | Out-Null 
}

New-ItemProperty -Path $SourcesKey -Name "1" -Value "file:///*" -PropertyType String -Force -ErrorAction SilentlyContinue | Out-Null
Write-Host "  OK" -ForegroundColor Green

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "REGISTRO COMPLETADO" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan

# Verificación
Write-Host ""
Write-Host "Verificando claves..." -ForegroundColor Yellow

$checks = @{
    "Forcelist" = Test-Path $ForcelistKey
    "ExtensionSettings" = Test-Path $ExtSettingsKey
    "External Extensions" = Test-Path $ExtPath
    "Allowlist" = Test-Path $AllowlistKey
    "InstallSources" = Test-Path $SourcesKey
}

foreach ($check in $checks.GetEnumerator()) {
    $status = if ($check.Value) { "OK" } else { "FALLO" }
    $color = if ($check.Value) { "Green" } else { "Red" }
    Write-Host "  $($check.Key): $status" -ForegroundColor $color
}