# White Ball studio

A minimal Remotion app that renders WB-NPC-001 through the bridge engine: `Pen` → `Pool` → `CanvasTexture` → `Actor` → three.js → MP4. It needs no paid service, no API key and no asset pack.

Everything runs from the repository root. You need Node 22.12 or newer, plus Python 3 with numpy and Pillow for the QA scripts. FFmpeg must be on your PATH for QA.

```powershell
npm ci                  # install the exact locked versions
npm run typecheck       # strict TypeScript, including the protected templates this app imports
npm test                # unit and engine tests
npm run build           # bundle check
npm run compositions    # list the compositions
npm run studio          # open Remotion Studio to scrub and inspect
npm run render:all      # all stills, the MP4 and the reproducibility runs, about 3 minutes
npm run qa:compare      # the seven source-frame comparisons
npm run qa:shading      # the shading probe
npm run qa:visual       # the automated checks on real output, plus the inspection sheets
```

`qa:compare` and the source frames need the private reference under `.local/npc-reference/`. The first render downloads Remotion's pinned headless browser (131 MB) into `studio/node_modules/.remotion/`.

All output goes to `.local/p3-white-ball/`, which git ignores.

## Compositions

| Id | Size | Length | Use |
|---|---|---|---|
| `WhiteBallNpcTest` | 1080x1920, 30 fps | 60 frames | The first playable clip: hop, wave, float, react |
| `WhiteBallExpressions` | 1080x1920, 1 fps | 7 frames | One expression per frame, for reading each face |
| `WhiteBallInspect` | 1080x1920 or 1280x720 | 1 frame | Any expression and pose, set through props |

To render a single pose yourself, put its props in a JSON file:

```powershell
cd studio
New-Item -ItemType Directory -Force out
'{"expression":"wink","action":"wave","poseFrame":11,"poseFps":30,"layout":"vertical","shading":"npc"}' | Set-Content out/props.json -Encoding ascii
npx remotion still src/index.ts WhiteBallInspect out/wave.png --props=out/props.json
```

## Using the NPC in a scene

Pure code comes from `src/npc/white-ball/index.ts`. `WhiteBallStage.ts` needs a browser, because `cast.ts` creates a canvas when it loads, so import it only from a module Remotion loads lazily. `studio/src/Root.tsx` shows how, and `studio/src/scene/WhiteBallScene.tsx` is the smallest complete scene.

```ts
const state = whiteBallSequence(frame, fps, segments, { loop: true });
const pose = quantizeWhiteBallPose(state.pose);
stage.update({
  places: [makeWhiteBallPlace({ frame: 0, expression: state.expression, pose, x: 0, y: 0, z: 0, showShadow: false })],
  fx: [makeWhiteBallShadow({ x: 0, y: 0, z: 0, pose })],
}, camera);
```

Call `stage.update` during render, as `Bridge.tsx` does. `ThreeCanvas` draws from a passive effect, so the scene must be posed before then.

## Render settings that matter

- **`gl: 'swangle'`**: software WebGL. Output is byte-identical across runs. With `angle` on the GPU it was not. See `docs/WHITE-BALL-V2-P3-RUNTIME.md`.
- **`flat` on `ThreeCanvas`**: no tone mapping. R3F otherwise applies ACES, which greys the white body.
- **`resolution` on `makeWhiteBallPlace`**: keep it near one texel per output pixel. `WhiteBallScene` works it out from the camera rig. The default of 1200 x 2000 suits a character about 800 px wide on screen.
- **`WhiteBallStage` options**: `shading: 'npc'` keeps the painted colours, and `smoothEdge: true` gives a smooth silhouette.
