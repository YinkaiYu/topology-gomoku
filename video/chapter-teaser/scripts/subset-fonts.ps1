$ErrorActionPreference = 'Stop'

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
$env:UV_CACHE_DIR = Join-Path $projectRoot '.uv-cache'
$subsetScript = Join-Path $projectRoot 'scripts\subset_pv_fonts.py'

Push-Location $projectRoot
try {
  & uv run --locked python $subsetScript
  if ($LASTEXITCODE -ne 0) {
    throw "PV font subset generation failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}
