// A Canvas2D stand-in that records what the Pen draws, in final canvas coordinates (it tracks the transform stack). This
// is how the tests read a drawing's construction. It proves nothing about pixels: real rendering is checked separately
// on real output by tests/visual/run_visual_qa.py.
export type Mark = {
  kind: 'fill' | 'stroke';
  style: string;
  alpha: number;
  /** line width after the transform (geometric mean of the axes) */
  width: number;
  points: [number, number][];
  closed: boolean;
  clipped: boolean;
};

type M = [number, number, number, number, number, number];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
];

export class RecordingContext2D {
  marks: Mark[] = [];
  fillStyle: unknown = '#000000';
  strokeStyle: unknown = '#000000';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  globalAlpha = 1;
  private m: M = [1, 0, 0, 1, 0, 0];
  private stack: { m: M; fillStyle: unknown; strokeStyle: unknown; lineWidth: number; globalAlpha: number; clips: number }[] = [];
  private clips = 0;
  private pts: [number, number][] = [];
  private isClosed = false;
  private cur: [number, number] = [0, 0];

  private tx(x: number, y: number): [number, number] {
    const m = this.m;
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  }
  private scaleOfM() { return Math.sqrt(Math.abs(this.m[0] * this.m[3] - this.m[1] * this.m[2])); }
  private colour(s: unknown) { return typeof s === 'string' ? s : 'gradient'; }
  private mark(kind: 'fill' | 'stroke') {
    this.marks.push({
      kind, style: this.colour(kind === 'fill' ? this.fillStyle : this.strokeStyle), alpha: this.globalAlpha,
      width: kind === 'stroke' ? this.lineWidth * this.scaleOfM() : 0, points: this.pts.slice(), closed: this.isClosed, clipped: this.clips > 0,
    });
  }

  save() { this.stack.push({ m: [...this.m] as M, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, globalAlpha: this.globalAlpha, clips: this.clips }); }
  restore() {
    const s = this.stack.pop();
    if (!s) throw new Error('restore without save');
    this.m = s.m; this.fillStyle = s.fillStyle; this.strokeStyle = s.strokeStyle; this.lineWidth = s.lineWidth; this.globalAlpha = s.globalAlpha; this.clips = s.clips;
  }
  /** unbalanced save/restore corrupts everything drawn afterwards on a pooled canvas */
  get depth() { return this.stack.length; }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number) { this.m = [a, b, c, d, e, f]; }
  translate(x: number, y: number) { this.m = mul(this.m, [1, 0, 0, 1, x, y]); }
  scale(x: number, y: number) { this.m = mul(this.m, [x, 0, 0, y, 0, 0]); }
  rotate(r: number) { const c = Math.cos(r), s = Math.sin(r); this.m = mul(this.m, [c, s, -s, c, 0, 0]); }

  beginPath() { this.pts = []; this.isClosed = false; }
  moveTo(x: number, y: number) { this.cur = [x, y]; this.pts.push(this.tx(x, y)); }
  lineTo(x: number, y: number) { this.cur = [x, y]; this.pts.push(this.tx(x, y)); }
  closePath() { this.isClosed = true; }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number) {
    const [x0, y0] = this.cur;
    for (let i = 1; i <= 12; i++) { const t = i / 12, s = 1 - t; this.pts.push(this.tx(s * s * x0 + 2 * s * t * cx + t * t * x, s * s * y0 + 2 * s * t * cy + t * t * y)); }
    this.cur = [x, y];
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    const [x0, y0] = this.cur;
    for (let i = 1; i <= 16; i++) {
      const t = i / 16, s = 1 - t;
      this.pts.push(this.tx(s ** 3 * x0 + 3 * s * s * t * c1x + 3 * s * t * t * c2x + t ** 3 * x, s ** 3 * y0 + 3 * s * s * t * c1y + 3 * s * t * t * c2y + t ** 3 * y));
    }
    this.cur = [x, y];
  }
  arc(x: number, y: number, r: number, a0: number, a1: number) {
    for (let i = 0; i <= 32; i++) { const a = a0 + ((a1 - a0) * i) / 32; this.pts.push(this.tx(x + r * Math.cos(a), y + r * Math.sin(a))); }
    this.cur = [x + r * Math.cos(a1), y + r * Math.sin(a1)];
  }
  fill() { this.mark('fill'); }
  stroke() { this.mark('stroke'); }
  clip() { this.clips++; }
  clearRect() { /* nothing to record */ }
  fillRect(x: number, y: number, w: number, h: number) {
    this.pts = [this.tx(x, y), this.tx(x + w, y), this.tx(x + w, y + h), this.tx(x, y + h)];
    this.isClosed = true;
    this.mark('fill');
  }
  createRadialGradient() { return { addColorStop() { /* colours are not recorded */ } }; }
  createLinearGradient() { return { addColorStop() { /* colours are not recorded */ } }; }
}

export class RecordingCanvas {
  width = 300;
  height = 150;
  readonly ctx = new RecordingContext2D();
  readonly style = {};
  getContext() { return this.ctx; }
}

/** Remove this canvas's record of what has been drawn so far. */
export const clearMarks = (c: RecordingCanvas) => { c.ctx.marks = []; };

/** What the engine needs from a browser at module scope: document.createElement('canvas'). */
export function installFakeDom(): RecordingCanvas[] {
  const made: RecordingCanvas[] = [];
  (globalThis as unknown as { document: unknown }).document = {
    createElement(tag: string) {
      if (tag !== 'canvas') throw new Error(`fake document cannot create <${tag}>`);
      const c = new RecordingCanvas();
      made.push(c);
      return c;
    },
    createElementNS(_ns: string, tag: string) { return (this as unknown as { createElement(t: string): RecordingCanvas }).createElement(tag); },
  };
  return made;
}
