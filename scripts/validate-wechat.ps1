param(
  [string]$Root,
  [string]$ProjectRoot,
  [string]$SharedAssetsRoot,
  [switch]$RequireManifest
)

$ErrorActionPreference = 'Stop'

$defaultProjectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = $defaultProjectRoot
}

. (Join-Path $PSScriptRoot 'wechat-common.ps1')

$projectRootPath = Resolve-WechatPath -Path $ProjectRoot -BasePath $defaultProjectRoot -MustExist -PathType Container
if ([string]::IsNullOrWhiteSpace($Root)) {
  $Root = Join-Path $projectRootPath 'wechat'
}
$rootPath = Resolve-WechatPath -Path $Root -BasePath $projectRootPath -MustExist -PathType Container
$packageVersion = Get-WechatPackageVersion -ProjectRoot $projectRootPath
$errors = [System.Collections.Generic.List[string]]::new()

function Get-WechatJavaScriptSyntaxError {
  param(
    [Parameter(Mandatory = $true)]
    [string]$NodePath,

    [Parameter(Mandatory = $true)]
    [string]$Content
  )

  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $NodePath
  $startInfo.Arguments = '--input-type=module --check'
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  try {
    [void]$process.Start()
    $process.StandardInput.Write($Content)
    $process.StandardInput.Close()
    $stdout = $process.StandardOutput.ReadToEnd()
    $stderr = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -eq 0) {
      return $null
    }
    return (($stdout + "`n" + $stderr).Trim() -replace '\s+', ' ')
  } finally {
    $process.Dispose()
  }
}

try {
  $files = @(Get-WechatFiles -Root $rootPath)
} catch {
  $errors.Add($_.Exception.Message)
  $files = @()
}

$pathSet = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::OrdinalIgnoreCase
)
$relativePaths = @()
foreach ($file in $files) {
  $relativePath = [string]$file.RelativePath
  $relativePaths += $relativePath
  if (-not (Test-WechatSafeRelativePath -Path $relativePath)) {
    $errors.Add("Unsafe package path: $relativePath")
  }
  if (-not $pathSet.Add($relativePath)) {
    $errors.Add("Duplicate or case-colliding package path: $relativePath")
  }
}

foreach ($requiredPath in @('game.js', 'game.json', 'project.config.json')) {
  if ($relativePaths -cnotcontains $requiredPath) {
    $errors.Add("Missing required WeChat game entry with exact casing: $requiredPath")
  }
}

if ($RequireManifest -and $relativePaths -contains 'project.private.config.json') {
  $errors.Add('project.private.config.json is private and must not be part of the WeChat build.')
}

foreach ($file in @($files | Where-Object { $_.RelativePath.EndsWith('.json', [System.StringComparison]::OrdinalIgnoreCase) })) {
  try {
    [void](Read-WechatJson -Path $file.FullName)
  } catch {
    $errors.Add($_.Exception.Message)
  }
}

$projectConfigPath = Join-Path $rootPath 'project.config.json'
if (Test-Path -LiteralPath $projectConfigPath -PathType Leaf) {
  try {
    $projectConfig = Read-WechatJson -Path $projectConfigPath
    if ([string]$projectConfig.compileType -cne 'game') {
      $errors.Add('project.config.json must declare compileType="game".')
    }
  } catch {
    $errors.Add($_.Exception.Message)
  }
}

$networkPatterns = [ordered]@{
  'external URL' = 'https?://|wss?://'
  'wx.request' = '\bwx\.request\s*\('
  'wx.downloadFile' = '\bwx\.downloadFile\s*\('
  'wx.uploadFile' = '\bwx\.uploadFile\s*\('
  'wx socket API' = '\bwx\.(?:connectSocket|sendSocketMessage|onSocketOpen|onSocketMessage)\s*\('
  'wx cloud API' = '\bwx\.cloud\b'
  'browser fetch' = '\bfetch\s*\('
  'browser XMLHttpRequest' = '\bXMLHttpRequest\b'
  'browser WebSocket' = '\b(?:new\s+)?WebSocket\s*\('
  'browser EventSource' = '\b(?:new\s+)?EventSource\s*\('
}

$textExtensions = @('.js', '.json', '.wxs')
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($null -eq $nodeCommand) {
  $errors.Add('Node.js is required to parse WeChat JavaScript sources.')
}
foreach ($file in @($files | Where-Object {
  $textExtensions -contains [System.IO.Path]::GetExtension($_.RelativePath).ToLowerInvariant()
})) {
  if ($file.RelativePath -eq $script:WechatManifestName -or
      $file.RelativePath -eq 'project.private.config.json') { continue }
  $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
  foreach ($pattern in $networkPatterns.GetEnumerator()) {
    if ($content -match $pattern.Value) {
      $errors.Add("Forbidden network capability '$($pattern.Key)' detected in $($file.RelativePath)")
    }
  }
  if ($null -ne $nodeCommand -and
      $file.RelativePath.EndsWith('.js', [System.StringComparison]::OrdinalIgnoreCase)) {
    $syntaxError = Get-WechatJavaScriptSyntaxError -NodePath $nodeCommand.Source -Content $content
    if (-not [string]::IsNullOrWhiteSpace($syntaxError)) {
      $errors.Add("Invalid JavaScript syntax in $($file.RelativePath): $syntaxError")
    }
  }
}

$manifestPath = Join-Path $rootPath $script:WechatManifestName
$hasManifest = Test-Path -LiteralPath $manifestPath -PathType Leaf
if ($RequireManifest -and -not $hasManifest) {
  $errors.Add("Missing required build manifest: $script:WechatManifestName")
}

if ($RequireManifest) {
  if ([string]::IsNullOrWhiteSpace($SharedAssetsRoot)) {
    $SharedAssetsRoot = Join-Path $projectRootPath 'app\assets'
  }
  try {
    $sharedAssetsRootPath = Resolve-WechatPath `
      -Path $SharedAssetsRoot `
      -BasePath $projectRootPath `
      -MustExist `
      -PathType Container
    foreach ($copy in $script:WechatAuthoritativeCopies) {
      $sourceRelativePath = [string]$copy.Source
      $destinationRelativePath = [string]$copy.Destination
      $authoritativeSource = Resolve-WechatPath `
        -Path $sourceRelativePath `
        -BasePath $sharedAssetsRootPath `
        -MustExist `
        -PathType Leaf
      if (-not (Test-WechatPathInside -ChildPath $authoritativeSource -ParentPath $sharedAssetsRootPath)) {
        throw "Authoritative WeChat asset escapes app/assets: $sourceRelativePath"
      }
      if ($relativePaths -cnotcontains $destinationRelativePath) {
        $errors.Add("Build is missing authoritative $($copy.Kind): $destinationRelativePath")
        continue
      }
      $builtPath = Join-Path $rootPath $destinationRelativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
      if ([string]$copy.Kind -ceq 'derived-image') {
        try {
          $dimensions = Get-WechatPngDimensions -Path $builtPath
          if ($dimensions.Width -ne 256 -or $dimensions.Height -ne 256) {
            $errors.Add("Derived WeChat image must be 256x256: $destinationRelativePath")
          }
        } catch {
          $errors.Add($_.Exception.Message)
        }
      } elseif ((Get-WechatSha256 -Path $builtPath) -cne (Get-WechatSha256 -Path $authoritativeSource)) {
        $errors.Add("Authoritative source hash mismatch: $sourceRelativePath -> $destinationRelativePath")
      }
    }
  } catch {
    $errors.Add($_.Exception.Message)
  }

  $modulePatterns = @(
    '(?m)\b(?:import\s+(?:[^''"]+\s+from\s+)?|export\s+[^''"]+\s+from\s+)[''"](\.[^''"]+)[''"]',
    '\brequire\s*\(\s*[''"](\.[^''"]+)[''"]\s*\)'
  )
  foreach ($file in @($files | Where-Object {
    $_.RelativePath.EndsWith('.js', [System.StringComparison]::OrdinalIgnoreCase)
  })) {
    $content = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
    foreach ($pattern in $modulePatterns) {
      foreach ($match in [regex]::Matches($content, $pattern)) {
        $moduleReference = ($match.Groups[1].Value -split '[?#]', 2)[0]
        $fileDirectory = Split-Path -Parent $file.FullName
        $moduleBasePath = [System.IO.Path]::GetFullPath((Join-Path $fileDirectory $moduleReference))
        if (-not (Test-WechatPathInside -ChildPath $moduleBasePath -ParentPath $rootPath)) {
          $errors.Add("Local module reference escapes the WeChat package: $($file.RelativePath) -> $moduleReference")
          continue
        }
        $moduleBaseRelativePath = Get-WechatRelativePath -Root $rootPath -FullName $moduleBasePath
        $moduleCandidates = @(
          $moduleBaseRelativePath,
          "$moduleBaseRelativePath.js",
          "$moduleBaseRelativePath.json",
          "$moduleBaseRelativePath/index.js",
          "$moduleBaseRelativePath/index.json"
        )
        $resolved = $false
        foreach ($candidate in $moduleCandidates) {
          if ($relativePaths -ccontains $candidate) {
            $resolved = $true
            break
          }
        }
        if (-not $resolved) {
          $errors.Add("Missing local module with exact casing: $($file.RelativePath) -> $moduleReference")
        }
      }
    }
  }
}

if ($hasManifest) {
  try {
    $manifest = Get-WechatManifest -Path $manifestPath
    if ([string]$manifest.packageVersion -cne $packageVersion) {
      $errors.Add("Manifest packageVersion must match package.json: expected $packageVersion, found $($manifest.packageVersion)")
    }

    $manifestPaths = @($manifest.files | ForEach-Object { [string]$_.path })
    $sortedManifestPaths = @(Get-WechatSortedStrings -Values $manifestPaths)
    if ($manifestPaths.Count -ne $sortedManifestPaths.Count) {
      $errors.Add('Manifest file list could not be sorted deterministically.')
    } else {
      for ($index = 0; $index -lt $manifestPaths.Count; $index++) {
        if ($manifestPaths[$index] -cne $sortedManifestPaths[$index]) {
          $errors.Add('Manifest files must be sorted by ordinal relative path.')
          break
        }
      }
    }

    $actualFiles = @($files | Where-Object { $_.RelativePath -cne $script:WechatManifestName })
    $actualPaths = @($actualFiles | ForEach-Object { [string]$_.RelativePath })
    if ($manifestPaths.Count -ne $actualPaths.Count) {
      $errors.Add("Manifest file count mismatch: expected $($actualPaths.Count), found $($manifestPaths.Count)")
    }

    $manifestByPath = @{}
    foreach ($entry in @($manifest.files)) {
      $manifestByPath[[string]$entry.path] = $entry
    }
    foreach ($file in $actualFiles) {
      if (-not $manifestByPath.ContainsKey($file.RelativePath)) {
        $errors.Add("Build file is not declared in the manifest: $($file.RelativePath)")
        continue
      }
      $actualHash = Get-WechatSha256 -Path $file.FullName
      if ($actualHash -cne [string]$manifestByPath[$file.RelativePath].sha256) {
        $errors.Add("Manifest hash mismatch: $($file.RelativePath)")
      }
    }
    foreach ($manifestRelativePath in $manifestPaths) {
      if ($actualPaths -cnotcontains $manifestRelativePath) {
        $errors.Add("Manifest references a missing or case-mismatched file: $manifestRelativePath")
      }
    }
  } catch {
    $errors.Add($_.Exception.Message)
  }
}

if ($errors.Count -gt 0) {
  Write-Host 'WeChat game validation failed:' -ForegroundColor Red
  foreach ($message in $errors) {
    Write-Host "- $message" -ForegroundColor Red
  }
  throw 'WeChat game validation failed.'
}

$totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
Write-Host "WeChat validation passed: $($files.Count) files, $([math]::Round($totalBytes / 1KB, 1)) KB." -ForegroundColor Green
