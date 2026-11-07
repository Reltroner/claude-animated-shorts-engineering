/** WB-NPC-001 in world space: everything the 3D rig needs for one frame, as plain numbers.
 *
 * The action vocabulary and its timing stay in P3's WhiteBallPose: this file reads a WBPose and says what it means for a solid
 * object. Look actions become a real turn of the body (the eyes only lead it), hop, float and react become height above the floor,
 * squash stays on the contact point, and each hand gets a depth so that it floats clear of the body instead of lying on a card.
 *
 * Pure: no DOM, no three.js scene, no clock, no state between calls. Lengths are metres, +y up, the face looks along +z at yaw 0.
 */
import { DEFAULT_NPC_ID } from '../white-ball';
import { WB_HOP, assertWhiteBallExpression, assertWhiteBallPose, whiteBallPose, type WBAction, type WBExpression, type WBPose } from '../white-ball/WhiteBallPose';
import { WB_BODY, WB_HAND, WB_HAND_REST, WB_K } from '../white-ball/WhiteBallRig';
import { WB_SU } from '../white-ball/WhiteBallBridge';
import { WB3D_M, WB3D_SKIN } from './WhiteBall3DFace';

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

/** The measured P3 radii, in metres. Outer = the ink line's outside edge, which is what the P3 card's silhouette measured. */
export const WB3D_BODY = {
  ...WB3D_SKIN,
  outerA: WB_BODY.rx * WB3D_M,
  outerB: WB_BODY.ry * WB3D_M,
  outerC: WB_BODY.rx * WB3D_M,
} as const;
export const WB3D_HAND = {
  r: (WB_HAND.outerR - WB_HAND.outline) * WB3D_M,
  outerR: WB_HAND.outerR * WB3D_M,
} as const;

const GRAVITY = 9.81;
/** Metres of height per metre of P3 lift. P3's lift was measured on a screen with no gravity in it. The measured flight time stays, and
 *  the height becomes the one a thrown body really reaches in that time: g T^2 / 8. Timing, and so every sound cue, does not move. */
export const WB3D_LIFT_SCALE = (GRAVITY * WB_HOP.flight ** 2) / 8 / (WB_HOP.height * WB_SU);
/** a look action's full eyeShift in P3 (14 source px) turns the body this far */
export const WB3D_LOOK_YAW = (26 * Math.PI) / 180;
const LOOK_FULL_SHIFT = 14;
/** the share of eyeShift still drawn on the face: the eyes lead, the body does the rest */
const EYE_SHIFT_KEPT = 0.35;
/** hand centres stay this far from the body centre, in source px: they clear the outline by a hair at their rest height */
const HAND_REACH = 296;
const HAND_MIN_DEPTH = 70;
/** The hands hang free, so they follow a turn of the body only part of the way: at a full share, a quarter turn would swing one hand right across the face. */
const HAND_YAW_SHARE = 0.62;
/** smallest gap between a hand's ink and the body's ink, measured along the Minkowski ellipsoid. Hands never touch the body. */
export const WB3D_HAND_GAP = 0.006;

const qAxis = (x: number, y: number, z: number, a: number): Quat => { const s = Math.sin(a / 2); return [x * s, y * s, z * s, Math.cos(a / 2)]; };
export const qMul = (p: Quat, q: Quat): Quat => [
  p[3] * q[0] + p[0] * q[3] + p[1] * q[2] - p[2] * q[1],
  p[3] * q[1] - p[0] * q[2] + p[1] * q[3] + p[2] * q[0],
  p[3] * q[2] + p[0] * q[1] - p[1] * q[0] + p[2] * q[3],
  p[3] * q[3] - p[0] * q[0] - p[1] * q[1] - p[2] * q[2],
];
export const qRotate = (q: Quat, v: Vec3): Vec3 => {
  const [x, y, z, w] = q, [a, b, c] = v;
  const tx = 2 * (y * c - z * b), ty = 2 * (z * a - x * c), tz = 2 * (x * b - y * a);
  return [a + w * tx + y * tz - z * ty, b + w * ty + z * tx - x * tz, c + w * tz + x * ty - y * tx];
};

export type WhiteBall3DInput = Readonly<{
  expression: WBExpression;
  pose: WBPose;
  x: number; z: number;
  floorY?: number;
  /** radians about +y, facing +x when positive. On top of it the look actions add their own turn. */
  yaw?: number;
  /** the eyeShift the body's turn follows. Default pose.eyeShift. Pass a delayed value and the eyes lead while the body comes after them. */
  lookShift?: number;
  /** radians; positive looks down */
  pitch?: number;
  /** a tilt in world space: rotation about this horizontal axis, for leaning into a hop */
  tilt?: Readonly<{ axis: Vec3; angle: number }>;
  /** metres above the floor. Default: pose.lift through WB3D_LIFT_SCALE. */
  height?: number;
  /** extra squash factors on top of the pose's, about the contact point */
  stretch?: readonly [number, number];
  /** world-space offsets of the hands, for example their lag behind a moving body */
  handOffset?: Readonly<{ left: Vec3; right: Vec3 }>;
  mouthOpen?: number;
}>;

export type WhiteBall3DState = Readonly<{
  id: typeof DEFAULT_NPC_ID;
  expression: WBExpression;
  face: Readonly<{ eyeShift: number; blink: number; sweat: number; mouthOpen: number }>;
  floorY: number;
  /** the lowest point of the body, the pivot of the squash */
  contact: Vec3;
  squash: Vec3;
  /** the middle of the body in world space */
  centre: Vec3;
  /** the body's orientation. Depends only on the input, never on a camera. */
  quaternion: Quat;
  yaw: number;
  pitch: number;
  roll: number;
  handLeft: Vec3;
  handRight: Vec3;
  /** the three solid spheres, for occlusion and shadows: [cx, cy, cz, r] */
  occluders: readonly [readonly [number, number, number, number], readonly [number, number, number, number], readonly [number, number, number, number]];
}>;

/** P3's hand placement relative to the body centre, in source px with y down, including its roll and squash */
const handFlat = (rest: readonly [number, number], out: number, lift: number, rollRad: number, sx: number, sy: number) => {
  const lx = rest[0] + (Math.sign(rest[0]) * out) / WB_K, ly = rest[1] + lift / WB_K;
  const c = Math.cos(rollRad), s = Math.sin(rollRad);
  return { x: (lx * c - ly * s) * sx, y: (lx * s + ly * c) * sy };
};

export function whiteBall3DState(input: WhiteBall3DInput): WhiteBall3DState {
  const { expression, pose } = input;
  assertWhiteBallExpression(expression);
  assertWhiteBallPose(pose);
  for (const [k, v] of [['x', input.x], ['z', input.z]] as const) if (!Number.isFinite(v)) throw new Error(`White Ball 3D: ${k} is not finite`);

  const floorY = input.floorY ?? 0;
  const height = input.height ?? pose.lift * WB_SU * WB3D_LIFT_SCALE;
  if (!(height >= 0)) throw new Error('White Ball 3D: the body cannot go through the floor');
  const [ex, ey] = input.stretch ?? [1, 1];
  const sx = pose.sx * ex, sy = pose.sy * ey;

  const lookYaw = ((input.lookShift ?? pose.eyeShift) / LOOK_FULL_SHIFT) * WB3D_LOOK_YAW;
  const yaw = (input.yaw ?? 0) + lookYaw;
  const pitch = input.pitch ?? 0;
  const roll = (-pose.rollDeg * Math.PI) / 180; // canvas angles run clockwise on screen, about the axis pointing at the viewer
  let q: Quat = qMul(qMul(qAxis(0, 1, 0, yaw), qAxis(1, 0, 0, pitch)), qAxis(0, 0, 1, roll));
  if (input.tilt) { const [ax, ay, az] = input.tilt.axis; q = qMul(qAxis(ax, ay, az, input.tilt.angle), q); }

  const contact: Vec3 = [input.x, floorY + height, input.z];
  const centre: Vec3 = [input.x, contact[1] + WB3D_BODY.outerB * sy, input.z];

  // Hands: P3's x and y, and a depth that keeps them off the body. Their depth axis turns with the body.
  const rest = WB_HAND_REST[expression];
  const rollCanvas = (pose.rollDeg * Math.PI) / 180;
  const place = (flat: { x: number; y: number }, offset: Vec3 | undefined): Vec3 => {
    const z = Math.sqrt(Math.max(HAND_REACH * HAND_REACH - flat.x * flat.x - flat.y * flat.y, HAND_MIN_DEPTH * HAND_MIN_DEPTH));
    const lx = flat.x * WB3D_M, ly = -flat.y * WB3D_M, lz = z * WB3D_M;
    const cy = Math.cos(yaw * HAND_YAW_SHARE), sn = Math.sin(yaw * HAND_YAW_SHARE);
    let dx = lx * cy + lz * sn, dy = ly, dz = -lx * sn + lz * cy;
    if (offset) { dx += offset[0]; dy += offset[1]; dz += offset[2]; }
    // never into the body: scale out along the line through the centre, in the space where the clearance shape is a unit sphere
    const A = WB3D_BODY.outerA * sx + WB3D_HAND.outerR + WB3D_HAND_GAP, B = WB3D_BODY.outerB * sy + WB3D_HAND.outerR + WB3D_HAND_GAP;
    const rr = Math.hypot(dx / A, dy / B, dz / A);
    if (rr < 1) { const k = 1 / Math.max(rr, 1e-6); dx *= k; dy *= k; dz *= k; }
    return [centre[0] + dx, centre[1] + dy, centre[2] + dz];
  };
  const handLeft = place(handFlat(rest.left, pose.leftHandOut, pose.leftHandLift, rollCanvas, pose.sx, pose.sy), input.handOffset?.left);
  const handRight = place(handFlat(rest.right, pose.rightHandOut, pose.rightHandLift, rollCanvas, pose.sx, pose.sy), input.handOffset?.right);

  const bodyR = (WB3D_BODY.outerA + WB3D_BODY.outerB) / 2;
  return Object.freeze({
    id: DEFAULT_NPC_ID, expression,
    face: Object.freeze({ eyeShift: Math.round(pose.eyeShift * EYE_SHIFT_KEPT * 1000) / 1000 + 0, blink: pose.blink, sweat: pose.sweat, mouthOpen: input.mouthOpen ?? 1 }),
    floorY, contact, squash: [sx, sy, sx] as Vec3, centre, quaternion: q, yaw, pitch, roll, handLeft, handRight,
    occluders: [[centre[0], centre[1], centre[2], bodyR], [handLeft[0], handLeft[1], handLeft[2], WB3D_HAND.outerR], [handRight[0], handRight[1], handRight[2], WB3D_HAND.outerR]] as WhiteBall3DState['occluders'],
  });
}

/** One action played from its own time 0, placed on the floor: the shortest way to see what an action does in 3D. */
export function whiteBall3DAction(frame: number, fps: number, action: WBAction, expression: WBExpression = 'default', at: readonly [number, number] = [0, 0]): WhiteBall3DState {
  return whiteBall3DState({ expression, pose: whiteBallPose(frame, fps, action), x: at[0], z: at[1] });
}

/** the face's forward axis in world space */
export const whiteBall3DForward = (s: WhiteBall3DState): Vec3 => qRotate(s.quaternion, [0, 0, 1]);
