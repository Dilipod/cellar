# Dilipod Box — Windows Service Setup
# Registers cellar as a Windows service for always-on execution.

$ServiceName = "DilipodCellar"
$DisplayName = "Dilipod Cellar Runtime"
$Description = "Desktop agent runtime powered by CEL (Context Execution Layer)"
$BinaryPath = "$env:USERPROFILE\.dilipod\cellar.exe"

# Check if running as admin
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator"
    exit 1
}

# Create the service
if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    Write-Host "Service '$ServiceName' already exists. Updating..."
    Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
    sc.exe delete $ServiceName
}

New-Service -Name $ServiceName `
    -DisplayName $DisplayName `
    -Description $Description `
    -BinaryPathName $BinaryPath `
    -StartupType Automatic

Write-Host "Service '$ServiceName' created."
Write-Host "Starting service..."
Start-Service -Name $ServiceName
Write-Host "Service started."
