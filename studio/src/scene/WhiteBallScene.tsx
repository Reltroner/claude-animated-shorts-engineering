// One WB-NPC-001 in the smallest three.js scene that exercises the real engine: Pen -> Pool -> CanvasTexture -> Actor,
// plus the floor shadow as an Fx multiply card. Everything is a pure function of the Remotion frame: no R3F clock, no
// useFrame. The scene is posed during render, like Bridge.tsx, because ThreeCanvas draws from a passive effect.
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import { LIGHTS } from '../../../templates/bridge/lights';
import { NOINK } from '../../../templates/bridge/ink';
import { CHAR } from '../../../templates/bridge/shade';
import { WB_CARD, WB_SU, makeWhiteBallPlace, makeWhiteBallShadow, type WBExpression, type WBPose, type WhiteBallResolution } from '../../../src/npc/white-ball';
import { WhiteBallStage } from '../../../src/npc/white-ball/WhiteBallStage';
import { pixelsPerMetre, type WBCameraRig } from './rigs';

export type WBSceneDebug = {
  /** negative controls: prove the pixels come from the Actor and that the camera needs the NOINK layer */
  hideActor?: boolean;
  cameraNoInkOff?: boolean;
  /** log WB_TRACE lines with live engine state, read back by studio/scripts/render-p3.mjs */
  trace?: boolean;
};

export type WBSceneProps = {
  width: number;
  height: number;
  rig: WBCameraRig;
  background: string;
  expression: WBExpression;
  pose: WBPose;
  shading?: 'npc' | 'card';
  floorShadow?: boolean;
  debug?: WBSceneDebug;
  label?: string;
};

/** the bridge's day sun, camera-relative as in world.ts shotSun(); the camera looks down -z */
const makeSun = (): THREE.DirectionalLight => {
  const L = LIGHTS.day;
  const az = THREE.MathUtils.degToRad(L.az), el = THREE.MathUtils.degToRad(L.el);
  const sun = new THREE.DirectionalLight(L.sunCol, L.sunI);
  sun.position.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).multiplyScalar(220);
  return sun;
};

/** the card's canvas at about one texel per output pixel, the idea behind tier() in cast.ts: a texture much larger than its
 *  size on screen is read from a smaller mip level, and that visibly thins and softens every line */
const resolutionFor = (rig: WBCameraRig, height: number): WhiteBallResolution => {
  const k = WB_SU * pixelsPerMetre(rig, height) * 1.05;
  return [Math.round(WB_CARD.w * k), Math.round(WB_CARD.h * k), k];
};

const Inner: React.FC<Omit<WBSceneProps, 'width'>> = ({ height, rig, background, expression, pose, shading = 'npc', floorShadow = true, debug, label }) => {
  const { camera, scene, gl } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const stage = useMemo(() => {
    const s = new WhiteBallStage({ shading, smoothEdge: true });
    const sun = makeSun();
    s.root.add(sun, sun.target);
    // the uniforms world.ts keeps in sync for the human cast; only cardShade reads them in this scene
    const L = LIGHTS.day;
    CHAR.uCharTint.value.set(...L.charTint); CHAR.uCharShade.value = L.charShade; CHAR.uGrad.value = L.charGrad;
    CHAR.uBodyGrad.value = L.bodyGrad; CHAR.uSideTint.value.set(...L.sideTint);
    return s;
  }, [shading]);
  const bg = useMemo(() => new THREE.Color(background), [background]);

  cam.position.set(0, rig.y, rig.z); cam.up.set(0, 1, 0); cam.lookAt(0, rig.y, 0);
  cam.fov = rig.fov; cam.near = 0.1; cam.far = 100; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  scene.background = bg;

  const place = makeWhiteBallPlace({ frame: 0, expression, pose, x: 0, y: 0, z: 0, showShadow: false, resolution: resolutionFor(rig, height) });
  stage.update({ places: [place], fx: floorShadow ? [makeWhiteBallShadow({ x: 0, y: 0, z: 0, pose })] : [] }, cam);

  if (debug?.hideActor) for (const a of stage.actors) a.mesh.visible = false;
  if (debug?.cameraNoInkOff) cam.layers.disable(NOINK);

  useEffect(() => {
    if (!debug?.trace || !stage.trace) return;
    const ctx = gl.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    const line = {
      label, key: place.key, ...stage.trace, three: THREE.REVISION, toneMapping: gl.toneMapping, outputColorSpace: gl.outputColorSpace,
      samples: ctx.getParameter(ctx.SAMPLES), gpu: ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
    };
    console.log('WB_TRACE ' + JSON.stringify(line));
  });

  return <primitive object={stage.root} dispose={null} />;
};

export const WhiteBallScene: React.FC<WBSceneProps> = ({ width, ...rest }) => (
  <ThreeCanvas
    width={width}
    height={rest.height}
    flat // no tone mapping: the card's sRGB colours round-trip to the screen unchanged
    dpr={1}
    gl={{ antialias: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
    camera={{ fov: rest.rig.fov, near: 0.1, far: 100, position: [0, rest.rig.y, rest.rig.z] }}
  >
    <Inner {...rest} />
  </ThreeCanvas>
);
