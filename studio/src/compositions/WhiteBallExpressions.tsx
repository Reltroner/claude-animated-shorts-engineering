// WhiteBallExpressions: all seven expressions, one per frame at 1 fps, so each can be read in Remotion Studio or rendered
// as a still without rushing through the 2 s clip. Rest pose throughout, so only the face and hand rest positions change.
// The sweat phase is held where the drop is full size; at phase 0 it has only just appeared.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { WB_EXPRESSIONS, quantizeWhiteBallPose, whiteBallPose } from '../../../src/npc/white-ball';
import { VERTICAL_RIG } from '../scene/rigs';
import { WhiteBallScene } from '../scene/WhiteBallScene';
import { WB_TEST_BACKGROUND } from '../timeline';

export const WhiteBallExpressions: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: WB_TEST_BACKGROUND }}>
      <WhiteBallScene
        width={width} height={height} rig={VERTICAL_RIG} background={WB_TEST_BACKGROUND}
        expression={WB_EXPRESSIONS[frame % WB_EXPRESSIONS.length]} pose={quantizeWhiteBallPose({ ...whiteBallPose(0, 30, 'idle'), sweat: 0.41 })}
      />
    </AbsoluteFill>
  );
};

export default WhiteBallExpressions;
