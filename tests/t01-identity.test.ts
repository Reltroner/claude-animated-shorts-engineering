// T01: the stable id, and the expressions and actions agree with the spec document.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { DEFAULT_NPC_ID, WB_ACTIONS, WB_EXPRESSIONS, makeWhiteBallPlace, whiteBallKey, whiteBallPose } from '../src/npc/white-ball';

const spec = JSON.parse(fs.readFileSync(new URL('../docs/character-default-spec.json', import.meta.url), 'utf8'));

test('T01 the stable id is WB-NPC-001 and matches the spec', () => {
  assert.equal(DEFAULT_NPC_ID, 'WB-NPC-001');
  assert.equal(spec.characterId, DEFAULT_NPC_ID);
});

test('T01 the expression and action lists are exactly the contract lists', () => {
  assert.deepEqual([...WB_EXPRESSIONS], spec.expressions);
  assert.deepEqual([...WB_ACTIONS], spec.actions);
  assert.equal(WB_EXPRESSIONS.length, 7);
  assert.equal(WB_ACTIONS.length, 7);
});

test('T01 every expression and action is accepted by the pose and placement APIs', () => {
  for (const action of WB_ACTIONS) {
    assert.ok(Object.isFrozen(whiteBallPose(0, 30, action)));
    for (const expression of WB_EXPRESSIONS) {
      const place = makeWhiteBallPlace({ frame: 3, fps: 30, expression, action, x: 0, y: 0, z: 0 });
      assert.ok(place.key.startsWith(`${DEFAULT_NPC_ID}|${expression}|`), place.key);
      assert.deepEqual(place.size, [1200, 2000, 2]);
    }
  }
});

test('T01 the texture key identifies the character, expression and pose', () => {
  const p = whiteBallPose(0, 30, 'idle');
  assert.notEqual(whiteBallKey('default', p, false), whiteBallKey('wink', p, false));
  assert.notEqual(whiteBallKey('default', p, false), whiteBallKey('default', p, true));
  assert.notEqual(whiteBallKey('default', p, false), whiteBallKey('default', { ...p, lift: 9 }, false));
});
