$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$directory = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets'
function Draw-Icon([int]$Size, [string]$Status, [string]$Name) {
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $bg = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#18241f'))
    $fg = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($(if ($Status -eq 'offline') { '#87928c' } else { '#b5dacb' })))
    $graphics.FillEllipse($bg, 1, 1, ($Size - 2), ($Size - 2))
    $graphics.FillEllipse($fg, [single]($Size * .24), [single]($Size * .18), [single]($Size * .53), [single]($Size * .64))
    $graphics.FillEllipse($bg, [single]($Size * .39), [single]($Size * .12), [single]($Size * .48), [single]($Size * .64))
    if ($Status) {
        $color = switch ($Status) { 'online' { '#70d5a0' } 'warning' { '#ebba65' } default { '#7d8692' } }
        $dot = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml($color))
        $graphics.FillEllipse($dot, [single]($Size * .71), [single]($Size * .69), [single]($Size * .24), [single]($Size * .24))
        $dot.Dispose()
    }
    $bitmap.Save((Join-Path $directory $Name), [System.Drawing.Imaging.ImageFormat]::Png)
    $fg.Dispose(); $bg.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
}
Draw-Icon 256 '' 'app.png'
foreach ($state in @('online', 'warning', 'offline')) { Draw-Icon 32 $state ('tray-' + $state + '.png') }
$png = [System.IO.File]::ReadAllBytes((Join-Path $directory 'app.png'))
$stream = [System.IO.File]::Create((Join-Path $directory 'app.ico'))
$writer = New-Object System.IO.BinaryWriter($stream)
$writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]1)
$writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0); $writer.Write([byte]0)
$writer.Write([uint16]1); $writer.Write([uint16]32); $writer.Write([uint32]$png.Length); $writer.Write([uint32]22); $writer.Write($png)
$writer.Dispose(); $stream.Dispose()
