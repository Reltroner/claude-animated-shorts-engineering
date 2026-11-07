/** WB-NPC-001's face as real surface geometry: triangles lying on the body's curved surface. No texture, no canvas, no card.
 *
 * The drawing itself is not rewritten. The P3 program, drawFace() in WhiteBallPen.ts with every measured curve in it, runs here
 * unchanged through the real Pen class, against a context that records vectors instead of painting pixels. Each fill and stroke
 * becomes triangles in source pixels, those are tessellated, and each vertex is carried onto the ellipsoid by orthographic
 * projection along the body's forward axis. So seen straight on from far away the mesh IS the P3 drawing, and seen from anywhere
 * else it foreshortens, slides toward the limb and hides behind the body like anything else fixed to a ball.
 *
 * Pure: no DOM, no WebGL, no clock. The same input gives the same arrays, in any order. Runs in Node, which is how tests read it.
 */
import { ShapeUtils, Vector2 } from 'three';
import { Pen } from '../../../templates/bridge/toon';
import { WB_BODY, WB_K } from '../white-ball/WhiteBallRig';
import { WB_SU } from '../white-ball/WhiteBallBridge';
import { drawFace } from '../white-ball/WhiteBallPen';
import { assertWhiteBallExpression, type WBExpression, type WBPose } from '../white-ball/WhiteBallPose';

/** metres per source pixel, the P3 card's own scale */
export const WB3D_M = WB_K * WB_SU;
/** the white surface sits inside the ink outline, so these are the measured outer radii minus the outline */
export const WB3D_SKIN = {
  a: (WB_BODY.rx - WB_BODY.outline) * WB3D_M,
  b: (WB_BODY.ry - WB_BODY.outline) * WB3D_M,
  c: (WB_BODY.rx - WB_BODY.outline) * WB3D_M,
} as const;
/** how far the face stands off the skin, as a fraction of the radius. Enough to clear the chord sag of both meshes (see tests). */
export const WB3D_FACE_LIFT = 0.0016;
/** longest triangle edge on the surface, in source pixels. The rule depends only on the edge, so neighbours split the same way and no crack opens. */
const MAX_EDGE = 12;
/** Source coordinates sit on this grid before tessellation. Clipping computes a shared corner twice, from either side, and the two answers can differ
 *  in the last bits. On the grid they are the same number, so the edge test above cannot split one side and not the other. */
const snap = (v: number) => Math.round(v * 1e4) / 1e4 + 0;
const SMOOTH_TURN = Math.cos((28 * Math.PI) / 180);

export type FaceInput = Readonly<{
  /** source pixels. The 3D body turns for real, so this is only what the eyes lead the turn by. */
  eyeShift: number;
  /** 0 open .. 1 shut */
  blink: number;
  /** 0..1 phase of the anxious sweat drop */
  sweat: number;
  /** 1 = as drawn. Below 1 the mouth is flattened about its own centre, so a change of mouth can close and reopen instead of popping. */
  mouthOpen?: number;
}>;

export type FaceMesh = Readonly<{
  key: string;
  /** xyz in metres, body-local: origin at the body centre, +z the face's forward axis, +y up */
  positions: Float32Array;
  /** unit surface normals of the ellipsoid */
  normals: Float32Array;
  /** linear rgba per vertex */
  colors: Float32Array;
  triangles: number;
  /** drawing operations that made this mesh, in paint order, for tests and traces */
  ops: readonly { kind: 'fill' | 'stroke'; style: string; alpha: number; triangles: number; group: 'mouth' | 'other' }[];
}>;

type P = [number, number];
type M = [number, number, number, number, number, number];
const IDENTITY: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];
const tx = (m: M, x: number, y: number): P => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const invert = (m: M): M => {
  const d = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(d) < 1e-12) return IDENTITY;
  return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d, (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
};

const linear = (u: number) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const parseColour = (style: unknown): [number, number, number] => {
  if (typeof style !== 'string' || !/^#[0-9a-f]{6}$/i.test(style)) throw new Error(`face: colour must be #rrggbb, got ${String(style)}`);
  const n = parseInt(style.slice(1), 16);
  return [linear(((n >> 16) & 255) / 255), linear(((n >> 8) & 255) / 255), linear((n & 255) / 255)];
};

const clean = (pts: P[]): P[] => {
  const out: P[] = [];
  for (const p of pts) { const q = out[out.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push(p); }
  return out;
};

/** flat [x0,y0,x1,y1,x2,y2,...] triangles of a simple polygon */
const triangulate = (poly: P[]): number[] => {
  const pts = clean(poly);
  if (pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-6) pts.pop();
  if (pts.length < 3) return [];
  const out: number[] = [];
  for (const [a, b, c] of ShapeUtils.triangulateShape(pts.map(([x, y]) => new Vector2(x, y)), [])) out.push(...pts[a], ...pts[b], ...pts[c]);
  return out;
};

const disc = (out: number[], c: P, r: number) => {
  const n = Math.max(10, Math.ceil((2 * Math.PI * r) / 2.5));
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * 2 * Math.PI, a1 = ((i + 1) / n) * 2 * Math.PI;
    out.push(c[0], c[1], c[0] + Math.cos(a0) * r, c[1] + Math.sin(a0) * r, c[0] + Math.cos(a1) * r, c[1] + Math.sin(a1) * r);
  }
};

/** A stroked polyline as triangles: mitred where it turns gently, a round join where it turns sharply, as Canvas2D's round joins look. */
const ribbon = (input: P[], width: number, cap: string): number[] => {
  const out: number[] = [];
  const h = width / 2;
  let pts = clean(input);
  if (pts.length === 0) return out;
  if (pts.length === 1) { if (cap === 'round') disc(out, pts[0], h); return out; }
  const closed = pts.length > 2 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1e-3;
  if (closed) pts = pts.slice(0, -1);
  const n = pts.length, segs = closed ? n : n - 1;
  const dir: P[] = [];
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    dir.push([(b[0] - a[0]) / L, (b[1] - a[1]) / L]);
  }
  /** offset at a vertex between two segments, or null when the turn is too sharp to mitre */
  const miter = (i: number, j: number): P | null => {
    const c = dir[i][0] * dir[j][0] + dir[i][1] * dir[j][1];
    if (c < SMOOTH_TURN) return null;
    const nx = -(dir[i][1] + dir[j][1]), ny = dir[i][0] + dir[j][0], L = Math.hypot(nx, ny) || 1, k = h / Math.max(0.5, L / 2);
    return [(nx / L) * k, (ny / L) * k];
  };
  for (let i = 0; i < segs; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const flat: P = [-dir[i][1] * h, dir[i][0] * h];
    const hasPrev = closed || i > 0, hasNext = closed || i < segs - 1;
    const m0 = hasPrev ? miter((i - 1 + segs) % segs, i) : null;
    const m1 = hasNext ? miter(i, (i + 1) % segs) : null;
    const o0 = m0 ?? flat, o1 = m1 ?? flat;
    const al: P = [a[0] + o0[0], a[1] + o0[1]], ar: P = [a[0] - o0[0], a[1] - o0[1]];
    const bl: P = [b[0] + o1[0], b[1] + o1[1]], br: P = [b[0] - o1[0], b[1] - o1[1]];
    out.push(...al, ...ar, ...br, ...al, ...br, ...bl);
    if (hasNext && !m1) disc(out, b, h);
  }
  if (!closed && cap === 'round') { disc(out, pts[0], h); disc(out, pts[n - 1], h); }
  return out;
};

/** the part of a triangle inside a convex triangle (Sutherland-Hodgman), appended as a fan */
const clipTriangle = (out: number[], t: number[], i: number, c: number[], j: number) => {
  let poly: P[] = [[t[i], t[i + 1]], [t[i + 2], t[i + 3]], [t[i + 4], t[i + 5]]];
  const cp: P[] = [[c[j], c[j + 1]], [c[j + 2], c[j + 3]], [c[j + 4], c[j + 5]]];
  const area = (cp[1][0] - cp[0][0]) * (cp[2][1] - cp[0][1]) - (cp[1][1] - cp[0][1]) * (cp[2][0] - cp[0][0]);
  if (Math.abs(area) < 1e-9) return;
  const s = area > 0 ? 1 : -1;
  for (let e = 0; e < 3 && poly.length > 0; e++) {
    const p0 = cp[e], p1 = cp[(e + 1) % 3];
    const side = (q: P) => s * ((p1[0] - p0[0]) * (q[1] - p0[1]) - (p1[1] - p0[1]) * (q[0] - p0[0]));
    const next: P[] = [];
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length], da = side(a), db = side(b);
      if (da >= 0) next.push(a);
      if ((da >= 0) !== (db >= 0)) { const u = da / (da - db); next.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); }
    }
    poly = next;
  }
  for (let k = 1; k + 1 < poly.length; k++) out.push(...poly[0], ...poly[k], ...poly[k + 1]);
};

const clipAll = (tris: number[], clips: number[][]): number[] => {
  let cur = tris;
  for (const clip of clips) {
    const next: number[] = [];
    for (let i = 0; i < cur.length; i += 6) for (let j = 0; j < clip.length; j += 6) clipTriangle(next, cur, i, clip, j);
    cur = next;
  }
  return cur;
};

type Op = { kind: 'fill' | 'stroke'; style: string; colour: [number, number, number]; alpha: number; tris: number[] };

/** The subset of CanvasRenderingContext2D that Pen and drawFace use, recording triangles in source pixels */
class FaceContext2D {
  fillStyle: unknown = '#000000';
  strokeStyle: unknown = '#000000';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  globalAlpha = 1;
  readonly ops: Op[] = [];
  private m: M = IDENTITY;
  private clips: number[][] = [];
  private stack: { m: M; fillStyle: unknown; strokeStyle: unknown; lineWidth: number; lineCap: string; globalAlpha: number; clips: number }[] = [];
  private subpaths: P[][] = [];

  save() { this.stack.push({ m: this.m, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, lineCap: this.lineCap, globalAlpha: this.globalAlpha, clips: this.clips.length }); }
  restore() {
    const s = this.stack.pop();
    if (!s) throw new Error('face: restore without save');
    this.m = s.m; this.fillStyle = s.fillStyle; this.strokeStyle = s.strokeStyle; this.lineWidth = s.lineWidth; this.lineCap = s.lineCap; this.globalAlpha = s.globalAlpha;
    this.clips.length = s.clips;
  }
  translate(x: number, y: number) { this.m = mul(this.m, [1, 0, 0, 1, x, y]); }
  scale(x: number, y: number) { this.m = mul(this.m, [x, 0, 0, y, 0, 0]); }
  beginPath() { this.subpaths = []; }
  moveTo(x: number, y: number) { this.subpaths.push([tx(this.m, x, y)]); }
  lineTo(x: number, y: number) { const s = this.subpaths[this.subpaths.length - 1]; if (s) s.push(tx(this.m, x, y)); else this.moveTo(x, y); }
  closePath() { const s = this.subpaths[this.subpaths.length - 1]; if (s && s.length > 1) s.push([...s[0]]); }
  /** full circles only: Pen.dot is the one user */
  arc(x: number, y: number, r: number) {
    const n = 64, s: P[] = [];
    for (let i = 0; i <= n; i++) s.push(tx(this.m, x + Math.cos((i / n) * 2 * Math.PI) * r, y + Math.sin((i / n) * 2 * Math.PI) * r));
    this.subpaths.push(s);
  }
  fill() {
    const style = String(this.fillStyle);
    const tris = this.subpaths.flatMap((s) => triangulate(s));
    this.ops.push({ kind: 'fill', style, colour: parseColour(this.fillStyle), alpha: this.globalAlpha, tris: clipAll(tris, this.clips) });
  }
  /** a stroke is widened in user space and then transformed, so a squashed eye has a squashed line, as on a canvas */
  stroke() {
    const style = String(this.strokeStyle), inv = invert(this.m), m = this.m;
    const tris: number[] = [];
    for (const s of this.subpaths) {
      const local = ribbon(s.map(([x, y]) => tx(inv, x, y)), this.lineWidth, this.lineCap);
      for (let i = 0; i < local.length; i += 2) tris.push(...tx(m, local[i], local[i + 1]));
    }
    this.ops.push({ kind: 'stroke', style, colour: parseColour(this.strokeStyle), alpha: this.globalAlpha, tris: clipAll(tris, this.clips) });
  }
  clip() { this.clips.push(this.subpaths.flatMap((s) => triangulate(s))); }
  get depth() { return this.stack.length; }
}

const bbox = (tris: number[]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < tris.length; i += 2) { x0 = Math.min(x0, tris[i]); x1 = Math.max(x1, tris[i]); y0 = Math.min(y0, tris[i + 1]); y1 = Math.max(y1, tris[i + 1]); }
  return { x0, y0, x1, y1 };
};
/** every mouth in the kit sits on the centre line below the eyes, and nothing else does */
const isMouth = (tris: number[]) => {
  if (tris.length === 0) return false;
  const b = bbox(tris), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  return cy > 5 && Math.abs(cx) < 60;
};

const tessellate = (out: number[], ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
  const ab = Math.hypot(ax - bx, ay - by) > MAX_EDGE, bc = Math.hypot(bx - cx, by - cy) > MAX_EDGE, ca = Math.hypot(cx - ax, cy - ay) > MAX_EDGE;
  if (!ab && !bc && !ca) { out.push(ax, ay, bx, by, cx, cy); return; }
  const mabx = (ax + bx) / 2, maby = (ay + by) / 2, mbcx = (bx + cx) / 2, mbcy = (by + cy) / 2, mcax = (cx + ax) / 2, mcay = (cy + ay) / 2;
  if (ab && bc && ca) {
    tessellate(out, ax, ay, mabx, maby, mcax, mcay); tessellate(out, mabx, maby, bx, by, mbcx, mbcy);
    tessellate(out, mcax, mcay, mbcx, mbcy, cx, cy); tessellate(out, mabx, maby, mbcx, mbcy, mcax, mcay);
  } else if (ab && bc) {
    tessellate(out, mabx, maby, bx, by, mbcx, mbcy); tessellate(out, ax, ay, mabx, maby, cx, cy); tessellate(out, mabx, maby, mbcx, mbcy, cx, cy);
  } else if (bc && ca) {
    tessellate(out, mbcx, mbcy, cx, cy, mcax, mcay); tessellate(out, ax, ay, bx, by, mcax, mcay); tessellate(out, mcax, mcay, bx, by, mbcx, mbcy);
  } else if (ca && ab) {
    tessellate(out, mcax, mcay, ax, ay, mabx, maby); tessellate(out, bx, by, cx, cy, mcax, mcay); tessellate(out, mabx, maby, bx, by, mcax, mcay);
  } else if (ab) {
    tessellate(out, ax, ay, mabx, maby, cx, cy); tessellate(out, mabx, maby, bx, by, cx, cy);
  } else if (bc) {
    tessellate(out, ax, ay, bx, by, mbcx, mbcy); tessellate(out, ax, ay, mbcx, mbcy, cx, cy);
  } else {
    tessellate(out, ax, ay, bx, by, mcax, mcay); tessellate(out, mcax, mcay, bx, by, cx, cy);
  }
};

const POSE_ZERO: WBPose = { lift: 0, rollDeg: 0, sx: 1, sy: 1, rightHandLift: 0, leftHandLift: 0, rightHandOut: 0, leftHandOut: 0, eyeShift: 0, shadowScale: 1, blink: 0, sweat: 0 };

/** On the skin at (x, y) in source pixels, y down: the point, in metres, and its ellipsoid normal. The projection is orthographic along +z. */
export function faceSurfacePoint(x: number, y: number, lift = WB3D_FACE_LIFT): { p: [number, number, number]; n: [number, number, number] } {
  const skinA = WB_BODY.rx - WB_BODY.outline, skinB = WB_BODY.ry - WB_BODY.outline;
  let X = x / skinA, Y = -y / skinB;
  const r2 = X * X + Y * Y;
  if (r2 > 0.97) { const k = Math.sqrt(0.97 / r2); X *= k; Y *= k; }
  const Z = Math.sqrt(Math.max(0, 1 - X * X - Y * Y));
  const { a, b, c } = WB3D_SKIN, K = 1 + lift;
  let nx = X / a, ny = Y / b, nz = Z / c;
  const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
  return { p: [X * a * K, Y * b * K, Z * c * K], n: [nx, ny, nz] };
}

/** on the same 0.001 grid as quantizeWhiteBallPose, so a key decides the mesh completely and a cache cannot make a frame depend on order */
const q = (v: number) => Math.round(v * 1000) / 1000 + 0;

export const faceKey = (expression: WBExpression, f: FaceInput): string =>
  `${expression}|${q(f.eyeShift)}|${q(f.blink)}|${expression === 'anxious' ? q(f.sweat) : 0}|${q(f.mouthOpen ?? 1)}`;

/** Compile one state of the face to surface geometry. */
export function whiteBall3DFace(expression: WBExpression, f: FaceInput): FaceMesh {
  assertWhiteBallExpression(expression);
  const g = new FaceContext2D();
  drawFace(new Pen(g as unknown as CanvasRenderingContext2D) as never, expression, { ...POSE_ZERO, eyeShift: q(f.eyeShift), blink: q(f.blink), sweat: expression === 'anxious' ? q(f.sweat) : 0 });
  if (g.depth !== 0) throw new Error('face: unbalanced save/restore');

  const mouthOpen = q(f.mouthOpen ?? 1);
  const mouthTris = g.ops.filter((o) => isMouth(o.tris)).flatMap((o) => o.tris);
  const mb = mouthTris.length ? bbox(mouthTris) : null;
  const mcy = mb ? (mb.y0 + mb.y1) / 2 : 0;

  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  const ops: { kind: 'fill' | 'stroke'; style: string; alpha: number; triangles: number; group: 'mouth' | 'other' }[] = [];
  for (const op of g.ops) {
    const mouth = isMouth(op.tris);
    const src = op.tris.slice();
    if (mouth && mouthOpen !== 1) for (let i = 1; i < src.length; i += 2) src[i] = mcy + (src[i] - mcy) * mouthOpen;
    for (let i = 0; i < src.length; i++) src[i] = snap(src[i]);
    const fine: number[] = [];
    for (let i = 0; i < src.length; i += 6) tessellate(fine, src[i], src[i + 1], src[i + 2], src[i + 3], src[i + 4], src[i + 5]);
    let emitted = 0;
    for (let i = 0; i < fine.length; i += 6) {
      // source y runs down, so wind in (x, -y): counter-clockwise seen from outside the ball
      const ax = fine[i], ay = -fine[i + 1], bx = fine[i + 2], by = -fine[i + 3], cx = fine[i + 4], cy = -fine[i + 5];
      // Only a triangle with two identical corners may go: its neighbours already meet each other. A thin one must stay, even one with no area at all here.
      // It is flat only in source pixels. On the ball its middle corner bows off the chord between the other two, so without it the neighbours part and a
      // crack opens along that chord, too narrow to see except where it catches a pixel centre: a row of white specks across a black pupil.
      if ((ax === bx && ay === by) || (bx === cx && by === cy) || (cx === ax && cy === ay)) continue;
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      const order = area > 0 ? [0, 2, 4] : [0, 4, 2];
      for (const o of order) {
        const s = faceSurfacePoint(fine[i + o], fine[i + o + 1]);
        pos.push(...s.p); nor.push(...s.n); col.push(op.colour[0], op.colour[1], op.colour[2], op.alpha);
      }
      emitted++;
    }
    ops.push({ kind: op.kind, style: op.style, alpha: op.alpha, triangles: emitted, group: mouth ? 'mouth' : 'other' });
  }
  return {
    key: faceKey(expression, f), positions: new Float32Array(pos), normals: new Float32Array(nor), colors: new Float32Array(col),
    triangles: pos.length / 9, ops,
  };
}
