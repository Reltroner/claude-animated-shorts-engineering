/** WB-NPC-001 as a solid object in a three.js scene: one lit body, a face on its surface, two detached lit hands.
 *
 *   root
 *   |- squash          at the contact point, scales along world axes, so a landing flattens the ball whichever way it faces
 *   |  `- pivot        at the body centre, carries the orientation
 *   |     |- body      SphereGeometry scaled to the measured ellipsoid, MeshStandardMaterial, casts and receives shadows
 *   |     |- ink       the same sphere a little larger, drawn inside out: the outline is the real silhouette from any angle
 *   |     `- face      triangles on the body's surface (WhiteBall3DFace), no texture
 *   |- hand-left       a lit sphere with its own inside-out ink shell
 *   `- hand-right
 *
 * No texture, no card, no billboard: nothing here reads the camera. update() takes one WhiteBall3DState and nothing else, so what
 * the character does is a pure function of that state. Safe to construct in Node; the shaders only compile in a browser.
 */
import * as THREE from 'three';
import { WB_COLOR } from '../white-ball/WhiteBallRig';
import { faceKey, whiteBall3DFace } from './WhiteBall3DFace';
import { WB3D_BODY, WB3D_HAND, type WhiteBall3DState } from './WhiteBall3DPose';

export const WB3D_SEGMENTS = { width: 96, height: 64 } as const;
const HAND_SEGMENTS = { width: 40, height: 28 } as const;

/** Slightly under pure white: lit surfaces need headroom before the tone map, and a white-hot body would stop reading as a form. */
export const WB3D_SKIN_COLOR = '#f7f6f4';
export const WB3D_ROUGHNESS = 0.8;

export type WhiteBall3DLighting = {
  /** GLSL run per fragment right after three's light loop, with wb3WorldPos, wb3WorldNormal, material and reflectedLight in scope */
  fragment?: string;
  /** declarations the fragment needs */
  declarations?: string;
  uniforms?: Record<string, THREE.IUniform>;
  /** part of the shader cache key; change it when the GLSL changes */
  cacheKey?: string;
};

export type WhiteBall3DOptions = { lighting?: WhiteBall3DLighting; layer?: number };

/** Solid things near each other block each other's light. Each sphere occludes by its solid angle above the surface, closed form. A
 *  fragment skips the sphere it is part of. Near the floor, the underside loses its bounce: the contact is dark. */
const OCCLUSION_FRAG = /* glsl */ `
{
  float wb3Occ = 1.0;
  for ( int i = 0; i < 3; i ++ ) {
    vec3 d = uWb3S[ i ].xyz - wb3WorldPos;
    float l = length( d ), r = uWb3S[ i ].w;
    if ( l < r * 1.04 ) continue;
    wb3Occ *= 1.0 - clamp( max( dot( wb3WorldNormal, d / l ), 0.0 ) * r * r / ( l * l ), 0.0, 1.0 ) * 0.6;
  }
  float wb3Under = clamp( 0.5 - 0.5 * wb3WorldNormal.y, 0.0, 1.0 );
  float wb3Near = smoothstep( 0.0, 0.62, wb3WorldPos.y - uWb3Floor );
  reflectedLight.indirectDiffuse *= wb3Occ * mix( 1.0, 0.56 + 0.44 * wb3Near, wb3Under );
  reflectedLight.directDiffuse *= mix( 1.0, wb3Occ, 0.4 );
}
`;

/** The brightest the character may be: scene-linear radiance, largest channel. It reads the same on screen, but a bright body is not free. Bloom works on
 *  radiance, so anything above a scene's threshold glows across the black outline beside it, and multisampling resolves before tone mapping, so an edge
 *  pixel only part covered by a very bright body still shows nearly white and the line looks stepped. Painted cards sit at or under 1, and so does this. */
export const WB3D_PEAK = { knee: 0.86, ceiling: 1 } as const;

/** radiance below the knee is untouched; above it rolls off smoothly and never passes the ceiling */
export const whiteBall3DPeak = (radiance: number): number => {
  const { knee, ceiling } = WB3D_PEAK, room = ceiling - knee;
  return radiance <= knee ? radiance : knee + room * (1 - Math.exp(-(radiance - knee) / room));
};

const glslFloat = (v: number) => (Number.isInteger(v) ? `${v}.0` : String(v));
const PEAK_ROOM = glslFloat(Math.round((WB3D_PEAK.ceiling - WB3D_PEAK.knee) * 1e6) / 1e6);
const PEAK_KNEE = glslFloat(WB3D_PEAK.knee);
const PEAK_FRAG = /* glsl */ `
{
  float wb3Peak = max( max( outgoingLight.r, outgoingLight.g ), outgoingLight.b );
  if ( wb3Peak > ${PEAK_KNEE} ) outgoingLight *= ( ${PEAK_KNEE} + ${PEAK_ROOM} * ( 1.0 - exp( - ( wb3Peak - ${PEAK_KNEE} ) / ${PEAK_ROOM} ) ) ) / wb3Peak;
}
`;

type Occlusion = { uWb3S: { value: THREE.Vector4[] }; uWb3Floor: { value: number } };

const withLighting = <T extends THREE.MeshStandardMaterial>(m: T, occlusion: Occlusion, lighting: WhiteBall3DLighting | undefined): T => {
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, occlusion, lighting?.uniforms ?? {});
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWb3WP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWb3WP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWb3WP;\nuniform vec4 uWb3S[ 3 ];\nuniform float uWb3Floor;\n${lighting?.declarations ?? ''}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  vec3 wb3WorldPos = vWb3WP;
  vec3 wb3WorldNormal = inverseTransformDirection( geometryNormal, viewMatrix );
  ${lighting?.fragment ?? ''}
  ${OCCLUSION_FRAG}
}`)
      .replace('#include <opaque_fragment>', `${PEAK_FRAG}\n#include <opaque_fragment>`);
    // the face is drawn two-sided, and its normals are the ellipsoid's whichever way a sliver of it happens to fold
    if (m.side === THREE.DoubleSide) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize( vNormal );');
  };
  m.customProgramCacheKey = () => `wb3d2_${lighting?.cacheKey ?? 'plain'}_${m.vertexColors ? 'v' : 'u'}`;
  return m;
};

/** every mesh of the rig, by role */
export type WhiteBall3DInventory = {
  bodies: number; bodySegments: readonly [number, number]; bodyGeometry: string; bodyMaterial: string;
  inkShells: number; hands: number; handGeometry: string; handMaterial: string;
  faceTriangles: number; faceVertices: number; faceMaterial: string; faceHasTexture: boolean;
  meshes: number; textures: number; cards: number; castShadow: string[]; receiveShadow: string[];
};

export class WhiteBall3DRig {
  readonly root = new THREE.Group();
  readonly squash = new THREE.Group();
  readonly pivot = new THREE.Group();
  readonly body: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
  readonly ink: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  readonly face: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly hands: readonly [THREE.Group, THREE.Group];
  /** times the body or a hand was drawn into a shadow map; lets a trace prove the shadows are live */
  shadowDraws = 0;
  /** the state last applied */
  state: WhiteBall3DState | null = null;

  private readonly faces = new Map<string, THREE.BufferGeometry>();
  /** where this character's three spheres are, and the floor under it: read by its own materials */
  private readonly occlusion: Occlusion = { uWb3S: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] }, uWb3Floor: { value: 0 } };

  constructor(options: WhiteBall3DOptions = {}) {
    const sphere = new THREE.SphereGeometry(1, WB3D_SEGMENTS.width, WB3D_SEGMENTS.height);
    const handSphere = new THREE.SphereGeometry(1, HAND_SEGMENTS.width, HAND_SEGMENTS.height);
    // Solid, but sorted with the transparent objects: a scene's additive light sheets and glows draw in that queue, and would otherwise
    // add over an opaque body and turn its ink brown. Alpha stays 1 and depth is written as usual.
    const LATE = { transparent: true, opacity: 1 } as const;
    const inkMat = new THREE.MeshBasicMaterial({ color: WB_COLOR.ink, side: THREE.BackSide, fog: false, toneMapped: false, ...LATE });
    inkMat.name = 'wb3d-ink';
    const skin = () => withLighting(new THREE.MeshStandardMaterial({ color: WB3D_SKIN_COLOR, roughness: WB3D_ROUGHNESS, metalness: 0, ...LATE }), this.occlusion, options.lighting);

    this.body = new THREE.Mesh(sphere, skin());
    this.body.name = 'wb3d-body';
    this.body.scale.set(WB3D_BODY.a, WB3D_BODY.b, WB3D_BODY.c);
    this.body.castShadow = true; this.body.receiveShadow = true;
    this.body.renderOrder = 10;

    this.ink = new THREE.Mesh(sphere, inkMat);
    this.ink.name = 'wb3d-body-ink';
    this.ink.scale.set(WB3D_BODY.outerA, WB3D_BODY.outerB, WB3D_BODY.outerC);
    this.ink.renderOrder = 10;

    // Painted on: drawn after the body, tested against depth, never writing it. Triangles paint over one another in order, as they did
    // on the canvas, and no layer of the face can fight another for depth. Two-sided, because the mesh keeps thin triangles to stay watertight
    // (see WhiteBall3DFace) and one of those can face either way at a grazing angle: culled, it would open the crack it is there to close.
    // Single pass, because three would otherwise draw the back faces first and break the painting order.
    const faceMat = withLighting(new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, depthWrite: false, roughness: WB3D_ROUGHNESS, metalness: 0,
      side: THREE.DoubleSide, forceSinglePass: true,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }), this.occlusion, options.lighting);
    faceMat.name = 'wb3d-face';
    this.face = new THREE.Mesh(new THREE.BufferGeometry(), faceMat);
    this.face.name = 'wb3d-face';
    this.face.receiveShadow = true;
    this.face.frustumCulled = false;
    this.face.renderOrder = 11; // after the body it lies on

    this.pivot.add(this.ink, this.body, this.face);
    this.squash.add(this.pivot);
    this.root.add(this.squash);

    const handMat = skin();
    const makeHand = (name: string) => {
      const g = new THREE.Group();
      g.name = name;
      const m = new THREE.Mesh(handSphere, handMat);
      m.name = `${name}-sphere`;
      m.scale.setScalar(WB3D_HAND.r);
      m.castShadow = true; m.receiveShadow = true;
      m.renderOrder = 10;
      const shell = new THREE.Mesh(handSphere, inkMat);
      shell.name = `${name}-ink`;
      shell.scale.setScalar(WB3D_HAND.outerR);
      shell.renderOrder = 10;
      g.add(shell, m);
      this.root.add(g);
      return g;
    };
    this.hands = [makeHand('wb3d-hand-left'), makeHand('wb3d-hand-right')];

    const count = () => { this.shadowDraws++; };
    this.body.onBeforeShadow = count;
    this.hands[0].children[1].onBeforeShadow = count;
    this.hands[1].children[1].onBeforeShadow = count;

    if (options.layer !== undefined) { const layer = options.layer; this.root.traverse((o) => o.layers.set(layer)); }
  }

  private faceGeometry(s: WhiteBall3DState): THREE.BufferGeometry {
    const key = faceKey(s.expression, s.face);
    let g = this.faces.get(key);
    if (!g) {
      const f = whiteBall3DFace(s.expression, s.face);
      g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(f.positions, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(f.normals, 3));
      g.setAttribute('color', new THREE.BufferAttribute(f.colors, 4));
      this.faces.set(key, g);
    }
    return g;
  }

  /** Pose the character. Depends only on the state, never on a camera or on what was posed before. */
  update(s: WhiteBall3DState): void {
    this.state = s;
    this.squash.position.set(...s.contact);
    this.squash.scale.set(...s.squash);
    this.pivot.position.set(0, WB3D_BODY.outerB, 0);
    this.pivot.quaternion.set(...s.quaternion);
    this.face.geometry = this.faceGeometry(s);
    this.hands[0].position.set(...s.handLeft);
    this.hands[1].position.set(...s.handRight);
    s.occluders.forEach((o, i) => this.occlusion.uWb3S.value[i].set(o[0], o[1], o[2], o[3]));
    this.occlusion.uWb3Floor.value = s.floorY;
  }

  /** What the rig is made of. Tests and traces read this: if a card or a texture ever replaces a mesh, it shows here. */
  inventory(): WhiteBall3DInventory {
    let meshes = 0, textures = 0, cards = 0, bodies = 0, hands = 0, inkShells = 0;
    const cast: string[] = [], receive: string[] = [];
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((o as THREE.Sprite).isSprite) cards++;
      if (!m.isMesh) return;
      meshes++;
      const mat = m.material as THREE.Material;
      if (m.geometry.type === 'SphereGeometry' && mat.type === 'MeshStandardMaterial') { if (m === this.body) bodies++; else hands++; }
      if (m.geometry.type === 'SphereGeometry' && mat.type === 'MeshBasicMaterial' && mat.side === THREE.BackSide) inkShells++;
      if (m.geometry.type === 'PlaneGeometry') cards++;
      if ((m.material as THREE.MeshStandardMaterial).map) textures++;
      if (m.castShadow) cast.push(m.name);
      if (m.receiveShadow) receive.push(m.name);
    });
    const params = this.body.geometry.parameters;
    const hand = this.hands[0].children[1] as THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>;
    const facePos = this.face.geometry.getAttribute('position');
    return {
      bodies, bodySegments: [params.widthSegments, params.heightSegments], bodyGeometry: this.body.geometry.type, bodyMaterial: this.body.material.type,
      inkShells, hands, handGeometry: hand.geometry.type, handMaterial: hand.material.type,
      faceTriangles: facePos ? facePos.count / 3 : 0, faceVertices: facePos ? facePos.count : 0, faceMaterial: this.face.material.type, faceHasTexture: !!this.face.material.map,
      meshes, textures, cards, castShadow: cast, receiveShadow: receive,
    };
  }
}

/** Throws unless this object tree is the genuine rig shape: spheres for the body and hands, no flat card, no texture, no sprite. It is the
 *  check that fails if a canvas Actor ever silently stands in for the mesh. */
export function assertGenuine3DCharacter(root: THREE.Object3D): void {
  let spheres = 0;
  const fail = (why: string) => { throw new Error(`not a genuine 3D character: ${why}`); };
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((o as THREE.Sprite).isSprite) fail(`sprite ${o.name}`);
    if (!m.isMesh) return;
    const type = m.geometry.type;
    if (type === 'PlaneGeometry' || type === 'ShapeGeometry') fail(`flat ${type} ${o.name}`);
    const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[];
    for (const mat of mats) {
      if (mat.map) fail(`texture on ${o.name}`);
      if (mat.type !== 'MeshStandardMaterial' && !(mat.type === 'MeshBasicMaterial' && mat.side === THREE.BackSide)) fail(`${mat.type} on ${o.name}`);
    }
    if (type === 'SphereGeometry' && (m.material as THREE.Material).type === 'MeshStandardMaterial') spheres++;
  });
  if (spheres !== 3) fail(`${spheres} lit spheres, expected one body and two hands`);
}
