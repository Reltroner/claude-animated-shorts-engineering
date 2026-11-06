// The character drawn straight onto a DOM canvas through the Pen, with no three.js and no Actor. It uses the same screen
// mapping as WhiteBallScene, so the two can be subtracted pixel by pixel to show what the 3D path adds or damages.
// Diagnostic only: compositions under test never use it.
import React, { useLayoutEffect, useRef } from 'react';
import { Pen } from '../../../templates/bridge/toon';
import { WB_CARD, WB_SU, drawWhiteBallPose, type WBExpression, type WBPose } from '../../../src/npc/white-ball';
import { pixelsPerMetre, type WBCameraRig } from './rigs';

export const RawPenCanvas: React.FC<{
  width: number; height: number; rig: WBCameraRig; background: string; expression: WBExpression; pose: WBPose; showShadow?: boolean;
}> = ({ width, height, rig, background, expression, pose, showShadow = false }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const g = ref.current!.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = background;
    g.fillRect(0, 0, width, height);
    const ppm = pixelsPerMetre(rig, height), k = WB_SU * ppm;
    g.setTransform(k, 0, 0, k, width / 2 - (WB_CARD.w / 2) * k, height / 2 + rig.y * ppm - WB_CARD.groundY * k);
    drawWhiteBallPose(new Pen(g), expression, pose, { showShadow });
  }, [width, height, rig, background, expression, pose, showShadow]);
  return <canvas ref={ref} width={width} height={height} style={{ width, height, display: 'block' }} />;
};
