/** Node-only: the hash that ties a rendered P6 picture to the staging and the code it came from. The soundtrack's lock stays exactly as it is in
 * audio-lock.ts: P6 uses the P5 audio, and timelineHash() still decides whether that audio belongs to this picture's timing. */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashTimeline } from './audio-lock';
import { picture3DForHash } from './episode3d';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/** every source whose text decides the character's pixels, beyond the P5 timeline: a changed line here means the picture must be rendered again */
export const PICTURE_3D_SOURCES = [
  'src/pilot/archive/episode3d.ts', 'src/npc/white-ball-3d/WhiteBall3DFace.ts', 'src/npc/white-ball-3d/WhiteBall3DPose.ts', 'src/npc/white-ball-3d/WhiteBall3DRig.ts',
  'studio/src/pilot/ArchiveWorld3D.ts', 'studio/src/pilot/ArchiveScene3D.tsx', 'studio/src/compositions/WhiteBallArchivePilot3D.tsx',
] as const;

const sourceHash = (rel: string) => createHash('sha256').update(fs.readFileSync(path.join(root, rel), 'utf8').split('\r').join('')).digest('hex');

export const picture3DHash = (): string => hashTimeline({ staging: picture3DForHash(), sources: Object.fromEntries(PICTURE_3D_SOURCES.map((f) => [f, sourceHash(f)])) });

export function assertPicture3DCurrent(render: { picture3DHash?: unknown } | null | undefined, current: string = picture3DHash()): void {
  if (!render || render.picture3DHash !== current) {
    throw new Error(`picture is stale: it was rendered for ${String(render?.picture3DHash)}, the staging and code are ${current}. Re-render the picture.`);
  }
}
