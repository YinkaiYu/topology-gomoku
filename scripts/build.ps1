$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $projectRoot 'app'
$releaseRoot = Join-Path $projectRoot 'release'
$zipPath = Join-Path $releaseRoot 'topology-gomoku.zip'
$validateScript = Join-Path $PSScriptRoot 'validate.ps1'
$appRootPrefix = $appRoot + [System.IO.Path]::DirectorySeparatorChar

& $validateScript

New-Item -ItemType Directory -Force -Path $releaseRoot | Out-Null
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -Force -LiteralPath $zipPath
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipStream = [System.IO.File]::Open($zipPath, [System.IO.FileMode]::CreateNew)
$zipArchive = [System.IO.Compression.ZipArchive]::new(
  $zipStream,
  [System.IO.Compression.ZipArchiveMode]::Create,
  $false
)
try {
  Get-ChildItem -LiteralPath $appRoot -Recurse -File | ForEach-Object {
    $relativePath = $_.FullName.Substring($appRootPrefix.Length).Replace('\', '/')
    if ($relativePath.Contains('..') -or $relativePath.StartsWith('/') -or $relativePath.Contains('\')) {
      throw "Unsafe package path: $relativePath"
    }
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $zipArchive,
      $_.FullName,
      $relativePath,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $zipArchive.Dispose()
  $zipStream.Dispose()
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  $entryNames = @($archive.Entries | ForEach-Object { $_.FullName })
  $unsafeEntries = @($entryNames | Where-Object {
    $_.Contains('..') -or $_.StartsWith('/') -or $_.Contains('\')
  })
  if ($unsafeEntries.Count -gt 0) {
    throw "The package contains unsafe paths: $($unsafeEntries -join ', ')"
  }
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

$hashStream = [System.IO.File]::OpenRead($zipPath)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
try {
  $hashBytes = $sha256.ComputeHash($hashStream)
  $hashHex = -join ($hashBytes | ForEach-Object { $_.ToString('X2') })
} finally {
  $sha256.Dispose()
  $hashStream.Dispose()
}
Write-Host "Build complete: $zipPath" -ForegroundColor Green
Write-Host "Package size: $([math]::Round($zipInfo.Length / 1KB, 1)) KB"
Write-Host "SHA256: $hashHex"
