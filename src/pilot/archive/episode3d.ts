/** The 3D staging of "The Curious White Ball: Archive of Light". It reads episode.ts and changes none of it: the same beats, the same
 * hops at the same frames, the same blinks and light state, so the approved P5 soundtrack still lands on the same picture events.
 * What is new here is only what a solid character needs on top: where the body faces, how high it really goes, how its hands
 * trail it, and a camera that moves through the hall on an arc.
 *
 * Pure functions of the frame: no clock, no randomness, no state between frames, no browser globals. Time is frame / fps.
 */
import { WB_HOP, WB_HOP_PERIOD, quantizeWhiteBallPose, whiteBallPose, type WBPose } from '../../npc/white-ball';
import { WB3D_BODY, WB3D_LIFT_SCALE, whiteBall3DState, type Vec3, type WhiteBall3DState } from '../../npc/white-ball-3d';
import { WB_SU } from '../../npc/white-ball';
import { BEATS, FPS, FRAMES, NPC_START, assertFrame, glide, npcAt, npcGroundAt, pictureForHash, project, type CamState, type Landing } from './episode';

export const EPISODE_3D = {
  id: 'EP-P6-ARCHIVE-PILOT-3D',
  title: 'The Curious White Ball: Archive of Light (3D)',
  status: 'TECHNICAL DEMO. Not canonical lore. Same story and soundtrack as EP-P5-ARCHIVE-PILOT, with a solid 3D character.',
  audioFrom: 'EP-P5-ARCHIVE-PILOT',
  voice: 'none',
} as const;

const rad = (d: number) => (d * Math.PI) / 180;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };

/** a value that holds at each key and glides between keys: velocity is zero at every key, so a track can stop and start without a jolt */
const track = (keys: readonly (readonly [number, number])[], f: number) => {
  if (f <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (f <= keys[i][0]) return keys[i - 1][1] + (keys[i][1] - keys[i - 1][1]) * glide((f - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0]));
  }
  return keys[keys.length - 1][1];
};

// ---------------------------------------------------------------- where the body faces, world degrees: 0 faces +z down the nave toward the near end, + turns toward +x
/** A look action adds its own 26 degrees on top of this (WB3D_LOOK_YAW). Kept within about 35 degrees of the camera on the beats where the face must read. */
export const YAW_KEYS: readonly (readonly [number, number])[] = [
  [36, 58], [58, 54], [74, 44], [90, 8], // hops out of the alcove heading across the nave, then turns to face the hall
  [122, 8], [136, 16], [150, 16], [160, 12], // to the mark, and waves toward the artifact on its right
  [180, 12], [190, -5], // as look-right blends in, the base backs off: the ball waits, eyes on the artifact
  [206, -5], [214, 6], // surprised: comes round to the lens
  [238, 6], [252, -12], // anxious: shies away from the light
  [270, -12], [284, 8], // sparkly: back toward the light
  [296, 8], [334, 2],
];
/** positive looks down */
export const PITCH_KEYS: readonly (readonly [number, number])[] = [
  [0, 0], [204, 0], [212, -5], // the surprise throws the face up a little
  [238, -3], [250, 8], // anxious: head down
  [270, 8], [282, -4],
  [296, -4], [332, -13], // follows the constellation up
];

const FLOAT_BEAT = BEATS.find((b) => b.action === 'float')!;
const IDLE_BEFORE_FLOAT = BEATS[BEATS.indexOf(FLOAT_BEAT) - 1];
/** frames over which the ball rises into its float. P3's 0.2 s blend would make this taller float a jump. */
export const FLOAT_RISE = 32;

/** every flight on the timeline, from the same formula npcGroundAt uses */
type Flight = { t0: number; t1: number; from: Landing; to: Landing };
const FLIGHTS: readonly Flight[] = (() => {
  const out: Flight[] = [];
  let pos = NPC_START;
  for (const b of BEATS) {
    (b.landings ?? []).forEach((to, i) => {
      const t0 = b.start + (i * WB_HOP_PERIOD + WB_HOP.anticipate) * FPS;
      out.push({ t0, t1: t0 + WB_HOP.flight * FPS, from: pos, to });
      pos = to;
    });
  }
  return out;
})();

/** Leans back as it gathers, into the hop in the air, and back upright after landing. Degrees, top of the ball toward the direction of travel. */
const leanAt = (f: number): { axis: Vec3; angle: number } | undefined => {
  for (const h of FLIGHTS) {
    if (f < h.t0 - 5 || f > h.t1 + 9) continue;
    const dx = h.to[0] - h.from[0], dz = h.to[1] - h.from[1], L = Math.hypot(dx, dz) || 1;
    const a = track([[h.t0 - 5, 0], [h.t0, -3.5], [h.t0 + (h.t1 - h.t0) * 0.5, 8], [h.t1, -3], [h.t1 + 9, 0]], f);
    return { axis: [dz / L, 0, -dx / L], angle: rad(a) };
  }
  return undefined;
};

/** The P3 pose for this frame, with one change: the float beat rises slowly. */
const poseAt = (f: number): WBPose => {
  const n = npcAt(f);
  if (f < FLOAT_BEAT.start) {
    // P3's hop cycle starts gathering for another hop at the end of a hop beat. On this timeline no hop follows, so the body should not twitch.
    const beat = BEATS.find((b) => f >= b.start && f < b.end)!;
    const squashes = beat.action === 'react' || (beat.action === 'hop' && f - beat.start < (beat.landings?.length ?? 0) * WB_HOP_PERIOD * FPS);
    return squashes ? n.pose : { ...n.pose, sx: 1, sy: 1 };
  }
  const local = f - FLOAT_BEAT.start;
  const floating = whiteBallPose(local, FPS, 'float');
  const w = smooth(local / FLOAT_RISE);
  const idle = whiteBallPose(f - IDLE_BEFORE_FLOAT.start, FPS, 'idle');
  const mix = (a: number, b: number) => a + (b - a) * w;
  return quantizeWhiteBallPose({
    ...floating,
    lift: mix(idle.lift, floating.lift), rollDeg: mix(idle.rollDeg, floating.rollDeg), rightHandLift: mix(idle.rightHandLift, floating.rightHandLift), leftHandLift: mix(idle.leftHandLift, floating.leftHandLift),
    rightHandOut: mix(idle.rightHandOut, floating.rightHandOut), leftHandOut: mix(idle.leftHandOut, floating.leftHandOut), blink: n.pose.blink,
  });
};

/** Body stretch along the vertical while moving fast through the air. Reversible, and small. */
const STRETCH = 0.03;
const heightAt = (f: number) => poseAt(Math.max(0, Math.min(FRAMES - 1, f))).lift * WB_SU * WB3D_LIFT_SCALE;
const MAX_HOP_SPEED = 0.1; // metres per frame at the fastest point of a hop, just off the floor; the stretch reads relative to it
const stretchAt = (f: number): readonly [number, number] => {
  const pose = poseAt(f);
  // P3's squash is measured on a hop a third as tall; half as much again suits the taller landing
  const sq = (v: number) => 1 + (v - 1) * 0.5;
  if (pose.lift <= 0) return [sq(pose.sx), sq(pose.sy)];
  const v = Math.abs(heightAt(f + 1) - heightAt(f - 1)) / 2;
  // it builds after takeoff and relaxes before touching down, so neither end of the flight is a jump in shape
  const flight = FLIGHTS.find((h) => f >= h.t0 - 1 && f <= h.t1 + 1);
  const relax = flight ? smooth((f - flight.t0) / 3) * smooth((flight.t1 - f) / 3) : 1;
  const s = STRETCH * Math.min(1, v / MAX_HOP_SPEED) * relax;
  return [sq(pose.sx) * (1 - s * 0.6), sq(pose.sy) * (1 + s)];
};

/** The ball rests a hair above the stone: the rug's surface is 6 mm up, and the ink shell must not dip through it. */
export const FLOOR_Y = 0.01;
const bodyCentre = (frame: number): Vec3 => {
  const f = Math.max(0, frame);
  const [x, z] = npcGroundAt(f);
  return [x, FLOOR_Y + heightAt(f) + WB3D_BODY.outerB, z];
};

/** The hands have no bones holding them, so they trail the body a little. An average over the body's recent path: not a simulation, and it keeps no state between frames. */
const LAG_FRAMES = 6;
const LAG_WEIGHTS = (() => { const w = Array.from({ length: LAG_FRAMES }, (_, j) => Math.exp(-(j + 1) / 2.4)); const s = w.reduce((a, b) => a + b, 0); return w.map((v) => (v / s) * 0.42); })();
const handLagAt = (f: number): Vec3 => {
  const c = bodyCentre(f);
  let x = 0, y = 0, z = 0;
  LAG_WEIGHTS.forEach((w, j) => { const p = bodyCentre(f - j - 1); x += w * (p[0] - c[0]); y += w * (p[1] - c[1]); z += w * (p[2] - c[2]); });
  return [x, y, z];
};

/** The body follows the eyes: its turn is the look's eyeShift averaged over the last frames, which also rounds the quick reversal between two look beats. */
const TURN_FRAMES = 11;
const lookShiftAt = (f: number) => {
  let s = 0, W = 0;
  for (let j = 0; j < TURN_FRAMES; j++) { const w = TURN_FRAMES - j; s += poseAt(Math.max(0, f - j)).eyeShift * w; W += w; }
  return s / W;
};

/** A mouth shape cannot morph into another one, so around a change of mouth it closes and reopens, inside the blink that already covers the eyes. */
const MOUTH_SWAPS = BEATS.filter((b, i) => i > 0 && mouthClass(b.expression) !== mouthClass(BEATS[i - 1].expression)).map((b) => b.start);
function mouthClass(e: string) { return e === 'surprised' ? 'o' : e === 'anxious' ? 'wave' : e === 'tired' ? 'line' : 'open'; }
const mouthOpenAt = (f: number) => {
  for (const s of MOUTH_SWAPS) {
    const d = f - s;
    if (d === -2 || d === 1) return 0.72;
    if (d === -1 || d === 0) return 0.4;
  }
  return 1;
};

/** the whole character for one frame */
export function npc3DAt(frame: number): WhiteBall3DState & Readonly<{ visible: boolean; beat: string; action: string; expressionBeat: string }> {
  assertFrame(frame);
  const n = npcAt(frame);
  const pose = poseAt(frame);
  const t = frame / FPS;
  const sway = 1.1 * Math.sin((2 * Math.PI * t) / 3.4); // the body is never quite still in its turn; a degree, slow
  const lag = handLagAt(frame);
  const state = whiteBall3DState({
    expression: n.expression, pose, x: n.x, z: n.z, floorY: FLOOR_Y,
    height: heightAt(frame),
    lookShift: lookShiftAt(frame),
    yaw: rad(track(YAW_KEYS, frame) + sway),
    pitch: rad(track(PITCH_KEYS, frame)),
    tilt: leanAt(frame),
    stretch: stretchAt(frame),
    handOffset: { left: lag, right: lag },
    mouthOpen: mouthOpenAt(frame),
  });
  return Object.freeze({ ...state, visible: n.visible, beat: n.beat, action: n.action, expressionBeat: n.expression });
}

// ---------------------------------------------------------------- camera: two deliberate moves, on arcs
/** A camera on an arm: it looks at `target` from `dist` metres at azimuth `az` (0 = from +z, negative = from -x) and elevation `el`.
 *  Blending these numbers instead of positions makes every move an arc through the room, with real parallax. */
export type Cam3DKey = Readonly<{
  id: string; frame: number;
  /** frames of the blend from the previous state. 0 = the first key. */
  dur: number;
  target: Vec3; az: number; el: number; dist: number; fov: number;
  /** slow drift while this key holds: degrees per frame around the target, degrees of elevation per frame, and a fraction of the distance per frame */
  daz?: number; del?: number; push?: number;
  /** the part of the blend, 0..1, in which target and elevation move: the lens can tilt later or earlier than the camera travels */
  tiltWindow?: readonly [number, number];
}>;

export const CAM3D_KEYS: readonly Cam3DKey[] = [
  // SC-001: the whole nave. It sinks and pushes in slowly; the ball comes out from behind the left pier.
  { id: 'CAM3D-1-ESTABLISH', frame: 0, dur: 0, target: [-0.15, 3.3, -8], az: -2.7, el: -3.2, dist: 19.5, fov: 44, del: -0.034, push: 0.0014, daz: -0.008 },
  // MOVE ONE: one long arc down the left of the nave to a two-shot of the ball and the artifact, arriving as the ball starts to wave. Starts on the first camera_air cue.
  { id: 'CAM3D-2-TO-THE-MARK', frame: 72, dur: 84, target: [-0.93, 1.08, -6.3], az: -12.9, el: -0.6, dist: 6.67, fov: 37, daz: 0.02, push: 0.0006 },
  // MOVE TWO: a short push in on the second camera_air cue, as long as P5's, to the close three-quarter view for the surprise. It then keeps drifting round
  // toward the middle of the nave and closing in, so the background never stops sliding behind the ball.
  { id: 'CAM3D-3-IN-CLOSE', frame: 168, dur: 42, target: [-0.93, 1.08, -6.3], az: -7.2, el: -0.6, dist: 5.5336, fov: 37, daz: 0.05, push: 0.0011 },
  // MOVE THREE: pulls back first, then tilts up, so the ball never drops out of the bottom of the frame. Starts on the last camera_air cue.
  { id: 'CAM3D-4-REVEAL', frame: 280, dur: 72, target: [-0.15, 4.3, -10], az: -3.4, el: -14.4, dist: 13.2, fov: 46, daz: 0.018, tiltWindow: [0.3, 1] },
];

export type Cam3DParams = Readonly<{ target: Vec3; az: number; el: number; dist: number; fov: number }>;

const keyParams = (k: Cam3DKey, f: number): Cam3DParams => {
  const dt = Math.max(0, f - k.frame);
  return { target: k.target, az: k.az + (k.daz ?? 0) * dt, el: k.el + (k.del ?? 0) * dt, dist: k.dist * Math.exp(-(k.push ?? 0) * dt), fov: k.fov };
};
const mixParams = (a: Cam3DParams, b: Cam3DParams, w: number, wTilt: number): Cam3DParams => ({
  target: [a.target[0] + (b.target[0] - a.target[0]) * wTilt, a.target[1] + (b.target[1] - a.target[1]) * wTilt, a.target[2] + (b.target[2] - a.target[2]) * wTilt],
  az: a.az + (b.az - a.az) * w, el: a.el + (b.el - a.el) * wTilt, dist: a.dist * (b.dist / a.dist) ** w, fov: a.fov + (b.fov - a.fov) * w,
});

export function camera3DParams(frame: number): Cam3DParams {
  assertFrame(frame);
  let cur = keyParams(CAM3D_KEYS[0], frame);
  for (let i = 1; i < CAM3D_KEYS.length; i++) {
    const k = CAM3D_KEYS[i];
    if (frame < k.frame) break;
    const u = (frame - k.frame) / k.dur, [t0, t1] = k.tiltWindow ?? [0, 1];
    cur = mixParams(cur, keyParams(k, frame), glide(u), glide((u - t0) / (t1 - t0)));
  }
  return cur;
}

const fromParams = (p: Cam3DParams): CamState => {
  const az = rad(p.az), el = rad(p.el);
  return {
    pos: [p.target[0] + p.dist * Math.sin(az) * Math.cos(el), p.target[1] + p.dist * Math.sin(el), p.target[2] + p.dist * Math.cos(az) * Math.cos(el)],
    look: p.target, fov: p.fov,
  };
};

/** During the long move the operator keeps the ball in the picture: the aim leans toward where the ball is going, smoothed so the hops do not shake the frame.
 *  It only changes where the lens points, not where the camera is. */
export const FOLLOW = { in: [80, 106], out: [128, 158], weight: 0.72, height: 0.55 } as const;
const followAt = (f: number) => smooth((f - FOLLOW.in[0]) / (FOLLOW.in[1] - FOLLOW.in[0])) * (1 - smooth((f - FOLLOW.out[0]) / (FOLLOW.out[1] - FOLLOW.out[0]))) * FOLLOW.weight;

export function camera3DAt(frame: number): CamState {
  const c = fromParams(camera3DParams(frame));
  const k = followAt(frame);
  if (k <= 0) return c;
  const g = keyPoolCentreAt(frame);
  return { ...c, look: [c.look[0] + (g[0] - c.look[0]) * k, c.look[1] + (FOLLOW.height - c.look[1]) * k, c.look[2] + (g[2] - c.look[2]) * k] };
}

/** The same frame seen from further round the character: yaw it about the vertical through the ball, for QA stills that prove volume. */
export function orbitedCamera(c: CamState, around: Vec3, degrees: number): CamState {
  const a = rad(degrees), s = Math.sin(a), k = Math.cos(a);
  const turn = (p: Vec3): Vec3 => { const dx = p[0] - around[0], dz = p[2] - around[2]; return [around[0] + dx * k + dz * s, p[1], around[2] - dx * s + dz * k]; };
  return { pos: turn(c.pos), look: turn(c.look), fov: c.fov };
}

/** the body on screen, in output pixels */
export function npc3DScreenBox(frame: number, cam: CamState = camera3DAt(frame)) {
  const s = npc3DAt(frame);
  const c = project(cam, s.centre);
  const ppm = (1920 / (2 * Math.tan((cam.fov * Math.PI) / 360))) / c.depth;
  const hw = WB3D_BODY.outerA * s.squash[0] * ppm, hh = WB3D_BODY.outerB * s.squash[1] * ppm;
  return { x0: c.x - hw, y0: c.y - hh, x1: c.x + hw, y1: c.y + hh, cx: c.x, cy: c.y, ppm, depth: c.depth };
}

/** Where sunlight lands behind a point, for checking the real shadow-map shadow in a render. y = floor height. */
export function shadowOnFloor(point: Vec3, towardSun: Vec3, y = 0): Vec3 {
  const t = (point[1] - y) / towardSun[1];
  return [point[0] - towardSun[0] * t, y, point[2] - towardSun[2] * t];
}

// ---------------------------------------------------------------- lens
/** thin-lens blur for lensblur.ts; cInf = blur-disc radius in px for things at infinity. It is only ever background blur: see focus3DAt. */
export const DOF3D_KEYS: readonly (readonly [number, number])[] = [[0, 0], [96, 0], [150, 8], [210, 11], [282, 11], [330, 0], [359, 0]];
/** the focus plane sits this share of the radius in front of the ball's centre: the face is sharpest and the silhouette stays under a pixel of blur */
const ballFrontShare = 0.45;
export function dof3DAt(frame: number): { cInf: number; focusDistance: number } {
  assertFrame(frame);
  const box = npc3DScreenBox(frame);
  return { cInf: track(DOF3D_KEYS, frame), focusDistance: Math.max(0.3, box.depth - WB3D_BODY.outerA * ballFrontShare) };
}

/** Where the character's key light is centred on the floor: under the ball, with the ball's hops smoothed out so the pool of light glides. */
export function keyPoolCentreAt(frame: number): Vec3 {
  assertFrame(frame);
  let x = 0, z = 0, W = 0;
  for (let d = -20; d <= 20; d++) {
    const w = 21 - Math.abs(d);
    const [gx, gz] = npcGroundAt(Math.max(0, Math.min(FRAMES - 1, frame + d)));
    x += gx * w; z += gz * w; W += w;
  }
  return [x / W, 0, z / W];
}

/** What this staging depends on, on top of the P5 picture timing. A rendered P6 picture is tied to this. */
export function picture3DForHash() {
  return {
    p5: pictureForHash(), episode: EPISODE_3D.id, liftScale: WB3D_LIFT_SCALE, floatRise: FLOAT_RISE, turnFrames: TURN_FRAMES,
    yaw: YAW_KEYS, pitch: PITCH_KEYS, cameras: CAM3D_KEYS, dof: DOF3D_KEYS,
  };
}
