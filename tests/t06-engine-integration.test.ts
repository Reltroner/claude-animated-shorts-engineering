// T06 (engine half): runs the REAL templates/bridge classes, Pool, Actor, Fx and Pen, with only `document` faked, and
// checks that a WB-NPC-001 place travels the whole path. The live-browser half (WB_TRACE and negative-control renders)
// is checked by tests/visual/run_visual_qa.py on the actual render output.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import * as THREE from 'three';
import { Pen } from '../templates/bridge/toon';
import { makeWhiteBallPlace, makeWhiteBallShadow, whiteBallPose, WB_CARD, WB_SU } from '../src/npc/white-ball';
import { clearMarks, installFakeDom, type RecordingCanvas } from './helpers/recording-canvas';

installFakeDom();
// dynamic: these touch `document` at module scope, so they must load after the shim
const cast = await import('../templates/bridge/cast');
const { NOINK } = await import('../templates/bridge/ink');
const { cardShade } = await import('../templates/bridge/cardshade');
const { WhiteBallStage } = await import('../src/npc/white-ball/WhiteBallStage');
const { whiteBallCardShade } = await import('../src/npc/white-ball/WhiteBallCardShade');

const makeCam = () => {
  const cam = new THREE.PerspectiveCamera(40, 1080 / 1920, 0.1, 100);
  cam.position.set(0, 0.5, 3.7);
  cam.updateMatrixWorld();
  return cam;
};
const place = (frame = 0, extra = {}) => makeWhiteBallPlace({ frame, fps: 30, action: 'hop', expression: 'sparkly-happy', x: 0, y: 0, z: 0, showShadow: false, ...extra });

test('T06 the bridge constants this module relies on are the ones in cast.ts and ink.ts', () => {
  assert.equal(WB_SU, cast.SU, 'design units to metres');
  assert.equal(NOINK, 3);
});

test('T06 the real Pool draws the NPC with the real Pen and returns a CanvasTexture', () => {
  const pool = new cast.Pool();
  const p = place(7);
  const seen: unknown[] = [];
  const r = pool.req(p.key, p.size![0], p.size![1], p.size![2], (x) => { seen.push(x); p.draw(x); });
  assert.ok(!r.tex, 'no texture before flush');
  pool.flush();
  assert.equal(seen.length, 1);
  assert.ok(seen[0] instanceof Pen, 'draw received a Pen from templates/bridge/toon.ts');
  const tex = r.tex as unknown as THREE.CanvasTexture;
  assert.ok(tex instanceof THREE.CanvasTexture, 'flush produced a CanvasTexture');
  const canvas = tex.image as unknown as RecordingCanvas;
  assert.equal(canvas.width, 1200);
  assert.equal(canvas.height, 2000);
  assert.equal(tex.colorSpace, THREE.SRGBColorSpace);
  assert.ok(canvas.ctx.marks.length > 10, 'pixels were drawn to that canvas');
});

test('T06 the stage shows the place through a real Actor on the NOINK layer, and enables that layer on the camera', () => {
  const stage = new WhiteBallStage();
  const cam = makeCam();
  assert.equal(cam.layers.isEnabled(NOINK), false, 'a default camera cannot see the card');
  stage.update({ places: [place(3)], fx: [] }, cam);
  assert.equal(cam.layers.isEnabled(NOINK), true);
  assert.equal(stage.actors.length, 1);
  const actor = stage.actors[0];
  assert.ok(actor instanceof cast.Actor);
  assert.equal(actor.mesh.visible, true);
  assert.equal(actor.mesh.layers.mask, 1 << NOINK);
  assert.ok(actor.mat.map instanceof THREE.CanvasTexture);
  assert.equal(actor.mat.map, actor.r!.tex, 'the material is bound to the texture the pool returned');
  assert.equal(actor.mesh.parent, stage.root);
  assert.equal(stage.trace!.penInstances, 1);
  assert.equal(stage.trace!.mapIsPoolCanvasTexture, true);
});

test('T06 the Actor card keeps the bridge geometry: 600 x 1000 design units, soles on the mesh origin', () => {
  const stage = new WhiteBallStage();
  stage.update({ places: [place()], fx: [] }, makeCam());
  const g = stage.actors[0].mesh.geometry;
  g.computeBoundingBox();
  const b = g.boundingBox!;
  assert.ok(Math.abs(b.max.x - b.min.x - WB_CARD.w * WB_SU) < 1e-6);
  assert.ok(Math.abs(b.max.y - b.min.y - WB_CARD.h * WB_SU) < 1e-6);
  assert.ok(Math.abs(b.min.y + (WB_CARD.h - WB_CARD.groundY) * WB_SU) < 1e-6, 'y = 975 sits at the mesh origin');
});

test('T06 world placement, scale and billboard yaw follow the Place contract', () => {
  const stage = new WhiteBallStage();
  const cam = makeCam();
  cam.position.set(2, 0.5, 2);
  stage.update({ places: [place(0, { x: 0.25, y: 0.5, z: -1, scale: 1.5 })], fx: [] }, cam);
  const m = stage.actors[0].mesh;
  assert.deepEqual(m.position.toArray(), [0.25, 0.5, -1]);
  assert.deepEqual(m.scale.toArray(), [1.5, 1.5, 1.5]);
  assert.ok(Math.abs(m.rotation.y - Math.atan2(2 - 0.25, 2 + 1)) < 1e-9, 'yaw faces the camera');
});

test('T06 the pool reuses textures: the same pose is not redrawn, a new pose is', () => {
  const stage = new WhiteBallStage();
  const cam = makeCam();
  stage.update({ places: [place(0)], fx: [] }, cam);
  assert.equal(stage.trace!.drawCalls, 1);
  stage.update({ places: [place(0)], fx: [] }, cam);
  assert.equal(stage.trace!.drawCalls, 0, 'same key, no redraw');
  stage.update({ places: [place(9)], fx: [] }, cam);
  assert.equal(stage.trace!.drawCalls, 1, 'new pose, one redraw');
  assert.equal(stage.actors.length, 1);
});

test('T06 a redraw on a reused canvas starts clean: the key decides the picture', () => {
  const stage = new WhiteBallStage();
  const cam = makeCam();
  stage.update({ places: [place(0)], fx: [] }, cam);
  const canvas = stage.actors[0].mat.map!.image as RecordingCanvas;
  const first = JSON.stringify(canvas.ctx.marks);
  stage.update({ places: [place(9)], fx: [] }, cam);
  assert.equal(stage.actors[0].mat.map!.image, canvas, 'the free canvas was reused');
  clearMarks(canvas);
  stage.update({ places: [place(0)], fx: [] }, cam);
  assert.equal(JSON.stringify(canvas.ctx.marks), first, 'back at frame 0, the identical drawing');
});

test('T06 the floor shadow travels as a real Fx with the blob multiply material', () => {
  const stage = new WhiteBallStage();
  const pose = whiteBallPose(0, 30, 'idle');
  stage.update({ places: [place(0)], fx: [makeWhiteBallShadow({ x: 0, y: 0, z: 0, pose })] }, makeCam());
  assert.equal(stage.fxs.length, 1);
  const fx = stage.fxs[0];
  assert.ok(fx instanceof cast.Fx);
  assert.equal(fx.mesh.material, fx.blob, 'Fx selected its multiply material from the blob key');
  assert.equal(fx.blob.blendSrc, THREE.ZeroFactor);
  assert.equal(fx.blob.blendDst, THREE.SrcColorFactor);
  assert.equal(fx.mesh.layers.mask, 1 << NOINK);
  assert.ok(Math.abs(fx.mesh.rotation.x + Math.PI / 2) < 1e-9, 'it lies flat on the floor');
  assert.ok(fx.mesh.renderOrder < stage.actors[0].mesh.renderOrder, 'it is drawn before the character');
});

test('T06 the floor shadow narrows as the ball rises', () => {
  const rest = whiteBallPose(0, 30, 'idle');
  const a = makeWhiteBallShadow({ x: 0, y: 0, z: 0, pose: rest });
  const b = makeWhiteBallShadow({ x: 0, y: 0, z: 0, pose: { ...rest, lift: 62, shadowScale: 0.76 } });
  assert.ok(b.w < a.w * 0.8);
  assert.ok(b.h > b.w, 'it flattens less than it narrows; perspective flattens it on screen');
  assert.ok(a.z < 0, 'pushed away from the camera');
});

test('T06 hidden actors and effects stay hidden: nothing stale is left visible', () => {
  const stage = new WhiteBallStage();
  const cam = makeCam();
  const pose = whiteBallPose(0, 30, 'idle');
  stage.update({ places: [place(0)], fx: [makeWhiteBallShadow({ x: 0, y: 0, z: 0, pose })] }, cam);
  stage.update({ places: [], fx: [] }, cam);
  assert.equal(stage.actors[0].mesh.visible, false);
  assert.equal(stage.fxs[0].mesh.visible, false);
});

/** run a material's patch the way three does, on three's own Lambert fragment shader */
const compile = (m: THREE.MeshLambertMaterial) => {
  const shader = { uniforms: {} as Record<string, unknown>, fragmentShader: THREE.ShaderLib.lambert.fragmentShader, vertexShader: THREE.ShaderLib.lambert.vertexShader };
  m.onBeforeCompile(shader as never, {} as never);
  return shader;
};

test('T06 the NPC shading replaces only the human head/torso zones, on this one material', () => {
  const stage = new WhiteBallStage();
  stage.update({ places: [place()], fx: [] }, makeCam());
  const npc = compile(stage.actors[0].mat);
  assert.ok(npc.fragmentShader.includes('sunVis'), 'keeps the shadow-visibility contract');
  assert.ok(npc.fragmentShader.includes('uCharTint'), 'keeps the tint contract');
  assert.ok(!npc.fragmentShader.includes('head'), 'no head zone');
  assert.ok(!npc.fragmentShader.includes('uBodyGrad'), 'no torso gradient');
  assert.ok(!npc.fragmentShader.includes('totalEmissiveRadiance;\n'), 'the outgoing light line was replaced');
  const human = compile(cardShade(new THREE.MeshLambertMaterial()));
  assert.ok(human.fragmentShader.includes('head'), 'the human shader still has its head zone');
  assert.notEqual(stage.actors[0].mat.customProgramCacheKey(), new THREE.MeshLambertMaterial().customProgramCacheKey());
});

test('T06 neutral NPC shading has no tint; scene shading reads the world uniforms', () => {
  const neutral = compile(whiteBallCardShade(new THREE.MeshLambertMaterial())).uniforms as Record<string, { value: unknown }>;
  assert.deepEqual((neutral.uCharTint.value as THREE.Vector3).toArray(), [1, 1, 1]);
  assert.equal(neutral.uCharShade.value, 1);
  const scene = compile(whiteBallCardShade(new THREE.MeshLambertMaterial(), { sceneTint: true })).uniforms as Record<string, { value: unknown }>;
  assert.notDeepEqual((scene.uCharTint.value as THREE.Vector3).toArray(), [1, 1, 1]);
});

test('T06 the shading option selects the untouched cardShade for comparison', () => {
  const stage = new WhiteBallStage({ shading: 'card' });
  stage.update({ places: [place()], fx: [] }, makeCam());
  assert.equal(stage.actors[0].mat.customProgramCacheKey(), 'card9');
  assert.equal(stage.actors[0].mat.alphaToCoverage, false, 'exactly as Actor set it');
});

test('T06 smooth edges change only the NPC material; the human card keeps Actor settings', () => {
  const npc = new WhiteBallStage({ smoothEdge: true });
  npc.update({ places: [place()], fx: [] }, makeCam());
  assert.equal(npc.actors[0].mat.transparent, true);
  assert.ok(npc.actors[0].mat.alphaTest < 0.1);
  const human = new WhiteBallStage({ smoothEdge: true, shading: 'card' });
  human.update({ places: [place()], fx: [] }, makeCam());
  assert.equal(human.actors[0].mat.transparent, false);
  assert.equal(human.actors[0].mat.alphaTest, 0.5);
});

test('T06 no competing renderer: the compositions and NPC sources never draw an SVG', () => {
  const read = (rel: string) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
  for (const rel of ['../src/npc/white-ball/WhiteBallPen.ts', '../src/npc/white-ball/WhiteBallStage.ts', '../studio/src/scene/WhiteBallScene.tsx', '../studio/src/compositions/WhiteBallTest.tsx', '../studio/src/compositions/WhiteBallExpressions.tsx', '../studio/src/compositions/WhiteBallInspect.tsx']) {
    assert.ok(!/<svg|createElementNS|\.svg['"]/.test(read(rel)), `${rel} uses SVG`);
  }
  const scene = read('../studio/src/compositions/WhiteBallTest.tsx');
  assert.ok(scene.includes('WhiteBallScene'), 'the test composition goes through the three.js scene');
  assert.ok(!scene.includes('RawPenCanvas'), 'the raw diagnostic canvas is not part of it');
  const stageSrc = read('../src/npc/white-ball/WhiteBallStage.ts');
  assert.ok(stageSrc.includes("from '../../../templates/bridge/cast'"), 'the stage imports the protected cast.ts');
});
