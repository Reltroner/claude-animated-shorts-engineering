// The compositions load lazily: cast.ts touches `document` at module scope, and importing it only inside the lazy
// components keeps this file, and anything that reads the composition list, free of browser-only module side effects.
import React from 'react';
import { Composition } from 'remotion';
import { WB_EXPRESSIONS, whiteBallSequenceFrames } from '../../src/npc/white-ball';
import { WB_TEST_FPS, WB_TEST_HEIGHT, WB_TEST_SEGMENTS, WB_TEST_WIDTH } from './timeline';

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
