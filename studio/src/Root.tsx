// The compositions load lazily: cast.ts touches `document` at module scope, and importing it only inside the lazy
// components keeps this file, and anything that reads the composition list, free of browser-only module side effects.
import React from 'react';
import { Composition } from 'remotion';
import { WB_EXPRESSIONS, whiteBallSequenceFrames } from '../../src/npc/white-ball';
import { FPS as PILOT_FPS, FRAMES as PILOT_FRAMES, HEIGHT as PILOT_HEIGHT, WIDTH as PILOT_WIDTH } from '../../src/pilot/archive/episode';
import { WB_TEST_FPS, WB_TEST_HEIGHT, WB_TEST_SEGMENTS, WB_TEST_WIDTH } from './timeline';
import { P7B_LANDSCAPE, P7B_PREVIEW, P7B_PROOF_FRAMES } from '../../src/production/nations/proofTimeline';

type InspectLayout = 'vertical' | 'reference';
const inspectDefaults = {
  expression: 'default', action: 'idle', poseFrame: 0, poseFps: 30, layout: 'vertical', shading: 'npc',
} as const;

export const Root: React.FC = () => (
  <>
    <Composition
      id="WhiteBallNpcTest"
      lazyComponent={() => import('./compositions/WhiteBallTest')}
      durationInFrames={whiteBallSequenceFrames(WB_TEST_FPS, WB_TEST_SEGMENTS)}
      fps={WB_TEST_FPS} width={WB_TEST_WIDTH} height={WB_TEST_HEIGHT}
    />
    <Composition
      id="WhiteBallExpressions"
      lazyComponent={() => import('./compositions/WhiteBallExpressions')}
      durationInFrames={WB_EXPRESSIONS.length}
      fps={1} width={WB_TEST_WIDTH} height={WB_TEST_HEIGHT}
    />
    <Composition
      id="WhiteBallArchivePilot"
      lazyComponent={() => import('./compositions/WhiteBallArchivePilot')}
      durationInFrames={PILOT_FRAMES}
      fps={PILOT_FPS} width={PILOT_WIDTH} height={PILOT_HEIGHT}
    />
    <Composition
      id="WhiteBallArchivePilot3D"
      lazyComponent={() => import('./compositions/WhiteBallArchivePilot3D')}
      durationInFrames={PILOT_FRAMES}
      fps={PILOT_FPS} width={PILOT_WIDTH} height={PILOT_HEIGHT}
    />
    <Composition
      id="WhiteBallArchivePilot3DPreview"
      lazyComponent={() => import('./compositions/WhiteBallArchivePilot3D')}
      durationInFrames={PILOT_FRAMES}
      fps={PILOT_FPS} width={PILOT_WIDTH / 2} height={PILOT_HEIGHT / 2}
    />
    <Composition
      id="CountryballLandscapeProof"
      lazyComponent={() => import('./compositions/CountryballLandscapeProof')}
      durationInFrames={P7B_PROOF_FRAMES}
      fps={P7B_LANDSCAPE.fps} width={P7B_LANDSCAPE.width} height={P7B_LANDSCAPE.height}
    />
    <Composition
      id="CountryballLandscapeProofPreview"
      lazyComponent={() => import('./compositions/CountryballLandscapeProof')}
      durationInFrames={P7B_PROOF_FRAMES}
      fps={P7B_PREVIEW.fps} width={P7B_PREVIEW.width} height={P7B_PREVIEW.height}
    />
    <Composition
      id="WhiteBallInspect"
      lazyComponent={() => import('./compositions/WhiteBallInspect')}
      durationInFrames={1}
      fps={WB_TEST_FPS} width={WB_TEST_WIDTH} height={WB_TEST_HEIGHT}
      defaultProps={inspectDefaults}
      calculateMetadata={({ props }) => (
        (props as { layout?: InspectLayout }).layout === 'reference'
          ? { width: 1280, height: 720 }
          : { width: WB_TEST_WIDTH, height: WB_TEST_HEIGHT }
      )}
    />
  </>
);
