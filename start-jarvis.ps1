# Start the whole Jarvis stack - 8 backend services + the frontend dev server - in ONE window,
# with every service's log streamed here behind a coloured [name] prefix.
#
# This is what the desktop shortcut runs (via start-jarvis.cmd). To restart just one or two
# services while you work, use services\start-all.ps1 instead - it gives each its own window.
#
# Usage:
#   .\start-jarvis.ps1              # build, start everything, open the app
#   .\start-jarvis.ps1 -NoBuild     # skip the Maven build and launch what's already built
#   .\start-jarvis.ps1 -NoBrowser   # don't open the browser when it's up
#
# Ctrl+C shuts the whole stack down.

[CmdletBinding()]
param(
    [switch]$NoBuild,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$root        = $PSScriptRoot
$servicesDir = Join-Path $root "services"
$frontendDir = Join-Path $root "frontend"
$logDir      = Join-Path $root "logs"
$mvnw        = Join-Path $servicesDir "mvnw.cmd"

$services = & (Join-Path $servicesDir "service-list.ps1")

# Colours cycle across services so you can pick one out of the interleaved stream at a glance.
$palette = @("Cyan", "Green", "Yellow", "Magenta", "Blue", "DarkCyan", "DarkGreen", "DarkYellow")

function Write-Step($msg)  { Write-Host "==> $msg" -ForegroundColor White }
function Write-Warn($msg)  { Write-Host "!!  $msg" -ForegroundColor Yellow }

function Test-Listening([int]$port) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    return ($null -ne $conn)
}

function Stop-OnPort([int]$port) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { try { Stop-Process -Id $_ -Force -ErrorAction Stop } catch {} }
}

# ---------------------------------------------------------------- preflight

Write-Step "Checking prerequisites"

if (-not $env:JAVA_HOME) { $env:JAVA_HOME = "C:\Users\bhart\.jdks\liberica-full-21.0.10" }
if (-not (Test-Path (Join-Path $env:JAVA_HOME "bin\java.exe"))) {
    throw "No JDK at JAVA_HOME ($env:JAVA_HOME). Install JDK 21 or set JAVA_HOME to it."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node is not on PATH. The frontend needs Node 20+."
}

# Postgres is non-negotiable: without it every service fails its first migration.
if (-not (Test-Listening 5432)) {
    throw "PostgreSQL is not listening on :5432. Start the service, then run this again."
}

# Ollama only degrades the AI service, so it's a warning rather than a stop.
if (-not (Test-Listening 11434)) {
    Write-Warn "Ollama is not listening on :11434 - the AI features will not work."
}

# ---------------------------------------------------------------- stop anything still running

# Before the build, not after: `clean` deletes the classes a previously-started stack is running
# from, and a build that then fails would leave those services alive on top of deleted artifacts.
# Freeing the ports here also clears a stack orphaned by a previous run, which is what makes this
# script a restart rather than something that fights for the ports.
Write-Step "Stopping anything already running"
foreach ($svc in $services) { Stop-OnPort $svc.port }
Stop-OnPort 5173
Start-Sleep -Seconds 1

# ---------------------------------------------------------------- build

if ($NoBuild) {
    Write-Step "Skipping build (-NoBuild)"
} else {
    Write-Step "Building all modules from scratch (this is the slow part)"
    # mvnw resolves the reactor from the working directory, and the parent POM is in services\.
    #
    # `clean` is not optional. VS Code's Java extension compiles into the same target\classes that
    # Maven uses, and on an error it writes a class whose methods throw at runtime. Maven then sees
    # a class no older than its source, skips the file, and reports SUCCESS over code that cannot
    # run -- which is how a missing import shipped and left EMI matching broken for two days.
    # Neither incremental mode catches it: both compare timestamps, and the timestamps look fine.
    # Wiping the outputs is what makes the build tell the truth. Use -NoBuild to skip it entirely.
    Push-Location $servicesDir
    try {
        & $mvnw -q -DskipTests clean install
        if ($LASTEXITCODE -ne 0) { throw "Build failed - nothing was started." }
    } finally { Pop-Location }
}

if (-not (Test-Path (Join-Path $frontendDir "node_modules"))) {
    Write-Step "Installing frontend dependencies (first run only)"
    Push-Location $frontendDir
    try {
        & npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed - nothing was started." }
    } finally { Pop-Location }
}

# ---------------------------------------------------------------- launch

if (Test-Path $logDir) { Remove-Item "$logDir\*.log" -Force -ErrorAction SilentlyContinue }
else { New-Item -ItemType Directory -Path $logDir | Out-Null }

$procs   = @()   # child processes, for shutdown
$readers = @()   # log files being tailed into this window

function Start-Tracked($label, $colour, $exe, $argList, $workDir) {
    $out = Join-Path $logDir "$label.log"
    $err = Join-Path $logDir "$label.err.log"
    $p = Start-Process -FilePath $exe -ArgumentList $argList -WorkingDirectory $workDir `
                       -RedirectStandardOutput $out -RedirectStandardError $err `
                       -NoNewWindow -PassThru
    $script:procs += $p
    # stdout and stderr are tailed under the same label - you don't care which stream it was.
    $script:readers += @{ label = $label; colour = $colour; path = $out; pos = [long]0 }
    $script:readers += @{ label = $label; colour = $colour; path = $err; pos = [long]0 }
}

for ($i = 0; $i -lt $services.Count; $i++) {
    $svc    = $services[$i]
    $colour = $palette[$i % $palette.Count]
    Write-Step "[$($svc.n)] $($svc.name) on :$($svc.port)"
    Start-Tracked $svc.name $colour $mvnw @("-pl", $svc.name, "spring-boot:run") $servicesDir
    if ($i -lt $services.Count - 1 -and $svc.wait -gt 0) { Start-Sleep -Seconds $svc.wait }
}

Write-Step "frontend on :5173"
Start-Tracked "frontend" "White" "npm.cmd" @("run", "dev") $frontendDir

# ---------------------------------------------------------------- stream the logs

# Read whole bytes and hold back any trailing partial line, so a line split across two polls
# is printed once, intact. FileShare ReadWrite is what lets us read a file still being written.
function Pump-Log($reader) {
    if (-not (Test-Path $reader.path)) { return }
    $fs = $null
    try {
        $fs = [System.IO.File]::Open($reader.path, [System.IO.FileMode]::Open,
                                     [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)
        $pending = $fs.Length - $reader.pos
        if ($pending -le 0) { return }

        $buf = New-Object byte[] ([int]$pending)
        $fs.Seek($reader.pos, [System.IO.SeekOrigin]::Begin) | Out-Null
        $read = $fs.Read($buf, 0, $buf.Length)
        $text = [System.Text.Encoding]::UTF8.GetString($buf, 0, $read)

        $cut = $text.LastIndexOf("`n")
        if ($cut -lt 0) { return }          # nothing but a partial line yet - wait for more
        $whole = $text.Substring(0, $cut + 1)
        $reader.pos += [System.Text.Encoding]::UTF8.GetByteCount($whole)

        foreach ($line in ($whole -split "`r?`n")) {
            if ($line.Length -gt 0) { Write-Host "[$($reader.label)] $line" -ForegroundColor $reader.colour }
        }
    } catch {} finally { if ($fs) { $fs.Dispose() } }
}

$announced = $false
try {
    Write-Host ""
    Write-Step "Streaming logs. Ctrl+C stops everything."
    Write-Host ""

    while ($true) {
        foreach ($r in $readers) { Pump-Log $r }

        if (-not $announced -and (Test-Listening 5173) -and (Test-Listening 8080)) {
            $announced = $true
            Write-Host ""
            Write-Host "  Jarvis is up - app http://localhost:5173  gateway :8080  eureka :8761" -ForegroundColor Green
            Write-Host ""
            if (-not $NoBrowser) { Start-Process "http://localhost:5173" }
        }

        Start-Sleep -Milliseconds 400
    }
} finally {
    Write-Host ""
    Write-Step "Shutting the stack down"
    foreach ($p in $procs) { try { Stop-Process -Id $p.Id -Force -ErrorAction Stop } catch {} }
    # The java processes are grandchildren of those cmd wrappers, so killing the wrapper isn't
    # enough - go by port, which is what actually has to be free for the next run.
    foreach ($svc in $services) { Stop-OnPort $svc.port }
    Stop-OnPort 5173
    Write-Step "Stopped. Logs are in logs\."
}
