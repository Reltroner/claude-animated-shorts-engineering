/** NPC-specific replacement for templates/bridge/cardshade.ts cardShade(), applied per material so the human cast keeps
 * its shader. Why it exists (measured in tests/visual/shading_probe.py, report under .local/p3-white-ball/reports):
 * cardShade() lights the card by fixed UV zones for a human, a head above v .58 and a torso below it, with a side
 * gradient saturating +-.15 of the card width around the centre. WB-NPC-001 fills that whole band with one sphere, so
 * cardShade() lays a vertical dark band across the ball and fights the painted lower-right crescent.
 *
 * This keeps the same lighting contract (the scene tint, and cast shadows dimming to a bright floor through LFB) and
 * drops only the human zones. By default it is neutral, so the painted colours reach the screen unchanged.
 */
import * as THREE from 'three';
import { CARD_K } from '../../../templates/bridge/cardshade';
import { CHAR, LFB } from '../../../templates/bridge/shade';

const DECL = '#include <common>\nuniform vec3 uCharTint; uniform float uCharShade; uniform float uTintK; uniform float uNorm;';

const NPC_LIGHT = /* glsl */ `
vec3 tintK = mix( vec3( 1.0 ), uCharTint, uTintK );
tintK /= pow( max( dot( tintK, vec3( 0.2126, 0.7152, 0.0722 ) ), 0.2 ), uNorm );
vec3 outgoingLight = diffuseColor.rgb * tintK;
#if NUM_DIR_LIGHTS > 0
outgoingLight *= mix( uCharShade, 1.0, sunVis );
#endif
`;

const NEUTRAL = {
  uCharTint: { value: new THREE.Vector3(1, 1, 1) }, uCharShade: { value: 1 }, uTintK: { value: 0 }, uNorm: { value: 0 },
};

export type WhiteBallShadeOptions = {
  /** follow the world's light (world.ts keeps CHAR in sync from LIGHTS). Off: colours reach the screen unchanged. */
  sceneTint?: boolean;
};

export function whiteBallCardShade(m: THREE.MeshLambertMaterial, options: WhiteBallShadeOptions = {}): THREE.MeshLambertMaterial {
  const uniforms = options.sceneTint
    ? { uCharTint: CHAR.uCharTint, uCharShade: CHAR.uCharShade, uTintK: CARD_K.uTintK, uNorm: CARD_K.uNorm }
    : NEUTRAL;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', DECL)
      .replace('#include <lights_fragment_begin>', 'float sunVis = 1.0;\n' + LFB)
      .replace('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;', NPC_LIGHT);
  };
  m.customProgramCacheKey = () => (options.sceneTint ? 'wb-npc-card-scene1' : 'wb-npc-card-neutral1');
  m.needsUpdate = true;
  return m;
}
