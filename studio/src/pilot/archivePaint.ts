// Original procedural surfaces for the archive hall. Every one is drawn on a canvas through the bridge's ctex cache and
// seeded rng (templates/bridge/paint.ts). No image files, and no lettering on anything. The recipes follow the general rules
// in references/reports/textures.md: flat colour fields, thin painted lines at about half the ink contrast, coloured darks.
import * as THREE from 'three';
import { ctex } from '../../../templates/bridge/paint';

type R = () => number;
type G = CanvasRenderingContext2D;
const U = (r: R, a: number, b: number) => a + (b - a) * r();
const pick = <T,>(r: R, a: readonly T[]) => a[Math.floor(r() * a.length) % a.length];

const SPINES = ['#b6463f', '#c9713a', '#d6a441', '#3f8f8a', '#2f6f9e', '#5a57a8', '#8a4d93', '#a23f6a', '#4f8c58', '#c7b48a', '#7c5a3e', '#35768f'];
const GILT = '#e9c871';

/** Four rows of book spines, one row per 256 px. Each row is 4 m long and 0.5 m tall. */
export const bookSpines = () => ctex('archiveBooks', 2048, 1024, (g, r) => {
  const W = 2048, RH = 256;
  g.fillStyle = '#231c34';
  g.fillRect(0, 0, W, 1024);
  for (let row = 0; row < 4; row++) {
    const y0 = row * RH, base = y0 + RH - 2;
    let x = 0;
    while (x < W) {
      const w = U(r, 26, 66), h = U(r, 150, 236), col = pick(r, SPINES);
      if (r() < 0.07) { x += U(r, 14, 44); continue; } // a gap on the shelf
      const lean = r() < 0.1 ? U(r, -0.06, 0.06) : 0;
      g.save();
      g.translate(x + w / 2, base);
      g.rotate(lean);
      // flat colour, then a soft rounded-back shade: light left, dark right
      g.fillStyle = col;
      g.fillRect(-w / 2, -h, w, h);
      const sh = g.createLinearGradient(-w / 2, 0, w / 2, 0);
      sh.addColorStop(0, 'rgba(255,245,225,0.16)'); sh.addColorStop(0.45, 'rgba(255,245,225,0)'); sh.addColorStop(1, 'rgba(25,15,40,0.32)');
      g.fillStyle = sh;
      g.fillRect(-w / 2, -h, w, h);
      // gilt bands and small marks. Marks are dots and bars, never letters.
      const bands = 1 + Math.floor(r() * 3);
      g.fillStyle = r() < 0.75 ? GILT : '#efe6cf';
      for (let b = 0; b < bands; b++) g.fillRect(-w / 2 + 3, -h + 16 + b * 13, w - 6, 3.5);
      if (r() < 0.5) g.fillRect(-w * 0.18, -h * U(r, 0.35, 0.6), w * 0.36, h * 0.05);
      if (r() < 0.3) { g.beginPath(); g.arc(0, -h * 0.28, Math.min(w * 0.2, 7), 0, Math.PI * 2); g.fill(); }
      // a thin darker line between neighbours, lighter than the world ink
      g.fillStyle = 'rgba(25,15,40,0.55)';
      g.fillRect(w / 2 - 1.5, -h, 1.5, h);
      g.restore();
      x += w;
    }
  }
});

/** A square rug: indigo field, gold meander border, diamond lattice. 1024 px = 4.6 m. Squares and diamonds only. */
export const rugTexture = () => ctex('archiveRug', 1024, 1024, (g, r) => {
  const S = 1024;
  g.fillStyle = '#2b2c6e';
  g.fillRect(0, 0, S, S);
  // soft wear
  for (let i = 0; i < 30; i++) {
    const x = U(r, 0, S), y = U(r, 0, S), rad = U(r, 40, 150);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, r() < 0.5 ? 'rgba(90,90,170,0.16)' : 'rgba(20,18,60,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // lattice
  const cell = 92;
  g.lineWidth = 3; g.strokeStyle = 'rgba(102,190,190,0.55)';
  for (let i = -12; i < 24; i++) {
    g.beginPath(); g.moveTo(i * cell, 0); g.lineTo(i * cell + S, S); g.stroke();
    g.beginPath(); g.moveTo(i * cell + S, 0); g.lineTo(i * cell, S); g.stroke();
  }
  g.fillStyle = '#e0b24f';
  for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
    const px = x * cell + (y % 2 ? cell / 2 : 0), py = y * cell * 0.5 + y * cell * 0.5;
    g.save(); g.translate(px % S, py % S); g.rotate(Math.PI / 4); g.fillRect(-5, -5, 10, 10); g.restore();
  }
  // borders
  const band = (m: number, w: number, c: string) => { g.strokeStyle = c; g.lineWidth = w; g.strokeRect(m, m, S - 2 * m, S - 2 * m); };
  band(18, 36, '#a23a4f');
  band(60, 40, '#e0b24f');
  band(88, 8, '#1a1b4a');
  // stepped key pattern inside the gold band
  g.fillStyle = '#7a4a1e';
  const step = 40;
  for (let i = 0; i * step < S - 80; i++) {
    const p = 44 + i * step;
    for (const [a, b] of [[p, 48], [p, S - 62], [48, p], [S - 62, p]] as const) g.fillRect(a, b, 14, 14);
  }
});

/** Painted metal: a mid tone with one broad bright band, and darks that stay coloured. */
export const brassTexture = () => ctex('archiveBrass', 256, 256, (g) => {
  const gr = g.createLinearGradient(0, 0, 256, 256);
  gr.addColorStop(0, '#8f6a2c'); gr.addColorStop(0.32, '#c79a45'); gr.addColorStop(0.46, '#fbe7a6');
  gr.addColorStop(0.6, '#d7aa52'); gr.addColorStop(1, '#6d4c26');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
});

/** The dusk sky seen through the far window, as a vertical gradient in on-screen colours with a few painted stars. */
export const skyTexture = () => ctex('archiveSky', 512, 1024, (g, r) => {
  const gr = g.createLinearGradient(0, 1024, 0, 0);
  gr.addColorStop(0, '#ffc98f'); gr.addColorStop(0.18, '#ff9f86'); gr.addColorStop(0.42, '#d9769a');
  gr.addColorStop(0.68, '#7f5fb0'); gr.addColorStop(1, '#2f3c86');
  g.fillStyle = gr;
  g.fillRect(0, 0, 512, 1024);
  // long soft cloud bars, cooler above and warmer near the horizon
  for (let i = 0; i < 16; i++) {
    const y = U(r, 240, 980), w = U(r, 160, 460), x = U(r, -60, 480), h = U(r, 8, 24);
    const c = y > 680 ? 'rgba(255,226,190,0.42)' : 'rgba(240,170,200,0.28)';
    const b = g.createLinearGradient(x, 0, x + w, 0);
    b.addColorStop(0, 'rgba(0,0,0,0)'); b.addColorStop(0.5, c); b.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = b;
    g.fillRect(x, y, w, h);
  }
  g.fillStyle = '#fff6df';
  for (let i = 0; i < 46; i++) {
    const y = U(r, 0, 520), x = U(r, 0, 512), s = U(r, 0.8, 2.1);
    g.globalAlpha = 0.4 + 0.6 * (1 - y / 520);
    g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
});

/** Radial falloff for additive glow sprites. */
export const glowTexture = () => {
  const t = ctex('archiveGlow', 256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.16)');
    gr.addColorStop(0.75, 'rgba(255,255,255,0.03)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
};

/** A sheet of window light: fades at both ends and both sides. */
export const shaftTexture = () => {
  const t = ctex('archiveShaft', 128, 512, (g) => {
    g.clearRect(0, 0, 128, 512);
    for (let y = 0; y < 512; y++) {
      const v = y / 511;
      const a = Math.sin(Math.PI * Math.min(1, v * 1.02)) ** 0.8 * (0.45 + 0.55 * (1 - v));
      const gr = g.createLinearGradient(0, 0, 128, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.2, `rgba(255,255,255,${a})`);
      gr.addColorStop(0.8, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, y, 128, 1);
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
};

const stroke = (g: G, fn: () => void, w = 7) => { g.lineWidth = w; g.beginPath(); fn(); g.stroke(); };

/** Sixteen small abstract marks in a 4 x 4 atlas: rings, triangles, ticks and bars. None is a letter or a known symbol set. */
export const GLYPH_CELLS = 16;
export const glyphTexture = () => {
  const t = ctex('archiveGlyphs', 1024, 1024, (g) => {
    g.clearRect(0, 0, 1024, 1024);
    g.strokeStyle = '#ffffff'; g.fillStyle = '#ffffff'; g.lineCap = 'round'; g.lineJoin = 'round';
    const C = 256, R = 84;
    for (let i = 0; i < GLYPH_CELLS; i++) {
      const cx = (i % 4) * C + C / 2, cy = Math.floor(i / 4) * C + C / 2, k = i % 8;
      g.save(); g.translate(cx, cy); g.rotate((i * Math.PI) / 8);
      if (k === 0) { stroke(g, () => g.arc(0, 0, R, 0, Math.PI * 2)); stroke(g, () => { g.moveTo(-R, 0); g.lineTo(R, 0); }, 5); }
      if (k === 1) { stroke(g, () => { g.moveTo(0, -R); g.lineTo(R * 0.87, R * 0.5); g.lineTo(-R * 0.87, R * 0.5); g.closePath(); }); g.beginPath(); g.arc(0, 0, 11, 0, Math.PI * 2); g.fill(); }
      if (k === 2) { stroke(g, () => g.arc(0, 0, R, 0.3, Math.PI * 1.4)); stroke(g, () => g.arc(0, 0, R * 0.55, 1.2, Math.PI * 1.9), 5); } // arcs only: dots inside a ring read as a face
      if (k === 3) { stroke(g, () => g.rect(-R * 0.7, -R * 0.7, R * 1.4, R * 1.4)); stroke(g, () => { g.moveTo(-R, -R); g.lineTo(R, R); }, 5); }
      if (k === 4) { stroke(g, () => g.arc(0, 0, R * 0.55, 0, Math.PI * 2)); stroke(g, () => g.arc(0, 0, R, -0.6, 0.6)); stroke(g, () => g.arc(0, 0, R, Math.PI - 0.6, Math.PI + 0.6)); }
      if (k === 5) { for (const y of [-R * 0.6, 0, R * 0.6]) stroke(g, () => { g.moveTo(-R * (0.4 + Math.abs(y) / R * 0.5), y); g.lineTo(R * (0.9 - Math.abs(y) / R * 0.4), y); }); }
      if (k === 6) { stroke(g, () => { g.moveTo(-R, R * 0.6); g.lineTo(0, -R * 0.8); g.lineTo(R, R * 0.6); }); g.beginPath(); g.arc(0, R * 0.55, 13, 0, Math.PI * 2); g.fill(); }
      if (k === 7) { stroke(g, () => { g.moveTo(0, -R); g.lineTo(R, 0); g.lineTo(0, R); g.lineTo(-R, 0); g.closePath(); }); stroke(g, () => g.arc(0, 0, R * 0.32, 0, Math.PI * 2), 5); }
      g.restore();
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
};
