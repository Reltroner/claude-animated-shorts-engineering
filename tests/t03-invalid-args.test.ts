// T03: bad input fails loudly and early, at the API that received it.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeWhiteBallPlace, makeWhiteBallShadow, whiteBallPose, whiteBallSequence, type WBAction, type WBExpression } from '../src/npc/white-ball';

const ok = { frame: 0, fps: 30, x: 0, y: 0, z: 0 } as const;

test('T03 whiteBallPose rejects bad frames', () => {
  for (const frame of [-1, -0.5, 1.5, NaN, Infinity, -Infinity]) {
    assert.throws(() => whiteBallPose(frame, 30, 'idle'), /frame must be a non-negative integer/, `frame ${frame}`);
  }
});

test('T03 whiteBallPose rejects non-positive and non-finite fps', () => {
  for (const fps of [0, -30, NaN, Infinity]) {
    assert.throws(() => whiteBallPose(0, fps, 'idle'), /fps must be positive/, `fps ${fps}`);
  }
});

test('T03 unknown actions are rejected', () => {
  assert.throws(() => whiteBallPose(0, 30, 'moonwalk' as WBAction), /Unknown White Ball action/);
  assert.throws(() => makeWhiteBallPlace({ ...ok, action: 'moonwalk' as WBAction }), /Unknown White Ball action/);
});

test('T03 unknown expressions are rejected', () => {
  assert.throws(() => makeWhiteBallPlace({ ...ok, expression: 'angry' as WBExpression }), /Unknown White Ball expression/);
});

test('T03 invalid placements are rejected', () => {
  for (const bad of [{ x: NaN }, { y: Infinity }, { z: -Infinity }, { scale: 0 }, { scale: -1 }, { scale: NaN }]) {
    assert.throws(() => makeWhiteBallPlace({ ...ok, ...bad }), /Invalid WhiteBall world placement/, JSON.stringify(bad));
  }
  const pose = whiteBallPose(0, 30, 'idle');
  assert.throws(() => makeWhiteBallShadow({ x: NaN, y: 0, z: 0, pose }), /Invalid WhiteBall world placement/);
  assert.throws(() => makeWhiteBallShadow({ x: 0, y: 0, z: 0, scale: 0, pose }), /Invalid WhiteBall world placement/);
});

test('T03 a bad time is rejected when the place is made, not later inside the render loop', () => {
  assert.throws(() => makeWhiteBallPlace({ ...ok, frame: -1 }), /frame must be a non-negative integer/);
  assert.throws(() => makeWhiteBallPlace({ ...ok, fps: 0 }), /fps must be positive/);
});

test('T03 invalid texture resolutions and poses are rejected', () => {
  assert.throws(() => makeWhiteBallPlace({ ...ok, resolution: [0, 1000, 1] }), /resolution/);
  const pose = whiteBallPose(0, 30, 'idle');
  assert.throws(() => makeWhiteBallPlace({ ...ok, pose: { ...pose, lift: NaN } }), /not finite/);
  assert.throws(() => makeWhiteBallPlace({ ...ok, pose: { ...pose, sy: 0 } }), /scale must be positive/);
});

test('T03 sequences reject empty timelines and bad segments', () => {
  assert.throws(() => whiteBallSequence(0, 30, []), /at least one segment/);
  assert.throws(() => whiteBallSequence(0, 30, [{ action: 'hop', expression: 'default', seconds: 0 }]), /seconds must be positive/);
  assert.throws(() => whiteBallSequence(-1, 30, [{ action: 'hop', expression: 'default', seconds: 1 }]), /non-negative integer/);
  assert.throws(() => whiteBallSequence(0, 30, [{ action: 'nope' as WBAction, expression: 'default', seconds: 1 }]), /Unknown White Ball action/);
});
