Add-Type -AssemblyName System.Drawing

$artifact = Split-Path -Parent $MyInvocation.MyCommand.Path

foreach ($second in @("00", "12")) {
    $labPath = Join-Path $artifact "lab-rounded-${second}s.png"
    $officialPath = Join-Path $artifact "official-default-${second}s.png"
    $outputPath = Join-Path $artifact "comparison-${second}s.png"

    $canvas = New-Object System.Drawing.Bitmap 760, 330
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    $graphics.Clear([System.Drawing.Color]::FromArgb(20, 19, 24))
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Regular)
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(236, 232, 242))
    $mutedBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(164, 158, 184))
    $lab = [System.Drawing.Image]::FromFile($labPath)
    $official = [System.Drawing.Image]::FromFile($officialPath)

    $graphics.DrawString("Rounded-rect baseline | 200x200/r16", $font, $brush, 20, 10)
    $graphics.DrawImage($lab, 20, 38, 280, 280)
    $graphics.DrawString("Official demo | Default diamond", $font, $brush, 320, 10)
    $graphics.DrawImage($official, 320, 58, 420, 236)
    $graphics.DrawString("t = ${second}s | independent native timelines", $font, $mutedBrush, 320, 298)

    $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $official.Dispose()
    $lab.Dispose()
    $mutedBrush.Dispose()
    $brush.Dispose()
    $font.Dispose()
    $graphics.Dispose()
    $canvas.Dispose()
}
