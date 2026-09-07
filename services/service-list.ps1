# The Jarvis backend stack, in start order. Reads services.json, which is the single source of
# truth shared with the desktop Control Center - keep the ports and the order in one place, so a
# service added in one launcher cannot go missing from another.
#
# Used by start-all.ps1 (one window per service) and ..\start-jarvis.ps1 (one combined window).
(Get-Content -Raw (Join-Path $PSScriptRoot "services.json") | ConvertFrom-Json).services
