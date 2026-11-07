// P6 provenance and the boundary around it: P5 and P3 keep working untouched, no card sneaks into the 3D path, the study material stays out of
// the tracked tree, versions stay pinned, and the character has no clock. Reads source text and git.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
const git = (...a: string[]) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' });
/** code without comments: comments may legitimately name the things the code must not use */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');

const P6 = [
  'src/npc/white-ball-3d/WhiteBall3DFace.ts', 'src/npc/white-ball-3d/WhiteBall3DPose.ts', 'src/npc/white-ball-3d/WhiteBall3DRig.ts', 'src/npc/white-ball-3d/index.ts',
  'src/pilot/archive/episode3d.ts', 'src/pilot/archive/audio-lock3d.ts',
  'studio/src/pilot/ArchiveWorld3D.ts', 'studio/src/pilot/ArchiveScene3D.tsx', 'studio/src/compositions/WhiteBallArchivePilot3D.tsx',
];

test('every P6 runtime source exists', () => { for (const f of P6) assert.ok(fs.existsSync(path.join(root, f)), f); });

test('NEGATIVE: the 3D path imports nothing from the card pipeline, and has no canvas texture, sprite or billboard', () => {
  for (const f of P6) {
    const s = strip(read(f));
    for (const banned of [/WhiteBallStage/, /makeWhiteBallPlace/, /makeWhiteBallShadow/, /WhiteBallCardShade/, /whiteBallCardShade/, /bridge\/cast/, /\bActor\b/, /\bPool\b/, /CanvasTexture/, /\.createElement\(/, /new THREE\.Sprite\b/, /SpriteMaterial/, /new THREE\.PlaneGeometry/, /TextureLoader/]) {
      assert.ok(!banned.test(s), `${f} matches ${banned}`);
    }
  }
});

test('the scene builds the real rig and checks it is genuine at the point of use', () => {
  const s = strip(read('studio/src/pilot/ArchiveScene3D.tsx'));
  assert.match(s, /new WhiteBall3DRig\(/);
  assert.match(s, /assertGenuine3DCharacter\(/);
  assert.match(s, /<ThreeCanvas/);
  assert.match(s, /from '@remotion\/three'/);
});

test('nothing in the character or the staging reads a clock or randomness, and useFrame only tells the composer to draw', () => {
  for (const f of P6) {
    const s = strip(read(f));
    for (const banned of [/Math\.random/, /Date\.now/, /new Date\b/, /performance\.now/, /requestAnimationFrame/, /setTimeout/, /setInterval/, /\.getElapsedTime/, /THREE\.Clock/, /new THREE\.Timer/]) {
      assert.ok(!banned.test(s), `${f} uses ${banned}`);
    }
  }
  const scene = strip(read('studio/src/pilot/ArchiveScene3D.tsx'));
  const calls = scene.match(/useFrame\([^\n]*/g) ?? [];
  assert.equal(calls.length, 1);
  assert.equal(calls[0], 'useFrame(() => { post.composer.render(); }, 1);', 'no delta, no state, a positive priority');
});

test('the rig does not look at the camera: no lookAt, no billboard quaternion copy, no camera anywhere in the character code', () => {
  for (const f of ['src/npc/white-ball-3d/WhiteBall3DFace.ts', 'src/npc/white-ball-3d/WhiteBall3DPose.ts', 'src/npc/white-ball-3d/WhiteBall3DRig.ts']) {
    const s = strip(read(f));
    for (const banned of [/lookAt/, /\bcamera\b/i, /\bcam\b/, /quaternion\.copy/, /viewMatrix\s*\*\s*position/]) {
      // viewMatrix appears once, to bring the shading normal to world space: that is not the geometry following the lens
      assert.ok(!banned.test(s), `${f} matches ${banned}`);
    }
  }
});

test('the character has only the P3 identity: it imports its numbers and its drawing instead of keeping its own copy', () => {
  const face = strip(read('src/npc/white-ball-3d/WhiteBall3DFace.ts'));
  assert.match(face, /drawFace/);
  assert.match(face, /from '\.\.\/white-ball\/WhiteBallPen'/);
  assert.match(face, /templates\/bridge\/toon/);
  const pose = strip(read('src/npc/white-ball-3d/WhiteBall3DPose.ts'));
  assert.match(pose, /WB_HAND_REST/);
  // no stray measured face constants in the 3D path: every eye and mouth number stays in WhiteBallPen.ts and WhiteBallRig.ts
  assert.ok(!/41\.25|43\.25|77\.9|76\.1/.test(face + pose));
});

test('the stage still has the P3 and P5 paths, untouched by the 3D work', () => {
  const root_ = read('studio/src/Root.tsx');
  for (const id of ['WhiteBallNpcTest', 'WhiteBallExpressions', 'WhiteBallArchivePilot"', 'WhiteBallInspect', 'WhiteBallArchivePilot3D"']) assert.ok(root_.includes(id), id);
  const p5Scene = strip(read('studio/src/pilot/ArchiveScene.tsx'));
  assert.match(p5Scene, /WhiteBallStage/, 'P5 still draws its card');
  assert.match(p5Scene, /makeWhiteBallPlace/);
  assert.ok(!/white-ball-3d/.test(p5Scene), 'and P5 does not know about the rig');
  assert.ok(!/episode3d/.test(read('src/pilot/archive/episode.ts')), 'the timeline does not depend on the staging');
  // P3 code and the P5 timeline, scene and audio are byte-identical to the baseline commit, apart from the two exports the 3D path reads
  for (const f of ['src/npc/white-ball/WhiteBallPose.ts', 'src/npc/white-ball/WhiteBallRig.ts', 'src/npc/white-ball/WhiteBallBridge.ts', 'src/npc/white-ball/WhiteBallStage.ts', 'src/npc/white-ball/WhiteBallSequence.ts', 'src/npc/white-ball/WhiteBallCardShade.ts',
    'src/pilot/archive/episode.ts', 'src/pilot/archive/audio-lock.ts', 'studio/src/pilot/ArchiveScene.tsx', 'studio/src/pilot/archivePaint.ts', 'studio/src/compositions/WhiteBallArchivePilot.tsx', 'studio/audio/archive_pilot_audio.py', 'studio/scripts/mux-p5.ts', 'studio/scripts/render-p5.mjs']) {
    assert.equal(git('diff', '--stat', 'fb44995', '--', f).trim(), '', `${f} changed since the P5 commit`);
  }
  const pen = git('diff', 'fb44995', '--', 'src/npc/white-ball/WhiteBallPen.ts').split('\n').filter((l) => /^[-+][^-+]/.test(l));
  assert.deepEqual(pen.map((l) => l.trim().replace(/\r$/, '')), ['-function drawFace(p: Pen, expr: WBExpression, pose: WBPose): void {', '+export function drawFace(p: Pen, expr: WBExpression, pose: WBPose): void {']);
  const hall = git('diff', 'fb44995', '--', 'studio/src/pilot/ArchiveHall.ts').split('\n').filter((l) => /^[-+][^-+]/.test(l));
  assert.deepEqual(hall.map((l) => l.trim().replace(/\r$/, '')), ['-const POOL_N = 12;', '-const POOLS = {', '+export const POOL_N = 12;', '+export const POOLS = {']);
});

test('protected baseline: templates, references, SKILL.md and LICENSE are untouched', () => {
  assert.equal(git('status', '--porcelain', '--', 'templates', 'references', 'SKILL.md', 'LICENSE').trim(), '');
  assert.equal(git('diff', '--stat', 'fb44995', '--', 'templates', 'references', 'SKILL.md', 'LICENSE').trim(), '');
});

test('versions stay pinned: three 0.187.0, Remotion 4.0.541, React 19.3.1, and the lockfile has not moved', () => {
  const studio = JSON.parse(read('studio/package.json')), rootPkg = JSON.parse(read('package.json'));
  assert.equal(rootPkg.dependencies.three, '0.187.0');
  assert.equal(studio.dependencies.three, '0.187.0');
  assert.equal(studio.dependencies.remotion, '4.0.541');
  assert.equal(studio.dependencies['@remotion/three'], '4.0.541');
  assert.equal(studio.dependencies.react, '19.3.1');
  assert.equal(git('diff', '--stat', 'fb44995', '--', 'package-lock.json').trim(), '', 'no dependency change');
  const before = JSON.parse(git('show', 'fb44995:studio/package.json')), beforeRoot = JSON.parse(git('show', 'fb44995:package.json'));
  assert.deepEqual(studio.dependencies, before.dependencies);
  assert.deepEqual(studio.devDependencies, before.devDependencies);
  assert.deepEqual(rootPkg.dependencies, beforeRoot.dependencies);
  assert.deepEqual(rootPkg.devDependencies, beforeRoot.devDependencies);
});

test('the study material stays out: ignored, untracked, and none of its code in tracked source', () => {
  git('check-ignore', '.local/p6-study/20261107/manifest.json');
  git('check-ignore', '.local/p6-white-ball/renders/WhiteBallArchivePilot3D.mp4');
  const tracked = git('ls-files').split('\n');
  assert.ok(!tracked.some((f) => /growkaz|stickman|p6-study|three-kit|rig2d|fx2d|\.local\//i.test(f)), 'no study path is tracked');
  // names and idioms that only exist in that kit
  const distinctive = [/growkaz/i, /figure3D/, /windowPane/, /crowd3D/, /registerShot/, /getRenderer\(canvas\)/, /tree3D/, /pine3D/, /drawFigure/, /bigFace/];
  for (const f of P6) {
    const s = read(f);
    for (const d of distinctive) assert.ok(!d.test(s), `${f} matches ${d}`);
  }
});

test('the 3D picture loads nothing from outside: no image, video, model or audio files, and no reference material', () => {
  for (const f of P6) {
    const s = strip(read(f));
    for (const banned of [/references\//, /\.jpe?g\b/i, /\.png\b/i, /\.webp\b/i, /\.mp4\b/i, /\.glb\b/i, /\.gltf\b/i, /kenney/i, /staticFile/, /GLTFLoader/, /ImageLoader/, /<Img\b/, /<Audio\b/, /<Video\b/, /<OffthreadVideo\b/, /\bfetch\(/, /https?:\/\//]) {
      assert.ok(!banned.test(s), `${f} matches ${banned}`);
    }
  }
});

test('the mux uses the P5 soundtrack and keeps the P5 lock: it reads mix.wav, checks the timeline and its own picture, and writes only under p6', () => {
  const mux = strip(read('studio/scripts/mux-p6.ts'));
  assert.match(mux, /p5-white-ball['"], ['"]audio['"], ['"]mix\.wav/);
  assert.match(mux, /assertAudioCurrent\(/);
  assert.match(mux, /assertPicture3DCurrent\(/);
  assert.match(mux, /p6-white-ball/);
  assert.ok(!/3eedbcab|b693e16b|845b28d2|01704d29/.test(read('studio/scripts/mux-p6.ts')), 'no hash hard-coded into the check');
  assert.ok(!/archive_pilot_audio|synth|sfx_gen/.test(mux), 'nothing is synthesized');
  assert.ok(!/-af\b|atempo|volume=|loudnorm/.test(mux), 'nothing retimes or reshapes the sound');
});

test('P6 does not rewrite P5 outputs: its render and mux scripts name only p6 output paths', () => {
  const r = strip(read('studio/scripts/render-p6.mjs'));
  assert.match(r, /'p6-white-ball'/);
  assert.ok(!/p5-white-ball/.test(r));
  assert.ok(!/renders.*WhiteBallArchivePilot\.mp4/.test(strip(read('studio/scripts/mux-p6.ts'))));
});
