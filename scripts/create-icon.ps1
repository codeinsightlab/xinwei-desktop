$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$iconCli = Join-Path $projectRoot 'node_modules/.bin/tauri.cmd'
& $iconCli icon (Join-Path $projectRoot 'src/assets/mascot-work.svg') --output (Join-Path $projectRoot 'src-tauri/icons') --fit contain
if ($LASTEXITCODE -ne 0) { throw 'Icon generation failed' }
