# P0–P3 Task-Scoped Engineering Prompt — White Ball Default NPC

Copy this entire prompt into the coding AI operating inside `C:\Projects\claude-animated-shorts-engineering` **only after** the V2 kit and video reference have been installed/extracted successfully.

~~~text
ROLE: Source-bound Remotion/Three.js engineer working on the existing
Reltroner/claude-animated-shorts-engineering repository.

ROOT: C:\Projects\claude-animated-shorts-engineering
REQUIREMENT: WB-NPC-001 is the reusable default MAIN NPC for future
Reltroner animated videos. The same canonical identity must survive
all expressions and actions. No foundation-model training is needed.

DISCOVERY FIRST (DO NOT GUESS):
1. Inspect git remote, active branch, status, files and tools.
2. Read SKILL.md, README.md, templates/bridge/toon.ts,
   templates/bridge/cast.ts, templates/bridge/world.ts,
   templates/bridge/cardshade.ts, templates/bridge/ink.ts,
   templates/bridge/story.ts, templates/audio/timeline.py,
   templates/scripts/short_qa.py, refs as applicable.
3. Read docs/WHITE-BALL-V2-NPC-CONTRACT.md,
   docs/WHITE-BALL-V2-ENGINEERING-RUNBOOK.md and
   src/npc/white-ball/*.ts, and .local extraction manifest.
4. Verify 240 frames and source SHA, and inspect sample frames.
5. Determine whether package.json, node_modules, installed Remotion,
   Three.js, Node 22, Python, ffmpeg/ffprobe and adequate disk exist.
   This repository's original baseline is a template library, not
   a runnable Remotion application. Confirm the actual state.

SOURCE AND SCOPE RULES:
- NEVER mutate historical templates/bridge/*, templates/audio/*,
  references/*, SKILL.md or the source repository during P0/P1.
- Original source video and frames belong in git-ignored .local/.
- Do not replace the preexisting engine with a parallel SVG-only engine.
- Use Pen (Canvas drawing), Place (stage contract), Pool (texture
  cache), Actor (3D billboard), NOINK layer and relevant cardShade
  behavior as existing integration points.
- The source bridge's 1831 story, character proportions, shots,
  hard-coded audio timing and Kenney object library are NOT required
  for a standalone White Ball test. Reuse technique, not content.
- No new paid API, recurring subscription, hosted rendering or
  voice cloning. No automatic GitHub commit/push or video publishing.
- No fake test evidence, no fabricated source licenses, no invented canon.

ENGINEERING SEQUENCE:
P0) Audit observed files, exact versions and baselines; note gaps.
P1) Validate WhiteBallPose.ts: pure deterministic frame math for
    7 expressions (controlled by drawing layer) and 7 actions.
    Validate frame 0 equals frame 0 across repeated renders.
P2) Evaluate WhiteBallPen.ts against selected true reference frames.
    Correct body ratio, contour, palette, eye geometry, hands,
    pink mouth, shadow, expression and timing. NEVER add limbs.
P3) Evaluate makeWhiteBallPlace() in a small stage using the original
    Pool/Actor pipeline. The existing cardShade assumes human head UV
    zones; explicitly compare its effect on White Ball and document
    any NPC-specific shading change before implementing.
P4) Only if dependencies are absent, propose/build a minimal isolated
    project scaffold under studio/ and pin compatible package versions.
    Do not assume the original repository root is executable.
P5) Render a 2-second/60-frame 30-fps 1080x1920 visual test with
    repeatable identity, clear expressions and multiple motions.
    Reuse the original QC helper after checking its requirements.
P6) Produce at least 7 reference vs generated still comparisons;
    log technical results, what is unverified, and human look approval.

PASS GATES:
- 240 source frames / SHA verified; no reference frames committed.
- Same WB-NPC-001 body + two detached hands across 7 expressions.
- Four actions have actual frame-varying pose without temporal noise.
- No arms, feet, clothing or other identity drift.
- Existing bridge/world/audio source files unchanged.
- 60-frame vertical output actually exists and passes ffprobe.
- Human founder approves the actual stills and output video.

STOP CONDITIONS:
- An existing target path would be overwritten.
- A paid or credential-requiring service is needed.
- Scene file source or asset rights are missing.
- A test is unavailable or an engine API differs from source assumptions.

REPORT:
Exact local changed paths and Git status; source evidence and SHA;
selected existing engine modules; typecheck/build/render log paths;
7 comparisons and mismatches; next narrow correction; human decisions
still pending. Do not claim completion from code generation alone.
~~~
