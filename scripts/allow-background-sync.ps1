# Exempt the Jarvis Sync app from battery optimisation on every attached phone.
#
#   powershell -ExecutionPolicy Bypass -File scripts\allow-background-sync.ps1
#
# Why this matters: a captured SMS sat queued for a day because the PC was unreachable when it
# arrived, WorkManager backed off, and the retry never ran -- the app had been put to sleep. The
# queue is durable and behaves correctly; it just has to be allowed to wake up.
#
# Android's own Doze whitelist is what adb can set, and that is what this does. Samsung keeps a
# SEPARATE "Sleeping apps" list that adb cannot reach, and it is the more aggressive of the two:
# set that one by hand, once per phone, under
#   Settings > Battery > Background usage limits > Never sleeping apps.

$ErrorActionPreference = "Stop"
$pkg = "com.jarvis.sync"

$adb = "C:\Users\bhart\AppData\Local\Android\Sdk\platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
    $found = Get-Command adb -ErrorAction SilentlyContinue
    if (-not $found) { throw "adb not found. Install Android platform-tools, or fix the path in this script." }
    $adb = $found.Source
}

# Skip the header line and anything unauthorised or still connecting.
$serials = & $adb devices | Select-Object -Skip 1 |
    Where-Object { $_ -match "\sdevice$" } |
    ForEach-Object { ($_ -split "\s+")[0] }

if (-not $serials) {
    Write-Host "No phone attached. Plug one in with USB debugging on, then run this again."
    exit 0
}

foreach ($serial in $serials) {
    $model = (& $adb -s $serial shell getprop ro.product.model).Trim()
    Write-Host "$serial ($model)"

    if (-not (& $adb -s $serial shell pm list packages $pkg)) {
        Write-Host "  $pkg is not installed here - skipped." -ForegroundColor Yellow
        continue
    }

    & $adb -s $serial shell dumpsys deviceidle whitelist "+$pkg" | Out-Null
    # Standby buckets throttle jobs even for a whitelisted app; put it back in the active one.
    & $adb -s $serial shell am set-standby-bucket $pkg active | Out-Null

    $listed = & $adb -s $serial shell dumpsys deviceidle whitelist | Select-String -SimpleMatch $pkg
    if ($listed) {
        Write-Host "  exempt from Doze" -ForegroundColor Green
    } else {
        Write-Host "  could NOT add it to the Doze whitelist" -ForegroundColor Red
    }
    Write-Host "  still to do by hand: Settings > Battery > Background usage limits > Never sleeping apps"
}
