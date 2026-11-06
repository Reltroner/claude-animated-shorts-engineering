/** Adapter into the existing bridge-style Stage.places / Pool / Actor / NOINK pipeline.
 * This does not mutate templates/bridge/cast.ts or world.ts. A future scene
 * chooses when and where to append this place to its own Stage.
 * Type-only imports: this file stays loadable outside a browser, though cast.ts itself needs `document` at module scope.
 */
import type { FxPlace, Place } from '../../../templates/bridge/cast';
import type { Pen } from '../../../templates/bridge/toon';
import { WB_COLOR, WB_K, WB_SHADOW } from './WhiteBallRig';
import { drawWhiteBallPose, type WhiteBallParams } from './WhiteBallPen';
import {
  assertWhiteBallAction, assertWhiteBallExpression, assertWhiteBallPose, assertWhiteBallTime, quantizeWhiteBallPose, whiteBallPose, type WBPose,
} from './WhiteBallPose';

/** metres per design unit on the Actor card, same as SU in cast.ts (a test fails if the two ever differ) */
export const WB_SU = 0.00216;

/** canvas resolution for an actor: [canvas w, h, scale from the 600 x 1000 design], same contract as tier() in cast.ts */
export type WhiteBallResolution = [number, number, number];
export const WB_RESOLUTION: WhiteBallResolution = [1200, 2000, 2];

export type WhiteBallPlacement = WhiteBallParams & {
  x: number; y: number; z: number; scale?: number;
  resolution?: WhiteBallResolution;
};

function assertPlacement(a: { x: number; y: number; z: number; scale?: number }): void {
  const scale = a.scale ?? 1;
  if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || !Number.isFinite(a.z) || !Number.isFinite(scale) || scale <= 0) {
    throw new Error('Invalid WhiteBall world placement');
  }
}

/** pool key: expression + every pose value that changes pixels. The sweat phase only matters to the anxious face. */
export function whiteBallKey(expression: string, pose: WBPose, showShadow: boolean): string {
  const v = [pose.lift, pose.rollDeg, pose.sx, pose.sy, pose.leftHandLift, pose.rightHandLift, pose.leftHandOut, pose.rightHandOut, pose.eyeShift, pose.blink];
  if (showShadow) v.push(pose.shadowScale);
  if (expression === 'anxious') v.push(pose.sweat);
  return `WB-NPC-001|${expression}|${v.join(',')}|shadow:${showShadow}`;
}

export function makeWhiteBallPlace(a: WhiteBallPlacement): Place {
  const { frame, fps = 30, expression = 'default', action = 'idle', x, y, z, scale = 1, resolution = WB_RESOLUTION } = a;
  assertPlacement(a);
  assertWhiteBallExpression(expression);
  assertWhiteBallAction(action);
  assertWhiteBallTime(frame, fps);
  if (!resolution.every((v) => Number.isFinite(v) && v > 0)) throw new Error('Invalid WhiteBall texture resolution');
  if (a.pose) assertWhiteBallPose(a.pose);
  const showShadow = a.showShadow !== false;
  const pose = quantizeWhiteBallPose(a.pose ?? whiteBallPose(frame, fps, action));
  return {
    key: whiteBallKey(expression, pose, showShadow),
    x, y, z, scale, size: resolution,
    draw: (p) => drawWhiteBallPose(p, expression, pose, { showShadow }),
  };
}

const SHADOW_CANVAS = 512, SHADOW_R = 252;
const paintShadowBlob = (p: Pen) => {
  // multiply card: white leaves the ground alone, the ellipse darkens it
  const g = p.g, c = SHADOW_CANVAS / 2;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, SHADOW_CANVAS, SHADOW_CANVAS);
  p.ell(c, c, SHADOW_R, SHADOW_R, WB_COLOR.shadow, 0);
};

export type WhiteBallShadowPlacement = {
  x: number; y: number; z: number; scale?: number; pose: WBPose;
  /** floor direction away from the camera, for the small push that lets the ball overlap the ellipse. Default -z. */
  away?: readonly [number, number];
};

/** The floor shadow as a separate multiply card on the ground: the contract's "not part of the body geometry",
 * and the same Fx + blob route the bridge cast uses for contact shadows. It darkens any background. */
export function makeWhiteBallShadow(a: WhiteBallShadowPlacement): FxPlace {
  assertPlacement(a);
  assertWhiteBallPose(a.pose);
  const scale = a.scale ?? 1, s = quantizeWhiteBallPose(a.pose).shadowScale;
  // A floor circle seen from about 8 degrees shows the source's ry / rx = 0.14 by itself. It sits 0.2 m behind the card,
  // so it is drawn 5 % larger to keep the source's width on screen at the usual framing distance (3.2-3.7 m).
  const r = (WB_SHADOW.rx * WB_K * WB_SU * scale * 1.05 * (SHADOW_CANVAS / 2)) / SHADOW_R;
  const [ax, az] = a.away ?? [0, -1];
  const push = 0.2 * scale;
  return {
    key: 'blob|wb-npc-001-shadow', cw: SHADOW_CANVAS, ch: SHADOW_CANVAS, draw: paintShadowBlob,
    x: a.x + ax * push, y: a.y + 0.002, z: a.z + az * push,
    // the source's shadow narrows faster than it flattens as the ball rises; 1.08 matches its measured height at rest
    w: 2 * r * s, h: 2 * r * 1.08 * (0.25 + 0.75 * s), flat: true,
  };
}
