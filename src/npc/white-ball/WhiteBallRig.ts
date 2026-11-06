/** WB-NPC-001 canonical geometry and palette. Pure data: no DOM, no React, no three.js.
 *
 * Every length below is in SOURCE PIXELS relative to the body centre, as measured from the owner's reference video
 * (tests/visual/measure_source.py over all 240 frames; the medians are the rest pose). WhiteBallPen.ts draws these
 * numbers through a canvas transform that scales them by WB_K into the existing 600 x 1000 Pen design space, so a
 * value here can be checked directly against the per-frame measurement table.
 *
 * Changing one of these constants changes the character's identity: re-run the comparison in tests/visual first.
 */
export type P2 = readonly [number, number];

export const WB_CARD = { w: 600, h: 1000, groundY: 975 } as const;

/** design units per source pixel: the widest measured pose (hands spread to +-243 px, r 58.5) still fits the 600 unit card */
export const WB_K = 0.92;

/** measured: outer rx 229.84, ry 241.21 (h/w 1.05); the outline is 13.7 px at 50 % luma. Drawn values are 0.7 px and 0.2 px
 *  larger, because going through a texture softens a line. The same measurement then reads the same on a render. */
export const WB_BODY = { rx: 230.5, ry: 241.9, outline: 13.9 } as const;

/** measured: outer radius 58.05 and outline 10.8 px at 50 % luma, with the same softening allowance as the body.
 *  Same size in every expression. */
export const WB_HAND = { outerR: 58.15, outline: 10.9 } as const;

/** floor shadow in source pixels. Centre sits 10 px above the body's lowest point, so the ball overlaps it when grounded. */
export const WB_SHADOW = { rx: 197.5, ry: 27.5, aboveBottom: 10 } as const;

/** one cycle of the anxious sweat drop, in seconds. The source's drop lasts about 1.3 s; the rest of the cycle is a pause. */
export const WB_SWEAT_PERIOD = 1.6;

export const WB_COLOR = {
  ink: '#030303',
  paper: '#ffffff',
  mouth: '#b4737c',
  mouthDeep: '#a36975',
  mouthLight: '#ca868d',
  lidLavender: '#dedee6',
  lidPale: '#ebecef',
  iris: '#4e4e4f',
  shadow: '#afafaf',
  dropFill: '#8acff0',
  dropDeep: '#4aa7d8',
  dropGlow: '#bfe7fb',
  dropEdge: '#3a92c4',
  dropHighlight: '#fcf8f5',
} as const;

/** Two-zone lit-sphere ramp, sampled from the source along distance from a light point up and to the left of the body. */
const SHADE_RAMP: readonly (readonly [number, string])[] = [
  [0.0, '#fcfcfc'], [0.62, '#fafafa'], [0.7, '#f8f8f8'], [0.78, '#f3f4f4'], [0.86, '#eceded'],
  [0.94, '#e4e4e9'], [0.98, '#d0ced9'], [1.02, '#c4c1d1'], [1.1, '#bcb6cb'], [1.18, '#b6afc5'], [1.25, '#b3acc2'],
];
export const WB_SHADE = {
  ramp: SHADE_RAMP,
  /** radius of the ramp's last stop, as a multiple of the ramp's unit distance */
  rampEnd: 1.25,
  /** body: light point (-.246 rx, -.273 ry), unit distance 1.079 rx */
  body: { ox: -0.246 * WB_BODY.rx, oy: -0.273 * WB_BODY.ry, unit: 1.079 * WB_BODY.rx },
  /** hand: light point (-12, -12) px, unit distance 50 px; its ramp stops at 1.1, because the source's hands never get as dark as the body */
  hand: { ox: -12, oy: -12, unit: 50, end: 1.1 },
} as const;

export const WB_EYE = {
  /** ring centres, measured over the plain-eye frames */
  left: [-77.9, -51] as P2,
  right: [76.1, -51] as P2,
  /** path radii and stroke: 8.15 px at 50 % luma on the source, outer edge 45 x 47 */
  rx: 41.25, ry: 43.25, stroke: 8.7,
} as const;

/** Expression-specific rest pose of the two hands, medians over the settled span of each expression. */
export const WB_HAND_REST = {
  default: { left: [-205.6, 68.4], right: [208.2, 68.5] },
  'happy-closed': { left: [-208, 67.6], right: [210.6, 67.6] },
  wink: { left: [-197.5, 74.5], right: [205.1, 64.9] },
  surprised: { left: [-224.1, 77.1], right: [225.2, 75.7] },
  tired: { left: [-202, 106.7], right: [204.2, 106.8] },
  anxious: { left: [-171.5, 92.6], right: [176.5, 80.4] },
  'sparkly-happy': { left: [-205, 68.9], right: [207.7, 69.1] },
} as const satisfies Record<string, { left: P2; right: P2 }>;
