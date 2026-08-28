param(
  [string]$TargetRoot,
  [string]$SourceRoot,
  [string]$OutputRoot,
  [string]$ProjectRoot,
  [string]$SharedAssetsRoot,
  [switch]$DryRun,
  [ValidateSet('None', 'AfterDelete', 'AfterFirstCopy', 'AfterManifest', 'CorruptBeforeVerify', 'RollbackFailure')]
  [string]$TestFailurePoint = 'None'
)

$ErrorActionPreference = 'Stop'

$defaultProjectRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = $defaultProjectRoot
}

. (Join-Path $PSScriptRoot 'wechat-common.ps1')

if ($TestFailurePoint -ne 'None' -and $env:TOPO_WECHAT_TEST_FAILURE_INJECTION -ne '1') {
  throw 'Test failure injection requires TOPO_WECHAT_TEST_FAILURE_INJECTION=1.'
}

$officialSamplePaths = @(
  'game.js',
  'game.json',
  'README.md',
  'audio/bgm.mp3',
  'audio/boom.mp3',
  'audio/bullet.mp3',
  'images/bg.jpg',
  'images/bullet.png',
  'images/Common.png',
  'images/enemy.png',
  'images/explosion1.png',
  'images/explosion2.png',
  'images/explosion3.png',
  'images/explosion4.png',
  'images/explosion5.png',
  'images/explosion6.png',
  'images/explosion7.png',
  'images/explosion8.png',
  'images/explosion9.png',
  'images/explosion10.png',
  'images/explosion11.png',
  'images/explosion12.png',
  'images/explosion13.png',
  'images/explosion14.png',
  'images/explosion15.png',
  'images/explosion16.png',
  'images/explosion17.png',
  'images/explosion18.png',
  'images/explosion19.png',
  'images/hero.png',
  'js/databus.js',
  'js/main.js',
  'js/render.js',
  'js/base/animation.js',
  'js/base/pool.js',
  'js/base/sprite.js',
  'js/libs/tinyemitter.js',
  'js/npc/enemy.js',
  'js/player/bullet.js',
  'js/player/index.js',
  'js/runtime/background.js',
  'js/runtime/gameinfo.js',
  'js/runtime/music.js'
)
$officialGameJsHash = '8ffe6c1081e02635a5cd4935b431d1c25bd31176d8ed332e63ff57860dc550b5'
$officialGameJsonHash = 'adfce90c444cdbf96dc51598471759bca31feb5e936833b36847f3570fd4bca0'
$officialProjectDescription = -join @(
  [char]0x9879, [char]0x76EE, [char]0x914D, [char]0x7F6E, [char]0x6587, [char]0x4EF6
)
$officialReadmeHeading = -join @([char]0x793A, [char]0x4F8B, [char]0x6E38, [char]0x620F)
$officialTutorialMarker = -join @([char]0x65B0, [char]0x624B, [char]0x6559, [char]0x7A0B)

function Get-TargetFilePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,

    [Parameter(Mandatory = $true)]
    [string]$RelativePath
  )

  if (-not (Test-WechatSafeRelativePath -Path $RelativePath)) {
    throw "Unsafe target relative path: $RelativePath"
  }
  $currentPath = $Root
  $rootItem = Get-Item -LiteralPath $currentPath -Force
  if (($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "A reparse point cannot be used as the WeChat sync target root: $Root"
  }
  foreach ($segment in $RelativePath.Split('/')) {
    $currentPath = Join-Path $currentPath $segment
    if (-not (Test-Path -LiteralPath $currentPath)) { break }
    $item = Get-Item -LiteralPath $currentPath -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "A managed WeChat target path crosses a reparse point: $RelativePath"
    }
  }
  $candidate = [System.IO.Path]::GetFullPath((Join-Path $Root $RelativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)))
  if (-not (Test-WechatPathInside -ChildPath $candidate -ParentPath $Root)) {
    throw "Target path escapes the official template root: $RelativePath"
  }
  return $candidate
}

function Restore-WechatSyncTransaction {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,

    [Parameter(Mandatory = $true)]
    [object[]]$Records,

    [Parameter(Mandatory = $true)]
    [object]$CreatedDirectories
  )

  foreach ($record in $Records) {
    $targetPath = Get-TargetFilePath -Root $Root -RelativePath ([string]$record.RelativePath)
    if ([bool]$record.Existed) {
      if (Test-Path -LiteralPath $targetPath) {
        if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
          throw "Rollback found a non-file at managed path: $($record.RelativePath)"
        }
        Remove-Item -LiteralPath $targetPath -Force
      }
      $targetDirectory = Split-Path -Parent $targetPath
      New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
      [System.IO.File]::Copy([string]$record.BackupPath, $targetPath, $false)
      if ((Get-WechatSha256 -Path $targetPath) -cne [string]$record.Sha256) {
        throw "Rollback hash verification failed: $($record.RelativePath)"
      }
    } elseif (Test-Path -LiteralPath $targetPath) {
      if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
        throw "Rollback found an unexpected non-file at new managed path: $($record.RelativePath)"
      }
      Remove-Item -LiteralPath $targetPath -Force
    }
  }

  $directories = @($CreatedDirectories | Sort-Object { $_.Length } -Descending)
  foreach ($directory in $directories) {
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) { continue }
    $item = Get-Item -LiteralPath $directory -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "Rollback refused to remove a reparse point directory: $directory"
    }
    $children = @(Get-ChildItem -LiteralPath $directory -Force)
    if ($children.Count -eq 0) {
      Remove-Item -LiteralPath $directory -Force
    }
  }
}

function Get-OfficialQuickstartTemplateMismatches {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Root,

    [Parameter(Mandatory = $true)]
    [object]$ProjectConfig
  )

  $mismatches = [System.Collections.Generic.List[string]]::new()
  if ([string]$ProjectConfig.description -cne $officialProjectDescription) {
    $mismatches.Add('project.config.json description')
  }
  if ([string]$ProjectConfig.projectname -cne 'quickstart') {
    $mismatches.Add('project.config.json projectname')
  }
  if ([string]$ProjectConfig.compileType -cne 'game') {
    $mismatches.Add('project.config.json compileType')
  }

  foreach ($relativePath in $officialSamplePaths) {
    $path = Get-TargetFilePath -Root $Root -RelativePath $relativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      $mismatches.Add("missing official sample file $relativePath")
    }
  }

  $gameJsPath = Get-TargetFilePath -Root $Root -RelativePath 'game.js'
  $gameJsonPath = Get-TargetFilePath -Root $Root -RelativePath 'game.json'
  if ((Test-Path -LiteralPath $gameJsPath -PathType Leaf) -and
      (Get-WechatSha256 -Path $gameJsPath) -cne $officialGameJsHash) {
    $mismatches.Add('official game.js hash')
  }
  if ((Test-Path -LiteralPath $gameJsonPath -PathType Leaf) -and
      (Get-WechatSha256 -Path $gameJsonPath) -cne $officialGameJsonHash) {
    $mismatches.Add('official game.json hash')
  }

  $readmePath = Get-TargetFilePath -Root $Root -RelativePath 'README.md'
  if (Test-Path -LiteralPath $readmePath -PathType Leaf) {
    $readme = Get-Content -LiteralPath $readmePath -Raw -Encoding UTF8
    $readmeLines = @($readme -split '\r?\n')
    if ($readmeLines -cnotcontains "# $officialReadmeHeading" -or
        -not $readme.Contains($officialTutorialMarker)) {
      $mismatches.Add('official README.md markers')
    }
  }
  return @($mismatches)
}

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

# A sync can never reuse stale output: every invocation starts with a complete build.
$buildScript = Join-Path $PSScriptRoot 'build-wechat.ps1'
& $buildScript `
  -SourceRoot $sourceRootPath `
  -OutputRoot $outputRootPath `
  -ProjectRoot $projectRootPath `
  -SharedAssetsRoot $sharedAssetsRootPath

if ([string]::IsNullOrWhiteSpace($TargetRoot)) {
  if ([string]::IsNullOrWhiteSpace($env:USERPROFILE)) {
    throw 'USERPROFILE is unavailable; pass -TargetRoot explicitly.'
  }
  $TargetRoot = Join-Path $env:USERPROFILE 'Documents\Codex\miniprograms\topology-gomoku'
}
$targetRootPath = Resolve-WechatPath -Path $TargetRoot -BasePath $projectRootPath -MustExist -PathType Container
if ($targetRootPath -ieq $projectRootPath -or
    $targetRootPath -ieq $sourceRootPath -or
    $targetRootPath -ieq $outputRootPath -or
    $targetRootPath -ieq $sharedAssetsRootPath -or
    (Test-WechatPathInside -ChildPath $targetRootPath -ParentPath $sourceRootPath) -or
    (Test-WechatPathInside -ChildPath $targetRootPath -ParentPath $outputRootPath) -or
    (Test-WechatPathInside -ChildPath $targetRootPath -ParentPath $sharedAssetsRootPath) -or
    (Test-WechatPathInside -ChildPath $sourceRootPath -ParentPath $targetRootPath) -or
    (Test-WechatPathInside -ChildPath $outputRootPath -ParentPath $targetRootPath) -or
    (Test-WechatPathInside -ChildPath $sharedAssetsRootPath -ParentPath $targetRootPath)) {
  throw "Unsafe WeChat sync target relationship: $targetRootPath"
}

$targetProjectConfigPath = Join-Path $targetRootPath 'project.config.json'
if (-not (Test-Path -LiteralPath $targetProjectConfigPath -PathType Leaf)) {
  throw "The sync target is missing project.config.json: $targetRootPath"
}
$targetProjectConfig = Read-WechatJson -Path $targetProjectConfigPath
if ([string]$targetProjectConfig.compileType -cne 'game') {
  throw "The sync target is not a WeChat game project (compileType must be 'game'): $targetRootPath"
}

$buildManifestPath = Join-Path $outputRootPath $script:WechatManifestName
$buildManifest = Get-WechatManifest -Path $buildManifestPath
$packageVersion = Get-WechatPackageVersion -ProjectRoot $projectRootPath
if ([string]$buildManifest.packageVersion -cne $packageVersion) {
  throw "Fresh build manifest version mismatch: expected $packageVersion, found $($buildManifest.packageVersion)"
}

$protectedPaths = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::OrdinalIgnoreCase
)
foreach ($path in $script:WechatProtectedPaths) {
  [void]$protectedPaths.Add($path)
}

$newEntries = @($buildManifest.files | Where-Object { -not $protectedPaths.Contains([string]$_.path) })
$newByPath = [System.Collections.Generic.Dictionary[string,object]]::new(
  [System.StringComparer]::OrdinalIgnoreCase
)
foreach ($entry in $newEntries) {
  $newByPath.Add([string]$entry.path, $entry)
}

$targetManifestPath = Join-Path $targetRootPath $script:WechatManifestName
$isFirstSync = -not (Test-Path -LiteralPath $targetManifestPath -PathType Leaf)
$oldEntries = @()
$oldByPath = [System.Collections.Generic.Dictionary[string,object]]::new(
  [System.StringComparer]::OrdinalIgnoreCase
)

if ($isFirstSync) {
  $templateMismatches = @(Get-OfficialQuickstartTemplateMismatches -Root $targetRootPath -ProjectConfig $targetProjectConfig)
  if ($templateMismatches.Count -gt 0) {
    throw "First sync is allowed only for the exactly recognized official WeChat example airplane-game template. Mismatches: $($templateMismatches -join '; ')"
  }
} else {
  $targetManifest = Get-WechatManifest -Path $targetManifestPath
  $oldEntries = @($targetManifest.files)
  foreach ($entry in $oldEntries) {
    $relativePath = [string]$entry.path
    if ($protectedPaths.Contains($relativePath)) {
      throw "The target manifest must not manage a protected file: $relativePath"
    }
    $oldByPath.Add($relativePath, $entry)
  }
}

$conflicts = [System.Collections.Generic.List[string]]::new()
foreach ($entry in $oldEntries) {
  $relativePath = [string]$entry.path
  $targetPath = Get-TargetFilePath -Root $targetRootPath -RelativePath $relativePath
  if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
    $conflicts.Add("managed file is missing: $relativePath")
    continue
  }
  $actualHash = Get-WechatSha256 -Path $targetPath
  if ($actualHash -cne [string]$entry.sha256) {
    $conflicts.Add("managed file was modified outside the sync workflow: $relativePath")
  }
}

$firstSyncPaths = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::OrdinalIgnoreCase
)
foreach ($path in $officialSamplePaths) {
  [void]$firstSyncPaths.Add($path)
}

foreach ($entry in $newEntries) {
  $relativePath = [string]$entry.path
  if ($oldByPath.ContainsKey($relativePath)) { continue }
  if ($isFirstSync -and $firstSyncPaths.Contains($relativePath)) { continue }
  $targetPath = Get-TargetFilePath -Root $targetRootPath -RelativePath $relativePath
  if (Test-Path -LiteralPath $targetPath) {
    $conflicts.Add("new managed path would overwrite an unmanaged target path: $relativePath")
  }
}

if ($conflicts.Count -gt 0) {
  Write-Host 'WeChat sync refused because the target contains conflicts:' -ForegroundColor Red
  foreach ($conflict in $conflicts) {
    Write-Host "- $conflict" -ForegroundColor Red
  }
  throw 'WeChat sync conflict detection failed.'
}

$deletePaths = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::OrdinalIgnoreCase
)
if ($isFirstSync) {
  foreach ($path in $officialSamplePaths) {
    [void]$deletePaths.Add($path)
  }
} else {
  foreach ($entry in $oldEntries) {
    $relativePath = [string]$entry.path
    if (-not $newByPath.ContainsKey($relativePath)) {
      [void]$deletePaths.Add($relativePath)
    }
  }
  foreach ($entry in $newEntries) {
    $relativePath = [string]$entry.path
    if ($oldByPath.ContainsKey($relativePath)) {
      $oldRelativePath = [string]$oldByPath[$relativePath].path
      if ($oldRelativePath -cne $relativePath) {
        [void]$deletePaths.Add($oldRelativePath)
      }
    }
  }
}
$sortedDeletePaths = @(Get-WechatSortedStrings -Values @($deletePaths))
$sortedCopyPaths = @(Get-WechatSortedStrings -Values @($newEntries | ForEach-Object { $_.path }))

Write-Host "Fresh WeChat build ready: $outputRootPath"
Write-Host "Sync target: $targetRootPath"
Write-Host "Planned managed copies: $($sortedCopyPaths.Count); planned stale/sample removals: $($sortedDeletePaths.Count)"
if ($DryRun) {
  foreach ($relativePath in $sortedDeletePaths) {
    Write-Host "REMOVE $relativePath"
  }
  foreach ($relativePath in $sortedCopyPaths) {
    Write-Host "COPY   $relativePath"
  }
  Write-Host 'Dry run complete; the target was not modified.' -ForegroundColor Yellow
  return
}

$projectConfigHashBefore = Get-WechatSha256 -Path $targetProjectConfigPath
$privateConfigPath = Join-Path $targetRootPath 'project.private.config.json'
$privateConfigExisted = Test-Path -LiteralPath $privateConfigPath -PathType Leaf
$privateConfigHashBefore = if ($privateConfigExisted) {
  Get-WechatSha256 -Path $privateConfigPath
} else {
  $null
}

$targetManifestFiles = @()
foreach ($relativePath in $sortedCopyPaths) {
  $entry = $newByPath[$relativePath]
  $targetManifestFiles += [ordered]@{
    path = [string]$entry.path
    sha256 = [string]$entry.sha256
  }
}
$targetManifest = [ordered]@{
  schemaVersion = $script:WechatManifestSchemaVersion
  packageVersion = $packageVersion
  files = $targetManifestFiles
}

$transactionPathSet = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::OrdinalIgnoreCase
)
foreach ($relativePath in $sortedDeletePaths) {
  [void]$transactionPathSet.Add($relativePath)
}
foreach ($relativePath in $sortedCopyPaths) {
  [void]$transactionPathSet.Add($relativePath)
}
[void]$transactionPathSet.Add($script:WechatManifestName)
$sortedTransactionPaths = @(Get-WechatSortedStrings -Values @($transactionPathSet))
foreach ($relativePath in $sortedTransactionPaths) {
  if ($protectedPaths.Contains($relativePath) -and
      $relativePath -ine $script:WechatManifestName) {
    throw "A sync transaction must not include protected configuration: $relativePath"
  }
}

$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
)
$backupRoot = Join-Path $temporaryRoot ("topology-gomoku-wechat-sync-" + [guid]::NewGuid().ToString('N'))
if (-not (Test-WechatPathInside -ChildPath $backupRoot -ParentPath $temporaryRoot) -or
    (Test-WechatPathInside -ChildPath $backupRoot -ParentPath $targetRootPath) -or
    (Test-WechatPathInside -ChildPath $targetRootPath -ParentPath $backupRoot)) {
  throw "Unsafe WeChat sync backup location: $backupRoot"
}
$backupFilesRoot = Join-Path $backupRoot 'files'
$transactionRecords = @()
$createdTargetDirectories = [System.Collections.Generic.HashSet[string]]::new(
  [System.StringComparer]::OrdinalIgnoreCase

)
$mutationStarted = $false
$preserveBackup = $false

try {
  New-Item -ItemType Directory -Path $backupFilesRoot -Force | Out-Null
  foreach ($relativePath in $sortedTransactionPaths) {
    $targetPath = Get-TargetFilePath -Root $targetRootPath -RelativePath $relativePath
    $backupPath = Join-Path $backupFilesRoot $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $existed = Test-Path -LiteralPath $targetPath
    $originalHash = $null
    if ($existed) {
      if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf)) {
        throw "A managed transaction path is not a file: $relativePath"
      }
      $backupDirectory = Split-Path -Parent $backupPath
      New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
      [System.IO.File]::Copy($targetPath, $backupPath, $false)
      $originalHash = Get-WechatSha256 -Path $targetPath
      if ((Get-WechatSha256 -Path $backupPath) -cne $originalHash) {
        throw "Temporary backup hash verification failed: $relativePath"
      }
    }
    $transactionRecords += [pscustomobject]@{
      RelativePath = $relativePath
      Existed = $existed
      BackupPath = $backupPath
      Sha256 = $originalHash
    }
  }

  $journalRecords = @($transactionRecords | ForEach-Object {
    [ordered]@{
      path = [string]$_.RelativePath
      existed = [bool]$_.Existed
      sha256 = if ($null -eq $_.Sha256) { $null } else { [string]$_.Sha256 }
    }
  })
  Write-WechatJson -Value ([ordered]@{ files = $journalRecords }) -Path (Join-Path $backupRoot 'transaction.json')
  $mutationStarted = $true

  foreach ($relativePath in $sortedDeletePaths) {
    $targetPath = Get-TargetFilePath -Root $targetRootPath -RelativePath $relativePath
    if (Test-Path -LiteralPath $targetPath -PathType Leaf) {
      Remove-Item -LiteralPath $targetPath -Force
    }
  }
  if ($TestFailurePoint -eq 'AfterDelete') {
    throw 'Injected WeChat sync failure after delete phase.'
  }

  $copyCount = 0
  foreach ($relativePath in $sortedCopyPaths) {
    $sourcePath = Join-Path $outputRootPath $relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
    $targetPath = Get-TargetFilePath -Root $targetRootPath -RelativePath $relativePath
    $targetDirectory = Split-Path -Parent $targetPath
    $currentDirectory = $targetDirectory
    while ($currentDirectory -ine $targetRootPath -and
           (Test-WechatPathInside -ChildPath $currentDirectory -ParentPath $targetRootPath)) {
      if (-not (Test-Path -LiteralPath $currentDirectory)) {
        [void]$createdTargetDirectories.Add($currentDirectory)
      }
      $currentDirectory = Split-Path -Parent $currentDirectory
    }
    New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
    [System.IO.File]::Copy($sourcePath, $targetPath, $true)
    $copyCount++
    if (($TestFailurePoint -eq 'AfterFirstCopy' -or $TestFailurePoint -eq 'RollbackFailure') -and
        $copyCount -eq 1) {
      throw 'Injected WeChat sync failure after first managed copy.'
    }
  }

  Write-WechatJson -Value $targetManifest -Path $targetManifestPath
  if ($TestFailurePoint -eq 'AfterManifest') {
    throw 'Injected WeChat sync failure after manifest write.'
  }

  if ($TestFailurePoint -eq 'CorruptBeforeVerify') {
    if ($sortedCopyPaths.Count -eq 0) {
      throw 'Cannot inject a post-verification failure without a managed copy.'
    }
    $corruptPath = Get-TargetFilePath -Root $targetRootPath -RelativePath $sortedCopyPaths[0]
    [System.IO.File]::WriteAllText(
      $corruptPath,
      'injected post-sync corruption',
      [System.Text.UTF8Encoding]::new($false)
    )
  }

  if ((Get-WechatSha256 -Path $targetProjectConfigPath) -cne $projectConfigHashBefore) {
    throw 'Sync changed protected project.config.json unexpectedly.'
  }
  if ($privateConfigExisted) {
    if (-not (Test-Path -LiteralPath $privateConfigPath -PathType Leaf) -or
        (Get-WechatSha256 -Path $privateConfigPath) -cne $privateConfigHashBefore) {
      throw 'Sync changed protected project.private.config.json unexpectedly.'
    }
  } elseif (Test-Path -LiteralPath $privateConfigPath) {
    throw 'Sync created project.private.config.json unexpectedly.'
  }

  foreach ($entry in $newEntries) {
    $targetPath = Get-TargetFilePath -Root $targetRootPath -RelativePath ([string]$entry.path)
    if (-not (Test-Path -LiteralPath $targetPath -PathType Leaf) -or
        (Get-WechatSha256 -Path $targetPath) -cne [string]$entry.sha256) {
      throw "Post-sync hash verification failed: $($entry.path)"
    }
  }
  foreach ($relativePath in $sortedDeletePaths) {
    if ($newByPath.ContainsKey($relativePath)) { continue }
    $targetPath = Get-TargetFilePath -Root $targetRootPath -RelativePath $relativePath
    if (Test-Path -LiteralPath $targetPath) {
      throw "Post-sync stale file removal failed: $relativePath"
    }
  }
} catch {
  $syncError = $_
  if ($mutationStarted) {
    try {
      if ($TestFailurePoint -eq 'RollbackFailure') {
        throw 'Injected WeChat rollback failure.'
      }
      Restore-WechatSyncTransaction `
        -Root $targetRootPath `
        -Records $transactionRecords `
        -CreatedDirectories $createdTargetDirectories
      Write-Host 'WeChat sync failed; the managed target snapshot was restored.' -ForegroundColor Yellow
    } catch {
      $rollbackError = $_
      $preserveBackup = $true
      throw "WeChat sync failed and rollback also failed. Backup preserved at '$backupRoot'. Sync error: $($syncError.Exception.Message) Rollback error: $($rollbackError.Exception.Message)"
    }
  }
  throw $syncError
} finally {
  if (-not $preserveBackup -and (Test-Path -LiteralPath $backupRoot -PathType Container)) {
    $resolvedBackupRoot = (Resolve-Path -LiteralPath $backupRoot).Path
    $backupLeaf = Split-Path -Leaf $resolvedBackupRoot
    if (-not (Test-WechatPathInside -ChildPath $resolvedBackupRoot -ParentPath $temporaryRoot) -or
        -not $backupLeaf.StartsWith('topology-gomoku-wechat-sync-', [System.StringComparison]::Ordinal)) {
      throw "Refusing to clean an unexpected WeChat sync backup path: $resolvedBackupRoot"
    }
    Remove-Item -LiteralPath $resolvedBackupRoot -Recurse -Force
  }
}

Write-Host "WeChat sync complete: $targetRootPath" -ForegroundColor Green
