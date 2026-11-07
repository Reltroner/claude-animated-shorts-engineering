// WhiteBallArchivePilot: 1080 x 1920, 30 fps, 360 frames. The video has no sound of its own here: the original soundtrack
// from studio/audio/ is muxed on afterwards, and the mux refuses audio made for any other timeline.
import React from 'react';
import { AbsoluteFill, getInputProps, useCurrentFrame } from 'remotion';
import { lightAt } from '../../../src/pilot/archive/episode';
import { ArchiveScene, type ArchiveDebug } from '../pilot/ArchiveScene';

export const WhiteBallArchivePilot: React.FC = () => {
  const frame = useCurrentFrame();
  const debug = getInputProps() as ArchiveDebug;
  const fade = lightAt(frame).fade;
  return (
    <AbsoluteFill style={{ background: '#0d0b1e' }}>
      <ArchiveScene frame={frame} debug={debug} />
      {fade > 0 && <AbsoluteFill style={{ background: '#0d0b1e', opacity: fade }} />}
    </AbsoluteFill>
  );
};

export default WhiteBallArchivePilot;
