// P6 rig: builds the real three.js rig in Node and inspects what it is made of. Includes the negative test the brief asks for: if a
// canvas-card Actor ever stands in for the mesh, assertGenuine3DCharacter must fail.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { WB_ACTIONS, WB_BODY, WB_EXPRESSIONS, WB_HAND, whiteBallPose, type WBPose } from '../src/npc/white-ball';
import { WB3D_BODY, WB3D_HAND, WB3D_HAND_GAP, WB3D_M, WB3D_PEAK, WB3D_SEGMENTS, WhiteBall3DRig, assertGenuine3DCharacter, qRotate, whiteBall3DAction, whiteBall3DForward, whiteBall3DPeak, whiteBall3DState } from '../src/npc/white-ball-3d';

const rest: WBPose = whiteBallPose(0, 30, 'idle');
const state = (o: Partial<Parameters<typeof whiteBall3DState>[0]> = {}) => whiteBall3DState({ expression: 'default', pose: rest, x: 1, z: -2, ...o });
const rig = new WhiteBall3DRig();
rig.update(state());
rig.root.updateMatrixWorld(true);
const meshes: THREE.Mesh[] = [];
rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
const world = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());

test('one body: a real sphere mesh, subdivided, physically lit, with no texture', () => {
  const inv = rig.inventory();
  assert.equal(inv.bodies, 1);
  assert.equal(inv.bodyGeometry, 'SphereGeometry');
  assert.deepEqual(inv.bodySegments, [WB3D_SEGMENTS.width, WB3D_SEGMENTS.height]);
  assert.ok(WB3D_SEGMENTS.width >= 64 && WB3D_SEGMENTS.height >= 48);
  assert.equal(inv.bodyMaterial, 'MeshStandardMaterial');
  assert.equal(rig.body.material.map, null);
  assert.equal(rig.body.material.metalness, 0);
  assert.ok(rig.body.material.roughness >= 0.72 && rig.body.material.roughness <= 0.9);
  assert.equal(rig.body.geometry.getAttribute('position').count, (WB3D_SEGMENTS.width + 1) * (WB3D_SEGMENTS.height + 1));
});

test('exactly two hands, each a separate lit sphere; no arms, legs or anything else', () => {
  const inv = rig.inventory();
  assert.equal(inv.hands, 2);
  assert.equal(inv.handGeometry, 'SphereGeometry');
  assert.equal(inv.handMaterial, 'MeshStandardMaterial');
  assert.equal(inv.inkShells, 3);
  assert.equal(inv.bodies, 1);
  // body + body ink + face + 2 x (hand + hand ink): nothing else exists in the rig
  assert.equal(meshes.length, 7);
  assert.deepEqual(meshes.map((m) => m.name).sort(), ['wb3d-body', 'wb3d-body-ink', 'wb3d-face', 'wb3d-hand-left-ink', 'wb3d-hand-left-sphere', 'wb3d-hand-right-ink', 'wb3d-hand-right-sphere']);
});

test('the inventory counts what is there, so a trace cannot report a body that is gone', () => {
  const r = new WhiteBall3DRig();
  r.body.geometry = new THREE.PlaneGeometry(1, 1) as unknown as THREE.SphereGeometry;
  r.root.remove(r.hands[1]);
  const inv = r.inventory();
  assert.equal(inv.bodies, 0);
  assert.equal(inv.hands, 1);
  assert.equal(inv.cards, 1);
});

test('two characters keep their own occlusion: their state does not leak into each other', () => {
  const a = new WhiteBall3DRig(), b = new WhiteBall3DRig();
  a.update(whiteBall3DAction(0, 30, 'idle', 'default', [5, 5]));
  const before = JSON.stringify((a as unknown as { occlusion: unknown }).occlusion);
  b.update(whiteBall3DAction(0, 30, 'idle', 'default', [-5, -5]));
  assert.equal(JSON.stringify((a as unknown as { occlusion: unknown }).occlusion), before);
});

test('the face is drawn two-sided in one pass: a thin triangle at a grazing angle cannot be culled, and the painting order holds', () => {
  const m = rig.face.material;
  assert.equal(m.side, THREE.DoubleSide);
  assert.equal(m.forceSinglePass, true, 'three would otherwise draw back faces first and paint out of order');
  assert.equal(m.depthWrite, false);
});

const compiled = (material: THREE.Material) => {
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as unknown as Parameters<THREE.Material['onBeforeCompile']>[0];
  material.onBeforeCompile(sh, null as unknown as THREE.WebGLRenderer);
  return sh.fragmentShader;
};

test('the character is never brighter than a scene threshold of 1: it cannot bloom across its own outline', () => {
  assert.equal(WB3D_PEAK.ceiling, 1);
  assert.equal(whiteBall3DPeak(0.3), 0.3, 'below the knee, nothing changes');
  assert.equal(whiteBall3DPeak(WB3D_PEAK.knee), WB3D_PEAK.knee);
  let last = 0;
  for (let r = 0; r < 40; r += 0.01) {
    const out = whiteBall3DPeak(r);
    assert.ok(out >= last, `monotonic at ${r}`);
    assert.ok(out <= WB3D_PEAK.ceiling, `${r} maps to ${out}`);
    assert.ok(r - out >= -1e-12, 'it only ever darkens');
    last = out;
  }
  const e = 1e-6, k = WB3D_PEAK.knee;
  assert.ok(Math.abs((whiteBall3DPeak(k + e) - k) / e - 1) < 1e-3, 'no visible corner where the roll-off starts');
  // all of it in the shaders that really run, on the body, the hands and the face, and placed after the lighting
  const hand = rig.hands[0].children.map((c) => (c as THREE.Mesh).material as THREE.Material).find((x) => x.type === 'MeshStandardMaterial');
  for (const material of [rig.body.material, rig.face.material, hand as THREE.Material]) {
    const frag = compiled(material);
    assert.match(frag, /wb3Peak/);
    assert.ok(frag.indexOf('wb3Peak') > frag.indexOf('#include <lights_fragment_end>'));
    assert.ok(frag.indexOf('wb3Peak') < frag.indexOf('#include <opaque_fragment>'));
  }
});

test('only the face overrides the two-sided normal flip: the rest of the rig keeps three.js behaviour', () => {
  assert.match(compiled(rig.face.material), /normal = normalize\( vNormal \);/);
  assert.doesNotMatch(compiled(rig.body.material), /normal = normalize\( vNormal \);\n/);
});

test('the rig holds no textures, no cards and no sprites', () => {
  const inv = rig.inventory();
  assert.equal(inv.textures, 0);
  assert.equal(inv.cards, 0);
  assert.equal(inv.faceHasTexture, false);
  assert.ok(inv.faceTriangles > 400);
  for (const m of meshes) assert.notEqual(m.geometry.type, 'PlaneGeometry');
});

test('NEGATIVE: the guard passes the real rig and fails anything that fakes it', () => {
  assertGenuine3DCharacter(rig.root);
  // a canvas-card Actor, the P3 way of drawing the ball: one textured plane
  const card = new THREE.Group();
  card.add(new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.2), new THREE.MeshLambertMaterial({ map: new THREE.Texture() })));
  assert.throws(() => assertGenuine3DCharacter(card), /not a genuine 3D character/);
  // a sprite
  const sprite = new THREE.Group();
  sprite.add(new THREE.Sprite(new THREE.SpriteMaterial()));
  assert.throws(() => assertGenuine3DCharacter(sprite), /sprite/);
  // the real rig with a texture slipped onto the body
  const textured = new WhiteBall3DRig();
  textured.body.material.map = new THREE.Texture();
  assert.throws(() => assertGenuine3DCharacter(textured.root), /texture/);
  // the real rig with its body swapped for a card
  const swapped = new WhiteBall3DRig();
  swapped.body.geometry = new THREE.PlaneGeometry(1, 1) as unknown as THREE.SphereGeometry;
  assert.throws(() => assertGenuine3DCharacter(swapped.root), /flat PlaneGeometry/);
  // a third hand
  const extra = new WhiteBall3DRig();
  extra.root.add(new THREE.Mesh(new THREE.SphereGeometry(0.1), new THREE.MeshStandardMaterial()));
  assert.throws(() => assertGenuine3DCharacter(extra.root), /4 lit spheres/);
});

test('the sizes are the measured P3 sizes', () => {
  assert.ok(Math.abs(WB3D_BODY.outerA - WB_BODY.rx * WB3D_M) < 1e-12);
  assert.ok(Math.abs(WB3D_BODY.outerB - WB_BODY.ry * WB3D_M) < 1e-12);
  assert.ok(Math.abs(WB3D_BODY.outerA - WB3D_BODY.a - WB_BODY.outline * WB3D_M) < 1e-12, 'the ink is the measured width');
  assert.ok(Math.abs(WB3D_HAND.outerR - WB_HAND.outerR * WB3D_M) < 1e-12);
  assert.ok(Math.abs(WB3D_HAND.outerR - WB3D_HAND.r - WB_HAND.outline * WB3D_M) < 1e-12);
  assert.ok(Math.abs(rig.body.scale.x - WB3D_BODY.a) < 1e-9 && Math.abs(rig.body.scale.y - WB3D_BODY.b) < 1e-9 && Math.abs(rig.body.scale.z - WB3D_BODY.c) < 1e-9);
  assert.ok(Math.abs(rig.ink.scale.y - WB3D_BODY.outerB) < 1e-9);
});

test('the body centre is one radius above the floor at rest, and the lowest point of the ink touches it', () => {
  const s = state({ floorY: 0.25 });
  assert.ok(Math.abs(s.centre[1] - (0.25 + WB3D_BODY.outerB)) < 1e-9);
  assert.equal(s.contact[1], 0.25);
  const r = new WhiteBall3DRig();
  r.update(s);
  r.root.updateMatrixWorld(true);
  const b = world(r.body);
  assert.ok(Math.abs(b.y - s.centre[1]) < 1e-9, 'the mesh is where the state says');
  assert.ok(Math.abs(b.x - s.centre[0]) < 1e-9 && Math.abs(b.z - s.centre[2]) < 1e-9);
  const box = new THREE.Box3().setFromObject(r.ink, true);
  assert.ok(Math.abs(box.min.y - 0.25) < 1e-3, `lowest point ${box.min.y}`);
});

test('the outline is an inside-out shell around the real body: back faces only, a little larger, unlit, casting nothing', () => {
  assert.equal(rig.ink.material.side, THREE.BackSide);
  assert.equal(rig.ink.material.type, 'MeshBasicMaterial');
  assert.equal(rig.ink.geometry, rig.body.geometry);
  assert.equal(rig.ink.castShadow, false, 'it would shade the body inside it');
  for (const h of rig.hands) {
    const shell = h.children[0] as THREE.Mesh, skin = h.children[1] as THREE.Mesh;
    assert.equal((shell.material as THREE.Material).side, THREE.BackSide);
    assert.ok(shell.scale.x > skin.scale.x);
  }
});

test('shadows: the body and both hands cast and receive; the shell and face cast nothing', () => {
  const inv = rig.inventory();
  assert.deepEqual([...inv.castShadow].sort(), ['wb3d-body', 'wb3d-hand-left-sphere', 'wb3d-hand-right-sphere']);
  for (const n of ['wb3d-body', 'wb3d-face', 'wb3d-hand-left-sphere', 'wb3d-hand-right-sphere']) assert.ok(inv.receiveShadow.includes(n), n);
});

test('the face turns with the body as one object: same pivot, no billboard, and update() has no camera to look at', () => {
  assert.equal(rig.face.parent, rig.pivot);
  assert.equal(rig.body.parent, rig.pivot);
  assert.equal(rig.update.length, 1, 'update takes the state and nothing else');
  const a = new WhiteBall3DRig(), s = state({ yaw: 0.7 });
  a.update(s);
  a.root.updateMatrixWorld(true);
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(a.face.getWorldQuaternion(new THREE.Quaternion()));
  assert.ok(Math.abs(fwd.x - Math.sin(0.7)) < 1e-6 && Math.abs(fwd.z - Math.cos(0.7)) < 1e-6);
  assert.ok(Math.abs(whiteBall3DForward(s)[0] - Math.sin(0.7)) < 1e-9);
});

test('yaw foreshortens for real: turned 40 degrees, the far eye narrows and the near eye does not', () => {
  // project the rig's own face vertices straight on, from far away
  const widths = (yaw: number) => {
    const s = state({ yaw }), f = (rig.update(s), rig.face.geometry.getAttribute('position'));
    let lo0 = Infinity, hi0 = -Infinity, lo1 = Infinity, hi1 = -Infinity;
    for (let i = 0; i < f.count; i++) {
      const v: [number, number, number] = [f.getX(i), f.getY(i), f.getZ(i)];
      const r = qRotate(s.quaternion, v);
      if (v[1] < 0) continue; // the eyes only
      if (v[0] < 0) { lo0 = Math.min(lo0, r[0]); hi0 = Math.max(hi0, r[0]); } else { lo1 = Math.min(lo1, r[0]); hi1 = Math.max(hi1, r[0]); }
    }
    return { left: hi0 - lo0, right: hi1 - lo1 };
  };
  const front = widths(0), turned = widths((40 * Math.PI) / 180);
  assert.ok(Math.abs(front.left - front.right) < 0.003, 'equal from the front');
  assert.ok(turned.right < front.right * 0.75, `far eye ${turned.right.toFixed(3)} vs ${front.right.toFixed(3)}`);
  assert.ok(turned.left > front.left * 0.92, `near eye ${turned.left.toFixed(3)} vs ${front.left.toFixed(3)}`);
  rig.update(state());
});

test('hands have real depth and stay clear of the body in every expression and action', () => {
  const clearance = (s: ReturnType<typeof state>, h: readonly [number, number, number]) => {
    const dx = h[0] - s.centre[0], dy = h[1] - s.centre[1], dz = h[2] - s.centre[2];
    return Math.hypot(dx / (WB3D_BODY.outerA * s.squash[0] + WB3D_HAND.outerR), dy / (WB3D_BODY.outerB * s.squash[1] + WB3D_HAND.outerR), dz / (WB3D_BODY.outerA * s.squash[0] + WB3D_HAND.outerR));
  };
  for (const e of WB_EXPRESSIONS) for (const a of WB_ACTIONS) for (const f of [0, 5, 11, 17, 24, 30, 44]) {
    const s = whiteBall3DAction(f, 30, a, e);
    assert.ok(clearance(s, s.handLeft) >= 1, `${e} ${a} f${f} left ${clearance(s, s.handLeft)}`);
    assert.ok(clearance(s, s.handRight) >= 1, `${e} ${a} f${f} right ${clearance(s, s.handRight)}`);
    assert.ok(s.handLeft[1] - WB3D_HAND.outerR > s.contact[1], `${e} ${a} f${f}: left hand through the floor`);
    assert.ok(s.handRight[1] - WB3D_HAND.outerR > s.contact[1], `${e} ${a} f${f}: right hand through the floor`);
  }
  const s = state();
  assert.ok(s.handLeft[2] > s.centre[2] + 0.25 && s.handRight[2] > s.centre[2] + 0.25, 'they stand in front of the body, in depth, not on a plane through it');
  assert.ok(WB3D_HAND_GAP > 0);
});

test('hands keep clear when pushed: an offset that would drive a hand into the body stops at the surface', () => {
  const pushed = state({ handOffset: { left: [0.5, 0, -0.5], right: [-0.5, 0, -0.5] } });
  for (const h of [pushed.handLeft, pushed.handRight]) {
    const dx = h[0] - pushed.centre[0], dy = h[1] - pushed.centre[1], dz = h[2] - pushed.centre[2];
    const r = Math.hypot(dx / (WB3D_BODY.outerA + WB3D_HAND.outerR), dy / (WB3D_BODY.outerB + WB3D_HAND.outerR), dz / (WB3D_BODY.outerA + WB3D_HAND.outerR));
    assert.ok(r >= 1, `${r}`);
  }
});

test('squash stays on the contact point and is applied along world axes: a landing cannot lift the ball off the floor or sink it', () => {
  const pose = { ...rest, sx: 1.04, sy: 0.94 };
  const s = state({ pose });
  assert.equal(s.contact[1], 0);
  assert.ok(Math.abs(s.centre[1] - WB3D_BODY.outerB * 0.94) < 1e-9);
  const r = new WhiteBall3DRig();
  r.update(s);
  r.root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(r.ink, true);
  assert.ok(Math.abs(box.min.y) < 2e-3, `lowest ${box.min.y}`);
  assert.ok(Math.abs(box.max.y - 2 * WB3D_BODY.outerB * 0.94) < 2e-3, `highest ${box.max.y}`);
  // and it stays a round ball when it turns: the width in x equals the width in z
  assert.ok(Math.abs(box.max.x - box.min.x - (box.max.z - box.min.z)) < 2e-3);
});

test('the rig is a pure function of the state: updating through other states leaves no trace', () => {
  const a = new WhiteBall3DRig(), b = new WhiteBall3DRig();
  const target = whiteBall3DAction(14, 30, 'wave', 'sparkly-happy', [2, -3]);
  a.update(target);
  for (const f of [3, 40]) b.update(whiteBall3DAction(f, 30, 'hop', 'anxious'));
  b.update(target);
  a.root.updateMatrixWorld(true); b.root.updateMatrixWorld(true);
  const dump = (r: WhiteBall3DRig) => { const out: number[] = []; r.root.traverse((o) => out.push(...o.matrixWorld.elements)); return out; };
  assert.deepEqual(dump(a), dump(b));
  assert.equal(a.face.geometry.getAttribute('position').count, b.face.geometry.getAttribute('position').count);
});
