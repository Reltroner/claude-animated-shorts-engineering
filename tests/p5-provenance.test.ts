// P5 provenance: the pilot's sources load nothing from outside, depend on no clock or randomness, reuse the real engine and audio
// kit, and keep clear of the bridge's fixed story. Reads source text. Also checks the protected baseline against git.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');
/** code without comments: comments may legitimately name the things the code must not use */
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
const stripPy = (s: string) => s.replace(/"""[\s\S]*?"""/g, '').replace(/#.*$/gm, '');

const RUNTIME = ['src/pilot/archive/episode.ts', 'studio/src/pilot/ArchiveHall.ts', 'studio/src/pilot/ArchiveScene.tsx', 'studio/src/pilot/archivePaint.ts', 'studio/src/compositions/WhiteBallArchivePilot.tsx'];
const AUDIO = 'studio/audio/archive_pilot_audio.py';

test('every runtime source exists', () => { for (const f of [...RUNTIME, AUDIO]) assert.ok(fs.existsSync(path.join(root, f)), f); });

test('no clock or randomness in the picture: the same frame always gives the same image', () => {
  for (const f of RUNTIME) {
    const s = strip(read(f));
    for (const banned of [/Math\.random/, /Date\.now/, /new Date\b/, /performance\.now/, /requestAnimationFrame/, /setTimeout/, /setInterval/, /\.getElapsedTime/, /THREE\.Clock/]) {
      assert.ok(!banned.test(s), `${f} uses ${banned}`);
    }
  }
});

test('the picture loads nothing: no image, video, model or audio files, and no reference material', () => {
  for (const f of RUNTIME) {
    const s = strip(read(f));
    for (const banned of [/references\//, /\.jpe?g\b/i, /\.png\b/i, /\.webp\b/i, /\.mp4\b/i, /\.glb\b/i, /\.gltf\b/i, /kenney/i, /staticFile/, /TextureLoader/, /GLTFLoader/, /ImageLoader/, /<Img\b/, /<Audio\b/, /<Video\b/, /<OffthreadVideo\b/, /\bfetch\(/, /https?:\/\//, /loadKit/]) {
      assert.ok(!banned.test(s), `${f} matches ${banned}`);
    }
  }
});

test('nothing is drawn as text: no lettering can reach the picture', () => {
  for (const f of ['studio/src/pilot/ArchiveHall.ts', 'studio/src/pilot/archivePaint.ts', 'studio/src/pilot/ArchiveScene.tsx', 'studio/src/compositions/WhiteBallArchivePilot.tsx']) {
    const s = strip(read(f));
    for (const banned of [/fillText/, /strokeText/, /\.font\s*=/, /<Text\b/, /<h\d\b/, /<p\b/, /<div\b/]) assert.ok(!banned.test(s), `${f} matches ${banned}`);
  }
});

test('it reuses the real bridge engine modules', () => {
  const hall = strip(read('studio/src/pilot/ArchiveHall.ts'));
  assert.match(hall, /from '..\/..\/..\/templates\/bridge\/build'/);
  assert.match(hall, /from '..\/..\/..\/templates\/bridge\/paint'/);
  assert.match(hall, /from '..\/..\/..\/templates\/bridge\/shade'/);
  assert.match(hall, /from '..\/..\/..\/templates\/bridge\/ink'/);
  for (const name of ['Batch', 'boxGeo', 'lam', 'quad', 'stoneHD', 'planksHD', 'beamHD', 'TONE', 'CHAR', 'untone', 'noInkFallback', 'NOINK']) assert.match(hall, new RegExp(`\\b${name}\\b`), name);
  const scene = strip(read('studio/src/pilot/ArchiveScene.tsx'));
  assert.match(scene, /templates\/bridge\/grade/);
  assert.match(scene, /templates\/bridge\/ink/);
  assert.match(scene, /templates\/bridge\/lensblur/);
  for (const name of ['InkPass', 'LensBlur', 'GradeEffect', 'BloomEffect', 'ToneMappingEffect', 'WhiteBallStage', 'makeWhiteBallPlace', 'makeWhiteBallShadow']) assert.match(scene, new RegExp(`\\b${name}\\b`), name);
  const stage = strip(read('src/npc/white-ball/WhiteBallStage.ts'));
  assert.match(stage, /templates\/bridge\/cast/);
  assert.match(strip(read('src/npc/white-ball/WhiteBallPen.ts')), /templates\/bridge\/toon/);
});

test('the post chain keeps the order of Bridge.tsx: ink, then the two lens passes, then bloom + tone + grade', () => {
  const s = strip(read('studio/src/pilot/ArchiveScene.tsx'));
  const at = (t: string) => { const i = s.indexOf(t); assert.ok(i >= 0, t); return i; };
  const order = [at('new RenderPass('), at('composer.addPass(ink)'), at('lens.pre'), at('lens.main'), at('makeBloom())'), at('new ToneMappingEffect('), at('new GradeEffect(')];
  for (let i = 1; i < order.length; i++) assert.ok(order[i] > order[i - 1], `step ${i} is out of order`);
});

test("it does not import the bridge's story, world or timebase, or the human card shader", () => {
  for (const f of RUNTIME) {
    const s = strip(read(f));
    assert.ok(!/from\s+'[^']*templates\/bridge\/story'/.test(s), `${f} imports story.ts`);
    assert.ok(!/from\s+'[^']*templates\/bridge\/world'/.test(s), `${f} imports world.ts`);
    assert.ok(!/\bcardShade\b/.test(s), `${f} uses cardShade`);
  }
});

test('the NPC keeps its own shading and stays in the no-ink layer', () => {
  const stage = strip(read('src/npc/white-ball/WhiteBallStage.ts'));
  assert.match(stage, /whiteBallCardShade\(a\.mat/);
  assert.match(stage, /cam\.layers\.enable\(NOINK\)/);
  const scene = strip(read('studio/src/pilot/ArchiveScene.tsx'));
  assert.match(scene, /shading: 'npc'/);
  assert.match(scene, /fog: false/);
});

test('the audio driver reuses the kit and leaves the bridge orchestration alone', () => {
  const s = stripPy(read(AUDIO));
  for (const m of ['dsp', 'instruments', 'sfx_gen']) assert.match(s, new RegExp(`^(import ${m}\\b|from ${m} import)`, 'm'), m);
  for (const m of ['timeline', 'sfx', 'music', 'mix']) assert.ok(!new RegExp(`^(import ${m}\\b|from ${m} import)`, 'm').test(s), `imports ${m}.py`);
  for (const call of ['I.vibes', 'I.musicbox', 'I.glock', 'I.pad', 'I.pluck', 'I.timpani', 'I.triangle', 'G.whoosh', 'G.push_thump', 'G.breeze', 'G.creak']) assert.ok(s.includes(call), call);
  for (const call of ['make_ir', 'convolve_st', 'integrated', 'true_peak', 'write_wav', 'place', 'pan', 'fades', 'rng']) assert.ok(new RegExp(`\\b${call}\\b`).test(s), call);
});

test('the audio is original and voiceless: no samples, no bridge paths, no reference audio, every seed fixed', () => {
  const s = stripPy(read(AUDIO));
  for (const banned of [/voice\.wav/, /words\.json/, /references/, /vids/, /\.mp3/, /\.flac/, /\.ogg/, /\.m4a/, /random\.random/, /default_rng\(\)/, /time\.time/]) assert.ok(!banned.test(s), `${banned}`);
  // read_wav is used only on this driver's own output folder
  for (const m of s.matchAll(/read_wav\(([^)]*)\)/g)) assert.match(m[1], /OUT/);
  assert.match(s, /"voice": "none"/);
  assert.match(s, /timelineHash/);
});

test('the protected baseline is untouched: templates, references, SKILL.md, LICENSE', () => {
  const git = (...a: string[]) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
  assert.equal(git('status', '--porcelain', '--', 'templates', 'references', 'SKILL.md', 'LICENSE'), '');
  assert.equal(git('diff', 'HEAD', '--stat', '--', 'templates', 'references', 'SKILL.md', 'LICENSE'), '');
});

test('private output stays out of git', () => {
  const ignored = (p: string) => { try { execFileSync('git', ['check-ignore', '-q', p], { cwd: root }); return true; } catch { return false; } };
  for (const p of ['.local/p5-white-ball/renders/WhiteBallArchivePilot.mp4', '.local/p5-white-ball/audio/mix.wav', '.local/p5-white-ball/reference-audit/reference-inventory.csv', '.local/npc-reference/x.png']) assert.ok(ignored(p), `${p} would be tracked`);
  for (const p of RUNTIME) assert.ok(!ignored(p), `${p} would be ignored`);
  const staged = execFileSync('git', ['diff', '--cached', '--name-only'], { cwd: root, encoding: 'utf8' }).trim();
  assert.equal(staged, '', 'nothing is staged');
});
