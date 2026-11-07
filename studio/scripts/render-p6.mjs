// Renders the P6 pilot from one bundle into .local/p6-white-ball/ (git-ignored). P5's outputs are never touched.
//   node scripts/render-p6.mjs preview 0,60,140 [name]   full-size stills at the given frames, for look tuning; WB_PROPS adds debug props
//   node scripts/render-p6.mjs motion 120 180            a short half-size clip: the cheap way to see motion before a full render
//   node scripts/render-p6.mjs bench                     per-frame cost, shadow refresh on and off
//   node scripts/render-p6.mjs stills                    the QA stills: shots, side views, expressions, world only, post on and off
//   node scripts/render-p6.mjs video                     the silent 360-frame picture (the mux adds sound)
//   node scripts/render-p6.mjs repeat                    the whole clip again; the two files are compared
//   node scripts/render-p6.mjs repro                     a window of frames in other orders and in a fresh browser
//   node scripts/render-p6.mjs p5check                   the P5 composition rendered now, to compare with P5's own stills
// Environment: WB_GL=swangle|angle, WB_CONCURRENCY=n, WB_CRF=n. GL defaults to swangle, the software path whose output has been byte-stable on this machine.
import { bundle } from '@remotion/bundler';
import { ensureBrowser, openBrowser, renderFrames, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const studio = path.resolve(here, '..');
const root = path.resolve(studio, '..');
const OUT = path.join(root, '.local', 'p6-white-ball');
for (const d of ['renders', 'stills', 'reports', 'logs', 'bundle']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const P = (...a) => path.join(OUT, ...a);
const ID = 'WhiteBallArchivePilot3D';
const PREVIEW_ID = 'WhiteBallArchivePilot3DPreview';

const mode = process.argv[2] ?? 'preview';
const gl = process.env.WB_GL ?? 'swangle';
const concurrency = Number(process.env.WB_CONCURRENCY ?? 4);
const crf = Number(process.env.WB_CRF ?? 16);
const chromiumOptions = { gl };
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const trace = [];
const seen = new Set();
const onBrowserLog = (l) => {
  if (l.text.startsWith('P6_TRACE ')) { trace.push(l.text.slice(9)); return; }
  if (l.type !== 'error' && l.type !== 'warning') return;
  const text = `[browser ${l.type}] ${l.text.slice(0, 900)}`;
  if (!seen.has(text)) { seen.add(text); console.log(text); }
};

await ensureBrowser({ logLevel: 'error' });
const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.join(studio, 'src', 'index.ts'), outDir: P('bundle'), rootDir: studio, publicDir: null, enableCaching: true });
console.log(`bundled in ${((Date.now() - t0) / 1000).toFixed(1)} s, gl ${gl}`);

let puppeteerInstance = await openBrowser('chrome', { browserExecutable: null, chromiumOptions, logLevel: 'error' });

async function still(output, frame, inputProps = {}, id = ID) {
  const composition = await selectComposition({ serveUrl, id, inputProps, puppeteerInstance, chromiumOptions, logLevel: 'error' });
  const t = Date.now();
  await renderStill({ composition, serveUrl, frame, output, imageFormat: 'png', inputProps, puppeteerInstance, chromiumOptions, onBrowserLog, timeoutInMilliseconds: 600000, logLevel: 'error', overwrite: true });
  console.log(`  ${path.relative(OUT, output)}  ${((Date.now() - t) / 1000).toFixed(1)} s`);
}

const pad = (n) => String(n).padStart(3, '0');

/** representative frames: every scene, every hop phase, the wave, the expressions, the reveal */
const SHOTS = { wide: [0, 50, 88], approach: [112, 132, 140, 152, 166], close: [190, 212, 226, 256, 276, 290], reveal: [315, 330, 345, 359] };
const EXPRESSIONS = ['default', 'happy-closed', 'wink', 'surprised', 'tired', 'anxious', 'sparkly-happy'];
const ACTIONS = [['idle', 0], ['hop', 11], ['float', 9], ['look-left', 12], ['look-right', 12], ['wave', 9], ['react', 3]];

async function renderStills() {
  console.log('strategic shots');
  for (const [name, frames] of Object.entries(SHOTS)) for (const f of frames) await still(P('stills', `shot_${name}_f${pad(f)}.png`), f);

  console.log('side views at the same frame: real volume and parallax');
  for (const f of [166, 226, 290]) for (const deg of [-20, 20]) await still(P('stills', `orbit_f${pad(f)}_${deg < 0 ? 'minus' : 'plus'}${Math.abs(deg)}.png`), f, { orbitDeg: deg });

  console.log('hop phases on the same hop, for contact and cast shadow');
  for (const f of [124, 128, 132, 136, 140, 144]) await still(P('stills', `hop_f${pad(f)}.png`), f);

  console.log('all seven expressions, in the world, front and turned');
  for (const expression of EXPRESSIONS) {
    await still(P('stills', `expr_${expression}_front.png`), 226, { force: { expression, poseFrame: 0 } });
    await still(P('stills', `expr_${expression}_yaw30.png`), 226, { force: { expression, poseFrame: 0, yawDeg: 30 } });
  }

  console.log('all seven actions, at a telling frame of each');
  for (const [action, poseFrame] of ACTIONS) await still(P('stills', `action_${action}.png`), 226, { force: { expression: 'default', action, poseFrame } });

  console.log('frontal, through a long lens: compares directly with the P3 drawing');
  for (const expression of EXPRESSIONS) await still(P('stills', `tele_${expression}.png`), 226, { tele: true, force: { expression, poseFrame: 0 }, post: { ink: false, lens: false, bloom: false } });

  console.log('world only, and with the character, for shadow and occlusion checks');
  for (const f of [50, 62, 112, 132, 140, 226, 330]) {
    await still(P('stills', `world_only_f${pad(f)}.png`), f, { hideNpc: true });
    await still(P('stills', `with_npc_f${pad(f)}.png`), f);
  }

  console.log('the same ball, same spot, same camera, at two heights: the real shadow has to move');
  await still(P('stills', 'shadow_low_f226.png'), 226, { force: { expression: 'default', action: 'idle', poseFrame: 0 } });
  await still(P('stills', 'shadow_high_f226.png'), 226, { force: { expression: 'default', action: 'float', poseFrame: 9 } });

  console.log('the sphere terms off, as a negative control');
  for (const f of [140, 226]) await still(P('stills', `ab_no_sphere_terms_f${pad(f)}.png`), f, { sphereTerms: false });

  console.log('the key and the hemisphere light switched off, as negative controls: each must change the character, and the key the floor too');
  await still(P('stills', 'ab_key_off_f226.png'), 226, { keyOff: true });
  await still(P('stills', 'ab_hemi_off_f226.png'), 226, { hemiOff: true });

  console.log('post chain on and off at the same frame');
  for (const f of [112, 226, 330]) {
    await still(P('stills', `post_no_ink_f${pad(f)}.png`), f, { post: { ink: false } });
    await still(P('stills', `post_no_lens_f${pad(f)}.png`), f, { post: { lens: false } });
    await still(P('stills', `post_no_bloom_f${pad(f)}.png`), f, { post: { bloom: false } });
    await still(P('stills', `post_no_grade_f${pad(f)}.png`), f, { post: { grade: false } });
    await still(P('stills', `post_all_f${pad(f)}.png`), f);
  }

  console.log('trace: live engine state on one frame per scene');
  trace.length = 0;
  for (const f of [50, 140, 226, 330]) await still(P('stills', `trace_f${pad(f)}.png`), f, { trace: true });
  fs.writeFileSync(P('reports', 'trace-stills.jsonl'), trace.join('\n') + '\n');
  for (const f of [50, 140, 226, 330]) fs.rmSync(P('stills', `trace_f${pad(f)}.png`));

  console.log('trace on consecutive frames on one page: is the shadow map really redrawn every frame?');
  trace.length = 0;
  const outputDir = P('renders', 'frames-trace');
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const inputProps = { trace: true };
  const composition = await selectComposition({ serveUrl, id: ID, inputProps, puppeteerInstance, chromiumOptions, logLevel: 'error' });
  await renderFrames({
    composition, serveUrl, outputDir, inputProps, imageFormat: 'jpeg', jpegQuality: 70, concurrency: 1, puppeteerInstance, chromiumOptions, onBrowserLog, frameRange: [124, 127],
    onStart: () => undefined, onFrameUpdate: () => undefined, timeoutInMilliseconds: 600000, logLevel: 'error',
  });
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.writeFileSync(P('reports', 'trace-sequence.jsonl'), trace.join('\n') + '\n');
}

/** the P5 composition, rendered now by this tree, to compare with the stills P5 itself wrote */
async function p5Check() {
  for (const [name, frame] of [['post_all_f112.png', 112], ['post_all_f226.png', 226], ['post_all_f330.png', 330]]) await still(P('stills', `p5check_${name}`), frame, {}, 'WhiteBallArchivePilot');
}

async function renderVideo(output = P('renders', 'WhiteBallArchivePilot3D_picture.mp4')) {
  // read before rendering: this ties the picture to the staging and code it starts from, so the mux can refuse a mismatch
  const { picture3DHash, timelineHash } = JSON.parse(fs.readFileSync(P('storyboard', 'episode3d.json'), 'utf8'));
  const composition = await selectComposition({ serveUrl, id: ID, puppeteerInstance, chromiumOptions, logLevel: 'error' });
  const t = Date.now();
  await renderMedia({
    composition, serveUrl, codec: 'h264', crf, pixelFormat: 'yuv420p', imageFormat: 'png', outputLocation: output, puppeteerInstance, chromiumOptions, onBrowserLog, concurrency,
    overwrite: true, logLevel: 'error', timeoutInMilliseconds: 600000, muted: true,
    onProgress: ({ renderedFrames, encodedFrames }) => { if (renderedFrames % 20 === 0) console.log(`  rendered ${renderedFrames}, encoded ${encodedFrames}, ${((Date.now() - t) / 1000).toFixed(0)} s`); },
  });
  const seconds = (Date.now() - t) / 1000;
  console.log(`video ${output} in ${seconds.toFixed(1)} s, ${fs.statSync(output).size} bytes`);
  fs.writeFileSync(P('reports', 'picture-render.json'), JSON.stringify({ picture3DHash, timelineHash, gl, crf, concurrency, seconds, sha256: sha(output), bytes: fs.statSync(output).size, frames: composition.durationInFrames }, null, 2) + '\n');
}

async function renderMotion(from, to) {
  const composition = await selectComposition({ serveUrl, id: PREVIEW_ID, puppeteerInstance, chromiumOptions, logLevel: 'error' });
  const output = P('renders', `motion_f${pad(from)}-f${pad(to)}.mp4`);
  const t = Date.now();
  await renderMedia({
    composition, serveUrl, codec: 'h264', crf: 20, pixelFormat: 'yuv420p', imageFormat: 'jpeg', outputLocation: output, puppeteerInstance, chromiumOptions, onBrowserLog, concurrency,
    overwrite: true, logLevel: 'error', timeoutInMilliseconds: 600000, muted: true, frameRange: [from, to],
  });
  const seconds = (Date.now() - t) / 1000, frames = to - from + 1;
  const line = { output: path.relative(root, output).replaceAll('\\', '/'), width: composition.width, height: composition.height, frames, seconds, secondsPerFrame: seconds / frames, concurrency, gl };
  console.log(JSON.stringify(line));
  fs.appendFileSync(P('reports', 'motion-previews.jsonl'), JSON.stringify(line) + '\n');
}

async function framesTimed(label, frameRange, inputProps, c = 1) {
  const outputDir = P('renders', `bench-${label}`);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const composition = await selectComposition({ serveUrl, id: ID, inputProps, puppeteerInstance, chromiumOptions, logLevel: 'error' });
  const stamps = [];
  await renderFrames({
    composition, serveUrl, outputDir, inputProps, imageFormat: 'jpeg', jpegQuality: 80, concurrency: c, puppeteerInstance, chromiumOptions, onBrowserLog, frameRange,
    onStart: () => undefined, onFrameUpdate: () => stamps.push(Date.now()), timeoutInMilliseconds: 600000, logLevel: 'error',
  });
  fs.rmSync(outputDir, { recursive: true, force: true });
  const gaps = stamps.slice(2).map((s, i) => (s - stamps[i + 1]) / 1000); // the first frames carry shader compilation
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  console.log(`  ${label}: ${gaps.length} timed frames, ${mean.toFixed(2)} s per frame (max ${Math.max(...gaps).toFixed(2)})`);
  return { label, frameRange, timedFrames: gaps.length, secondsPerFrame: mean, max: Math.max(...gaps), concurrency: c, gl };
}

async function renderBench() {
  console.log('per-frame cost at 1080 x 1920, one page, software GL, first frames dropped');
  const rows = [];
  for (const [name, range] of [['close', [226, 233]], ['wide', [60, 67]]]) {
    rows.push(await framesTimed(`${name}-refresh`, range, {}));
    rows.push(await framesTimed(`${name}-frozen-shadow`, range, { shadowRefresh: false }));
    rows.push(await framesTimed(`${name}-no-sphere-terms`, range, { sphereTerms: false }));
    rows.push(await framesTimed(`${name}-no-npc`, range, { hideNpc: true }));
    rows.push(await framesTimed(`${name}-no-ink`, range, { post: { ink: false } }));
    rows.push(await framesTimed(`${name}-no-lens`, range, { post: { lens: false } }));
    rows.push(await framesTimed(`${name}-no-bloom`, range, { post: { bloom: false } }));
  }
  fs.writeFileSync(P('reports', 'bench.json'), JSON.stringify(rows, null, 2) + '\n');
}

async function frameHashes(label, c) {
  const outputDir = P('renders', `frames-${label}`);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const composition = await selectComposition({ serveUrl, id: ID, puppeteerInstance, chromiumOptions, logLevel: 'error' });
  const t = Date.now();
  await renderFrames({
    composition, serveUrl, outputDir, inputProps: {}, imageFormat: 'png', concurrency: c, puppeteerInstance, chromiumOptions, onBrowserLog, frameRange: [124, 149],
    onStart: () => undefined, onFrameUpdate: () => undefined, timeoutInMilliseconds: 600000, logLevel: 'error',
  });
  const names = fs.readdirSync(outputDir).filter((n) => n.endsWith('.png')).sort();
  console.log(`  ${label}: ${names.length} frames, concurrency ${c}, ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return { names, hashes: names.map((n) => sha(path.join(outputDir, n))), dir: outputDir };
}

async function renderRepro() {
  console.log('frame reproducibility on a window with a hop, a landing and an expression swap');
  const sequential = await frameHashes('sequential', 1);
  const parallel = await frameHashes('parallel', concurrency);
  await puppeteerInstance.close({ silent: true });
  puppeteerInstance = await openBrowser('chrome', { browserExecutable: null, chromiumOptions, logLevel: 'error' });
  const fresh = await frameHashes('fresh-browser', 2);
  const stills = [];
  for (const frame of [128, 140, 148]) {
    const a = P('stills', `repro_f${frame}_a.png`), b = P('stills', `repro_f${frame}_b.png`);
    await still(a, frame);
    await still(P('stills', 'repro_between.png'), 300);
    await still(b, frame);
    stills.push({ frame, a: sha(a), b: sha(b), sequentialRun: sequential.hashes[frame - 124] });
    fs.rmSync(a); fs.rmSync(b);
  }
  fs.rmSync(P('stills', 'repro_between.png'), { force: true });
  const same = (x, y) => x.length === y.length && x.every((h, i) => h === y[i]);
  fs.writeFileSync(P('reports', 'repro.json'), JSON.stringify({ gl, frames: sequential.names, sequentialEqualsParallel: same(sequential.hashes, parallel.hashes), sequentialEqualsFresh: same(sequential.hashes, fresh.hashes), stillsMatch: stills.every((s) => s.a === s.b && s.a === s.sequentialRun), sequential: sequential.hashes, parallel: parallel.hashes, freshBrowser: fresh.hashes, stills }, null, 2));
  for (const r of [sequential, parallel, fresh]) fs.rmSync(r.dir, { recursive: true, force: true });
}

try {
  if (mode === 'preview') {
    const frames = (process.argv[3] ?? '50,112,140,166,226,256,290,330').split(',').map(Number);
    const name = process.argv[4] ?? 'preview';
    fs.mkdirSync(P('stills', 'preview'), { recursive: true });
    for (const f of frames) await still(P('stills', 'preview', `${name}_f${pad(f)}.png`), f, process.env.WB_PROPS ? JSON.parse(process.env.WB_PROPS) : {}, process.env.WB_COMP ?? ID);
    if (trace.length) fs.writeFileSync(P('reports', `trace-${name}.jsonl`), trace.join('\n') + '\n');
  }
  if (mode === 'motion') await renderMotion(Number(process.argv[3] ?? 120), Number(process.argv[4] ?? 179));
  if (mode === 'bench') await renderBench();
  if (mode === 'stills') await renderStills();
  if (mode === 'p5check') await p5Check();
  if (mode === 'video') await renderVideo();
  if (mode === 'repeat') {
    const first = P('renders', 'WhiteBallArchivePilot3D_picture.mp4');
    const before = sha(first);
    fs.copyFileSync(first, P('renders', 'WhiteBallArchivePilot3D_picture_first.mp4'));
    await renderVideo();
    const after = sha(first);
    fs.writeFileSync(P('reports', 'repro-video.json'), JSON.stringify({ gl, firstRun: before, secondRun: after, identical: before === after }, null, 2) + '\n');
    console.log(before === after ? 'second render is byte-identical' : `second render DIFFERS: ${before} ${after}`);
  }
  if (mode === 'repro') await renderRepro();
} finally {
  await puppeteerInstance.close({ silent: true });
}
console.log('done');
