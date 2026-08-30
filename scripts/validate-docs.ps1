param(
  [string]$ProjectRoot
)

$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $projectRoot = Split-Path -Parent $PSScriptRoot
} else {
  $projectRoot = [System.IO.Path]::GetFullPath($ProjectRoot)
}
$projectRootPrefix = $projectRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$errors = [System.Collections.Generic.List[string]]::new()
$excludedDirectories = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
@('.git', '.worktrees', 'node_modules', '.venv', '.uv-cache') | ForEach-Object {
  [void]$excludedDirectories.Add($_)
}
$pendingDirectories = [System.Collections.Generic.Stack[string]]::new()
$pendingDirectories.Push($projectRoot)
$markdownFileList = [System.Collections.Generic.List[System.IO.FileInfo]]::new()
while ($pendingDirectories.Count -gt 0) {
  $directory = $pendingDirectories.Pop()
  foreach ($file in Get-ChildItem -LiteralPath $directory -Force -File -Filter '*.md') {
    $markdownFileList.Add($file)
  }
  foreach ($child in Get-ChildItem -LiteralPath $directory -Force -Directory) {
    if (-not $excludedDirectories.Contains($child.Name)) {
      $pendingDirectories.Push($child.FullName)
    }
  }
}
$markdownFiles = @($markdownFileList | Sort-Object FullName)

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
