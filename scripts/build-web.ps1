$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $projectRoot 'app'
$distRoot = Join-Path $projectRoot 'dist'
$webOutput = Join-Path $distRoot 'web'
$validateScript = Join-Path $PSScriptRoot 'validate.ps1'
$resolvedProjectRoot = [System.IO.Path]::GetFullPath($projectRoot).TrimEnd('\')
$resolvedDistRoot = [System.IO.Path]::GetFullPath($distRoot).TrimEnd('\')
$resolvedWebOutput = [System.IO.Path]::GetFullPath($webOutput).TrimEnd('\')

if (-not $resolvedDistRoot.StartsWith($resolvedProjectRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use a dist directory outside the project: $resolvedDistRoot"
}
if (-not $resolvedWebOutput.StartsWith($resolvedDistRoot + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use a web output directory outside dist: $resolvedWebOutput"
}

& $validateScript

if (Test-Path -LiteralPath $webOutput) {
  Remove-Item -LiteralPath $webOutput -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $webOutput | Out-Null
Copy-Item -Path (Join-Path $appRoot '*') -Destination $webOutput -Recurse -Force

$sourceFiles = @(Get-ChildItem -LiteralPath $appRoot -Recurse -File)
$outputFiles = @(Get-ChildItem -LiteralPath $webOutput -Recurse -File)
if ($sourceFiles.Count -ne $outputFiles.Count) {
  throw "Web build file count mismatch: source=$($sourceFiles.Count), output=$($outputFiles.Count)"
}
if (-not (Test-Path -LiteralPath (Join-Path $webOutput 'index.html') -PathType Leaf)) {
  throw 'The web build root is missing index.html.'
}

$totalBytes = ($outputFiles | Measure-Object -Property Length -Sum).Sum
Write-Host "Web build complete: $webOutput" -ForegroundColor Green
Write-Host "Output: $($outputFiles.Count) files, $([math]::Round($totalBytes / 1KB, 1)) KB"
