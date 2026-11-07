// WhiteBallArchivePilot3D: 1080 x 1920, 30 fps, 360 frames, with the genuine 3D WB-NPC-001. Silent here: the mux adds the approved P5 mix.wav
// unchanged. The size comes from the composition, so WhiteBallArchivePilot3DPreview is the same scene rendered cheaply at half size.
import React from 'react';
import { AbsoluteFill, getInputProps, useCurrentFrame, useVideoConfig } from 'remotion';
import { lightAt } from '../../../src/pilot/archive/episode';
import { ArchiveScene3D, type Archive3DDebug } from '../pilot/ArchiveScene3D';

export const WhiteBallArchivePilot3D: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const debug = getInputProps() as Archive3DDebug;
  const fade = lightAt(frame).fade;
  return (
    <AbsoluteFill style={{ background: '#0d0b1e' }}>
      <ArchiveScene3D frame={frame} debug={debug} width={width} height={height} />
      {fade > 0 && <AbsoluteFill style={{ background: '#0d0b1e', opacity: fade }} />}
    </AbsoluteFill>
  );
};

export default WhiteBallArchivePilot3D;
