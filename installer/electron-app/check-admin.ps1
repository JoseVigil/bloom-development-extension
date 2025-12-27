# check-admin.ps1
# Script para verificar privilegios de administrador

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

Write-Host ""
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host "  Bloom Nucleus - Admin Check" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

if ($isAdmin) {
    Write-Host "Status: " -NoNewline
    Write-Host "ELEVATED" -ForegroundColor Green
    Write-Host "✅ You have administrator privileges" -ForegroundColor Green
    exit 0
} else {
    Write-Host "Status: " -NoNewline
    Write-Host "STANDARD USER" -ForegroundColor Yellow
    Write-Host "⚠️  You do NOT have administrator privileges" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To run with admin:" -ForegroundColor White
    Write-Host "  npm run dev" -ForegroundColor Cyan
    exit 1
}