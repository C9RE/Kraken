# ==============================================================================
#  ⚓ KRAKEN — Windrose Dedicated Server Fleet Manager
#  Windows Automated Installation & Setup Script
#  https://thekraken.cloud · https://github.com/C9RE/Kraken
# ==============================================================================

$ErrorActionPreference = 'Stop'

function Write-Banner {
    Write-Host ""
    Write-Host "                  _  __ _____            _  __ ______ _   _ " -ForegroundColor DarkYellow
    Write-Host "                 | |/ /|  __ \     /\   | |/ /|  ____| \ | |" -ForegroundColor DarkYellow
    Write-Host "                 | ' / | |__) |   /  \  | ' / | |__  |  \| |" -ForegroundColor DarkYellow
    Write-Host "                 |  <  |  _  /   / /\ \ |  <  |  __| | . ` |" -ForegroundColor DarkYellow
    Write-Host "                 | . \ | | \ \  / ____ \| . \ | |____| |\  |" -ForegroundColor DarkYellow
    Write-Host "                 |_|\_\|_|  \_\/_/    \_\_|\_\|______|_| \_|" -ForegroundColor DarkYellow
    Write-Host "          ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~" -ForegroundColor Yellow
    Write-Host "             W I N D R O S E   F L E E T   M A N A G E R" -ForegroundColor White
    Write-Host "             Native Windows Control Plane · Multi-Server Supervisor" -ForegroundColor Gray
    Write-Host "             https://thekraken.cloud  ·  https://github.com/C9RE/Kraken" -ForegroundColor Gray
    Write-Host ""
}

function Log-Step($msg) { Write-Host "`n──▶ $msg" -ForegroundColor Yellow }
function Log-Ok($msg)   { Write-Host "  ✔ $msg" -ForegroundColor Green }
function Log-Info($msg) { Write-Host "  ⚓ $msg" -ForegroundColor Cyan }
function Log-Warn($msg) { Write-Host "  ▲ $msg" -ForegroundColor DarkYellow }
function Log-Err($msg)  { Write-Host "  ✖ $msg" -ForegroundColor Red }

Write-Banner

# Step 1: Pre-flight Architecture Checks
Log-Step "Checking Windows Environment"

if ([IntPtr]::Size -ne 8) {
    Log-Err "Kraken and Windrose require a 64-bit (x64) Windows operating system."
    exit 1
}
Log-Ok "Architecture: Windows 64-bit (x64)"

# Step 2: Check Git and Dependencies
Log-Step "Verifying Prerequisites"

if (Get-Command git -ErrorAction SilentlyContinue) {
    $gitVer = git --version
    Log-Ok "Git is installed: $gitVer"
} else {
    Log-Err "Git for Windows is required. Please install Git from https://git-scm.com/download/win"
    exit 1
}

# Check Bun or Node
$bunCmd = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bunCmd) {
    $bunPath = Join-Path $env:USERPROFILE ".bun\bin\bun.exe"
    if (Test-Path $bunPath) {
        $env:Path = "$($env:USERPROFILE)\.bun\bin;" + $env:Path
        $bunCmd = Get-Command bun -ErrorAction SilentlyContinue
    }
}

if ($bunCmd) {
    $bunVer = & bun --version
    Log-Ok "Bun runtime detected: v$bunVer"
} else {
    Log-Info "Bun runtime not found. Installing Bun for Windows..."
    try {
        Invoke-RestMethod -Uri "https://bun.sh/install.ps1" | Invoke-Expression
        $env:Path = "$($env:USERPROFILE)\.bun\bin;" + $env:Path
        $bunVer = & bun --version
        Log-Ok "Bun successfully installed: v$bunVer"
    } catch {
        Log-Warn "Could not auto-install Bun. Checking for Node.js..."
        if (Get-Command node -ErrorAction SilentlyContinue) {
            $nodeVer = node --version
            Log-Ok "Node.js detected: $nodeVer"
        } else {
            Log-Err "Please install Bun (https://bun.sh) or Node.js >= 20."
            exit 1
        }
    }
}

# Step 3: Clone or Locate Kraken Codebase
Log-Step "Setting Up Kraken Codebase"

$targetDir = $env:KRAKEN_DIR
if (-not $targetDir) {
    $targetDir = Join-Path $env:USERPROFILE "kraken"
}

if (Test-Path (Join-Path $targetDir "hub\package.json")) {
    Log-Ok "Found existing Kraken directory at $targetDir"
    Set-Location $targetDir
    git pull origin main
} else {
    Log-Info "Cloning Kraken from GitHub into $targetDir..."
    git clone https://github.com/C9RE/Kraken.git $targetDir
    Set-Location $targetDir
}

# Step 4: Build Kraken Hub Dashboard
Log-Step "Compiling Kraken Hub Dashboard"

Set-Location (Join-Path $targetDir "hub")
Log-Info "Installing dependencies via Bun..."
& bun install

Log-Info "Building SvelteKit web dashboard..."
& bun run build
Log-Ok "Kraken Hub built successfully!"

Set-Location $targetDir

# Step 5: Generate Quickstart Launcher & Fleet Directories
Log-Step "Configuring Windows Native Fleet Engine"

$fleetDir = Join-Path $targetDir "fleet"
if (-not (Test-Path $fleetDir)) {
    New-Item -ItemType Directory -Path $fleetDir | Out-Null
}

$launcherPath = Join-Path $targetDir "start-kraken.bat"
$launcherContent = @"
@echo off
title Kraken Hub - Windrose Fleet Manager
cd /d "%~dp0hub"
set PORT=8783
set HOST=0.0.0.0
set KRAKEN_ENGINE=native
echo ==============================================================================
echo   ⚓ Kraken Hub is launching on http://localhost:8783
echo ==============================================================================
bun run start
pause
"@

Set-Content -Path $launcherPath -Value $launcherContent
Log-Ok "Generated Windows launcher: start-kraken.bat"

# Step 6: Summary & Launch Instructions
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch "Loopback|vEthernet" -and $_.IPAddress -match '^\d+\.\d+\.\d+\.\d+$' } | Select-Object -First 1).IPAddress
if (-not $localIP) { $localIP = "localhost" }

Write-Host "`n==============================================================================" -ForegroundColor Yellow
Write-Host "  🎉 Kraken Windows Installation Complete!" -ForegroundColor Green
Write-Host "==============================================================================`n" -ForegroundColor Yellow

Write-Host "  Access the Kraken Dashboard:" -ForegroundColor White
Write-Host "  ▶ Local:    " -NoNewline
Write-Host "http://localhost:8783" -ForegroundColor Cyan
Write-Host "  ▶ Network:  " -NoNewline
Write-Host "http://${localIP}:8783" -ForegroundColor Cyan

Write-Host "`n  How to Start Kraken:" -ForegroundColor White
Write-Host "  • Double-click " -NoNewline
Write-Host "start-kraken.bat" -ForegroundColor Yellow -NoNewline
Write-Host " in $targetDir"
Write-Host "  • Or run in terminal: " -NoNewline
Write-Host "cd $targetDir\hub; bun run start" -ForegroundColor DarkGray

Write-Host "`n  Fair winds and following seas! ⚓`n" -ForegroundColor DarkYellow
