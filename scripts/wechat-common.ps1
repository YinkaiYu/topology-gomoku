$script:WechatManifestName = '.topology-gomoku-manifest.json'
$script:WechatManifestSchemaVersion = 1
$script:WechatProtectedPaths = @(
  'project.config.json',
  'project.private.config.json',
  $script:WechatManifestName
)
$script:WechatAuthoritativeCopies = @(
  [pscustomobject]@{ Source = 'topology.js'; Destination = 'js/shared/topology.js'; Kind = 'shared-js' },
  [pscustomobject]@{ Source = 'topology-morph.js'; Destination = 'js/shared/topology-morph.js'; Kind = 'shared-js' },
  [pscustomobject]@{ Source = 'game-replay.js'; Destination = 'js/shared/game-replay.js'; Kind = 'shared-js' },
  [pscustomobject]@{ Source = 'level-config.js'; Destination = 'js/shared/level-config.js'; Kind = 'shared-js' },
  [pscustomobject]@{ Source = 'game-controller.js'; Destination = 'js/shared/game-controller.js'; Kind = 'shared-js' },
  [pscustomobject]@{ Source = 'board-art.js'; Destination = 'js/shared/board-art.js'; Kind = 'shared-js' },
  [pscustomobject]@{ Source = 'brand-icon.png'; Destination = 'assets/brand-icon.png'; Kind = 'derived-image' },
  [pscustomobject]@{ Source = 'fonts/noto-serif-sc-400.woff2'; Destination = 'assets/fonts/noto-serif-sc-400.woff2'; Kind = 'asset' },
  [pscustomobject]@{ Source = 'fonts/noto-serif-sc-600.woff2'; Destination = 'assets/fonts/noto-serif-sc-600.woff2'; Kind = 'asset' },
  [pscustomobject]@{ Source = 'fonts/noto-serif-sc-700.woff2'; Destination = 'assets/fonts/noto-serif-sc-700.woff2'; Kind = 'asset' }
)

function Resolve-WechatPath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,

    [Parameter(Mandatory = $true)]
    [string]$BasePath,

    [switch]$MustExist,

    [ValidateSet('Any', 'Container', 'Leaf')]
    [string]$PathType = 'Any'
  )

  $candidate = if ([System.IO.Path]::IsPathRooted($Path)) {
    $Path
  } else {
    Join-Path $BasePath $Path
  }
  $fullPath = [System.IO.Path]::GetFullPath($candidate).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )

  if ($MustExist) {
    $testPathType = switch ($PathType) {
      'Container' { 'Container' }
      'Leaf' { 'Leaf' }
      default { 'Any' }
    }
    $exists = if ($testPathType -eq 'Any') {
      Test-Path -LiteralPath $fullPath
    } else {
      Test-Path -LiteralPath $fullPath -PathType $testPathType
    }
    if (-not $exists) {
      throw "Required $($PathType.ToLowerInvariant()) path does not exist: $fullPath"
    }
    $fullPath = (Resolve-Path -LiteralPath $fullPath).Path.TrimEnd(
      [System.IO.Path]::DirectorySeparatorChar,
      [System.IO.Path]::AltDirectorySeparatorChar
    )
  }

  return $fullPath
}

function Test-WechatPathInside {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ChildPath,

    [Parameter(Mandatory = $true)]
    [string]$ParentPath
  )

  $child = [System.IO.Path]::GetFullPath($ChildPath)
  $parent = [System.IO.Path]::GetFullPath($ParentPath).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $prefix = $parent + [System.IO.Path]::DirectorySeparatorChar
  return $child.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-WechatRelativePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,

    [Parameter(Mandatory = $true)]
    [string]$FullName
  )

  $rootPath = [System.IO.Path]::GetFullPath($Root).TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $prefix = $rootPath + [System.IO.Path]::DirectorySeparatorChar
  $filePath = [System.IO.Path]::GetFullPath($FullName)
  if (-not $filePath.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Path escapes root '$rootPath': $filePath"
  }
  return $filePath.Substring($prefix.Length).Replace('\', '/')
}

function Test-WechatSafeRelativePath {
  param(
    [AllowEmptyString()]
    [string]$Path
  )

  if ([string]::IsNullOrWhiteSpace($Path)) { return $false }
  if ([System.IO.Path]::IsPathRooted($Path)) { return $false }
  if ($Path.Contains('\')) { return $false }
  if ($Path.StartsWith('/') -or $Path.EndsWith('/')) { return $false }
  if ($Path.Contains('//')) { return $false }
  foreach ($segment in $Path.Split('/')) {
    if ($segment -eq '.' -or $segment -eq '..' -or [string]::IsNullOrWhiteSpace($segment)) {
      return $false
    }
  }
  return $true
}

function Get-WechatSha256 {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $stream = [System.IO.File]::OpenRead($Path)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hash = $sha256.ComputeHash($stream)
    return (-join ($hash | ForEach-Object { $_.ToString('x2') }))
  } finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}

function Write-WechatDerivedPng {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath,

    [Parameter(Mandatory = $true)]
    [string]$DestinationPath,

    [int]$Size = 256
  )

  Add-Type -AssemblyName System.Drawing
  $source = [System.Drawing.Image]::FromFile($SourcePath)
  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)
    $graphics.DrawImage($source, [System.Drawing.Rectangle]::new(0, 0, $Size, $Size))
    $bitmap.Save($DestinationPath, [System.Drawing.Imaging.ImageFormat]::Png)
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
    $source.Dispose()
  }
}

function Get-WechatPngDimensions {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $signature = [byte[]](137, 80, 78, 71, 13, 10, 26, 10)
  if ($bytes.Length -lt 24) {
    throw "PNG is truncated: $Path"
  }
  for ($index = 0; $index -lt $signature.Length; $index++) {
    if ($bytes[$index] -ne $signature[$index]) {
      throw "Invalid PNG signature: $Path"
    }
  }
  $width = [System.Net.IPAddress]::NetworkToHostOrder([System.BitConverter]::ToInt32($bytes, 16))
  $height = [System.Net.IPAddress]::NetworkToHostOrder([System.BitConverter]::ToInt32($bytes, 20))
  return [pscustomobject]@{ Width = $width; Height = $height }
}

function Get-WechatFiles {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,

    [string[]]$ExcludeRelativePaths = @()
  )

  $excluded = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  foreach ($path in $ExcludeRelativePaths) {
    [void]$excluded.Add($path)
  }

  $rootItem = Get-Item -LiteralPath $Root -Force
  if (($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "A reparse point cannot be used as the WeChat package root: $Root"
  }

  $reparsePoints = @(
    Get-ChildItem -LiteralPath $Root -Recurse -Force |
      Where-Object { ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0 }
  )
  if ($reparsePoints.Count -gt 0) {
    $relative = @($reparsePoints | ForEach-Object {
      Get-WechatRelativePath -Root $Root -FullName $_.FullName
    })
    throw "Reparse points are not allowed in the WeChat package: $($relative -join ', ')"
  }

  $items = @()
  foreach ($file in Get-ChildItem -LiteralPath $Root -Recurse -Force -File) {
    $relativePath = Get-WechatRelativePath -Root $Root -FullName $file.FullName
    if (-not $excluded.Contains($relativePath)) {
      $items += [pscustomobject]@{
        RelativePath = $relativePath
        FullName = $file.FullName
        Length = $file.Length
      }
    }
  }
  return @($items)
}

function Read-WechatJson {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  try {
    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 | ConvertFrom-Json
  } catch {
    throw "Invalid JSON file '$Path': $($_.Exception.Message)"
  }
}

function Write-WechatJson {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Value,

    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $json = $Value | ConvertTo-Json -Depth 12
  $json = $json.Replace("`r`n", "`n") + "`n"
  [System.IO.File]::WriteAllText(
    $Path,
    $json,
    [System.Text.UTF8Encoding]::new($false)
  )
}

function Get-WechatPackageVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ProjectRoot
  )

  $packagePath = Join-Path $ProjectRoot 'package.json'
  $package = Read-WechatJson -Path $packagePath
  if ([string]::IsNullOrWhiteSpace([string]$package.version)) {
    throw "package.json does not contain a version: $packagePath"
  }
  return [string]$package.version
}

function Get-WechatSortedStrings {
  param(
    [object[]]$Values
  )

  $strings = [string[]]@($Values | ForEach-Object { [string]$_ })
  [System.Array]::Sort($strings, [System.StringComparer]::Ordinal)
  return @($strings)
}

function Get-WechatManifest {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $manifest = Read-WechatJson -Path $Path
  if ([int]$manifest.schemaVersion -ne $script:WechatManifestSchemaVersion) {
    throw "Unsupported WeChat manifest schema in '$Path': $($manifest.schemaVersion)"
  }
  if ([string]::IsNullOrWhiteSpace([string]$manifest.packageVersion)) {
    throw "WeChat manifest is missing packageVersion: $Path"
  }
  if ($null -eq $manifest.files) {
    throw "WeChat manifest is missing files: $Path"
  }

  $seen = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase
  )
  foreach ($entry in @($manifest.files)) {
    $relativePath = [string]$entry.path
    $hash = [string]$entry.sha256
    if (-not (Test-WechatSafeRelativePath -Path $relativePath)) {
      throw "Unsafe path in WeChat manifest '$Path': $relativePath"
    }
    if (-not $seen.Add($relativePath)) {
      throw "Duplicate or case-colliding path in WeChat manifest '$Path': $relativePath"
    }
    if ($hash -notmatch '^[0-9a-f]{64}$') {
      throw "Invalid SHA256 in WeChat manifest '$Path': $relativePath"
    }
  }
  return $manifest
}
