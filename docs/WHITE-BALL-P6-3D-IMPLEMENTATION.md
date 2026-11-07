# WB-NPC-001 in 3D: Archive Pilot Implementation (P6)

**Status:** see "What was measured" for the gate results. Visual and motion direction are **not** owner-approved. An agent can inspect frames and measure a film, but it cannot watch one play or hear it.

P5 drew the white ball on a screen-facing `CanvasTexture` card inside a real 3D hall, and it looked flat against the room. P6 replaces only the character, with a real lit sphere, a face made of geometry on its surface and two real hands. The story, the beats and the approved soundtrack are unchanged, and the P5 composition stays in place and renders as before.

## 1. How a frame is made

```text
src/pilot/archive/episode.ts      the P5 timeline, unchanged: beats, hops, blinks, light state, sound cues
        |
src/pilot/archive/episode3d.ts    the 3D staging on top: facing, real height, hand lag, camera arcs, focus
        |
src/npc/white-ball-3d/            the reusable character: WhiteBall3DPose -> WhiteBall3DFace -> WhiteBall3DRig
        |
studio/src/pilot/ArchiveWorld3D.ts   ties it to the hall: live shadow map, sphere occlusion, shared lights
studio/src/pilot/ArchiveScene3D.tsx  ArchiveHall + rig + the P5 post chain, inside @remotion/three's ThreeCanvas
        |
studio/scripts/render-p6.mjs      360 frames -> WhiteBallArchivePilot3D_picture.mp4
studio/scripts/mux-p6.ts          + the P5 mix.wav, unchanged -> WhiteBallArchivePilot3D.mp4
```

Remotion owns the clock: the frame number is the only input to the animation. The one `useFrame` in the scene tells the post composer to draw. It reads no delta and moves nothing.

## 2. The character

```text
root
|- squash        at the contact point; scales along world axes, so a landing flattens the ball whichever way it faces
|  `- pivot      at the body centre; carries the orientation
|     |- body    SphereGeometry 96 x 64, scaled to the measured ellipsoid, MeshStandardMaterial, roughness 0.8, metalness 0
|     |- ink     the same sphere, larger, drawn inside out: the outline is the real silhouette from any angle
|     `- face    triangles on the body's surface, no texture
|- hand-left     SphereGeometry 40 x 28, lit, with its own inside-out ink shell
`- hand-right    the same
```

- **Size.** The radii are the measured P3 values through the P3 scale: outer 0.458 m wide and 0.481 m tall, ink 0.028 m, hand outer radius 0.116 m. The body centre is one vertical radius above the floor at rest. The floor height is 10 mm so that the ink shell clears the rug, whose surface is 6 mm up.
- **Face.** The drawing is not rewritten. `WhiteBall3DFace.ts` runs P3's own `drawFace()` through the real `Pen` class against a context that records vectors instead of painting pixels. It tessellates each fill and stroke, then carries every vertex onto the ellipsoid by orthographic projection along the forward axis. So from straight ahead the mesh is the P3 drawing. From anywhere else it foreshortens, slides toward the limb and hides behind the body. It has all seven expressions, and it updates per frame only when the eyes, the blink, the sweat drop or the mouth actually change. The compile is pure, so a cache cannot make a frame depend on render order.
- **Painting order.** The face tests against depth but never writes it, so its triangles paint over one another in order, as they did on the canvas, and no layer can fight another for depth. Each triangle's edge is short enough that its chord sag stays under the face's small lift off the skin (a test checks this).
- **No cracks.** Each fill is watertight. The mesh keeps even triangles with no area in source pixels, because on the ball a thin triangle's middle corner bows off the chord, and removing it would open a crack that shows as a row of specks across a black pupil. It is drawn two-sided in one pass, so that such a sliver cannot be culled at a grazing angle. A test looks for edges with paint on both sides on every expression, and proves it can find one on a built T-junction.
- **Hands.** There are exactly two, detached. They keep P3's measured x and y. Their depth comes from a clearance rule that keeps them off the body. They follow a body turn at 62 %, because at full share a quarter turn would swing one across the face. A final check scales any hand position out of the body, so a hand can never pass through it.
- **Actions.** P3's `WBPose` still decides what happens and when. `WhiteBall3DPose.ts` says what it means for a solid object: look actions turn the whole body, and the eyes lead by the small share of `eyeShift` still drawn on the face. Hop, float and react become height above the floor. Wave moves the right hand along the clearance surface, so it swings in depth too.
- **Height.** P3's lift was measured on a screen. The measured flight time stays, and the height becomes what a thrown body reaches in that time, `g T² / 8` = 0.33 m. Takeoff and contact frames do not move, because scaling a curve does not move its zeros.
- **Follow-through.** Hands trail the body by an average over its recent path. This is not a simulation and it keeps no state, so frames can render in any order. Squash pivots on the contact point and returns to 1 between actions. The flight stretch is small and relaxes before landing.
- **No camera.** `update()` takes one state object. Nothing in the character reads a camera, so it cannot turn to face the lens by accident.

`assertGenuine3DCharacter()` throws on a plane, a sprite, a texture, a third hand or a missing sphere. The scene calls it when it builds the rig, and the tests prove it fails on those fakes.

## 3. The world

`ArchiveHall.ts` is P5's, with two names exported. `ArchiveWorld3D.ts` wraps its materials from outside:

| What | How it is made | Honest label |
|---|---|---|
| Sun shadow of the body and hands | three.js shadow map, 4096², refreshed every frame | **Real shadow map.** It falls where the window's light falls, so it is long, points at the camera and slides as the ball rises |
| Contact darkening | closed-form sphere occlusion per fragment, at the spheres' true positions | Analytic geometry, not a texture blob and not a shadow map |
| Shadow from the character's key light | closed-form sphere occlusion along the key direction | Analytic |
| Shadow in the artifact's light | the same, removing the artifact's light where the spheres block it | Analytic |
| Body lit by the world | the sun's `DirectionalLight`, a hemisphere light set from the hall's shade colour, and the hall's own light pools, read from the same uniforms and with the same formula, except that the artifact counts double on the body | Shared lights. The doubling is a look decision |
| Key light | a `DirectionalLight` on the body, and the same direction and colour at 30 % as a soft pool on the floor around the ball | The key follows the ball, as a film key would. That is a lighting decision, not physics |

**Why the world needs its own term for the key.** The hall's two-tone shader overwrites three.js's diffuse result on world surfaces, so a three.js light does not reach them. The term in `ArchiveWorld3D.ts` is what makes the key real on both.

**How bright the body gets.** The rig rolls its own radiance off above 0.86 and never passes 1 (`WB3D_PEAK`). P5's painted card sat below the bloom threshold of 1 by construction. A lit sphere does not: its bright side would otherwise reach well past it, and read the same on screen, while the bloom glowed across its black outline. Keeping it under 1 means the ball does not bloom, exactly as the card did, and the hall's own bloom is untouched. It also cleans the outline's anti-aliasing, because multisampling resolves before tone mapping and a very bright body turns partly covered edge pixels nearly white.

**Fitting the light.** The light numbers were fitted so that, through the unchanged post chain, the body lands near P5's measured values: near white on the lit side, lavender in the crescent. The key is warmish only because it adds to a violet ambient.

**Draw order.** The body, hands and ink are solid but sort with the transparent objects. The hall's additive light sheets draw in that queue and would otherwise add over an opaque body and turn its black ink brown. Those sheets therefore do not haze the ball. The ball is on the `NOINK` layer and draws its own outline, and the world's ink pass leaves it alone through the main depth buffer.

**Occlusion.** Occlusion is simply the depth buffer. When the ball comes out of the alcove, the pier really hides part of it.

## 4. The camera

Three deliberate moves, on arcs. The camera is an arm around a target (azimuth, elevation, distance), and blending those numbers rather than positions makes every move a curve through the room. Each move starts on one of P5's three `camera_air` sound cues, so every whoosh in the mix has a move under it.

1. **Opening, f0 to f72.** It sinks and pushes in slowly on the whole nave.
2. **Move one, f72 to f156.** One long arc down the left of the nave to a two-shot of the ball and the artifact, arriving as the ball starts to wave. During it, the aim leans toward the ball, smoothed so that the hops do not shake the frame.
3. **Move two, f168 to f210.** A short push in, as long as P5's, that takes the ball from 435 to 511 px wide before the surprise lands.
4. **Hold, f210 to f280.** The camera keeps drifting round toward the middle of the nave and closing in, so the background never stops sliding behind the ball.
5. **Move three, f280 to f352.** It pulls back first, then tilts up, so the ball stays in frame while the constellation appears.

Depth of field stays on the ball, with its focus plane just in front of the centre, so the face is the sharpest part.

## 5. The soundtrack

The P5 `mix.wav` is used as it is. `mux-p6.ts` runs the P5 lock (`assertAudioCurrent` against the live `timelineHash`), encodes with P5's AAC settings and copies the video stream. Nothing is synthesized or retimed. The P5 timeline has not moved, so every cue is on its P5 frame, and the ball leaves and touches the floor on the hop cues' frames.

P6 has its own lock for the picture. `picture3DHash` covers the staging and the text of every source that decides the character's pixels, and the mux refuses a picture rendered from anything else.

## 6. What stays, and what was only studied

**In use from this repository:** `templates/bridge/toon.ts` (`Pen`), `ink.ts`, `lensblur.ts`, `grade.ts`, and through `ArchiveHall.ts` also `build.ts`, `paint.ts`, `shade.ts`. From `src/npc/white-ball/`: the measured rig, the seven expressions and seven actions, `whiteBallPose`, `whiteBallSequence`, and `drawFace`. From P5: `ArchiveHall.ts`, `archivePaint.ts`, `episode.ts`, `audio-lock.ts` and `mix.wav`.

**Kept for P3 and P5, not used by P6:** `WhiteBallStage`, `WhiteBallCardShade`, `makeWhiteBallPlace`, `Pool`, `Actor`. A test fails if any of them enters the 3D path.

**The GrowKaz study material** has no licence, so it was read as reference only. None of its code was run, installed, imported or copied, and nothing from it is tracked. The concepts below are general practice, implemented here from three.js's documented API and this repository's own code:

| Concept seen in the study material | What P6 does instead, in its own code |
|---|---|
| A camera orbit driven by eased angle, radius and height | The camera arm in `episode3d.ts`, with per-key drift and a separate tilt window |
| Inside-out shells for an outline | The ink shells in `WhiteBall3DRig.ts`, on the measured P3 ink widths |
| A key light plus hemisphere light, with a shadow map | The hall's own sun and shade colour extended to the body |
| Preview at reduced size, then look at a contact sheet before the long render | `render-p6.mjs motion`, and the QA sheets |
| Character QC: grounded, readable, screen direction | Written as measured checks in `tests/visual/p6_video_qa.py` |

Its stick-figure rig, sets, shots, audio modules and style presets were not used. The PDF is a script-writing prompt with its own instructions to an assistant. It was treated as data and is not relevant to this 12-second film. The `three` 0.169.0 and `playwright` versions in its package file were ignored: this repository stays on three 0.187.0, Remotion 4.0.541 and React 19.3.1, and the lockfile has not changed.

## 7. Reproducing it

From the repository root, with `npm ci` done and the P5 audio present under `.local/p5-white-ball/audio/`:

```powershell
npm run typecheck
npm test
npm run build
npm run p6:manifest                   # .local/p6-white-ball/storyboard/
npm run p6:bench                      # per-frame cost, about 8 minutes
$env:WB_CONCURRENCY=6; npm run p6:video   # the picture, about 24 minutes in software GL
npm run p6:mux                        # the P5 mix.wav on top
npm run p6:stills                     # the QA stills, about 20 minutes
cd studio; node scripts/render-p6.mjs p5check; cd ..   # P5 rendered now, for the regression check, under a minute
npm run p6:repro                      # 26 frames in other orders and in a fresh browser, about 9 minutes
npm run p6:qa                         # every measured gate, and the inspection sheets
```

Short previews: `cd studio; node scripts/render-p6.mjs motion 120 179` renders a half-size clip. `node scripts/render-p6.mjs preview 226 look` renders a full-size still, and `WB_PROPS` adds debug props such as `{"orbitDeg":20}`.

All output goes under `.local/p6-white-ball/`, which git ignores. Every mode of `render-p6.mjs` bundles into one directory, so run them one at a time. Editing any source in `PICTURE_3D_SOURCES` makes the rendered picture stale, even for a comment: re-run `p6:manifest` and `p6:video`, and the mux will otherwise refuse.

## 8. Decisions for the owner

These are judgement calls, and the machine checks cannot settle them:

- The sun's shadow is long and strong, because the sun really is low and behind the ball. It is the most visible new thing in the frame.
- The outline stays at P3's measured thickness. On a solid ball, a thinner line would read as more 3D but less like the source.
- The hop is 2.5 times P3's height, from gravity. It reads as weight, and it is less like the source video's small hop.
- The hands sit well forward of the body, because that is the only way to keep P3's frontal position without touching it. In a strong turn one hand crosses the lower part of the body.
- The body's shading is a smooth Lambert falloff rather than P3's two-zone ramp, so the lavender is softer and wider.
- The film still reads as an inked cartoon world. It was not pushed toward realism.

## 9. What was measured

All of this comes from one machine, under software GL (SwiftShader through ANGLE), from the file `.local/p6-white-ball/renders/WhiteBallArchivePilot3D.mp4` and stills rendered from the same source. Nothing here is a claim about other hardware, and nothing here is a judgement of how the film looks in motion. `npm run p6:qa` prints all of it, as 90 checks, and all 90 pass.

| What | Result |
|---|---|
| Picture | H.264 High, yuv420p, 1080 x 1920, exactly 360 decoded frames, every frame interval 33.333 ms, 12.000 s |
| Soundtrack | One AAC LC stereo stream at 48 kHz. Byte-identical to the stream in the P5 video, so decoded PCM differs by exactly 0. Against `mix.wav`: lag 0 samples, correlation 0.99988. -18.0 LUFS, -5.6 dBFS true peak |
| Character, in the live scene | 1 sphere body, 96 x 64, `MeshStandardMaterial`; 2 sphere hands; 3 ink shells; 0 textures, 0 cards, 0 sprites |
| Curvature under a turn | Eye widths from the front: 113 and 110 px. Turned 30 degrees: 121 and 62 px, a ratio of 1.95 |
| Camera 40 degrees further round | The eye ratio reverses, from 1.64 to 0.82. The background changes by 40 to 51 levels. The shade on the ball moves by 10 to 12 % of its radius |
| Frontal match to the P3 drawing | Ink overlap (IoU) 0.81 to 0.89 across the seven expressions |
| Real shadow | 56,000 to 194,000 pixels darken when the ball appears. Draws into the shadow map on consecutive frames: 3, 6, 9, 12, so all three spheres, every frame. Raised off the same spot, the shadow's far edge moves 14 px toward the lens |
| Contact | The floor right under the ball darkens by 0.076 and 0.208 when grounded, and 0.001 mid-hop |
| Occlusion | At f62, 0 % of the ball's left part shows past the pier, and 99.6 % of its right part |
| Shared lights, by switching them off | Key off: body 16.9 levels darker, floor 5.5. Hemisphere off: body 100 levels darker. Sphere terms off: 14 levels around the ball, 0.004 at the top of the frame |
| Identity | Lit side 248, 244, 238, and crescent 186, 176, 196. P5's card measured 248, 248, 245 and 199, 190, 212, so the crescent is a little darker |
| Outline | The lightest the ink band gets, over 244 frames: median 2.8, worst 6.7 levels. Bloom adds 0.00 to 0.07 levels to it |
| Cracks | 0 open interior edges on every expression. Isolated specks in the close anxious beat: median 1 per frame, which is the thin gap where a pupil meets its lid |
| Motion | No frozen frame, no one-frame brightness pulse, largest frame change 5.7 times the median, at the reveal. The measured edge's error against the prediction changes by at most 1.16 px between frames |
| Camera speed | 35.4 px per frame at most, for fixed points in the hall. P5 peaked at 39.8 |
| Reproducibility | 26 frames byte-identical run sequentially, in parallel, in a fresh browser, and as separate stills in between other frames. The whole 360-frame picture, rendered twice from scratch: byte-identical, SHA-256 `e4bdc596...` |
| P5 | Fresh P5 stills byte-identical to P5's own. P5's QA passes 57/57 and its audio QA 33/33. P3 and P5 media and audio hashes unchanged |
| Tests | `npm test` 190/190, `npm run typecheck` and `npm run build` clean |

Per-frame cost at 1080 x 1920, on one page, in seconds. This is render time and has nothing to do with playback, which is 30 fps because the file says so. Six timed frames each, so differences under about 0.15 s are noise.

| Frames | Everything on | Shadow frozen | No sphere terms | No character | No ink | No lens blur | No bloom |
|---|---:|---:|---:|---:|---:|---:|---:|
| Close, f226 to f233 | 4.01 | 4.16 | 4.15 | 4.12 | 3.46 | 2.25 | 3.94 |
| Wide, f60 to f67 | 2.91 | 2.81 | 2.76 | 2.95 | 2.21 | 2.67 | 2.92 |

So the character, its live shadow and its sphere terms cost no more than the noise, and most of the frame goes to the post chain P5 already had. The full clip took 1,394 s at concurrency 6. Each page keeps the face meshes it builds: the whole film needs 86 of them, 38.5 MB of vertices at worst. JavaScript heap was 20 to 23 MB. Video memory has no meaning on a software renderer, so it was not measured.

**What inspection found that the checks had not.** The first full render passed all 184 tests of the time and its file checks, and the visual QA as then written had no check that could see what was wrong with it. It had three real faults: specks across the pupils from cracks in the face mesh, bloom glowing across the outline, and a sound cue at f168 with no camera move under it. All three came from looking at decoded frames at high zoom, side by side with P5. Each now has a test or a check, and that render is kept as a negative control, on which the same checks read 24.6 levels and 6 specks. Inspect at full resolution before believing the numbers here.

**Not settled by any of this.** How the film looks and feels in motion, and how it sounds against the picture. An agent cannot watch or hear it, so that needs the owner.
