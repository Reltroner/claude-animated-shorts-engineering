// WhiteBallInspect: one parametric still, driven by inputProps. Any expression and action at any pose frame; either
// layout; the original cardShade, the NPC shading or the raw Pen drawing; and the negative controls.
// See studio/scripts/render-p3.mjs for how each kind of evidence uses it.
import React from 'react';
import { AbsoluteFill } from 'remotion';
import { quantizeWhiteBallPose, whiteBallPose, type WBAction, type WBExpression, type WBPose } from '../../../src/npc/white-ball';
import { RawPenCanvas } from '../scene/RawPenCanvas';
import { REFERENCE_RIG, VERTICAL_RIG } from '../scene/rigs';
import { WhiteBallScene, type WBSceneDebug } from '../scene/WhiteBallScene';
import { WB_TEST_BACKGROUND } from '../timeline';

export type WhiteBallInspectProps = {
  expression: WBExpression;
  action: WBAction;
  poseFrame: number;
  poseFps: number;
  layout: 'vertical' | 'reference';
  shading: 'npc' | 'card' | 'raw';
  background?: string;
  floorShadow?: boolean;
  /** partial pose over the action's pose, to match one source frame */
  poseOverride?: Partial<WBPose>;
  debug?: WBSceneDebug;
  label?: string;
};

export const inspectSize = (layout: WhiteBallInspectProps['layout']) => (layout === 'reference' ? { width: 1280, height: 720 } : { width: 1080, height: 1920 });

export const WhiteBallInspect: React.FC<WhiteBallInspectProps> = (props) => {
  const { width, height } = inspectSize(props.layout);
  const rig = props.layout === 'reference' ? REFERENCE_RIG : VERTICAL_RIG;
  const background = props.background ?? (props.layout === 'reference' ? '#ffffff' : WB_TEST_BACKGROUND);
  const pose = quantizeWhiteBallPose({ ...whiteBallPose(props.poseFrame, props.poseFps, props.action), ...props.poseOverride });
  return (
    <AbsoluteFill style={{ background }}>
      {props.shading === 'raw'
        ? <RawPenCanvas width={width} height={height} rig={rig} background={background} expression={props.expression} pose={pose} showShadow={props.floorShadow === true} />
        : <WhiteBallScene width={width} height={height} rig={rig} background={background} expression={props.expression} pose={pose}
            shading={props.shading} floorShadow={props.floorShadow !== false} debug={props.debug} label={props.label} />}
    </AbsoluteFill>
  );
};

export default WhiteBallInspect;
