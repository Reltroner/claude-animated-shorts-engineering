# WB-NPC-001 Archive Pilot: World & Audio Implementation (P5)

**Status:** All automated engineering, audio, rendering, muxing, provenance, and baseline gates pass. **Visual and audio creative direction are NOT owner-approved:** human playback review and founder acceptance remain pending.

This document records the architecture, `templates/bridge/*` and `templates/audio/*` reuse, per-reference technique traceability, licensing boundaries, unapproved creative choices, and exact reproduction commands for the 12-second P5 technical demo (**"The Curious White Ball: Archive of Light"**, `EP-P5-ARCHIVE-PILOT`).

---

## 1. Pipeline Overview

```text
src/pilot/archive/episode.ts        single frame-time authority (360 frames, 30 fps, 12.000 s, 576,000 samples)
src/pilot/archive/audio-lock.ts     pictureHash() and timelineHash() lock between picture, manifest, and audio
        |
        +---> studio/scripts/emit-p5-manifest.ts
        |       writes .local/p5-white-ball/storyboard/{episode,scenes,audio-cues}.json
        |
        +---> studio/audio/archive_pilot_audio.py
        |       reuses templates/audio/{dsp,instruments,sfx_gen}.py -> stem_{music,sfx,ambience}.wav + mix.wav
        |
        +---> studio/src/pilot/{ArchiveHall,archivePaint,ArchiveScene}.ts(x)
        |       reuses templates/bridge/{build,paint,shade,ink,lensblur,grade,cast,toon}.ts + WhiteBallStage
        |
        +---> studio/scripts/render-p5.mjs
        |       renders WhiteBallArchivePilot_picture.mp4 (1080x1920, 30 fps, H.264, yuv420p, gl: swangle) + QA stills
        |
        +---> studio/scripts/mux-p5.ts
                verifies pictureHash + timelineHash, stream-copies H.264 + encodes 48 kHz stereo AAC -> WhiteBallArchivePilot.mp4
```

Nothing under `templates/**`, `references/**`, `SKILL.md`, `LICENSE`, or the P3 proof artifacts is modified.

---

## 2. Engine Reuse (`templates/bridge/*` and `src/npc/white-ball/*`)

| Module | Reused Symbols | Role in P5 Pilot |
|---|---|---|
| `templates/bridge/toon.ts` | `Pen` | Draws `WB-NPC-001` via `WhiteBallPen` onto the pooled character canvas |
| `templates/bridge/cast.ts` | `Pool`, `Actor`, `Fx`, `Place`, `FxPlace` | Manages pooled `CanvasTexture` allocation, `NOINK` actor card mesh, and floor contact shadow |
| `src/npc/white-ball/WhiteBallStage.ts` | `WhiteBallStage` | Poses `WB-NPC-001` through `Place -> Pool -> Actor` and `FxPlace -> Pool -> Fx`, enables `NOINK` on the camera, applies `whiteBallCardShade`, and adds `fog: false` so hall haze never greys the white body |
| `templates/bridge/build.ts` | `Batch`, `boxGeo`, `quad`, `lam`, `V` | Builds the static geometry batches of the stone archive hall, piers, shelves, gallery, lectern, and slate pedestal |
| `templates/bridge/paint.ts` | `ctex`, `rng`, `stoneHD`, `planksHD`, `beamHD` | Generates deterministic procedural canvas textures for stonework, timber beams, gallery planks, and (`archivePaint.ts`) book spines, indigo/gold square rug, brass, dusk window sky, light shafts, and abstract geometric glyphs |
| `templates/bridge/shade.ts` | `TONE`, `CHAR`, `untone` (via `lam`) | Applies two-tone warm-lit / cool-shade material shading to world geometry; extended non-destructively in `ArchiveHall.ts` (`withPools`) with 12 analytic point-light pools for warm wall lanterns and teal artifact light |
| `templates/bridge/ink.ts` | `InkPass`, `NOINK`, `noInkFallback` | Draws world-geometry outlines before DOF while keeping `WB-NPC-001`, sky, glows, and sub-pixel brass inlays on `NOINK` |
| `templates/bridge/lensblur.ts` | `LensBlur` | Two-pass thin-lens depth of field (`lens.pre`, `lens.main`) tracking `WB-NPC-001` depth (`focusDistance`) with `cInf` up to 13 px on close shots and 0 px on wide/reveal shots |
| `templates/bridge/grade.ts` | `GradeEffect`, `GradeParams` | Final colour grade after `BloomEffect` (threshold 1.0, emissives only) and `ToneMappingEffect(NEUTRAL)`, using `GRADE_ARCHIVE` so the dark interior is not over-lifted and the ball's white body and lavender crescent stay accurate |

**Intentionally not imported:** `templates/bridge/story.ts` and `templates/bridge/world.ts` (which hard-code the bridge environment and narrative), and human `cardShade()` zones on the NPC.

---

## 3. Original Audio Synthesis (`templates/audio/*`)

`studio/audio/archive_pilot_audio.py` generates a 12.000-second, 48 kHz, 2-channel (`576,000` samples/channel) soundtrack from the emitted manifest (`.local/p5-white-ball/storyboard/audio-cues.json`).

- **Reused modules:**
  - `templates/audio/dsp.py`: `SR`, `rng`, `ns`, `tt`, `dbg`, `lp`, `hp`, `pan`, `place`, `fades`, `st`, `widen`, `colored`, `smooth_noise`, `phase`, `make_ir`, `convolve_st`, `integrated`, `momentary`, `momentary_max`, `short_term`, `lra`, `true_peak`, `read_wav`, `write_wav`.
  - `templates/audio/instruments.py`: `m2f`, `pad`, `vibes`, `musicbox`, `glock`, `pluck`, `brass`, `timpani`, `triangle`.
  - `templates/audio/sfx_gen.py`: `whoosh`, `push_thump`, `breeze`, `creak`.
- **Excluded bridge-specific modules:** `timeline.py`, `sfx.py`, `music.py`, and `mix.py` (which hard-code `TOTAL = 2025` frames / 67.5 s, the 120 BPM Bb-major bridge march, and external `voice.wav` / `words.json` inputs).
- **Score & Cues:**
  - **Score (`stem_music.wav`):** 80 BPM (one 4/4 bar = 3.000 s = 90 frames = 1 scene), progressing from Dadd9 (`SC-001`) and E9/G# (`SC-002`) through B minor tension with soft timpani swell (`SC-003`) to a D major music-box and glockenspiel resolution (`SC-004`). Shares zero 4-interval melodic runs with the bridge march.
  - **SFX (`stem_sfx.wav`):** 20 frame-locked cues across 8 distinct event types (`hop_lift`, `hop_contact`, `wave_swish`, `artifact_chime`, `surprise_pop`, `release_bell`, `node_sparkle`, `camera_air`). Hop takeoff and contact frames are derived directly from `whiteBallPose(local, FPS, 'hop').lift` via `hopFrames()`.
  - **Ambience (`stem_ambience.wav`):** Seeded room air (`G.breeze` + low-passed coloured noise), subtle artifact harmonic hum modulated by `lightAt(frame)`, and two distant timber shelf creaks (`G.creak`).
  - **Master (`mix.wav`):** Summed stems with a 4x-oversampled look-ahead limiter targeting `-18.00 LUFS` integrated loudness (`-5.61 dBTP` true peak) and `voice: "none"`.

---

## 4. Reference Audit Traceability & Licensing Boundaries

All 67 files under `references/` (9 Markdown documents, 38 standalone stills in `references/frames/*.jpg`, and 20 contact sheets / 1,200 panels in `references/sheets/*.jpg`) were inventoried and inspected prior to scene construction. Full per-file data and PRIVATE / STUDY ONLY montages reside in git-ignored `.local/p5-white-ball/reference-audit/`.

| Source | Adopted Generic Technique | Prohibited Literal Content |
|---|---|---|
| `STYLE_BIBLE.md` | 1080x1920 vertical framing, holds with slow push-in, painted 3D world with flat 2D card character | Narrator script formula, burned-in word captions, channel jokes |
| `reports/CONTEXT.md` | Caption-band masking rule (50-90% height band) when measuring reference ink | Historical absent paths (`vids/`, `tx/`, `measure/`) and bridge story |
| `reports/motion.md` | Symmetric smootherstep camera glides (`glide()`), slow push-in on holds, blink over every expression swap | Humanoid walk/march cycles, hammer impacts, tourist crowd staging |
| `reports/depth.md` | Thin-lens DOF focused on `WB-NPC-001`, bloom (`luminanceThreshold: 1.0`) restricted to emissives, background haze | Bridge DOF/fog tables and traced compositions |
| `reports/textures.md` | Flat colour fields, half-contrast painted detail lines, coloured darks, procedural `stoneHD` / `planksHD` / `beamHD` | Reference background images, printed numerals, or text signage |
| `reports/characters.md` | General sprite integration in a 3D lit scene (soft shadow side, no rim light) | All humanoid anatomy, heads, torsos, legs, clothing, and faces; `.local/npc-reference/white-ball-npc-v1` is the sole character authority |
| `reports/lighting.md` | Two-tone warm key / blue-violet shade (`ARCHIVE_LIGHT`), separate floor contact shadow, analytic light pools | Humanoid `cardShade` head/torso bands on `WB-NPC-001` |
| `reports/outlines.md` | World `InkPass` before DOF, `NOINK` layer on character cards, sky, glows, and thin brass strips | Double outlines or card-border rectangles around `WB-NPC-001` |
| `reports/grade.md` | Gentle S-curve (`GRADE_ARCHIVE`), mild vignette, white-body and lavender-crescent preservation | Over-brightened bridge day/golden presets applied to a dark interior |
| `frames/*.jpg` & `sheets/*.jpg` | Value range, warm-vs-cool contrast, and camera scale pacing | Specific reference sets (`short03` button/plinth, `short11` emperor/dragons/vessel, `short15` arched red-carpet corridor, `short16`/`short17` neon aisles, `short20` concentric bulb room) |

**Licensing and Privacy Rules:**
1. Every rendered character in the pilot is an instance of `WB-NPC-001`.
2. Zero external image, video, audio, font, or 3D model files are loaded by the runtime (`tests/p5-provenance.test.ts` and browser trace `mapImages === 0`).
3. No burned-in captions or lettering exist anywhere in the rendered frames.
4. All generated WAVs, MP4s, stills, and reference-audit montages are written exclusively under git-ignored `.local/p5-white-ball/`.

---

## 5. Unapproved Visual & Creative Decisions (Pending Owner Review)

The following engineering choices satisfy the technical contract but require human playback and founder sign-off:
- **Set Architecture (`ArchiveHall.ts`):** Square stone piers, flat timber lintels, two-storey bookshelves with unlettered painted spines, an indigo/gold square rug, a three-tier slate pedestal, a floating faceted teal/gold icosahedron inside two brass rings, and an upper-hall abstract line/point constellation revealed in `SC-004`.
- **Lighting & Grade (`ARCHIVE_LIGHT`, `GRADE_ARCHIVE`):** Low raking warm window light (`#ffc48a`) against blue-violet shadow (`[0.3, 0.3, 0.56]`), `fog: false` on `WhiteBallStage`, and a gentle S-curve grade that keeps `WB-NPC-001`'s lit side near-white (median RGB `[244, 241, 241]`) and shadow crescent lavender.
- **Staging & Motion (`episode.ts`):** Offstage alcove entry in `SC-001`, `look-left` / `look-right` / `hop` / `wave` (`happy-closed`) in `SC-002`, artifact chime response + `surprised` (`react`) -> `anxious` in `SC-003`, and `sparkly-happy` (`idle` -> `float`) with constellation reveal and end fade in `SC-004`.
- **Soundtrack (`archive_pilot_audio.py`):** Instrumental 80 BPM score + 20 procedural SFX cues + room ambience (`voice: "none"`).

---

## 6. Exact Reproduction Commands

Run from `C:\Projects\claude-animated-shorts-engineering`:

```powershell
# 1. Environment & Python venv (scipy + numpy + Pillow in .local/p5-white-ball/.venv)
npm run p5:venv

# 2. Reference audit & inventory (writes .local/p5-white-ball/reference-audit/*)
npm run p5:audit

# 3. Storyboard & frame-time manifest (writes .local/p5-white-ball/storyboard/*.json)
npm run p5:manifest

# 4. Synthesize original stems & master mix + run audio QA (33 checks)
npm run p5:audio
npm run p5:audio:qa

# 5. TypeScript typecheck, unit/provenance/world tests (113 tests), and studio bundle build
npm run typecheck
npm test
npm run build

# 6. Render 360-frame picture MP4, diagnostic/comparison stills, and mux final MP4
npm run p5:video
npm run p5:stills
npm run p5:mux

# 7. Full decoded video/audio/pixel/provenance/baseline QA (writes .local/p5-white-ball/reports/video-qa.json)
npm run p5:qa

# 8. Optional determinism verification across sequential, parallel, and fresh-browser runs
npm run p5:repro
```
