// Writes the machine-readable frame-time manifest to .local/p5-white-ball/storyboard/: episode.json, scenes.json, audio-cues.json.
// Run with: node --import tsx studio/scripts/emit-p5-manifest.ts. The TypeScript in src/pilot/archive is the source of truth.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pictureHash, timelineHash } from '../../src/pilot/archive/audio-lock';
import {
  BEATS, BLINK_FRAMES, CAM_KEYS, CHIME_FRAME, DOF_KEYS, EPISODE, FPS, FRAMES, HEIGHT, NPC_BLEND_SECONDS, NPC_ID, RELEASE_FRAME, REVEAL_END, REVEAL_START, SAMPLES, SAMPLE_RATE, SCENES, WIDTH, WORLD_PROPS,
  cameraAt, deriveSfxCues, dofAt, hopFrames, lightAt, npcAt, npcGroundAt, npcScreenBox, seconds,
} from '../../src/pilot/archive/episode';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, '.local', 'p5-white-ball', 'storyboard');
fs.mkdirSync(out, { recursive: true });
const hash = timelineHash();
const round = (v: number, d = 4) => Math.round(v * 10 ** d) / 10 ** d;
const write = (name: string, value: unknown) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');

const cues = deriveSfxCues();

write('episode.json', {
  ...EPISODE, timelineHash: hash, pictureHash: pictureHash(),
  format: { width: WIDTH, height: HEIGHT, fps: FPS, frames: FRAMES, seconds: FRAMES / FPS, video: 'h264 yuv420p', audio: 'aac stereo 48 kHz' },
  time: 'seconds = frame / fps. Frame ranges are start inclusive, end exclusive.',
  characters: [{ id: NPC_ID, instances: 1, identityAuthority: '.local/npc-reference/white-ball-npc-v1' }],
  nonCharacters: WORLD_PROPS,
  scenes: SCENES.map((s) => s.id),
  files: { scenes: 'scenes.json', audio: 'audio-cues.json' },
});

write('scenes.json', {
  timelineHash: hash, fps: FPS, frames: FRAMES,
  scenes: SCENES.map((s) => ({
    id: s.id, start: s.start, end: s.end, frames: s.end - s.start, startSeconds: seconds(s.start), endSeconds: seconds(s.end), world: s.world, soundIntent: s.soundIntent,
    npc: BEATS.filter((b) => b.start < s.end && b.end > s.start).map((b) => ({
      id: NPC_ID, beat: b.id, start: b.start, end: b.end, relStart: b.start - s.start, relEnd: b.end - s.start, action: b.action, expression: b.expression, visible: b.visible !== false, note: b.note,
      poseAtStart: npcAt(b.start).pose, groundAtStart: npcGroundAt(b.start), hops: hopFrames(b),
    })),
    cameras: CAM_KEYS.filter((k) => k.frame >= s.start && k.frame < s.end).map((k) => ({ ...k, relFrame: k.frame - s.start })),
    cameraAtStart: cameraAt(s.start),
    dof: DOF_KEYS.filter((k) => k.frame >= s.start && k.frame < s.end),
    lightAtStart: lightAt(s.start), lightAtEnd: lightAt(s.end - 1),
    props: WORLD_PROPS.map((p) => p.id),
    sfx: cues.filter((c) => c.scene === s.id).map((c) => c.id),
  })),
  blinkFrames: BLINK_FRAMES, npcBlendSeconds: NPC_BLEND_SECONDS,
  light: { chime: CHIME_FRAME, release: RELEASE_FRAME, revealStart: REVEAL_START, revealEnd: REVEAL_END },
  perFrame: Array.from({ length: FRAMES }, (_, f) => {
    const n = npcAt(f), b = npcScreenBox(f), d = dofAt(f);
    return { f, beat: n.beat, expression: n.expression, action: n.action, visible: n.visible, lift: n.pose.lift, x: round(n.x), z: round(n.z), box: [round(b.x0, 1), round(b.y0, 1), round(b.x1, 1), round(b.y1, 1)], depth: round(b.depth, 3), cInf: round(d.cInf, 3) };
  }),
});

write('audio-cues.json', {
  timelineHash: hash, fps: FPS, frames: FRAMES, sampleRate: SAMPLE_RATE, channels: 2, samples: SAMPLES, voice: 'none',
  score: { bpm: 80, barFrames: 90, barsPerScene: 1, beatFrames: 22.5, key: 'D with a raised fourth, resolving to D major' },
  cues,
});
console.log(`manifest written, timeline ${hash.slice(0, 16)}, ${cues.length} cues`);
