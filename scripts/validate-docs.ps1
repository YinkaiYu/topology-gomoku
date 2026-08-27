$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$projectRootPrefix = $projectRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$errors = [System.Collections.Generic.List[string]]::new()
$markdownFiles = @(
  Get-ChildItem -LiteralPath $projectRoot -Recurse -Force -File -Filter '*.md' |
    Where-Object {
      $relative = $_.FullName.Substring($projectRootPrefix.Length)
      $relative -notmatch '^(?:\.git|\.worktrees|node_modules|\.venv|\.uv-cache)(?:[\\/]|$)'
    }
)

foreach ($file in $markdownFiles) {
  $content = Get-Content -LiteralPath $file.FullName -Raw
  $relativeFile = $file.FullName.Substring($projectRootPrefix.Length)

  if ($content -match 'codex-clipboard|[A-Za-z]:\\Users\\[^\\]+\\') {
    $errors.Add("Machine-local path found in $relativeFile")
  }

  foreach ($match in [regex]::Matches($content, '\[[^\]]*\]\(([^)]+)\)')) {
    $target = $match.Groups[1].Value.Trim().Trim('<', '>')
    if ($target -match '^(?:https?://|mailto:|data:|#)') { continue }

    $pathOnly = ($target -split '#', 2)[0]
    if ([string]::IsNullOrWhiteSpace($pathOnly)) { continue }

    $decoded = [System.Uri]::UnescapeDataString($pathOnly)
    $resolved = Join-Path $file.DirectoryName $decoded
    if (-not (Test-Path -LiteralPath $resolved)) {
      $errors.Add("Broken Markdown link in ${relativeFile}: $target")
    }
  }
}

$docsRoot = Join-Path $projectRoot 'docs'
$docsIndex = Join-Path $docsRoot 'README.md'
if (-not (Test-Path -LiteralPath $docsIndex -PathType Leaf)) {
  $errors.Add('Missing docs/README.md documentation index.')
} else {
  $docsRootPrefix = $docsRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  $indexContent = Get-Content -LiteralPath $docsIndex -Raw
  foreach ($file in $markdownFiles) {
    if (-not $file.FullName.StartsWith($docsRootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) { continue }
    if ($file.FullName -eq $docsIndex) { continue }
    $relativeDoc = $file.FullName.Substring($docsRootPrefix.Length).Replace('\', '/')
    if (-not $indexContent.Contains("($relativeDoc)")) {
      $errors.Add("Documentation index is missing: docs/$relativeDoc")
    }
  }
}

if ($errors.Count -gt 0) {
  Write-Host 'Documentation validation failed:' -ForegroundColor Red
  foreach ($message in $errors) {
    Write-Host "- $message" -ForegroundColor Red
  }
  throw 'Documentation validation failed.'
}

Write-Host "Documentation validation passed: $($markdownFiles.Count) Markdown files." -ForegroundColor Green
