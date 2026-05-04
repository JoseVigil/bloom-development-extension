param(
[string]$Name = "mac",
[string]$User = "josevigil",
[string]$RemoteHost = "192.168.0.5"
)

$dir = Join-Path $env:USERPROFILE ".ssh"
$path = Join-Path $dir "sessions.json"

if (!(Test-Path $dir)) {
New-Item -ItemType Directory -Path $dir | Out-Null
}

if (!(Test-Path $path)) {
"{}" | Set-Content $path
}

$data = Get-Content $path | ConvertFrom-Json
if (-not $data) { $data = @{} }

$session = @{
User = $User
Host = $RemoteHost
}

$data | Add-Member -NotePropertyName $Name -NotePropertyValue $session -Force
$data | ConvertTo-Json | Set-Content $path

Write-Host "OK guardado en $path"
