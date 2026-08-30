$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$env:UV_CACHE_DIR = Join-Path $projectRoot '.uv-cache'
$subsetScript = Join-Path $PSScriptRoot 'subset_display_fonts.py'

Push-Location $projectRoot
try {
  & uv run --locked python $subsetScript
  if ($LASTEXITCODE -ne 0) {
    throw "Font subset generation failed with exit code $LASTEXITCODE."
  }
  $fontDestinations = @(
    (Join-Path $projectRoot 'video/footsteps-return/assets/fonts'),
    (Join-Path $projectRoot 'video/footsteps-return/assets/game-source/assets/fonts')
  )
  foreach ($destination in $fontDestinations) {
    if (-not (Test-Path -LiteralPath $destination -PathType Container)) {
      throw "PV font destination is missing: $destination"
    }
    foreach ($weight in @(400, 600, 700)) {
      $fontName = "noto-serif-sc-$weight.woff2"
      Copy-Item -LiteralPath (Join-Path $projectRoot "app/assets/fonts/$fontName") -Destination (Join-Path $destination $fontName) -Force
    }
  }
} finally {
  Pop-Location
}
