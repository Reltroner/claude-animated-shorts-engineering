// P5 manifest: the frame-time contract shared by picture and sound. Pure code, no browser.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { WB_ACTIONS, WB_EXPRESSIONS, whiteBallPose } from '../src/npc/white-ball';
import { assertAudioCurrent, assertPictureCurrent, canonicalJson, hashTimeline, pictureHash, timelineHash } from '../src/pilot/archive/audio-lock';
import {
  BEATS, CAM_KEYS, CHIME_FRAME, EPISODE, FPS, FRAMES, HEIGHT, NPC_ID, RELEASE_FRAME, SAMPLES, SAMPLE_RATE, SCENES, WIDTH, WORLD_PROPS,
  deriveSfxCues, hopFrames, npcAt, sampleOf, sceneAt, seconds, timelineForHash,
} from '../src/pilot/archive/episode';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('format is the brief: 1080 x 1920, 30 fps, 360 frames, 12.000 s, 576000 samples', () => {
  assert.equal(WIDTH, 1080); assert.equal(HEIGHT, 1920); assert.equal(FPS, 30); assert.equal(FRAMES, 360);
  assert.equal(FRAMES / FPS, 12);
  assert.equal(SAMPLE_RATE, 48000); assert.equal(SAMPLES, 576000);
  assert.equal(SAMPLES, Math.round(12 * 48000));
});

test('it is declared a technical demo with no voice', () => {
  assert.match(EPISODE.status, /TECHNICAL DEMO/);
  assert.equal(EPISODE.voice, 'none');
});

test('the four scenes have stable ids and cover every frame exactly once', () => {
  assert.deepEqual(SCENES.map((s) => s.id), ['SC-001', 'SC-002', 'SC-003', 'SC-004']);
  assert.equal(SCENES[0].start, 0);
  for (let i = 1; i < SCENES.length; i++) assert.equal(SCENES[i].start, SCENES[i - 1].end);
  assert.equal(SCENES[SCENES.length - 1].end, FRAMES);
  assert.deepEqual([SCENES[0].end, SCENES[1].end, SCENES[2].end, SCENES[3].end], [90, 180, 270, 360]);
  for (let f = 0; f < FRAMES; f++) assert.ok(f >= sceneAt(f).start && f < sceneAt(f).end);
  assert.throws(() => sceneAt(360)); assert.throws(() => sceneAt(-1)); assert.throws(() => sceneAt(1.5));
});

test('every character on screen is WB-NPC-001; everything else is marked non-character', () => {
  for (let f = 0; f < FRAMES; f += 7) assert.equal(npcAt(f).npc, NPC_ID);
  assert.equal(NPC_ID, 'WB-NPC-001');
  for (const p of WORLD_PROPS) assert.equal(p.kind, 'non-character');
  const ids = WORLD_PROPS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'prop ids are unique');
});

test('beats are contiguous, use only the runtime vocabulary, and tell the story the brief asks for', () => {
  assert.equal(BEATS[0].start, 0);
  for (let i = 1; i < BEATS.length; i++) assert.equal(BEATS[i].start, BEATS[i - 1].end, `gap before ${BEATS[i].id}`);
  assert.equal(BEATS[BEATS.length - 1].end, FRAMES);
  for (const b of BEATS) {
    assert.ok((WB_ACTIONS as readonly string[]).includes(b.action), b.action);
    assert.ok((WB_EXPRESSIONS as readonly string[]).includes(b.expression), b.expression);
  }
  const in_ = (id: string) => { const s = SCENES.find((x) => x.id === id)!; return BEATS.filter((b) => b.start < s.end && b.end > s.start); };
  const actions = (id: string) => in_(id).map((b) => b.action);
  const faces = (id: string) => in_(id).map((b) => b.expression);
  assert.ok(actions('SC-001').includes('hop'), 'SC-001: the ball enters');
  for (const a of ['look-left', 'look-right', 'hop', 'wave'] as const) assert.ok(actions('SC-002').includes(a), `SC-002 has ${a}`);
  assert.ok(faces('SC-003').includes('surprised') && faces('SC-003').includes('anxious'), 'SC-003: surprised, then anxious');
  assert.ok(faces('SC-003').indexOf('surprised') < faces('SC-003').indexOf('anxious'));
  assert.ok(faces('SC-004').every((e) => e === 'sparkly-happy'), 'SC-004: sparkly-happy');
  assert.ok(new Set(BEATS.filter((b) => b.visible !== false).map((b) => b.action)).size >= 4, 'at least four visibly different actions');
});

test('cues: frame, seconds and sample all agree, and each one names its scene', () => {
  const cues = deriveSfxCues();
  assert.ok(cues.length > 0);
  assert.equal(new Set(cues.map((c) => c.id)).size, cues.length, 'stable unique ids');
  assert.ok(new Set(cues.map((c) => c.type)).size >= 2, 'at least two distinct event types');
  for (const c of cues) {
    assert.ok(Number.isInteger(c.frame) && c.frame >= 0 && c.frame < FRAMES, c.id);
    assert.equal(c.seconds, seconds(c.frame), c.id);
    assert.equal(c.seconds, c.frame / FPS, c.id);
    assert.equal(c.sample, sampleOf(c.frame), c.id);
    assert.ok(c.sample < SAMPLES, c.id);
    const s = sceneAt(c.frame);
    assert.equal(c.scene, s.id, c.id);
    assert.equal(c.relFrame, c.frame - s.start, c.id);
    assert.ok(Number.isFinite(c.pan) && Math.abs(c.pan) <= 1, c.id);
    assert.ok(Number.isInteger(c.seed), c.id);
  }
  for (let i = 1; i < cues.length; i++) assert.ok(cues[i].frame >= cues[i - 1].frame, 'sorted by time');
});

test('a hop contact cue lands on the exact frame the character lands: pose lift 0 now, above 0 the frame before', () => {
  const contacts = deriveSfxCues().filter((c) => c.type === 'hop_contact');
  assert.equal(contacts.length, 3);
  for (const c of contacts) {
    assert.equal(npcAt(c.frame).pose.lift, 0, `${c.id} on the floor at ${c.frame}`);
    assert.ok(npcAt(c.frame - 1).pose.lift > 0, `${c.id} still in the air at ${c.frame - 1}`);
  }
  const lifts = deriveSfxCues().filter((c) => c.type === 'hop_lift');
  assert.equal(lifts.length, 3);
  for (const c of lifts) assert.ok(npcAt(c.frame).pose.lift > 0, `${c.id} off the floor at ${c.frame}`);
});

test('hopFrames follows the pose function itself', () => {
  for (const b of BEATS) for (const [i, h] of hopFrames(b).entries()) {
    const local = h.contact - b.start;
    assert.equal(whiteBallPose(local, FPS, 'hop').lift, 0, `${b.id} hop ${i}`);
    assert.ok(whiteBallPose(local - 1, FPS, 'hop').lift > 0, `${b.id} hop ${i}`);
  }
});

test('cues follow what happens on screen: surprise, chime, release and camera moves', () => {
  const cues = deriveSfxCues();
  const of = (t: string) => cues.filter((c) => c.type === t);
  const surprised = BEATS.find((b) => b.expression === 'surprised')!;
  assert.equal(of('surprise_pop')[0].frame, surprised.start);
  assert.equal(npcAt(surprised.start).expression, 'surprised');
  assert.equal(of('artifact_chime')[0].frame, CHIME_FRAME);
  assert.ok(CHIME_FRAME < surprised.start, 'the light comes first, the reaction follows');
  assert.equal(of('release_bell')[0].frame, RELEASE_FRAME);
  assert.deepEqual(of('camera_air').map((c) => c.frame), CAM_KEYS.slice(1).map((k) => k.frame));
  const wave = BEATS.find((b) => b.action === 'wave')!;
  for (const c of of('wave_swish')) assert.ok(c.frame >= wave.start && c.frame < wave.end, c.id);
});

test('the hash is stable, ignores key order and does not depend on levels', () => {
  assert.equal(timelineHash(), timelineHash());
  assert.match(timelineHash(), /^[0-9a-f]{64}$/);
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 3, c: 4 }] }), canonicalJson({ a: [2, { c: 4, d: 3 }], b: 1 }));
  assert.ok(!canonicalJson(timelineForHash()).includes('gainDb'));
});

test('changing a scene length invalidates the audio timeline', () => {
  const base = hashTimeline(timelineForHash());
  const longer = SCENES.map((s, i) => (i === 0 ? { ...s, end: s.end + 1 } : s));
  assert.notEqual(hashTimeline(timelineForHash(longer)), base);
  const moved = BEATS.map((b) => (b.id === 'B05' ? { ...b, start: b.start + 2 } : b));
  assert.notEqual(hashTimeline(timelineForHash(SCENES, moved)), base);
  assert.notEqual(hashTimeline(timelineForHash(SCENES, BEATS, 361)), base);
  assert.notEqual(hashTimeline(timelineForHash(SCENES, BEATS, FRAMES, 24)), base);
});

test('stale audio or a stale picture is refused', () => {
  const now = timelineHash(), pic = pictureHash();
  assert.doesNotThrow(() => assertAudioCurrent({ timelineHash: now }));
  assert.throws(() => assertAudioCurrent({ timelineHash: 'old' }), /stale/);
  assert.throws(() => assertAudioCurrent({}), /stale/);
  assert.throws(() => assertAudioCurrent(null), /stale/);
  assert.doesNotThrow(() => assertPictureCurrent({ pictureHash: pic }));
  assert.throws(() => assertPictureCurrent({ pictureHash: 'old' }), /stale/);
});

test('when the emitted manifest exists, it is exactly what the source says now', { skip: !fs.existsSync(path.join(root, '.local/p5-white-ball/storyboard/audio-cues.json')) }, () => {
  const dir = path.join(root, '.local/p5-white-ball/storyboard');
  const audio = JSON.parse(fs.readFileSync(path.join(dir, 'audio-cues.json'), 'utf8'));
  const episode = JSON.parse(fs.readFileSync(path.join(dir, 'episode.json'), 'utf8'));
  const scenes = JSON.parse(fs.readFileSync(path.join(dir, 'scenes.json'), 'utf8'));
  assert.equal(audio.timelineHash, timelineHash(), 're-run the manifest step');
  assert.equal(episode.timelineHash, timelineHash());
  assert.equal(episode.pictureHash, pictureHash());
  assert.equal(scenes.timelineHash, timelineHash());
  assert.deepEqual(audio.cues, JSON.parse(JSON.stringify(deriveSfxCues())));
  assert.equal(scenes.perFrame.length, FRAMES);
  assert.equal(audio.voice, 'none');
  assert.equal(audio.samples, 576000);
});
