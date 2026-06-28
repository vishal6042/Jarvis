# Launch the full Jarvis microservice stack (Windows PowerShell).
# Prereqs: PostgreSQL 18 on :5432 with the single `jarvis` database (all services share it,
#          each with its own Flyway history table); Ollama on :11434 with the qwen3.5 models pulled.
#
# Usage:  ./start-all.ps1
# Each service opens in its own window. Eureka dashboard: http://localhost:8761

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
if (-not $env:JAVA_HOME) {
    $env:JAVA_HOME = "C:\Users\bhart\.jdks\liberica-full-21.0.10"
}

Write-Host "Installing all modules to the local repo (so each service can run standalone)..."
& "$root\mvnw.cmd" -q -DskipTests install
if ($LASTEXITCODE -ne 0) { throw "Build failed." }

# discovery first; gateway last. Give Eureka a head start so the rest register cleanly.
$services = @(
    @{ name = "discovery-service";       wait = 12 },
    @{ name = "auth-service";            wait = 4  },
    @{ name = "expense-service";         wait = 4  },
    @{ name = "ai-orchestrator-service"; wait = 4  },
    @{ name = "ingestion-service";       wait = 4  },
    @{ name = "finance-service";         wait = 4  },
    @{ name = "api-gateway";             wait = 0  }
)

foreach ($svc in $services) {
    Write-Host "Starting $($svc.name) ..."
    Start-Process -FilePath "powershell" -ArgumentList @(
        "-NoExit", "-Command",
        "`$env:JAVA_HOME='$($env:JAVA_HOME)'; & '$root\mvnw.cmd' -pl $($svc.name) spring-boot:run"
    ) -WorkingDirectory $root
    if ($svc.wait -gt 0) { Start-Sleep -Seconds $svc.wait }
}

Write-Host "All services launching. Gateway: http://localhost:8080  Eureka: http://localhost:8761"
