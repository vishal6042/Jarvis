# Put a "Jarvis" shortcut on the Desktop that launches the whole stack. Run once.
#
#   powershell -ExecutionPolicy Bypass -File scripts\install-shortcut.ps1
#
# Re-running is safe: it overwrites the existing shortcut in place.

$ErrorActionPreference = "Stop"

$root   = Split-Path $PSScriptRoot -Parent
$target = Join-Path $root "start-jarvis.cmd"
$icon   = Join-Path $root "assets\jarvis.ico"

if (-not (Test-Path $target)) { throw "Missing $target - is this script still inside the repo?" }
if (-not (Test-Path $icon))   { & (Join-Path $PSScriptRoot "make-icon.ps1") }

# [Environment] rather than $env:USERPROFILE\Desktop: it gets it right when OneDrive
# has redirected the Desktop folder, which $env:USERPROFILE does not.
$desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::Desktop)
$linkPath = Join-Path $desktop "Jarvis.lnk"

$shell = New-Object -ComObject WScript.Shell
$link  = $shell.CreateShortcut($linkPath)
$link.TargetPath       = $target
$link.WorkingDirectory = $root
$link.IconLocation     = "$icon,0"
$link.Description      = "Start the Jarvis backend services and the web app"
$link.WindowStyle      = 1          # normal window - you want to watch the logs
$link.Save()

Write-Host "Created $linkPath"
Write-Host "  -> $target"
