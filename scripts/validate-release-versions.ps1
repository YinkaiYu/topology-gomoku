param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Version
)

$ErrorActionPreference = 'Stop'
$releaseRefs = @('main', 'xiaohongshu', 'bilibili', 'wechat')
$errors = [System.Collections.Generic.List[string]]::new()

if ($Version -notmatch '^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$') {
  throw "Invalid SemVer: $Version"
}

foreach ($ref in $releaseRefs) {
  $packageText = (& git show "${ref}:package.json" 2>$null) -join "`n"
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($packageText)) {
    $errors.Add("Cannot read package.json from ref '$ref'.")
    continue
  }

  try {
    $package = $packageText | ConvertFrom-Json
  } catch {
    $errors.Add("Invalid package.json on ref '$ref'.")
    continue
  }

  if ($package.version -ne $Version) {
    $errors.Add("Version mismatch on '$ref': expected $Version, found $($package.version).")
  }
}

if ($errors.Count -gt 0) {
  Write-Host 'Release version validation failed:' -ForegroundColor Red
  foreach ($message in $errors) {
    Write-Host "- $message" -ForegroundColor Red
  }
  throw 'Release version validation failed.'
}

Write-Host "Release versions match across main and all platform branches: $Version." -ForegroundColor Green
