# 1. Cerrar Chrome por completo
Write-Host "🛑 Cerrando Chrome..." -ForegroundColor Yellow
Stop-Process -Name "chrome" -Force -ErrorAction SilentlyContinue

# 2. Definir rutas
$ExtensionId = "hpblclepliicmihaplldignhjdggnkdh"
$OldId = "dklfagadamjeocfpcnojogdjakbhfpio"
$ChromeConfigPath = "$env:LOCALAPPDATA\Google\Chrome\User Data"

# 3. Limpiar del Registro
Write-Host "🧹 Limpiando Registro de Windows..." -ForegroundColor Cyan
$RegPaths = @(
    "HKCU:\Software\Google\Chrome\Extensions",
    "HKLM:\Software\Google\Chrome\Extensions"
)

foreach ($root in $RegPaths) {
    if (Test-Path "$root\$OldId") { 
        Remove-Item -Path "$root\$OldId" -Recurse -Force 
        Write-Host "🗑️ Borrado ID viejo del registro: $OldId" -ForegroundColor Gray
    }
    if (Test-Path "$root\$ExtensionId") { 
        Remove-Item -Path "$root\$ExtensionId" -Recurse -Force 
    }
}

# 4. Limpiar rastro en el archivo Preferences de Chrome
Write-Host "🧪 Limpiando preferencias de perfiles de Chrome..." -ForegroundColor Cyan

# EL FIX: Forzamos el resultado a un Array usando @(...)
$Profiles = @(Get-ChildItem -Path $ChromeConfigPath -Filter "Default")
$Profiles += @(Get-ChildItem -Path $ChromeConfigPath -Filter "Profile *")

foreach ($Profile in $Profiles) {
    $PrefFile = Join-Path $Profile.FullName "Preferences"
    if (Test-Path $PrefFile) {
        try {
            $content = Get-Content $PrefFile -Raw -Encoding UTF8 | ConvertFrom-Json
            
            # Verificamos si la propiedad de extensiones existe y tiene el ID viejo
            if ($null -ne $content.extensions -and $null -ne $content.extensions.settings) {
                if ($content.extensions.settings.PSObject.Properties.Name -contains $OldId) {
                    $content.extensions.settings.PSObject.Properties.Remove($OldId)
                    
                    # Guardar el archivo limpio
                    $content | ConvertTo-Json -Depth 100 | Set-Content $PrefFile -Encoding UTF8
                    Write-Host "✨ Limpiado rastro en perfil: $($Profile.Name)" -ForegroundColor Green
                }
            }
        } catch {
            Write-Host "⚠️ No se pudo procesar el perfil: $($Profile.Name). Podría estar bloqueado." -ForegroundColor DarkYellow
        }
    }
}

Write-Host "`n✅ LIMPIEZA COMPLETADA CON ÉXITO." -ForegroundColor Green
Write-Host "Ahora corre el instalador de Electron." -ForegroundColor White