# Render the Jarvis brand marks (assets\brand\*.svg) into the raster icons that Windows and
# browsers still insist on: the desktop shortcut / Control Center .ico, and the web app's
# favicon set. Run after editing an SVG; the SVGs are the source, these files are derived.
#
# Chrome (or Edge) does the rasterising - it is the only SVG renderer already on the machine,
# and GDI+ cannot read SVG at all. GDI+ is still what packs the PNGs into an .ico.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$root  = Split-Path $PSScriptRoot -Parent
$brand = Join-Path $root "assets\brand"
$work  = Join-Path ([System.IO.Path]::GetTempPath()) ("jarvis-brand-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $work -Force | Out-Null

# Below 64px the full mark turns to mush, so the small frames are drawn from the simplified
# face and the large ones from the complete robot-and-chart tile.
$icoFrames = @(
    @{ size =  16; svg = "jarvis-favicon.svg" },
    @{ size =  32; svg = "jarvis-favicon.svg" },
    @{ size =  48; svg = "jarvis-favicon.svg" },
    @{ size =  64; svg = "jarvis-icon.svg"    },
    @{ size = 128; svg = "jarvis-icon.svg"    },
    @{ size = 256; svg = "jarvis-icon.svg"    }
)

$webPngs = @(
    @{ size = 180; svg = "jarvis-icon.svg"; out = "frontend\public\apple-touch-icon.png" },
    @{ size = 192; svg = "jarvis-icon.svg"; out = "frontend\public\icon-192.png"         },
    @{ size = 512; svg = "jarvis-icon.svg"; out = "frontend\public\icon-512.png"         }
)

function Find-Browser {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($c in $candidates) { if (Test-Path $c) { return $c } }
    throw "Neither Chrome nor Edge was found; one of them is needed to rasterise the SVGs."
}

# A headless screenshot of a page holding nothing but the SVG at the exact pixel size, on a
# transparent backdrop.
function Convert-SvgToPng([string]$browser, [string]$svgFile, [int]$size, [string]$outFile) {
    $svgUrl = "file:///" + ($svgFile -replace '\\', '/')
    $page   = Join-Path $work ("page-" + [guid]::NewGuid().ToString("N") + ".html")
    $html   = '<!doctype html><meta charset="utf-8">' + [Environment]::NewLine +
              '<style>html,body{margin:0;padding:0;background:transparent}' +
              "img{display:block;width:${size}px;height:${size}px}</style>" + [Environment]::NewLine +
              "<img src=`"$svgUrl`">"
    Set-Content -Path $page -Value $html -Encoding utf8

    New-Item -ItemType Directory -Path (Split-Path $outFile -Parent) -Force | Out-Null
    if (Test-Path $outFile) { Remove-Item $outFile -Force }

    $switches = @(
        "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
        "--default-background-color=00000000", "--user-data-dir=$work\browser",
        "--screenshot=$outFile", "--window-size=$size,$size",
        ("file:///" + ($page -replace '\\', '/'))
    )
    $log = Join-Path $work "browser.log"
    Start-Process -FilePath $browser -ArgumentList $switches -NoNewWindow -Wait `
                  -RedirectStandardError $log -RedirectStandardOutput "$log.out" | Out-Null
    if (-not (Test-Path $outFile)) { throw "Rasterising $svgFile at ${size}px produced nothing." }
}

# A DIB entry: BITMAPINFOHEADER, then bottom-up BGRA rows, then the legacy 1bpp AND mask.
# GDI+ can't decode PNG-compressed entries, so everything below 256 is stored this way.
function ConvertTo-BmpEntry($bmp) {
    $size = $bmp.Width
    $rect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
    $data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly,
                          [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $stride = $data.Stride
    $pixels = New-Object byte[] ($stride * $size)
    [System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $pixels, 0, $pixels.Length)
    $bmp.UnlockBits($data)

    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter($ms)

    $bw.Write([uint32]40)             # biSize
    $bw.Write([int32]$size)           # biWidth
    $bw.Write([int32]($size * 2))     # biHeight: XOR image plus AND mask
    $bw.Write([uint16]1)              # biPlanes
    $bw.Write([uint16]32)             # biBitCount
    $bw.Write([uint32]0)              # biCompression: BI_RGB
    $bw.Write([uint32]($size * $size * 4))
    $bw.Write([int32]0); $bw.Write([int32]0)    # pixels-per-metre
    $bw.Write([uint32]0); $bw.Write([uint32]0)  # palette counts

    # GDI's 32bpp layout is already BGRA; only the row order has to flip.
    for ($y = $size - 1; $y -ge 0; $y--) { $bw.Write($pixels, $y * $stride, $size * 4) }

    # The alpha channel carries transparency, so the mask is all zeros - but its bytes,
    # padded to a 4-byte row, still have to be there or the icon is read as half-height.
    $maskRow = [math]::Ceiling($size / 8.0)
    if ($maskRow % 4 -ne 0) { $maskRow += 4 - ($maskRow % 4) }
    $bw.Write((New-Object byte[] ($maskRow * $size)))

    $bw.Flush()
    $bytes = $ms.ToArray()
    $bw.Dispose(); $ms.Dispose()
    return $bytes
}

function New-Ico([object[]]$entries, [string]$outFile) {
    New-Item -ItemType Directory -Path (Split-Path $outFile -Parent) -Force | Out-Null
    $fs = [System.IO.File]::Create($outFile)
    $bw = New-Object System.IO.BinaryWriter($fs)
    try {
        $bw.Write([uint16]0)              # reserved
        $bw.Write([uint16]1)              # type: icon
        $bw.Write([uint16]$entries.Count)

        # Image data follows the directory, so the first offset clears all the entries.
        $offset = 6 + (16 * $entries.Count)
        foreach ($e in $entries) {
            # 256 is stored as 0 - the field is a single byte.
            $dim = $e.size
            if ($dim -ge 256) { $dim = 0 }
            $bw.Write([byte]$dim)         # width
            $bw.Write([byte]$dim)         # height
            $bw.Write([byte]0)            # palette size (0 = truecolour)
            $bw.Write([byte]0)            # reserved
            $bw.Write([uint16]1)          # colour planes
            $bw.Write([uint16]32)         # bits per pixel
            $bw.Write([uint32]$e.bytes.Length)
            $bw.Write([uint32]$offset)
            $offset += $e.bytes.Length
        }
        foreach ($e in $entries) { $bw.Write([byte[]]$e.bytes, 0, $e.bytes.Length) }
    } finally { $bw.Dispose(); $fs.Dispose() }
}

try {
    $browser = Find-Browser
    Write-Host "Rasterising with $(Split-Path $browser -Leaf)"

    $entries = @()
    foreach ($frame in $icoFrames) {
        $png = Join-Path $work ("ico-" + $frame.size + ".png")
        Convert-SvgToPng $browser (Join-Path $brand $frame.svg) $frame.size $png
        if ($frame.size -ge 256) {
            $bytes = [System.IO.File]::ReadAllBytes($png)
        } else {
            $bmp   = New-Object System.Drawing.Bitmap($png)
            $bytes = [byte[]](ConvertTo-BmpEntry $bmp)
            $bmp.Dispose()
        }
        $entries += ,@{ size = $frame.size; bytes = $bytes }
    }

    foreach ($ico in @("assets\jarvis.ico", "desktop\build\icon.ico")) {
        $out = Join-Path $root $ico
        New-Ico $entries $out
        Write-Host "Wrote $ico ($((Get-Item $out).Length) bytes, $(($icoFrames.size) -join '/') px)"
    }

    # The browser favicon: the three small frames, all from the simplified face.
    $faviconEntries = @($entries | Where-Object { $_.size -le 48 })
    $faviconIco = Join-Path $root "frontend\public\favicon.ico"
    New-Ico $faviconEntries $faviconIco
    Write-Host "Wrote frontend\public\favicon.ico ($((Get-Item $faviconIco).Length) bytes, 16/32/48 px)"

    foreach ($png in $webPngs) {
        $out = Join-Path $root $png.out
        Convert-SvgToPng $browser (Join-Path $brand $png.svg) $png.size $out
        Write-Host "Wrote $($png.out) ($($png.size)px)"
    }

    # The SVGs the web app links to directly.
    Copy-Item (Join-Path $brand "jarvis-favicon.svg") (Join-Path $root "frontend\public\favicon.svg") -Force
    Copy-Item (Join-Path $brand "jarvis-mark.svg")    (Join-Path $root "frontend\public\jarvis-mark.svg") -Force
    Copy-Item (Join-Path $brand "jarvis-favicon.svg") (Join-Path $root "desktop\public\favicon.svg") -Force
    Write-Host "Copied favicon.svg and jarvis-mark.svg into frontend\public, favicon.svg into desktop\public"
} finally {
    Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
