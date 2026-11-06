#requires -Version 5.1
<#
.SYNOPSIS
Extract exactly one PNG for every decoded video frame, with a validation report.
.EXAMPLE
& .\scripts\Extract-WhiteBallNpc.ps1 -VideoPath "$HOME\Downloads\gemini_generated_video_df8deaea.mp4"
.NOTES
Runs only locally. Requires ffmpeg and ffprobe on PATH. Does not commit or upload media.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $VideoPath,
    [string] $RepoRoot = 'C:\Projects\claude-animated-shorts-engineering',
    [string] $AssetId = 'white-ball-npc-v1',
    [string] $ExpectedSHA256 = '4fcd0b4dd28ba4fce72ae3a83df2162f4533a9c19a20220b1daf79707ecdae48'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Invoke-NativeChecked {
    param([Parameter(Mandatory = $true)][string]$Executable,
          [Parameter(Mandatory = $true)][string[]]$Arguments)
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed (exit $LASTEXITCODE): $Executable $($Arguments -join ' ')" }
}
function Resolve-RequiredCommand {
    param([string]$Name)
    $found = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $found) { throw "'$Name' not found in PATH. Install FFmpeg and restart PowerShell." }
    return $found.Source
}
if (-not (Test-Path -LiteralPath $VideoPath -PathType Leaf)) {
    throw "Video not found: $VideoPath. Supply -VideoPath with the actual Windows path."
}
if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) {
    throw "Repository missing: $RepoRoot. Clone it first; the script will not create or overwrite a repository."
}
$gitDir = Join-Path $RepoRoot '.git'
if (-not (Test-Path -LiteralPath $gitDir)) { throw "Directory is not a Git working copy: $RepoRoot" }
if ($AssetId -notmatch '^[a-z0-9][a-z0-9-]*$') { throw 'AssetId must contain only lowercase letters, digits and hyphens.' }
$ffmpeg = Resolve-RequiredCommand 'ffmpeg'
$ffprobe = Resolve-RequiredCommand 'ffprobe'
$source = (Resolve-Path -LiteralPath $VideoPath).ProviderPath
$repo = (Resolve-Path -LiteralPath $RepoRoot).ProviderPath
$sha = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
if ($ExpectedSHA256 -and $sha -ne $ExpectedSHA256.ToLowerInvariant()) {
    throw "SHA256 mismatch: supplied video is not the expected reference. Expected=$ExpectedSHA256 actual=$sha"
}
$workspace = Join-Path $repo ('.local\npc-reference\' + $AssetId)
if (Test-Path -LiteralPath $workspace) {
    throw "Output already exists: $workspace. Refusing to overwrite/delete it. Choose a new -AssetId or inspect/remove manually."
}
$frames = Join-Path $workspace 'frames-png'
$keyframes = Join-Path $workspace 'keyframes'
$sheets = Join-Path $workspace 'contact-sheets'
New-Item -ItemType Directory -Path $frames,$keyframes,$sheets -Force | Out-Null

# Keep generated media out of normal git commits without editing tracked .gitignore.
$exclude = Join-Path $repo '.git\info\exclude'
if (Test-Path -LiteralPath $exclude) {
    $content = Get-Content -LiteralPath $exclude -Raw
    if ($content -notmatch '(?m)^/\.local/$') { Add-Content -LiteralPath $exclude -Value "`n/.local/" }
} else { throw 'Missing .git/info/exclude; check repository setup.' }

$probeText = (& $ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames -show_entries format=duration -of json $source | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'ffprobe failed reading video metadata.' }
$probe = $probeText | ConvertFrom-Json
if (-not $probe.streams -or $probe.streams.Count -lt 1) { throw 'No video stream in input.' }
$video = $probe.streams[0]
$fpsParts = ([string]$video.avg_frame_rate).Split('/')
$fps = if ($fpsParts.Count -eq 2 -and [double]$fpsParts[1] -ne 0) { [double]$fpsParts[0] / [double]$fpsParts[1] } else { $null }
$pattern = Join-Path $frames 'frame_%06d.png'
Invoke-NativeChecked $ffmpeg @('-hide_banner','-loglevel','error','-nostdin','-i',$source,'-map','0:v:0','-fps_mode','passthrough','-start_number','0',$pattern)
$all = @(Get-ChildItem -LiteralPath $frames -Filter 'frame_*.png' -File | Sort-Object Name)
if ($all.Count -ne 240) { throw "Expected exactly 240 decoded PNG frames for approved source, got $($all.Count)" }
if ([int]$video.width -ne 1280 -or [int]$video.height -ne 720) { throw 'Unexpected source video dimensions' }
if ([math]::Abs($fps-24) -gt 0.001) { throw 'Unexpected source FPS; expected 24' }
if ($video.nb_frames -and ([int]$video.nb_frames -ne $all.Count)) { throw "FRAME COUNT MISMATCH expected=$($video.nb_frames) extracted=$($all.Count)" }
for ($i=0; $i -lt $all.Count; $i++) {
    $expected = 'frame_{0:D6}.png' -f $i
    if ($all[$i].Name -cne $expected) { throw "Non-contiguous sequence at index ${i}: $($all[$i].Name)" }
}
# Reproducible contact sheet: 2 frames/second, maximum 20 thumbnails for a 10s clip.
$sheetPath = Join-Path $sheets 'timeline_first_20.jpg'
Invoke-NativeChecked $ffmpeg @('-hide_banner','-loglevel','error','-nostdin','-i',$source,'-vf','fps=2,scale=320:180,tile=4x5:padding=6:margin=8:color=0x20242B','-frames:v','1','-q:v','3','-y',$sheetPath)

$sampleIndices = @(0, 30, 50, 65, 90, 120, 145, 160, 180, 230, 239)
$selected = @()
foreach ($idx in $sampleIndices) {
    if ($idx -ge $all.Count) { continue }
    $f = $all[$idx]
    $name = 'key_{0:D6}.png' -f $idx
    Copy-Item -LiteralPath $f.FullName -Destination (Join-Path $keyframes $name) -ErrorAction Stop
    $selected += [ordered]@{ frame=$idx; timeSeconds=if ($fps) { [math]::Round($idx/$fps,6) } else { $null }; file="keyframes/$name" }
}
$meta = [ordered]@{
    schemaVersion = '1.0'
    assetId = $AssetId
    sourceFileName = [IO.Path]::GetFileName($source)
    sourceSha256 = $sha
    codec = $video.codec_name
    width = [int]$video.width
    height = [int]$video.height
    fps = $fps
    sourceDeclaredFrames = if ($video.nb_frames) { [int]$video.nb_frames } else { $null }
    extractedFrames = $all.Count
    frameIndexFirst = 0
    frameIndexLast = $all.Count - 1
    durationSecondsReported = [double]$probe.format.duration
    framePattern = 'frames-png/frame_%06d.png'
    selection = $selected
    status = 'REFERENCE_ONLY__CHARACTER_RIG_NOT_TRAINED'
}
$manifest = Join-Path $workspace 'extraction-manifest.json'
$meta | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifest -Encoding UTF8
# Editable action/expression phase labels, sampled estimates; not ML truth.
$phases = @(
    [pscustomobject]@{ Start=0; End=24; Expression='default'; Action='idle' },
    [pscustomobject]@{ Start=25; End=45; Expression='happy-closed'; Action='hop' },
    [pscustomobject]@{ Start=46; End=77; Expression='wink'; Action='look-right' },
    [pscustomobject]@{ Start=78; End=107; Expression='surprised'; Action='react' },
    [pscustomobject]@{ Start=108; End=133; Expression='tired'; Action='idle' },
    [pscustomobject]@{ Start=134; End=164; Expression='anxious'; Action='idle' },
    [pscustomobject]@{ Start=165; End=239; Expression='sparkly-happy'; Action='hop' }
)
@($all | ForEach-Object -Begin { $i=0 } -Process {
    $hit = @($phases | Where-Object { $i -ge $_.Start -and $i -le $_.End } | Select-Object -First 1)
    $match = if ($hit.Count -gt 0) { $hit[0] } else { $null }
    $row = [pscustomobject]@{
        FrameIndex = $i
        Expression = if ($match) { $match.Expression } else { 'unclassified' }
        Action = if ($match) { $match.Action } else { 'unclassified' }
        LabelStatus = 'ESTIMATED_FROM_SAMPLED_REFERENCE__HUMAN_REVIEW_REQUIRED'
    }
    $i++
    $row
}) | Export-Csv -LiteralPath (Join-Path $workspace 'frame-labels-proposed.csv') -NoTypeInformation -Encoding UTF8
$csv = Join-Path $workspace 'frame-index.csv'
@($all | ForEach-Object -Begin { $i=0 } -Process {
    $row = [pscustomobject]@{ FrameIndex=$i; TimestampSeconds=if($fps){[math]::Round($i/$fps,6)}else{$null}; FileName=$_.Name; Bytes=$_.Length; FrameSha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
    $i++
    $row
}) | Export-Csv -LiteralPath $csv -NoTypeInformation -Encoding UTF8
Write-Host "`nPASS: Frame extraction and contiguous numbering validated." -ForegroundColor Green
Write-Host "Frames  : $($all.Count)"
Write-Host "FPS     : $fps"
Write-Host "Video   : $($video.width)x$($video.height)"
Write-Host "SHA256  : $sha"
Write-Host "Folder  : $workspace"
Write-Host "Manifest: $manifest"
Write-Host 'Next: Review keyframes; engineer a reusable vector NPC. Extraction is not training.'
