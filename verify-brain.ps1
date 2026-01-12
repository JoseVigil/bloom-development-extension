# BLOOM NUCLEUS - brain.exe DIAGNOSTIC
# Run this script to diagnose installation issues

$ErrorActionPreference = "Continue"
$BrainExe = "$env:LOCALAPPDATA\BloomNucleus\bin\brain\brain.exe"
$BaseDir = "$env:LOCALAPPDATA\BloomNucleus"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "BLOOM NUCLEUS - brain.exe DIAGNOSTIC" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# TEST 1: File exists
Write-Host "TEST 1: Checking if brain.exe exists..." -ForegroundColor Yellow
Write-Host "Path: $BrainExe" -ForegroundColor Gray

if (Test-Path $BrainExe) {
    $FileInfo = Get-Item $BrainExe
    Write-Host "SUCCESS - File exists" -ForegroundColor Green
    Write-Host "Size: $([math]::Round($FileInfo.Length / 1MB, 2)) MB" -ForegroundColor Gray
    Write-Host "Modified: $($FileInfo.LastWriteTime)" -ForegroundColor Gray
} else {
    Write-Host "FAILED - File not found" -ForegroundColor Red
    Write-Host "Installation is incomplete" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# TEST 2: Can execute --version
Write-Host "TEST 2: Testing basic execution (--version)..." -ForegroundColor Yellow
try {
    $Output = & $BrainExe --version 2>&1 | Out-String
    $ExitCode = $LASTEXITCODE
    
    Write-Host "Exit Code: $ExitCode" -ForegroundColor $(if ($ExitCode -eq 0) { "Green" } else { "Red" })
    Write-Host "Output: $Output" -ForegroundColor White
} catch {
    Write-Host "CRASH: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# TEST 3: Can list profiles
Write-Host "TEST 3: Testing profile list..." -ForegroundColor Yellow
try {
    $Output = & $BrainExe profile list 2>&1 | Out-String
    $ExitCode = $LASTEXITCODE
    
    Write-Host "Exit Code: $ExitCode" -ForegroundColor $(if ($ExitCode -eq 0) { "Green" } else { "Red" })
    Write-Host "Output: $Output" -ForegroundColor White
} catch {
    Write-Host "CRASH: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# TEST 4: Can create profile with --json
Write-Host "TEST 4: Testing profile create --json..." -ForegroundColor Yellow
try {
    $Output = & $BrainExe --json profile create "DiagnosticTest" 2>&1 | Out-String
    $ExitCode = $LASTEXITCODE
    
    Write-Host "Exit Code: $ExitCode" -ForegroundColor $(if ($ExitCode -eq 0) { "Green" } else { "Red" })
    Write-Host "Raw Output: $Output" -ForegroundColor White
    
    if ($ExitCode -eq 0) {
        try {
            $Json = $Output | ConvertFrom-Json
            Write-Host "SUCCESS - Valid JSON" -ForegroundColor Green
            Write-Host "Profile ID: $($Json.id)" -ForegroundColor Cyan
            Write-Host "Alias: $($Json.alias)" -ForegroundColor Cyan
        } catch {
            Write-Host "WARNING - Not valid JSON" -ForegroundColor Yellow
            Write-Host "Parse error: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "CRASH: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# TEST 5: Directory structure
Write-Host "TEST 5: Checking directory structure..." -ForegroundColor Yellow

$Dirs = @(
    "config",
    "profiles",
    "bin",
    "bin\brain",
    "bin\extension",
    "bin\native"
)

foreach ($Dir in $Dirs) {
    $FullPath = Join-Path $BaseDir $Dir
    $Exists = Test-Path $FullPath
    $Status = if ($Exists) { "OK" } else { "MISSING" }
    $Color = if ($Exists) { "Green" } else { "Red" }
    Write-Host "$Status - $Dir" -ForegroundColor $Color
}
Write-Host ""

# TEST 6: Check _internal folder
Write-Host "TEST 6: Checking brain.exe dependencies..." -ForegroundColor Yellow

$BrainDir = Split-Path $BrainExe -Parent
$InternalDir = Join-Path $BrainDir "_internal"

if (Test-Path $InternalDir) {
    $Count = (Get-ChildItem $InternalDir -Recurse -File -ErrorAction SilentlyContinue).Count
    Write-Host "SUCCESS - _internal folder exists" -ForegroundColor Green
    Write-Host "Files in _internal: $Count" -ForegroundColor Gray
} else {
    Write-Host "CRITICAL - _internal folder NOT found" -ForegroundColor Red
    Write-Host "PyInstaller needs this folder to run!" -ForegroundColor Yellow
}
Write-Host ""

# List files in brain folder
Write-Host "Files in bin\brain folder:" -ForegroundColor Gray
$Files = Get-ChildItem $BrainDir -File -ErrorAction SilentlyContinue
if ($Files) {
    foreach ($File in $Files) {
        Write-Host "- $($File.Name) ($([math]::Round($File.Length / 1KB, 2)) KB)" -ForegroundColor DarkGray
    }
} else {
    Write-Host "(empty)" -ForegroundColor DarkGray
}
Write-Host ""

# TEST 7: profiles.json
Write-Host "TEST 7: Checking profiles.json..." -ForegroundColor Yellow

$ProfilesJson = "$BaseDir\config\profiles.json"
if (Test-Path $ProfilesJson) {
    Write-Host "SUCCESS - profiles.json exists" -ForegroundColor Green
    $Content = Get-Content $ProfilesJson -Raw
    Write-Host "Content: $Content" -ForegroundColor DarkGray
    
    try {
        $Profiles = $Content | ConvertFrom-Json
        Write-Host "Valid JSON with $($Profiles.Count) profiles" -ForegroundColor Cyan
    } catch {
        Write-Host "ERROR - Invalid JSON" -ForegroundColor Red
    }
} else {
    Write-Host "INFO - profiles.json does not exist (will be created)" -ForegroundColor Yellow
}
Write-Host ""

# TEST 8: Extension manifest
Write-Host "TEST 8: Checking extension..." -ForegroundColor Yellow

$ExtManifest = "$BaseDir\bin\extension\manifest.json"
if (Test-Path $ExtManifest) {
    Write-Host "SUCCESS - Extension manifest exists" -ForegroundColor Green
    try {
        $ExtData = Get-Content $ExtManifest -Raw | ConvertFrom-Json
        Write-Host "Name: $($ExtData.name)" -ForegroundColor Cyan
        Write-Host "Version: $($ExtData.version)" -ForegroundColor Cyan
    } catch {
        Write-Host "WARNING - Invalid JSON" -ForegroundColor Yellow
    }
} else {
    Write-Host "FAILED - Extension manifest NOT found" -ForegroundColor Red
}
Write-Host ""

# SUMMARY
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$Checks = @{
    "brain.exe exists" = (Test-Path $BrainExe)
    "_internal exists" = (Test-Path $InternalDir)
    "config exists" = (Test-Path "$BaseDir\config")
    "profiles exists" = (Test-Path "$BaseDir\profiles")
    "extension exists" = (Test-Path "$BaseDir\bin\extension")
}

foreach ($Check in $Checks.GetEnumerator()) {
    $Status = if ($Check.Value) { "OK" } else { "FAIL" }
    $Color = if ($Check.Value) { "Green" } else { "Red" }
    Write-Host "$Status - $($Check.Key)" -ForegroundColor $Color
}

Write-Host ""
Write-Host "Copy this entire output and send to developer" -ForegroundColor Yellow
Write-Host ""