param(
  [string]$SourceRoot,
  [string]$OutputRoot,
  [string]$ProjectRoot,
  [string]$SharedAssetsRoot
)

$ErrorActionPreference = 'Stop'

$defaultProjectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = $defaultProjectRoot
}

. (Join-Path $PSScriptRoot 'wechat-common.ps1')

$projectRootPath = Resolve-WechatPath -Path $ProjectRoot -BasePath $defaultProjectRoot -MustExist -PathType Container
if ([string]::IsNullOrWhiteSpace($SourceRoot)) {
  $SourceRoot = Join-Path $projectRootPath 'wechat'
}
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $OutputRoot = Join-Path $projectRootPath 'dist\wechat'
}
if ([string]::IsNullOrWhiteSpace($SharedAssetsRoot)) {
  $SharedAssetsRoot = Join-Path $projectRootPath 'app\assets'
}

$sourceRootPath = Resolve-WechatPath -Path $SourceRoot -BasePath $projectRootPath -MustExist -PathType Container
$outputRootPath = Resolve-WechatPath -Path $OutputRoot -BasePath $projectRootPath
$sharedAssetsRootPath = Resolve-WechatPath -Path $SharedAssetsRoot -BasePath $projectRootPath -MustExist -PathType Container

$pathRoot = [System.IO.Path]::GetPathRoot($outputRootPath).TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
)
if ($outputRootPath.TrimEnd('\', '/') -ieq $pathRoot) {
  throw "Refusing to use a filesystem root as WeChat build output: $outputRootPath"
}
if ($outputRootPath -ieq $projectRootPath -or $outputRootPath -ieq $sourceRootPath) {
  throw "WeChat build output must not equal the project or source root: $outputRootPath"
}
if ((Test-WechatPathInside -ChildPath $outputRootPath -ParentPath $sourceRootPath) -or
    (Test-WechatPathInside -ChildPath $sourceRootPath -ParentPath $outputRootPath) -or
    (Test-WechatPathInside -ChildPath $projectRootPath -ParentPath $outputRootPath) -or
    $outputRootPath -ieq $sharedAssetsRootPath -or
    (Test-WechatPathInside -ChildPath $outputRootPath -ParentPath $sharedAssetsRootPath) -or
    (Test-WechatPathInside -ChildPath $sharedAssetsRootPath -ParentPath $outputRootPath)) {
  throw "Unsafe WeChat build output relationship: $outputRootPath"
}

$validateScript = Join-Path $PSScriptRoot 'validate-wechat.ps1'
& $validateScript -Root $sourceRootPath -ProjectRoot $projectRootPath

if (Test-Path -LiteralPath $outputRootPath) {
  if (-not (Test-Path -LiteralPath $outputRootPath -PathType Container)) {
    throw "WeChat build output exists but is not a directory: $outputRootPath"
  }
  $outputItem = Get-Item -LiteralPath $outputRootPath -Force
  if (($outputItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Refusing to replace a reparse point used as WeChat build output: $outputRootPath"
  }
  $existingManifestPath = Join-Path $outputRootPath $script:WechatManifestName
  if (-not (Test-Path -LiteralPath $existingManifestPath -PathType Leaf)) {
    throw "Refusing to replace an unrecognized WeChat build directory without a manifest: $outputRootPath"
  }
  $existingManifest = Get-WechatManifest -Path $existingManifestPath
  $expectedExistingPaths = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  foreach ($entry in @($existingManifest.files)) {
    $relativePath = [string]$entry.path
    [void]$expectedExistingPaths.Add($relativePath)
    $existingPath = Join-Path $outputRootPath $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    if (-not (Test-Path -LiteralPath $existingPath -PathType Leaf) -or
        (Get-WechatSha256 -Path $existingPath) -cne [string]$entry.sha256) {
      throw "Refusing to replace a modified WeChat build directory: $relativePath"
    }
  }
  foreach ($file in @(Get-WechatFiles -Root $outputRootPath -ExcludeRelativePaths @($script:WechatManifestName))) {
    if (-not $expectedExistingPaths.Contains([string]$file.RelativePath)) {
      throw "Refusing to replace a WeChat build directory containing an unmanaged file: $($file.RelativePath)"
    }
  }
  Remove-Item -LiteralPath $outputRootPath -Recurse -Force
}
New-Item -ItemType Directory -Path $outputRootPath -Force | Out-Null

$sourceFiles = @(Get-WechatFiles -Root $sourceRootPath -ExcludeRelativePaths @(
  'project.private.config.json',
  $script:WechatManifestName
))
$sourceByPath = @{}
foreach ($file in $sourceFiles) {
  $sourceByPath[$file.RelativePath] = $file
}
$sortedPaths = @(Get-WechatSortedStrings -Values @($sourceFiles | ForEach-Object { $_.RelativePath }))

foreach ($relativePath in $sortedPaths) {
  if (-not (Test-WechatSafeRelativePath -Path $relativePath)) {
    throw "Unsafe WeChat source path: $relativePath"
  }
  $destination = Join-Path $outputRootPath $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  $destinationDirectory = Split-Path -Parent $destination
  New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
  [System.IO.File]::Copy($sourceByPath[$relativePath].FullName, $destination, $false)
}

foreach ($copy in $script:WechatAuthoritativeCopies) {
  $sourceRelativePath = [string]$copy.Source
  $destinationRelativePath = [string]$copy.Destination
  if (-not (Test-WechatSafeRelativePath -Path $sourceRelativePath) -or
      -not (Test-WechatSafeRelativePath -Path $destinationRelativePath)) {
    throw "Unsafe authoritative WeChat copy mapping: $sourceRelativePath -> $destinationRelativePath"
  }
  $authoritativeSource = Resolve-WechatPath `
    -Path $sourceRelativePath `
    -BasePath $sharedAssetsRootPath `
    -MustExist `
    -PathType Leaf
  if (-not (Test-WechatPathInside -ChildPath $authoritativeSource -ParentPath $sharedAssetsRootPath)) {
    throw "Authoritative WeChat asset escapes app/assets: $sourceRelativePath"
  }
  $sourceItem = Get-Item -LiteralPath $authoritativeSource -Force
  if (($sourceItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Authoritative WeChat assets must not be reparse points: $sourceRelativePath"
  }
  $destination = Join-Path $outputRootPath $destinationRelativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  $destinationDirectory = Split-Path -Parent $destination
  New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
  if ([string]$copy.Kind -ceq 'derived-image') {
    Write-WechatDerivedPng -SourcePath $authoritativeSource -DestinationPath $destination -Size 256
  } else {
    [System.IO.File]::Copy($authoritativeSource, $destination, $true)
  }
}

$builtFiles = @(Get-WechatFiles -Root $outputRootPath -ExcludeRelativePaths @($script:WechatManifestName))
$sortedBuiltPaths = @(Get-WechatSortedStrings -Values @($builtFiles | ForEach-Object { $_.RelativePath }))
$manifestFiles = @()
foreach ($relativePath in $sortedBuiltPaths) {
  $builtPath = Join-Path $outputRootPath $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  $manifestFiles += [ordered]@{
    path = $relativePath
    sha256 = Get-WechatSha256 -Path $builtPath
  }
}
$manifest = [ordered]@{
  schemaVersion = $script:WechatManifestSchemaVersion
  packageVersion = Get-WechatPackageVersion -ProjectRoot $projectRootPath
  files = $manifestFiles
}
$manifestPath = Join-Path $outputRootPath $script:WechatManifestName
Write-WechatJson -Value $manifest -Path $manifestPath

& $validateScript `
  -Root $outputRootPath `
  -ProjectRoot $projectRootPath `
  -SharedAssetsRoot $sharedAssetsRootPath `
  -RequireManifest

Write-Host "WeChat build complete: $outputRootPath" -ForegroundColor Green
Write-Host "Manifest: $manifestPath"
