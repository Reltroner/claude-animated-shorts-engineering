// The archive hall as one three.js object tree: an original set built from primitive boxes and procedural canvases, with
// the real bridge scenery tools (templates/bridge/build.ts Batch, boxGeo, quad, lam; paint.ts stoneHD, planksHD, beamHD;
// shade.ts twoTone through lam). Nothing is loaded: there are no image, video or model files. BROWSER ONLY.
//
// Set design keeps clear of the reference motifs listed in the P5 audit: square piers and flat lintels (no arches), a square
// rug (no runner), a floating faceted solid (no button or dome), no lettering anywhere.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Batch, V, boxGeo, lam, quad } from '../../../templates/bridge/build';
import { NOINK, noInkFallback } from '../../../templates/bridge/ink';
import { beamHD, planksHD, rng, stoneHD } from '../../../templates/bridge/paint';
import { CHAR, TONE, untone } from '../../../templates/bridge/shade';
import { FPS, RELEASE_FRAME, lightAt } from '../../../src/pilot/archive/episode';
import { GLYPH_CELLS, bookSpines, brassTexture, glowTexture, glyphTexture, rugTexture, shaftTexture, skyTexture } from './archivePaint';

// ---------------------------------------------------------------- layout, in metres
export const HALL = { halfW: 3.6, shelfFace: 3.05, zFar: -24, zNear: 14, height: 12.6, galleryY: 4.35 } as const;
export const PIERS = [-21, -16, -11, -6, -1, 4, 9] as const;
export const PEDESTAL_AT = [0, -8] as const;
export const ARTIFACT_Y = 1.72;
/** the left ground-floor bay between these piers is an open alcove the ball hops out of */
const ALCOVE = { z0: -5.55, z1: -1.45, backX: -6.6 } as const;
/** window on the far wall */
const WINDOW = { x0: -2.5, x1: 2.5, y0: 1.4, y1: 11.3 } as const;
/** toward the low sun, seen through the window: warm light rakes the floor toward the camera */
export const SUN_DIR = new THREE.Vector3(0.12, 0.4, -0.91).normalize();

/** the archive's light, in the field names of bridge lights.ts LightPreset. Chosen on stills, see the P5 doc. */
export const ARCHIVE_LIGHT = {
  lit: [1.85, 1.22, 0.72] as const, shade: [0.3, 0.3, 0.56] as const, lift: [0.02, 0.02, 0.05] as const,
  lambert: 0.35, sideK: 0.88, term: 0.2, sat: 1.1,
  sunCol: '#ffc48a', sunI: 3, bias: -0.0006, normalBias: 0.03,
  charShade: 0.97,
  fog: '#4d4a86', fogNear: 9, fogFar: 88,
} as const;

// ---------------------------------------------------------------- local light pools on top of the bridge's two-tone shading
// twoTone() replaces the direct diffuse term, so three's point lights would have no effect. This adds a small analytic pool
// term after it: warm around the lanterns, teal around the artifact. It does not touch twoTone or its uniforms.
const POOL_N = 12;
const POOLS = {
  uPoolPos: { value: Array.from({ length: POOL_N }, () => new THREE.Vector3()) },
  uPoolCol: { value: Array.from({ length: POOL_N }, () => new THREE.Vector3()) },
  uPoolRad: { value: new Array<number>(POOL_N).fill(1) },
};
const POOL_FRAG = /* glsl */ `
{
  vec3 archiveN = inverseTransformDirection( geometryNormal, viewMatrix );
  vec3 archivePool = vec3( 0.0 );
  for ( int i = 0; i < ${POOL_N}; i ++ ) {
    vec3 dp = uPoolPos[ i ] - vArchiveWP;
    float d = length( dp );
    float a = clamp( 1.0 - d / uPoolRad[ i ], 0.0, 1.0 );
    archivePool += uPoolCol[ i ] * a * a * ( 0.3 + 0.7 * max( dot( archiveN, dp / max( d, 1e-3 ) ), 0.0 ) );
  }
  reflectedLight.directDiffuse += diffuseColor.rgb * archivePool;
}
`;
const wrapped = new WeakSet<THREE.Material>();
const withPools = <T extends THREE.Material>(m: T): T => {
  if (wrapped.has(m)) return m;
  wrapped.add(m);
  const base = m.onBeforeCompile.bind(m), baseKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    base(sh, r);
    Object.assign(sh.uniforms, POOLS);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vArchiveWP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvArchiveWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vArchiveWP;\nuniform vec3 uPoolPos[ ${POOL_N} ];\nuniform vec3 uPoolCol[ ${POOL_N} ];\nuniform float uPoolRad[ ${POOL_N} ];`)
      .replace('#include <aomap_fragment>', POOL_FRAG + '\n#include <aomap_fragment>');
  };
  m.customProgramCacheKey = () => 'archivePools1_' + baseKey();
  return m;
};
const mat = (key: string, make: () => THREE.MeshLambertMaterialParameters) => withPools(lam('archive' + key, make));

const additive = (o: THREE.MeshBasicMaterialParameters) => new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false, ...o });

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tile = 0, bottom = false) => boxGeo(V(x0, y0, z0), V(x1, y1, z1), tile, bottom);

// ---------------------------------------------------------------- the hall
export class ArchiveHall {
  readonly root = new THREE.Group();
  readonly sun: THREE.DirectionalLight;
  readonly fog = new THREE.Fog('#000000', ARCHIVE_LIGHT.fogNear, ARCHIVE_LIGHT.fogFar);
  private crystal: THREE.Mesh; private crystalMat: THREE.MeshBasicMaterial;
  private rings: THREE.Mesh[] = [];
  private motes: THREE.Mesh[] = [];
  private artifactGlow: THREE.Mesh; private artifactGlowMat: THREE.MeshBasicMaterial;
  private lanternGlow: THREE.Mesh[] = []; private lanternGlowMat: THREE.MeshBasicMaterial; private lanternPaneMat: THREE.MeshBasicMaterial;
  private shaftMat: THREE.MeshBasicMaterial;
  private glyphs: { mesh: THREE.Mesh; base: THREE.Vector3; ph: number }[] = []; private glyphMat: THREE.MeshBasicMaterial;
  private dust: THREE.ShaderMaterial;
  private nodes: THREE.ShaderMaterial; private lines: THREE.ShaderMaterial;
  private bigRings: THREE.Mesh[] = [];
  private lanterns: THREE.Vector3[] = [];

  constructor() {
    this.buildShell();
    this.buildShelves();
    this.buildProps();
    this.buildPedestal();
    ({ crystal: this.crystal, crystalMat: this.crystalMat, glow: this.artifactGlow, glowMat: this.artifactGlowMat } = this.buildArtifact());
    ({ glowMat: this.lanternGlowMat, paneMat: this.lanternPaneMat } = this.buildLanterns());
    this.shaftMat = this.buildShafts();
    this.glyphMat = this.buildGlyphs();
    this.dust = this.buildDust();
    ({ nodes: this.nodes, lines: this.lines } = this.buildConstellation());

    // the low sun comes through the far window; roof, walls and mullions cast real shadow-map shadows
    this.sun = new THREE.DirectionalLight(ARCHIVE_LIGHT.sunCol, ARCHIVE_LIGHT.sunI);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(4096, 4096);
    const target = new THREE.Vector3(0, 4, -6);
    this.sun.target.position.copy(target);
    this.sun.position.copy(target).addScaledVector(SUN_DIR, 70);
    const sc = this.sun.shadow.camera;
    sc.left = -22; sc.right = 22; sc.top = 22; sc.bottom = -22; sc.near = 5; sc.far = 130; sc.updateProjectionMatrix();
    this.sun.shadow.bias = ARCHIVE_LIGHT.bias; this.sun.shadow.normalBias = ARCHIVE_LIGHT.normalBias;
    // nothing that casts a shadow ever moves, so one shadow pass per page is enough, and it cannot depend on frame order
    this.sun.shadow.autoUpdate = false; this.sun.shadow.needsUpdate = true;
    this.root.add(this.sun, this.sun.target);
    noInkFallback(this.root);
  }

  private buildShell() {
    const b = new Batch();
    const floor = mat('Floor', () => ({ map: stoneHD('archiveFloorStone', ['#bdb7ac', '#b2ac9f', '#c8c2b6', '#a8a295', '#bbb4a4'], '#7e7a74') }));
    const wall = mat('Wall', () => ({ map: stoneHD('archiveWallStone', ['#a7a4a8', '#9d9a9f', '#b1aeb1', '#94919a', '#a09da4'], '#72707c') }));
    const pier = mat('Pier', () => ({ map: stoneHD('archivePierStone', ['#c9bda7', '#beb29b', '#d2c7b2', '#b3a78f'], '#8f8673') }));
    const timber = mat('Timber', () => ({ map: beamHD() }));
    const ceil = mat('Ceiling', () => ({ map: beamHD(), color: '#7d6f9c' }));
    const { halfW: W, zFar: F, zNear: N, height: H, galleryY: G } = HALL;

    // floor, walls, ceiling. The left wall stops at the alcove on the ground floor.
    b.add(box(-W - 1, -0.5, F - 1.2, W + 1, 0, N, 4), floor);
    b.add(box(W, 0, F, W + 0.8, H, N, 3), wall);
    b.add(box(-W - 0.8, G, F, -W, H, N, 3), wall);
    b.add(box(-W - 0.8, 0, ALCOVE.z1, -W, G, N, 3), wall);
    b.add(box(-W - 0.8, 0, F, -W, G, ALCOVE.z0, 3), wall);
    b.add(box(-W - 1, H, F - 1.2, W + 1, H + 0.6, N, 3, true), ceil);

    // the far wall with its window opening, and the mullions
    const wz0 = F - 1.0, wz1 = F;
    b.add(box(-W, 0, wz0, WINDOW.x0, H, wz1, 3), wall);
    b.add(box(WINDOW.x1, 0, wz0, W, H, wz1, 3), wall);
    b.add(box(WINDOW.x0, 0, wz0, WINDOW.x1, WINDOW.y0, wz1, 3), wall);
    b.add(box(WINDOW.x0, WINDOW.y1, wz0, WINDOW.x1, H, wz1, 3), wall);
    for (const x of [-1.25, 0, 1.25]) b.add(box(x - 0.07, WINDOW.y0, F - 0.62, x + 0.07, WINDOW.y1, F - 0.44, 0), timber);
    for (let y = WINDOW.y0 + 2; y < WINDOW.y1 - 0.5; y += 2) b.add(box(WINDOW.x0, y - 0.055, F - 0.6, WINDOW.x1, y + 0.055, F - 0.46, 0), timber);
    b.add(box(WINDOW.x0 - 0.12, WINDOW.y0 - 0.14, F - 1.05, WINDOW.x1 + 0.12, WINDOW.y0, F + 0.14, 0), pier);

    // alcove behind the left bay
    b.add(quad(V(ALCOVE.backX, 0, ALCOVE.z1), V(-W, 0, ALCOVE.z1), V(-W, 0, ALCOVE.z0), V(ALCOVE.backX, 0, ALCOVE.z0), 0.75, 1), floor);
    b.add(box(ALCOVE.backX - 0.4, 0, ALCOVE.z0 - 0.4, -W - 0.8, G, ALCOVE.z0, 3), wall);
    b.add(box(ALCOVE.backX - 0.4, 0, ALCOVE.z1, -W - 0.8, G, ALCOVE.z1 + 0.4, 3), wall);
    b.add(box(ALCOVE.backX - 0.4, 0, ALCOVE.z0, ALCOVE.backX, G, ALCOVE.z1, 3), wall);
    b.add(box(ALCOVE.backX - 0.4, G, ALCOVE.z0 - 0.4, -W, G + 0.4, ALCOVE.z1 + 0.4, 3, true), ceil);

    // square piers, each with a plinth and a cap; flat timber beams across the nave; no arches
    for (const z of PIERS) for (const s of [-1, 1]) {
      const x = s * 3.2;
      b.add(box(x - 0.45, 0, z - 0.45, x + 0.45, H, z + 0.45, 2), pier);
      b.add(box(x - 0.56, 0, z - 0.56, x + 0.56, 0.5, z + 0.56, 2), pier);
      b.add(box(x - 0.54, G - 0.2, z - 0.54, x + 0.54, G + 0.32, z + 0.54, 2), pier);
      b.add(box(x - 0.56, 10.65, z - 0.56, x + 0.56, 11.05, z + 0.56, 2), pier);
    }
    for (const z of PIERS) b.add(box(-W, 11.05, z - 0.3, W, H, z + 0.3, 0, true), timber);
    for (const x of [-1.3, 1.3]) b.add(box(x - 0.14, 11.85, F, x + 0.14, H, N, 0, true), timber);
    b.build(this.root, true);

    // the sky outside the window: never inked, not fogged
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(90, 44), new THREE.MeshBasicMaterial({ map: skyTexture(), fog: false, toneMapped: false, color: new THREE.Color(0.84, 0.84, 0.86) }));
    sky.position.set(0, 16, -62);
    sky.layers.set(NOINK);
    this.root.add(sky);
  }

  private buildShelves() {
    const b = new Batch();
    const r = rng(7301);
    const timber = mat('Timber', () => ({ map: beamHD() }));
    const backing = mat('ShelfBack', () => ({ color: '#3a2f4e' }));
    const books = mat('Books', () => ({ map: bookSpines() }));
    const deck = mat('Deck', () => ({ map: planksHD(), color: '#d8bfa6' }));
    const scroll = mat('Scroll', () => ({ color: '#ead9b4' }));
    const brass = mat('Brass', () => ({ map: brassTexture() }));
    const { halfW: W, shelfFace: FACE, zFar: F, zNear: N, galleryY: G } = HALL;
    const ROW = 0.62;

    const inward = (s: number, x: number, y0: number, y1: number, z0: number, z1: number, u0: number, u1: number, v0: number, v1: number) => (s < 0
      ? quad(V(x, y0, z1), V(x, y0, z0), V(x, y1, z0), V(x, y1, z1), u1, v1, u0, v0)
      : quad(V(x, y0, z0), V(x, y0, z1), V(x, y1, z1), V(x, y1, z0), u1, v1, u0, v0));

    const bay = (s: number, z0: number, z1: number, y0: number, y1: number) => {
      const xFace = s * FACE, xBack = s * (W - 0.02), xBooks = s * (FACE + 0.14);
      b.add(inward(s, xBack, y0, y1, z0, z1, 0, 1, 0, 1), backing);
      const rows = Math.floor((y1 - y0) / ROW);
      for (let i = 0; i <= rows; i++) {
        const y = y0 + i * ROW;
        b.add(box(Math.min(xFace, xBack), y, z0, Math.max(xFace, xBack), y + 0.05, z1, 0), timber);
      }
      for (let i = 0; i < rows; i++) {
        const y = y0 + i * ROW + 0.05;
        const u = r(), v = Math.floor(r() * 4) / 4, len = (z1 - z0) / 4;
        if (r() < 0.82) {
          b.add(inward(s, xBooks, y, y + 0.54, z0, z1, u, u + len, v, v + 0.25), books);
        } else {
          // an open stretch of shelf with a few rolled scrolls and a brass weight, so the rows are not uniform
          const count = 3 + Math.floor(r() * 4);
          for (let k = 0; k < count; k++) {
            const zc = z0 + 0.3 + r() * (z1 - z0 - 0.6);
            const cyl = new THREE.CylinderGeometry(0.05, 0.05, 0.42, 8);
            const m = new THREE.Matrix4().makeRotationX(Math.PI / 2 + 0.1 * (r() - 0.5));
            m.setPosition(s * (FACE + 0.26), y + 0.05 + (k % 3) * 0.1, zc);
            b.add(cyl, k % 5 === 4 ? brass : scroll, m);
          }
        }
      }
      // uprights between the piers; the piers themselves close the ends of each bay
      const n = 3;
      for (let i = 1; i < n; i++) {
        const z = z0 + ((z1 - z0) * i) / n;
        b.add(box(Math.min(xFace, xBack), y0, z - 0.035, Math.max(xFace, xBack), y1, z + 0.035, 0), timber);
      }
    };

    for (let i = 0; i + 1 < PIERS.length; i++) {
      const z0 = PIERS[i] + 0.43, z1 = PIERS[i + 1] - 0.43; // into the piers: a hairline gap would ink as a dashed line
      for (const s of [-1, 1]) {
        if (!(s < 0 && PIERS[i] === -6)) bay(s, z0, z1, 0.05, G - 0.12); // the left bay at z -6..-1 is the alcove
        bay(s, z0, z1, G + 0.32, 9.25);
      }
    }

    // gallery decks and rails
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -W : 2.32, x1 = s < 0 ? -2.32 : W;
      b.add(box(x0, G - 0.2, F, x1, G + 0.02, N, 0, true), timber);
      b.add(quad(V(x0, G + 0.02, N), V(x1, G + 0.02, N), V(x1, G + 0.02, F), V(x0, G + 0.02, F), (x1 - x0) / 2, (N - F) / 2), deck);
      const x = s * 2.38;
      b.add(box(x - 0.05, G + 0.98, F, x + 0.05, G + 1.06, N, 0), timber);
      b.add(box(x - 0.03, G + 0.5, F, x + 0.03, G + 0.55, N, 0), timber);
      for (let z = F + 0.8; z < N; z += 1.25) b.add(box(x - 0.045, G + 0.02, z - 0.045, x + 0.045, G + 0.98, z + 0.045, 0), timber);
    }
    b.build(this.root, true);
  }

  private buildProps() {
    const b = new Batch();
    const timber = mat('Timber', () => ({ map: beamHD() }));
    const page = mat('Page', () => ({ color: '#eadfc6' }));
    const cover = mat('Cover', () => ({ color: '#7a3550' }));
    const rug = mat('Rug', () => ({ map: rugTexture() }));
    const [px, pz] = PEDESTAL_AT;
    const R = 2.5;
    const rugTex = rugTexture();
    rugTex.wrapS = rugTex.wrapT = THREE.ClampToEdgeWrapping;
    b.add(quad(V(px - R, 0.006, pz + R), V(px + R, 0.006, pz + R), V(px + R, 0.006, pz - R), V(px - R, 0.006, pz - R)), rug);

    // reading stand: a post, a foot and a slanted top with an open blank book
    const lx = 1.75, lz = -1.3; // on the right of the nave, clear of the ball's path and the camera moves
    b.add(box(lx - 0.07, 0, lz - 0.07, lx + 0.07, 0.98, lz + 0.07, 0), timber);
    b.add(box(lx - 0.3, 0, lz - 0.2, lx + 0.3, 0.07, lz + 0.2, 0), timber);
    const tilt = new THREE.Matrix4().makeRotationX(0.5);
    tilt.setPosition(lx, 1.02, lz);
    b.add(box(-0.32, -0.02, -0.22, 0.32, 0.02, 0.22, 0), timber, tilt);
    b.add(box(-0.26, 0.02, -0.17, 0.26, 0.045, 0.17, 0), cover, tilt);
    b.add(box(-0.25, 0.045, -0.16, 0.25, 0.07, 0.16, 0), page, tilt);

    // a couple of low book stacks against the piers, in plain coloured boxes
    const r = rng(4417);
    const COLS = ['#a8473f', '#2f6f9e', '#d6a441', '#3f8f8a', '#6a4d93'];
    for (const [sx, sz] of [[-2.45, -8.7], [2.5, -5.4], [2.4, 0.7], [-2.5, 1.4]] as const) {
      let y = 0;
      for (let i = 0; i < 4 + Math.floor(r() * 4); i++) {
        const w = 0.26 + r() * 0.12, d = 0.2 + r() * 0.08, h = 0.05 + r() * 0.05;
        const m = new THREE.Matrix4().makeRotationY((r() - 0.5) * 0.6);
        m.setPosition(sx, y, sz);
        b.add(box(-w, 0, -d, w, h, d, 0), mat('Stack' + (i % 5), () => ({ color: COLS[i % 5] })), m);
        y += h;
      }
    }
    b.build(this.root, true);
  }

  private buildPedestal() {
    const b = new Batch(), inlay = new Batch();
    const slate = mat('Slate', () => ({ map: stoneHD('archiveSlateStone', ['#6f7d98', '#677590', '#7785a0', '#5f6d88'], '#464f68') }));
    const brass = mat('Brass', () => ({ map: brassTexture() }));
    const [x, z] = PEDESTAL_AT;
    let y = 0;
    for (const [half, h] of [[0.98, 0.16], [0.74, 0.22], [0.52, 0.3]] as const) {
      b.add(box(x - half, y, z - half, x + half, y + h, z + half, 1.4), slate);
      // thin brass inlay near each tier's top edge
      const t = 0.022, iy = y + h - 0.05;
      inlay.add(box(x - half - t, iy, z + half, x + half + t, iy + 0.024, z + half + t), brass);
      inlay.add(box(x - half - t, iy, z - half - t, x + half + t, iy + 0.024, z - half), brass);
      inlay.add(box(x - half - t, iy, z - half, x - half, iy + 0.024, z + half), brass);
      inlay.add(box(x + half, iy, z - half, x + half + t, iy + 0.024, z + half), brass);
      y += h;
    }
    // a low square brass plate the artifact floats above
    b.add(box(x - 0.2, y, z - 0.2, x + 0.2, y + 0.05, z + 0.2), brass);
    b.build(this.root, true);
    // the strips' top faces are thinner than a pixel at most angles, and the ink pass would turn that into dashes
    const strips = new THREE.Group();
    inlay.build(strips, false);
    strips.traverse((o) => o.layers.set(NOINK));
    this.root.add(strips);
  }

  private buildArtifact() {
    const [px, pz] = PEDESTAL_AT;
    // faceted solid, each face painted from a teal-to-gold family; self-lit, multiplied by the light state each frame
    const geo = new THREE.IcosahedronGeometry(0.3, 0);
    const r = rng(1729);
    const pos = geo.getAttribute('position'), colors = new Float32Array(pos.count * 3);
    const FAMILY = ['#57f0e6', '#7cf7d8', '#3fd2ea', '#a8fbe8', '#ffe29a', '#6ae8ff', '#49c8e0'];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      c.set(FAMILY[Math.floor(r() * FAMILY.length) % FAMILY.length]);
      for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const crystalMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false });
    const crystal = new THREE.Mesh(geo, crystalMat);
    crystal.position.set(px, ARTIFACT_Y, pz);
    this.root.add(crystal);

    const brass = mat('Brass', () => ({ map: brassTexture() }));
    for (const [rad, tube] of [[0.6, 0.024], [0.48, 0.02]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, tube, 8, 72), brass);
      ring.position.copy(crystal.position);
      ring.layers.set(NOINK); // a line this thin would otherwise become solid black ink and lose its brass
      this.rings.push(ring);
      this.root.add(ring);
    }
    const moteMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 1.5, 1.6), fog: false, toneMapped: false });
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), moteMat);
      this.motes.push(m);
      this.root.add(m);
    }
    const glowMat = additive({ map: glowTexture(), color: new THREE.Color(0.2, 0.75, 0.8) });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMat);
    glow.position.copy(crystal.position);
    glow.layers.set(NOINK);
    this.root.add(glow);
    return { crystal, crystalMat, glow, glowMat };
  }

  private buildLanterns() {
    const b = new Batch();
    const brass = mat('Brass', () => ({ map: brassTexture() }));
    const paneMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.1, 1.25, 0.5), fog: false, toneMapped: false });
    const glowMat = additive({ map: glowTexture(), color: new THREE.Color(0.55, 0.32, 0.12) });
    const spots: [number, number, number][] = [];
    for (const z of [-16, -11, -6, -1, 4]) for (const s of [-1, 1]) spots.push([s * 2.62, 3.05, z + 0.1]);
    spots.push([-5.4, 2.7, -3.5]); // one inside the alcove, so the ball is not lost in the dark when it peeks out
    const panes: THREE.BufferGeometry[] = [];
    for (const [x, y, z] of spots) {
      const s = Math.sign(x);
      b.add(box(x - 0.14, y - 0.2, z - 0.14, x + 0.14, y - 0.16, z + 0.14), brass);
      b.add(box(x - 0.14, y + 0.16, z - 0.14, x + 0.14, y + 0.2, z + 0.14), brass);
      for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) b.add(box(x + dx * 0.13 - 0.012, y - 0.16, z + dz * 0.13 - 0.012, x + dx * 0.13 + 0.012, y + 0.16, z + dz * 0.13 + 0.012), brass);
      b.add(box(Math.min(x, x + s * 0.18), y - 0.02, z - 0.02, Math.max(x, x + s * 0.18), y + 0.02, z + 0.02), brass);
      panes.push(box(x - 0.11, y - 0.15, z - 0.11, x + 0.11, y + 0.15, z + 0.11));
      const g = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), glowMat);
      g.position.set(x, y, z);
      g.layers.set(NOINK);
      this.lanternGlow.push(g);
      this.root.add(g);
      this.lanterns.push(new THREE.Vector3(x, y, z));
    }
    b.build(this.root, false);
    const pane = new THREE.Mesh(mergeGeometries(panes, false), paneMat);
    this.root.add(pane);
    return { glowMat, paneMat };
  }

  /** sheets of window light hanging in the air. They are planes, not a volume, and they fade out at both ends. */
  private buildShafts() {
    const m = additive({ map: shaftTexture(), color: new THREE.Color(0.2, 0.12, 0.06) });
    const dl = SUN_DIR.clone().negate();
    const geos: THREE.BufferGeometry[] = [];
    for (const y0 of [11.0, 7.5, 4.2]) {
      for (const xc of [-1.87, -0.62, 0.62, 1.87]) {
        const t = y0 / -dl.y, w = 1.08;
        const a = V(xc - w / 2, y0, HALL.zFar - 0.4), b = V(xc + w / 2, y0, HALL.zFar - 0.4);
        const c = b.clone().addScaledVector(dl, t), d = a.clone().addScaledVector(dl, t);
        geos.push(quad(a, b, c, d));
      }
    }
    const mesh = new THREE.Mesh(mergeGeometries(geos, false), m);
    mesh.layers.set(NOINK);
    this.root.add(mesh);
    return m;
  }

  private buildGlyphs() {
    const m = additive({ map: glyphTexture(), color: new THREE.Color(0.32, 0.72, 0.78) });
    const r = rng(9091);
    for (let i = 0; i < GLYPH_CELLS; i++) {
      const g = new THREE.PlaneGeometry(1, 1);
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      const c = (i % 4) / 4, d = 1 - (Math.floor(i / 4) + 1) / 4;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, c + uv.getX(k) / 4, d + uv.getY(k) / 4);
      const mesh = new THREE.Mesh(g, m);
      const s = 0.26 + r() * 0.3;
      const base = new THREE.Vector3((r() * 2 - 1) * 2.2, 2.2 + r() * 2.1 + (i % 3) * 1.8, -14 + r() * 13);
      mesh.scale.setScalar(s);
      mesh.position.copy(base);
      mesh.rotation.z = r() * Math.PI * 2;
      mesh.layers.set(NOINK);
      this.root.add(mesh);
      this.glyphs.push({ mesh, base, ph: r() * Math.PI * 2 });
    }
    return m;
  }

  /** drifting motes in the window light. Position is a pure function of time in the vertex shader. */
  private buildDust() {
    const r = rng(3373), N = 160;
    const pos = new Float32Array(N * 3), ph = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos.set([(r() * 2 - 1) * 2.8, 0.3 + r() * 7.5, -20 + r() * 26], i * 3);
      ph[i] = r() * Math.PI * 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { uT: { value: 0 }, uK: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aPh; uniform float uT; varying float vA;
        void main() {
          vec3 p = position + vec3( 0.12 * sin( uT * 0.5 + aPh ), 0.05 * uT + 0.1 * sin( uT * 0.37 + aPh * 2.0 ), 0.1 * cos( uT * 0.41 + aPh ) );
          vec4 mv = modelViewMatrix * vec4( p, 1.0 );
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp( 26.0 / max( -mv.z, 0.5 ), 1.6, 9.0 );
          vA = 0.5 + 0.5 * sin( aPh * 5.0 );
        }`,
      fragmentShader: /* glsl */ `
        uniform float uK; varying float vA;
        void main() {
          float d = length( gl_PointCoord - 0.5 ) * 2.0;
          gl_FragColor = vec4( vec3( 1.0, 0.82, 0.62 ) * uK * vA * 0.42 * smoothstep( 1.0, 0.1, d ), 1.0 );
        }`,
    });
    const p = new THREE.Points(g, m);
    p.frustumCulled = false;
    p.layers.set(NOINK);
    this.root.add(p);
    return m;
  }

  /** The abstract constellation: three tilted loops of points around a central axis, loose points, thin lines between them and
   *  two very large thin rings. It reads as a map of records, not as any real star chart. */
  private buildConstellation() {
    const r = rng(20261106);
    const C = new THREE.Vector3(-0.1, 6.45, -9.6);
    type Node = { p: THREE.Vector3; t: number };
    const loops: Node[][] = [];
    const nodes: Node[] = [];
    const add = (p: THREE.Vector3, t: number) => { const n = { p, t }; nodes.push(n); return n; };
    const specs = [
      { rad: 2.05, n: 14, tiltX: 0.45, tiltZ: 0.2, y: -1.05 },
      { rad: 1.6, n: 12, tiltX: -0.35, tiltZ: -0.3, y: 0.45 },
      { rad: 1.1, n: 10, tiltX: 0.2, tiltZ: 0.55, y: 1.75 },
    ];
    specs.forEach((s, li) => {
      const e = new THREE.Euler(s.tiltX, 0, s.tiltZ);
      const loop: Node[] = [];
      for (let i = 0; i < s.n; i++) {
        const a = (i / s.n) * Math.PI * 2 + r() * 0.12;
        const p = new THREE.Vector3(Math.cos(a) * s.rad * (0.94 + r() * 0.12), 0, Math.sin(a) * s.rad).applyEuler(e).add(C).add(V(0, s.y, 0));
        loop.push(add(p, 0.12 + 0.22 * li + 0.26 * (i / s.n)));
      }
      loops.push(loop);
    });
    for (let i = 0; i < 18; i++) add(C.clone().add(V((r() * 2 - 1) * 2.45, (r() * 2 - 1) * 2.85, (r() * 2 - 1) * 2.4)), 0.3 + r() * 0.55);

    const segs: { a: THREE.Vector3; b: THREE.Vector3; t: number }[] = [];
    for (const loop of loops) for (let i = 0; i < loop.length; i++) {
      if (i % 5 === 4) continue; // broken loops read as drawn lines rather than perfect circles
      const a = loop[i], b = loop[(i + 1) % loop.length];
      segs.push({ a: a.p, b: b.p, t: Math.max(a.t, b.t) });
    }
    for (let i = 0; i < loops[0].length; i += 3) {
      const a = loops[0][i], b = loops[1][Math.floor((i / loops[0].length) * loops[1].length)];
      segs.push({ a: a.p, b: b.p, t: Math.max(a.t, b.t) + 0.05 });
    }
    for (let i = 0; i < loops[1].length; i += 4) {
      const a = loops[1][i], b = loops[2][Math.floor((i / loops[1].length) * loops[2].length)];
      segs.push({ a: a.p, b: b.p, t: Math.max(a.t, b.t) + 0.05 });
    }
    // a thin beam from the artifact up into the figure appears first
    const start = V(PEDESTAL_AT[0], ARTIFACT_Y + 0.4, PEDESTAL_AT[1]);
    segs.push({ a: start, b: C.clone().add(V(0, -1.2, 0)), t: 0.02 });

    const up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
    const parts: THREE.BufferGeometry[] = [];
    for (const s of segs) {
      const d = s.b.clone().sub(s.a), L = d.length();
      const g = new THREE.CylinderGeometry(0.011, 0.011, L, 5, 1, true);
      q.setFromUnitVectors(up, d.clone().normalize());
      g.applyQuaternion(q);
      g.translate((s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2, (s.a.z + s.b.z) / 2);
      const cnt = g.getAttribute('position').count;
      g.deleteAttribute('uv'); g.deleteAttribute('normal');
      g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array(cnt).fill(s.t), 1));
      parts.push(g.index ? g.toNonIndexed() : g);
    }
    const lineMat = new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uReveal: { value: 0 }, uK: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aT; uniform float uReveal; varying float vK;
        void main() { vK = smoothstep( aT, aT + 0.05, uReveal ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: /* glsl */ `
        uniform float uK; varying float vK;
        void main() { if ( vK <= 0.001 ) discard; gl_FragColor = vec4( vec3( 0.55, 1.15, 1.25 ) * uK * vK, 1.0 ); }`,
    });
    const lines = new THREE.Mesh(mergeGeometries(parts, false), lineMat);
    lines.frustumCulled = false; lines.layers.set(NOINK);
    this.root.add(lines);

    const pos = new Float32Array(nodes.length * 3), aT = new Float32Array(nodes.length), aS = new Float32Array(nodes.length), aW = new Float32Array(nodes.length);
    nodes.forEach((n, i) => { pos.set([n.p.x, n.p.y, n.p.z], i * 3); aT[i] = n.t; aS[i] = 0.55 + r() * 0.75; aW[i] = r() < 0.28 ? 1 : 0; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    g.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
    g.setAttribute('aW', new THREE.BufferAttribute(aW, 1));
    const nodeMat = new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { uReveal: { value: 0 }, uK: { value: 1 }, uPx: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aT; attribute float aS; attribute float aW; uniform float uReveal; uniform float uPx; varying float vK; varying float vW;
        void main() {
          vK = smoothstep( aT, aT + 0.04, uReveal ); vW = aW;
          vec4 mv = modelViewMatrix * vec4( position, 1.0 );
          gl_Position = projectionMatrix * mv;
          gl_PointSize = vK > 0.001 ? clamp( aS * 0.2 * uPx / max( -mv.z, 0.5 ), 2.0, 96.0 ) : 0.0;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uK; varying float vK; varying float vW;
        void main() {
          if ( vK <= 0.001 ) discard;
          float d = length( gl_PointCoord - 0.5 ) * 2.0;
          float a = exp( -d * d * 16.0 ) * 1.5 + exp( -d * d * 3.5 ) * 0.14;
          vec3 c = mix( vec3( 0.55, 1.2, 1.3 ), vec3( 1.4, 1.1, 0.6 ), vW );
          gl_FragColor = vec4( c * a * uK * vK * smoothstep( 1.0, 0.8, d ), 1.0 );
        }`,
    });
    const pts = new THREE.Points(g, nodeMat);
    pts.frustumCulled = false; pts.layers.set(NOINK);
    this.root.add(pts);

    for (const [rad, rx, rz] of [[2.5, 1.15, 0.2], [2.05, 1.95, -0.3]] as const) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(rad, 0.012, 5, 160), additive({ color: new THREE.Color(0, 0, 0) }));
      ring.position.copy(C);
      ring.rotation.set(rx, 0, rz);
      ring.layers.set(NOINK);
      ring.frustumCulled = false;
      this.bigRings.push(ring);
      this.root.add(ring);
    }
    return { nodes: nodeMat, lines: lineMat };
  }

  /** Pose the whole set for one frame. A pure function of the frame number and the camera. */
  update(frame: number, cam: THREE.PerspectiveCamera, scene: THREE.Scene) {
    const L = lightAt(frame), t = frame / FPS, A = ARCHIVE_LIGHT;

    TONE.uLitCol.value.set(A.lit[0] * L.shaft, A.lit[1] * L.shaft, A.lit[2] * L.shaft);
    TONE.uShadeCol.value.set(...A.shade); TONE.uShadeLift.value.set(...A.lift);
    TONE.uLambert.value = A.lambert; TONE.uSideK.value = A.sideK; TONE.uTerm.value = A.term; TONE.uSat.value = A.sat; TONE.uBounce.value.set(0, 0, 0);
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = A.charShade;

    untone(A.fog, this.fog.color);
    scene.fog = this.fog; scene.background = null;

    // light pools: the artifact first, then the lanterns
    const [px, pz] = PEDESTAL_AT;
    POOLS.uPoolPos.value[0].set(px, ARTIFACT_Y, pz);
    POOLS.uPoolCol.value[0].set(0.12, 0.42, 0.46).multiplyScalar(L.pool);
    POOLS.uPoolRad.value[0] = 5.5;
    this.lanterns.forEach((p, i) => {
      POOLS.uPoolPos.value[i + 1].copy(p);
      POOLS.uPoolCol.value[i + 1].set(0.62, 0.36, 0.15).multiplyScalar(L.lantern);
      POOLS.uPoolRad.value[i + 1] = 4.5;
    });

    // artifact: slow, deterministic turning
    const k = L.artifact;
    this.crystal.rotation.set(0.4 + t * 0.31, t * 0.52, 0.2 + t * 0.17);
    this.crystal.position.y = ARTIFACT_Y + 0.035 * Math.sin(t * 1.6);
    this.crystalMat.color.setRGB(k, k, k);
    this.rings[0].rotation.set(1.2 + t * 0.42, 0.3, t * 0.23);
    this.rings[1].rotation.set(0.5, 1.1 + t * 0.55, -t * 0.31);
    for (const ring of this.rings) ring.position.y = this.crystal.position.y;
    this.motes.forEach((m, i) => {
      const a = t * (0.9 + i * 0.13) + (i * Math.PI * 2) / 3, rad = 0.84 + 0.05 * i;
      m.position.set(px + Math.cos(a) * rad, this.crystal.position.y + 0.18 * Math.sin(a * 1.7 + i), pz + Math.sin(a) * rad);
      m.rotation.set(t, t * 1.3, 0);
    });
    this.artifactGlow.quaternion.copy(cam.quaternion);
    this.artifactGlow.position.y = this.crystal.position.y;
    this.artifactGlow.scale.setScalar(1.7 + 0.55 * k);
    this.artifactGlowMat.color.setRGB(0.09 * k, 0.33 * k, 0.37 * k);

    for (const g of this.lanternGlow) g.quaternion.copy(cam.quaternion);
    this.lanternGlowMat.color.setRGB(0.5 * L.lantern, 0.29 * L.lantern, 0.11 * L.lantern);
    this.lanternPaneMat.color.setRGB(2.1 * L.lantern, 1.25 * L.lantern, 0.5 * L.lantern);
    this.shaftMat.color.setRGB(0.2 * L.shaft, 0.125 * L.shaft, 0.06 * L.shaft);

    // glyphs drift, and brighten as the artifact wakes
    const gk = 0.75 + 0.5 * Math.max(0, k - 1.2);
    this.glyphMat.color.setRGB(0.3 * gk, 0.68 * gk, 0.74 * gk);
    for (const g of this.glyphs) {
      g.mesh.position.set(g.base.x + 0.1 * Math.sin(t * 0.5 + g.ph), g.base.y + 0.12 * Math.sin(t * 0.7 + g.ph * 2), g.base.z);
      g.mesh.quaternion.copy(cam.quaternion);
      g.mesh.rotateZ(g.ph + t * 0.08);
    }

    this.dust.uniforms.uT.value = t;
    this.dust.uniforms.uK.value = L.shaft;

    // the constellation
    const flare = 1 + 0.7 * Math.exp(-(((frame - RELEASE_FRAME) / 12) ** 2));
    const ppm = cam.getFilmHeight() > 0 ? 1920 / (2 * Math.tan((cam.fov * Math.PI) / 360)) : 1;
    this.nodes.uniforms.uReveal.value = L.reveal; this.nodes.uniforms.uK.value = 2.6 * flare; this.nodes.uniforms.uPx.value = ppm;
    this.lines.uniforms.uReveal.value = L.reveal; this.lines.uniforms.uK.value = 0.46 * flare;
    this.bigRings.forEach((ring, i) => {
      const a = Math.max(0, Math.min(1, (L.reveal - 0.45 - i * 0.12) / 0.3));
      ring.rotation.y = t * (i ? -0.11 : 0.09);
      (ring.material as THREE.MeshBasicMaterial).color.setRGB(0.2 * a * flare, 0.19 * a * flare, 0.17 * a * flare);
      ring.visible = a > 0;
    });
  }
}
