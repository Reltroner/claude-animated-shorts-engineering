// What ties a solid character to the archive hall, without touching how the hall is built. BROWSER ONLY (it holds an ArchiveHall).
//
// ArchiveHall.ts stays as P5 uses it. This wraps its materials from outside and adds only what a real object in the room needs:
//  - the sun's real shadow map is refreshed every frame, so the body and hands cast real shadows (ArchiveHall freezes it for P5,
//    where nothing that casts ever moves);
//  - every world surface knows where the three solid spheres are: contact occlusion, the shadow from the character's key light and
//    the shadow in the artifact's light come from closed-form sphere geometry, per fragment, at the spheres' true positions;
//  - the same key light and the hall's own pools of light reach the character, so the world and the body answer to the same lights.
import * as THREE from 'three';
import { NOINK } from '../../../templates/bridge/ink';
import type { WhiteBall3DLighting, WhiteBall3DState } from '../../../src/npc/white-ball-3d';
import { keyPoolCentreAt } from '../../../src/pilot/archive/episode3d';
import { lightAt } from '../../../src/pilot/archive/episode';
import { ARCHIVE_LIGHT, ARTIFACT_Y, PEDESTAL_AT, POOLS, POOL_N, SUN_DIR, type ArchiveHall } from './ArchiveHall';

/** A soft high light from the camera's upper left, where the source video's light on the ball sits. Toward the light, world space. */
export const KEY_DIR = new THREE.Vector3(-0.5, 0.74, 0.46).normalize();
/** The numbers were fitted so that, through the unchanged post chain, the body lands on what P5's painted card measured: near white on the lit side and a
 *  lavender crescent. The key is warmish because it adds to a violet ambient: only the sum has to be neutral. */
export const ARCHIVE_3D_LIGHT = {
  keyColor: new THREE.Color().setRGB(0.92, 1.0, 0.66),
  keyIntensity: 1.42,
  /** the key reaches the floor at this share: the ball stands in a soft pool of it */
  keyOnWorld: 0.3,
  keyPoolRadius: 3.8,
  /** the hall's shade colour (ARCHIVE_LIGHT.shade) raised to what a white surface facing that shade shows */
  skyColor: new THREE.Color().setRGB(ARCHIVE_LIGHT.shade[0] + 0.26, ARCHIVE_LIGHT.shade[1] + 0.22, ARCHIVE_LIGHT.shade[2] + 0.1),
  groundColor: new THREE.Color().setRGB(0.47, 0.42, 0.55),
  hemiIntensity: Math.PI * 1.18,
} as const;

const W = {
  uWb3WS: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
  uWb3KeyDir: { value: KEY_DIR.clone() },
  uWb3KeyCol: { value: new THREE.Vector3() },
  uWb3KeyC: { value: new THREE.Vector3() },
  uWb3KeyR: { value: ARCHIVE_3D_LIGHT.keyPoolRadius },
  uWb3Aft: { value: new THREE.Vector3(PEDESTAL_AT[0], ARTIFACT_Y, PEDESTAL_AT[1]) },
  uWb3AftCol: { value: new THREE.Vector3() },
  uWb3AftR: { value: 5.5 },
  uWb3On: { value: 1 },
};

const WORLD_DECL = /* glsl */ `
varying vec3 vWb3WP;
uniform vec4 uWb3WS[ 3 ]; uniform vec3 uWb3KeyDir; uniform vec3 uWb3KeyCol; uniform vec3 uWb3KeyC; uniform float uWb3KeyR;
uniform vec3 uWb3Aft; uniform vec3 uWb3AftCol; uniform float uWb3AftR; uniform float uWb3On;`;

/** After the hall's own two-tone and pool terms. Far from the character none of it can matter, so it stops early. */
const WORLD_FRAG = /* glsl */ `
if ( uWb3On > 0.5 && distance( vWb3WP.xz, uWb3WS[ 0 ].xz ) < 7.0 ) {
  vec3 wN = inverseTransformDirection( geometryNormal, viewMatrix );
  vec3 toAft = uWb3Aft - vWb3WP;
  float aftDist = length( toAft );
  vec3 aftDir = toAft / max( aftDist, 1e-3 );
  float ao = 1.0, keyVis = 1.0, aftVis = 1.0;
  for ( int i = 0; i < 3; i ++ ) {
    vec3 d = uWb3WS[ i ].xyz - vWb3WP;
    float r = uWb3WS[ i ].w, l2 = dot( d, d ), l = sqrt( l2 );
    ao *= 1.0 - clamp( max( dot( wN, d / l ), 0.0 ) * r * r / l2, 0.0, 1.0 ) * 0.92;
    float b = dot( d, uWb3KeyDir );
    if ( b > 0.0 ) {
      float h = sqrt( max( l2 - b * b, 0.0 ) ), w = r * 0.16 + b * 0.2;
      keyVis *= smoothstep( r - w, r + w, h );
    }
    float ba = dot( d, aftDir );
    if ( ba > 0.0 && ba < aftDist ) {
      float h = sqrt( max( l2 - ba * ba, 0.0 ) ), w = r * 0.1 + ba * 0.14;
      aftVis *= smoothstep( r - w, r + w, h );
    }
  }
  float a0 = clamp( 1.0 - aftDist / uWb3AftR, 0.0, 1.0 );
  vec3 aftBlocked = uWb3AftCol * a0 * a0 * ( 0.3 + 0.7 * max( dot( wN, aftDir ), 0.0 ) ) * ( 1.0 - aftVis );
  float fall = 1.0 - smoothstep( 0.0, 1.0, length( ( vWb3WP - uWb3KeyC ).xz ) / uWb3KeyR );
  reflectedLight.directDiffuse = max( reflectedLight.directDiffuse - diffuseColor.rgb * aftBlocked, vec3( 0.0 ) );
  reflectedLight.directDiffuse += diffuseColor.rgb * uWb3KeyCol * max( dot( wN, uWb3KeyDir ), 0.0 ) * fall * keyVis;
  reflectedLight.directDiffuse *= mix( vec3( 0.2, 0.18, 0.36 ), vec3( 1.0 ), ao );
}
`;

/** Add the character's presence to a world material, after whatever the hall already did to it. Idempotent. */
const wrapped = new WeakSet<THREE.Material>();
const withCharacter = (m: THREE.MeshLambertMaterial) => {
  if (wrapped.has(m)) return;
  wrapped.add(m);
  const base = m.onBeforeCompile.bind(m), baseKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    base(sh, r);
    Object.assign(sh.uniforms, W);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWb3WP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWb3WP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${WORLD_DECL}`)
      .replace('#include <aomap_fragment>', `${WORLD_FRAG}\n#include <aomap_fragment>`);
  };
  m.customProgramCacheKey = () => 'archiveWorld3D1_' + baseKey();
  m.needsUpdate = true;
};

/** The character lit by the hall's own local lights: the same uniforms and the same formula the world's surfaces use. */
export const archiveLightingForCharacter: WhiteBall3DLighting = {
  cacheKey: 'archivePools2',
  uniforms: POOLS as unknown as Record<string, THREE.IUniform>,
  declarations: `uniform vec3 uPoolPos[ ${POOL_N} ]; uniform vec3 uPoolCol[ ${POOL_N} ]; uniform float uPoolRad[ ${POOL_N} ];`,
  fragment: /* glsl */ `
  vec3 wb3Pool = vec3( 0.0 );
  for ( int i = 0; i < ${POOL_N}; i ++ ) {
    vec3 dp = uPoolPos[ i ] - wb3WorldPos;
    float d = length( dp );
    float a = clamp( 1.0 - d / uPoolRad[ i ], 0.0, 1.0 );
    // slot 0 is the artifact. It counts double here, and more with the surface's facing: this is the moment the story is about, and a white
    // body can show its colour where a dim stone wall cannot.
    float facing = max( dot( wb3WorldNormal, dp / max( d, 1e-3 ) ), 0.0 );
    wb3Pool += i == 0 ? uPoolCol[ i ] * a * a * ( 0.1 + 1.9 * facing ) : uPoolCol[ i ] * a * a * ( 0.3 + 0.7 * facing );
  }
  reflectedLight.directDiffuse += material.diffuseContribution * wb3Pool;`,
};

export type World3DDebug = {
  /** false freezes the sun's shadow map as P5 does, for measuring what the refresh costs */
  shadowRefresh?: boolean;
  /** false turns the sphere terms on the world off, for A/B stills */
  sphereTerms?: boolean;
  /** true switches a light off everywhere it reaches, world and character alike: negative controls that prove it reaches both */
  keyOff?: boolean;
  hemiOff?: boolean;
};

export class ArchiveWorld3D {
  readonly root = new THREE.Group();
  readonly key: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;

  constructor(private readonly hall: ArchiveHall) {
    hall.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const mat of (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshLambertMaterial[]) if (mat.isMeshLambertMaterial) withCharacter(mat);
    });
    // The artifact's three tiny motes would otherwise carry a world ink outline bigger than themselves in the close shots.
    hall.root.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh && mesh.geometry.type === 'OctahedronGeometry') o.layers.set(NOINK); });
    // never a shadow caster: the sun must stay directional light 0, which the hall's two-tone reads. Two-tone also overwrites three's
    // diffuse result on world surfaces, so these two lights only reach the world through the terms above.
    this.key = new THREE.DirectionalLight(ARCHIVE_3D_LIGHT.keyColor, ARCHIVE_3D_LIGHT.keyIntensity);
    this.key.castShadow = false;
    this.key.position.copy(KEY_DIR).multiplyScalar(30);
    this.hemi = new THREE.HemisphereLight(ARCHIVE_3D_LIGHT.skyColor, ARCHIVE_3D_LIGHT.groundColor, ARCHIVE_3D_LIGHT.hemiIntensity);
    this.root.add(this.key, this.key.target, this.hemi);
  }

  /** Pose the world's side of things for one frame: a pure function of the frame and the character state. */
  update(frame: number, s: WhiteBall3DState, debug: World3DDebug = {}) {
    if (debug.shadowRefresh !== false) this.hall.sun.shadow.needsUpdate = true;
    s.occluders.forEach((o, i) => W.uWb3WS.value[i].set(o[0], o[1], o[2], o[3]));
    const L = lightAt(frame);
    this.key.intensity = debug.keyOff ? 0 : ARCHIVE_3D_LIGHT.keyIntensity;
    this.hemi.intensity = debug.hemiOff ? 0 : ARCHIVE_3D_LIGHT.hemiIntensity;
    const k = debug.keyOff ? 0 : (ARCHIVE_3D_LIGHT.keyOnWorld * ARCHIVE_3D_LIGHT.keyIntensity) / Math.PI;
    W.uWb3KeyCol.value.set(ARCHIVE_3D_LIGHT.keyColor.r * k, ARCHIVE_3D_LIGHT.keyColor.g * k, ARCHIVE_3D_LIGHT.keyColor.b * k);
    W.uWb3KeyC.value.set(...keyPoolCentreAt(frame));
    W.uWb3AftCol.value.set(0.12, 0.42, 0.46).multiplyScalar(L.pool);
    W.uWb3On.value = debug.sphereTerms === false ? 0 : 1;
  }

  /** when the character is hidden its spheres shrink to nothing where they stand, so a world-only still shows the world with no occlusion from it */
  clear() { for (const v of W.uWb3WS.value) { v.y = -1000; v.w = 0.001; } }
}

/** toward the sun, world space: for tests and QA that predict where the real shadow lands */
export const SUN_TOWARD: readonly [number, number, number] = [SUN_DIR.x, SUN_DIR.y, SUN_DIR.z];
