$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $projectRoot 'app'
$releaseRoot = Join-Path $projectRoot 'release'
$zipPath = Join-Path $releaseRoot 'topology-gomoku.zip'
$validateScript = Join-Path $PSScriptRoot 'validate.ps1'

& $validateScript

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -Force -LiteralPath $zipPath
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $appRoot,
  $zipPath,
  [System.IO.Compression.CompressionLevel]::Optimal,
  $false
)

$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $entryNames = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
  if ($entryNames -notcontains 'index.html') {
    throw 'The package root is missing index.html.'
  }
  if ($entryNames | Where-Object { $_ -match '^(?:app|dist)/' }) {
    throw 'The package has an extra top-level directory.'
  }
} finally {
  $archive.Dispose()
}

$zipInfo = Get-Item -LiteralPath $zipPath
if ($zipInfo.Length -gt 10MB) {
  throw 'The package exceeds the 10MB size limit.'
}

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath
Write-Host "Build complete: $zipPath" -ForegroundColor Green
Write-Host "Package size: $([math]::Round($zipInfo.Length / 1KB, 1)) KB"
Write-Host "SHA256: $($hash.Hash)"
