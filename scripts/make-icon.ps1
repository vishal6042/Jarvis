# Generate assets\jarvis.ico for the desktop shortcut. Run once; re-run only to change the look.
#
# The violet is the app's own --primary (oklch(0.68 0.19 280)) converted to sRGB, so the
# shortcut matches the UI it launches.

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$outFile = Join-Path (Split-Path $PSScriptRoot -Parent) "assets\jarvis.ico"
$sizes   = @(16, 32, 48, 64, 128, 256)

$violet = [System.Drawing.Color]::FromArgb(133, 133, 255)
$indigo = [System.Drawing.Color]::FromArgb( 74,  59, 191)

function New-RoundedPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $path.AddArc($x,           $y,           $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y,           $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d,   0, 90)
    $path.AddArc($x,           $y + $h - $d, $d, $d,  90, 90)
    $path.CloseFigure()
    return $path
}

function New-IconBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    # A squircle rather than a full circle: reads as an app tile even at 16px.
    $inset  = [single]($size * 0.02)
    $side   = [single]($size - 2 * $inset)
    $radius = [single]($size * 0.22)
    $shape  = New-RoundedPath $inset $inset $side $side $radius

    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 0)),
        (New-Object System.Drawing.Point($size, $size)),
        $violet, $indigo)
    $g.FillPath($brush, $shape)

    # Scale the glyph off the canvas so it sits identically at every size.
    $font = New-Object System.Drawing.Font("Segoe UI", [single]($size * 0.62),
                                           [System.Drawing.FontStyle]::Bold,
                                           [System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment     = [System.Drawing.StringAlignment]::Center
    $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center

    # Nudged up a hair: the J otherwise looks bottom-heavy in the tile.
    $box = New-Object System.Drawing.RectangleF(0, [single](-$size * 0.04), $size, $size)
    $g.DrawString("J", $font, [System.Drawing.Brushes]::White, $box, $fmt)

    $font.Dispose(); $fmt.Dispose(); $brush.Dispose(); $shape.Dispose(); $g.Dispose()
    return $bmp
}

function ConvertTo-PngEntry($bmp) {
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $bytes = $ms.ToArray()
    $ms.Dispose()
    return $bytes
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

$entries = @()
foreach ($size in $sizes) {
    $bmp = New-IconBitmap $size
    if ($size -ge 256) { $bytes = [byte[]](ConvertTo-PngEntry $bmp) } else { $bytes = [byte[]](ConvertTo-BmpEntry $bmp) }
    $entries += ,@{ size = $size; bytes = $bytes }
    $bmp.Dispose()
}

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

Write-Host "Wrote $outFile ($((Get-Item $outFile).Length) bytes, $($sizes -join '/') px)"
