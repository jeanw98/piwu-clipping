import type { Ctx } from '../lib';

export interface DrawInfo {
  /** Scene duration in seconds. */
  dur: number;
  /** Stable per-scene seed for rng(). */
  seed: number;
}

/** Every component: draw(X, t, props, accent, info). `t` = seconds since scene start. */
export type DrawFn<P = Record<string, unknown>> = (
  X: Ctx,
  t: number,
  props: P,
  accent: string,
  info: DrawInfo,
) => void;

export interface ComponentDef<P = Record<string, unknown>> {
  draw: DrawFn<P>;
  /** Where the generic context pill goes (default 650). */
  pillY?: number;
  /** Background dim for this component (default 0.1). */
  dim?: number;
}
