// WhiteBallNpcTest: the first playable clip. 1080 x 1920, 30 fps, 60 frames, four action segments.
import React from 'react';
import { AbsoluteFill, getInputProps, useCurrentFrame, useVideoConfig } from 'remotion';
import { quantizeWhiteBallPose, whiteBallSequence } from '../../../src/npc/white-ball';
import { VERTICAL_RIG } from '../scene/rigs';
import { WhiteBallScene } from '../scene/WhiteBallScene';
import { WB_TEST_BACKGROUND, WB_TEST_SEGMENTS } from '../timeline';

export const WhiteBallTest: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const state = whiteBallSequence(frame, fps, WB_TEST_SEGMENTS, { loop: true });
  const trace = (getInputProps() as { trace?: boolean }).trace === true;
  return (
    <AbsoluteFill style={{ background: WB_TEST_BACKGROUND }}>
      <WhiteBallScene
        width={width} height={height} rig={VERTICAL_RIG} background={WB_TEST_BACKGROUND}
        expression={state.expression} pose={quantizeWhiteBallPose(state.pose)}
        debug={{ trace }} label={`f${frame}|${state.action}`}
      />
    </AbsoluteFill>
  );
};

export default WhiteBallTest;
