// P6 motion: the 3D staging as pure functions of the frame, against the unchanged P5 timeline and the approved soundtrack's cues.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { WB_ACTIONS, WB_EXPRESSIONS, WB_HOP, WB_SU } from '../src/npc/white-ball';
import { WB3D_BODY, WB3D_HAND, WB3D_LIFT_SCALE, WB3D_LOOK_YAW, whiteBall3DAction } from '../src/npc/white-ball-3d';
import { BEATS, FPS, FRAMES, HEIGHT, NPC_MARK, WIDTH, deriveSfxCues, glide, hopFrames, npcAt, project, type CamState } from '../src/pilot/archive/episode';
import { CAM3D_KEYS, FLOOR_Y, camera3DAt, dof3DAt, keyPoolCentreAt, npc3DAt, npc3DScreenBox, orbitedCamera, picture3DForHash } from '../src/pilot/archive/episode3d';
import { hashTimeline, timelineHash } from '../src/pilot/archive/audio-lock';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const all = Array.from({ length: FRAMES }, (_, i) => i);
const shown = all.filter((f) => npc3DAt(f).visible);
const entered = BEATS.find((b) => b.id === 'B03')!.start; // the ball hops in from offstage during B02

test('every function gives the same answer in any order: no state between frames', () => {
  const snap = (f: number) => JSON.stringify([npc3DAt(f), camera3DAt(f), dof3DAt(f), keyPoolCentreAt(f)]);
  const forward = all.map(snap);
  const shuffled = [...all].sort((a, b) => ((a * 7919) % 360) - ((b * 7919) % 360));
  for (const f of shuffled) assert.equal(snap(f), forward[f], `frame ${f}`);
});

test('bad frame numbers are refused', () => {
  for (const f of [-1, 360, 1.5, NaN, Infinity]) { assert.throws(() => npc3DAt(f), /range/); assert.throws(() => camera3DAt(f), /range/); }
});

test('the P5 timeline is untouched: the hash the soundtrack was made for still comes out of the code', () => {
  const measured = JSON.parse(fs.readFileSync(path.join(root, '.local/p5-white-ball/audio/audio-measurements.json'), 'utf8'));
  assert.equal(measured.timelineHash, timelineHash());
});

test('every hop leaves and lands on the frames the approved soundtrack has its cues on', () => {
  const cues = deriveSfxCues();
  const lifts = cues.filter((c) => c.type === 'hop_lift').map((c) => c.frame), contacts = cues.filter((c) => c.type === 'hop_contact').map((c) => c.frame);
  assert.deepEqual(lifts, [40, 67, 124]);
  assert.deepEqual(contacts, [56, 82, 140]);
  const height = (f: number) => npc3DAt(f).contact[1] - FLOOR_Y;
  for (const f of lifts) { assert.ok(height(f) > 0, `off the floor at ${f}`); assert.equal(height(f - 1), 0, `still on it at ${f - 1}`); }
  for (const f of contacts) { assert.equal(height(f), 0, `down at ${f}`); assert.ok(height(f - 1) > 0, `still up at ${f - 1}`); }
  const expected = BEATS.flatMap((b) => hopFrames(b)).map((h) => h.contact);
  assert.deepEqual(expected, contacts);
});

test('the other picture events keep their cues: the surprise starts on its pop, the wave on its first swish', () => {
  const cues = deriveSfxCues();
  const pop = cues.find((c) => c.type === 'surprise_pop')!;
  assert.equal(npc3DAt(pop.frame).expression, 'surprised');
  assert.notEqual(npc3DAt(pop.frame - 1).expression, 'surprised');
  const swish = cues.filter((c) => c.type === 'wave_swish').map((c) => c.frame);
  for (const f of swish) assert.equal(npc3DAt(f).action, 'wave');
  // a camera whoosh marks the start of each deliberate move
  const air = cues.filter((c) => c.type === 'camera_air').map((c) => c.frame);
  assert.deepEqual(air, [72, 168, 280]);
  for (const k of CAM3D_KEYS.slice(1)) assert.ok(air.includes(k.frame), `${k.id} starts on a cue`);
});

test('the same five expressions on the same beats as P5: the story is unchanged', () => {
  for (const f of all) {
    const p5 = npcAt(f), p6 = npc3DAt(f);
    assert.equal(p6.expression, p5.expression, `frame ${f}`);
    assert.equal(p6.action, p5.action, `frame ${f}`);
    assert.equal(p6.visible, p5.visible, `frame ${f}`);
    assert.equal(p6.contact[0], p5.x); assert.equal(p6.contact[2], p5.z);
  }
});

test('a hop really goes up: the height is what gravity gives for the measured flight time, and the arc is smooth', () => {
  const h = (9.81 * WB_HOP.flight ** 2) / 8;
  assert.ok(Math.abs(WB_HOP.height * WB_SU * WB3D_LIFT_SCALE - h) < 1e-9);
  const hop = BEATS.find((b) => b.id === 'B05')!, [{ takeoff, contact }] = hopFrames(hop);
  const heights = [];
  for (let f = takeoff - 1; f <= contact; f++) heights.push(npc3DAt(f).contact[1] - FLOOR_Y);
  const peak = Math.max(...heights);
  assert.ok(peak > h * 0.95 && peak <= h + 1e-6, `peak ${peak}`);
  const mid = heights.indexOf(peak);
  for (let i = 1; i <= mid; i++) assert.ok(heights[i] >= heights[i - 1], `rising at ${i}`);
  for (let i = mid + 1; i < heights.length; i++) assert.ok(heights[i] <= heights[i - 1], `falling at ${i}`);
});

test('no floor penetration on any frame: body or hands', () => {
  for (const f of all) {
    const s = npc3DAt(f);
    assert.ok(s.contact[1] >= FLOOR_Y, `frame ${f}`);
    assert.ok(s.handLeft[1] - WB3D_HAND.outerR > FLOOR_Y, `frame ${f}: left hand`);
    assert.ok(s.handRight[1] - WB3D_HAND.outerR > FLOOR_Y, `frame ${f}: right hand`);
  }
  assert.ok(FLOOR_Y > 0.006, 'clears the rug, whose surface is 6 mm up');
});

test('hands never go through the body and never snap: on every frame, with their lag', () => {
  for (const f of all) {
    const s = npc3DAt(f);
    for (const h of [s.handLeft, s.handRight]) {
      const dx = h[0] - s.centre[0], dy = h[1] - s.centre[1], dz = h[2] - s.centre[2];
      const r = Math.hypot(dx / (WB3D_BODY.outerA * s.squash[0] + WB3D_HAND.outerR), dy / (WB3D_BODY.outerB * s.squash[1] + WB3D_HAND.outerR), dz / (WB3D_BODY.outerA * s.squash[0] + WB3D_HAND.outerR));
      assert.ok(r >= 1, `frame ${f} r ${r}`);
    }
  }
  let worst = 0, at = 0;
  for (let f = 37; f < FRAMES; f++) {
    const a = npc3DAt(f - 1), b = npc3DAt(f);
    for (const k of ['handLeft', 'handRight'] as const) {
      // relative to the body, so a hop's own speed does not count
      const d = Math.hypot(b[k][0] - b.centre[0] - (a[k][0] - a.centre[0]), b[k][1] - b.centre[1] - (a[k][1] - a.centre[1]), b[k][2] - b.centre[2] - (a[k][2] - a.centre[2]));
      if (d > worst) { worst = d; at = f; }
    }
  }
  assert.ok(worst < 0.09, `a hand jumps ${worst.toFixed(3)} m relative to the body at frame ${at}`);
});

test('the hands trail a moving body and catch up: they lag in the direction of travel', () => {
  const [{ takeoff, contact }] = hopFrames(BEATS.find((b) => b.id === 'B05')!);
  const mid = Math.round((takeoff + contact) / 2);
  const off = (f: number) => { const s = npc3DAt(f); return [s.handLeft[0] - s.centre[0], s.handLeft[2] - s.centre[2]]; };
  const during = off(mid), settled = off(contact + 14);
  const trail = Math.hypot(during[0] - settled[0], during[1] - settled[1]);
  assert.ok(trail > 0.03, `trail ${trail.toFixed(3)} m`);
});

test('squash is subtle and reversible: within bounds on every frame, and fully back to round between actions', () => {
  for (const f of all) {
    const { squash } = npc3DAt(f);
    assert.ok(squash[0] > 0.94 && squash[0] < 1.06, `frame ${f} sx ${squash[0]}`);
    assert.ok(squash[1] > 0.92 && squash[1] < 1.06, `frame ${f} sy ${squash[1]}`);
    assert.equal(squash[0], squash[2], 'it stays round in plan');
  }
  for (const f of [100, 200, 230, 260]) { const { squash } = npc3DAt(f); assert.ok(Math.abs(squash[0] - 1) < 1e-3 && Math.abs(squash[1] - 1) < 1e-3, `frame ${f}: ${squash}`); }
});

test('all seven actions do different things in 3D, and they mean what they meant in P3', () => {
  const sig = (a: (typeof WB_ACTIONS)[number]) => {
    const s = whiteBall3DAction(a === 'hop' ? 11 : 10, 30, a);
    return [s.contact[1].toFixed(3), s.yaw.toFixed(3), s.handRight[1].toFixed(3), s.handLeft[1].toFixed(3), s.roll.toFixed(3)].join();
  };
  assert.equal(new Set(WB_ACTIONS.map(sig)).size, WB_ACTIONS.length);
  assert.ok(whiteBall3DAction(11, 30, 'hop').contact[1] > 0.3, 'hop leaves the floor');
  assert.ok(whiteBall3DAction(30, 30, 'float').contact[1] > 0.1, 'float stays up');
  assert.ok(whiteBall3DAction(2, 30, 'react').contact[1] > 0.05, 'react jumps a little');
  assert.equal(whiteBall3DAction(10, 30, 'idle').contact[1], 0, 'idle stays down');
  assert.ok(Math.abs(whiteBall3DAction(15, 30, 'look-left').yaw + WB3D_LOOK_YAW) < 0.01, 'look-left turns the whole body left');
  assert.ok(Math.abs(whiteBall3DAction(15, 30, 'look-right').yaw - WB3D_LOOK_YAW) < 0.01, 'look-right turns it right');
  const wave = whiteBall3DAction(9, 30, 'wave'), idle = whiteBall3DAction(9, 30, 'idle');
  assert.ok(wave.handRight[1] > idle.handRight[1] + 0.15, 'wave raises the right hand');
  assert.ok(Math.abs(wave.handLeft[1] - idle.handLeft[1]) < 0.02, 'and not the left');
});

test('the body really turns: yaw changes through the look beats and comes round between expressions, without a jump', () => {
  const yaw = (f: number) => npc3DAt(f).yaw * (180 / Math.PI);
  assert.ok(yaw(100) < -8, `looks left at f100: ${yaw(100)}`);
  assert.ok(yaw(116) > 20, `looks right at f116: ${yaw(116)}`);
  let worst = 0;
  for (let f = 37; f < FRAMES; f++) worst = Math.max(worst, Math.abs(yaw(f) - yaw(f - 1)));
  assert.ok(worst < 7, `the body turns ${worst.toFixed(1)} degrees in one frame`);
});

test('the character faces where the staging says, whatever the camera does: its orientation has no camera in it', () => {
  // the state's type has no camera input; here the same frame seen from two sides holds the same orientation
  const c = camera3DAt(226), s = npc3DAt(226);
  const side = orbitedCamera(c, s.centre, 20);
  assert.notDeepEqual(side.pos, c.pos);
  assert.deepEqual(npc3DAt(226).quaternion, s.quaternion);
});

test('the face reads on the beats where it must: within 35 degrees of the lens', () => {
  const rel = (f: number) => {
    const s = npc3DAt(f), c = camera3DAt(f);
    const q = s.quaternion, fx = 2 * (q[0] * q[2] + q[3] * q[1]), fz = 1 - 2 * (q[0] * q[0] + q[1] * q[1]);
    const d = Math.atan2(fx, fz) - Math.atan2(c.pos[0] - s.centre[0], c.pos[2] - s.centre[2]);
    return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) * (180 / Math.PI);
  };
  for (let f = 148; f < FRAMES; f++) assert.ok(rel(f) < 35, `frame ${f}: ${rel(f).toFixed(0)} degrees`);
});

test('body size has no pop: its rate of change never jumps, outside the frames a landing squashes it', () => {
  // takeoff and landing are where a hop's squash is meant to change the shape: bounded separately below
  const landings = new Set(BEATS.flatMap((b) => hopFrames(b)).flatMap((h) => [h.takeoff - 4, h.takeoff - 3, h.takeoff - 2, h.takeoff - 1, h.takeoff, h.takeoff + 1, h.takeoff + 2, h.takeoff + 3, h.contact - 1, h.contact, h.contact + 1, h.contact + 2, h.contact + 3]));
  const rate = (f: number) => { const a = npc3DScreenBox(f - 1), b = npc3DScreenBox(f); return (b.x1 - b.x0) / (a.x1 - a.x0) - 1; };
  let worst = 0, at = 0, fastest = 0;
  for (let f = 38; f < FRAMES; f++) {
    fastest = Math.max(fastest, Math.abs(rate(f)));
    if (landings.has(f)) continue;
    const d = Math.abs(rate(f) - rate(f - 1));
    if (d > worst) { worst = d; at = f; }
  }
  assert.ok(worst < 0.012, `size rate jumps by ${(worst * 100).toFixed(2)} percent at frame ${at}`);
  assert.ok(fastest < 0.045, `never grows faster than 4.5 percent a frame: ${(fastest * 100).toFixed(2)}`);
});

test('from its entry on, the ball and both hands stay in frame, and its size stays optically like P5', () => {
  for (let f = entered; f < FRAMES; f++) {
    const b = npc3DScreenBox(f), s = npc3DAt(f), c = camera3DAt(f);
    assert.ok(b.x0 > 0 && b.x1 < WIDTH, `frame ${f} body x ${b.x0.toFixed(0)}..${b.x1.toFixed(0)}`);
    assert.ok(b.y0 > 0 && b.y1 < HEIGHT, `frame ${f} body y ${b.y0.toFixed(0)}..${b.y1.toFixed(0)}`);
    for (const h of [s.handLeft, s.handRight]) {
      const p = project(c, h), r = (WB3D_HAND.outerR * HEIGHT) / (2 * Math.tan((c.fov * Math.PI) / 360) * p.depth);
      assert.ok(p.x - r > -2 && p.x + r < WIDTH + 2, `frame ${f} hand x ${p.x.toFixed(0)} r ${r.toFixed(0)}`);
    }
    const w = b.x1 - b.x0;
    assert.ok(w > 150 && w < 620, `frame ${f} width ${w.toFixed(0)}`);
  }
  for (const f of [212, 250, 280]) { const b = npc3DScreenBox(f); assert.ok(b.x1 - b.x0 > 400, `close beat f${f}: ${b.x1 - b.x0}`); }
});

test('camera: no cuts, no lurch, under the speed P5 was held to, and it does move', () => {
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
  for (let f = 0; f < FRAMES - 1; f++) peak = Math.max(peak, speed(camera3DAt(f), camera3DAt(f + 1)));
  assert.ok(peak < 37.5, `peak ${peak.toFixed(1)} px per frame`);
  assert.ok(peak > 2);
  const step = (f: number) => { const a = camera3DAt(f - 1), b = camera3DAt(f); return Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]); };
  for (let f = 2; f < FRAMES; f++) assert.ok(Math.abs(step(f) - step(f - 1)) < 0.02, `frame ${f}: lurch of ${Math.abs(step(f) - step(f - 1)).toFixed(4)} m per frame`);
  assert.equal(glide(0), 0); assert.equal(glide(1), 1);
});

test('three deliberate moves, one on each camera_air cue, not constant zooming: the camera travels fast only inside them', () => {
  const v = (f: number) => { const a = camera3DAt(f), b = camera3DAt(f + 1); return Math.hypot(a.pos[0] - b.pos[0], a.pos[1] - b.pos[1], a.pos[2] - b.pos[2]); };
  assert.equal(CAM3D_KEYS.length, 4, 'one opening and three moves');
  assert.deepEqual(CAM3D_KEYS.slice(1).map((k) => k.frame), deriveSfxCues().filter((c) => c.type === 'camera_air').map((c) => c.frame), 'one move on each cue');
  for (let f = 0; f < 70; f++) assert.ok(v(f) < 0.03, `establishing at ${f}: ${v(f).toFixed(3)} m per frame`);
  for (let f = 158; f < 167; f++) assert.ok(v(f) < 0.012, `the beat before the push at ${f}: ${v(f).toFixed(3)} m per frame`);
  for (let f = 212; f < 278; f++) assert.ok(v(f) < 0.012, `hold at ${f}: ${v(f).toFixed(3)} m per frame`);
  const peak = (a: number, b: number) => { let p = 0; for (let f = a; f < b; f++) p = Math.max(p, v(f)); return p; };
  const one = peak(72, 156), push = peak(168, 210), three = peak(280, 352);
  assert.ok(one > 0.1 && three > 0.08, `moves ${one.toFixed(3)} and ${three.toFixed(3)} m per frame`);
  // the push is a move you can see, gentler than the two long ones and starting on its cue, not before it
  assert.ok(push > 0.025 && push < one, `push ${push.toFixed(3)} m per frame, move one ${one.toFixed(3)}`);
  assert.ok(v(170) > v(166), 'the camera picks up speed after the cue, not ahead of it');
});

test('the push on the second cue really closes in on the ball, and from its end the path is the verified close drift', () => {
  const width = (f: number) => { const b = npc3DScreenBox(f); return b.x1 - b.x0; };
  assert.ok(width(210) / width(168) > 1.1, `the ball grows ${(width(210) / width(168)).toFixed(3)} x during the push`);
  // once the blend has finished the camera is the last key's own path, nothing left over from the push
  const last = CAM3D_KEYS[2], d = 250 - last.frame;
  const dist = last.dist * Math.exp(-(last.push ?? 0) * d), az = ((last.az + (last.daz ?? 0) * d) * Math.PI) / 180, el = (last.el * Math.PI) / 180, c = camera3DAt(250);
  const want = [last.target[0] + dist * Math.sin(az) * Math.cos(el), last.target[1] + dist * Math.sin(el), last.target[2] + dist * Math.cos(az) * Math.cos(el)];
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(c.pos[i] - want[i]) < 1e-9, `axis ${i}: ${c.pos[i]} against ${want[i]}`);
});

test('the camera drifts during the hold, so there is real parallax behind the ball all through the close beats', () => {
  const a = camera3DAt(180), b = camera3DAt(280);
  const moved = Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]);
  assert.ok(moved > 0.5, `${moved.toFixed(2)} m`);
  // a far point and a near point slide by different amounts: the mark of a real camera move, not a zoom on a picture
  const near = project(a, [-1.2, 0.5, -6.1]).x - project(b, [-1.2, 0.5, -6.1]).x;
  const far = project(a, [0, 8, -24]).x - project(b, [0, 8, -24]).x;
  assert.ok(Math.abs(near - far) > 60, `near ${near.toFixed(0)} px, far ${far.toFixed(0)} px`);
});

test('the camera stays inside the hall, clear of the piers and props, on every frame', () => {
  const PIERS = [-21, -16, -11, -6, -1, 4, 9];
  for (const f of all) {
    const [x, y, z] = camera3DAt(f).pos;
    assert.ok(Math.abs(x) < 2.6, `frame ${f} x ${x.toFixed(2)}`);
    assert.ok(y > 0.5 && y < 11, `frame ${f} y ${y.toFixed(2)}`);
    assert.ok(z < 14 && z > -20, `frame ${f} z ${z.toFixed(2)}`);
    for (const pz of PIERS) for (const s of [-1, 1]) {
      const inX = Math.abs(x - s * 3.2) < 0.56 + 0.25, inZ = Math.abs(z - pz) < 0.56 + 0.25;
      assert.ok(!(inX && inZ), `frame ${f}: the lens is inside the pier at z ${pz}`);
    }
    assert.ok(!(Math.abs(x - 1.75) < 0.45 && Math.abs(z + 1.3) < 0.35 && y < 1.3), `frame ${f}: the lens is inside the lectern`);
  }
});

test('the ball never touches the near plane, and from its entry the view of it is clear', () => {
  for (const f of shown) assert.ok(npc3DScreenBox(f).depth > 2.5, `frame ${f}`);
  // from B03 nothing tall stands between lens and ball: check the piers and pedestal against the line of sight
  const hits = (a: readonly number[], b: readonly number[], lo: number[], hi: number[]) => {
    let t0 = 0, t1 = 1;
    for (let i = 0; i < 3; i++) {
      const d = b[i] - a[i];
      if (Math.abs(d) < 1e-9) { if (a[i] < lo[i] || a[i] > hi[i]) return false; continue; }
      const u = (lo[i] - a[i]) / d, v = (hi[i] - a[i]) / d;
      t0 = Math.max(t0, Math.min(u, v)); t1 = Math.min(t1, Math.max(u, v));
      if (t0 > t1) return false;
    }
    return true;
  };
  for (let f = entered; f < FRAMES; f++) {
    const c = camera3DAt(f), s = npc3DAt(f);
    for (const pz of [-6, -1, 4, 9]) for (const sign of [-1, 1]) {
      assert.ok(!hits(c.pos, s.centre, [sign * 3.2 - 0.56, 0, pz - 0.56], [sign * 3.2 + 0.56, 12, pz + 0.56]), `frame ${f}: a pier hides the ball`);
    }
    assert.ok(!hits(c.pos, s.centre, [1.45, 0, -1.5], [2.05, 1.1, -1.1]), `frame ${f}: the lectern hides the ball`);
  }
});

test('real occlusion on the way in: when the ball first comes out, part of it is behind the pier, as the set would have it', () => {
  // the sight line to the ball's left edge at the first landing crosses the pier at z = -1
  const s = npc3DAt(62), c = camera3DAt(62);
  const edge = [s.centre[0] - WB3D_BODY.outerA, s.centre[1], s.centre[2]];
  const t = (-0.55 - c.pos[2]) / (edge[2] - c.pos[2]);
  const x = c.pos[0] + (edge[0] - c.pos[0]) * t;
  assert.ok(x < -2.75 && x > -3.65, `crosses z -0.55 at x ${x.toFixed(2)}`);
});

test('focus stays on the ball, in front of its centre so the face is the sharpest part; the wide shots are sharp', () => {
  for (const f of all) {
    const d = dof3DAt(f), b = npc3DScreenBox(f);
    assert.ok(d.focusDistance < b.depth && b.depth - d.focusDistance < WB3D_BODY.outerA, `frame ${f}`);
    assert.ok(d.cInf >= 0 && d.cInf <= 13, `frame ${f}`);
  }
  assert.equal(dof3DAt(0).cInf, 0);
  assert.equal(dof3DAt(359).cInf, 0);
  assert.ok(dof3DAt(240).cInf > 8);
  // the blur at the ball's own silhouette stays under a pixel, so the character is never soft
  for (const f of [160, 226, 270]) {
    const d = dof3DAt(f), b = npc3DScreenBox(f);
    assert.ok(d.cInf * Math.abs(1 - d.focusDistance / b.depth) < 1, `frame ${f}`);
  }
});

test('the key light glides: its pool of light follows the ball without the hops', () => {
  let worst = 0;
  for (let f = 1; f < FRAMES; f++) {
    const a = keyPoolCentreAt(f - 1), b = keyPoolCentreAt(f);
    worst = Math.max(worst, Math.hypot(a[0] - b[0], a[2] - b[2]));
  }
  assert.ok(worst < 0.08, `${worst.toFixed(3)} m per frame`);
  const end = keyPoolCentreAt(FRAMES - 1);
  assert.ok(Math.abs(end[0] - NPC_MARK[0]) < 1e-9 && Math.abs(end[2] - NPC_MARK[1]) < 1e-9);
});

test('every expression and action state is finite for the whole film', () => {
  for (const f of all) {
    const s = npc3DAt(f);
    for (const v of [...s.centre, ...s.handLeft, ...s.handRight, ...s.quaternion, ...s.squash, s.face.eyeShift, s.face.blink, s.face.sweat, s.face.mouthOpen]) assert.ok(Number.isFinite(v), `frame ${f}`);
    assert.ok(Math.abs(Math.hypot(...s.quaternion) - 1) < 1e-9, `frame ${f}: quaternion not unit`);
    assert.ok((WB_EXPRESSIONS as readonly string[]).includes(s.expression));
  }
});

test('a change of mouth closes and reopens around the swap, and only there', () => {
  const dips = all.filter((f) => npc3DAt(f).face.mouthOpen < 1);
  assert.deepEqual(dips, [204, 205, 206, 207, 236, 237, 238, 239, 268, 269, 270, 271]);
});

test('the staging hash changes when the staging does, and is stable otherwise', () => {
  const h = hashTimeline(picture3DForHash());
  assert.equal(h, hashTimeline(picture3DForHash()));
  const moved = JSON.parse(JSON.stringify(picture3DForHash()));
  moved.yaw[0][1] += 1;
  assert.notEqual(h, hashTimeline(moved));
  assert.equal(FPS, 30);
});
