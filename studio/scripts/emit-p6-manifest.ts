// Writes the machine-readable P6 staging under .local/p6-white-ball/storyboard/: it names the P5 timeline and audio it depends on, and every frame's 3D state.
// Run with: node --import tsx studio/scripts/emit-p6-manifest.ts
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WB3D_BODY, WB3D_HAND, WB3D_LIFT_SCALE, WB3D_SEGMENTS } from '../../src/npc/white-ball-3d';
import { pictureHash, timelineHash } from '../../src/pilot/archive/audio-lock';
import { picture3DHash } from '../../src/pilot/archive/audio-lock3d';
import { BEATS, FPS, FRAMES, HEIGHT, SAMPLES, SAMPLE_RATE, SCENES, WIDTH, deriveSfxCues, lightAt, project } from '../../src/pilot/archive/episode';
import { CAM3D_KEYS, EPISODE_3D, FLOOR_Y, PITCH_KEYS, YAW_KEYS, camera3DAt, dof3DAt, npc3DAt, npc3DScreenBox, shadowOnFloor } from '../../src/pilot/archive/episode3d';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(root, '.local', 'p6-white-ball', 'storyboard');
fs.mkdirSync(OUT, { recursive: true });
const r = (v: number, k = 4) => Math.round(v * 10 ** k) / 10 ** k;
const v3 = (v: readonly number[], k = 4) => v.map((x) => r(x, k));
/** the hall's constant SUN_DIR, normalised. The tests check it against ArchiveHall.ts. */
const L = Math.hypot(0.12, 0.4, -0.91), TOWARD_SUN = [0.12 / L, 0.4 / L, -0.91 / L] as const;

fs.writeFileSync(path.join(OUT, 'episode3d.json'), JSON.stringify({
  ...EPISODE_3D, picture3DHash: picture3DHash(), timelineHash: timelineHash(), pictureHash: pictureHash(),
  fps: FPS, frames: FRAMES, width: WIDTH, height: HEIGHT, seconds: FRAMES / FPS, sampleRate: SAMPLE_RATE, samplesPerChannel: SAMPLES,
  audio: '.local/p5-white-ball/audio/mix.wav', scenes: SCENES, beats: BEATS,
  rig: { body: WB3D_BODY, hand: WB3D_HAND, segments: WB3D_SEGMENTS, liftScale: WB3D_LIFT_SCALE, floorY: FLOOR_Y },
  yawKeys: YAW_KEYS, pitchKeys: PITCH_KEYS, cameras: CAM3D_KEYS, cues: deriveSfxCues().map((c) => ({ id: c.id, type: c.type, frame: c.frame, seconds: c.seconds })),
}, null, 2) + '\n');

const perFrame = Array.from({ length: FRAMES }, (_, f) => {
  const s = npc3DAt(f), c = camera3DAt(f), b = npc3DScreenBox(f), d = dof3DAt(f);
  const hl = project(c, s.handLeft), hr = project(c, s.handRight);
  const px = HEIGHT / (2 * Math.tan((c.fov * Math.PI) / 360));
  const q = s.quaternion;
  const shadow = shadowOnFloor(s.centre, TOWARD_SUN), shadowPx = project(c, shadow);
  const facePx = project(c, [s.centre[0] + 2 * (q[0] * q[2] + q[3] * q[1]) * WB3D_BODY.outerA, s.centre[1] + 2 * (q[1] * q[2] - q[3] * q[0]) * WB3D_BODY.outerB, s.centre[2] + (1 - 2 * (q[0] * q[0] + q[1] * q[1])) * WB3D_BODY.outerA]);
  return {
    f, beat: s.beat, visible: s.visible, expression: s.expression, action: s.action,
    centre: v3(s.centre), height: r(s.contact[1] - FLOOR_Y), quaternion: v3(q, 5), squash: v3(s.squash), handLeft: v3(s.handLeft), handRight: v3(s.handRight), face: s.face,
    cam: { pos: v3(c.pos), look: v3(c.look), fov: r(c.fov, 3) }, cInf: r(d.cInf, 3), focus: r(d.focusDistance),
    box: { x0: r(b.x0, 1), y0: r(b.y0, 1), x1: r(b.x1, 1), y1: r(b.y1, 1), cx: r(b.cx, 1), cy: r(b.cy, 1), ppm: r(b.ppm, 2), depth: r(b.depth, 3) },
    handLeftPx: { x: r(hl.x, 1), y: r(hl.y, 1), r: r((WB3D_HAND.outerR * px) / hl.depth, 1) }, handRightPx: { x: r(hr.x, 1), y: r(hr.y, 1), r: r((WB3D_HAND.outerR * px) / hr.depth, 1) },
    facePx: { x: r(facePx.x, 1), y: r(facePx.y, 1) }, sunShadowPx: { x: r(shadowPx.x, 1), y: r(shadowPx.y, 1), world: v3(shadow) }, fade: r(lightAt(f).fade),
  };
});
fs.writeFileSync(path.join(OUT, 'frames3d.json'), JSON.stringify(perFrame) + '\n');
console.log(`staging ${picture3DHash()}\ntimeline ${timelineHash()}\n${perFrame.length} frames written to ${path.relative(root, OUT)}`);
