# ========================================================================
# BLOOM NUCLEUS - ZOMBIE EXTERMINATION & SERVICE RESET
# ========================================================================
# Este script mata todos los procesos brain.exe, limpia lockfiles y 
# reinicia el servicio en estado limpio

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  BLOOM ZOMBIE EXTERMINATION" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# PASO 1: MATAR TODOS LOS PROCESOS BRAIN.EXE
Write-Host "[1/4] Matando procesos brain.exe..." -ForegroundColor Yellow
$brainProcesses = Get-Process -Name "brain" -ErrorAction SilentlyContinue

if ($brainProcesses) {
    $count = ($brainProcesses | Measure-Object).Count
    Write-Host "  Encontrados: $count procesos" -ForegroundColor Red
    $brainProcesses | ForEach-Object {
        Write-Host "  Matando PID: $($_.Id)" -ForegroundColor Gray
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
    Write-Host "  OK: Procesos terminados" -ForegroundColor Green
} else {
    Write-Host "  OK: No hay procesos brain.exe activos" -ForegroundColor Green
}

# PASO 2: DETENER Y ELIMINAR SERVICIO DE WINDOWS (SI EXISTE)
Write-Host ""
Write-Host "[2/4] Limpiando servicio Windows..." -ForegroundColor Yellow

$service = Get-Service -Name "BloomBrainService" -ErrorAction SilentlyContinue
if ($service) {
    Write-Host "  Deteniendo servicio..." -ForegroundColor Gray
    Stop-Service -Name "BloomBrainService" -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    
    Write-Host "  Eliminando servicio..." -ForegroundColor Gray
    sc.exe delete BloomBrainService | Out-Null
    Start-Sleep -Seconds 1
    Write-Host "  OK: Servicio eliminado" -ForegroundColor Green
} else {
    Write-Host "  OK: Servicio no existe" -ForegroundColor Green
}

# PASO 3: LIMPIAR LOCKFILE
Write-Host ""
Write-Host "[3/4] Limpiando lockfile..." -ForegroundColor Yellow

$lockfilePath = "$env:LOCALAPPDATA\BloomNucleus\.brain\service.pid"
if (Test-Path $lockfilePath) {
    Remove-Item $lockfilePath -Force
    Write-Host "  OK: Lockfile eliminado" -ForegroundColor Green
} else {
    Write-Host "  OK: Lockfile no existe" -ForegroundColor Green
}

# PASO 4: VERIFICAR PUERTO 5678
Write-Host ""
Write-Host "[4/4] Verificando puerto 5678..." -ForegroundColor Yellow

$portCheck = Get-NetTCPConnection -LocalPort 5678 -ErrorAction SilentlyContinue
if ($portCheck) {
    Write-Host "  ADVERTENCIA: Puerto 5678 ocupado por:" -ForegroundColor Red
    $portCheck | ForEach-Object {
        $process = Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue
        Write-Host "    PID: $($_.OwningProcess) - $($process.Name)" -ForegroundColor Gray
    }
    Write-Host "  Intenta cerrar esos procesos manualmente" -ForegroundColor Yellow
} else {
    Write-Host "  OK: Puerto 5678 libre" -ForegroundColor Green
}

# RESUMEN FINAL
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  LIMPIEZA COMPLETA" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ahora puedes iniciar el servicio manualmente:" -ForegroundColor White
Write-Host "  brain service service -h 127.0.0.1 -p 5678" -ForegroundColor Cyan
Write-Host ""
Write-Host "O verificar estado con:" -ForegroundColor White
Write-Host "  netstat -ano | findstr :5678" -ForegroundColor Cyan
Write-Host ""