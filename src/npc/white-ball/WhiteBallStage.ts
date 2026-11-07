/** The smallest scene host for the existing engine: the Place -> Pool -> Actor (and FxPlace -> Pool -> Fx) lifecycle of
 * templates/bridge/world.ts World.update(), without the bridge world around it.
 *
 * BROWSER ONLY: cast.ts creates a canvas at module scope. Do not export this from index.ts. Import it from a module that
 * Remotion loads lazily (see studio/src/Root.tsx) or behind a `document` shim (see tests/helpers/fake-dom.ts).
 */
import * as THREE from 'three';
import { Actor, Fx, Pool, type FxPlace, type Place } from '../../../templates/bridge/cast';
import { NOINK } from '../../../templates/bridge/ink';
import { Pen } from '../../../templates/bridge/toon';
import { whiteBallCardShade, type WhiteBallShadeOptions } from './WhiteBallCardShade';

export type WhiteBallStageContent = { places: Place[]; fx: FxPlace[] };

export type WhiteBallStageOptions = WhiteBallShadeOptions & {
  /** 'npc' = whiteBallCardShade (default). 'card' = the untouched human cardShade, for comparison. */
  shading?: 'npc' | 'card';
  /** blend the card's own soft alpha at the outline instead of cutting it at 0.5, which leaves a stair-stepped silhouette.
   *  NPC material only: the human cards keep Actor's hard cut-out. */
  smoothEdge?: boolean;
  /** false keeps a scene's fog off the NPC card, so a hazy hall cannot grey the white body. Default: three's default (on). */
  fog?: boolean;
};

export type WhiteBallStageTrace = {
  poolRequests: number; drawCalls: number; penInstances: number;
  actors: number; actorsVisible: number; fxVisible: number;
  actorLayerMask: number; cameraLayerMask: number; noInkLayer: number; mapIsPoolCanvasTexture: boolean; mapWidth: number; mapHeight: number;
};

export class WhiteBallStage {
  readonly root = new THREE.Group();
  readonly pool = new Pool();
  readonly actors: Actor[] = [];
  readonly fxs: Fx[] = [];
  trace: WhiteBallStageTrace | null = null;

  constructor(private readonly options: WhiteBallStageOptions = {}) {}

  private actor(i: number): Actor {
    while (this.actors.length <= i) {
      const a = new Actor(this.root);
      if ((this.options.shading ?? 'npc') === 'npc') {
        whiteBallCardShade(a.mat, this.options);
        if (this.options.smoothEdge) { a.mat.transparent = true; a.mat.alphaTest = 0.02; a.mat.needsUpdate = true; }
        if (this.options.fog === false) { a.mat.fog = false; a.mat.needsUpdate = true; }
      }
      this.actors.push(a);
    }
    return this.actors[i];
  }

  private fx(i: number): Fx {
    while (this.fxs.length <= i) this.fxs.push(new Fx(this.root));
    return this.fxs[i];
  }

  /** Pose everything for one frame: request drawings, flush the pool, bind the textures. A pure function of its input. */
  update(content: WhiteBallStageContent, cam: THREE.Camera): void {
    cam.layers.enable(NOINK); // cards live on the no-ink layer; without this the camera does not see them
    let requests = 0, drawCalls = 0, pens = 0;
    const count = <T extends (p: Pen) => void>(draw: T) => (p: Pen) => { drawCalls++; if (p instanceof Pen) pens++; draw(p); };

    const usedActors: Actor[] = [];
    content.places.forEach((p, i) => {
      const a = this.actor(i), sc = p.scale ?? 1, [w, h, k] = p.size ?? [300, 500, 0.5];
      a.r = this.pool.req(p.key, w, h, k, count(p.draw));
      requests++;
      a.mesh.visible = true;
      a.mesh.position.set(p.x, p.y, p.z);
      a.mesh.rotation.set(0, p.yaw ?? Math.atan2(cam.position.x - p.x, cam.position.z - p.z), p.roll ?? 0);
      a.mesh.scale.set(p.mirror ? -sc : sc, sc, sc);
      usedActors.push(a);
    });
    for (let i = usedActors.length; i < this.actors.length; i++) this.actors[i].mesh.visible = false;

    const usedFx: Fx[] = [];
    content.fx.forEach((p, i) => {
      const e = this.fx(i);
      e.r = this.pool.req(p.key, p.cw, p.ch, 1, count(p.draw));
      requests++;
      e.use(!!p.soft);
      e.mesh.visible = true;
      e.mesh.position.set(p.x, p.y, p.z);
      if (p.flat) e.mesh.rotation.set(-Math.PI / 2, 0, p.rot ?? 0);
      else { e.mesh.quaternion.copy(cam.quaternion); e.mesh.rotateZ(p.rot ?? 0); }
      e.mesh.scale.set(p.w, p.h, 1);
      usedFx.push(e);
    });
    for (let i = usedFx.length; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;

    this.pool.flush();
    for (const a of usedActors) a.bind();
    for (const e of usedFx) e.bind();

    const first = usedActors[0];
    const map = first?.mat.map as THREE.CanvasTexture | null | undefined;
    const image = map?.image as { width?: number; height?: number } | undefined;
    this.trace = {
      poolRequests: requests, drawCalls, penInstances: pens,
      actors: this.actors.length, actorsVisible: usedActors.length, fxVisible: usedFx.length,
      actorLayerMask: first?.mesh.layers.mask ?? 0, cameraLayerMask: cam.layers.mask, noInkLayer: NOINK,
      mapIsPoolCanvasTexture: !!map && (map as THREE.CanvasTexture).isCanvasTexture === true && map === first?.r?.tex,
      mapWidth: image?.width ?? 0, mapHeight: image?.height ?? 0,
    };
  }
}
