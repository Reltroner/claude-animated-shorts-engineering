// The first playable clip of WB-NPC-001, as data. Pure, so tests read the same timeline the composition plays.
import type { WBSegment } from '../../src/npc/white-ball';

export const WB_TEST_FPS = 30;
export const WB_TEST_WIDTH = 1080;
export const WB_TEST_HEIGHT = 1920;

/** Four action segments, 60 frames at 30 fps. The first and last share an expression so the 2 s clip loops without a face swap. */
export const WB_TEST_SEGMENTS: readonly WBSegment[] = [
  { action: 'hop', expression: 'sparkly-happy', seconds: 26 / 30 },
  { action: 'wave', expression: 'happy-closed', seconds: 14 / 30 },
  { action: 'float', expression: 'surprised', seconds: 10 / 30 },
  { action: 'react', expression: 'sparkly-happy', seconds: 10 / 30 },
];

/** soft cool grey: the off-white body and the near-black outline both read on it, and pure white would hide the silhouette */
export const WB_TEST_BACKGROUND = '#c7ced8';
