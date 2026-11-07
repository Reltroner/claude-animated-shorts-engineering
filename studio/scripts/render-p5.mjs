// Renders the P5 pilot from one bundle into .local/p5-white-ball/ (git-ignored).
//   node scripts/render-p5.mjs preview 0,60,140 [name]   stills at the given frames, for look tuning
//   node scripts/render-p5.mjs stills                    shot stills, world-only, expressions, post on and off comparisons
//   node scripts/render-p5.mjs video                     the silent picture MP4 (the mux adds sound)
//   node scripts/render-p5.mjs repro                     the same frames in other orders and in a fresh browser
//   node scripts/render-p5.mjs repeat                    the whole clip a second time; the two files must be identical
// Environment: WB_GL=swangle|angle, WB_CONCURRENCY=n, WB_CRF=n. GL defaults to swangle: software GL is the proven byte-stable path (P3).
import { bundle } from '@remotion/bundler';
import { ensureBrowser, openBrowser, renderFrames, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const studio = path.resolve(here, '..');
const root = path.resolve(studio, '..');
const OUT = path.join(root, '.local', 'p5-white-ball');
for (const d of ['renders', 'stills', 'reports', 'logs', 'bundle']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const P = (...a) => path.join(OUT, ...a);
const ID = 'WhiteBallArchivePilot';

const mode = process.argv[2] ?? 'preview';
const gl = process.env.WB_GL ?? 'swangle';
const concurrency = Number(process.env.WB_CONCURRENCY ?? 4);
const crf = Number(process.env.WB_CRF ?? 16);
const chromiumOptions = { gl };
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const trace = [];
const seen = new Set();
const onBrowserLog = (l) => {
  if (l.text.startsWith('P5_TRACE ')) { trace.push(l.text.slice(9)); return; }
  if (l.type !== 'error' && l.type !== 'warning') return;
  const text = `[browser ${l.type}] ${l.text.slice(0, 600)}`;
  if (!seen.has(text)) { seen.add(text); console.log(text); }
};

await ensureBrowser({ logLevel: 'error' });
const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.join(studio, 'src', 'index.ts'), outDir: P('bundle'), rootDir: studio, publicDir: null, enableCaching: true });
console.log(`bundled in ${((Date.now() - t0) / 1000).toFixed(1)} s, gl ${gl}`);

let puppeteerInstance = await openBrowser('chrome', { browserExecutable: null, chromiumOptions, logLevel: 'error' });

async function still(output, frame, inputProps = {}) {
  const composition = await selectComposition({ serveUrl, id: ID, inputProps, puppeteerInstance, chromiumOptions, logLevel: 'error' });
  const t = Date.now();
  await renderStill({ composition, serveUrl, frame, output, imageFormat: 'png', inputProps, puppeteerInstance, chromiumOptions, onBrowserLog, timeoutInMilliseconds: 600000, logLevel: 'error', overwrite: true });
  console.log(`  ${path.relative(OUT, output)}  ${((Date.now() - t) / 1000).toFixed(1)} s`);
}

const pad = (n) => String(n).padStart(3, '0');

/** representative frames: every scene, every expression, the hops, the wave, the reveal */
const SHOTS = {
  'SC-001': [0, 30, 50, 66, 88],
  'SC-002': [97, 112, 132, 140, 152, 166],
  'SC-003': [190, 204, 212, 226, 250, 266],
  'SC-004': [276, 300, 315, 330, 345, 359],
};

async function renderStills() {
  console.log('shot stills');
  for (const [scene, frames] of Object.entries(SHOTS)) for (const f of frames) await still(P('stills', `shot_${scene}_f${pad(f)}.png`), f);

  console.log('NPC expressions in the world, one frame of each');
  for (const [name, f] of [['default', 112], ['happy-closed', 166], ['surprised', 212], ['anxious', 256], ['sparkly-happy', 290]]) await still(P('stills', `npc_${name}_f${pad(f)}.png`), f);

  console.log('world only (no character)');
  for (const f of [0, 112, 226, 330]) await still(P('stills', `world_only_f${pad(f)}.png`), f, { hideNpc: true });

  console.log('post chain on and off at the same frame');
  for (const f of [112, 226, 330]) {
    await still(P('stills', `post_all_f${pad(f)}.png`), f);
    await still(P('stills', `post_no_ink_f${pad(f)}.png`), f, { post: { ink: false } });
    await still(P('stills', `post_no_lens_f${pad(f)}.png`), f, { post: { lens: false } });
    await still(P('stills', `post_no_bloom_f${pad(f)}.png`), f, { post: { bloom: false } });
    await still(P('stills', `post_no_grade_f${pad(f)}.png`), f, { post: { grade: false } });
    await still(P('stills', `post_none_f${pad(f)}.png`), f, { post: { ink: false, lens: false, bloom: false, grade: false } });
  }
  await still(P('stills', 'ink_mask_f112.png'), 112, { inkMask: true, post: { lens: false, bloom: false, grade: false } });

  console.log('trace: live engine state on one frame per scene');
  trace.length = 0;
  for (const f of [50, 140, 226, 330]) await still(P('stills', `trace_f${pad(f)}.png`), f, { trace: true });
  fs.writeFileSync(P('reports', 'trace-stills.jsonl'), trace.join('\n') + '\n');
  for (const f of [50, 140, 226, 330]) fs.rmSync(P('stills', `trace_f${pad(f)}.png`));
}

async function renderVideo(output = P('renders', 'WhiteBallArchivePilot_picture.mp4')) {
  const composition = await selectComposition({ serveUrl, id: ID, puppeteerInstance, chromiumOptions, logLevel: 'error' });
  const t = Date.now();
  await renderMedia({
    composition, serveUrl, codec: 'h264', crf, pixelFormat: 'yuv420p', imageFormat: 'png', outputLocation: output, puppeteerInstance, chromiumOptions, onBrowserLog, concurrency,
    overwrite: true, logLevel: 'error', timeoutInMilliseconds: 600000, muted: true,
    onProgress: ({ renderedFrames, encodedFrames }) => { if (renderedFrames % 10 === 0) console.log(`  rendered ${renderedFrames}, encoded ${encodedFrames}, ${((Date.now() - t) / 1000).toFixed(0)} s`); },
  });
  const seconds = (Date.now() - t) / 1000;
  console.log(`video ${output} in ${seconds.toFixed(1)} s, ${fs.statSync(output).size} bytes`);
  // ties this picture to the timeline it was rendered from, so the mux can refuse a mismatch
  const { pictureHash } = JSON.parse(fs.readFileSync(P('storyboard', 'episode.json'), 'utf8'));
  fs.writeFileSync(P('reports', 'picture-render.json'), JSON.stringify({ pictureHash, gl, crf, concurrency, seconds, sha256: sha(output), bytes: fs.statSync(output).size, frames: composition.durationInFrames }, null, 2) + '\n');
}

async function frameHashes(label, c) {
  const outputDir = P('renders', `frames-${label}`);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const composition = await selectComposition({ serveUrl, id: ID, puppeteerInstance, chromiumOptions, logLevel: 'error' });
  const t = Date.now();
  const frameRange = process.env.WB_REPRO_ALL ? null : [120, 149];
  await renderFrames({
    composition, serveUrl, outputDir, inputProps: {}, imageFormat: 'png', concurrency: c, puppeteerInstance, chromiumOptions, onBrowserLog, frameRange,
    onStart: () => undefined, onFrameUpdate: () => undefined, timeoutInMilliseconds: 600000, logLevel: 'error',
  });
  const names = fs.readdirSync(outputDir).filter((n) => n.endsWith('.png')).sort();
  console.log(`  ${label}: ${names.length} frames, concurrency ${c}, ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return { names, hashes: names.map((n) => sha(path.join(outputDir, n))), dir: outputDir };
}

async function renderRepro() {
  console.log('frame reproducibility on a window that contains a hop, a landing and an expression swap');
  const sequential = await frameHashes('sequential', 1);
  const parallel = await frameHashes('parallel', concurrency);
  await puppeteerInstance.close({ silent: true });
  puppeteerInstance = await openBrowser('chrome', { browserExecutable: null, chromiumOptions, logLevel: 'error' });
  const fresh = await frameHashes('fresh-browser', 2);
  const stills = [];
  for (const frame of [125, 140, 148]) {
    const a = P('stills', `repro_f${frame}_a.png`), b = P('stills', `repro_f${frame}_b.png`);
    await still(a, frame);
    await still(P('stills', 'repro_between.png'), 300);
    await still(b, frame);
    stills.push({ frame, a: sha(a), b: sha(b), sequentialRun: sequential.hashes[frame - 120] });
    fs.rmSync(a); fs.rmSync(b);
  }
  fs.rmSync(P('stills', 'repro_between.png'), { force: true });
  fs.writeFileSync(P('reports', 'repro.json'), JSON.stringify({ gl, frames: sequential.names, sequential: sequential.hashes, parallel: parallel.hashes, freshBrowser: fresh.hashes, stills }, null, 2));
  for (const r of [sequential, parallel, fresh]) fs.rmSync(r.dir, { recursive: true, force: true });
}

try {
  if (mode === 'preview') {
    const frames = (process.argv[3] ?? '0,50,112,140,166,226,256,330').split(',').map(Number);
    const name = process.argv[4] ?? 'preview';
    fs.mkdirSync(P('stills', 'preview'), { recursive: true });
    for (const f of frames) await still(P('stills', 'preview', `${name}_f${pad(f)}.png`), f, process.env.WB_PROPS ? JSON.parse(process.env.WB_PROPS) : {});
  }
  if (mode === 'stills') await renderStills();
  if (mode === 'video') await renderVideo();
  if (mode === 'repeat') {
    // the whole clip again, to a second file: the two must be identical byte for byte
    const first = P('renders', 'WhiteBallArchivePilot_picture.mp4');
    const before = fs.existsSync(first) ? sha(first) : null;
    fs.copyFileSync(first, P('renders', 'WhiteBallArchivePilot_picture_first.mp4'));
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
