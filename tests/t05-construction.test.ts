// T05 (construction half): reads WHAT the Pen draws, through a recording canvas, in final card coordinates.
// This proves the drawing's structure only. The pixel half runs on real rendered stills in tests/visual/run_visual_qa.py.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Pen as PenType } from '../templates/bridge/toon';
import { Pen } from '../templates/bridge/toon';
import {
  WB_ACTIONS, WB_BODY, WB_CARD, WB_COLOR, WB_EXPRESSIONS, WB_HAND, WB_HAND_REST, WB_K, drawWhiteBallPen, drawWhiteBallPose, whiteBallPose, whiteBallSequence, type WBExpression, type WBPose,
} from '../src/npc/white-ball';
import { WB_TEST_SEGMENTS } from '../studio/src/timeline';
import { RecordingContext2D, type Mark } from './helpers/recording-canvas';

const draw = (expression: WBExpression, pose: WBPose, showShadow = false) => {
  const g = new RecordingContext2D();
  drawWhiteBallPose(new Pen(g as unknown as CanvasRenderingContext2D) as PenType, expression, pose, { showShadow });
  assert.equal(g.depth, 0, 'save/restore balanced');
  return g.marks;
};

/** fit a circle-or-ellipse summary of a mark's points */
const shapeOf = (m: Mark) => {
  const xs = m.points.map((p) => p[0]), ys = m.points.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, rx: (x1 - x0) / 2, ry: (y1 - y0) / 2 };
};
const closedStrokes = (marks: Mark[]) => marks.filter((m) => {
  if (m.kind !== 'stroke' || m.style !== WB_COLOR.ink || m.points.length < 40) return false;
  const a = m.points[0], b = m.points[m.points.length - 1];
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6;
});

const handR = (WB_HAND.outerR - WB_HAND.outline / 2) * WB_K;
const handOutlines = (marks: Mark[]) => closedStrokes(marks).filter((m) => { const s = shapeOf(m); return Math.abs(s.rx - handR) < 1 && Math.abs(s.ry - handR) < 1; });
const bodyOutlines = (marks: Mark[]) => closedStrokes(marks).filter((m) => shapeOf(m).rx > 150);

const SAMPLES: [string, number][] = WB_ACTIONS.flatMap((a) => [0, 7, 13, 21, 34].map((f) => [a, f] as [string, number]));
const allPoses = () => SAMPLES.map(([a, f]) => whiteBallPose(f, 30, a as (typeof WB_ACTIONS)[number]));

test('T05 exactly one body outline: near-black, thick, closed', () => {
  for (const expression of WB_EXPRESSIONS) {
    for (const pose of allPoses()) {
      const bodies = bodyOutlines(draw(expression, pose));
      assert.equal(bodies.length, 1, `${expression}: ${bodies.length} body outlines`);
      assert.equal(bodies[0].style, WB_COLOR.ink);
      assert.ok(bodies[0].width > 11 && bodies[0].width < 13, `outline width ${bodies[0].width}`);
    }
  }
});

test('T05 exactly two hands in every expression and pose, always the same size, always round', () => {
  for (const expression of WB_EXPRESSIONS) {
    for (const pose of allPoses()) {
      const hands = handOutlines(draw(expression, pose));
      assert.equal(hands.length, 2, `${expression}: ${hands.length} hands`);
      for (const h of hands) {
        const s = shapeOf(h);
        assert.ok(Math.abs(s.rx - s.ry) < 0.02, `${expression}: hand not circular (${s.rx} x ${s.ry})`);
        assert.ok(Math.abs(h.width - WB_HAND.outline * WB_K) < 0.01);
      }
      const [a, b] = hands.map(shapeOf).sort((p, q) => p.cx - q.cx);
      assert.ok(a.cx < WB_CARD.w / 2 && b.cx > WB_CARD.w / 2, 'one hand each side');
    }
  }
});

test('T05 hands are drawn over the body, as in the source', () => {
  const marks = draw('default', whiteBallPose(0, 30, 'idle'));
  const body = marks.indexOf(bodyOutlines(marks)[0]);
  for (const h of handOutlines(marks)) assert.ok(marks.indexOf(h) > body, 'the hand outline comes after the body outline');
});

test('T05 no arms, legs or anything else: every line stays inside the body or a hand', () => {
  for (const expression of WB_EXPRESSIONS) {
    for (const pose of allPoses()) {
      const marks = draw(expression, pose);
      const b = shapeOf(bodyOutlines(marks)[0]);
      const hands = handOutlines(marks).map(shapeOf);
      for (const m of marks) {
        if (m.kind !== 'stroke') continue;
        for (const [x, y] of m.points) {
          const inBody = ((x - b.cx) / (b.rx + 1)) ** 2 + ((y - b.cy) / (b.ry + 1)) ** 2 <= 1;
          const inHand = hands.some((h) => Math.hypot(x - h.cx, y - h.cy) <= h.rx + 1);
          assert.ok(inBody || inHand, `${expression}: stroke point (${x.toFixed(1)}, ${y.toFixed(1)}) is outside the body and hands`);
        }
      }
    }
  }
});

test('T05 anatomy does not drift: the body and hand sizes are identical across all seven expressions', () => {
  const pose = whiteBallPose(0, 30, 'idle');
  const ref = shapeOf(bodyOutlines(draw('default', pose))[0]);
  for (const expression of WB_EXPRESSIONS) {
    const s = shapeOf(bodyOutlines(draw(expression, pose))[0]);
    for (const k of ['cx', 'cy', 'rx', 'ry'] as const) assert.ok(Math.abs(s[k] - ref[k]) < 1e-9, `${expression} body ${k}`);
  }
});

test('T05 proportions match the measured source', () => {
  const s = shapeOf(bodyOutlines(draw('default', whiteBallPose(0, 30, 'idle')))[0]);
  const outerRx = s.rx + (WB_BODY.outline * WB_K) / 2, outerRy = s.ry + (WB_BODY.outline * WB_K) / 2;
  assert.ok(Math.abs(outerRy / outerRx - 241.2 / 229.8) < 0.003, `h/w ${outerRy / outerRx}`);
  assert.ok(Math.abs(s.cy + outerRy - WB_CARD.groundY) < 0.5, 'the lowest point of the body is on the ground line');
});

test('T05 only the identity palette is used: no skin, hair or clothing colours', () => {
  const allowed = new Set<string>([...Object.values(WB_COLOR), 'gradient', '#ffffff']);
  for (const expression of WB_EXPRESSIONS) {
    for (const pose of allPoses()) {
      for (const m of draw(expression, pose, true)) assert.ok(allowed.has(m.style), `${expression}: colour ${m.style}`);
    }
  }
});

test('T05 mouth and eyes per expression', () => {
  const pose = whiteBallPose(0, 30, 'idle');
  const pinkFills = (e: WBExpression) => draw(e, pose).filter((m) => m.kind === 'fill' && [WB_COLOR.mouth, WB_COLOR.mouthDeep].includes(m.style as never)).length;
  for (const e of ['default', 'happy-closed', 'wink', 'sparkly-happy', 'surprised'] as const) assert.equal(pinkFills(e), 1, `${e} has one pink mouth`);
  // the source's tired and anxious mouths are a line, not an open pink shape
  for (const e of ['tired', 'anxious'] as const) assert.equal(pinkFills(e), 0, `${e} mouth is a line`);
  const drops = (e: WBExpression) => draw(e, { ...pose, sweat: 0.4 }).filter((m) => m.style === WB_COLOR.dropFill && m.kind === 'fill').length;
  assert.ok(drops('anxious') >= 1, 'anxious has the sweat drop');
  for (const e of WB_EXPRESSIONS.filter((x) => x !== 'anxious')) assert.equal(drops(e), 0, `${e} has no sweat drop`);
});

test('T05 all seven expressions draw different faces', () => {
  const pose = whiteBallPose(0, 30, 'idle');
  const sig = (e: WBExpression) => JSON.stringify(draw(e, pose).map((m) => [m.kind, m.style, m.points.length, m.points[0]?.map((v) => Math.round(v))]));
  const all = WB_EXPRESSIONS.map(sig);
  assert.equal(new Set(all).size, 7);
});

test('T05 blink is really drawn: a shut pose removes the open eye rings where eyes are open', () => {
  const open = whiteBallPose(0, 30, 'idle'), shut = { ...open, blink: 1 }, half = { ...open, blink: 0.5 };
  for (const expression of ['default', 'sparkly-happy', 'surprised', 'wink', 'tired', 'anxious'] as const) {
    const a = JSON.stringify(draw(expression, open).map((m) => m.points)), b = JSON.stringify(draw(expression, shut).map((m) => m.points)), c = JSON.stringify(draw(expression, half).map((m) => m.points));
    assert.notEqual(a, b, `${expression}: blink changes the drawing`);
    assert.notEqual(a, c, `${expression}: a half blink changes the drawing`);
    assert.ok(draw(expression, shut).length < draw(expression, open).length, `${expression}: fewer marks with the eyes shut`);
  }
  // the periodic blink reaches the drawing through the ordinary pose API: t = 3.1 s is frame 93 at 30 fps
  const f93 = whiteBallPose(93, 30, 'idle');
  assert.equal(f93.blink, 1);
  assert.notEqual(JSON.stringify(draw('default', f93).map((m) => m.points)), JSON.stringify(draw('default', open).map((m) => m.points)));
  // happy-closed eyes are already shut, so a blink has nothing to change there
  assert.equal(JSON.stringify(draw('happy-closed', shut).map((m) => m.points)), JSON.stringify(draw('happy-closed', open).map((m) => m.points)));
});

test('T05 no part of the character leaves the 600 x 1000 card in any pose, so the card never clips it', () => {
  const poses = [...allPoses(), ...Array.from({ length: 60 }, (_, f) => whiteBallSequence(f, 30, WB_TEST_SEGMENTS, { loop: true }).pose)];
  for (const expression of WB_EXPRESSIONS) {
    for (const pose of poses) {
      for (const m of draw(expression, pose, true)) {
        const half = m.width / 2;
        for (const [x, y] of m.points) {
          assert.ok(x - half >= 0 && x + half <= WB_CARD.w && y - half >= 0 && y + half <= WB_CARD.h, `${expression}: (${x.toFixed(1)}, ${y.toFixed(1)}) w ${m.width} leaves the card`);
        }
      }
    }
  }
});

test('T05 the card shadow is opaque, because Actor alphaTest 0.5 would erase a translucent one, and shrinks when the ball rises', () => {
  const shadowOf = (pose: WBPose) => draw('default', pose, true).find((m) => m.style === WB_COLOR.shadow && m.kind === 'fill')!;
  const grounded = shadowOf(whiteBallPose(0, 30, 'idle'));
  assert.equal(grounded.alpha, 1);
  const up = shadowOf({ ...whiteBallPose(0, 30, 'idle'), lift: 62, shadowScale: 0.76 });
  assert.equal(up.alpha, 1);
  assert.ok(shapeOf(up).rx < shapeOf(grounded).rx * 0.8);
  assert.ok(shapeOf(grounded).cy > WB_CARD.groundY - 20 && shapeOf(grounded).cy < WB_CARD.groundY, 'it overlaps the body bottom when grounded');
});

test('T05 nothing translucent can reach the alpha-tested edge: only the interior sweat drop fades', () => {
  for (const expression of WB_EXPRESSIONS) {
    for (const pose of [...allPoses(), { ...whiteBallPose(0, 30, 'idle'), sweat: 0.95 }]) {
      for (const m of draw(expression, pose, true)) {
        if (m.alpha === 1) continue;
        assert.equal(expression, 'anxious');
        assert.ok([WB_COLOR.dropFill, WB_COLOR.dropDeep, WB_COLOR.dropGlow, WB_COLOR.dropEdge, WB_COLOR.dropHighlight].includes(m.style as never), m.style);
      }
    }
  }
});

test('T05 the hands use the measured per-expression rest positions', () => {
  const pose = whiteBallPose(0, 30, 'idle');
  for (const expression of WB_EXPRESSIONS) {
    const [l, r] = handOutlines(draw(expression, pose)).map(shapeOf).sort((p, q) => p.cx - q.cx);
    const rest = WB_HAND_REST[expression];
    const bodyCy = WB_CARD.groundY - WB_BODY.ry * WB_K;
    assert.ok(Math.abs(l.cx - (WB_CARD.w / 2 + rest.left[0] * WB_K)) < 0.01, `${expression} left x`);
    assert.ok(Math.abs(r.cx - (WB_CARD.w / 2 + rest.right[0] * WB_K)) < 0.01, `${expression} right x`);
    assert.ok(Math.abs(l.cy - (bodyCy + rest.left[1] * WB_K)) < 0.01, `${expression} left y`);
    assert.ok(Math.abs(r.cy - (bodyCy + rest.right[1] * WB_K)) < 0.01, `${expression} right y`);
  }
});

test('T05 drawWhiteBallPen keeps its original API and defaults', () => {
  const g = new RecordingContext2D();
  drawWhiteBallPen(new Pen(g as unknown as CanvasRenderingContext2D), { frame: 12 });
  assert.equal(handOutlines(g.marks).length, 2);
  assert.equal(g.marks.filter((m) => m.style === WB_COLOR.shadow).length, 1, 'draws its shadow by default');
  const g2 = new RecordingContext2D();
  drawWhiteBallPen(new Pen(g2 as unknown as CanvasRenderingContext2D), { frame: 12, showShadow: false, expression: 'wink', action: 'hop', fps: 24 });
  assert.equal(g2.marks.filter((m) => m.style === WB_COLOR.shadow).length, 0);
});
