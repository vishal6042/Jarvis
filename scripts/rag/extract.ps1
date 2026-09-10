# Turn corpus/sources into the corpus/text that actually gets indexed.
#
#   powershell -ExecutionPolicy Bypass -File scripts\rag\extract.ps1
#
# Run this only when the corpus changes -- a new document, or a Finance Act that dates the tax
# pages. The extracted text is committed, so indexing does not depend on re-downloading anything.
# That matters: incometaxindia.gov.in blocks scripted fetching, so its pages can only be saved by
# hand from a browser, and its own PDFs are truncated screenshots of those same pages.
#
# Why these particular flags, both load-bearing:
#   -layout    keeps two-column tables apart. Without it a DO'S/DON'Ts table is read straight
#              across, splicing each "do" into a "don't" and inverting the advice.
#   -enc UTF-8 keeps accents and the rupee sign intact.

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$sources = Join-Path $root "corpus\sources"
$text = Join-Path $root "corpus\text"
$manifest = Join-Path $root "corpus\manifest.json"

if (-not (Get-Command pdftotext -ErrorAction SilentlyContinue)) {
    throw "pdftotext not found. Install poppler (it ships with Git for Windows' mingw64) and retry."
}
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $python) { $python = Get-Command py -ErrorAction SilentlyContinue }
if (-not $python) { throw "python not found; it is needed to extract the saved HTML pages." }

New-Item -ItemType Directory -Force -Path $text | Out-Null
$docs = (Get-Content $manifest -Raw | ConvertFrom-Json).documents

foreach ($doc in $docs) {
    $pdf = Join-Path $sources "$($doc.id).pdf"
    $html = Join-Path $sources "$($doc.id).html"
    $out = Join-Path $text "$($doc.id).txt"

    if (Test-Path $pdf) {
        & pdftotext -layout -enc UTF-8 -q $pdf $out
        Write-Host "  $($doc.id): pdf" -ForegroundColor Green
    } elseif (Test-Path $html) {
        & $python.Source (Join-Path $PSScriptRoot "html2text.py") $html $out
        Write-Host "  $($doc.id): html" -ForegroundColor Green
    } else {
        Write-Host "  $($doc.id): no source in corpus\sources - keeping existing text" -ForegroundColor Yellow
        continue
    }

    $size = [math]::Round((Get-Item $out).Length / 1KB, 1)
    Write-Host "    -> corpus\text\$($doc.id).txt ($size KB)"
}

Write-Host ""
Write-Host "Now re-index (the running service does not pick this up on its own):" -ForegroundColor Cyan
Write-Host "  cd services; .\mvnw -pl ai-orchestrator-service spring-boot:run ``"
Write-Host "    -Dspring-boot.run.arguments=--jarvis.rag.index-on-start=true"
