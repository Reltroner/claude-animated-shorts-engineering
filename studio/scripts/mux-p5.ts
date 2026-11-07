// Muxes the original soundtrack onto the rendered picture: H.264 video (stream copy, not re-encoded) + AAC stereo 48 kHz.
// It refuses audio or a picture made for any other timeline. Run with: node --import tsx studio/scripts/mux-p5.ts
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAudioCurrent, assertPictureCurrent, pictureHash, timelineHash } from '../../src/pilot/archive/audio-lock';
import { SAMPLES } from '../../src/pilot/archive/episode';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = (...a: string[]) => path.join(root, '.local', 'p5-white-ball', ...a);
const picture = P('renders', 'WhiteBallArchivePilot_picture.mp4');
const mix = P('audio', 'mix.wav');
const output = P('renders', 'WhiteBallArchivePilot.mp4');
const json = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const sha = (f: string) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const measured = json(P('audio', 'audio-measurements.json'));
assertAudioCurrent(measured);
if (measured.samplesPerChannel !== SAMPLES) throw new Error(`audio has ${measured.samplesPerChannel} samples per channel, expected ${SAMPLES}`);
const render = json(P('reports', 'picture-render.json'));
assertPictureCurrent(render);
if (sha(picture) !== render.sha256) throw new Error('the picture file is not the one the render recorded');

execFileSync('ffmpeg', [
  '-y', '-v', 'error', '-i', picture, '-i', mix, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
  '-movflags', '+faststart', '-fflags', '+bitexact', '-flags:a', '+bitexact', output,
], { stdio: 'inherit' });

const streamHash = (file: string, map: string) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', map, '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-'], { encoding: 'utf8' }).trim();
const report = {
  timelineHash: timelineHash(), pictureHash: pictureHash(), picture: path.relative(root, picture).replaceAll('\\', '/'), audio: path.relative(root, mix).replaceAll('\\', '/'), output: path.relative(root, output).replaceAll('\\', '/'),
  outputBytes: fs.statSync(output).size, outputSha256: sha(output),
  videoStreamBefore: streamHash(picture, '0:v:0'), videoStreamAfter: streamHash(output, '0:v:0'),
};
if (report.videoStreamBefore !== report.videoStreamAfter) throw new Error('the mux changed the video stream');
fs.writeFileSync(P('reports', 'mux.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`muxed ${report.output}, ${report.outputBytes} bytes, sha256 ${report.outputSha256}`);
console.log('video stream unchanged by the mux:', report.videoStreamAfter);
