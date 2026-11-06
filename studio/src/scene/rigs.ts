// Camera rigs. The camera is level, so the card keeps its true proportions; only the floor shadow sees perspective.
import { WB_BODY, WB_K, WB_SU } from '../../../src/npc/white-ball';

export type WBCameraRig = { fov: number; y: number; z: number };

const BODY_WIDTH_M = 2 * WB_BODY.rx * WB_K * WB_SU;
const BODY_CENTRE_M = WB_BODY.ry * WB_K * WB_SU;

/** Solve the camera so the resting body gets a given on-screen width and vertical position.
 *  Give the fov (the distance follows) or the distance (the fov follows). */
export function frameRig(o: { height: number; bodyWidthPx: number; bodyCentreYPx: number; fov?: number; z?: number }): WBCameraRig {
  const ppm = o.bodyWidthPx / BODY_WIDTH_M;
  const visible = o.height / ppm;
  const y = BODY_CENTRE_M + (o.bodyCentreYPx - o.height / 2) / ppm;
  if (o.z !== undefined) return { fov: (2 * Math.atan(visible / 2 / o.z) * 180) / Math.PI, y, z: o.z };
  const fov = o.fov ?? 40;
  return { fov, y, z: visible / 2 / Math.tan((fov * Math.PI) / 360) };
}

/** 1080 x 1920: the body takes 60 % of the width, a little below centre to leave headroom for hops */
export const VERTICAL_RIG = frameRig({ height: 1920, bodyWidthPx: 650, bodyCentreYPx: 985, fov: 40 });

/** 1280 x 720: same scale and position as the reference video's rest pose, from far enough that the floor shadow's
 *  aspect matches the source, so a render and a source frame can be overlaid and measured */
export const REFERENCE_RIG = frameRig({ height: 720, bodyWidthPx: 2 * WB_BODY.rx, bodyCentreYPx: 366.3, z: 3.24 });

/** px per metre at the card's depth */
export const pixelsPerMetre = (rig: WBCameraRig, height: number) => height / (2 * rig.z * Math.tan((rig.fov * Math.PI) / 360));
