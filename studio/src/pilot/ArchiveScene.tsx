// One frame of the archive pilot: the hall (ArchiveHall.ts), WB-NPC-001 through the real Place -> Pool -> Actor path
// (WhiteBallStage.ts), and the post chain from templates/bridge/Bridge.tsx in the same order:
//   RenderPass -> InkPass -> lens pre -> lens main -> [bloom + NEUTRAL tone map + grade]
// It drives postprocessing's own EffectComposer directly. Bridge.tsx uses the @react-three/postprocessing wrapper for this,
// which would add a dependency for no benefit here.
// Everything is posed during render as a pure function of the frame, like Bridge.tsx. No clock, no R3F delta.
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import { BlendFunction, BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode, type Effect } from 'postprocessing';
import { GradeEffect, type GradeParams } from '../../../templates/bridge/grade';
import { InkPass, noInkFallback } from '../../../templates/bridge/ink';
import { LensBlur } from '../../../templates/bridge/lensblur';
import { WB_CARD, WB_SU, makeWhiteBallPlace, makeWhiteBallShadow, type WhiteBallResolution } from '../../../src/npc/white-ball';
import { WhiteBallStage } from '../../../src/npc/white-ball/WhiteBallStage';
import { HEIGHT, WIDTH, cameraAt, dofAt, npcAt, npcScreenBox } from '../../../src/pilot/archive/episode';
import { ArchiveHall } from './ArchiveHall';

/** A/B switches for the QA comparisons; everything is on by default */
export type PostToggles = { ink: boolean; lens: boolean; bloom: boolean; grade: boolean };
export type ArchiveDebug = { post?: Partial<PostToggles>; hideNpc?: boolean; inkMask?: boolean; trace?: boolean };

/** a gentle S-curve. The bridge's fitted presets brighten a dark interior too far and would grey the ball; see the P5 doc */
export const GRADE_ARCHIVE: GradeParams = {
  ky: [0.012, 0.105, 0.285, 0.585, 0.84, 0.955, 1],
  sat: [1.04, 1.1, 1.0],
  tintS: [0.012, 0.004], tintM: [0, 0], tintH: [-0.004, 0.003],
  vig: [0.2, 0.46],
};

/** same idea as tier() in cast.ts: about one texel per output pixel, on fixed steps, so a Pool key still decides the image */
const TIERS = [0.5, 0.7, 1, 1.3, 1.7] as const;
export const npcResolution = (pxPerMetre: number): WhiteBallResolution => {
  const want = WB_SU * pxPerMetre * 1.05;
  const k = TIERS.find((t) => t >= want) ?? TIERS[TIERS.length - 1];
  return [Math.round(WB_CARD.w * k), Math.round(WB_CARD.h * k), k];
};

const makeBloom = () => {
  // bridge settings: emissive sources only. Nothing lit reaches luminance 1, so the white ball cannot bloom.
  const b = new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });
  return b;
};

const Inner: React.FC<{ frame: number; debug: ArchiveDebug; width: number; height: number }> = ({ frame, debug, width, height }) => {
  const { camera, scene, gl } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const hall = useMemo(() => new ArchiveHall(), []);
  const stage = useMemo(() => new WhiteBallStage({ shading: 'npc', smoothEdge: true, sceneTint: true, fog: false }), []);
  const toggles: PostToggles = { ink: true, lens: true, bloom: true, grade: true, ...(debug.post ?? {}) };
  const key = JSON.stringify(toggles);

  const post = useMemo(() => {
    const composer = new EffectComposer(gl, { multisampling: 4, frameBufferType: THREE.HalfFloatType });
    composer.setSize(width, height, false);
    composer.addPass(new RenderPass(scene, cam));
    const ink = new InkPass(scene, cam, { widthNear: 4.0, widthFar: 2.8, creaseScale: 0.72, concaveGain: 0.3, distNear: 3, distFar: 40 });
    ink.debug = debug.inkMask ? 1 : 0;
    if (toggles.ink) composer.addPass(ink);
    const lens = new LensBlur({ maxCoC: 24, nearScale: 1.2 });
    if (toggles.lens) { composer.addPass(new EffectPass(cam, lens.pre)); composer.addPass(new EffectPass(cam, lens.main)); }
    const fx: Effect[] = [];
    if (toggles.bloom) fx.push(makeBloom());
    fx.push(new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }));
    if (toggles.grade) fx.push(new GradeEffect(GRADE_ARCHIVE, 1));
    composer.addPass(new EffectPass(cam, ...fx));
    return { composer, lens, ink };
    // the toggles are fixed for a render; `key` keeps the dependency list honest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, cam, key, width, height]);
  useEffect(() => () => { post.composer.dispose(); post.ink.dispose(); }, [post]);

  // ---- pose everything for this frame
  const c = cameraAt(frame);
  cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look);
  cam.fov = c.fov; cam.near = 0.2; cam.far = 220; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  hall.update(frame, cam, scene);

  const n = npcAt(frame);
  const box = npcScreenBox(frame);
  const showNpc = n.visible && !debug.hideNpc;
  const place = makeWhiteBallPlace({ frame, fps: 30, expression: n.expression, pose: n.pose, x: n.x, y: 0, z: n.z, showShadow: false, resolution: npcResolution(box.px) });
  stage.update({
    places: showNpc ? [place] : [],
    fx: showNpc ? [makeWhiteBallShadow({ x: n.x, y: 0.008, z: n.z, pose: n.pose, away: awayFromCamera(c.pos, n.x, n.z) })] : [],
  }, cam);
  noInkFallback(stage.root);

  const d = dofAt(frame);
  post.lens.focus = d.focusDistance;
  post.lens.cInf = d.cInf;

  useFrame(() => { post.composer.render(); }, 1);

  useEffect(() => {
    if (!debug.trace) return;
    let images = 0, canvases = 0, other = 0, meshes = 0;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes++;
      for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshBasicMaterial[]) {
        const src = mat?.map?.image as object | undefined;
        if (!src) continue;
        if (typeof HTMLCanvasElement !== 'undefined' && src instanceof HTMLCanvasElement) canvases++;
        else if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) images++;
        else other++;
      }
    });
    const ctx = gl.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    console.log('P5_TRACE ' + JSON.stringify({
      frame, beat: n.beat, npc: n.npc, expression: n.expression, action: n.action, key: showNpc ? place.key : null, stage: stage.trace, meshes, mapCanvases: canvases, mapImages: images, mapOther: other,
      passes: post.composer.passes.map((p) => p.name), three: THREE.REVISION, gpu: ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
    }));
  });

  return (
    <>
      <primitive object={hall.root} dispose={null} />
      <primitive object={stage.root} dispose={null} />
    </>
  );
};

/** the shadow card sits a little behind the ball as seen from the camera */
const awayFromCamera = (pos: readonly number[], x: number, z: number): readonly [number, number] => {
  const dx = x - pos[0], dz = z - pos[2], l = Math.hypot(dx, dz) || 1;
  return [dx / l, dz / l];
};

export const ArchiveScene: React.FC<{ frame: number; debug?: ArchiveDebug }> = ({ frame, debug = {} }) => (
  <ThreeCanvas
    width={WIDTH} height={HEIGHT} flat shadows dpr={1}
    gl={{ antialias: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
    camera={{ fov: 44, near: 0.2, far: 220 }}
  >
    <Inner frame={frame} debug={debug} width={WIDTH} height={HEIGHT} />
  </ThreeCanvas>
);
