// T02: same frame + fps + action -> same pose, and animation time is seconds, not frame indices.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { WB_ACTIONS, quantizeWhiteBallPose, whiteBallPose, whiteBallSequence, whiteBallSequenceFrames } from '../src/npc/white-ball';
import { WB_TEST_FPS, WB_TEST_SEGMENTS } from '../studio/src/timeline';

test('T02 repeated pose evaluation is identical down to the bit', () => {
  for (const action of WB_ACTIONS) {
    for (const fps of [24, 30, 60]) {
      for (let frame = 0; frame < 300; frame += 7) {
        assert.deepEqual(whiteBallPose(frame, fps, action), whiteBallPose(frame, fps, action));
      }
    }
  }
});

test('T02 evaluation order does not matter', () => {
  const frames = Array.from({ length: 120 }, (_, i) => i);
  for (const action of WB_ACTIONS) {
    const forward = frames.map((f) => whiteBallPose(f, 30, action));
    const backward = [...frames].reverse().map((f) => whiteBallPose(f, 30, action)).reverse();
    assert.deepEqual(forward, backward);
  }
});

test('T02 the same second gives the same pose at 24 and 30 fps', () => {
  // 1 s, 2 s, 5 s land on integer frames at both rates
  for (const action of WB_ACTIONS) {
    for (const s of [1, 2, 5]) {
      const a = whiteBallPose(24 * s, 24, action), b = whiteBallPose(30 * s, 30, action);
      assert.deepEqual(a, b, `${action} at ${s} s`);
    }
  }
});

test('T02 the sequence is a pure function of its frame', () => {
  for (const f of [0, 13, 25, 26, 27, 39, 40, 41, 49, 50, 59, 60, 119]) {
    const a = whiteBallSequence(f, WB_TEST_FPS, WB_TEST_SEGMENTS, { loop: true });
    whiteBallSequence((f * 3 + 7) % 60, WB_TEST_FPS, WB_TEST_SEGMENTS, { loop: true });
    assert.deepEqual(a, whiteBallSequence(f, WB_TEST_FPS, WB_TEST_SEGMENTS, { loop: true }));
  }
});

test('T02 the clip keeps its timing at another frame rate', () => {
  assert.equal(whiteBallSequenceFrames(30, WB_TEST_SEGMENTS), 60);
  assert.equal(whiteBallSequenceFrames(60, WB_TEST_SEGMENTS), 120);
  assert.equal(whiteBallSequenceFrames(24, WB_TEST_SEGMENTS), 48);
  // frames away from every blend window: the same second, the same pose
  for (const f of [5, 12, 20, 30, 35, 45, 54]) {
    const a = whiteBallSequence(f, 30, WB_TEST_SEGMENTS, { loop: true }), b = whiteBallSequence(f * 2, 60, WB_TEST_SEGMENTS, { loop: true });
    assert.equal(a.action, b.action);
    assert.equal(a.expression, b.expression);
    for (const k of Object.keys(a.pose) as (keyof typeof a.pose)[]) assert.ok(Math.abs(a.pose[k] - b.pose[k]) < 1e-6, `frame ${f} ${k}: ${a.pose[k]} vs ${b.pose[k]}`);
  }
});

test('T02 without looping, the sequence holds its last frame', () => {
  const last = whiteBallSequence(59, 30, WB_TEST_SEGMENTS);
  assert.deepEqual(whiteBallSequence(500, 30, WB_TEST_SEGMENTS), last);
  assert.equal(last.action, 'react');
});

test('T02 quantized poses are stable: quantizing twice changes nothing, and -0 becomes 0', () => {
  for (const action of WB_ACTIONS) {
    for (let f = 0; f < 60; f++) {
      const q = quantizeWhiteBallPose(whiteBallPose(f, 30, action));
      assert.deepEqual(q, quantizeWhiteBallPose(q));
      for (const v of Object.values(q)) assert.ok(!Object.is(v, -0));
    }
  }
});

test('T02 runtime sources contain no clock, unseeded randomness or animation-frame state', () => {
  const root = new URL('..', import.meta.url);
  const dirs = ['src/npc/white-ball', 'studio/src', 'studio/src/compositions', 'studio/src/scene'];
  const banned = /\b(Math\.random|Date\.now|new Date\(|performance\.now|requestAnimationFrame|useFrame|getElapsedTime|THREE\.Clock)\b/;
  let scanned = 0;
  for (const d of dirs) {
    const dir = path.join(root.pathname.replace(/^\/([A-Za-z]:)/, '$1'), d);
    for (const name of fs.readdirSync(dir)) {
      if (!/\.tsx?$/.test(name)) continue;
      const text = fs.readFileSync(path.join(dir, name), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      assert.ok(!banned.test(text), `${d}/${name} uses a non-deterministic source: ${text.match(banned)?.[0]}`);
      scanned++;
    }
  }
  assert.ok(scanned >= 10, `scanned only ${scanned} files`);
});
