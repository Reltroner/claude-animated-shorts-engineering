/** WB-NPC-001 deterministic motion state. No React, network, clock or random dependence.
 * Time is always frame / fps in seconds, so the same motion plays at 24, 30 or 60 fps.
 * Timing and amplitudes come from the source video (tests/visual/measure_source.py):
 *  - flights last 0.46-0.79 s and peak at 48-73 px; the lift curve fits 1 - |1 - 2u|^2.4 closely,
 *  - squash peaks at sx 1.03, sy 0.95 and stays on the ground line,
 *  - hands travel out and up with the lift and settle over about 0.25 s after landing,
 *  - at rest the body is still and only the hands sway: about +-3.7 px with a 1.4 s period.
 * Pose lengths are in 600 x 1000 design units. Positive lift = up; hand lift < 0 = up; hand out > 0 = away from the body.
 */
import { WB_SWEAT_PERIOD } from './WhiteBallRig';

export const WB_EXPRESSIONS = ['default', 'happy-closed', 'wink', 'surprised', 'tired', 'anxious', 'sparkly-happy'] as const;
export const WB_ACTIONS = ['idle', 'hop', 'float', 'look-left', 'look-right', 'wave', 'react'] as const;
export type WBExpression = (typeof WB_EXPRESSIONS)[number];
export type WBAction = (typeof WB_ACTIONS)[number];
export type WBPose = Readonly<{
  lift: number; rollDeg: number; sx: number; sy: number;
  rightHandLift: number; leftHandLift: number; rightHandOut: number; leftHandOut: number;
  eyeShift: number; shadowScale: number; blink: number;
  /** 0..1 phase of the sweat drop's slide; only the anxious expression draws it */
  sweat: number;
}>;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const smooth = (x: number) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };
const TAU = Math.PI * 2;

export function assertWhiteBallTime(frame: number, fps: number): void {
  if (!Number.isInteger(frame) || frame < 0) throw new Error('frame must be a non-negative integer');
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('fps must be positive');
}
export function assertWhiteBallAction(action: WBAction): void {
  if (!(WB_ACTIONS as readonly string[]).includes(action)) throw new Error(`Unknown White Ball action: ${String(action)}`);
}
export function assertWhiteBallExpression(expression: WBExpression): void {
  if (!(WB_EXPRESSIONS as readonly string[]).includes(expression)) throw new Error(`Unknown White Ball expression: ${String(expression)}`);
}

/** floor shadow width against lift, fitted to the source: rx = 197.5 - 0.7 * lift_px */
export const whiteBallShadowScale = (lift: number) => clamp(1 - lift * 0.00385, 0.6, 1);

export const WB_HOP = { anticipate: 0.12, flight: 0.52, land: 0.24, height: 62 } as const;
export const WB_HOP_PERIOD = WB_HOP.anticipate + WB_HOP.flight + WB_HOP.land;

/** Eye blink once every 3.8 s, about five frames at 30 fps. It is drawn by the Pen (see drawEyes in WhiteBallPen.ts). */
const blinkAt = (t: number) => clamp(1 - Math.abs((t % 3.8) - 3.1) / 0.075, 0, 1);
const sweatAt = (t: number) => (t % WB_SWEAT_PERIOD) / WB_SWEAT_PERIOD;

export function whiteBallPose(frame: number, fps: number, action: WBAction): WBPose {
  assertWhiteBallTime(frame, fps);
  const t = frame / fps;
  let lift = 0, rollDeg = 0, sx = 1, sy = 1, rightHandLift = 0, leftHandLift = 0, rightHandOut = 0, leftHandOut = 0, eyeShift = 0;
  switch (action) {
    case 'idle': {
      // the body holds still in the source's rest spans; the hands breathe
      const s = Math.sin((TAU * t) / 1.4);
      leftHandOut = rightHandOut = 3.4 * s;
      leftHandLift = rightHandLift = 2.5 * s;
      break;
    }
    case 'hop': {
      const { anticipate: a, flight: f, land: l, height: H } = WB_HOP;
      const c = t % WB_HOP_PERIOD;
      let handK = 0;
      if (c < a) {
        const u = smooth(c / a);
        sy = 1 - 0.03 * u; sx = 1 + 0.02 * u;
      } else if (c < a + f) {
        const u = (c - a) / f;
        lift = H * (1 - Math.pow(Math.abs(1 - 2 * u), 2.4));
        const release = 1 - smooth(u / 0.15);
        sy = 1 - 0.03 * release; sx = 1 + 0.02 * release;
        handK = lift / H;
      } else {
        const u = clamp((c - a - f) / l, 0, 1);
        const landing = Math.sin(Math.PI * u) * (1 - 0.35 * u);
        sy = 1 - 0.035 * landing; sx = 1 + 0.025 * landing;
        handK = 1 - smooth(u);
      }
      leftHandOut = rightHandOut = 17 * handK;
      leftHandLift = rightHandLift = -17 * handK;
      break;
    }
    case 'float': {
      lift = 44 + 14 * Math.sin(t * 2.5);
      rollDeg = 1.4 * Math.sin(t * 1.5);
      const lag = Math.sin(t * 2.5 - 0.6);
      leftHandOut = rightHandOut = 15 + 3 * lag;
      leftHandLift = rightHandLift = -16 - 3 * lag;
      break;
    }
    case 'look-left':
    case 'look-right': {
      const dir = action === 'look-left' ? -1 : 1;
      const e = smooth(t / 0.25);
      eyeShift = dir * 14 * e + 0; // + 0 folds -0 into 0
      rollDeg = dir * 2.5 * e + 0.35 * Math.sin(t * 2.2) * e;
      const s = Math.sin((TAU * t) / 1.4);
      leftHandOut = rightHandOut = 3.4 * s;
      leftHandLift = rightHandLift = 2.5 * s;
      break;
    }
    case 'wave': {
      const e = smooth(t / 0.16);
      const w = Math.sin(t * 14);
      rightHandLift = (-118 + 7 * w) * e;
      rightHandOut = (6 + 16 * w) * e;
      leftHandLift = 2.5 * Math.sin((TAU * t) / 1.4);
      rollDeg = (-1.2 + 1.6 * Math.sin(t * 7)) * e;
      break;
    }
    case 'react': {
      const u = t % 1.2;
      const pulse = u < 0.06 ? smooth(u / 0.06) : Math.exp(-(u - 0.06) / 0.16);
      lift = 30 * pulse;
      sx = 1 - 0.015 * pulse; sy = 1 + 0.02 * pulse;
      leftHandOut = 26 * pulse; rightHandOut = 28 * pulse;
      leftHandLift = -30 * pulse; rightHandLift = -34 * pulse;
      break;
    }
    default: throw new Error(`Unknown White Ball action: ${String(action)}`);
  }
  return Object.freeze({
    lift, rollDeg, sx, sy, rightHandLift, leftHandLift, rightHandOut, leftHandOut, eyeShift,
    shadowScale: whiteBallShadowScale(lift), blink: blinkAt(t), sweat: sweatAt(t),
  });
}

/** Every pose value on a fixed grid. Drawing from this and keying the texture on it makes a pool key decide the image
 * completely, so the texture pool cannot make a frame depend on what was rendered before it. */
export function quantizeWhiteBallPose(p: WBPose): WBPose {
  const q = (v: number) => Math.round(v * 1000) / 1000 + 0; // + 0 folds -0 into 0
  return Object.freeze({
    lift: q(p.lift), rollDeg: q(p.rollDeg), sx: q(p.sx), sy: q(p.sy), rightHandLift: q(p.rightHandLift), leftHandLift: q(p.leftHandLift),
    rightHandOut: q(p.rightHandOut), leftHandOut: q(p.leftHandOut), eyeShift: q(p.eyeShift), shadowScale: q(p.shadowScale), blink: q(p.blink), sweat: q(p.sweat),
  });
}

export function assertWhiteBallPose(p: WBPose): void {
  for (const [k, v] of Object.entries(p)) if (!Number.isFinite(v)) throw new Error(`White Ball pose field ${k} is not finite`);
  if (p.sx <= 0 || p.sy <= 0) throw new Error('White Ball pose scale must be positive');
}
