// P5 timeline: motion, camera and light as pure functions of the frame.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WB_HOP, whiteBallPose } from '../src/npc/white-ball';
import {
  BEATS, BLINK_FRAMES, CAM_KEYS, FPS, FRAMES, HEIGHT, NPC_MARK, WIDTH, assertFrame, cameraAt, dofAt, glide, hopFrames, lightAt, npcAt, npcGroundAt, npcScreenBox, project, type CamState,
} from '../src/pilot/archive/episode';

const all = Array.from({ length: FRAMES }, (_, i) => i);

test('every function gives the same answer in any order: no state between frames', () => {
  const snapshot = (f: number) => JSON.stringify([npcAt(f), cameraAt(f), lightAt(f), dofAt(f), npcGroundAt(f)]);
  const forward = all.map(snapshot);
  const shuffled = [...all].sort((a, b) => ((a * 7919) % 360) - ((b * 7919) % 360));
  for (const f of shuffled) assert.equal(snapshot(f), forward[f], `frame ${f}`);
});

test('bad frame numbers are refused', () => {
  for (const f of [-1, 360, 1.5, NaN, Infinity]) assert.throws(() => assertFrame(f), /range/);
  for (const fn of [npcAt, cameraAt, lightAt]) assert.throws(() => fn(360 as number), /range/);
});

test('the ball only moves along the floor while it is in the air: nothing skates', () => {
  for (let f = 1; f < FRAMES; f++) {
    const a = npcGroundAt(f - 1), b = npcGroundAt(f);
    const moved = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (moved > 1e-9) assert.ok(npcAt(f).pose.lift > 0 || npcAt(f - 1).pose.lift > 0, `frame ${f} slides ${moved} m with no lift`);
  }
});

test('a hop travels a plausible distance and ends on its landing mark', () => {
  for (const b of BEATS) for (const h of hopFrames(b)) {
    assert.deepEqual(npcGroundAt(h.contact), h.landing, `${b.id} lands where it says`);
  }
  assert.deepEqual(npcGroundAt(FRAMES - 1), NPC_MARK);
  let prev = npcGroundAt(0);
  for (const b of BEATS) for (const h of hopFrames(b)) {
    const d = Math.hypot(h.landing[0] - prev[0], h.landing[1] - prev[1]);
    assert.ok(d > 0.5 && d < 2.2, `${b.id} hop of ${d.toFixed(2)} m`);
    prev = h.landing;
  }
});

test('whenever the ball is on stage from entry onward, its body stays in frame with its hands', () => {
  const entry = BEATS.find((b) => b.id === 'B03')!.start; // it hops in from off-screen during B02
  for (let f = entry; f < FRAMES; f++) {
    const b = npcScreenBox(f), w = b.x1 - b.x0;
    assert.ok(b.x0 - 0.13 * w > 0 && b.x1 + 0.13 * w < WIDTH, `frame ${f} x ${b.x0.toFixed(0)}..${b.x1.toFixed(0)}`);
    assert.ok(b.y0 > 0 && b.y1 < HEIGHT, `frame ${f} y ${b.y0.toFixed(0)}..${b.y1.toFixed(0)}`);
  }
});

test('the ball is hidden only offstage, and is seen entering', () => {
  assert.equal(npcAt(0).visible, false);
  assert.equal(npcAt(35).visible, false);
  assert.equal(npcAt(36).visible, true);
  const before = npcScreenBox(36), later = npcScreenBox(88);
  assert.ok(before.x1 < 0, 'it starts out of frame');
  assert.ok(later.x0 > 0, 'and has come into frame by the end of SC-001');
});

test('the face reads: the ball is at least 150 px wide when visible in frame, and larger in the close beats', () => {
  for (let f = 90; f < FRAMES; f++) { const b = npcScreenBox(f); assert.ok(b.x1 - b.x0 > 150, `frame ${f}`); }
  for (const f of [212, 250, 290]) { const b = npcScreenBox(f); assert.ok(b.x1 - b.x0 > 400, `frame ${f}`); }
});

test('camera: no cuts, and glides stay under the speed the reference moves reach', () => {
  // the same grid idea as motion.md: points on the plane through the look point. 25 px/f at 720p is its p75, 37.5 at 1080p.
  const speed = (a: CamState, b: CamState) => {
    const d = Math.hypot(a.look[0] - a.pos[0], a.look[1] - a.pos[1], a.look[2] - a.pos[2]);
    let s = 0, n = 0;
    for (const dx of [-1, -0.5, 0, 0.5, 1]) for (const dy of [-1, -0.5, 0, 0.5, 1]) {
      const p = [a.look[0] + dx * 0.3 * d, a.look[1] + dy * 0.48 * d, a.look[2]] as const;
      const pa = project(a, p), pb = project(b, p);
      s += Math.hypot(pa.x - pb.x, pa.y - pb.y); n++;
    }
    return s / n;
  };
  let peak = 0;
  for (let f = 0; f < FRAMES - 1; f++) peak = Math.max(peak, speed(cameraAt(f), cameraAt(f + 1)));
  assert.ok(peak < 37.5, `peak ${peak.toFixed(1)} px per frame at 1080p`);
  assert.ok(peak > 2, 'and the camera does move');
});

test('camera moves ease in and out: the glide is symmetric and has no jump at either end', () => {
  assert.equal(glide(0), 0); assert.equal(glide(1), 1); assert.ok(Math.abs(glide(0.5) - 0.5) < 1e-9);
  for (const u of [0.1, 0.25, 0.4]) assert.ok(Math.abs(glide(u) + glide(1 - u) - 1) < 1e-9);
  // the camera is already pushing in when a glide starts, so what must not change abruptly is its step from one frame to the next
  const step = (f: number) => { const a = cameraAt(f - 1), b = cameraAt(f); return Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]); };
  for (const k of CAM_KEYS.slice(1)) {
    const change = Math.abs(step(k.frame) - step(k.frame - 1));
    assert.ok(change < 0.005, `${k.id} starts with a change of ${change.toFixed(4)} m per frame`);
  }
  for (let f = 2; f < FRAMES; f++) assert.ok(Math.abs(step(f) - step(f - 1)) < 0.02, `frame ${f}: the camera lurches by ${Math.abs(step(f) - step(f - 1)).toFixed(4)} m per frame`);
});

test('project() agrees with the geometry it is used for: the look point lands in the centre', () => {
  for (const f of [0, 120, 240, 359]) {
    const c = cameraAt(f), p = project(c, c.look);
    assert.ok(Math.abs(p.x - WIDTH / 2) < 1e-6 && Math.abs(p.y - HEIGHT / 2) < 1e-6, `frame ${f}`);
    assert.ok(p.depth > 0);
  }
});

test('depth of field: focus stays on the ball, and the establishing shot and the reveal are sharp', () => {
  for (let f = 0; f < FRAMES; f++) {
    const d = dofAt(f);
    assert.ok(d.cInf >= 0 && d.cInf <= 24, `frame ${f}`);
    assert.ok(Math.abs(d.focusDistance - npcScreenBox(f).depth) < 1e-9, `frame ${f} focuses on the ball`);
  }
  assert.equal(dofAt(0).cInf, 0);
  assert.equal(dofAt(359).cInf, 0);
  assert.ok(dofAt(240).cInf > 8, 'the close beat has a soft background');
});

test('the artifact answers in SC-003, gently: a rise, no flash', () => {
  assert.equal(lightAt(0).artifact, lightAt(190).artifact, 'steady before it answers');
  assert.ok(lightAt(230).artifact > lightAt(190).artifact * 1.5);
  let maxStep = 0;
  for (let f = 1; f < FRAMES; f++) maxStep = Math.max(maxStep, Math.abs(lightAt(f).artifact - lightAt(f - 1).artifact));
  assert.ok(maxStep < 0.12, `largest per-frame change ${maxStep.toFixed(3)}`);
});

test('the constellation is hidden until SC-004, then appears in full, and the picture only fades at the end', () => {
  for (let f = 0; f < 280; f++) assert.equal(lightAt(f).reveal, 0, `frame ${f}`);
  for (let f = 281; f < FRAMES; f++) assert.ok(lightAt(f).reveal >= lightAt(f - 1).reveal);
  assert.equal(lightAt(346).reveal, 1);
  for (let f = 0; f <= 346; f++) assert.equal(lightAt(f).fade, 0, `frame ${f}`);
  assert.ok(lightAt(359).fade > 0.5 && lightAt(359).fade <= 1);
});

test('the light state never tints the ball by much: the near-white body is protected', () => {
  for (let f = 0; f < FRAMES; f++) for (const c of lightAt(f).charTint) assert.ok(c > 0.92 && c <= 1, `frame ${f}: ${c}`);
});

test('blinks: a blink covers each expression swap, and scheduled blinks only land on open eyes', () => {
  for (let i = 1; i < BEATS.length; i++) {
    if (BEATS[i].expression === BEATS[i - 1].expression) continue;
    assert.equal(npcAt(BEATS[i].start).pose.blink, 1, `swap into ${BEATS[i].id}`);
  }
  for (const f of BLINK_FRAMES) {
    assert.equal(npcAt(f).pose.blink, 1, `frame ${f}`);
    assert.ok(npcAt(f - 1).pose.blink > 0 && npcAt(f - 1).pose.blink < 1, `half lid before ${f}`);
    assert.ok(npcAt(f + 1).pose.blink > 0 && npcAt(f + 1).pose.blink < 1, `half lid after ${f}`);
    assert.ok(!['happy-closed', 'surprised'].includes(npcAt(f).expression), `frame ${f} is ${npcAt(f).expression}`);
  }
  assert.equal(npcAt(40).pose.blink, 0, 'open eyes by default');
});

test('all poses are finite, and squash stays inside the measured range', () => {
  for (let f = 0; f < FRAMES; f++) {
    const p = npcAt(f).pose;
    for (const [k, v] of Object.entries(p)) assert.ok(Number.isFinite(v), `frame ${f} ${k}`);
    assert.ok(p.sx > 0.95 && p.sx < 1.05 && p.sy > 0.93 && p.sy < 1.05, `frame ${f} sx ${p.sx} sy ${p.sy}`);
  }
});

test('no pop: between neighbouring frames the ball does not jump, outside the blinks', () => {
  for (let f = 37; f < FRAMES; f++) {
    const a = npcAt(f - 1).pose, b = npcAt(f).pose;
    assert.ok(Math.abs(a.lift - b.lift) < 18, `frame ${f}: lift ${a.lift} -> ${b.lift}`);
    assert.ok(Math.abs(a.rightHandLift - b.rightHandLift) < 40, `frame ${f}: hand ${a.rightHandLift} -> ${b.rightHandLift}`);
  }
});

test('the hop keeps its measured lift: this pilot uses the P3 hop unchanged', () => {
  const hop = BEATS.find((b) => b.id === 'B05')!;
  const peakFrame = hop.start + Math.round((WB_HOP.anticipate + WB_HOP.flight / 2) * FPS);
  const raw = whiteBallPose(peakFrame - hop.start, FPS, 'hop').lift;
  assert.ok(Math.abs(npcAt(peakFrame).pose.lift - raw) < 0.01);
  assert.ok(raw > WB_HOP.height * 0.95);
});
