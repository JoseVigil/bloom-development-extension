# Limpia TODAS las claves de Bloom para testing
Write-Host "Limpiando registro de Bloom..." -ForegroundColor Yellow

$paths = @(
    "HKCU:\Software\Policies\Google\Chrome\ExtensionInstallForcelist",
    "HKCU:\Software\Policies\Google\Chrome\ExtensionSettings",
    "HKCU:\Software\Policies\Google\Chrome\ExtensionInstallAllowlist",
    "HKCU:\Software\Policies\Google\Chrome\ExtensionInstallSources",
    "HKCU:\Software\Google\Chrome\Extensions\*"
)

foreach ($p in $paths) {
    if (Test-Path $p) {
        Remove-Item -Path $p -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Eliminado: $p" -ForegroundColor Green
    }
}

Write-Host "Limpieza completa" -ForegroundColor Cyan