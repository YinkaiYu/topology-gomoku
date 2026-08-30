param(
    [switch]$ValidateOnly
)

$ErrorActionPreference = "Stop"
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$pvRoot = Split-Path -Parent $scriptDirectory
$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $pvRoot "..\.."))
$mixPath = Join-Path $pvRoot "audio\mix.json"
$mix = Get-Content -Raw -Encoding UTF8 $mixPath | ConvertFrom-Json
$culture = [System.Globalization.CultureInfo]::InvariantCulture
$sampleRate = [int]$mix.composition.sampleRateHz
$duration = [double]$mix.composition.durationSeconds

function Format-Number {
    param([Parameter(Mandatory = $true)][double]$Value)
    return $Value.ToString("0.############", $culture)
}

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

function Resolve-ProjectPath {
    param([Parameter(Mandatory = $true)][string]$ProjectRelativePath)
    if (-not $ProjectRelativePath.StartsWith("video/footsteps-return/", [System.StringComparison]::Ordinal)) {
        throw "Audio path must be project-relative: $ProjectRelativePath"
    }
    $candidate = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot ($ProjectRelativePath.Replace("/", "\"))))
    $rootPrefix = $repositoryRoot.TrimEnd("\") + "\"
    if (-not $candidate.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Audio path escapes the repository: $ProjectRelativePath"
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

function Read-LoudnormJson {
    param([Parameter(Mandatory = $true)][string]$Output)
    $match = [regex]::Match($Output, '(?s)\{\s*"input_i".*?\}')
    if (-not $match.Success) {
        throw "FFmpeg loudnorm did not emit its JSON measurement block.`n$Output"
    }
    return $match.Value | ConvertFrom-Json
}

$toolJson = & node (Join-Path $scriptDirectory "doctor.mjs") --score-tools-json
if ($LASTEXITCODE -ne 0) {
    throw "FFmpeg must be resolved by the PV doctor before final mixing."
}
$tools = $toolJson | ConvertFrom-Json
if (-not [System.IO.Path]::IsPathRooted($tools.ffmpeg) -or -not (Test-Path -LiteralPath $tools.ffmpeg -PathType Leaf)) {
    throw "The PV doctor did not return an existing absolute FFmpeg path."
}
$ffmpeg = [System.IO.Path]::GetFullPath($tools.ffmpeg)
$ffprobe = Join-Path (Split-Path -Parent $ffmpeg) "ffprobe.exe"
if (-not (Test-Path -LiteralPath $ffprobe -PathType Leaf)) {
    throw "FFprobe was not found beside the resolved FFmpeg executable: $ffprobe"
}

function Probe-Audio {
    param(
        [Parameter(Mandatory = $true)][string]$ProjectRelativePath,
        [Parameter(Mandatory = $true)][string]$ExpectedSha256,
        [Parameter(Mandatory = $true)][int]$ExpectedChannels,
        [Parameter(Mandatory = $true)][int]$ExpectedBitsPerSample,
        [Parameter(Mandatory = $true)][string]$ExpectedCodec,
        [Parameter(Mandatory = $true)][double]$ExpectedDuration
    )
    $absolutePath = Resolve-ProjectPath $ProjectRelativePath
    if (-not (Test-Path -LiteralPath $absolutePath -PathType Leaf)) {
        throw "Required audio input is missing: $ProjectRelativePath"
    }
    $actualHash = Get-Sha256 -LiteralPath $absolutePath
    if ($actualHash -ne $ExpectedSha256.ToLowerInvariant()) {
        throw "Audio hash mismatch for ${ProjectRelativePath}: expected $ExpectedSha256, got $actualHash"
    }
    $probeOutput = Invoke-Captured -Executable $ffprobe -Arguments @(
        "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "stream=sample_rate,channels,bits_per_sample,codec_name:format=duration",
        "-of", "json",
        $absolutePath
    ) -Description "FFprobe validation for $ProjectRelativePath"
    $probe = $probeOutput | ConvertFrom-Json
    $stream = @($probe.streams)[0]
    $actualDuration = [double]::Parse([string]$probe.format.duration, $culture)
    if ([int]$stream.sample_rate -ne $sampleRate) {
        throw "$ProjectRelativePath must be $sampleRate Hz, got $($stream.sample_rate) Hz"
    }
    if ([int]$stream.channels -ne $ExpectedChannels) {
        throw "$ProjectRelativePath must have $ExpectedChannels channel(s), got $($stream.channels)"
    }
    if ([int]$stream.bits_per_sample -ne $ExpectedBitsPerSample -or [string]$stream.codec_name -ne $ExpectedCodec) {
        throw "$ProjectRelativePath must be $ExpectedCodec / $ExpectedBitsPerSample-bit PCM, got $($stream.codec_name) / $($stream.bits_per_sample)-bit"
    }
    if ([math]::Abs($actualDuration - $ExpectedDuration) -gt ((1 / $sampleRate) + 0.000001)) {
        throw "$ProjectRelativePath duration $actualDuration does not match $ExpectedDuration seconds"
    }
    return [pscustomobject]@{
        Path = $absolutePath
        Duration = $actualDuration
        Channels = [int]$stream.channels
        SampleRate = [int]$stream.sample_rate
    }
}

if ($mix.composition.id -ne "footsteps-return" -or $duration -ne 214.04 -or $sampleRate -ne 48000 -or [int]$mix.composition.channels -ne 2) {
    throw "The final mix contract must be footsteps-return / 214.040 seconds / 48 kHz stereo."
}
if (@($mix.inputs.narration.cues).Count -ne 21) {
    throw "The final mix requires exactly 21 narration cues."
}
if ($mix.inputs.narration.pan -ne "center") {
    throw "Narration must remain centered."
}
if ($mix.inputs.sfx.continuousBed -ne $false -or @($mix.inputs.sfx.cues).Count -ne 21) {
    throw "The final SFX bus must contain exactly 21 sparse cues and no continuous bed."
}

$narrationInputs = @()
foreach ($cue in $mix.inputs.narration.cues) {
    $end = [double]$cue.startSeconds + [double]$cue.durationSeconds
    if ($end -gt $duration + (1 / $sampleRate)) {
        throw "Narration cue $($cue.id) ends after the composition."
    }
    $narrationInputs += Probe-Audio -ProjectRelativePath $cue.file -ExpectedSha256 $cue.sha256 -ExpectedChannels 1 -ExpectedBitsPerSample 16 -ExpectedCodec "pcm_s16le" -ExpectedDuration ([double]$cue.durationSeconds)
}

$scoreEnd = [double]$mix.inputs.score.startSeconds + [double]$mix.inputs.score.durationSeconds
if ($scoreEnd -gt $duration + (1 / $sampleRate)) {
    throw "The score ends after the composition."
}
$scoreInput = Probe-Audio -ProjectRelativePath $mix.inputs.score.file -ExpectedSha256 $mix.inputs.score.sha256 -ExpectedChannels 2 -ExpectedBitsPerSample 24 -ExpectedCodec "pcm_s24le" -ExpectedDuration ([double]$mix.inputs.score.durationSeconds)

$uniqueSfx = [ordered]@{}
foreach ($cue in $mix.inputs.sfx.cues) {
    $end = [double]$cue.startSeconds + [double]$cue.durationSeconds
    if ($end -gt $duration + (1 / $sampleRate)) {
        throw "SFX cue $($cue.id) ends after the composition."
    }
    if (-not $uniqueSfx.Contains($cue.file)) {
        $uniqueSfx[$cue.file] = [pscustomobject]@{ Sha256 = $cue.sha256; Duration = [double]$cue.durationSeconds }
    } elseif ($uniqueSfx[$cue.file].Sha256 -ne $cue.sha256 -or $uniqueSfx[$cue.file].Duration -ne [double]$cue.durationSeconds) {
        throw "SFX cues disagree about the source contract for $($cue.file)."
    }
}
foreach ($entry in $uniqueSfx.GetEnumerator()) {
    [void](Probe-Audio -ProjectRelativePath $entry.Key -ExpectedSha256 $entry.Value.Sha256 -ExpectedChannels 2 -ExpectedBitsPerSample 16 -ExpectedCodec "pcm_s16le" -ExpectedDuration $entry.Value.Duration)
}

if ($ValidateOnly) {
    [pscustomobject]@{
        status = "ready"
        durationSeconds = $duration
        sampleRateHz = $sampleRate
        narrationCueCount = @($mix.inputs.narration.cues).Count
        scoreFileCount = 1
        sfxFileCount = $uniqueSfx.Count
        sfxCueCount = @($mix.inputs.sfx.cues).Count
    } | ConvertTo-Json -Compress
    exit 0
}

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$outputPath = Resolve-ProjectPath $mix.composition.outputFile
$outputDirectory = Split-Path -Parent $outputPath
$workDirectory = Join-Path $pvRoot ".hyperframes\audio-mix"
New-Item -ItemType Directory -Force $outputDirectory, $workDirectory | Out-Null
$filterPath = Join-Path $workDirectory "mix-filter.txt"
$premasterPath = Join-Path $workDirectory "premaster.wav"

$ffmpegArguments = [System.Collections.Generic.List[string]]::new()
@("-hide_banner", "-loglevel", "error", "-nostdin", "-y") | ForEach-Object { $ffmpegArguments.Add($_) }
foreach ($input in $narrationInputs) {
    $ffmpegArguments.Add("-i")
    $ffmpegArguments.Add($input.Path)
}
$scoreInputIndex = $ffmpegArguments.Count
$ffmpegArguments.Add("-i")
$ffmpegArguments.Add($scoreInput.Path)

$scoreStreamIndex = @($mix.inputs.narration.cues).Count
$sfxStreamStart = $scoreStreamIndex + 1
$sfxInputPaths = @()
foreach ($cue in $mix.inputs.sfx.cues) {
    $absolutePath = Resolve-ProjectPath $cue.file
    $sfxInputPaths += $absolutePath
    $ffmpegArguments.Add("-i")
    $ffmpegArguments.Add($absolutePath)
}

$filterLines = [System.Collections.Generic.List[string]]::new()
$voiceLabels = [System.Collections.Generic.List[string]]::new()
for ($index = 0; $index -lt @($mix.inputs.narration.cues).Count; $index += 1) {
    $cue = $mix.inputs.narration.cues[$index]
    $delaySamples = [long][math]::Round([double]$cue.startSeconds * $sampleRate)
    $cueDuration = Format-Number ([double]$cue.durationSeconds)
    $label = "voice_$index"
    $voiceLabels.Add("[$label]")
    $filterLines.Add("[$index`:a]atrim=duration=$cueDuration,asetpts=PTS-STARTPTS,aresample=$sampleRate,aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=mono,adelay=$($delaySamples)S[$label]")
}
$durationText = Format-Number $duration
$voiceGain = Format-Number ([double]$mix.inputs.narration.gainDb)
$filterLines.Add(($voiceLabels -join "") + "amix=inputs=$($voiceLabels.Count):duration=longest:normalize=0,volume=$($voiceGain)dB,pan=stereo|FL=0.7071067812*c0|FR=0.7071067812*c0,apad=whole_dur=$durationText,atrim=duration=$durationText,asplit=3[voice_mix][voice_score_key][voice_sfx_key]")

$scoreGain = Format-Number ([double]$mix.inputs.score.gainDb)
$middleLevel = Format-Number ([double]$mix.inputs.score.width.middleLevel)
$sideLevel = Format-Number ([double]$mix.inputs.score.width.sideLevel)
$scoreDucking = $mix.inputs.score.ducking
$filterLines.Add("[$scoreStreamIndex`:a]aresample=$sampleRate,aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=stereo,volume=$($scoreGain)dB,stereotools=mlev=$middleLevel`:slev=$sideLevel[score_width]")
$filterLines.Add("[score_width][voice_score_key]sidechaincompress=threshold=$(Format-Number ([double]$scoreDucking.threshold))`:ratio=$(Format-Number ([double]$scoreDucking.ratio))`:attack=$(Format-Number ([double]$scoreDucking.attackMs))`:release=$(Format-Number ([double]$scoreDucking.releaseMs))`:makeup=1`:mix=1[score_ducked]")

$sfxLabels = [System.Collections.Generic.List[string]]::new()
for ($index = 0; $index -lt @($mix.inputs.sfx.cues).Count; $index += 1) {
    $cue = $mix.inputs.sfx.cues[$index]
    $streamIndex = $sfxStreamStart + $index
    $delaySamples = [long][math]::Round([double]$cue.startSeconds * $sampleRate)
    $cueDuration = Format-Number ([double]$cue.durationSeconds)
    $cueGain = Format-Number ([double]$cue.gainDb)
    $label = "sfx_$index"
    $sfxLabels.Add("[$label]")
    $filterLines.Add("[$streamIndex`:a]atrim=duration=$cueDuration,asetpts=PTS-STARTPTS,aresample=$sampleRate,aformat=sample_fmts=fltp:sample_rates=${sampleRate}:channel_layouts=stereo,volume=$($cueGain)dB,adelay=$($delaySamples)S|$($delaySamples)S[$label]")
}
$filterLines.Add(($sfxLabels -join "") + "amix=inputs=$($sfxLabels.Count):duration=longest:normalize=0,apad=whole_dur=$durationText,atrim=duration=$durationText[sfx_bus]")
$sfxDucking = $mix.inputs.sfx.ducking
$filterLines.Add("[sfx_bus][voice_sfx_key]sidechaincompress=threshold=$(Format-Number ([double]$sfxDucking.threshold))`:ratio=$(Format-Number ([double]$sfxDucking.ratio))`:attack=$(Format-Number ([double]$sfxDucking.attackMs))`:release=$(Format-Number ([double]$sfxDucking.releaseMs))`:makeup=1`:mix=1[sfx_ducked]")
$filterLines.Add("[voice_mix][score_ducked][sfx_ducked]amix=inputs=3:duration=longest:normalize=0,apad=whole_dur=$durationText,atrim=duration=$durationText,asetpts=N/SR/TB[premaster]")

[System.IO.File]::WriteAllText($filterPath, ($filterLines -join ";`n") + "`n", $utf8NoBom)
$ffmpegVersionOutput = Invoke-Captured -Executable $ffmpeg -Arguments @("-version") -Description "FFmpeg version capture"
$ffmpegVersion = ($ffmpegVersionOutput -split "`r?`n")[0].Trim()
$outputCodec = [string]$mix.processing.outputFormat.codec
if ($outputCodec -ne "pcm_s24le" -or [int]$mix.processing.outputFormat.bitsPerSample -ne 24) {
    throw "The draft output contract must remain pcm_s24le / 24-bit."
}
$mix.processing.implementation.mixerScript = "scripts/mix-audio.ps1"
$mix.processing.implementation.mixerScriptSha256 = Get-Sha256 -LiteralPath $MyInvocation.MyCommand.Path
$mix.processing.implementation.ffmpegVersion = $ffmpegVersion
[System.IO.File]::WriteAllText($mixPath, ($mix | ConvertTo-Json -Depth 100) + "`n", $utf8NoBom)
$contractHash = (& node (Join-Path $scriptDirectory "hash-mix-contract.mjs") $mixPath | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $contractHash -notmatch '^[0-9a-f]{64}$') {
    throw "The deterministic mix render contract could not be hashed."
}
$mix.output.status = "rendering"
$mix.output | Add-Member -NotePropertyName renderContractSha256 -NotePropertyValue $contractHash -Force
$mix.output.sha256 = $null
$mix.output.bytes = 0
$mix.output.measurements.integratedLufs = $null
$mix.output.measurements.loudnessRangeLu = $null
$mix.output.measurements.truePeakDbtp = $null
$mix.output.measurements.thresholdLufs = $null
[System.IO.File]::WriteAllText($mixPath, ($mix | ConvertTo-Json -Depth 100) + "`n", $utf8NoBom)
$ffmpegArguments.Add("-/filter_complex")
$ffmpegArguments.Add($filterPath)
$ffmpegArguments.Add("-map")
$ffmpegArguments.Add("[premaster]")
$ffmpegArguments.Add("-ar")
$ffmpegArguments.Add([string]$sampleRate)
$ffmpegArguments.Add("-ac")
$ffmpegArguments.Add("2")
$ffmpegArguments.Add("-c:a")
$ffmpegArguments.Add($outputCodec)
$ffmpegArguments.Add($premasterPath)
Invoke-Checked -Executable $ffmpeg -Arguments $ffmpegArguments.ToArray() -Description "Deterministic narration/score/SFX premix"

$loudness = $mix.processing.loudness
$targetI = Format-Number ([double]$loudness.targetIntegratedLufs)
$targetLra = Format-Number ([double]$loudness.targetLoudnessRangeLu)
$targetTp = Format-Number ([double]$loudness.truePeakCeilingDbtp)
$durationSamples = [long][math]::Round($duration * $sampleRate)
$firstPassOutput = Invoke-Captured -Executable $ffmpeg -Arguments @(
    "-hide_banner", "-nostats", "-nostdin",
    "-i", $premasterPath,
    "-af", "loudnorm=I=$targetI`:LRA=$targetLra`:TP=$targetTp`:print_format=json",
    "-f", "null", "NUL"
) -Description "FFmpeg loudness first pass"
$firstPass = Read-LoudnormJson $firstPassOutput

$measuredI = [double]::Parse([string]$firstPass.input_i, $culture)
$measuredLra = [double]::Parse([string]$firstPass.input_lra, $culture)
$measuredTp = [double]::Parse([string]$firstPass.input_tp, $culture)
$measuredThreshold = [double]::Parse([string]$firstPass.input_thresh, $culture)
$offset = [double]::Parse([string]$firstPass.target_offset, $culture)
$limiterCeilingLinear = [math]::Pow(10, [double]$loudness.finalLimiterCeilingDbfs / 20)
$secondPassFilter = "loudnorm=I=$targetI`:LRA=$targetLra`:TP=$targetTp`:measured_I=$(Format-Number $measuredI)`:measured_LRA=$(Format-Number $measuredLra)`:measured_TP=$(Format-Number $measuredTp)`:measured_thresh=$(Format-Number $measuredThreshold)`:offset=$(Format-Number $offset)`:linear=true`:print_format=summary,alimiter=limit=$(Format-Number $limiterCeilingLinear)`:attack=5`:release=100`:level=disabled`:latency=true,aresample=$sampleRate,asetpts=N/SR/TB,apad=whole_len=$durationSamples,atrim=end_sample=$durationSamples,asetpts=N/SR/TB"
Invoke-Checked -Executable $ffmpeg -Arguments @(
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-i", $premasterPath,
    "-af", $secondPassFilter,
    "-ar", [string]$sampleRate, "-ac", "2", "-c:a", $outputCodec,
    $outputPath
) -Description "FFmpeg two-pass loudness master and true-peak limit"

$finalAnalysisOutput = Invoke-Captured -Executable $ffmpeg -Arguments @(
    "-hide_banner", "-nostats", "-nostdin",
    "-i", $outputPath,
    "-af", "loudnorm=I=$targetI`:LRA=$targetLra`:TP=$targetTp`:print_format=json",
    "-f", "null", "NUL"
) -Description "FFmpeg final loudness verification"
$finalAnalysis = Read-LoudnormJson $finalAnalysisOutput
$mix.output.status = "measured"
$mix.output.renderContractSha256 = $contractHash
$mix.output.sha256 = Get-Sha256 -LiteralPath $outputPath
$mix.output.bytes = (Get-Item -LiteralPath $outputPath).Length
$mix.output.measurements.integratedLufs = [double]::Parse([string]$finalAnalysis.input_i, $culture)
$mix.output.measurements.loudnessRangeLu = [double]::Parse([string]$finalAnalysis.input_lra, $culture)
$mix.output.measurements.truePeakDbtp = [double]::Parse([string]$finalAnalysis.input_tp, $culture)
$mix.output.measurements.thresholdLufs = [double]::Parse([string]$finalAnalysis.input_thresh, $culture)
$mix.output.analysis.ffmpegVersion = $ffmpegVersion
$mix.output.analysis.method = "FFmpeg two-pass loudnorm to $targetI LUFS / $targetTp dBTP, followed by a latency-compensated $(Format-Number ([double]$loudness.finalLimiterCeilingDbfs)) dBFS safety limiter, exact $durationSamples-sample trim at $sampleRate Hz, and independent loudnorm verification."
$mix.output.analysis | Add-Member -NotePropertyName measurementRationale -NotePropertyValue "The recorded values are automated FFmpeg measurements, not a subjective listening judgment. The target is distribution-oriented; native Mandarin intelligibility, music balance, and SFX masking remain user-review-required." -Force

[System.IO.File]::WriteAllText($mixPath, ($mix | ConvertTo-Json -Depth 100) + "`n", $utf8NoBom)
if (Test-Path -LiteralPath $premasterPath -PathType Leaf) {
    Remove-Item -LiteralPath $premasterPath -Force
}
if (Test-Path -LiteralPath $filterPath -PathType Leaf) {
    Remove-Item -LiteralPath $filterPath -Force
}

Write-Host "[ok] Draft master: $outputPath"
Write-Host "[ok] Measured $($mix.output.measurements.integratedLufs) LUFS integrated / $($mix.output.measurements.truePeakDbtp) dBTP at $sampleRate Hz stereo / $duration seconds."
