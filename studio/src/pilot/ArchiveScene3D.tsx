// One frame of the 3D pilot: the archive hall (ArchiveHall.ts, as in P5), the genuine 3D WB-NPC-001 (WhiteBall3DRig), and the same post
// chain as P5, in the same order: RenderPass -> InkPass -> lens pre -> lens main -> [bloom + NEUTRAL tone map + grade].
// Everything is posed during render as a pure function of the Remotion frame. The one useFrame below only tells the composer to draw;
// it reads no delta and moves nothing. No clock, no physics, no requestAnimationFrame.
import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { ThreeCanvas } from '@remotion/three';
import { BlendFunction, BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode, type Effect } from 'postprocessing';
import { GradeEffect, type GradeParams } from '../../../templates/bridge/grade';
import { InkPass, NOINK, noInkFallback } from '../../../templates/bridge/ink';
import { LensBlur } from '../../../templates/bridge/lensblur';
import { whiteBallPose, type WBAction, type WBExpression } from '../../../src/npc/white-ball';
import { WhiteBall3DRig, assertGenuine3DCharacter, whiteBall3DState, type WhiteBall3DState } from '../../../src/npc/white-ball-3d';
import { HEIGHT, WIDTH } from '../../../src/pilot/archive/episode';
import { FLOOR_Y, camera3DAt, dof3DAt, npc3DAt, orbitedCamera } from '../../../src/pilot/archive/episode3d';
import { ArchiveHall } from './ArchiveHall';
import { ArchiveWorld3D, archiveLightingForCharacter, type World3DDebug } from './ArchiveWorld3D';

export type PostToggles3D = { ink: boolean; lens: boolean; bloom: boolean; grade: boolean };
/** Everything off by default: these only exist for QA stills and A/B comparisons. */
export type Archive3DDebug = World3DDebug & {
  post?: Partial<PostToggles3D>;
  hideNpc?: boolean;
  trace?: boolean;
  /** see the same frame from further round the ball, degrees */
  orbitDeg?: number;
  /** replace the character's state: any expression and action, at a turn, for the inspection stills */
  force?: { expression?: WBExpression; action?: WBAction; poseFrame?: number; yawDeg?: number; pitchDeg?: number; blink?: number };
  /** override the camera entirely; `tele` looks at the ball through a long lens, nearly orthographic, from straight ahead */
  tele?: boolean;
};

/** The same gentle S-curve as P5, so the world keeps its look. A solid body takes it as it comes; it needs no exception. */
export const GRADE_ARCHIVE_3D: GradeParams = {
  ky: [0.012, 0.105, 0.285, 0.585, 0.84, 0.955, 1],
  sat: [1.04, 1.1, 1.0],
  tintS: [0.012, 0.004], tintM: [0, 0], tintH: [-0.004, 0.003],
  vig: [0.2, 0.46],
};

const makeBloom = () => new BloomEffect({ blendFunction: BlendFunction.ADD, intensity: 0.5, luminanceThreshold: 1.0, luminanceSmoothing: 0.2, mipmapBlur: true, levels: 6, radius: 0.6 });

const Inner: React.FC<{ frame: number; debug: Archive3DDebug; width: number; height: number }> = ({ frame, debug, width, height }) => {
  const { camera, scene, gl } = useThree();
  const cam = camera as THREE.PerspectiveCamera;
  const hall = useMemo(() => new ArchiveHall(), []);
  const world = useMemo(() => new ArchiveWorld3D(hall), [hall]);
  const rig = useMemo(() => {
    const r = new WhiteBall3DRig({ lighting: archiveLightingForCharacter, layer: NOINK });
    assertGenuine3DCharacter(r.root);
    return r;
  }, []);
  const toggles: PostToggles3D = { ink: true, lens: true, bloom: true, grade: true, ...(debug.post ?? {}) };
  const key = JSON.stringify(toggles);

  const post = useMemo(() => {
    const composer = new EffectComposer(gl, { multisampling: 4, frameBufferType: THREE.HalfFloatType });
    composer.setSize(width, height, false);
    composer.addPass(new RenderPass(scene, cam));
    const ink = new InkPass(scene, cam, { widthNear: 4.0, widthFar: 2.8, creaseScale: 0.72, concaveGain: 0.3, distNear: 3, distFar: 40 });
    if (toggles.ink) composer.addPass(ink);
    const lens = new LensBlur({ maxCoC: 24, nearScale: 1.2 });
    if (toggles.lens) { composer.addPass(new EffectPass(cam, lens.pre)); composer.addPass(new EffectPass(cam, lens.main)); }
    const fx: Effect[] = [];
    if (toggles.bloom) fx.push(makeBloom());
    fx.push(new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }));
    if (toggles.grade) fx.push(new GradeEffect(GRADE_ARCHIVE_3D, 1));
    composer.addPass(new EffectPass(cam, ...fx));
    return { composer, lens, ink };
    // the toggles are fixed for a render; `key` keeps the dependency list honest
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, scene, cam, key, width, height]);
  useEffect(() => () => { post.composer.dispose(); post.ink.dispose(); }, [post]);

  // ---- the character
  const staged = npc3DAt(frame);
  let state: WhiteBall3DState = staged;
  const f = debug.force;
  if (f) {
    const action = f.action ?? 'idle';
    const pose = whiteBallPose(f.poseFrame ?? 0, 30, action);
    state = whiteBall3DState({
      expression: f.expression ?? 'default', pose: { ...pose, blink: f.blink ?? 0 },
      x: staged.contact[0], z: staged.contact[2], floorY: FLOOR_Y, yaw: ((f.yawDeg ?? 0) * Math.PI) / 180, pitch: ((f.pitchDeg ?? 0) * Math.PI) / 180,
    });
  }
  const showNpc = (staged.visible || !!f) && !debug.hideNpc;

  // ---- the camera
  let c = camera3DAt(frame);
  if (debug.orbitDeg) c = orbitedCamera(c, state.centre, debug.orbitDeg);
  if (debug.tele) {
    // straight along the face's forward axis at yaw 0, so that frontal stills compare directly with the P3 drawing
    const d = 40;
    c = { pos: [state.centre[0], state.centre[1], state.centre[2] + d], look: state.centre, fov: 2 * (Math.atan(1.25 / d) * 180) / Math.PI };
  }
  cam.position.set(...c.pos); cam.up.set(0, 1, 0); cam.lookAt(...c.look);
  cam.fov = c.fov; cam.near = 0.2; cam.far = 220; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  cam.layers.enable(NOINK);

  // ---- the world
  hall.update(frame, cam, scene);
  rig.root.visible = showNpc;
  rig.update(state);
  world.update(frame, state, debug);
  if (!showNpc) world.clear();
  noInkFallback(world.root);

  const d = dof3DAt(frame);
  post.lens.focus = debug.tele ? 40 : d.focusDistance;
  post.lens.cInf = debug.tele ? 0 : d.cInf;

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
    const lights: string[] = [];
    scene.traverse((o) => { if ((o as THREE.Light).isLight) lights.push(`${o.type}${(o as THREE.DirectionalLight).castShadow ? '+shadow' : ''}`); });
    const ctx = gl.getContext();
    const ext = ctx.getExtension('WEBGL_debug_renderer_info');
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    console.log('P6_TRACE ' + JSON.stringify({
      frame, beat: staged.beat, npc: state.id, expression: state.expression, action: staged.action, showNpc,
      centre: state.centre, quaternion: state.quaternion, handLeft: state.handLeft, handRight: state.handRight,
      rig: rig.inventory(), shadowDraws: rig.shadowDraws, lights, sunShadowAuto: hall.sun.shadow.autoUpdate, sunShadowMap: hall.sun.shadow.mapSize.x,
      meshes, mapCanvases: canvases, mapImages: images, mapOther: other, passes: post.composer.passes.map((p) => p.name),
      info: { calls: gl.info.render.calls, triangles: gl.info.render.triangles, geometries: gl.info.memory.geometries, textures: gl.info.memory.textures, programs: gl.info.programs?.length ?? 0 },
      jsHeapBytes: mem?.usedJSHeapSize ?? null, three: THREE.REVISION, gpu: ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown',
    }));
  });

  return (
    <>
      <primitive object={hall.root} dispose={null} />
      <primitive object={world.root} dispose={null} />
      <primitive object={rig.root} dispose={null} />
    </>
  );
};

export const ArchiveScene3D: React.FC<{ frame: number; debug?: Archive3DDebug; width?: number; height?: number }> = ({ frame, debug = {}, width = WIDTH, height = HEIGHT }) => (
  <ThreeCanvas
    width={width} height={height} flat shadows dpr={1}
    gl={{ antialias: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
    camera={{ fov: 44, near: 0.2, far: 220 }}
  >
    <Inner frame={frame} debug={debug} width={width} height={height} />
  </ThreeCanvas>
);
