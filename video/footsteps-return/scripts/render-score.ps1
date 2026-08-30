param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$pvRoot = Split-Path -Parent $scriptDirectory
$scoreRoot = Join-Path $pvRoot "audio\score"
$stemSourceRoot = Join-Path $scoreRoot "stems"
$renderedRoot = Join-Path $scoreRoot "rendered"
$renderedStemRoot = Join-Path $renderedRoot "stems"
$reviewRoot = Join-Path $scoreRoot "review"
$voiceTiming = Get-Content -Raw -Encoding UTF8 (Join-Path $pvRoot "audio\voiceover\timing.json") | ConvertFrom-Json
$timelineDuration = ([double]$voiceTiming.masterDurationSeconds).ToString("0.######", [System.Globalization.CultureInfo]::InvariantCulture)

if (-not $SkipBuild) {
    & node (Join-Path $scriptDirectory "build-score.mjs")
    if ($LASTEXITCODE -ne 0) {
        throw "The deterministic score build failed."
    }
}

$toolJson = & node (Join-Path $scriptDirectory "doctor.mjs") --score-tools-json
if ($LASTEXITCODE -ne 0) {
    throw "MuseScore 4 and FFmpeg must be resolved by the PV doctor before score rendering."
}
$tools = $toolJson | ConvertFrom-Json
if (-not [System.IO.Path]::IsPathRooted($tools.musescore) -or -not [System.IO.Path]::IsPathRooted($tools.ffmpeg)) {
    throw "The PV doctor did not return absolute MuseScore/FFmpeg paths."
}

New-Item -ItemType Directory -Force $renderedRoot, $renderedStemRoot, $reviewRoot | Out-Null

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

function Invoke-MuseScoreChecked {
    param(
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$Description
    )
    $quotedArguments = $Arguments | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }
    $process = Start-Process -FilePath $tools.musescore -ArgumentList $quotedArguments -Wait -PassThru -WindowStyle Hidden
    if ($process.ExitCode -ne 0) {
        throw "$Description failed with exit code $($process.ExitCode)."
    }
}

function Render-ScoreFile {
    param(
        [Parameter(Mandatory = $true)][string]$Source,
        [Parameter(Mandatory = $true)][string]$Destination,
        [Parameter(Mandatory = $true)][string]$PartId
    )
    if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
        throw "Missing score source: $Source"
    }
    $rawPath = [System.IO.Path]::ChangeExtension($Destination, ".musescore.wav")
    $normalizedPath = [System.IO.Path]::ChangeExtension($Destination, ".normalized.wav")
    if (Test-Path -LiteralPath $rawPath -PathType Leaf) {
        Remove-Item -LiteralPath $rawPath -Force
    }
    if (Test-Path -LiteralPath $normalizedPath -PathType Leaf) {
        Remove-Item -LiteralPath $normalizedPath -Force
    }
    Invoke-MuseScoreChecked -Arguments @(
        "--sound-profile", "MuseScore Basic",
        "-o", $rawPath,
        $Source
    ) -Description "MuseScore render for $Source"
    if (-not (Test-Path -LiteralPath $rawPath -PathType Leaf)) {
        throw "MuseScore returned success without creating $rawPath"
    }
    Invoke-Checked -Executable $tools.ffmpeg -Arguments @(
        "-hide_banner", "-loglevel", "error", "-y",
        "-i", $rawPath,
        "-af", "volume=0.72,apad=whole_dur=$timelineDuration,atrim=duration=$timelineDuration,asetpts=N/SR/TB",
        "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le",
        $normalizedPath
    ) -Description "FFmpeg normalization for $PartId"
    Invoke-Checked -Executable "node" -Arguments @(
        (Join-Path $scriptDirectory "score-audio.mjs"), "spatialize",
        "--input", $normalizedPath,
        "--output", $Destination,
        "--plan", (Join-Path $scoreRoot "score-plan.json"),
        "--part", $PartId
    ) -Description "Deterministic PCM spatialization for $PartId"
    Remove-Item -LiteralPath $rawPath -Force
    Remove-Item -LiteralPath $normalizedPath -Force
}

$scorePlan = Get-Content -Raw (Join-Path $scoreRoot "score-plan.json") | ConvertFrom-Json
foreach ($part in $scorePlan.parts) {
    Render-ScoreFile -Source (Join-Path $stemSourceRoot "$($part.id).musicxml") -Destination (Join-Path $renderedStemRoot "$($part.id).wav") -PartId $part.id
}

$mixArguments = @("-hide_banner", "-loglevel", "error", "-y")
foreach ($part in $scorePlan.parts) {
    $mixArguments += @("-i", (Join-Path $renderedStemRoot "$($part.id).wav"))
}
$mixArguments += @(
    "-filter_complex", "amix=inputs=$($scorePlan.parts.Count):duration=longest:normalize=0,volume=0.25,alimiter=limit=0.891251:attack=5:release=100:level=disabled,apad=whole_dur=$timelineDuration,atrim=duration=$timelineDuration,asetpts=N/SR/TB",
    "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le",
    (Join-Path $renderedRoot "master.wav")
)
Invoke-Checked -Executable $tools.ffmpeg -Arguments $mixArguments -Description "Stem-summed spatial master"

Invoke-Checked -Executable $tools.ffmpeg -Arguments @(
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", (Join-Path $renderedRoot "master.wav"),
    "-ar", "48000", "-ac", "2", "-c:a", "libopus", "-b:a", "48k", "-vbr", "on",
    (Join-Path $reviewRoot "score-review.opus")
) -Description "Low-bitrate score review encode"

& node (Join-Path $scriptDirectory "build-score.mjs") --analyze-render
if ($LASTEXITCODE -ne 0) {
    throw "Rendered score analysis failed."
}

Write-Host "[ok] Rendered $($scorePlan.parts.Count) MuseScore Basic stems and their spatial stem-summed master at 48 kHz / stereo / $timelineDuration seconds."
