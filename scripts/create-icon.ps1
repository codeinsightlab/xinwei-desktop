Add-Type -AssemblyName System.Drawing
$iconFolder = Join-Path $PSScriptRoot '../src-tauri/icons'
New-Item -ItemType Directory -Path $iconFolder -Force | Out-Null
$bitmap = [System.Drawing.Bitmap]::new(128,128,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(255,61,103,80))
$pen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(255,241,237,214),7)
$pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$graphics.DrawLine($pen,39,32,64,58)
$graphics.DrawLine($pen,89,32,64,58)
$graphics.DrawLine($pen,64,58,64,98)
$graphics.DrawLine($pen,39,66,89,66)
$graphics.DrawLine($pen,39,80,89,80)
$pngPath = Join-Path $iconFolder '128x128.png'
$bitmap.Save($pngPath,[System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = [System.IO.File]::ReadAllBytes($pngPath)
$writer = [System.IO.BinaryWriter]::new([System.IO.File]::Create((Join-Path $iconFolder 'icon.ico')))
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]128); $writer.Write([byte]128); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$pngBytes.Length); $writer.Write([uint32]22)
$writer.Write($pngBytes)
$writer.Dispose(); $graphics.Dispose(); $pen.Dispose(); $bitmap.Dispose()
