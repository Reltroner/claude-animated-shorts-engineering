# WB-NPC-001 runtime: engineering notes (P3)

**Status:** the runtime works and its automated checks pass. The look is **not approved**: owner review is still pending, and that decision belongs to P4.

For how to run it, see [`studio/README.md`](../studio/README.md). This document records the decisions and the measurements behind them.

## How the character reaches the screen

```text
WhiteBallSequence / WhiteBallPose   pure functions of frame and fps; time is frame / fps in seconds
        |
WhiteBallPen                        draws through the bridge Pen on the 600 x 1000 card
        |
WhiteBallBridge                     makeWhiteBallPlace() -> Place, makeWhiteBallShadow() -> FxPlace
        |
WhiteBallStage                      the Place -> Pool -> Actor lifecycle of world.ts, without the bridge world
        |
templates/bridge/cast.ts            real Pool, Actor, Fx; CanvasTexture; NOINK layer
        |
three.js + @remotion/three          studio/src/scene/WhiteBallScene.tsx
        |
Remotion                            WhiteBallNpcTest -> MP4
```

Nothing under `templates/`, `references/`, `SKILL.md` or `LICENSE` is modified.

## Decisions

### npm workspace at the repository root

`templates/bridge/*.ts` and `src/npc/*.ts` import `three` and `postprocessing`. Node looks for packages by walking up from the importing file, so it would never find `studio/node_modules`. A root workspace places one copy of each package in `node_modules/`, which every source file, the bundler, `tsc` and the tests all reach without aliases.

The alternatives were webpack aliases plus TypeScript `paths` plus test-runner settings, all of which have to be kept in step, or copies and junctions.

**Deviation from the planned layout:** the lockfile is `package-lock.json` at the root, not `studio/package-lock.json`, because npm keeps one lockfile per workspace root.

### Versions

| Package | Version | Why this one |
|---|---|---|
| `remotion`, `@remotion/*` | 4.0.541 | All pinned to the same version, as Remotion requires |
| `three`, `@types/three` | 0.187.0 | Newest that `postprocessing` accepts (`< 0.188`). `shade.ts` patches three's shader text and throws if it changes; those strings were checked and still match |
| `postprocessing` | 6.39.6 | Needed only because `cast.ts` imports `NOINK` from `ink.ts`, which imports `Pass` |
| `@react-three/fiber` | 9.8.2 | Needs React `>=19 <19.4` |
| `react`, `react-dom` | 19.3.1 | |
| `typescript` | 5.9.3 | Not 7.x: the 5.x line is what this ecosystem is tested with |
| `tsx` | 4.23.15 | Lets `node:test` run the TypeScript tests, including extensionless imports |

### Browser-only modules

`cast.ts` creates a canvas when it loads. `index.ts` therefore exports only code that is safe anywhere, `Root.tsx` loads compositions through `lazyComponent`, and the tests install a small fake `document` before importing `cast.ts`.

### NPC shading

`cardShade()` lights a card by fixed zones for a human, a head above v = 0.58 and a torso below it. On the ball that becomes a dark vertical band: measured under the bridge's day sun, the left half shifts by -36 luma and 60 % of the interior pixels change by more than 8 levels.

`whiteBallCardShade()` keeps the same lighting contract (scene tint, and shadow visibility through `LFB`) and drops only the human zones. Against the raw Pen drawing, the mean difference falls from 17.5 to 0.26 levels. It is set per material, so human cards keep their shader.

### Smooth silhouette

`Actor` cuts its card out at alpha 0.5, which leaves a stair-stepped outer edge. Alpha-to-coverage did not help in this setup. `smoothEdge` blends the texture's own soft alpha on the NPC's material instead.

This is a cost to check in a full world: blended cards draw after opaque geometry. It has not been tested inside a bridge-style post chain.

### Texture resolution follows the framing

A card canvas much larger than its size on screen is read from a smaller mip level, and that thins and softens every line: at 2 texels per pixel, eye rings measured 7.0 px against the source's 8.15. `WhiteBallScene` therefore sizes the canvas at about one texel per output pixel, which is the idea behind `tier()` in `cast.ts`.

The overlap scores did not show this, because they allow 3 px of tolerance. Comparing ink area and bounding box per feature did, and it also exposed a drawing-order bug that was splitting the brows in two. Use `tests/visual/wb_measure.py` that way when tuning the look.

### Floor shadow

The contract says the shadow is not part of the body, so it is a separate `Fx` multiply card lying on the floor. It darkens any background. Seen from about 8 degrees, the round card shows the source's 0.14 height-to-width ratio through perspective alone.

The starter's translucent painted shadow could never have worked, because `alphaTest` 0.5 erases anything under 50 % alpha. `drawWhiteBallPen` still paints an opaque one for plain 2D use.

### Software rendering by default

The same frame must give the same image. With `gl: 'angle'` on this machine's GPU (AMD, D3D11) it did not:

| Comparison under `angle` | Result |
|---|---|
| A page's first drawn frame vs the same frame later in a sequence | About 70,000 pixels differ, by up to 35 levels |
| Repeated runs with parallel tabs | 1-11 pixels differ, sporadically, in different frames each time |
| Forcing CPU canvas raster (`willReadFrequently`) | The first-frame difference stayed, so Canvas2D was not the cause |
| Giving each drawing a fresh GL texture | The first-frame difference went away, so GL texture re-upload is involved; the sporadic pixels remained |

With `gl: 'swangle'` and no workarounds, seven runs at concurrency 1 to 8 were byte-identical, at about 0.36 s per frame.

So `swangle` is the default, and `WB_GL=angle` still selects the GPU. The differences under `angle` are invisible to the eye, so a GPU render is usable when speed matters more than byte-exact output. The exact driver mechanism was not isolated further.

## What the source frames showed

Measured from all 240 frames by `tests/visual/measure_source.py`. The rig uses these numbers.

| Property | Measured |
|---|---|
| Body, outer | 459.7 x 482.4 px, height/width 1.05 |
| Outline | About 13.7 px at 50 % luma, near-black (3, 3, 3) |
| Hands | Outer radius 58 px, outline 10.8 px, **in front of** the body |
| Eye ring | 8.15 px at 50 % luma, outer 90 x 94 px |
| Mouth fill | (180, 115, 125), outer 104 x 65 px |
| Floor shadow | Half-width 197.5 px at rest, grey 176; narrows as the ball rises |
| Shading | Lit-sphere ramp around a point at (-0.246, -0.273) of the radii |
| Hop | Flight 0.46-0.79 s, peak 48-73 px, lift close to `1 - abs(1 - 2u)^2.4` |
| Squash | At most sx 1.03, sy 0.95, staying on the ground line |
| Rest | The body is still; only the hands sway, about 3.7 px over 1.4 s |
| Sweat drop | Appears at frame 135, full size by 141, then slides about 4 px per frame |

### The provisional expression ranges were slightly off

Checked by reading the frames. Transitions blend over a few frames, so boundaries are approximate.

| Expression | Provisional in the spec | Observed |
|---|---|---|
| `default` | 0-24 | 0-22 |
| `happy-closed` | 25-45 | 23-47 |
| `wink` | 46-77 | 48-78 |
| `surprised` | 78-107 | 79-108 |
| `tired` | 108-133 | 110-132 |
| `anxious` | 134-164 | 133-163 |
| `sparkly-happy` | 165-239 | 165-239 |

`docs/character-default-spec.json` still holds the provisional values. Correcting it is a decision for its owner.

### Things the source does that the rig deliberately does not

- **Slumped body in `tired` and `anxious`:** the source squashes about 1.6 % there. The rig keeps one body shape in every expression, as the contract asks, so these two show the largest outline differences.
- **Face lift during a hop:** around the top of a hop the source moves the whole face up about 5 px on the body. The rig keeps the face fixed.
- **Variant faces:** after frame 54 the wink rolls the whole ball and switches to a line mouth, and frame 160 shows a flat anxious mouth. The rig uses one canonical face per expression.

## Known limits

- The look is unapproved until the owner reviews it.
- `wave` has no source reference. The source never raises a hand, so its motion is an engineering choice.
- `look-left`, `look-right`, `float` and `react` are also designed from source measurements, not copied from a matching source action.
- The runtime has only been rendered in the isolated test scene, not in a bridge-style world with the ink and lens post chain.
- `THREE.Clock` deprecation warning: this comes from `@react-three/fiber`, is logged once per run, and has no effect on output. The runtime does not use a clock.
- Remotion's own license is free for individuals and for-profit organizations with up to 3 employees. Larger companies need a paid company license, so check this if that changes.
