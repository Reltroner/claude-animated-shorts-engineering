# White Ball NPC P0-P3 — Refined Engineering Runbook (Windows PowerShell 5.1)

**Scope:** existing local repo `C:\Projects\claude-animated-shorts-engineering` containing 98 visible baseline files; **DO NOT RECLONE**, overwrite, move or replace `templates/bridge/*`, `references/*`, `templates/audio/*`, `SKILL.md`.

**Major change versus v1:** use the original `Pen` + `Place` + `Pool` + `Actor` pipeline as the *primary* NPC integration. The previous standalone SVG starter is not required and is **not** installed by V2. This repo has NO `package.json` or active Remotion application, so it cannot be presumed to render videos yet. The actual app scaffold is a separate later milestone.

## P0 — Baseline audit (no modifications)

~~~powershell
$Root='C:\Projects\claude-animated-shorts-engineering'
Set-Location -LiteralPath $Root
Get-Location
git remote -v
git branch --show-current
git status --short
@( 'SKILL.md','templates\bridge\toon.ts','templates\bridge\cast.ts','templates\bridge\world.ts','templates\bridge\story.ts','templates\bridge\Bridge.tsx','templates\audio\timeline.py','templates\scripts\short_qa.py') | ForEach-Object {
  [pscustomobject]@{File=$_; Exists=Test-Path -LiteralPath (Join-Path $Root $_) -PathType Leaf}
} | Format-Table -AutoSize
[pscustomobject]@{
  HasPackageJson=Test-Path -LiteralPath (Join-Path $Root 'package.json')
  HasSrcRoot=Test-Path -LiteralPath (Join-Path $Root 'src')
  HasNodeModules=Test-Path -LiteralPath (Join-Path $Root 'node_modules')
}
@('git','ffmpeg','ffprobe','node','npm') | ForEach-Object {
  $c=Get-Command $_ -ErrorAction SilentlyContinue
  [pscustomobject]@{Command=$_;Found=($null-ne$c);Path=if($c){$c.Source}else{''}}
} | Format-Table -AutoSize
~~~

**Gate P0:** Expected baseline files exist; origin matches `Reltroner/claude-animated-shorts-engineering`; local working tree clean. If source has been modified, stop and reconcile, do not `git reset --hard`.

## P1 — Install a source-only extension, NOT another video engine

Download `white_ball_npc_engineering_kit_v2.zip` and `Install-WhiteBallNpc-V2.ps1` to Downloads.

~~~powershell
$D=Join-Path $HOME 'Downloads'
Get-Content -LiteralPath (Join-Path $D 'Install-WhiteBallNpc-V2.ps1') -Raw
Unblock-File -LiteralPath (Join-Path $D 'Install-WhiteBallNpc-V2.ps1')
& (Join-Path $D 'Install-WhiteBallNpc-V2.ps1') -KitZip (Join-Path $D 'white_ball_npc_engineering_kit_v2.zip') -RepoRoot 'C:\Projects\claude-animated-shorts-engineering'
~~~

**Single-line invocation above is PowerShell 5.1 compatible.**

~~~powershell
& (Join-Path $HOME 'Downloads\Install-WhiteBallNpc-V2.ps1') -KitZip (Join-Path $HOME 'Downloads\white_ball_npc_engineering_kit_v2.zip') -RepoRoot 'C:\Projects\claude-animated-shorts-engineering'
~~~

Expected: selected/created `feat/white-ball-npc-v2`, four TS source files, one extraction script, and three documentation/support files. Existing baseline files untouched. If the script refuses a dirty repository, correct the state manually; do not force overwrite.

## P2 — Extract the user-supplied video into ignored local reference

Store the exact original `gemini_generated_video_df8deaea.mp4` in Downloads. SHA256 must match the video in the contract.

~~~powershell
$Root='C:\Projects\claude-animated-shorts-engineering'
$Video=Join-Path $HOME 'Downloads\gemini_generated_video_df8deaea.mp4'
(Get-FileHash -LiteralPath $Video -Algorithm SHA256).Hash
& (Join-Path $Root 'scripts\Extract-WhiteBallNpc.ps1') -VideoPath $Video -RepoRoot $Root
$Ref=Join-Path $Root '.local\npc-reference\white-ball-npc-v1'
@(Get-ChildItem -LiteralPath (Join-Path $Ref 'frames-png') -Filter '*.png' -File).Count
Get-Content -LiteralPath (Join-Path $Ref 'extraction-manifest.json')
git -C $Root status --short
~~~

Expected: **240** lossless PNGs numbered 000000..000239, 24 fps, 1280x720, keyframe samples, per-frame CSV/SHA256, contact sheet. No extraction if output already exists; the extractor refuses overwrite or deletion.

**Don't commit reference footage:** The extractor adds `/.local/` to `.git/info/exclude` (local-only). Verify `git status` never lists the raw MP4 or those frames.

## P3A — Reconstruct identity using the existing drawing API

- `WhiteBallPose.ts`: pure math for actions based only on frame/fps, with validation.
- `WhiteBallPen.ts`: draws body, face and two detached hands with the **existing Pen** from `templates/bridge/toon.ts` on its 600x1000 design canvas.
- `WhiteBallBridge.ts`: builds an object structurally compatible with the **existing Place** stage array.
- `index.ts`: exports the stable default ID WB-NPC-001.

This adaptation does NOT patch the historical 1831 bridge film. Its stage/lights/camera are examples to reuse or refactor *later*, not generic defaults. No fixed Bridge soldier design is inherited by the White Ball.

**Critical shader limitation:** `Actor` from `cast.ts` uses `cardShade` from `cardshade.ts`, which assumes a human head zone in canvas UV. Our White Ball is lower in the texture card. Expect potential shading mismatch; compare flat Pen output against Actor billboards before approving. A scene-specific shader flag or sprite material may become necessary, but no current test proves that.

## P3B — Engineer an actual render app only after P2 passes

The existing repo is a **template library**, not a Node app. It has `templates/bridge/Bridge.tsx` but no root `package.json`, `src/index.ts` or `src/Root.tsx`. Do not run `npm install` at repo root expecting a working composition. First inspect Node/npm/available disk and the source's exact compatible Remotion/Three versions, then create a minimal, explicitly reviewed app scaffold under `studio/` or an equivalent isolated location without moving baseline files.

The coding agent should build a 60-frame 30 fps `WB-NPC-001` test composition (1080x1920) using actual Pen/Canvas→texture/Actor integration, not a competing SVG-only renderer. Use an isolated white/neutral world first; do not import the bridge narrative camera or the entire 1.3GB Kenney asset pack. Later, reuse the source's world/lighting/camera grammar where it fits.

Mandatory render evidence: verified package build, typecheck, actual output MP4, ffprobe 1080x1920 at 30fps 60 frames, 7 expression stills, 4 action tests, cold-reader/owner visual review, and render QA.

**Do not treat `templates/scripts/short_qa.py` as plug-and-play at P2**: it is a final-output QA script, assumes Python deps (numpy, Pillow) and a rendered video, and is designed around the 30 fps bridge format. Verify requirements and adjust/parameterize it before reuse.

## Git and safety

- Keep main as historical baseline. Work on `feat/white-ball-npc-v2`; no auto-commit/push.
- Keep generated data under `.local/`, output media under ignored local build directories after adding an appropriate project-specific `.gitignore`.
- Do not publish source video, frames, third-party style-study reference frames, or unreviewed model output.
- Do not create paid services, external APIs, channel integrations, voice clones, or automatic uploads.
- Compare the first test stills with the **actual original video**, not with a web search mascot.
- Use Communication Framework v1.3 §22/§23 for any future public descriptions, but narrative writing rules do not replace pixel/pose correctness.

## P0/P1 acceptance summary

| ID | Check | State prior to user execution |
| --- | --- | --- |
| P0-01 | 98 baseline files / 8 directories from local scan | Reported by user, not independently read from Windows |
| P0-02 | Git remote and clean tree on Windows | Not executed |
| P1-01 | Original template paths unchanged | Expected after additive install; not executed on Windows |
| P1-02 | Pinned original video SHA matches | Verified in ChatGPT sandbox, not Windows |
| P2-01 | Local extraction exactly 240 PNGs | Not executed on Windows |
| P3-01 | Type-check in a real Remotion project | Not executed |
| P3-02 | 7 expressions + 4 motions render | Not executed |
| P3-03 | 60-frame vertical MP4 produced | Not executed |
| P3-04 | Founder approves look after comparison | Pending |

**Recommended next state:** P0 baseline inspection, P1 additive install, P2 extraction. Only then begin creating the Remotion studio application and evaluate shader/lighting compatibility.
