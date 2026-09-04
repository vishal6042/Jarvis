# Launch (or restart) the Jarvis microservice stack (Windows PowerShell).
# Prereqs: PostgreSQL 18 on :5432 with the single `jarvis` database (all services share it,
#          each with its own schema); Ollama on :11434 with the qwen3.5 models pulled.
#
# Usage:
#   ./start-all.ps1                 # build + start ALL services (each in its own window)
#   ./start-all.ps1 --service=4,5   # rebuild + RESTART only services #4 and #5
#   ./start-all.ps1 4 5             # same (numbers can be space- or comma-separated)
#
#   #  service                 port
#   1  discovery-service       8761   (Eureka — start first)
#   2  auth-service            8081
#   3  expense-service         8082
#   4  ai-orchestrator-service 8084
#   5  ingestion-service       8083
#   6  finance-service         8085
#   7  notification-service    8086
#   8  api-gateway             8080   (start last)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $env:JAVA_HOME) {
    $env:JAVA_HOME = "C:\Users\bhart\.jdks\liberica-full-21.0.10"
}

# discovery first; gateway last. Give Eureka a head start so the rest register cleanly.
$services = @(
    @{ n = 1; name = "discovery-service";       port = 8761; wait = 12 },
    @{ n = 2; name = "auth-service";            port = 8081; wait = 4  },
    @{ n = 3; name = "expense-service";         port = 8082; wait = 4  },
    @{ n = 4; name = "ai-orchestrator-service"; port = 8084; wait = 4  },
    @{ n = 5; name = "ingestion-service";       port = 8083; wait = 4  },
    @{ n = 6; name = "finance-service";         port = 8085; wait = 4  },
    @{ n = 7; name = "notification-service";    port = 8086; wait = 4  },
    @{ n = 8; name = "api-gateway";             port = 8080; wait = 0  }
)

# Parse a selection from any arg form: "--service=4,5", "4,5", "4 5".
$selected = @()
foreach ($a in $args) {
    foreach ($m in [regex]::Matches([string]$a, '\d+')) { $selected += [int]$m.Value }
}
$selected = @($selected | Sort-Object -Unique)

if ($selected.Count -gt 0) {
    $toRun = @($services | Where-Object { $selected -contains $_.n })
    if ($toRun.Count -eq 0) { throw "No services matched: $($selected -join ', '). Valid: 1-8." }
    $unknown = @($selected | Where-Object { $_ -lt 1 -or $_ -gt $services.Count })
    if ($unknown.Count -gt 0) { Write-Host "Ignoring unknown service number(s): $($unknown -join ', ')" }
    $plList = ($toRun | ForEach-Object { $_.name }) -join ","
    Write-Host "Restarting: $(($toRun | ForEach-Object { "[$($_.n)] $($_.name)" }) -join ', ')"
    & "$root\mvnw.cmd" -q -DskipTests -pl $plList -am install
} else {
    $toRun = $services
    Write-Host "Building all modules to the local repo (so each service can run standalone)..."
    & "$root\mvnw.cmd" -q -DskipTests install
}
if ($LASTEXITCODE -ne 0) { throw "Build failed." }

# Free each target's port so the fresh instance can bind (this is what makes it a *restart*).
function Stop-OnPort([int]$port) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object {
            try { Stop-Process -Id $_ -Force -ErrorAction Stop; Write-Host "  stopped pid $_ on port $port" } catch {}
        }
}
foreach ($svc in $toRun) { Stop-OnPort $svc.port }
Start-Sleep -Seconds 1

for ($i = 0; $i -lt $toRun.Count; $i++) {
    $svc = $toRun[$i]
    Write-Host "Starting [$($svc.n)] $($svc.name) (port $($svc.port)) ..."
    Start-Process -FilePath "powershell" -ArgumentList @(
        "-NoExit", "-Command",
        "`$env:JAVA_HOME='$($env:JAVA_HOME)'; & '$root\mvnw.cmd' -pl $($svc.name) spring-boot:run"
    ) -WorkingDirectory $root
    # Wait before launching the next one (e.g. let Eureka come up). Skip after the last.
    if ($i -lt $toRun.Count - 1 -and $svc.wait -gt 0) { Start-Sleep -Seconds $svc.wait }
}

Write-Host "Done. Gateway: http://localhost:8080  Eureka: http://localhost:8761"
