/**
 * P7B production proof (not canon footage): four approved-reference national
 * *identities in development*, on the unchanged P6 genuine 3D animation rig.
 * Scene is deterministic for any integer Remotion frame. There are no images,
 * cards, third-party models, clocks, externally loaded assets, or dialog.
 */
import React, { useMemo } from 'react';
import { ThreeCanvas } from '@remotion/three';
import { useThree } from '@react-three/fiber';
import {
  whiteBall3DState,
} from '../../../src/npc/white-ball-3d';
import {
  whiteBallPose, type WBAction, type WBExpression,
} from '../../../src/npc/white-ball';
import {
  NationalCharacter3D, resolveNationalCast, p7bCameraAt, p7bCastPositions, P7B_PROOF_FPS,
  type NationalProfile, type NationalProfileId,
} from '../../../src/production/nations';

const ACTIONS: readonly WBAction[] = ['idle', 'wave', 'look-right', 'react'];
const EXPRESSIONS: readonly WBExpression[] = ['default', 'happy-closed', 'default', 'surprised'];

/** This camera is not attached to a character; its small movement reveals genuine parallax. */
const CameraPose: React.FC<{ frame: number }> = ({ frame }) => {
  const { camera } = useThree();
  const [x, y, z] = p7bCameraAt(frame);
  camera.position.set(x, y, z);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0.65, -0.2);
  camera.updateMatrixWorld();
  return null;
};

const Actor: React.FC<{
  frame: number;
  profile: NationalProfile;
  position: number;
  index: number;
}> = ({ frame, profile, position, index }) => {
  const actor = useMemo(() => new NationalCharacter3D(profile), [profile]);
  const action = ACTIONS[index % ACTIONS.length];
  const expression = EXPRESSIONS[index % EXPRESSIONS.length];
  const pose = whiteBallPose(frame, P7B_PROOF_FPS, action);
  const yaw = 0.12 * Math.sin(frame / 32 + index * 0.7);
  const state = whiteBall3DState({
    x: position, z: (index % 2) * -0.18,
    floorY: 0, pose, expression, yaw,
  });
  actor.update(state);
  return <primitive object={actor.root} dispose={null} />;
};

const Stage: React.FC<{ frame: number; cast: readonly NationalProfile[] }> = ({ frame, cast }) => (
  <>
    <color attach="background" args={['#13192b']} />
    <fog attach="fog" args={['#13192b', 13, 35]} />
    <CameraPose frame={frame} />
    <hemisphereLight args={['#f8f5ff', '#44375e', 2.1]} />
    <ambientLight color="#c8c6e5" intensity={0.35} />
    <directionalLight
      position={[-4, 8, 5]} intensity={2.2} color="#fff0de" castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-camera-left={-9} shadow-camera-right={9}
      shadow-camera-top={9} shadow-camera-bottom={-9}
      shadow-camera-near={0.5} shadow-camera-far={24}
      shadow-bias={-0.0002}
    />
    {/* Floor is true physical geometry and receives shadows cast by all four P6 rigs. */}
    <mesh position={[0, -0.10, -1]} receiveShadow>
      <boxGeometry args={[30, 0.20, 24]} />
      <meshStandardMaterial color="#4e4964" roughness={0.88} />
    </mesh>
    <mesh position={[0, -0.04, -2]} receiveShadow>
      <boxGeometry args={[7.5, 0.09, 3.2]} />
      <meshStandardMaterial color="#79718b" roughness={0.82} />
    </mesh>
    {/* Three.js gallery architecture only; not a newly canonized Asthortera location. */}
    {([-4.2, 4.2] as const).map((x) => (
      <React.Fragment key={x}>
        <mesh position={[x, 1.8, -3.7]} castShadow receiveShadow>
          <boxGeometry args={[0.55, 3.6, 0.65]} />
          <meshStandardMaterial color="#77718b" roughness={0.78} />
        </mesh>
        <mesh position={[x, 3.74, -3.7]} receiveShadow>
          <boxGeometry args={[0.85, 0.28, 0.83]} />
          <meshStandardMaterial color="#9d96ae" roughness={0.78} />
        </mesh>
      </React.Fragment>
    ))}
    <mesh position={[0, 3.86, -3.7]} receiveShadow>
      <boxGeometry args={[9.05, 0.35, 0.83]} />
      <meshStandardMaterial color="#81788d" roughness={0.78} />
    </mesh>
    <mesh position={[0, 1.86, -6.2]} receiveShadow>
      <boxGeometry args={[11, 4.3, 0.4]} />
      <meshStandardMaterial color="#2c3150" roughness={0.90} />
    </mesh>
    {cast.map((profile, i) => (
      <Actor key={profile.id} frame={frame} profile={profile} position={p7bCastPositions(cast.length)[i]} index={i} />
    ))}
  </>
);

export const CountryballLandscapeScene: React.FC<{
  frame: number;
  width: number;
  height: number;
  castIds: readonly NationalProfileId[];
}> = ({ frame, width, height, castIds }) => {
  const cast = resolveNationalCast(castIds);
  return (
    <ThreeCanvas
      width={width} height={height} dpr={1} flat shadows
      gl={{ antialias: true, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      camera={{ fov: 35, near: 0.1, far: 75 }}
    >
      <Stage frame={frame} cast={cast} />
    </ThreeCanvas>
  );
};
