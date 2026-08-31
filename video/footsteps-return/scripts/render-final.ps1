param()

$ErrorActionPreference = "Stop"
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$pvRoot = Split-Path -Parent $scriptDirectory
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $pvRoot "..\.."))
$renderDirectory = Join-Path $pvRoot "renders"
$intermediatePath = Join-Path $renderDirectory "footsteps-return-4k.hyperframes.mp4"
$outputPath = Join-Path $renderDirectory "footsteps-return-4k.mp4"
$muxedOutputPath = Join-Path $renderDirectory "footsteps-return-4k.muxing.mp4"
$outputManifestPath = Join-Path $renderDirectory "footsteps-return-4k.manifest.json"
$outputManifestTempPath = Join-Path $renderDirectory "footsteps-return-4k.manifest.muxing.json"
$evidencePath = Join-Path $repositoryRoot "artifacts\pv-footsteps-return-task11-evidence.json"
$evidenceGeneratorPath = Join-Path $scriptDirectory "render-contact-sheet.mjs"
$mixPath = Join-Path $pvRoot "audio\mix.json"
$mix = Get-Content -Raw -Encoding UTF8 -LiteralPath $mixPath | ConvertFrom-Json
$audioLicensePath = Join-Path $pvRoot "assets\audio-licenses.json"
$acceptedTitle = [string]((Get-Content -Raw -Encoding UTF8 -LiteralPath $audioLicensePath | ConvertFrom-Json).project)
if ([string]::IsNullOrWhiteSpace($acceptedTitle)) {
    throw "The accepted title is missing from assets/audio-licenses.json."
}
$logicalDurationSeconds = [double]$mix.composition.durationSeconds
$fps = 60
$totalFrames = [int][Math]::Ceiling($logicalDurationSeconds * $fps)
$pictureDurationSeconds = $totalFrames / $fps
$culture = [System.Globalization.CultureInfo]::InvariantCulture
$pictureDurationText = $pictureDurationSeconds.ToString("0.############", $culture)

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$LiteralPath)
    $stream = [System.IO.File]::OpenRead($LiteralPath)
    $hasher = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($hasher.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
    } finally {
        $hasher.Dispose()
        $stream.Dispose()
    }
}

function Resolve-RepositoryPath {
    param([Parameter(Mandatory = $true)][string]$ProjectRelativePath)
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot ($ProjectRelativePath.Replace("/", "\"))))
    $rootPrefix = $repositoryRoot.TrimEnd("\") + "\"
    if (-not $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Render input escapes the repository: $ProjectRelativePath"
    }
    return $candidate
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$Description
    )
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed with exit code $LASTEXITCODE."
    }
}

function Invoke-Captured {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$Description
    )
    $previousPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = "Continue"
        $captured = (& $Executable @Arguments 2>&1 | Out-String)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($exitCode -ne 0) {
        throw "$Description failed with exit code $exitCode.`n$captured"
    }
    return $captured
}

function Publish-AtomicFile {
    param(
        [Parameter(Mandatory = $true)][string]$TempPath,
        [Parameter(Mandatory = $true)][string]$DestinationPath
    )
    if (Test-Path -LiteralPath $DestinationPath -PathType Leaf) {
        # Windows PowerShell 5.1 does not expose File.Move(source, destination,
        # overwrite). File.Replace is an atomic same-volume replacement.
        [System.IO.File]::Replace($TempPath, $DestinationPath, $null)
    } else {
        [System.IO.File]::Move($TempPath, $DestinationPath)
    }
}

function Get-CurrentVisualContract {
    $contractJson = Invoke-Captured -Executable "node" -Arguments @(
        $evidenceGeneratorPath, "--contract-json"
    ) -Description "Task 11 visual source authentication"
    return $contractJson | ConvertFrom-Json
}

function Get-CurrentEvidenceToolContract {
    $contractJson = Invoke-Captured -Executable "node" -Arguments @(
        $evidenceGeneratorPath, "--evidence-contract-json"
    ) -Description "Task 11 evidence-tool authentication"
    return $contractJson | ConvertFrom-Json
}

$sourceAudioPath = Resolve-RepositoryPath -ProjectRelativePath ([string]$mix.composition.outputFile)
function Assert-AuthenticatedMaster {
    $currentMix = Get-Content -Raw -Encoding UTF8 -LiteralPath $mixPath | ConvertFrom-Json
    foreach ($field in @("sha256", "bytes", "renderContractSha256")) {
        if ([string]$currentMix.output.$field -ne [string]$mix.output.$field) {
            throw "Task 10 mix manifest changed during final rendering at output.$field."
        }
    }
    if ([string]$currentMix.composition.outputFile -ne [string]$mix.composition.outputFile) {
        throw "Task 10 mix output path changed during final rendering."
    }
    if (-not (Test-Path -LiteralPath $sourceAudioPath -PathType Leaf)) {
        throw "Authenticated Task 10 master is missing: $sourceAudioPath"
    }
    $bytes = (Get-Item -LiteralPath $sourceAudioPath).Length
    if ($bytes -ne [long]$currentMix.output.bytes) {
        throw "Task 10 master byte length is $bytes, expected $($currentMix.output.bytes)."
    }
    $sha256 = Get-Sha256 -LiteralPath $sourceAudioPath
    if ($sha256 -ne [string]$currentMix.output.sha256) {
        throw "Task 10 master SHA-256 is $sha256, expected $($currentMix.output.sha256)."
    }
    return [pscustomobject]@{ Sha256 = $sha256; Bytes = $bytes }
}

$initialAuthentication = Assert-AuthenticatedMaster
$sourceBytes = $initialAuthentication.Bytes
$sourceSha256 = $initialAuthentication.Sha256
if (-not (Test-Path -LiteralPath $evidencePath -PathType Leaf)) {
    throw "Task 11 visual evidence is missing: $evidencePath"
}
$initialVisualEvidence = Get-Content -Raw -Encoding UTF8 -LiteralPath $evidencePath | ConvertFrom-Json
foreach ($field in @("sha256", "bytes", "renderContractSha256")) {
    if ([string]$initialVisualEvidence.sourceAudio.$field -ne [string]$mix.output.$field) {
        throw "Task 11 visual evidence is stale at sourceAudio.$field. Regenerate evidence before rendering."
    }
}
$initialVisualContract = Get-CurrentVisualContract
foreach ($field in @("sha256", "fileCount")) {
    if ([string]$initialVisualEvidence.visualContract.$field -ne [string]$initialVisualContract.$field) {
        throw "Task 11 visual evidence is stale at visualContract.$field. Regenerate evidence before rendering."
    }
}
$initialEvidenceToolContract = Get-CurrentEvidenceToolContract
foreach ($field in @("sha256", "fileCount")) {
    if ([string]$initialVisualEvidence.evidenceToolContract.$field -ne [string]$initialEvidenceToolContract.$field) {
        throw "Task 11 visual evidence is stale at evidenceToolContract.$field. Regenerate evidence before rendering."
    }
}
if ($totalFrames -ne 12843 -or [Math]::Abs($pictureDurationSeconds - 214.05) -gt 0.0000001) {
    throw "Unexpected Task 11 frame envelope: $totalFrames frames / $pictureDurationText seconds."
}

$toolJson = & node (Join-Path $scriptDirectory "doctor.mjs") --score-tools-json
if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg must be resolved by the PV doctor before final rendering."
}
$tools = $toolJson | ConvertFrom-Json
$ffmpeg = [System.IO.Path]::GetFullPath([string]$tools.ffmpeg)
$ffprobe = Join-Path (Split-Path -Parent $ffmpeg) "ffprobe.exe"
$hyperframes = Join-Path $repositoryRoot "node_modules\.bin\hyperframes.cmd"
foreach ($tool in @($ffmpeg, $ffprobe, $hyperframes)) {
    if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
        throw "Required Task 11 renderer tool is missing: $tool"
    }
}

New-Item -ItemType Directory -Force -Path $renderDirectory | Out-Null
# A delivery without its matching manifest is deliberately not current. Remove
# the previous manifest before capture and only republish it after the muxed MP4
# has passed the strict probe and both identities have been bound together.
if (Test-Path -LiteralPath $outputManifestPath -PathType Leaf) {
    Remove-Item -LiteralPath $outputManifestPath -Force
}
foreach ($temporaryPath in @($muxedOutputPath, $outputManifestTempPath)) {
    if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
        Remove-Item -LiteralPath $temporaryPath -Force
    }
}
Push-Location $repositoryRoot
try {
    # Nested Canvas/WebGL content is substantially faster and remains visually
    # faithful through Chrome captureScreenshot on this Windows 4K workload.
    $env:PRODUCER_FORCE_SCREENSHOT = "true"
    $renderArguments = @(
        "render", "./video/footsteps-return",
        "--fps", "60",
        "--quality", "high",
        "--resolution", "landscape-4k",
        "--workers", "2",
        "--experimental-fast-capture=false",
        "--gpu",
        "--browser-gpu",
        "--no-best-effort",
        "--strict",
        "--output", $intermediatePath
    )
    Invoke-Checked -Executable $hyperframes -Arguments $renderArguments -Description "Strict native-4K HyperFrames render"

    # Authenticate again after the long picture render. A mix or WAV changed during
    # capture must never be silently muxed under the preflight identity.
    $finalAuthentication = Assert-AuthenticatedMaster
    $sourceBytes = $finalAuthentication.Bytes
    $sourceSha256 = $finalAuthentication.Sha256
    $finalVisualContract = Get-CurrentVisualContract
    foreach ($field in @("sha256", "fileCount")) {
        if ([string]$finalVisualContract.$field -ne [string]$initialVisualContract.$field) {
            throw "Task 11 visual sources changed during final rendering at visualContract.$field."
        }
    }
    $finalEvidenceToolContract = Get-CurrentEvidenceToolContract
    foreach ($field in @("sha256", "fileCount")) {
        if ([string]$finalEvidenceToolContract.$field -ne [string]$initialEvidenceToolContract.$field) {
            throw "Task 11 evidence tooling changed during final rendering at evidenceToolContract.$field."
        }
    }
    $visualEvidence = Get-Content -Raw -Encoding UTF8 -LiteralPath $evidencePath | ConvertFrom-Json
    foreach ($field in @("sha256", "bytes", "renderContractSha256")) {
        if ([string]$visualEvidence.sourceAudio.$field -ne [string]$mix.output.$field) {
            throw "Task 11 visual evidence does not bind the authenticated master at sourceAudio.$field."
        }
    }
    if (-not $visualEvidence.visualContract.sha256 -or [int]$visualEvidence.visualContract.fileCount -le 0) {
        throw "Task 11 visual evidence has no source visual contract."
    }
    foreach ($field in @("sha256", "fileCount")) {
        if ([string]$visualEvidence.visualContract.$field -ne [string]$finalVisualContract.$field) {
            throw "Task 11 visual evidence changed or became stale during rendering at visualContract.$field."
        }
        if ([string]$visualEvidence.evidenceToolContract.$field -ne [string]$finalEvidenceToolContract.$field) {
            throw "Task 11 visual evidence changed or became stale during rendering at evidenceToolContract.$field."
        }
    }

    # FFmpeg's AAC encoder can overshoot the authenticated PCM master's true peak.
    # A measured -0.35 dB delivery trim keeps AAC near -14 LUFS and <= -1 dBTP.
    $muxArguments = @(
        "-hide_banner", "-y", "-nostdin",
        "-i", $intermediatePath,
        "-i", $sourceAudioPath,
        "-map", "0:v:0", "-map", "1:a:0",
        "-c:v", "copy",
        "-af", "volume=-0.35dB,apad,atrim=duration=214.05",
        "-ar", "48000", "-ac", "2",
        "-c:a", "aac", "-b:a", "192k",
        "-t", $pictureDurationText,
        "-metadata", "title=$acceptedTitle",
        "-movflags", "+faststart",
        $muxedOutputPath
    )
    Invoke-Checked -Executable $ffmpeg -Arguments $muxArguments -Description "Authenticated final-audio mux"

    $probeJson = Invoke-Captured -Executable $ffprobe -Arguments @(
        "-v", "error", "-count_frames",
        "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,sample_rate,channels,duration:format=duration",
        "-of", "json", $muxedOutputPath
    ) -Description "Final output probe"
    $probe = $probeJson | ConvertFrom-Json
    $video = @($probe.streams | Where-Object codec_type -eq "video")
    $audio = @($probe.streams | Where-Object codec_type -eq "audio")
    if ($probe.streams.Count -ne 2 -or $video.Count -ne 1 -or $audio.Count -ne 1) {
        throw "Final output must contain exactly one video and one audio stream."
    }
    if ($video[0].codec_name -ne "h264" -or $video[0].width -ne 3840 -or $video[0].height -ne 2160 -or $video[0].r_frame_rate -ne "60/1" -or $video[0].avg_frame_rate -ne "60/1") {
        throw "Final video stream is not native opaque H.264 3840x2160 CFR60."
    }
    if ([int]$video[0].nb_frames -ne $totalFrames -or [int]$video[0].nb_read_frames -ne $totalFrames) {
        throw "Final video frame count is not $totalFrames."
    }
    if ($audio[0].codec_name -ne "aac" -or [int]$audio[0].sample_rate -ne 48000 -or [int]$audio[0].channels -ne 2) {
        throw "Final audio stream is not AAC 48 kHz stereo."
    }

    $OutputSha256 = Get-Sha256 -LiteralPath $muxedOutputPath
    $outputBytes = (Get-Item -LiteralPath $muxedOutputPath).Length
    $deliveryManifest = [ordered]@{
        schemaVersion = 1
        title = $acceptedTitle
        output = [ordered]@{
            path = "video/footsteps-return/renders/footsteps-return-4k.mp4"
            sha256 = $OutputSha256
            bytes = $outputBytes
        }
        sourceAudio = [ordered]@{
            sha256 = $sourceSha256
            bytes = $sourceBytes
            renderContractSha256 = [string]$mix.output.renderContractSha256
        }
        visualContract = [ordered]@{
            sha256 = [string]$visualEvidence.visualContract.sha256
            fileCount = [int]$visualEvidence.visualContract.fileCount
        }
        evidenceToolContract = [ordered]@{
            sha256 = [string]$visualEvidence.evidenceToolContract.sha256
            fileCount = [int]$visualEvidence.evidenceToolContract.fileCount
        }
        frameEnvelope = [ordered]@{
            fps = $fps
            totalFrames = $totalFrames
            logicalDurationSeconds = $logicalDurationSeconds
            pictureDurationSeconds = $pictureDurationSeconds
        }
    }
    $manifestJson = $deliveryManifest | ConvertTo-Json -Depth 6
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($outputManifestTempPath, $manifestJson + [Environment]::NewLine, $utf8WithoutBom)

    # Publish the probed MP4 first and its matching identity last. If any step is
    # interrupted, the absent manifest prevents a stale/partial file from passing.
    Publish-AtomicFile -TempPath $muxedOutputPath -DestinationPath $outputPath
    Publish-AtomicFile -TempPath $outputManifestTempPath -DestinationPath $outputManifestPath

    Write-Host "Task 11 final output: $outputPath"
    Write-Host "Task 11 output identity: $OutputSha256 ($outputBytes bytes)"
    Write-Host "Authenticated source: $sourceSha256 ($sourceBytes bytes)"
    Write-Host "Frame envelope: $totalFrames frames at 60 fps = $pictureDurationText s; full 214.040 s master plus 0.010 s delivery padding."
} finally {
    Pop-Location
}
