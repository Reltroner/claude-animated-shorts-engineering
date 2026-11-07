/** "The Curious White Ball: Archive of Light", a 12-second TECHNICAL DEMO. Not canonical lore.
 *
 * The single source of truth for picture and sound. Everything is a pure function of the frame number: no clock, no
 * randomness, no state between frames, no browser globals. Time is always frame / fps.
 *
 * Audio cues are DERIVED from the character's actual beats (deriveSfxCues), so moving a beat moves its sound. The audio
 * driver records timelineHash() and the mux step refuses audio made for any other timeline. See audio-lock.ts.
 */
import {
  DEFAULT_NPC_ID, WB_BODY, WB_HOP, WB_HOP_PERIOD, WB_K, WB_SU, quantizeWhiteBallPose, whiteBallPose, whiteBallSequence,
  type WBAction, type WBExpression, type WBPose, type WBSegment,
} from '../../npc/white-ball';

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const FRAMES = 360;
export const SAMPLE_RATE = 48000;
export const SAMPLES = Math.round((FRAMES / FPS) * SAMPLE_RATE);
export const NPC_ID = DEFAULT_NPC_ID;

export const EPISODE = {
  id: 'EP-P5-ARCHIVE-PILOT',
  title: 'The Curious White Ball: Archive of Light',
  status: 'TECHNICAL DEMO. Not canonical lore, not a recreation of any reference story.',
  voice: 'none',
} as const;

export type Vec3 = readonly [number, number, number];
export type SceneId = 'SC-001' | 'SC-002' | 'SC-003' | 'SC-004';

export type Scene = Readonly<{ id: SceneId; start: number; end: number; world: string; soundIntent: string }>;

/** frame start inclusive, end exclusive */
export const SCENES: readonly Scene[] = [
  { id: 'SC-001', start: 0, end: 90, world: 'Stone archive hall established; glowing artifact far off; the ball peeks out of a side bay', soundIntent: 'soft room air and a restrained motif' },
  { id: 'SC-002', start: 90, end: 180, world: 'The ball looks around, hops to the low pedestal and waves at the artifact', soundIntent: 'precisely timed soft contacts and a light swish' },
  { id: 'SC-003', start: 180, end: 270, world: 'The artifact answers with gentle light; the ball is surprised, then anxious for a beat', soundIntent: 'original chime and short tonal tension, no explosive impact' },
  { id: 'SC-004', start: 270, end: 360, world: 'The ball settles into sparkly joy as the camera reveals an abstract constellation above', soundIntent: 'resolving notes and a quiet tail' },
];

export type Landing = readonly [x: number, z: number];
export type NpcBeat = Readonly<{
  id: string; start: number; end: number; action: WBAction; expression: WBExpression;
  /** offstage beats exist so the timeline is contiguous; the card is not drawn */
  visible?: boolean;
  /** hop beats only: where each hop lands, in floor metres */
  landings?: readonly Landing[];
  note: string;
}>;

export const NPC_START: Landing = [-4.6, -3.1];
export const NPC_MARK: Landing = [-1.2, -6.1];

export const BEATS: readonly NpcBeat[] = [
  { id: 'B01', start: 0, end: 36, action: 'idle', expression: 'default', visible: false, note: 'offstage in the left side bay' },
  { id: 'B02', start: 36, end: 90, action: 'hop', expression: 'default', landings: [[-3.05, -3.5], [-2.05, -4.45]], note: 'peeks out and hops into the nave' },
  { id: 'B03', start: 90, end: 105, action: 'look-left', expression: 'default', note: 'looks at the shelves' },
  { id: 'B04', start: 105, end: 120, action: 'look-right', expression: 'default', note: 'notices the artifact' },
  { id: 'B05', start: 120, end: 148, action: 'hop', expression: 'default', landings: [NPC_MARK], note: 'hops to the pedestal' },
  { id: 'B06', start: 148, end: 180, action: 'wave', expression: 'happy-closed', note: 'waves at the artifact' },
  { id: 'B07', start: 180, end: 206, action: 'look-right', expression: 'default', note: 'waits, eyes on the artifact' },
  { id: 'B08', start: 206, end: 238, action: 'react', expression: 'surprised', note: 'the light answers: surprised' },
  { id: 'B09', start: 238, end: 270, action: 'idle', expression: 'anxious', note: 'an anxious beat' },
  { id: 'B10', start: 270, end: 296, action: 'idle', expression: 'sparkly-happy', note: 'settles into joy' },
  { id: 'B11', start: 296, end: 360, action: 'float', expression: 'sparkly-happy', note: 'floats up with the camera' },
];

const NPC_SEGMENTS: readonly WBSegment[] = BEATS.map((b) => ({ action: b.action, expression: b.expression, seconds: (b.end - b.start) / FPS }));
/** longer than the P3 default: float starts well above the floor, and 3 frames would read as a jump */
export const NPC_BLEND_SECONDS = 0.2;

export const seconds = (frame: number) => frame / FPS;
export const sampleOf = (frame: number) => Math.round((frame / FPS) * SAMPLE_RATE);
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => { const u = clamp01(x); return u * u * (3 - 2 * u); };
/** symmetric smootherstep: attack equals release */
export const glide = (u: number) => { const x = clamp01(u); return x * x * x * (x * (6 * x - 15) + 10); };

export function assertFrame(frame: number): void {
  if (!Number.isInteger(frame) || frame < 0 || frame >= FRAMES) throw new Error(`frame out of range: ${frame}`);
}

export const sceneAt = (frame: number): Scene => {
  assertFrame(frame);
  return SCENES.find((s) => frame >= s.start && frame < s.end)!;
};

/** The first rendered frame off the floor and the first rendered frame back on it, for each hop in a beat. Read from the pose
 *  function itself, so a sound cue cannot disagree with what is drawn. */
export function hopFrames(beat: NpcBeat): { landing: Landing; takeoff: number; contact: number }[] {
  const out: { landing: Landing; takeoff: number; contact: number }[] = [];
  const length = beat.end - beat.start;
  let local = 0;
  for (const landing of beat.landings ?? []) {
    while (local < length && whiteBallPose(local, FPS, 'hop').lift <= 0) local++;
    const takeoff = beat.start + local;
    while (local < length && whiteBallPose(local, FPS, 'hop').lift > 0) local++;
    out.push({ landing, takeoff, contact: beat.start + local });
  }
  return out;
}

/** Floor position. It only changes during a flight, so nothing slides along the ground. */
export function npcGroundAt(frame: number): Landing {
  assertFrame(frame);
  let pos = NPC_START;
  for (const b of BEATS) {
    if (!b.landings) continue;
    for (let i = 0; i < b.landings.length; i++) {
      const t0 = b.start + (i * WB_HOP_PERIOD + WB_HOP.anticipate) * FPS;
      const t1 = t0 + WB_HOP.flight * FPS;
      if (frame <= t0) return pos;
      if (frame < t1) {
        const u = (frame - t0) / (t1 - t0), to = b.landings[i];
        return [pos[0] + (to[0] - pos[0]) * u, pos[1] + (to[1] - pos[1]) * u];
      }
      pos = b.landings[i];
    }
  }
  return pos;
}

export type NpcState = Readonly<{
  npc: typeof NPC_ID; visible: boolean; beat: string; expression: WBExpression; action: WBAction; pose: WBPose; x: number; z: number;
}>;

/** Blinks between the expression swaps. The P3 pose blink runs on a beat's local time and these beats are too short to reach it.
 *  With the swaps, which whiteBallSequence already covers with a blink, the gaps here stay inside the 0.5-2.3 s that motion.md
 *  measured. A blink is half, shut, half. Closed-eye and wide-eye beats have none: there is nothing to close or it would break the take. */
export const BLINK_FRAMES = [72, 100, 116, 194, 254, 288, 312, 340] as const;
const blinkAmount = (frame: number) => {
  let k = 0;
  for (const b of BLINK_FRAMES) { const d = Math.abs(frame - b); if (d === 0) k = 1; else if (d === 1) k = Math.max(k, 0.6); }
  return k;
};

export function npcAt(frame: number): NpcState {
  assertFrame(frame);
  const s = whiteBallSequence(frame, FPS, NPC_SEGMENTS, { blend: NPC_BLEND_SECONDS });
  const beat = BEATS[s.segment];
  const [x, z] = npcGroundAt(frame);
  const pose = quantizeWhiteBallPose({ ...s.pose, blink: Math.max(s.pose.blink, blinkAmount(frame)) });
  return { npc: NPC_ID, visible: beat.visible !== false, beat: beat.id, expression: s.expression, action: s.action, pose, x, z };
}

// ---------------------------------------------------------------- camera
export type CamKey = Readonly<{
  id: string; frame: number;
  /** glide length in frames. 0 = the first key. */
  dur: number;
  pos: Vec3; look: Vec3; fov: number;
  /** slow dolly toward the look point, per frame since this key began */
  push: number;
}>;

export const CAM_KEYS: readonly CamKey[] = [
  { id: 'CAM-1-ESTABLISH', frame: 0, dur: 0, pos: [-1.05, 1.4, 11.2], look: [-0.15, 3.3, -8], fov: 44, push: 0.0016 },
  { id: 'CAM-2-FOLLOW', frame: 72, dur: 72, pos: [-2.1, 1.3, 1.25], look: [-1.4, 1.3, -6.4], fov: 40, push: 0.0012 },
  { id: 'CAM-3-TWO-SHOT', frame: 168, dur: 42, pos: [-2.4, 1.15, -1.0], look: [-0.93, 1.14, -6.3], fov: 36, push: 0.001 },
  { id: 'CAM-4-REVEAL', frame: 280, dur: 72, pos: [-0.95, 1.0, 2.7], look: [-0.15, 4.3, -10], fov: 46, push: 0 },
];

export type CamState = Readonly<{ pos: Vec3; look: Vec3; fov: number }>;

const keyState = (k: CamKey, f: number): CamState => {
  const c = Math.exp(-k.push * Math.max(0, f - k.frame));
  return { pos: [k.look[0] + (k.pos[0] - k.look[0]) * c, k.look[1] + (k.pos[1] - k.look[1]) * c, k.look[2] + (k.pos[2] - k.look[2]) * c], look: k.look, fov: k.fov };
};
const mixCam = (a: CamState, b: CamState, w: number): CamState => ({
  pos: [a.pos[0] + (b.pos[0] - a.pos[0]) * w, a.pos[1] + (b.pos[1] - a.pos[1]) * w, a.pos[2] + (b.pos[2] - a.pos[2]) * w],
  look: [a.look[0] + (b.look[0] - a.look[0]) * w, a.look[1] + (b.look[1] - a.look[1]) * w, a.look[2] + (b.look[2] - a.look[2]) * w],
  fov: a.fov + (b.fov - a.fov) * w,
});

export function cameraAt(frame: number): CamState {
  assertFrame(frame);
  let cur = keyState(CAM_KEYS[0], frame);
  for (let i = 1; i < CAM_KEYS.length; i++) {
    const k = CAM_KEYS[i];
    if (frame < k.frame) break;
    cur = mixCam(cur, keyState(k, frame), glide((frame - k.frame) / k.dur));
  }
  return cur;
}

export type ScreenPoint = Readonly<{ x: number; y: number; depth: number }>;

/** Project a world point to output pixels, for tests and QA boxes. Same maths as a three.js PerspectiveCamera looking at c.look. */
export function project(c: CamState, p: Vec3): ScreenPoint {
  const fwd = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]];
  const fl = Math.hypot(fwd[0], fwd[1], fwd[2]);
  const f = fwd.map((v) => v / fl);
  const rl = Math.hypot(f[2], f[0]);
  const r = [-f[2] / rl, 0, f[0] / rl]; // right = forward x up
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d = [p[0] - c.pos[0], p[1] - c.pos[1], p[2] - c.pos[2]];
  const depth = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  const ppm = HEIGHT / (2 * Math.tan((c.fov * Math.PI) / 360));
  return {
    x: WIDTH / 2 + (ppm * (d[0] * r[0] + d[1] * r[1] + d[2] * r[2])) / depth,
    y: HEIGHT / 2 - (ppm * (d[0] * u[0] + d[1] * u[1] + d[2] * u[2])) / depth,
    depth,
  };
}

const BALL_RX = WB_BODY.rx * WB_K * WB_SU;
const BALL_RY = WB_BODY.ry * WB_K * WB_SU;
/** body box in output pixels, ignoring the hands. Lift is in design units. */
export function npcScreenBox(frame: number): { x0: number; y0: number; x1: number; y1: number; px: number; depth: number; visible: boolean } {
  const n = npcAt(frame), c = cameraAt(frame);
  const lift = n.pose.lift * WB_SU;
  const centre = project(c, [n.x, BALL_RY + lift, n.z]);
  const ppm = (HEIGHT / (2 * Math.tan((c.fov * Math.PI) / 360))) / centre.depth;
  const hw = BALL_RX * ppm, hh = BALL_RY * ppm;
  return { x0: centre.x - hw, y0: centre.y - hh, x1: centre.x + hw, y1: centre.y + hh, px: ppm, depth: centre.depth, visible: n.visible };
}

// ---------------------------------------------------------------- depth of field
/** thin-lens settings (lensblur.ts). cInf = blur-disc radius in px at 1080 x 1920 for things at infinity. Focus stays on
 *  the ball's face. Blur only changes during camera moves, never as a focus pull inside a hold. */
export const DOF_KEYS: readonly { frame: number; cInf: number }[] = [
  { frame: 0, cInf: 0 }, { frame: 96, cInf: 0 }, { frame: 144, cInf: 9 }, { frame: 168, cInf: 9 }, { frame: 210, cInf: 13 },
  { frame: 280, cInf: 13 }, { frame: 330, cInf: 0 }, { frame: 359, cInf: 0 },
];

const curve = (pts: readonly (readonly [number, number])[], f: number) => {
  if (f <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (f <= pts[i][0]) return pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * smooth((f - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
  }
  return pts[pts.length - 1][1];
};

export function dofAt(frame: number): { cInf: number; focusDistance: number } {
  assertFrame(frame);
  const cInf = curve(DOF_KEYS.map((k) => [k.frame, k.cInf] as const), frame);
  const box = npcScreenBox(frame);
  return { cInf, focusDistance: Math.max(0.3, box.depth) };
}

// ---------------------------------------------------------------- light state
export const CHIME_FRAME = 202; // beat 2 of the third bar, as the artifact starts to brighten
export const RELEASE_FRAME = 315; // beat 3 of the last bar
export const REVEAL_START = 280;
export const REVEAL_END = 346;
export const FADE_START = 346;

const GLOW = [[0, 1.2], [200, 1.2], [222, 2.3], [262, 2.0], [RELEASE_FRAME - 6, 2.2], [RELEASE_FRAME + 6, 3.0], [359, 2.4]] as const;
const POOL = [[0, 0.55], [200, 0.55], [222, 1.55], [262, 1.3], [RELEASE_FRAME - 6, 1.45], [RELEASE_FRAME + 6, 1.9], [359, 1.6]] as const;
const LANTERN = [[0, 0.85], [214, 0.85], [262, 1.2], [359, 1.25]] as const;
const SHAFT = [[0, 1], [200, 1], [240, 0.8], [290, 1.05], [359, 1.05]] as const;

export type LightState = Readonly<{
  /** artifact self-glow multiplier. Above about 1 it reaches the bloom threshold. */
  artifact: number;
  /** the artifact's light on nearby surfaces */
  pool: number;
  lantern: number;
  shaft: number;
  /** 0..1, how much of the constellation has appeared */
  reveal: number;
  /** picture fade to dark over the last frames */
  fade: number;
  /** multiplier the ball takes from the scene: a very light cool shift when the artifact flares */
  charTint: Vec3;
}>;

export function lightAt(frame: number): LightState {
  assertFrame(frame);
  const artifact = curve(GLOW, frame);
  const k = clamp01((artifact - 1.2) / 1.8);
  return {
    artifact, pool: curve(POOL, frame), lantern: curve(LANTERN, frame), shaft: curve(SHAFT, frame),
    reveal: smooth((frame - REVEAL_START) / (REVEAL_END - REVEAL_START)),
    fade: smooth((frame - FADE_START) / (FRAMES - 1 - FADE_START)) * 0.85,
    charTint: [1 - 0.05 * k, 1, 1 - 0.01 * k],
  };
}

/** Everything in the set. None of these is a character: they are procedural primitives, with no image files. */
export const WORLD_PROPS: readonly { id: string; kind: 'non-character'; what: string; at?: Vec3 }[] = [
  { id: 'PROP-HALL', kind: 'non-character', what: 'stone nave with square piers, flat lintels and timber beams; no arches' },
  { id: 'PROP-SHELVES', kind: 'non-character', what: 'two storeys of timber shelving with painted book spines, no lettering' },
  { id: 'PROP-GALLERY', kind: 'non-character', what: 'upper gallery with plank deck and timber rail' },
  { id: 'PROP-WINDOW', kind: 'non-character', what: 'tall gridded window on the far wall with a painted dusk sky behind it' },
  { id: 'PROP-RUG', kind: 'non-character', what: 'square indigo rug with a gold geometric border', at: [0, 0, -8] },
  { id: 'PROP-PEDESTAL', kind: 'non-character', what: 'low square three-tier slate pedestal with brass inlay', at: [0, 0, -8] },
  { id: 'PROP-ARTIFACT', kind: 'non-character', what: 'floating faceted solid inside two thin brass rings', at: [0, 1.72, -8] },
  { id: 'PROP-LANTERNS', kind: 'non-character', what: 'square brass wall lanterns on the piers' },
  { id: 'PROP-LECTERN', kind: 'non-character', what: 'timber reading stand with an open blank book', at: [1.75, 0, -1.3] },
  { id: 'PROP-GLYPHS', kind: 'non-character', what: 'small floating abstract line marks, no letters' },
  { id: 'PROP-CONSTELLATION', kind: 'non-character', what: 'abstract points and thin lines in the upper hall, revealed in SC-004', at: [-0.1, 6.45, -9.6] },
];

// ---------------------------------------------------------------- sound cues
export type SfxType = 'hop_lift' | 'hop_contact' | 'wave_swish' | 'artifact_chime' | 'surprise_pop' | 'release_bell' | 'node_sparkle' | 'camera_air';
export type SfxCue = Readonly<{
  id: string; type: SfxType; frame: number; relFrame: number; scene: SceneId; seconds: number; sample: number;
  /** -1 left .. 1 right, from where the event is on screen */
  pan: number; gainDb: number; seed: number; source: string;
}>;

const panOf = (frame: number, p: Vec3) => {
  const s = project(cameraAt(frame), p);
  return Math.max(-0.7, Math.min(0.7, ((s.x - WIDTH / 2) / (WIDTH / 2)) * 0.6));
};

export function deriveSfxCues(): SfxCue[] {
  const out: Omit<SfxCue, 'relFrame' | 'scene' | 'seconds' | 'sample' | 'seed' | 'id'>[] = [];
  for (const b of BEATS) {
    for (const h of hopFrames(b)) {
      const lift = npcGroundAt(Math.min(h.takeoff, FRAMES - 1));
      out.push({ type: 'hop_lift', frame: h.takeoff, pan: panOf(h.takeoff, [lift[0], 0.5, lift[1]]), gainDb: -3, source: `${b.id}: first frame of the flight` });
      out.push({ type: 'hop_contact', frame: h.contact, pan: panOf(h.contact, [h.landing[0], 0, h.landing[1]]), gainDb: 0, source: `${b.id}: first frame back on the floor, pose lift = 0` });
    }
    if (b.action === 'wave') {
      // the hand swings as sin(14 t): one swish as the hand comes up, then on two of its swings
      for (const dt of [3, 13, 27]) {
        const f = b.start + dt;
        if (f < b.end) out.push({ type: 'wave_swish', frame: f, pan: panOf(f, [NPC_MARK[0], 1.2, NPC_MARK[1]]), gainDb: dt === 3 ? -2 : -5, source: `${b.id}: hand swing` });
      }
    }
    if (b.expression === 'surprised') out.push({ type: 'surprise_pop', frame: b.start, pan: panOf(b.start, [NPC_MARK[0], 0.5, NPC_MARK[1]]), gainDb: -1, source: `${b.id}: expression turns surprised` });
  }
  out.push({ type: 'artifact_chime', frame: CHIME_FRAME, pan: panOf(CHIME_FRAME, [0, 1.72, -8]), gainDb: 0, source: 'artifact glow starts to rise' });
  out.push({ type: 'release_bell', frame: RELEASE_FRAME, pan: 0, gainDb: 0, source: 'constellation flare, beat 3 of the last bar' });
  // points appearing, before the bell and once its ring has thinned: right after the strike they would be masked by it
  for (const [f, p, g] of [[286, -0.35, -1], [297, 0.3, -2], [308, -0.15, -3], [334, 0.4, -1], [343, -0.45, -3]] as const) {
    out.push({ type: 'node_sparkle', frame: f, pan: p, gainDb: g, source: 'constellation points appearing' });
  }
  for (const k of CAM_KEYS.slice(1)) out.push({ type: 'camera_air', frame: k.frame, pan: 0, gainDb: -2, source: `${k.id}: glide starts` });

  return out.sort((a, b) => a.frame - b.frame || a.type.localeCompare(b.type)).map((c, i) => {
    const scene = sceneAt(c.frame);
    return { ...c, id: `SFX-${String(i + 1).padStart(3, '0')}-${c.type}`, relFrame: c.frame - scene.start, scene: scene.id, seconds: seconds(c.frame), sample: sampleOf(c.frame), seed: 5100 + i };
  });
}

/** What the picture's timing depends on. A rendered picture is tied to this. */
export function pictureForHash(scenes: readonly Scene[] = SCENES, beats: readonly NpcBeat[] = BEATS, frames = FRAMES, fps = FPS) {
  return {
    fps, frames,
    scenes: scenes.map((s) => [s.id, s.start, s.end]),
    beats: beats.map((b) => [b.id, b.start, b.end, b.action, b.expression, b.landings ?? null, b.visible ?? true]),
    glow: GLOW, chime: CHIME_FRAME, release: RELEASE_FRAME, reveal: [REVEAL_START, REVEAL_END],
    cameras: CAM_KEYS.map((k) => [k.id, k.frame, k.dur]),
    blinks: BLINK_FRAMES,
  };
}

/** What picture-to-sound sync depends on: the picture's timing plus when each cue happens. Rendered audio is tied to this.
 *  Levels are left out: rebalancing the mix re-renders the sound but changes no timing. */
export function timelineForHash(scenes: readonly Scene[] = SCENES, beats: readonly NpcBeat[] = BEATS, frames = FRAMES, fps = FPS) {
  return { ...pictureForHash(scenes, beats, frames, fps), cues: deriveSfxCues().map((c) => [c.id, c.frame]) };
}
