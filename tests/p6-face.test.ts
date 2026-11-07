// P6 face: the seven expressions as real geometry on the body's surface. Reads the vertex data, in Node, with no browser.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WB_BODY, WB_COLOR, WB_EXPRESSIONS, WB_EYE, type WBExpression } from '../src/npc/white-ball';
import { WB3D_FACE_LIFT, WB3D_M, WB3D_SKIN, WB3D_SEGMENTS, faceKey, faceSurfacePoint, whiteBall3DFace } from '../src/npc/white-ball-3d';

const OPEN = { eyeShift: 0, blink: 0, sweat: 0.3 };
const faces = Object.fromEntries(WB_EXPRESSIONS.map((e) => [e, whiteBall3DFace(e, OPEN)])) as Record<WBExpression, ReturnType<typeof whiteBall3DFace>>;
const linear = (u: number) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string) => [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255));

test('all seven expressions compile to a real mesh, and they are all different', () => {
  assert.equal(WB_EXPRESSIONS.length, 7);
  const sizes = new Set<number>();
  for (const e of WB_EXPRESSIONS) {
    const f = faces[e];
    assert.ok(f.triangles > 400, `${e}: ${f.triangles} triangles`);
    assert.equal(f.positions.length, f.triangles * 9);
    assert.equal(f.normals.length, f.positions.length);
    assert.equal(f.colors.length, (f.positions.length / 3) * 4);
    sizes.add(f.triangles);
  }
  assert.ok(sizes.size >= 6, 'different faces have different geometry');
});

test('every vertex lies on the body ellipsoid, in the front half, at the same small lift: no flat plane, nothing floating', () => {
  const k = 1 + WB3D_FACE_LIFT;
  for (const e of WB_EXPRESSIONS) {
    const p = faces[e].positions;
    let minZ = Infinity;
    for (let i = 0; i < p.length; i += 3) {
      const r = Math.hypot(p[i] / WB3D_SKIN.a, p[i + 1] / WB3D_SKIN.b, p[i + 2] / WB3D_SKIN.c);
      assert.ok(Math.abs(r - k) < 1e-5, `${e} vertex ${i / 3} at radius ${r}`);
      assert.ok(p[i + 2] > 0, `${e} vertex ${i / 3} is behind the body`);
      minZ = Math.min(minZ, p[i + 2]);
    }
    assert.ok(minZ > 0.04, `${e}: reaches z ${minZ}, too near the limb`);
  }
});

test('the face is curved, not a plane with a depth offset: its depth spread matches the sphere', () => {
  for (const e of WB_EXPRESSIONS) {
    const p = faces[e].positions;
    let lo = Infinity, hi = -Infinity;
    for (let i = 2; i < p.length; i += 3) { lo = Math.min(lo, p[i]); hi = Math.max(hi, p[i]); }
    assert.ok(hi - lo > 0.06, `${e}: depth spread ${(hi - lo).toFixed(3)} m`);
  }
  // an eye centre sits exactly where the sphere puts it
  const s = faceSurfacePoint(WB_EYE.right[0], WB_EYE.right[1], 0);
  const X = WB_EYE.right[0] / (WB_BODY.rx - WB_BODY.outline), Y = -WB_EYE.right[1] / (WB_BODY.ry - WB_BODY.outline);
  assert.ok(Math.abs(s.p[2] - WB3D_SKIN.c * Math.sqrt(1 - X * X - Y * Y)) < 1e-9);
});

test('normals are the ellipsoid normals, so the face takes the same light as the skin beneath it', () => {
  for (const e of WB_EXPRESSIONS) {
    const { positions: p, normals: n } = faces[e];
    for (let i = 0; i < p.length; i += 3 * 37) {
      assert.ok(Math.abs(Math.hypot(n[i], n[i + 1], n[i + 2]) - 1) < 1e-5);
      const gx = p[i] / WB3D_SKIN.a ** 2, gy = p[i + 1] / WB3D_SKIN.b ** 2, gz = p[i + 2] / WB3D_SKIN.c ** 2, L = Math.hypot(gx, gy, gz);
      assert.ok(Math.abs((gx * n[i] + gy * n[i + 1] + gz * n[i + 2]) / L - 1) < 1e-4);
    }
  }
});

test('seen from the front, the mesh is the P3 drawing: projected positions land on the measured source pixels', () => {
  // default: the eye rings are centred on the measured centres, the mouth spans its measured width and height
  const p = faces.default.positions, m = WB3D_M * (1 + WB3D_FACE_LIFT);
  const xy: [number, number][] = [];
  for (let i = 0; i < p.length; i += 3) xy.push([p[i] / m, -p[i + 1] / m]);
  const box = (keep: (x: number, y: number) => boolean) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of xy) if (keep(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { x0, x1, y0, y1 };
  };
  const right = box((x, y) => x > 0 && y < 0), left = box((x, y) => x < 0 && y < 0), mouth = box((_x, y) => y > 0);
  const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) < tol, `${what}: ${a.toFixed(1)} vs ${b.toFixed(1)}`);
  near((right.x0 + right.x1) / 2, WB_EYE.right[0], 0.8, 'right eye x');
  near((right.y0 + right.y1) / 2, WB_EYE.right[1], 0.8, 'right eye y');
  near((left.x0 + left.x1) / 2, WB_EYE.left[0], 0.8, 'left eye x');
  near(right.x1 - right.x0, 2 * WB_EYE.rx + WB_EYE.stroke, 0.8, 'eye outer width');
  near(mouth.x1 - mouth.x0, 104, 2, 'mouth outer width (measured 104)');
  near(mouth.y1 - mouth.y0, 65, 2, 'mouth outer height (measured 65)');
});

test('identity colours: near-black ink everywhere, the dusty pink mouth, and white eyes, at the P3 values', () => {
  const has = (e: WBExpression, hex: string) => {
    const c = faces[e].colors, [r, g, b] = rgb(hex);
    for (let i = 0; i < c.length; i += 4) if (Math.abs(c[i] - r) < 1e-4 && Math.abs(c[i + 1] - g) < 1e-4 && Math.abs(c[i + 2] - b) < 1e-4) return true;
    return false;
  };
  for (const e of WB_EXPRESSIONS) assert.ok(has(e, WB_COLOR.ink), `${e} has ink`);
  for (const e of ['default', 'happy-closed', 'wink', 'sparkly-happy'] as const) assert.ok(has(e, WB_COLOR.mouth), `${e} has the mouth colour`);
  assert.ok(has('surprised', WB_COLOR.mouthDeep));
  assert.ok(has('default', WB_COLOR.paper));
  assert.ok(has('anxious', WB_COLOR.dropFill), 'the sweat drop');
  assert.ok(has('tired', WB_COLOR.lidLavender) && has('anxious', WB_COLOR.lidLavender), 'lavender lids');
  assert.ok(!has('default', WB_COLOR.dropFill), 'no sweat on a calm face');
});

test('the compile is pure: same input, identical bytes, whatever was compiled before', () => {
  const a = whiteBall3DFace('sparkly-happy', { eyeShift: 3.2, blink: 0.6, sweat: 0 });
  whiteBall3DFace('anxious', { eyeShift: -4, blink: 0, sweat: 0.7 });
  const b = whiteBall3DFace('sparkly-happy', { eyeShift: 3.2, blink: 0.6, sweat: 0 });
  assert.deepEqual(a.positions, b.positions);
  assert.deepEqual(a.colors, b.colors);
  assert.equal(a.key, faceKey('sparkly-happy', { eyeShift: 3.2, blink: 0.6, sweat: 0 }));
});

test('a blink closes the eyes in the geometry, and a closed-eye face has nothing to close', () => {
  const span = (blink: number) => {
    const p = whiteBall3DFace('default', { eyeShift: 0, blink, sweat: 0 }).positions;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < p.length; i += 3) if (p[i] > 0 && p[i + 1] > 0) { lo = Math.min(lo, p[i + 1]); hi = Math.max(hi, p[i + 1]); }
    return hi - lo;
  };
  assert.ok(span(0.6) < span(0) * 0.55, 'half lid');
  assert.ok(span(1) < span(0) * 0.3, 'shut');
  const a = whiteBall3DFace('happy-closed', { eyeShift: 0, blink: 0, sweat: 0 }), b = whiteBall3DFace('happy-closed', { eyeShift: 0, blink: 1, sweat: 0 });
  assert.deepEqual(a.positions, b.positions);
});

test('the eyes lead a turn: eyeShift moves the features along the surface, and they stay on it', () => {
  const a = whiteBall3DFace('default', { eyeShift: 0, blink: 0, sweat: 0 }), b = whiteBall3DFace('default', { eyeShift: 8, blink: 0, sweat: 0 });
  const meanX = (p: Float32Array) => { let s = 0; for (let i = 0; i < p.length; i += 3) s += p[i]; return s / (p.length / 3); };
  assert.ok(meanX(b.positions) > meanX(a.positions) + 3 * WB3D_M);
});

test('the sweat drop slides, only on the anxious face', () => {
  const y = (sweat: number) => {
    const f = whiteBall3DFace('anxious', { eyeShift: 0, blink: 0, sweat });
    let s = 0, n = 0;
    for (let i = 0; i < f.positions.length; i += 3) {
      const c = (i / 3) * 4;
      if (Math.abs(f.colors[c] - rgb(WB_COLOR.dropFill)[0]) < 1e-4 && Math.abs(f.colors[c + 2] - rgb(WB_COLOR.dropFill)[2]) < 1e-4) { s += f.positions[i + 1]; n++; }
    }
    return s / n;
  };
  assert.ok(y(0.5) < y(0.2) - 0.02, 'it runs down the face');
  assert.deepEqual(whiteBall3DFace('default', { eyeShift: 0, blink: 0, sweat: 0.2 }).positions, whiteBall3DFace('default', { eyeShift: 0, blink: 0, sweat: 0.7 }).positions);
});

test('a change of mouth can close and reopen: only the mouth flattens, about its own centre', () => {
  const full = whiteBall3DFace('surprised', { eyeShift: 0, blink: 0, sweat: 0 }), low = whiteBall3DFace('surprised', { eyeShift: 0, blink: 0, sweat: 0, mouthOpen: 0.4 });
  const mouthH = (p: Float32Array) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < p.length; i += 3) if (p[i + 1] < -0.01) { lo = Math.min(lo, p[i + 1]); hi = Math.max(hi, p[i + 1]); } return hi - lo; };
  assert.ok(mouthH(low.positions) < mouthH(full.positions) * 0.5);
  const top = (p: Float32Array) => { let hi = -Infinity; for (let i = 1; i < p.length; i += 3) hi = Math.max(hi, p[i]); return hi; };
  assert.ok(Math.abs(top(low.positions) - top(full.positions)) < 1e-6, 'the brows do not move');
  assert.equal(full.ops.filter((o) => o.group === 'mouth').length > 0, true);
});

test('the mesh clears the skin: the chord sag of its triangles and of the body sphere is less than the lift, so nothing can sink in', () => {
  const lift = WB3D_FACE_LIFT * WB3D_SKIN.a;
  const bodySag = WB3D_SKIN.b * (1 - Math.cos(Math.PI / WB3D_SEGMENTS.height));
  // the longest triangle edge on the surface is about 12 source pixels
  const edge = 14 * WB3D_M, faceSag = (edge * edge) / (8 * WB3D_SKIN.a);
  assert.ok(faceSag < lift + bodySag, `face sag ${faceSag}, lift ${lift}, body sag ${bodySag}`);
  // and every triangle edge really is that short
  for (const e of WB_EXPRESSIONS) {
    const p = faces[e].positions;
    let longest = 0;
    for (let i = 0; i < p.length; i += 9) for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) longest = Math.max(longest, Math.hypot(p[i + a] - p[i + b], p[i + a + 1] - p[i + b + 1], p[i + a + 2] - p[i + b + 2]));
    assert.ok(longest < 0.09, `${e}: longest edge ${longest.toFixed(3)} m`);
  }
});

test('every triangle with real area faces outward: wound counter-clockwise from outside the ball', () => {
  for (const e of WB_EXPRESSIONS) {
    const p = faces[e].positions;
    let inward = 0, thin = 0;
    for (let i = 0; i < p.length; i += 9) {
      const ax = p[i + 3] - p[i], ay = p[i + 4] - p[i + 1], az = p[i + 5] - p[i + 2], bx = p[i + 6] - p[i], by = p[i + 7] - p[i + 1], bz = p[i + 8] - p[i + 2];
      // Height in the source plane, in source pixels. Slivers stay in the mesh on purpose (see the watertight test), and a sliver's own normal lies
      // nearly along the surface, so its sign means nothing. The face is drawn two-sided for that reason.
      const longest = Math.max(Math.hypot(ax, ay), Math.hypot(bx, by), Math.hypot(ax - bx, ay - by));
      const height = Math.abs(ax * by - ay * bx) / Math.max(longest, 1e-12) / WB3D_M;
      if (height < 0.1) { thin++; continue; }
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      if (nx * p[i] + ny * p[i + 1] + nz * p[i + 2] <= 0) inward++;
    }
    assert.equal(inward, 0, `${e}: ${inward} triangles face inward`);
    assert.ok(thin < faces[e].triangles * 0.3, `${e}: ${thin} of ${faces[e].triangles} are slivers, so this test would be reading very little`);
  }
});

// A triangle edge used once is either the silhouette of what is being painted or a crack. It is a crack when paint lies on both sides of it.
type SourceTri = [number, number, number, number, number, number];
const crackLength = (tris: SourceTri[]) => {
  const inside = (t: SourceTri, x: number, y: number) => {
    const side = (ax: number, ay: number, bx: number, by: number) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    const a = side(t[0], t[1], t[2], t[3]), b = side(t[2], t[3], t[4], t[5]), c = side(t[4], t[5], t[0], t[1]);
    return (a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0);
  };
  const edges = new Map<string, { n: number; a: [number, number]; b: [number, number] }>();
  const key = (x: number, y: number) => `${x.toFixed(3)},${y.toFixed(3)}`;
  for (const t of tris) for (const [i, j] of [[0, 2], [2, 4], [4, 0]]) {
    const ka = key(t[i], t[i + 1]), kb = key(t[j], t[j + 1]), k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    const e = edges.get(k);
    if (e) e.n++; else edges.set(k, { n: 1, a: [t[i], t[i + 1]], b: [t[j], t[j + 1]] });
  }
  let length = 0;
  for (const { n, a, b } of edges.values()) {
    if (n !== 1) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
    if (L < 0.2) continue;
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, nx = (-dy / L) * 0.25, ny = (dx / L) * 0.25;
    if (tris.some((t) => inside(t, mx + nx, my + ny)) && tris.some((t) => inside(t, mx - nx, my - ny))) length += L;
  }
  return length;
};
const sourceTris = (f: ReturnType<typeof whiteBall3DFace>, first: number, count: number): SourceTri[] => {
  const m = WB3D_M * (1 + WB3D_FACE_LIFT), p = f.positions, out: SourceTri[] = [];
  for (let t = first; t < first + count; t++) {
    const i = t * 9;
    out.push([p[i] / m, -p[i + 1] / m, p[i + 3] / m, -p[i + 4] / m, p[i + 6] / m, -p[i + 7] / m]);
  }
  return out;
};

test('NEGATIVE: the crack check finds a real crack, and a sound mesh passes it', () => {
  // two triangles over a square, sharing their diagonal: sound
  const sound: SourceTri[] = [[0, 0, 10, 0, 10, 10], [0, 0, 10, 10, 0, 10]];
  assert.equal(crackLength(sound), 0);
  // the same square with the far side of the diagonal split in two: a T-junction. Flat, it covers everything. On a ball, the split corner leaves the chord.
  const tJunction: SourceTri[] = [[0, 0, 10, 0, 10, 10], [0, 0, 5, 5, 0, 10], [5, 5, 10, 10, 0, 10]];
  assert.ok(crackLength(tJunction) > 10, 'an unshared diagonal is a crack');
});

test('watertight: no fill on any face has a crack in it, so nothing beneath can show through. This is what paints a black pupil solid', () => {
  // every expression at rest, and on the states the film really shows: the eyes led, half a blink, the sweat drop at each stage, a closing mouth
  const states = [OPEN, { eyeShift: 4.9, blink: 0, sweat: 0.2 }, { eyeShift: -3.3, blink: 0.45, sweat: 0.55 }, { eyeShift: 1.7, blink: 0, sweat: 0.75, mouthOpen: 0.55 }];
  for (const e of WB_EXPRESSIONS) for (const s of states) {
    const f = whiteBall3DFace(e, s);
    let first = 0;
    for (const op of f.ops) {
      if (op.kind === 'fill') {
        const L = crackLength(sourceTris(f, first, op.triangles));
        assert.equal(L, 0, `${e} ${JSON.stringify(s)}: a ${op.style} fill of ${op.triangles} triangles has ${L.toFixed(1)} px of cracks`);
      }
      first += op.triangles;
    }
    assert.equal(first, f.triangles, 'the ops account for every triangle');
  }
});

test('bad expressions are refused', () => {
  assert.throws(() => whiteBall3DFace('smirk' as WBExpression, OPEN), /Unknown White Ball expression/);
});
