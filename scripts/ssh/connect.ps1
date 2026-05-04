# connect.ps1

param(
[string]$Name = "mac",
[string]$Cmd
)

$path = "$env:USERPROFILE.ssh\sessions.json"

if (!(Test-Path $path)) {
Write-Host "No hay sesiones guardadas" -ForegroundColor Red
exit
}

$data = Get-Content $path | ConvertFrom-Json

if (-not $data.$Name) {
Write-Host "Sesion '$Name' no existe" -ForegroundColor Red
exit
}

$User = $data.$Name.User
$RemoteHost = $data.$Name.Host

Write-Host "Conectando a $User@$RemoteHost ..." -ForegroundColor Cyan

if ($Cmd) {
ssh "$User@$RemoteHost" $Cmd
} else {
ssh "$User@$RemoteHost"
}
