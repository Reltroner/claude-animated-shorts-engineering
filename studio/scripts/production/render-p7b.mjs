// P7B noncanon 16:9 screen proof. No change to existing P3/P5/P6 renderers.
// Modes: stills (5 preview PNGs), preview (960x540 silent MP4),
// final (1920x1080 silent MP4), verify (FFprobe metadata, no rendering).
// Everything lives under ignored .local/p7b-landscape/.
import { bundle } from '@remotion/bundler';
import { ensureBrowser, openBrowser, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const studio = path.join(root, 'studio');
const outputRoot = path.join(root, '.local', 'p7b-landscape');
const P = (...pieces) => path.join(outputRoot, ...pieces);
const mode = process.argv[2] ?? 'stills';
const modes = new Set(['stills', 'preview', 'final', 'verify']);
if (!modes.has(mode)) throw new Error('Unsupported P7B mode: ' + mode);
const config = {
  preview: { id: 'CountryballLandscapeProofPreview', width: 960, height: 540 },
  final: { id: 'CountryballLandscapeProof', width: 1920, height: 1080 },
};
const fps = 30, frames = 120;
const sha256 = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const fileFor = (kind) => P('renders', 'CountryballLandscapeProof_' + kind + '.mp4');

function verify(kind) {
  const output = fileFor(kind);
  if (!fs.existsSync(output)) throw new Error('P7B missing output: ' + output);
  const tool = spawnSync('ffprobe', [
    '-v', 'error', '-count_frames',
    '-show_entries', 'stream=codec_type,codec_name,width,height,r_frame_rate,nb_read_frames:format=duration',
    '-of', 'json', output,
  ], { encoding: 'utf8' });
  if (tool.error || tool.status !== 0) throw new Error('FFprobe failed: ' + (tool.error?.message ?? tool.stderr));
  const info = JSON.parse(tool.stdout);
  const video = info.streams?.filter((s) => s.codec_type === 'video') ?? [];
  const audio = info.streams?.filter((s) => s.codec_type === 'audio') ?? [];
  const desired = config[kind];
  if (video.length !== 1 || audio.length !== 0 || video[0].codec_name !== 'h264' ||
      video[0].width !== desired.width || video[0].height !== desired.height ||
      video[0].r_frame_rate !== '30/1' || Number(video[0].nb_read_frames) !== frames ||
      Math.abs(Number(info.format?.duration) - frames / fps) > 0.07) {
    throw new Error('P7B FFprobe metadata mismatch: ' + JSON.stringify(info));
  }
  return {
    kind, sha256: sha256(output), bytes: fs.statSync(output).size,
    frames, fps, width: desired.width, height: desired.height,
    durationSeconds: Number(info.format.duration), audio: 'none (noncanon visual proof)',
    path: path.relative(root, output).replaceAll('\\', '/'),
    acceptance: 'technical metadata only; owner visual approval pending',
  };
}

async function run() {
  if (mode === 'verify') {
    const expected = process.argv[3] ?? 'final';
    if (!(expected in config)) throw new Error('P7B verify expects preview or final');
    const result = verify(expected);
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  for (const folder of ['bundle', 'stills', 'renders', 'reports']) fs.mkdirSync(P(folder), { recursive: true });
  const gl = process.env.WB_GL ?? 'swangle';
  const concurrency = Number(process.env.WB_CONCURRENCY ?? 3);
  if (!['swangle', 'angle'].includes(gl) || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) {
    throw new Error('P7B invalid WB_GL or WB_CONCURRENCY');
  }
  const chromiumOptions = { gl };
  await ensureBrowser({ logLevel: 'error' });
  const serveUrl = await bundle({
    entryPoint: path.join(studio, 'src/index.ts'),
    outDir: P('bundle'), rootDir: studio, publicDir: null, enableCaching: true,
  });
  const browser = await openBrowser('chrome', { browserExecutable: null, chromiumOptions, logLevel: 'error' });
  try {
    const select = async (kind) => selectComposition({
      serveUrl, id: config[kind].id, puppeteerInstance: browser, chromiumOptions, logLevel: 'error',
    });
    if (mode === 'stills') {
      const comp = await select('preview');
      for (const frame of [0, 30, 60, 90, 119]) {
        const file = P('stills', 'countryball-f' + String(frame).padStart(3, '0') + '.png');
        await renderStill({
          composition: comp, serveUrl, frame, output: file, imageFormat: 'png',
          puppeteerInstance: browser, chromiumOptions, timeoutInMilliseconds: 600000, logLevel: 'error', overwrite: true,
        });
        console.log('P7B still: ' + path.relative(root, file));
      }
      return;
    }
    const kind = mode;
    const comp = await select(kind);
    if (comp.width !== config[kind].width || comp.height !== config[kind].height ||
        comp.fps !== fps || comp.durationInFrames !== frames) {
      throw new Error('P7B composition metadata mismatch');
    }
    await renderMedia({
      composition: comp, serveUrl, codec: 'h264', crf: kind === 'final' ? 17 : 21,
      pixelFormat: 'yuv420p', imageFormat: 'png',
      outputLocation: fileFor(kind), puppeteerInstance: browser, chromiumOptions,
      concurrency, overwrite: true, muted: true, logLevel: 'error',
      timeoutInMilliseconds: 600000,
    });
    const report = verify(kind);
    report.gl = gl;
    report.concurrency = concurrency;
    fs.writeFileSync(P('reports', kind + '-ffprobe.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close({ silent: true });
  }
}

await run();
