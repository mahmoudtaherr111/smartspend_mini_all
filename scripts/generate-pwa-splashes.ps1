param(
  [string]$Source = "public/icon-master-v2.png",
  [string]$OutputDirectory = "public/splash",
  [string]$FileFilter = "apple-splash-*.jpg"
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $Source))
$outputPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $OutputDirectory))

if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
  throw "Splash source was not found: $sourcePath"
}

if (-not (Test-Path -LiteralPath $outputPath -PathType Container)) {
  throw "Splash output directory was not found: $outputPath"
}

$sourceImage = [System.Drawing.Image]::FromFile($sourcePath)
$background = [System.Drawing.ColorTranslator]::FromHtml("#090d16")
$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq "image/jpeg" } |
  Select-Object -First 1
$encoderParameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter(
  [System.Drawing.Imaging.Encoder]::Quality,
  [long]95
)

try {
  $files = Get-ChildItem -LiteralPath $outputPath -Filter $FileFilter
  foreach ($file in $files) {
    if ($file.BaseName -notmatch '^apple-splash-(\d+)-(\d+)$') {
      continue
    }

    $width = [int]$Matches[1]
    $height = [int]$Matches[2]
    $shortEdge = [Math]::Min($width, $height)

    # 80 pt on phones and 104 pt on iPads mirrors a restrained native launch
    # mark. The source stays high resolution and is only ever downscaled.
    if ($shortEdge -ge 1488) {
      $logoPixels = 208
    } elseif ($shortEdge -in 640, 750, 828) {
      $logoPixels = 160
    } else {
      $logoPixels = 240
    }

    $bitmap = New-Object System.Drawing.Bitmap(
      $width,
      $height,
      [System.Drawing.Imaging.PixelFormat]::Format24bppRgb
    )
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear($background)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

        $x = [int](($width - $logoPixels) / 2)
        $y = [int](($height - $logoPixels) / 2)
        $destination = New-Object System.Drawing.Rectangle($x, $y, $logoPixels, $logoPixels)
        $sourceInset = [int]($sourceImage.Width * 0.095)
        $sourceCrop = New-Object System.Drawing.Rectangle(
          $sourceInset,
          $sourceInset,
          ($sourceImage.Width - (2 * $sourceInset)),
          ($sourceImage.Height - (2 * $sourceInset))
        )

        # The master includes safety padding on a dark canvas. Clip to the
        # rounded app tile so that canvas never appears as a square halo.
        $diameter = [single]($logoPixels * 0.36)
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        try {
          $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
          $path.AddArc(($x + $logoPixels - $diameter), $y, $diameter, $diameter, 270, 90)
          $path.AddArc(($x + $logoPixels - $diameter), ($y + $logoPixels - $diameter), $diameter, $diameter, 0, 90)
          $path.AddArc($x, ($y + $logoPixels - $diameter), $diameter, $diameter, 90, 90)
          $path.CloseFigure()
          $graphics.SetClip($path)
          $graphics.DrawImage(
            $sourceImage,
            $destination,
            $sourceCrop.X,
            $sourceCrop.Y,
            $sourceCrop.Width,
            $sourceCrop.Height,
            [System.Drawing.GraphicsUnit]::Pixel
          )
          $graphics.ResetClip()
        } finally {
          $path.Dispose()
        }
      } finally {
        $graphics.Dispose()
      }

      $temporaryPath = "$($file.FullName).tmp"
      $bitmap.Save($temporaryPath, $jpegCodec, $encoderParameters)
      Move-Item -LiteralPath $temporaryPath -Destination $file.FullName -Force
      Write-Output "Generated $($file.Name): ${width}x${height}, logo ${logoPixels}px"
    } finally {
      $bitmap.Dispose()
    }

    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
  }
} finally {
  $encoderParameters.Dispose()
  $sourceImage.Dispose()
}
