$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$iconDirectory = Join-Path $projectRoot 'build\icons'
$publicDirectory = Join-Path $projectRoot 'public'

function New-IconPngBytes {
    param([int]$Size)

    $bitmap = New-Object System.Drawing.Bitmap(
        $Size,
        $Size,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $memoryStream = New-Object System.IO.MemoryStream
    $scale = $Size / 512.0
    $margin = [int][Math]::Round(54 * $scale)
    $pageX = [int][Math]::Round(154 * $scale)
    $pageY = [int][Math]::Round(112 * $scale)
    $pageWidth = [int][Math]::Round(204 * $scale)
    $pageHeight = [int][Math]::Round(288 * $scale)
    $stroke = [Math]::Max(1, [int][Math]::Round(12 * $scale))
    $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(245, 190, 75), $stroke)
    $pagePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(20, 35, 56), $stroke)
    $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(44, 75, 110), $stroke)
    $paperBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(248, 250, 252))
    $goldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 190, 75))
    try {
        $graphics.Clear([System.Drawing.Color]::FromArgb(20, 35, 56))
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

        $graphics.DrawEllipse($ringPen, $margin, $margin, $Size - (2 * $margin), $Size - (2 * $margin))
        $graphics.FillRectangle($paperBrush, $pageX, $pageY, $pageWidth, $pageHeight)
        $graphics.DrawRectangle($pagePen, $pageX, $pageY, $pageWidth, $pageHeight)
        $graphics.FillRectangle($goldBrush, $pageX, $pageY, [int][Math]::Round(28 * $scale), $pageHeight)
        foreach ($lineY in @(190, 246, 302, 358)) {
            $y = [int][Math]::Round($lineY * $scale)
            $graphics.DrawLine($linePen, [int][Math]::Round(210 * $scale), $y, [int][Math]::Round(320 * $scale), $y)
        }
        $bitmap.Save($memoryStream, [System.Drawing.Imaging.ImageFormat]::Png)
        return ,$memoryStream.ToArray()
    }
    finally {
        $goldBrush.Dispose()
        $paperBrush.Dispose()
        $linePen.Dispose()
        $pagePen.Dispose()
        $ringPen.Dispose()
        $memoryStream.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Write-IcoFile {
    param([string]$Path, [int[]]$Sizes)

    $images = @()
    foreach ($size in $Sizes) {
        $images += ,(New-IconPngBytes -Size $size)
    }

    $stream = [System.IO.File]::Create($Path)
    $writer = New-Object System.IO.BinaryWriter($stream)
    try {
        $writer.Write([UInt16]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]$Sizes.Count)
        $imageOffset = 6 + (16 * $Sizes.Count)
        for ($index = 0; $index -lt $Sizes.Count; $index++) {
            $size = $Sizes[$index]
            $imageBytes = $images[$index]
            $dimension = if ($size -eq 256) { 0 } else { $size }
            $writer.Write([byte]$dimension)
            $writer.Write([byte]$dimension)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([UInt16]1)
            $writer.Write([UInt16]32)
            $writer.Write([UInt32]$imageBytes.Length)
            $writer.Write([UInt32]$imageOffset)
            $imageOffset += $imageBytes.Length
        }
        foreach ($imageBytes in $images) {
            $writer.Write($imageBytes)
        }
    }
    finally {
        $writer.Dispose()
    }
}

New-Item -ItemType Directory -Force -Path $iconDirectory, $publicDirectory | Out-Null
$pngBytes = New-IconPngBytes -Size 512
[System.IO.File]::WriteAllBytes((Join-Path $iconDirectory 'icon.png'), $pngBytes)
[System.IO.File]::WriteAllBytes((Join-Path $publicDirectory 'favicon.png'), $pngBytes)
Write-IcoFile -Path (Join-Path $iconDirectory 'icon.ico') -Sizes @(16, 24, 32, 48, 64, 128, 256)
Write-Output 'Generated build\icons\icon.png, build\icons\icon.ico, and public\favicon.png.'
