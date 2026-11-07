// P5 world: builds the real hall and the real WhiteBallStage with only `document` faked, and inspects what they contain.
// It proves structure, not pixels. Pixels are checked on the real render by tests/visual/p5_video_qa.py.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { makeWhiteBallPlace, makeWhiteBallShadow } from '../src/npc/white-ball';
import { FRAMES, HEIGHT, WIDTH, cameraAt, npcAt } from '../src/pilot/archive/episode';

/** a canvas whose 2D context accepts anything: these tests look at the scene, not at what was painted */
class NullCanvas {
  width = 1; height = 1;
  getContext() {
    const gradient = { addColorStop() { /* nothing */ } };
    return new Proxy({}, {
      get: (_t, k) => {
        if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => gradient;
        if (k === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
        return () => undefined;
      },
      set: () => true,
    });
  }
}
(globalThis as unknown as { document: unknown }).document = { createElement: () => new NullCanvas(), createElementNS: () => new NullCanvas() };

const { NOINK } = await import('../templates/bridge/ink');
const { ArchiveHall, ARCHIVE_LIGHT, HALL, PIERS } = await import('../studio/src/pilot/ArchiveHall');
const { WhiteBallStage } = await import('../src/npc/white-ball/WhiteBallStage');

const hall = new ArchiveHall();
const scene = new THREE.Scene();
scene.add(hall.root);
const cam = new THREE.PerspectiveCamera(44, WIDTH / HEIGHT, 0.2, 220);
const pose = (f: number) => {
  const c = cameraAt(f);
  cam.position.set(...c.pos); cam.fov = c.fov; cam.lookAt(...c.look); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  hall.update(f, cam, scene);
  scene.updateMatrixWorld(true);
};
pose(0);

const meshes: THREE.Mesh[] = [];
hall.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
const materials = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshLambertMaterial[];

test('it is a real 3D set with geometry, not a flat backdrop', () => {
  let triangles = 0;
  const min = new THREE.Vector3(Infinity, Infinity, Infinity), max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (const m of meshes) {
    const pos = m.geometry.getAttribute('position');
    triangles += m.geometry.index ? m.geometry.index.count / 3 : pos.count / 3;
    if (m.layers.mask === 1) {
      m.geometry.computeBoundingBox();
      min.min(m.geometry.boundingBox!.min); max.max(m.geometry.boundingBox!.max);
    }
  }
  assert.ok(triangles > 5000, `${triangles} triangles`);
  assert.ok(max.x - min.x > 7 && max.y - min.y > 12 && max.z - min.z > 35, 'it fills a hall-sized volume');
  assert.ok(PIERS.length >= 5);
  assert.ok(HALL.height > 10);
});

test('every texture comes from a procedural canvas, and no image file is ever used', () => {
  let maps = 0;
  for (const m of meshes) for (const mat of materials(m)) {
    const tex = mat.map;
    if (!tex) continue;
    maps++;
    assert.ok(tex.image instanceof NullCanvas, `${m.name} ${mat.type} has a texture that did not come from a canvas`);
  }
  assert.ok(maps > 8, `${maps} maps`);
});

test('world surfaces use the bridge two-tone shading, with the pool term on top', () => {
  const lit = meshes.filter((m) => materials(m).some((x) => x.isMeshLambertMaterial));
  assert.ok(lit.length > 5);
  for (const m of lit) for (const mat of materials(m)) {
    if (!mat.isMeshLambertMaterial) continue;
    const key = mat.customProgramCacheKey();
    assert.match(key, /twoTone/, `${mat.type} key ${key}`);
    assert.match(key, /archivePools/, `${mat.type} key ${key}`);
  }
});

test('ink rules: glows, sky and additive sheets stay out of the ink pass; solid world geometry stays in it', () => {
  let inked = 0, skipped = 0;
  for (const m of meshes) {
    const noDepth = materials(m).some((x) => x.depthWrite === false);
    if (noDepth) assert.equal(m.layers.mask, 1 << NOINK, 'anything that writes no depth is never inked');
    if (m.layers.mask === 1) inked++; else skipped++;
  }
  assert.ok(inked >= 5, `${inked} inked meshes`);
  assert.ok(skipped >= 5, `${skipped} no-ink meshes`);
});

test('the sun casts real shadows, and nothing that casts moves, so the shadow is rendered once', () => {
  assert.equal(hall.sun.castShadow, true);
  assert.equal(hall.sun.shadow.autoUpdate, false);
  const casters = meshes.filter((m) => m.castShadow);
  assert.ok(casters.length > 3);
  for (const m of casters) assert.equal(m.matrixAutoUpdate, false, 'static batches');
});

test('the same frame always poses the same scene, whatever came before', () => {
  const state = () => {
    const out: number[] = [];
    hall.root.traverse((o) => { o.updateMatrix(); out.push(...o.matrix.elements); });
    for (const m of meshes) for (const mat of materials(m)) { const c = mat.color; if (c) out.push(c.r, c.g, c.b); }
    return JSON.stringify(out);
  };
  pose(226); const a = state();
  pose(0); pose(359); pose(17);
  pose(226); assert.equal(state(), a);
});

test('the artifact is self-lit, turns, and glows more in SC-003 than at the start', () => {
  const crystal = meshes.find((m) => m.geometry.type === 'IcosahedronGeometry')!;
  assert.ok(crystal, 'the artifact is a faceted solid');
  const mat = crystal.material as THREE.MeshBasicMaterial;
  pose(100); const quiet = mat.color.r, r0 = crystal.rotation.y;
  pose(230); const lit = mat.color.r, r1 = crystal.rotation.y;
  assert.ok(lit > quiet * 1.5, `${quiet} -> ${lit}`);
  assert.notEqual(r0, r1);
  assert.ok(lit > 1, 'it reaches the bloom threshold');
});

test('ARCHIVE_LIGHT: coloured shadows, warm key', () => {
  const { lit, shade } = ARCHIVE_LIGHT;
  assert.ok(lit[0] > lit[2], 'warm key');
  assert.ok(shade[2] > shade[0], 'blue-violet shade');
  assert.ok(shade[0] < lit[0], 'shade is darker than lit');
});

test('only WB-NPC-001 is ever drawn: every frame of the pilot asks the real Pool for one NPC card at most', () => {
  const stage = new WhiteBallStage({ shading: 'npc', smoothEdge: true, sceneTint: true, fog: false });
  for (let f = 0; f < FRAMES; f += 3) {
    const n = npcAt(f);
    const places = n.visible ? [makeWhiteBallPlace({ frame: f, fps: 30, expression: n.expression, pose: n.pose, x: n.x, y: 0, z: n.z, showShadow: false, resolution: [300, 500, 0.5] })] : [];
    for (const p of places) assert.match(p.key, /^WB-NPC-001\|/);
    pose(f);
    stage.update({ places, fx: places.length ? [makeWhiteBallShadow({ x: n.x, y: 0.008, z: n.z, pose: n.pose })] : [] }, cam);
    assert.ok(stage.trace!.actorsVisible <= 1);
    assert.equal(stage.trace!.actorsVisible, places.length);
    if (places.length) {
      assert.equal(stage.trace!.penInstances, stage.trace!.drawCalls, 'every drawing went through a real Pen');
      assert.ok(stage.trace!.mapIsPoolCanvasTexture);
    }
  }
  const mat = stage.actors[0].mat;
  assert.match(mat.customProgramCacheKey(), /wb-npc-card/, 'the NPC shader, not the human card shader');
  assert.equal(mat.fog, false, 'the hall haze cannot grey the body');
  assert.equal(stage.actors[0].mesh.layers.mask, 1 << NOINK, 'no second outline from the world ink');
  assert.ok(cam.layers.isEnabled(NOINK));
});
