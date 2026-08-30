[CmdletBinding()]
param(
    [ValidateRange(-1, 0)]
    [int]$Rate = 0,

    [string]$OutputRoot,

    [switch]$Force,

    [string[]]$CueId
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# Windows.Media.SpeechSynthesis is projected reliably by Windows PowerShell 5.1.
# Relaunch there when this script was entered through PowerShell 7.
if ($PSVersionTable.PSEdition -ne 'Desktop') {
    $arguments = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', $PSCommandPath,
        '-Rate', [string]$Rate
    )
    if ($OutputRoot) {
        $arguments += @('-OutputRoot', $OutputRoot)
    }
    if ($Force) {
        $arguments += '-Force'
    }
    foreach ($id in @($CueId)) {
        $arguments += @('-CueId', $id)
    }
    & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" @arguments
    exit $LASTEXITCODE
}

$scriptDirectory = Split-Path -Parent $PSCommandPath
$pvRoot = Split-Path -Parent $scriptDirectory
$repositoryRoot = (Resolve-Path (Join-Path $pvRoot '..\..')).Path
$storyPath = Join-Path $pvRoot 'story.json'
if (-not $OutputRoot) {
    $OutputRoot = Join-Path $repositoryRoot '.tmp\chapter-teaser'
}
$OutputRoot = [System.IO.Path]::GetFullPath($OutputRoot)
$voiceRoot = Join-Path $OutputRoot 'voice\raw'
$voiceManifestPath = Join-Path $OutputRoot 'voice\voice-manifest.json'
[System.IO.Directory]::CreateDirectory($voiceRoot) | Out-Null

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$speechSynthesizerType = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$speechStreamType = [Windows.Media.SpeechSynthesis.SpeechSynthesisStream, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]

function Await-WinRtOperation {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Operation,

        [Parameter(Mandatory = $true)]
        [Type]$ResultType
    )

    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq 'AsTask' -and
            $_.IsGenericMethod -and
            $_.GetGenericArguments().Count -eq 1 -and
            $_.GetParameters().Count -eq 1
        } |
        Select-Object -First 1
    if (-not $asTask) {
        throw 'Unable to locate the WinRT AsTask adapter.'
    }
    $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    $task.Wait()
    return $task.Result
}

function Get-VoiceCues {
    param([object]$Story)

    $items = New-Object System.Collections.Generic.List[object]
    $sections = @(
        [pscustomobject]@{ Id = 'intro'; Cues = $Story.intro.cues }
    )
    foreach ($chapter in $Story.chapters) {
        $sections += [pscustomobject]@{ Id = $chapter.id; Cues = $chapter.cues }
    }
    $sections += [pscustomobject]@{ Id = 'finale'; Cues = $Story.finale.cues }

    foreach ($section in $sections) {
        for ($index = 0; $index -lt $section.Cues.Count; $index += 1) {
            $id = '{0}-{1:d2}' -f $section.Id, ($index + 1)
            $items.Add([pscustomobject]@{
                id = $id
                sectionId = $section.Id
                index = $index
                text = [string]$section.Cues[$index].text
            })
        }
    }
    return $items.ToArray()
}

function Get-RelativePath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$BasePath,

        [Parameter(Mandatory = $true)]
        [string]$TargetPath
    )

    $baseUri = New-Object System.Uri(([System.IO.Path]::GetFullPath($BasePath).TrimEnd('\') + '\'))
    $targetUri = New-Object System.Uri([System.IO.Path]::GetFullPath($TargetPath))
    return [System.Uri]::UnescapeDataString($baseUri.MakeRelativeUri($targetUri).ToString())
}

function Copy-SpeechStream {
    param(
        [Parameter(Mandatory = $true)]
        [object]$SpeechStream,

        [Parameter(Mandatory = $true)]
        [string]$Destination
    )

    $input = [System.IO.WindowsRuntimeStreamExtensions]::AsStreamForRead($SpeechStream)
    try {
        $output = [System.IO.File]::Open($Destination, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
        try {
            $input.CopyTo($output)
        }
        finally {
            $output.Dispose()
        }
    }
    finally {
        $input.Dispose()
        $SpeechStream.Dispose()
    }
}

$story = Get-Content -LiteralPath $storyPath -Raw -Encoding UTF8 | ConvertFrom-Json
$allCues = @(Get-VoiceCues -Story $story)
if ($null -ne $CueId -and $CueId.Count -gt 0) {
    $requestedIds = @{}
    foreach ($id in $CueId) {
        $requestedIds[$id] = $true
    }
    $cues = @($allCues | Where-Object { $requestedIds.ContainsKey($_.id) })
    if ($cues.Count -ne $requestedIds.Count) {
        $found = @($cues | ForEach-Object { $_.id })
        $missing = @($requestedIds.Keys | Where-Object { $_ -notin $found })
        throw "Unknown cue id(s): $($missing -join ', ')"
    }
}
else {
    $cues = $allCues
}

$voice = @($speechSynthesizerType::AllVoices | Where-Object { $_.DisplayName -eq 'Microsoft Kangkang' }) | Select-Object -First 1
if (-not $voice) {
    $available = @($speechSynthesizerType::AllVoices | ForEach-Object { $_.DisplayName }) -join ', '
    throw "Microsoft Kangkang is not installed. Available OneCore voices: $available"
}

$synthesizer = New-Object $speechSynthesizerType
try {
    $synthesizer.Voice = $voice
    # Keep the public switch in SAPI-style integer units while using the WinRT
    # synthesizer that can actually address the installed OneCore male voice.
    $speakingRate = if ($Rate -eq -1) { 0.92 } else { 1.0 }
    $synthesizer.Options.SpeakingRate = $speakingRate
    $synthesizer.Options.AudioVolume = 1.0

    $entries = New-Object System.Collections.Generic.List[object]
    foreach ($cue in $cues) {
        $outputPath = Join-Path $voiceRoot ($cue.id + '.wav')
        if ($Force -or -not (Test-Path -LiteralPath $outputPath)) {
            Write-Host ("Synthesizing {0}: {1}" -f $cue.id, $cue.text)
            $operation = $synthesizer.SynthesizeTextToStreamAsync($cue.text)
            $stream = Await-WinRtOperation -Operation $operation -ResultType $speechStreamType
            Copy-SpeechStream -SpeechStream $stream -Destination $outputPath
        }
        $file = Get-Item -LiteralPath $outputPath
        if ($file.Length -le 44) {
            throw "Synthesized cue is empty: $outputPath"
        }
        $entries.Add([ordered]@{
            id = $cue.id
            sectionId = $cue.sectionId
            index = $cue.index
            text = $cue.text
            path = (Get-RelativePath -BasePath $repositoryRoot -TargetPath $outputPath)
            bytes = $file.Length
        })
    }
}
finally {
    $synthesizer.Dispose()
}

$manifest = [ordered]@{
    schemaVersion = 1
    engine = 'Windows.Media.SpeechSynthesis'
    voice = [ordered]@{
        displayName = $voice.DisplayName
        language = $voice.Language
        gender = [string]$voice.Gender
        id = $voice.Id
        rate = $Rate
        speakingRate = $speakingRate
        reviewOnly = $true
    }
    outputRoot = (Get-RelativePath -BasePath $repositoryRoot -TargetPath $OutputRoot)
    cues = $entries.ToArray()
}
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($voiceManifestPath, (($manifest | ConvertTo-Json -Depth 8) + "`n"), $utf8WithoutBom)

Write-Host ("Generated {0} Microsoft Kangkang review cue(s) in {1}" -f $entries.Count, $voiceRoot)
Write-Host ("Voice manifest: {0}" -f $voiceManifestPath)
