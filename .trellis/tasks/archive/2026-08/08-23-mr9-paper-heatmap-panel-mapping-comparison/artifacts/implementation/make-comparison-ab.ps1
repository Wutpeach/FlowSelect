# MR9 Paper Heatmap Panel Mapping Comparison — compact labelled two-up sheets.
# Assembles A | B crops at the shared start and at >=12s onto one dark sheet.
# Usage: powershell -ExecutionPolicy Bypass -File make-comparison-ab.ps1
Add-Type -AssemblyName System.Drawing

$artifact = Split-Path -Parent $MyInvocation.MyCommand.Path

foreach ($second in @("00", "12")) {
    $aPath = Join-Path $artifact "ab-a-${second}s.png"
    $bPath = Join-Path $artifact "ab-b-${second}s.png"
    $outputPath = Join-Path $artifact "comparison-ab-${second}s.png"

    $a = [System.Drawing.Image]::FromFile($aPath)
    $b = [System.Drawing.Image]::FromFile($bPath)

    # Leave room for the label row and the timeline note.
    $sheetW = 460
    $sheetH = 270
    $canvas = New-Object System.Drawing.Bitmap $sheetW, $sheetH
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.Clear([System.Drawing.Color]::FromArgb(20, 19, 24))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $titleFont = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Regular)
    $mutedFont = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(236, 232, 242))
    $mutedBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(164, 158, 184))

    $graphics.DrawString("A · Paper interior", $titleFont, $brush, 20, 10)
    $graphics.DrawString("B · real panel + overlay", $titleFont, $brush, 240, 10)
    $graphics.DrawImage($a, 20, 38, 200, 200)
    $graphics.DrawImage($b, 240, 38, 200, 200)
    $graphics.DrawString("t = ${second}s | independent native timelines | B is panel + overlay", $mutedFont, $mutedBrush, 20, 244)

    $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $b.Dispose()
    $a.Dispose()
    $mutedBrush.Dispose()
    $brush.Dispose()
    $mutedFont.Dispose()
    $titleFont.Dispose()
    $graphics.Dispose()
    $canvas.Dispose()
}
