/** P7B: nation profiles are thin adapters over the unchanged genuine P6 rig. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import * as THREE from 'three';
import { whiteBallPose } from '../src/npc/white-ball';
import {
  WB3D_BODY, whiteBall3DState, assertGenuine3DCharacter,
} from '../src/npc/white-ball-3d';
import {
  NATIONAL_PROFILES, P7B_PROOF_CAST, NationalCharacter3D,
  getNationalProfile, resolveNationalCast, nationalEmblemShapes,
  P7B_LANDSCAPE, P7B_PREVIEW, P7B_PROOF_FRAMES, p7bCameraAt,
} from '../src/production/nations';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => readFileSync(path.join(root, p), 'utf8');

test('P7B: national profiles reuse P6 mouth and two detached volumetric hands', () => {
  for (const profile of resolveNationalCast(P7B_PROOF_CAST)) {
    const actor = new NationalCharacter3D(profile);
    const pose = whiteBallPose(0, 30, 'idle');
    actor.update(whiteBall3DState({ x: 0, z: 0, expression: 'default', pose }));
    assertGenuine3DCharacter(actor.root);
    const inventory = actor.rig.inventory();
    assert.equal(inventory.bodies, 1);
    assert.equal(inventory.hands, 2);
    assert.equal(inventory.inkShells, 3);
    assert.equal(inventory.cards, 0);
    assert.equal(inventory.textures, 0);
    assert.ok(inventory.faceTriangles > 0, 'curved expressive face mesh has triangle geometry');
    assert.equal(actor.rig.body.geometry.parameters.widthSegments, 96);
    assert.equal(actor.rig.body.geometry.parameters.heightSegments, 64);
    assert.equal(actor.rig.pivot.children.includes(actor.emblem), true);
    assert.equal(actor.rig.body.material.color.getHexString(), profile.renderColor.slice(1));
    for (const hand of actor.rig.hands) {
      const mesh = hand.children[1] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
      assert.equal(mesh.material.color.getHexString(), profile.renderColor.slice(1));
      assert.equal(mesh.castShadow, true);
    }
  }
});

test('P7B: four registry profiles correspond to the existing countryball guide', () => {
  assert.deepEqual(P7B_PROOF_CAST, [
    'pasgerflitball', 'reltronlandball', 'depcutlandball', 'pencilfaniaball',
  ]);
  assert.equal(getNationalProfile('pasgerflitball').canonColorLabel, 'Sky Blue');
  assert.equal(getNationalProfile('pasgerflitball').emblem, 'airplane');
  assert.equal(getNationalProfile('reltronlandball').emblem, 'skyscraper');
  assert.equal(getNationalProfile('depcutlandball').accessory, 'fedora');
  assert.equal(getNationalProfile('depcutlandball').emblem, 'book-quill');
  assert.equal(getNationalProfile('pencilfaniaball').renderColor, '#69d84f');
  assert.equal(getNationalProfile('pencilfaniaball').renderColorApproval, 'specified-in-guide');
  assert.equal(Object.keys(NATIONAL_PROFILES).length, 4);
});

test('P7B: unnamed color hexes are provisional and creative approval remains pending', () => {
  for (const profile of Object.values(NATIONAL_PROFILES)) {
    assert.equal(profile.creativeApproval, 'pending');
    assert.equal(profile.topology, 'countryball-3d-p6');
    assert.equal(profile.sourceKey, 'countryballGuide');
    assert.match(profile.renderColor, /^#[0-9a-fA-F]{6}$/);
    if (profile.id !== 'pencilfaniaball') assert.equal(profile.renderColorApproval, 'provisional');
  }
});

test('P7B: no fabricated Henchoway, Phantomkind or Cosmeilian character profile', () => {
  for (const id of ['henchowayball', 'phantomkind', 'cosmeilian', 'WB-NPC-001', '__proto__']) {
    assert.throws(() => getNationalProfile(id), /unknown\/unapproved/);
  }
  assert.throws(() => resolveNationalCast(['pasgerflitball', 'pasgerflitball']), /duplicate/);
  assert.throws(() => resolveNationalCast([]), /1–4/);
  assert.throws(() => resolveNationalCast(['reltronlandball', 'henchowayball']), /unknown\/unapproved/);
});

test('P7B: symbolic emblems are unique original extruded solids, not flat textures', () => {
  const shapes = Object.values(NATIONAL_PROFILES).map((p) => nationalEmblemShapes(p.emblem));
  assert.deepEqual(shapes.map((s) => s.length), [1, 3, 3, 2]);
  for (const group of shapes) for (const shape of group) {
    assert.ok(shape instanceof THREE.Shape);
    const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
    assert.equal(geom.type, 'ExtrudeGeometry');
    geom.dispose();
  }
});

test('P7B: only Depcutland has fedora, the emblem follows the rotating P6 pivot', () => {
  for (const profile of Object.values(NATIONAL_PROFILES)) {
    const actor = new NationalCharacter3D(profile);
    assert.equal(actor.accessory !== null, profile.id === 'depcutlandball');
    assert.equal(actor.emblem.parent, actor.rig.pivot);
    assert.equal(actor.accessory?.parent ?? null, actor.accessory ? actor.rig.pivot : null);
    assert.ok(actor.emblem.position.z > 0);
    assert.ok(actor.emblem.position.y < WB3D_BODY.outerB);
    let flatCharacterMesh = 0;
    actor.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && ['PlaneGeometry', 'ShapeGeometry'].includes(mesh.geometry.type)) flatCharacterMesh++;
    });
    assert.equal(flatCharacterMesh, 0);
  }
});

test('P7B: landscape and preview share one 120-frame deterministic timebase', () => {
  assert.deepEqual(P7B_LANDSCAPE, { width: 1920, height: 1080, fps: 30 });
  assert.deepEqual(P7B_PREVIEW, { width: 960, height: 540, fps: 30 });
  assert.equal(P7B_PROOF_FRAMES, 120);
  assert.deepEqual(p7bCameraAt(0), p7bCameraAt(0));
  assert.notDeepEqual(p7bCameraAt(0), p7bCameraAt(119));
  assert.ok(Math.abs(p7bCameraAt(1)[0] - p7bCameraAt(0)[0]) < 0.002);
  assert.ok(Math.abs(p7bCameraAt(119)[0] - p7bCameraAt(118)[0]) < 0.002);
  for (const bad of [-1, 120, NaN, 1.5]) assert.throws(() => p7bCameraAt(bad), /invalid frame/);
});

test('P7B: P7A episode remains a development-only Pencilfania story, not the gallery proof', () => {
  const ep = JSON.parse(read('episodes/landscape/asthortera-ball/season-01/episodes/ep-001/episode.json'));
  assert.equal(ep.workingTitle, 'The Pencilfania Problem');
  assert.equal(ep.storyStatus, 'development-material');
  assert.deepEqual(ep.sceneIds, []);
  assert.equal(ep.approval.publication, 'blocked');
  const program = JSON.parse(read('episodes/landscape/asthortera-ball/program.json'));
  assert.equal(program.characterPerformanceProfileId, 'countryball-3d-p6');
  assert.ok(program.sourceRegistry.countryballGuide.revision.length === 40);
});

test('P7B: additive only; no dependency or P3-P6 source replacement', () => {
  const rootComp = read('studio/src/Root.tsx');
  for (const id of ['WhiteBallArchivePilot3D"', 'WhiteBallArchivePilot"', 'CountryballLandscapeProof"', 'CountryballLandscapeProofPreview"']) {
    assert.ok(rootComp.includes(id), id);
  }
  const scene = read('studio/src/production/CountryballLandscapeScene.tsx');
  assert.ok(scene.includes('new NationalCharacter3D(profile)'));
  assert.ok(scene.includes('whiteBall3DState('));
  assert.ok(!/WhiteBallStage|CanvasTexture|SpriteMaterial|Math\.random|Date\.now|performance\.now/.test(scene));
  assert.ok(!/from ['"](?:react-spring|@react-three\/drei)/.test(scene), 'no added dependency');
});
