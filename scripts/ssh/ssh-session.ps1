param(
[Parameter(Position=0)]
[ValidateSet("save","connect","list")]
[string]$Action = "connect",
[string]$Name = "mac",
[string]$User = "josevigil",
[string]$RemoteHost = "192.168.0.5",
[string]$Cm

)

$dir = Join-Path $env:USERPROFILE ".ssh"
$path = Join-Path $dir "sessions.json"

# asegurar carpeta

if (!(Test-Path $dir)) {
New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

# asegurar archivo

if (!(Test-Path $path)) {
"{}" | Set-Content $path
}

$data = Get-Content $path | ConvertFrom-Json
if (-not $data) { $data = @{} }

switch ($Action) {

"save" {
    $session = @{
        User = $User
        Host = $RemoteHost
    }

    $data | Add-Member -NotePropertyName $Name -NotePropertyValue $session -Force
    $data | ConvertTo-Json | Set-Content $path

    Write-Host "Guardado: $Name → $User@$RemoteHost"
}

"list" {
    $data | Format-Table
}

"connect" {
    if (-not $data.$Name) {
        Write-Host "Sesion '$Name' no existe"
        exit
    }

    $User = $data.$Name.User
    $RemoteHost = $data.$Name.Host

    if ($Cmd) {
        ssh "$User@$RemoteHost" $Cmd
    } else {
        ssh "$User@$RemoteHost"
    }
}

}
