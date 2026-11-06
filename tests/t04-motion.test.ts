// T04: at least four actions really move, by amounts that matter on screen; none is a static pose in disguise.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WB_ACTIONS, WB_HAND_REST, WB_HOP, WB_HOP_PERIOD, WB_K, whiteBallPose, whiteBallSequence, type WBAction } from '../src/npc/white-ball';
import { WB_TEST_FPS, WB_TEST_SEGMENTS } from '../studio/src/timeline';

const FPS = 30;
const series = (a: WBAction, n = 90) => Array.from({ length: n }, (_, f) => whiteBallPose(f, FPS, a));
const range = (a: WBAction, k: keyof ReturnType<typeof whiteBallPose>, n = 90) => {
  const v = series(a, n).map((p) => p[k]);
  return Math.max(...v) - Math.min(...v);
};
/** total movement of the body and hands in one pose compared to another, in design units */
const distance = (p: ReturnType<typeof whiteBallPose>, q: ReturnType<typeof whiteBallPose>) =>
  Math.abs(p.lift - q.lift) + Math.abs(p.leftHandLift - q.leftHandLift) + Math.abs(p.rightHandLift - q.rightHandLift)
  + Math.abs(p.leftHandOut - q.leftHandOut) + Math.abs(p.rightHandOut - q.rightHandOut) + Math.abs(p.eyeShift - q.eyeShift) + 100 * Math.abs(p.sy - q.sy);

test('T04 hop leaves the ground at the measured height, then lands', () => {
  assert.ok(Math.abs(range('hop', 'lift') - WB_HOP.height) < 2, `lift range ${range('hop', 'lift')}`);
  const p = series('hop');
  const apex = p.reduce((a, b) => (b.lift > a.lift ? b : a));
  assert.ok(apex.shadowScale < 0.8, 'the shadow narrows at the apex');
  assert.equal(whiteBallPose(0, FPS, 'hop').lift, 0);
  assert.ok(Math.min(...p.map((x) => x.sy)) < 0.975, 'it squashes');
  assert.ok(Math.abs(Math.min(...p.map((x) => x.lift))) < 1e-9, 'it returns to the ground');
  assert.ok(WB_HOP_PERIOD > 0.5 && WB_HOP_PERIOD < 1.2);
});

test('T04 the implemented hop follows the flight measured in the source', () => {
  // lift in px over the source's hop of frames 176-190 at 24 fps, from tests/visual/measure_source.py:
  // it leaves the ground at frame 175.3 and lands at 190.1, peaking at 67 px
  const measured: [number, number][] = [[176, 18], [177, 32], [178, 43], [179, 52], [180, 59], [181, 64], [182, 66], [183, 67], [184, 65], [185, 61], [186, 54], [187, 44], [188, 32], [189, 17]];
  for (const [f, px] of measured) {
    const u = (f - 175.3) / 14.8;
    // the same moment of the flight in the implementation, at 1 ms resolution
    const ms = Math.round((WB_HOP.anticipate + u * WB_HOP.flight) * 1000);
    const lift = whiteBallPose(ms, 1000, 'hop').lift;
    assert.ok(Math.abs(lift / WB_HOP.height - px / 67) < 0.14, `frame ${f}: implementation ${(lift / WB_HOP.height).toFixed(3)} vs source ${(px / 67).toFixed(3)} of the peak`);
  }
});

test('T04 float bobs and rolls continuously', () => {
  assert.ok(range('float', 'lift') > 20, `lift range ${range('float', 'lift')}`);
  assert.ok(range('float', 'rollDeg') > 2);
  assert.ok(Math.min(...series('float').map((p) => p.lift)) > 20, 'it stays off the ground');
});

test('T04 wave lifts the right hand and swings it; the left hand stays low', () => {
  assert.ok(range('wave', 'rightHandLift') > 100, `lift range ${range('wave', 'rightHandLift')}`);
  const held = series('wave').slice(8);
  const out = held.map((p) => p.rightHandOut);
  assert.ok(Math.max(...out) - Math.min(...out) > 25, 'it swings sideways');
  assert.ok(range('wave', 'leftHandLift') < 10);
});

test('T04 react pulses, then settles', () => {
  const p = series('react', 36);
  const peak = Math.max(...p.map((x) => x.lift));
  assert.ok(peak > 20, `peak ${peak}`);
  assert.equal(p[0].lift, 0, 'it starts from rest instead of popping');
  assert.ok(p[30].lift < 1, `settled lift ${p[30].lift}`);
  assert.ok(Math.max(...p.map((x) => x.rightHandOut)) > 20, 'the hands fly out');
});

test('T04 looks are movements, not static poses: eyes travel and the body sways', () => {
  for (const [a, sign] of [['look-left', -1], ['look-right', 1]] as const) {
    const p = series(a);
    assert.equal(p[0].eyeShift, 0, 'starts straight ahead');
    assert.ok(p[12].eyeShift * sign > 10, `${a} eyes travel`);
    assert.ok(p[12].rollDeg * sign > 1.5, `${a} body rolls that way`);
    assert.ok(range(a, 'rollDeg') > 2.5, `${a} keeps moving after it arrives`);
  }
});

test('T04 idle moves the hands by the measured sway while the body stays put', () => {
  assert.ok(range('idle', 'leftHandOut') > 5 && range('idle', 'leftHandOut') < 8, 'hands sway about +-3.4 units');
  assert.equal(range('idle', 'lift'), 0);
});

test('T04 at least four actions differ measurably between distinct frames', () => {
  const moving = WB_ACTIONS.filter((a) => {
    const p = series(a);
    return distance(p[2], p[10]) > 5 && distance(p[10], p[20]) > 2;
  });
  assert.ok(moving.length >= 4, `moving: ${moving.join(', ')}`);
  for (const a of ['hop', 'float', 'wave', 'react'] as const) assert.ok(moving.includes(a), `${a} must move`);
});

test('T04 the 60-frame clip has four action segments of 26, 14, 10 and 10 frames', () => {
  const states = Array.from({ length: 60 }, (_, f) => whiteBallSequence(f, WB_TEST_FPS, WB_TEST_SEGMENTS, { loop: true }));
  const count = (a: WBAction) => states.filter((s) => s.action === a).length;
  assert.equal(count('hop'), 26);
  assert.equal(count('wave'), 14);
  assert.equal(count('float'), 10);
  assert.equal(count('react'), 10);
  assert.equal(new Set(states.map((s) => s.action)).size, 4);
});

test('T04 the clip moves on every frame and never jumps, including across segment boundaries and the loop', () => {
  const states = Array.from({ length: 121 }, (_, f) => whiteBallSequence(f, WB_TEST_FPS, WB_TEST_SEGMENTS, { loop: true }).pose);
  let still = 0;
  for (let f = 1; f < states.length; f++) {
    const a = states[f - 1], b = states[f];
    assert.ok(Math.abs(a.lift - b.lift) < 30, `lift jumps ${a.lift} -> ${b.lift} at frame ${f}`);
    assert.ok(Math.abs(a.rightHandLift - b.rightHandLift) < 45, `right hand jumps at frame ${f}: ${a.rightHandLift} -> ${b.rightHandLift}`);
    assert.ok(Math.abs(a.rightHandOut - b.rightHandOut) < 30, `right hand out jumps at frame ${f}`);
    assert.ok(Math.abs(a.rollDeg - b.rollDeg) < 2, `roll jumps at frame ${f}`);
    if (distance(a, b) < 0.05) still++;
  }
  assert.ok(still <= 4, `${still} frames show no pose change`);
  // loop closure: frame 60 repeats frame 0, and frame 59 is close to it
  assert.deepEqual(states[60], states[0]);
  assert.ok(distance(states[59], states[0]) < 20, `loop seam ${distance(states[59], states[0])}`);
});

test('T04 hand rest positions blend across an expression swap instead of popping', () => {
  // wave -> float swaps happy-closed -> surprised, whose left hand rests 16 px further out
  const shown = (f: number) => {
    const st = whiteBallSequence(f, WB_TEST_FPS, WB_TEST_SEGMENTS, { loop: true });
    return { x: WB_HAND_REST[st.expression].left[0] * WB_K - st.pose.leftHandOut, y: WB_HAND_REST[st.expression].left[1] * WB_K + st.pose.leftHandLift, ...st };
  };
  const before = shown(39), first = shown(40);
  assert.equal(before.expression, 'happy-closed');
  assert.equal(first.expression, 'surprised');
  assert.equal(first.pose.blink, 1, 'a blink hides the swap');
  const restJump = Math.abs(WB_HAND_REST.surprised.left[0] - WB_HAND_REST['happy-closed'].left[0]) * WB_K;
  assert.ok(restJump > 14, `the two rest positions are ${restJump} units apart`);
  assert.ok(Math.abs(first.x - before.x) < restJump / 2, `the hand moved ${Math.abs(first.x - before.x)} units across the swap`);
  // The same check at every expression change in the clip and around the loop seam. Rest positions in these swaps are 15-19
  // units apart, so an unblended swap would exceed 16; the largest intended motion here is react's hand pulse, 12.5 units.
  for (const f of [26, 27, 40, 41, 42, 50, 51, 52, 57, 58, 59]) {
    const a = shown(f - 1), b = shown(f);
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 16, `left hand jumps ${Math.hypot(a.x - b.x, a.y - b.y).toFixed(1)} units at frame ${f}`);
  }
});
