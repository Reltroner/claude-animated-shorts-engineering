/** This is the default reusable Reltroner cartoon NPC identity, not every episode's mandatory actor.
 * Everything exported here is free of browser globals. The three.js parts that need a browser, WhiteBallStage and
 * WhiteBallCardShade, are imported from their own files (see WhiteBallStage.ts for the reason).
 */
export const DEFAULT_NPC_ID = 'WB-NPC-001' as const;
export { WB_ACTIONS, WB_EXPRESSIONS, WB_HOP, WB_HOP_PERIOD, quantizeWhiteBallPose, whiteBallPose, whiteBallShadowScale } from './WhiteBallPose';
export type { WBExpression, WBAction, WBPose } from './WhiteBallPose';
export { drawWhiteBallPen, drawWhiteBallPose } from './WhiteBallPen';
export type { WhiteBallParams } from './WhiteBallPen';
export { WB_RESOLUTION, WB_SU, makeWhiteBallPlace, makeWhiteBallShadow, whiteBallKey } from './WhiteBallBridge';
export type { WhiteBallPlacement, WhiteBallResolution, WhiteBallShadowPlacement } from './WhiteBallBridge';
export { whiteBallSequence, whiteBallSequenceFrames } from './WhiteBallSequence';
export type { WBSegment, WBSequenceOptions, WBSequenceState } from './WhiteBallSequence';
export { WB_BODY, WB_CARD, WB_COLOR, WB_EYE, WB_HAND, WB_HAND_REST, WB_K, WB_SHADE, WB_SHADOW, WB_SWEAT_PERIOD } from './WhiteBallRig';
