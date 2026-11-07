/** The reusable genuinely 3D WB-NPC-001. It keeps P3's identity and action contract (src/npc/white-ball): the seven expressions, the seven
 * actions, the measured radii and the WBPose timing. P3's Pen / Pool / Actor path stays in place for P3 and P5, untouched.
 * Free of browser globals: all of this runs in Node, including building the rig. Only compiling the shaders needs a browser. */
export { WB3D_FACE_LIFT, WB3D_M, WB3D_SKIN, faceKey, faceSurfacePoint, whiteBall3DFace } from './WhiteBall3DFace';
export type { FaceInput, FaceMesh } from './WhiteBall3DFace';
export { WB3D_BODY, WB3D_HAND, WB3D_HAND_GAP, WB3D_LIFT_SCALE, WB3D_LOOK_YAW, qMul, qRotate, whiteBall3DAction, whiteBall3DForward, whiteBall3DState } from './WhiteBall3DPose';
export type { Quat, Vec3, WhiteBall3DInput, WhiteBall3DState } from './WhiteBall3DPose';
export { WB3D_PEAK, WB3D_ROUGHNESS, WB3D_SEGMENTS, WB3D_SKIN_COLOR, WhiteBall3DRig, assertGenuine3DCharacter, whiteBall3DPeak } from './WhiteBall3DRig';
export type { WhiteBall3DInventory, WhiteBall3DLighting, WhiteBall3DOptions } from './WhiteBall3DRig';
