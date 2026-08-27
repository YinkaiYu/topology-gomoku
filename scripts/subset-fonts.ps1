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
} finally {
  Pop-Location
}
