// Renders every P3 artifact from one bundle into .local/p3-white-ball/ (git-ignored).
//   node scripts/render-p3.mjs video    the WhiteBallNpcTest MP4 (with a WB_TRACE log of live engine state)
//   node scripts/render-p3.mjs stills   expressions, action poses, reference-layout stills, shading probe, negative controls, repro pairs
//   node scripts/render-p3.mjs all      both
//   node scripts/render-p3.mjs ref      only the seven reference-layout stills, for look tuning
//   node scripts/render-p3.mjs repro    frame reproducibility: all 60 frames three ways, and the whole MP4 again
// Environment: WB_GL=swangle|angle|... , WB_BROWSER=<path> (default: Remotion's pinned headless shell)
// GL defaults to swangle (SwiftShader, on the CPU) because it is byte-reproducible. On this machine's GPU path, `angle` gave a
// page's first drawn frame different edge pixels from later frames (about 70,000 px, up to 35 levels) and sporadic differences
// of 1-11 px under parallel load. With swangle, 7 runs at concurrency 1-8 were byte-identical.
import { bundle } from '@remotion/bundler';
import { ensureBrowser, openBrowser, renderFrames, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const studio = path.resolve(here, '..');
const root = path.resolve(studio, '..');
const OUT = path.join(root, '.local', 'p3-white-ball');
const DIRS = { renders: 'renders', stills: 'stills', comparisons: 'comparisons', reports: 'reports', logs: 'logs', bundle: 'bundle' };
for (const d of Object.values(DIRS)) fs.mkdirSync(path.join(OUT, d), { recursive: true });
const P = (dir, name) => path.join(OUT, DIRS[dir], name);

const mode = process.argv[2] ?? 'all';
const gl = process.env.WB_GL ?? 'swangle';
const browserExecutable = process.env.WB_BROWSER ?? null;
const chromiumOptions = { gl };
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const log = [];
const seen = new Set();
const onBrowserLog = (l) => {
  if (l.text.startsWith('WB_TRACE ')) { log.push(l.text.slice(9)); return; }
  if (l.type !== 'error' && l.type !== 'warning') return;
  const text = `[browser ${l.type}] ${l.text.slice(0, 400)}`;
  if (!seen.has(text)) { seen.add(text); console.log(text); } // each distinct message once
};
const flushTrace = (name) => { fs.writeFileSync(P('reports', name), log.join('\n') + '\n'); log.length = 0; };

if (!browserExecutable) {
  const b = await ensureBrowser({ logLevel: 'error' });
  console.log('browser:', b.path ?? b);
}

console.log('bundling...');
const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.join(studio, 'src', 'index.ts'), outDir: path.join(OUT, DIRS.bundle), rootDir: studio, publicDir: null, enableCaching: true });
console.log(`bundled in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// One browser for the whole run: a tab per still is far cheaper than a browser per still.
let puppeteerInstance = await openBrowser('chrome', { browserExecutable, chromiumOptions, logLevel: 'error' });

async function still(id, output, inputProps = {}, frame = 0) {
  const composition = await selectComposition({ serveUrl, id, inputProps, puppeteerInstance, chromiumOptions, logLevel: 'error' });
  const t = Date.now();
  await renderStill({ composition, serveUrl, frame, output, imageFormat: 'png', inputProps, puppeteerInstance, chromiumOptions, onBrowserLog, timeoutInMilliseconds: 120000, logLevel: 'error', overwrite: true });
  console.log(`  still ${path.relative(OUT, output)}  ${((Date.now() - t) / 1000).toFixed(1)} s`);
}

const EXPRESSIONS = ['default', 'happy-closed', 'wink', 'surprised', 'tired', 'anxious', 'sparkly-happy'];

/** pose frames at 30 fps: a resting and a moving moment of each action */
const ACTION_POSES = [
  ['idle', 0], ['idle', 10], ['hop', 3], ['hop', 12], ['hop', 21], ['float', 0], ['float', 19], ['look-left', 0], ['look-left', 15],
  ['look-right', 0], ['look-right', 15], ['wave', 0], ['wave', 7], ['wave', 11], ['react', 0], ['react', 4], ['react', 12],
];

/** one representative source frame per expression, chosen after checking the provisional ranges against the frames,
 *  with the pose that source frame shows */
const SOURCE_MATCH = [
  { expression: 'default', source: 0, poseOverride: {} },
  // frame 47, the face at rest. At the top of a hop (frames 30-36) the source lifts the whole face about 5 px.
  { expression: 'happy-closed', source: 47, poseOverride: {} },
  { expression: 'wink', source: 50, poseOverride: {} },
  { expression: 'surprised', source: 96, poseOverride: { lift: 67, leftHandOut: 17, rightHandOut: 15.5, leftHandLift: -28, rightHandLift: -27, shadowScale: 0.742 } },
  { expression: 'tired', source: 120, poseOverride: {} },
  { expression: 'anxious', source: 150, poseOverride: { sweat: 0.41 } },
  { expression: 'sparkly-happy', source: 230, poseOverride: {} },
];

async function renderReference() {
  console.log('reference-layout stills (white background, source scale)');
  for (const m of SOURCE_MATCH) {
    await still('WhiteBallInspect', P('stills', `ref_${m.expression}_src${String(m.source).padStart(3, '0')}.png`), {
      expression: m.expression, action: 'idle', poseFrame: 0, poseFps: 30, layout: 'reference', shading: 'npc', poseOverride: m.poseOverride,
    });
  }
}

async function renderStills() {
  console.log('expression stills');
  for (let i = 0; i < EXPRESSIONS.length; i++) await still('WhiteBallExpressions', P('stills', `expr_${i}_${EXPRESSIONS[i]}.png`), {}, i);

  console.log('action poses');
  for (const [action, poseFrame] of ACTION_POSES) {
    await still('WhiteBallInspect', P('stills', `action_${action}_f${String(poseFrame).padStart(2, '0')}.png`), { expression: 'default', action, poseFrame, poseFps: 30, layout: 'vertical', shading: 'npc' });
  }

  await renderReference();

  console.log('shading probe (no floor shadow): raw Pen vs Actor + original cardShade vs Actor + NPC shading');
  for (const expression of ['default', 'anxious']) {
    for (const shading of ['raw', 'card', 'npc']) {
      await still('WhiteBallInspect', P('stills', `probe_${expression}_${shading}.png`), { expression, action: 'idle', poseFrame: 0, poseFps: 30, layout: 'reference', shading, floorShadow: false, background: '#ffffff', poseOverride: { sweat: 0.41 } });
    }
  }

  console.log('blink: open, half and shut through the ordinary pose API (t = 3.1 s is frame 93 at 30 fps)');
  for (const poseFrame of [0, 92, 93]) {
    await still('WhiteBallInspect', P('stills', `blink_default_f${poseFrame}.png`), { expression: 'default', action: 'idle', poseFrame, poseFps: 30, layout: 'vertical', shading: 'npc' });
  }

  console.log('negative controls');
  const base = { expression: 'default', action: 'idle', poseFrame: 0, poseFps: 30, layout: 'vertical', shading: 'npc' };
  await still('WhiteBallInspect', P('stills', 'neg_control.png'), { ...base, debug: { trace: true }, label: 'control' });
  await still('WhiteBallInspect', P('stills', 'neg_actor_hidden.png'), { ...base, debug: { hideActor: true, trace: true }, label: 'hideActor' });
  await still('WhiteBallInspect', P('stills', 'neg_camera_without_noink.png'), { ...base, debug: { cameraNoInkOff: true, trace: true }, label: 'cameraNoInkOff' });
  flushTrace('trace-stills.jsonl');
}

/** PNG sequence of the whole clip. In one page (concurrency 1) the texture pool keeps its history from frame to frame. */
async function frameHashes(label, concurrency) {
  const outputDir = P('renders', `frames-${label}`);
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });
  const composition = await selectComposition({ serveUrl, id: 'WhiteBallNpcTest', puppeteerInstance, chromiumOptions, logLevel: 'error' });
  const t = Date.now();
  await renderFrames({
    composition, serveUrl, outputDir, inputProps: {}, imageFormat: 'png', concurrency, puppeteerInstance, chromiumOptions, onBrowserLog,
    onStart: () => undefined, onFrameUpdate: () => undefined, timeoutInMilliseconds: 120000, logLevel: 'error',
  });
  const names = fs.readdirSync(outputDir).filter((n) => n.endsWith('.png')).sort();
  console.log(`  ${label}: ${names.length} frames, concurrency ${concurrency}, ${((Date.now() - t) / 1000).toFixed(1)} s`);
  return { names, hashes: names.map((n) => sha(path.join(outputDir, n))), dir: outputDir };
}

async function renderRepro() {
  console.log('frame reproducibility');
  const sequential = await frameHashes('sequential', 1);
  const parallel = await frameHashes('parallel', 4);
  // a fresh browser process: nothing can survive from the runs above
  await puppeteerInstance.close({ silent: true });
  puppeteerInstance = await openBrowser('chrome', { browserExecutable, chromiumOptions, logLevel: 'error' });
  const fresh = await frameHashes('fresh-browser', 1);

  // single stills in fresh tabs against the same frames from the sequential run, with a different frame rendered between
  const stills = [];
  for (const frame of [0, 17, 33, 45, 59]) {
    const a = P('stills', `repro_f${frame}_a.png`), b = P('stills', `repro_f${frame}_b.png`), between = P('stills', 'repro_between.png');
    await still('WhiteBallNpcTest', a, {}, frame);
    await still('WhiteBallNpcTest', between, {}, (frame + 11) % 60);
    await still('WhiteBallNpcTest', b, {}, frame);
    stills.push({ frame, a: sha(a), b: sha(b), sequentialRun: sequential.hashes[frame] });
    fs.rmSync(a); fs.rmSync(b); fs.rmSync(between);
  }

  // the whole MP4 again: compare the decoded frames afterwards with ffmpeg
  const first = P('renders', 'WhiteBallNpcTest.mp4');
  await renderVideo(P('renders', 'WhiteBallNpcTest_repeat.mp4'), false);

  fs.writeFileSync(P('reports', 'repro.json'), JSON.stringify({
    gl, frames: sequential.names.length, sequential: sequential.hashes, parallel: parallel.hashes, freshBrowser: fresh.hashes, stills,
    firstVideo: fs.existsSync(first) ? sha(first) : null, repeatVideo: sha(P('renders', 'WhiteBallNpcTest_repeat.mp4')),
  }, null, 2));
  for (const r of [parallel, fresh]) fs.rmSync(r.dir, { recursive: true, force: true });
}

async function renderVideo(output = P('renders', 'WhiteBallNpcTest.mp4'), trace = true) {
  const inputProps = { trace };
  const composition = await selectComposition({ serveUrl, id: 'WhiteBallNpcTest', inputProps, puppeteerInstance, chromiumOptions, logLevel: 'error' });
  const t = Date.now();
  await renderMedia({
    composition, serveUrl, codec: 'h264', crf: 16, pixelFormat: 'yuv420p', imageFormat: 'png', outputLocation: output, inputProps, puppeteerInstance, chromiumOptions, onBrowserLog,
    overwrite: true, logLevel: 'error', timeoutInMilliseconds: 120000,
    onProgress: ({ renderedFrames, encodedFrames }) => { if (renderedFrames % 20 === 0) process.stdout.write(`\r  rendered ${renderedFrames}, encoded ${encodedFrames}   `); },
  });
  console.log(`\nvideo ${output} in ${((Date.now() - t) / 1000).toFixed(1)} s, ${fs.statSync(output).size} bytes`);
  if (trace) flushTrace('trace-video.jsonl');
}

try {
  if (mode === 'ref') await renderReference();
  if (mode === 'stills' || mode === 'all') await renderStills();
  if (mode === 'video' || mode === 'all') await renderVideo();
  if (mode === 'repro' || mode === 'all') await renderRepro();
} finally {
  await puppeteerInstance.close({ silent: true });
}
console.log('done');
