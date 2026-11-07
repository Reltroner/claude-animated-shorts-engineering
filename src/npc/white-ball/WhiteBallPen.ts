/** WB-NPC-001: Canvas2D renderer using the EXISTING templates/bridge/toon.ts Pen API.
 * The 600x1000 design canvas is reused by templates/bridge/cast.ts Pool/Actor.
 * No new renderer, 3D mesh, external image or ML model is introduced.
 *
 * Coordinates: everything is drawn in source pixels relative to the body centre (see WhiteBallRig.ts). A canvas
 * transform maps them into the 600 x 1000 card with the lowest point of the body on the card's ground line (y = 975).
 * Interiors are opaque because Actor cuts its card out with alphaTest 0.5. Anything under 50 % alpha would vanish.
 */
import type { Pen } from '../../../templates/bridge/toon';
import { WB_BODY, WB_CARD, WB_COLOR, WB_EYE, WB_HAND, WB_HAND_REST, WB_K, WB_SHADE, WB_SHADOW, WB_SWEAT_PERIOD, type P2 } from './WhiteBallRig';
import { assertWhiteBallExpression, assertWhiteBallPose, whiteBallPose, type WBAction, type WBExpression, type WBPose } from './WhiteBallPose';

export type WhiteBallParams = {
  frame: number; fps?: number;
  expression?: WBExpression; action?: WBAction; showShadow?: boolean;
  /** explicit pose (blended timelines, poses tuned for a comparison); replaces frame/fps/action */
  pose?: WBPose;
};

type Pts = [number, number][];
const INK = WB_COLOR.ink;

const ellipse = (x: number, y: number, rx: number, ry: number, n = 180): Pts =>
  Array.from({ length: n }, (_, i) => { const a = (i * 2 * Math.PI) / n; return [x + Math.cos(a) * rx, y + Math.sin(a) * ry] as [number, number]; });
const closed = (a: Pts): Pts => a.concat([a[0]]);
/** quadratic curve as a polyline, because Pen strokes polylines */
const quad = (a: P2, c: P2, b: P2, n = 24): Pts => {
  const out: Pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t;
    out.push([s * s * a[0] + 2 * s * t * c[0] + t * t * b[0], s * s * a[1] + 2 * s * t * c[1] + t * t * b[1]]);
  }
  return out;
};
const cubic = (a: P2, c1: P2, c2: P2, b: P2, n = 24): Pts => {
  const out: Pts = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = 1 - t;
    out.push([
      s * s * s * a[0] + 3 * s * s * t * c1[0] + 3 * s * t * t * c2[0] + t * t * t * b[0],
      s * s * s * a[1] + 3 * s * s * t * c1[1] + 3 * s * t * t * c2[1] + t * t * t * b[1],
    ]);
  }
  return out;
};
/** smooth curve through measured points (Catmull-Rom) */
const through = (p: P2[], n = 10): Pts => {
  const out: Pts = [];
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[Math.max(0, i - 1)], p1 = p[i], p2 = p[i + 1], p3 = p[Math.min(p.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (p2[0] - p0[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (3 * p1[0] - p0[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (p2[1] - p0[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (3 * p1[1] - p0[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push([p[p.length - 1][0], p[p.length - 1][1]]);
  return out;
};

/** the source's lit-sphere fill: multi-stop radial ramp around a light point. Pen.shadedFill has only three stops. */
function ballFill(p: Pen, pts: Pts, cx: number, cy: number, light: { ox: number; oy: number; unit: number; end?: number }, rollRad: number): void {
  const g = p.g;
  // the light stays fixed on screen while the body rolls
  const c = Math.cos(-rollRad), s = Math.sin(-rollRad);
  const ox = light.ox * c - light.oy * s, oy = light.ox * s + light.oy * c;
  const end = light.end ?? WB_SHADE.rampEnd;
  const gr = g.createRadialGradient(cx + ox, cy + oy, 0, cx + ox, cy + oy, light.unit * end);
  for (const [d, col] of WB_SHADE.ramp) if (d <= end) gr.addColorStop(d / end, col);
  p.path(pts, true);
  g.fillStyle = gr;
  g.fill();
}

function drawBody(p: Pen, rollRad: number): void {
  const pts = ellipse(0, 0, WB_BODY.rx - WB_BODY.outline / 2, WB_BODY.ry - WB_BODY.outline / 2);
  ballFill(p, pts, 0, 0, WB_SHADE.body, rollRad);
  p.stroke(closed(pts), WB_BODY.outline, INK);
}

function drawHand(p: Pen, x: number, y: number): void {
  const r = WB_HAND.outerR - WB_HAND.outline / 2;
  const pts = ellipse(x, y, r, r, 96);
  ballFill(p, pts, x, y, WB_SHADE.hand, 0);
  p.stroke(closed(pts), WB_HAND.outline, INK);
}

/** run fn with a vertical squash around (cx, cy): how an open eye closes */
function squashed(p: Pen, cx: number, cy: number, open: number, fn: () => void): void {
  const g = p.g;
  g.save();
  g.translate(cx, cy); g.scale(1, Math.max(0.02, open)); g.translate(-cx, -cy);
  fn();
  g.restore();
}
/** the closed-lid line of a blink, a shallow downward curve across the eye */
const blinkLine = (p: Pen, cx: number, cy: number, w: number) =>
  p.stroke(quad([cx - w, cy - 3], [cx, cy + 9], [cx + w, cy - 3]), WB_EYE.stroke + 0.5, INK);

const BLINK_SHUT = 0.8;

function ring(p: Pen, x: number, y: number): void {
  const pts = ellipse(x, y, WB_EYE.rx, WB_EYE.ry, 96);
  p.path(pts, true); p.g.fillStyle = WB_COLOR.paper; p.g.fill();
  p.stroke(closed(pts), WB_EYE.stroke, INK);
}

/** dark pupil, the grey iris band along its lower edge, and the two highlights. side: -1 = left eye, 1 = right eye. */
function sparklePupil(p: Pen, x: number, y: number, side: -1 | 1, big: P2, small: P2, clipPts: Pts): void {
  const g = p.g;
  p.clip(clipPts, () => {
    p.dot(x, y, 28.7, INK);
    // measured band: 24-172 degrees on the left eye, mirrored on the right. Butt ends, unlike Pen.stroke's round caps.
    const a0 = side < 0 ? 24 : 13, a1 = side < 0 ? 172 : 162, R = 19.5, cy = y - 1.5;
    const band: Pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = ((a0 + ((a1 - a0) * i) / 24) * Math.PI) / 180;
      band.push([x + R * Math.cos(t), cy + R * Math.sin(t)]);
    }
    p.path(band, false);
    g.lineCap = 'butt'; g.lineWidth = 10.5; g.strokeStyle = WB_COLOR.iris; g.stroke();
    p.dot(big[0], big[1], 10.3, WB_COLOR.paper);
    p.dot(small[0], small[1], 5.6, WB_COLOR.paper);
  });
}

function plainEye(p: Pen, x: number, y: number, blink: number, shift: number): void {
  if (blink >= BLINK_SHUT) { blinkLine(p, x + shift, y, WB_EYE.rx + 2); return; }
  squashed(p, x, y, 1 - blink, () => ring(p, x + shift, y));
}

function sparklyEye(p: Pen, side: -1 | 1, blink: number, shift: number): void {
  const [x0, y] = side < 0 ? WB_EYE.left : WB_EYE.right;
  const x = x0 + shift * 0.5, look = shift * 0.5;
  if (blink >= BLINK_SHUT) { blinkLine(p, x, y, WB_EYE.rx + 2); return; }
  squashed(p, x, y, 1 - blink, () => {
    ring(p, x, y);
    // the pupils sit toward the nose in the source, and the big highlights mirror toward it too
    const px = x - side * 14.7 + look, py = y + 3;
    sparklePupil(p, px, py, side, [px - side * 9, py - 10], [px + side * 15, py + 13.5], ellipse(x, y, WB_EYE.rx + 2, WB_EYE.ry + 2, 96));
    p.stroke(closed(ellipse(x, y, WB_EYE.rx, WB_EYE.ry, 96)), WB_EYE.stroke, INK);
  });
}

/** a smooth arc from a to b that passes through m */
const arcThrough = (a: P2, m: P2, b: P2, n = 24): Pts => quad(a, [2 * m[0] - (a[0] + b[0]) / 2, 2 * m[1] - (a[1] + b[1]) / 2], b, n);

function brows(p: Pen, l: [P2, P2, P2], r: [P2, P2, P2], w = 9.7): void {
  p.stroke(arcThrough(l[0], l[1], l[2]), w, INK);
  p.stroke(arcThrough(r[0], r[1], r[2]), w, INK);
}

function openMouth(p: Pen, shift = 0): void {
  // measured: outer 104 x 65 px; the top line is about 1 px heavier than the rest
  const top = quad([-37 + shift, 16.3], [shift, 26.3], [37 + shift, 16.3], 16);
  const pts: Pts = [
    ...top,
    ...quad([37 + shift, 16.3], [47.8 + shift, 13.3], [47.8 + shift, 27], 8).slice(1),
    ...cubic([47.8 + shift, 27], [47.8 + shift, 52], [25 + shift, 72.2], [shift, 72.2], 24).slice(1),
    ...cubic([shift, 72.2], [-25 + shift, 72.2], [-47.8 + shift, 52], [-47.8 + shift, 27], 24).slice(1),
    ...quad([-47.8 + shift, 27], [-47.8 + shift, 13.3], [-37 + shift, 16.3], 8).slice(1),
  ];
  p.path(pts, true); p.g.fillStyle = WB_COLOR.mouth; p.g.fill();
  p.stroke(closed(pts), 9.6, INK);
  p.stroke(top, 10.8, INK);
}

function surprisedMouth(p: Pen, shift = 0): void {
  const cx = -0.6 + shift, cy = 42.4, rx = 22.2, ry = 30.2;
  const pts = ellipse(cx, cy, rx, ry, 72);
  p.path(pts, true); p.g.fillStyle = WB_COLOR.mouthDeep; p.g.fill();
  p.clip(pts, () => p.dot(cx, cy + 30, 19, WB_COLOR.mouthLight));
  p.stroke(closed(pts), 9.5, INK);
}

function drawTiredEye(p: Pen, side: -1 | 1, blink: number, shift: number): void {
  const mx = (x: number) => (side < 0 ? x : -x - 1.5) + shift;
  // measured on the left eye of the source's tired span; the right eye mirrors it
  const lidPts: P2[] = [[mx(-120), -35], [mx(-100), -36.5], [mx(-80), -39], [mx(-60), -44], [mx(-37), -50]];
  const cx = mx(-78.5), cy = -46;
  if (blink >= BLINK_SHUT) { blinkLine(p, cx, cy + 12, 41); return; }
  const lid = through(lidPts, 10);
  const ax = side < 0 ? -14 : 14, A = lidPts[0], B = lidPts[4];
  // lavender lid disc, visible only above the lid line
  const above: Pts = [[A[0] + ax, A[1]], ...lid, [B[0] - ax, B[1]], [B[0] - ax, cy - 60], [A[0] + ax, cy - 60]];
  p.clip(above, () => p.dot(cx, cy, 44, WB_COLOR.lidLavender));
  // the lower lid is a half ellipse hung from the lid line; its lowest point lands at the measured (-80, -5)
  const mxc = (A[0] + B[0]) / 2, myc = (A[1] + B[1]) / 2, hx = (B[0] - A[0]) / 2, hy = (B[1] - A[1]) / 2, len = Math.hypot(hx, hy), depth = 37.8;
  const dx = (side < 0 ? -hy : hy) / len * depth, dy = (side < 0 ? hx : -hx) / len * depth;
  const low: Pts = [];
  for (let i = 0; i <= 48; i++) {
    const th = Math.PI * (1 - i / 48);
    low.push([mxc + hx * Math.cos(th) + dx * Math.sin(th), myc + hy * Math.cos(th) + dy * Math.sin(th)]);
  }
  squashed(p, cx, lidPts[2][1], 1 - blink, () => {
    p.path([...lid, ...[...low].reverse()], true); p.g.fillStyle = WB_COLOR.lidPale; p.g.fill();
    p.stroke(low, 8.6, INK);
  });
  p.stroke(lid, 8.6, INK);
}

type SadEye = { lid: P2[]; inner: P2[]; low: P2[]; outer: P2[]; pupil: P2; big: P2; small: P2; disc: P2 };
/** measured from the source's anxious span. Every line runs from the outer side of the face toward the nose or downward. */
const SAD_EYE: Record<'left' | 'right', SadEye> = {
  left: {
    lid: [[-122, -63], [-100, -67.5], [-80, -73], [-65, -80], [-53, -87]],
    inner: [[-52, -85], [-41, -65], [-37.5, -50], [-42, -30], [-52, -13]],
    low: [[-110, -11], [-85, -14.5], [-60, -14], [-46, -11]],
    outer: [[-121, -63], [-121, -45], [-115, -30], [-103, -15]],
    pupil: [-68, -47], big: [-60, -55], small: [-78.5, -33], disc: [-78, -50],
  },
  right: {
    lid: [[118, -66], [98, -70], [80, -75], [60, -82], [49, -87]],
    inner: [[49, -85], [35, -62], [32, -50], [38, -30], [48, -14]],
    low: [[107.5, -11], [92, -15], [70, -15], [46, -11]],
    outer: [[114.5, -66], [115, -50], [108, -30], [96.5, -16]],
    pupil: [66, -47], big: [56, -54.5], small: [78, -32.5], disc: [78, -52],
  },
};

function drawAnxiousEye(p: Pen, side: -1 | 1, blink: number, shift: number): void {
  const e = side < 0 ? SAD_EYE.left : SAD_EYE.right;
  const mv = (pts: P2[]): P2[] => pts.map(([x, y]) => [x + shift, y]);
  const lid = through(mv(e.lid), 8), inner = through(mv(e.inner), 8), low = through(mv(e.low), 8), outer = through(mv(e.outer), 8);
  const cx = e.pupil[0] + shift, cy = -45;
  if (blink >= BLINK_SHUT) { blinkLine(p, cx - side * 10, cy + 4, 42); return; }
  // lavender eyelid, only above the lid line
  const ax = side < 0 ? -14 : 14;
  const above: Pts = [[e.lid[0][0] + shift + ax, e.lid[0][1]], ...lid, [e.lid[4][0] + shift - ax, e.lid[4][1]], [e.lid[4][0] + shift - ax, e.lid[4][1] - 50], [e.lid[0][0] + shift + ax, e.lid[4][1] - 50]];
  p.clip(above, () => p.dot(e.disc[0] + shift, e.disc[1], 47, WB_COLOR.lidLavender));
  squashed(p, cx, cy, 1 - blink, () => {
    const outline: Pts = [...lid, ...inner, ...[...low].reverse(), ...[...outer].reverse()];
    p.path(outline, true); p.g.fillStyle = WB_COLOR.paper; p.g.fill();
    const look = shift * 0.8;
    sparklePupil(p, e.pupil[0] + shift + look, e.pupil[1], side, [e.big[0] + shift + look, e.big[1]], [e.small[0] + shift + look, e.small[1]], outline);
    p.stroke(outer, 6.5, INK);
    p.stroke(inner, 7, INK);
    p.stroke(low, 7, INK);
    p.stroke(lid, 8, INK);
  });
}

/** The sweat drop. Its timing is measured: appears near the top of the forehead, full size in 0.25 s, then slides about
 *  90 px/s down the side of the face, gone by 1.3 s of its 1.6 s cycle. It starts 3 px below the source's position so its
 *  tip stays clear of the body outline, which means it is always over the opaque body and a fade is safe here. */
function sweatDrop(p: Pen, phase: number): void {
  const t = phase * WB_SWEAT_PERIOD;
  if (t >= 1.3) return;
  const grow = Math.min(1, t / 0.25), g0 = grow * grow * (3 - 2 * grow);
  const fade = t > 1.1 ? (1.3 - t) / 0.2 : 1;
  const s = 0.25 + 0.75 * g0;
  const y = t < 0.25 ? -122 + 34 * g0 : -88 + 88.8 * (t - 0.25);
  const g = p.g;
  g.save();
  g.globalAlpha = fade;
  g.translate(166, y); g.scale(s, s);
  const pts: Pts = [
    ...quad([0, -66], [-7, -36], [-25.5, -3], 18),
    ...cubic([-25.5, -3], [-27, 10], [-14, 23], [0, 23], 16).slice(1),
    ...cubic([0, 23], [14, 23], [27, 10], [25.5, -3], 16).slice(1),
    ...quad([25.5, -3], [7, -36], [0, -66], 18).slice(1),
  ];
  // soft pale rim outside the line, then the body, a deeper crescent low in the belly, the line, and the highlight
  p.stroke(closed(pts), 8.5, WB_COLOR.dropGlow);
  p.path(pts, true); g.fillStyle = WB_COLOR.dropFill; g.fill();
  p.clip(ellipse(0, -2, 22, 22, 48), () => {
    p.dot(2, -5, 21, WB_COLOR.dropDeep);
    p.dot(-3, -14, 21.5, WB_COLOR.dropFill);
  });
  p.stroke(closed(pts), 5, WB_COLOR.dropEdge);
  p.ell(-9, -21, 6.5, 10, WB_COLOR.dropHighlight, 0, 0, 360, 8);
  g.restore();
}

export function drawFace(p: Pen, expr: WBExpression, pose: WBPose): void {
  const shift = pose.eyeShift;
  const faceShift = shift * 0.55, mouthShift = shift * 0.35, blink = pose.blink;
  const [lx, ly] = WB_EYE.left, [rx, ry] = WB_EYE.right;
  switch (expr) {
    case 'default':
      plainEye(p, lx, ly, blink, faceShift); plainEye(p, rx, ry, blink, faceShift);
      openMouth(p, mouthShift);
      break;
    case 'sparkly-happy':
      sparklyEye(p, -1, blink, shift); sparklyEye(p, 1, blink, shift);
      openMouth(p, mouthShift);
      break;
    case 'happy-closed': {
      // already shut: these arcs are the eyes, so a blink changes nothing here
      for (const x of [lx, rx]) {
        const X = x + faceShift;
        p.arc(X, -41.2, 40.1, 25, 180, 360, 11, INK);
      }
      openMouth(p, mouthShift);
      break;
    }
    case 'wink': {
      const X = faceShift;
      brows(p, [[-116 + X, -121], [-86 + X, -143], [-53 + X, -136]], [[49 + X, -137], [82 + X, -145], [116 + X, -124]]);
      // the winking left eye: two strokes meeting at the corner toward the nose
      p.stroke(quad([-97.5 + X, -68], [-63 + X, -60], [-42 + X, -33.5]), 11, INK);
      p.stroke(quad([-116 + X, -32], [-80 + X, -46.5], [-42 + X, -33.5]), 11, INK);
      // the open right eye: solid oval pupil toward the nose, no highlights in the source
      if (blink >= BLINK_SHUT) { blinkLine(p, 75.4 + X, -52.6, WB_EYE.rx + 2); }
      else {
        squashed(p, 75.4 + X, -52.6, 1 - blink, () => {
          ring(p, 75.4 + X, -52.6);
          p.clip(ellipse(75.4 + X, -52.6, WB_EYE.rx, WB_EYE.ry, 96), () => {
            const pts = ellipse(63.9 + X + shift * 0.5, -48.6, 21, 25, 64);
            p.path(pts, true); p.g.fillStyle = INK; p.g.fill();
          });
        });
      }
      openMouth(p, mouthShift);
      break;
    }
    case 'surprised': {
      const X = faceShift;
      brows(p, [[-115 + X, -128.5], [-86 + X, -153.5], [-53 + X, -146.5]], [[52 + X, -144.5], [85 + X, -151.5], [115 + X, -126.5]]);
      plainEye(p, lx, ly, blink, X); plainEye(p, rx, ry, blink, X);
      surprisedMouth(p, mouthShift);
      break;
    }
    case 'tired': {
      const X = faceShift;
      drawTiredEye(p, -1, blink, X); drawTiredEye(p, 1, blink, X);
      // brows after the eyes: they cross the top of the lavender lid
      p.stroke(through([[-118.5 + X, -83.5], [-100 + X, -83.5], [-80 + X, -88], [-55 + X, -107.5]], 10), 9, INK);
      p.stroke(through([[53 + X, -107.5], [79 + X, -88], [98 + X, -83.5], [116 + X, -83.5]], 10), 9, INK);
      p.stroke(quad([-36.5 + mouthShift, 32.5], [mouthShift, 58], [35.3 + mouthShift, 32.5]), 10.5, INK);
      break;
    }
    case 'anxious': {
      const X = faceShift;
      drawAnxiousEye(p, -1, blink, X); drawAnxiousEye(p, 1, blink, X);
      // brows after the eyes: they cross the top of the lavender lid
      p.stroke(through([[-118 + X, -90], [-96 + X, -90], [-76 + X, -98], [-58 + X, -112]], 10), 9, INK);
      p.stroke(through([[50 + X, -113], [67 + X, -101], [92 + X, -94], [113.5 + X, -94.5]], 10), 9, INK);
      p.stroke(through([[-47.3 + mouthShift, 44], [-26.7 + mouthShift, 28.8], [1 + mouthShift, 40], [27.6 + mouthShift, 28.5], [47.7 + mouthShift, 44]], 12), 8.9, INK);
      sweatDrop(p, pose.sweat);
      break;
    }
    default: throw new Error(`Unknown White Ball expression: ${String(expr)}`);
  }
}

/** The opaque Pen-drawn floor shadow, on the card's ground line. 3D scenes use makeWhiteBallShadow() instead. */
function drawCardShadow(p: Pen, pose: WBPose): void {
  const rx = WB_SHADOW.rx * WB_K * pose.shadowScale;
  const ry = WB_SHADOW.ry * WB_K * (0.45 + 0.55 * pose.shadowScale);
  const y = WB_CARD.groundY - WB_SHADOW.aboveBottom * WB_K;
  const pts = ellipse(WB_CARD.w / 2, y, rx, ry, 120);
  p.path(pts, true); p.g.fillStyle = WB_COLOR.shadow; p.g.fill();
}

/** The whole character from an explicit pose. Transparent background by contract. */
export function drawWhiteBallPose(p: Pen, expression: WBExpression, pose: WBPose, options: { showShadow?: boolean } = {}): void {
  assertWhiteBallExpression(expression);
  assertWhiteBallPose(pose);
  const g = p.g;
  if (options.showShadow !== false) drawCardShadow(p, pose);
  const roll = (pose.rollDeg * Math.PI) / 180;

  // body and face: squash stays on the ground line; roll turns about the body centre
  g.save();
  g.translate(WB_CARD.w / 2, WB_CARD.groundY - pose.lift);
  g.scale(WB_K * pose.sx, WB_K * pose.sy);
  g.translate(0, -WB_BODY.ry);
  g.rotate(roll);
  drawBody(p, roll);
  drawFace(p, expression, pose);
  g.restore();

  // Exactly two detached round hands, drawn in front of the body as in the source; no arms and no legs by identity
  // contract. They follow the squash in position but stay circular.
  const rest = WB_HAND_REST[expression];
  const c = Math.cos(roll), s = Math.sin(roll);
  const place = (h: P2, out: number, lift: number): [number, number] => {
    const lx = h[0] + (Math.sign(h[0]) * out) / WB_K, ly = h[1] + lift / WB_K;
    const rx = lx * c - ly * s, ry = lx * s + ly * c;
    return [rx * pose.sx, (ry - WB_BODY.ry) * pose.sy];
  };
  g.save();
  g.translate(WB_CARD.w / 2, WB_CARD.groundY - pose.lift);
  g.scale(WB_K, WB_K);
  const L = place(rest.left, pose.leftHandOut, pose.leftHandLift), R = place(rest.right, pose.rightHandOut, pose.rightHandLift);
  drawHand(p, L[0], L[1]);
  drawHand(p, R[0], R[1]);
  g.restore();
}

/** Draw within existing 600x1000 Pen design coordinates; transparent background by contract. */
export function drawWhiteBallPen(p: Pen, params: WhiteBallParams): void {
  const pose = params.pose ?? whiteBallPose(params.frame, params.fps ?? 30, params.action ?? 'idle');
  drawWhiteBallPose(p, params.expression ?? 'default', pose, { showShadow: params.showShadow });
}
