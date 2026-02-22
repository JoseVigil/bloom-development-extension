# bloom-conductor-version.ps1
# Lee build_info.json del conductor empaquetado
# Uso: .\bloom-conductor-version.ps1
#      .\bloom-conductor-version.ps1 --json

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildInfoPath = Join-Path $scriptDir "resources\app.asar.unpacked\build_info.json"

if (-not (Test-Path $buildInfoPath)) {
    Write-Error "build_info.json not found at: $buildInfoPath"
    exit 1
}

$info = Get-Content $buildInfoPath | ConvertFrom-Json

if ($args -contains "--json") {
    $info | ConvertTo-Json
} else {
    Write-Host "name:            $($info.product_name)"
    Write-Host "version:         $($info.version)"
    Write-Host "build:           $($info.build)"
    Write-Host "full_version:    $($info.full_version)"
    Write-Host "channel:         $($info.channel)"
    Write-Host "built_at:        $($info.built_at)"
    Write-Host "git_commit:      $($info.git_commit)"
    Write-Host "platform:        $($info.platform)"
    Write-Host "arch:            $($info.arch)"
}