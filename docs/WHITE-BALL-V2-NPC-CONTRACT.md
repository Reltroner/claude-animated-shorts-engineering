# WB-NPC-001 — Main Default NPC Contract (V2, 2026-11-06)

**Status:** engineering proposal, neither production-approved nor ML-trained.
**Source:** `gemini_generated_video_df8deaea.mp4`, SHA256 `4fcd0b4dd28ba4fce72ae3a83df2162f4533a9c19a20220b1daf79707ecdae48`, exactly 240 decoded frames at 24 fps; 1280x720.
**Target:** a default *reusable character library* for future videos, but not forcibly inserted into every shot.

## Identity invariants
- White/off-white approximately round body, thick near-black outline, soft lavender shaded lower/right side.
- Two separate small circular white hands with black outlines; no visible arms, legs, clothes, nose or hair in default state.
- Two expressive eyes, rounded pink mouth, optional tears/sweat where the reference supports them.
- Separate oval floor shadow for grounded positions, not part of the body geometry.
- Maintain stable facial placements and proportions across seven expressions and frame-driven actions.
- Do not transplant human soldier/swing/bridge character proportions to this creature.
- Source video may contain artistic variations; manual visual matching chooses the canonical V2 constants.

## Default expressions
`default`, `happy-closed`, `wink`, `surprised`, `tired`, `anxious`, `sparkly-happy`.

## Default actions
`idle`, `hop`, `float`, `look-left`, `look-right`, `wave`, `react`.

## Reused engine modules
- `templates/bridge/toon.ts`: `Pen` drawing APIs, the 600x1000 design convention and Canvas2D textures.
- `templates/bridge/cast.ts`: `Place`, `Pool.req`, `Pool.flush`, `Actor` billboards, frame-dependent shared texture keys.
- `templates/bridge/world.ts`: how stages are inserted into a 3D scene and how the existing `Actor` pool is consumed; use as a read-only integration reference.
- `templates/bridge/ink.ts`: `NOINK` layer so sprite billboards do not acquire rectangular world outlines.
- `templates/bridge/cardshade.ts`: lighting rules to evaluate, NOT an identity guarantee; may need NPC-specific adaptation after visual tests.
- `templates/bridge/story.ts`: integer frame timebase and deterministic scene/screen camera logic; **do not** inherit specific 1831 bridge events as generic NPC behavior.
- `templates/audio/*`: sound synthesis/mix ideas; **do not** inherit bridge-specific cue tables as generic assets.
- `templates/scripts/short_qa.py`: frame QA reference; cannot stand in for expression and rig comparison.
- `references/*`: source's **third-party style-study references**, not approved canonical White Ball identity imagery.

## Source-of-truth precedence
Approved owner source/reference clip → WB-NPC-001 identity contract → Reltroner communication/canon governance → approved episodic action/scene plan → rendering config. The original bridge reference video and style reports are secondary technique sources, not replacement characters.

## Source re-use and rights
The video uploaded by the user is an internal engineering reference. Preserve original footage and decoded frames locally under `.local/` unless publishing permission is separately established. The public engineering repository already contains third-party reference images that source README restricts to style study; do not re-publish those as original White Ball works.

## Acceptance matrix
- **WB-01:** exactly two detached circular hands; no legs/arms.
- **WB-02:** 7 expressions exist, one consistent shape; transitions stable across frames.
- **WB-03:** at least 4 actions produce actual frame-dependent motion and reproducible frame equality.
- **WB-04:** source frame metadata 240, 24/1 fps, 1280x720, matching SHA256.
- **WB-05:** render a 2 s loop at 30 fps on 1080x1920; obtain 60 frames and technical QA.
- **WB-06:** compare at least 7 chosen frames side-by-side with render; founder visually accepts.
- **WB-07:** do not change `templates/bridge/*`, `references/*`, or `templates/audio/*` during P0/P1.
- **WB-08:** no paid AI/video API, no automatic GitHub push, no unattended publishing.

Status: P0 inspection and starter code exist; all user-machine installation, actual 3D visual acceptance, and video render tests remain pending.
