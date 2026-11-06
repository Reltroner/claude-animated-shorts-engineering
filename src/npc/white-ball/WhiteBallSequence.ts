/** Chains WB-NPC-001 actions on a timeline. A pure function of (frame, fps, segments): no state between frames, so
 * frames can be rendered in any order. Segment lengths are seconds, turned into frames by rounding, so a clip keeps its
 * timing at any fps.
 *
 * Each segment plays its action from its own local time 0. Poses crossfade over `blend` seconds at every boundary,
 * and a blink hides every expression swap, as cast.ts does for the bridge cast.
 */
import { WB_HAND_REST, WB_K } from './WhiteBallRig';
import {
  assertWhiteBallAction, assertWhiteBallExpression, assertWhiteBallTime, whiteBallPose, whiteBallShadowScale,
  type WBAction, type WBExpression, type WBPose,
} from './WhiteBallPose';

export type WBSegment = Readonly<{ action: WBAction; expression: WBExpression; seconds: number }>;
export type WBSequenceOptions = Readonly<{ blend?: number; loop?: boolean }>;
export type WBSequenceState = Readonly<{ pose: WBPose; expression: WBExpression; action: WBAction; segment: number; localFrame: number }>;

const smooth = (x: number) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };
const mix = (a: number, b: number, w: number) => a + (b - a) * w;

function mixPose(a: WBPose, b: WBPose, w: number): WBPose {
  const lift = mix(a.lift, b.lift, w);
  return {
    lift, rollDeg: mix(a.rollDeg, b.rollDeg, w), sx: mix(a.sx, b.sx, w), sy: mix(a.sy, b.sy, w),
    rightHandLift: mix(a.rightHandLift, b.rightHandLift, w), leftHandLift: mix(a.leftHandLift, b.leftHandLift, w),
    rightHandOut: mix(a.rightHandOut, b.rightHandOut, w), leftHandOut: mix(a.leftHandOut, b.leftHandOut, w),
    eyeShift: mix(a.eyeShift, b.eyeShift, w), shadowScale: whiteBallShadowScale(lift), blink: Math.max(a.blink, b.blink), sweat: b.sweat,
  };
}

/** hands rest in a different place per expression: carry the difference across the blend so they travel instead of pop */
function withHandOffset(p: WBPose, shown: WBExpression, from: WBExpression, k: number): WBPose {
  if (k === 0 || shown === from) return p;
  const A = WB_HAND_REST[from], B = WB_HAND_REST[shown];
  return {
    ...p,
    leftHandOut: p.leftHandOut + k * WB_K * (-A.left[0] + B.left[0]),
    rightHandOut: p.rightHandOut + k * WB_K * (A.right[0] - B.right[0]),
    leftHandLift: p.leftHandLift + k * WB_K * (A.left[1] - B.left[1]),
    rightHandLift: p.rightHandLift + k * WB_K * (A.right[1] - B.right[1]),
  };
}

export function whiteBallSequenceFrames(fps: number, segments: readonly WBSegment[]): number {
  let t = 0;
  for (const s of segments) t += s.seconds;
  return Math.round(t * fps);
}

export function whiteBallSequence(frame: number, fps: number, segments: readonly WBSegment[], options: WBSequenceOptions = {}): WBSequenceState {
  assertWhiteBallTime(frame, fps);
  if (segments.length === 0) throw new Error('White Ball sequence needs at least one segment');
  const starts: number[] = [];
  let cum = 0;
  for (const s of segments) {
    assertWhiteBallAction(s.action);
    assertWhiteBallExpression(s.expression);
    if (!Number.isFinite(s.seconds) || s.seconds <= 0) throw new Error('White Ball segment seconds must be positive');
    starts.push(Math.round(cum * fps));
    cum += s.seconds;
  }
  const total = Math.round(cum * fps);
  const blendFrames = Math.max(1, Math.round((options.blend ?? 0.1) * fps));

  const f = options.loop ? frame % total : Math.min(frame, total - 1);
  let i = segments.length - 1;
  while (i > 0 && f < starts[i]) i--;
  const seg = segments[i], local = f - starts[i];
  let pose: WBPose = whiteBallPose(local, fps, seg.action);

  if (i > 0 && local < blendFrames) {
    const prev = segments[i - 1];
    const w = smooth((local + 1) / (blendFrames + 1));
    pose = mixPose(whiteBallPose(f - starts[i - 1], fps, prev.action), pose, w);
    pose = withHandOffset(pose, seg.expression, prev.expression, 1 - w);
  }
  if (options.loop) {
    // close the loop: the last frames settle into frame 0 of the first segment
    const toEnd = total - f;
    if (toEnd <= blendFrames) {
      const first = segments[0];
      const w = smooth((blendFrames - toEnd + 1) / (blendFrames + 1));
      pose = mixPose(pose, whiteBallPose(0, fps, first.action), w);
      pose = withHandOffset(pose, seg.expression, first.expression, w);
    }
  }

  // a blink across each expression swap: half, shut, half
  let swapBlink = 0;
  for (let b = 1; b < segments.length; b++) {
    if (segments[b].expression === segments[b - 1].expression) continue;
    const d = Math.abs(f - starts[b]);
    if (d === 0) swapBlink = Math.max(swapBlink, 1);
    else if (d === 1) swapBlink = Math.max(swapBlink, 0.6);
  }
  if (swapBlink > 0) pose = { ...pose, blink: Math.max(pose.blink, swapBlink) };

  return Object.freeze({ pose: Object.freeze({ ...pose }), expression: seg.expression, action: seg.action, segment: i, localFrame: local });
}
