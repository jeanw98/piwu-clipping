/**
 * Pure decisions for the Hailuo / Leonardo spend (unit-tested).
 */

/** Hailuo clips are always requested at 6 s; Remotion stretches longer scenes. */
export const HAILUO_CLIP_SEC = 6 as const;

export type VideoSceneDecision =
  /** Not a VIDEO scene: keep the still. */
  | 'image'
  /** Pay MiniMax: the still is good to animate. */
  | 'animate'
  /** Project had refs but the still came out unguided: re-upload refs once. */
  | 'retry-guidance'
  /** Still unguided after the retry: keep it as IMAGE with dynamic camera. */
  | 'degrade';

export function decideVideoScene(input: {
  wantVideo: boolean;
  hadReferences: boolean;
  guided: boolean;
  retriedGuidance: boolean;
}): VideoSceneDecision {
  if (!input.wantVideo) return 'image';
  if (!input.hadReferences || input.guided) return 'animate';
  return input.retriedGuidance ? 'degrade' : 'retry-guidance';
}

/** The hook (first scene) may use a better MiniMax tier. */
export function minimaxTierFor(sceneIndex: number): 'hook' | 'default' {
  return sceneIndex === 0 ? 'hook' : 'default';
}

/** Run `fn` at most once; later callers share the same promise. */
export function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () => (pending ??= fn());
}
