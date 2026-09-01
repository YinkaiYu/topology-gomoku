$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$appRoot = Join-Path $projectRoot 'app'
$indexPath = Join-Path $appRoot 'index.html'
$projectRootPrefix = $projectRoot + [System.IO.Path]::DirectorySeparatorChar
$errors = [System.Collections.Generic.List[string]]::new()
$allowedExtensions = @('.html', '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.woff', '.woff2', '.json')

if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
  $errors.Add('Missing app/index.html.')
}

$files = @(Get-ChildItem -LiteralPath $appRoot -Recurse -File)
$htmlFiles = @($files | Where-Object { $_.Extension -eq '.html' })
if ($htmlFiles.Count -ne 1 -or $htmlFiles[0].Name -ne 'index.html') {
  $errors.Add('The package must contain exactly one index.html.')
}

foreach ($file in $files) {
  if ($allowedExtensions -notcontains $file.Extension.ToLowerInvariant()) {
    $errors.Add("Unsupported package file type: $($file.FullName)")
  }
  if ($file.Name -eq '.DS_Store' -or $file.Extension -eq '.map') {
    $errors.Add("Development artifact found in package: $($file.FullName)")
  }
}

if (Test-Path -LiteralPath $indexPath) {
  $html = Get-Content -LiteralPath $indexPath -Raw
  if ($html -notmatch '<!DOCTYPE html>') { $errors.Add('index.html is missing DOCTYPE.') }
  if ($html -notmatch '<html\s+lang="zh-CN"') { $errors.Add('index.html is missing lang="zh-CN".') }
  if ($html -notmatch 'charset="UTF-8"') { $errors.Add('index.html is missing UTF-8 charset.') }
  if ($html -notmatch 'width=device-width' -or $html -notmatch 'viewport-fit=cover') {
    $errors.Add('viewport must contain width=device-width and viewport-fit=cover.')
  }
  if ($html -match '<script(?![^>]*\ssrc=)[^>]*>') { $errors.Add('Inline script detected.') }
  if ($html -match '\son[a-z]+\s*=') { $errors.Add('Inline event handler detected.') }
  if ($html -match 'type\s*=\s*[^ >]*module') { $errors.Add('Module scripts are not allowed.') }
  if ($html -match '<base\b') { $errors.Add('The base element is not allowed.') }
  if ($html -match '<(?:iframe|object)\b') { $errors.Add('iframe and object elements are not allowed.') }

  $resourceMatches = [regex]::Matches($html, '(?:src|href)="([^"]+)"')
  foreach ($match in $resourceMatches) {
    $resource = $match.Groups[1].Value
    if ($resource -match '^(?:https?:|//|/)') {
      $errors.Add("Resource must use a package-relative path: $resource")
      continue
    }
    if ($resource.StartsWith('#') -or $resource.StartsWith('data:')) { continue }
    if ($resource -match '[?#]') {
      $errors.Add("Package resource URL must not include a query string or fragment: $resource")
    }
    $resourcePath = ($resource -split '[?#]', 2)[0]
    $relativeResource = $resourcePath.TrimStart('.', '/', '\')
    if (-not (Test-Path -LiteralPath (Join-Path $appRoot $relativeResource) -PathType Leaf)) {
      $errors.Add("Referenced resource does not exist: $resource")
    }
  }
}

$forbiddenPatterns = [ordered]@{
  'network fetch' = 'fetch\s*\('
  'network XMLHttpRequest' = 'XMLHttpRequest'
  'realtime WebSocket' = 'new\s+WebSocket\s*\('
  'realtime EventSource' = 'new\s+EventSource\s*\('
  'Web Worker' = 'new\s+(?:Shared)?Worker\s*\('
  'Service Worker' = 'serviceWorker\.register'
  'geolocation' = 'navigator\.geolocation'
  'clipboard' = 'navigator\.clipboard|execCommand\s*\('
  'sensors' = 'DeviceMotionEvent|DeviceOrientationEvent|new\s+(?:Accelerometer|Gyroscope|Magnetometer)'
  'external window' = 'window\.open\s*\('
  'dynamic eval' = 'eval\s*\('
  'dynamic Function' = 'new\s+Function\s*\('
  'WebAssembly' = 'WebAssembly\.'
  'external resource' = 'https?://'
  'ES module' = '^\s*(?:import|export)\s'
}

$scanFiles = @($files | Where-Object { $_.Extension -in @('.html', '.css', '.js') })
foreach ($file in $scanFiles) {
  $content = Get-Content -LiteralPath $file.FullName -Raw
  if ($file.Extension -eq '.css') {
    $cssResourceMatches = [regex]::Matches($content, 'url\(\s*([^)]+)\s*\)')
    foreach ($match in $cssResourceMatches) {
      $resource = $match.Groups[1].Value.Trim().Trim('"').Trim("'")
      if ($resource.StartsWith('#') -or $resource.StartsWith('data:') -or $resource.StartsWith('blob:')) { continue }
      if ($resource -match '^(?:https?:|//|/)') {
        $errors.Add("Resource must use a package-relative path: $resource")
        continue
      }
      if ($resource -match '[?#]') {
        $errors.Add("Package resource URL must not include a query string or fragment: $resource")
      }
      $resourcePath = ($resource -split '[?#]', 2)[0]
      if (-not (Test-Path -LiteralPath (Join-Path $file.DirectoryName $resourcePath) -PathType Leaf)) {
        $relative = $file.FullName.Substring($projectRootPrefix.Length)
        $errors.Add("Referenced resource does not exist in $relative`: $resource")
      }
    }
  }
  foreach ($entry in $forbiddenPatterns.GetEnumerator()) {
    if ($content -match $entry.Value) {
      $relative = $file.FullName.Substring($projectRootPrefix.Length)
      $errors.Add("Forbidden capability '$($entry.Key)' detected in $relative")
    }
  }
}

if ($errors.Count -gt 0) {
  Write-Host 'Mini tool validation failed:' -ForegroundColor Red
  foreach ($message in $errors) {
    Write-Host "- $message" -ForegroundColor Red
  }
  throw 'Mini tool validation failed.'
}

$totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
Write-Host "Validation passed: $($files.Count) package files, $([math]::Round($totalBytes / 1KB, 1)) KB." -ForegroundColor Green
