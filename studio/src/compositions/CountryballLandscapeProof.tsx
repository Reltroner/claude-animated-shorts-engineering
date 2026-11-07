import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  P7B_PROOF_CAST, type NationalProfileId,
} from '../../../src/production/nations';
import { CountryballLandscapeScene } from '../production/CountryballLandscapeScene';

/**
 * Silent, noncanon environment-and-character proof.
 * 1920×1080 at 30fps for 120 frames. No claim about S1E1 shot timing.
 * The owner must review the procedural national symbols and provisional colors.
 */
export type CountryballLandscapeProofProps = {
  castIds?: readonly NationalProfileId[];
};

export const CountryballLandscapeProof: React.FC<CountryballLandscapeProofProps> = ({
  castIds = P7B_PROOF_CAST,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: '#13192b' }}>
      <CountryballLandscapeScene frame={frame} width={width} height={height} castIds={castIds} />
    </AbsoluteFill>
  );
};

export default CountryballLandscapeProof;
