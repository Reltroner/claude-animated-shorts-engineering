/** Node-only half of the manifest: the timeline hash and the check that sound belongs to the current picture.
 * Changing a scene length, a beat or a cue changes the hash. Audio rendered for the old hash then fails assertAudioCurrent,
 * so a stale soundtrack cannot be muxed onto a new picture. */
import { createHash } from 'node:crypto';
import { pictureForHash, timelineForHash } from './episode';

/** JSON with sorted keys, so the hash does not depend on property order */
export const canonicalJson = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
};

export const hashTimeline = (timeline: unknown): string => createHash('sha256').update(canonicalJson(timeline)).digest('hex');

export const timelineHash = (): string => hashTimeline(timelineForHash());
export const pictureHash = (): string => hashTimeline(pictureForHash());

export function assertAudioCurrent(measured: { timelineHash?: unknown } | null | undefined, current: string = timelineHash()): void {
  if (!measured || measured.timelineHash !== current) {
    throw new Error(`audio timeline is stale: audio was made for ${String(measured?.timelineHash)}, the picture is ${current}. Re-run the audio step.`);
  }
}

/** A rendered picture carries the hash of the picture timing it was made from. */
export function assertPictureCurrent(render: { pictureHash?: unknown } | null | undefined, current: string = pictureHash()): void {
  if (!render || render.pictureHash !== current) {
    throw new Error(`picture is stale: it was rendered for ${String(render?.pictureHash)}, the manifest is ${current}. Re-render the picture.`);
  }
}
