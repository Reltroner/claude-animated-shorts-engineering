/** Deterministic reusable P7B landscape proof timing; no browser imports. */
export const P7B_PROOF_FPS = 30;
export const P7B_PROOF_FRAMES = 120;
export const P7B_LANDSCAPE = { width: 1920, height: 1080, fps: P7B_PROOF_FPS } as const;
export const P7B_PREVIEW = { width: 960, height: 540, fps: P7B_PROOF_FPS } as const;

export function p7bCameraAt(frame: number): readonly [number, number, number] {
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= P7B_PROOF_FRAMES) {
    throw new Error('P7B invalid frame: ' + frame);
  }
  const progress = frame / (P7B_PROOF_FRAMES - 1);
  const ease = progress * progress * (3 - 2 * progress);
  return [-0.32 + ease * 0.64, 1.77, 8.30 - 0.36 * ease] as const;
}
