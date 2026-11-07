// Puts the approved P5 soundtrack, unchanged, on the P6 picture: H.264 video by stream copy, the P5 mix.wav encoded with the same AAC settings P5 used.
// It keeps the P5 lock: it refuses audio that was not made for this timeline, and a picture rendered from any other staging. Nothing is synthesized or retimed.
// Run with: node --import tsx studio/scripts/mux-p6.ts
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertAudioCurrent, pictureHash, timelineHash } from '../../src/pilot/archive/audio-lock';
import { assertPicture3DCurrent, picture3DHash } from '../../src/pilot/archive/audio-lock3d';
import { SAMPLES } from '../../src/pilot/archive/episode';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const P5 = (...a: string[]) => path.join(root, '.local', 'p5-white-ball', ...a);
const P6 = (...a: string[]) => path.join(root, '.local', 'p6-white-ball', ...a);
const picture = P6('renders', 'WhiteBallArchivePilot3D_picture.mp4');
const mix = path.join(root, '.local', 'p5-white-ball', 'audio', 'mix.wav');
const output = P6('renders', 'WhiteBallArchivePilot3D.mp4');
const json = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8'));
const sha = (f: string) => createHash('sha256').update(fs.readFileSync(f)).digest('hex');

const measured = json(P5('audio', 'audio-measurements.json'));
assertAudioCurrent(measured);
if (measured.samplesPerChannel !== SAMPLES) throw new Error(`audio has ${measured.samplesPerChannel} samples per channel, expected ${SAMPLES}`);
const render = json(P6('reports', 'picture-render.json'));
assertPicture3DCurrent(render);
if (sha(picture) !== render.sha256) throw new Error('the picture file is not the one the render recorded');

execFileSync('ffmpeg', [
  '-y', '-v', 'error', '-i', picture, '-i', mix, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
  '-movflags', '+faststart', '-fflags', '+bitexact', '-flags:a', '+bitexact', output,
], { stdio: 'inherit' });

const streamHash = (file: string, map: string) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', map, '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-'], { encoding: 'utf8' }).trim();
const report = {
  timelineHash: timelineHash(), pictureHash: pictureHash(), picture3DHash: picture3DHash(),
  picture: path.relative(root, picture).replaceAll('\\', '/'), audio: path.relative(root, mix).replaceAll('\\', '/'), audioSha256: sha(mix), output: path.relative(root, output).replaceAll('\\', '/'),
  outputBytes: fs.statSync(output).size, outputSha256: sha(output),
  videoStreamBefore: streamHash(picture, '0:v:0'), videoStreamAfter: streamHash(output, '0:v:0'),
  audioStream: streamHash(output, '0:a:0'),
};
if (report.videoStreamBefore !== report.videoStreamAfter) throw new Error('the mux changed the video stream');
fs.writeFileSync(P6('reports', 'mux.json'), JSON.stringify(report, null, 2) + '\n');
console.log(`muxed ${report.output}, ${report.outputBytes} bytes, sha256 ${report.outputSha256}`);
console.log('video stream unchanged by the mux:', report.videoStreamAfter);
